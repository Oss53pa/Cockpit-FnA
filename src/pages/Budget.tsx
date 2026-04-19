import React, { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowDown, ArrowUp, Download, Plus, Save, Trash2, TrendingDown, TrendingUp, Wallet, Wand2, CheckCircle2, FileWarning, XCircle } from 'lucide-react';
import clsx from 'clsx';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Chart } from '../components/ui/Chart';
import { useApp } from '../store/app';
import { db, ImportLog } from '../db/schema';
import {
  BudgetSummary, computeVariance, distribute,
  listBudgetVersions, loadBudget, saveBudget,
  SEASONALITY_LABELS, SeasonalityKey, VarianceRow,
} from '../engine/budget';
import { importBudgetV2 } from '../engine/importer';
import { SYSCOHADA_COA } from '../syscohada/coa';
import { fmtFull, fmtK, fmtMoney, fmtPct } from '../lib/format';
import { downloadBudgetTemplate } from '../engine/templates';
import { useCurrentOrg, useImportsHistory } from '../hooks/useFinancials';

const MONTHS = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];

type Tab = 'import' | 'budget' | 'ecarts' | 'mensuel';

// Comptes pertinents pour budgétisation (classes 6 et 7)
const budgetable = SYSCOHADA_COA.filter((a) => (a.class === '6' || a.class === '7') && a.code.length <= 3);

export default function Budget() {
  const { currentOrgId, currentYear } = useApp();
  const org = useCurrentOrg();
  const [tab, setTab] = useState<Tab>('import');
  const [budgetYearMode, setBudgetYearMode] = useState<'N' | 'N1'>('N');
  const [viewYear, setViewYear] = useState<number>(currentYear);
  const [version, setVersion] = useState<string>('');
  const [items, setItems] = useState<BudgetSummary[]>([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [variance, setVariance] = useState<VarianceRow[]>([]);

  // Années disponibles : budgets existants + exercices définis + année courante
  const budgetYears = useLiveQuery(async () => {
    if (!currentOrgId) return [] as number[];
    const all = await db.budgets.where('orgId').equals(currentOrgId).toArray();
    return Array.from(new Set(all.map((b) => b.year)));
  }, [currentOrgId], [] as number[]);
  const fiscalYears = useLiveQuery(async () => {
    if (!currentOrgId) return [] as number[];
    const all = await db.fiscalYears.where('orgId').equals(currentOrgId).toArray();
    return all.map((fy) => fy.year);
  }, [currentOrgId], [] as number[]);
  const availableYears = useMemo(() => {
    const set = new Set<number>([...budgetYears, ...fiscalYears, currentYear, viewYear]);
    return Array.from(set).sort((a, b) => b - a);
  }, [budgetYears, fiscalYears, currentYear, viewYear]);

  const versions = useLiveQuery(
    () => listBudgetVersions(currentOrgId, viewYear),
    [currentOrgId, viewYear], [] as string[],
  );

  // Historique des imports Budget pour cette société
  const budgetImports = useImportsHistory(currentOrgId, 'BUDGET');

  useEffect(() => {
    // Toujours sélectionner automatiquement la dernière version dispo (pas d'UI)
    if (versions.length) setVersion(versions[versions.length - 1]);
    else setVersion('');
  }, [versions]);

  useEffect(() => {
    if (!version) { setItems([]); return; }
    loadBudget(currentOrgId, viewYear, version).then((data) => {
      setItems(data);
      setDirty(false);
    });
  }, [currentOrgId, viewYear, version]);

  useEffect(() => {
    if (tab === 'ecarts' && version) {
      computeVariance(currentOrgId, viewYear, version).then(setVariance);
    }
  }, [tab, version, currentOrgId, viewYear]);

  const setValue = (idx: number, m: number, v: number) => {
    const next = [...items];
    const monthly = [...next[idx].monthly];
    monthly[m] = v;
    next[idx] = { ...next[idx], monthly, total: monthly.reduce((s, n) => s + n, 0) };
    setItems(next);
    setDirty(true);
  };

  const addAccount = (code: string) => {
    if (items.find((i) => i.account === code)) return;
    const sysco = SYSCOHADA_COA.find((a) => a.code === code);
    setItems([...items, { account: code, label: sysco?.label ?? 'Compte', monthly: Array(12).fill(0), total: 0 }]);
    setDirty(true);
  };

  const removeAccount = (idx: number) => {
    setItems(items.filter((_, i) => i !== idx));
    setDirty(true);
  };

  const applyDistribution = (idx: number, annual: number, seasonality: SeasonalityKey) => {
    const next = [...items];
    const monthly = distribute(annual, seasonality);
    next[idx] = { ...next[idx], monthly, total: monthly.reduce((s, n) => s + n, 0) };
    setItems(next);
    setDirty(true);
  };

  const save = async () => {
    if (!version) return;
    setBusy(true);
    try {
      await saveBudget(currentOrgId, viewYear, version, items);
      setDirty(false);
    } finally { setBusy(false); }
  };

  const totalBudget = items.reduce((s, i) => s + i.total, 0);
  const totalProd = items.filter((i) => i.account.startsWith('7')).reduce((s, i) => s + i.total, 0);
  const totalCharge = items.filter((i) => i.account.startsWith('6')).reduce((s, i) => s + i.total, 0);

  return (
    <div>
      <PageHeader
        title="Budget"
        subtitle={`Exercice consulté : ${viewYear}${viewYear !== currentYear ? ` · (courant = ${currentYear})` : ''} · Versions · Saisonnalisation · Suivi des écarts`}
        action={
          <div className="flex gap-2 flex-wrap items-center">
            {/* Switcher rapide N / N-1 / N-2 pour alterner entre budgets */}
            <div className="flex items-center gap-0.5 bg-primary-100 dark:bg-primary-900 rounded-lg p-0.5 border border-primary-200 dark:border-primary-800">
              <button
                title={`Exercice courant (${currentYear})`}
                onClick={() => setViewYear(currentYear)}
                className={clsx('px-2 py-1 text-xs font-semibold rounded', viewYear === currentYear ? 'bg-primary-900 text-primary-50 dark:bg-primary-100 dark:text-primary-900' : 'text-primary-600 hover:bg-primary-200 dark:hover:bg-primary-800')}
              >
                N ({currentYear})
              </button>
              <button
                title={`Exercice N-1 (${currentYear - 1})`}
                onClick={() => setViewYear(currentYear - 1)}
                className={clsx('px-2 py-1 text-xs font-semibold rounded', viewYear === currentYear - 1 ? 'bg-primary-900 text-primary-50 dark:bg-primary-100 dark:text-primary-900' : 'text-primary-600 hover:bg-primary-200 dark:hover:bg-primary-800')}
              >
                N-1 ({currentYear - 1})
              </button>
              <button
                title={`Exercice N-2 (${currentYear - 2})`}
                onClick={() => setViewYear(currentYear - 2)}
                className={clsx('px-2 py-1 text-xs font-semibold rounded', viewYear === currentYear - 2 ? 'bg-primary-900 text-primary-50 dark:bg-primary-100 dark:text-primary-900' : 'text-primary-600 hover:bg-primary-200 dark:hover:bg-primary-800')}
              >
                N-2
              </button>
            </div>
            <div className="flex items-center gap-1 bg-primary-100 dark:bg-primary-900 rounded-lg px-2 py-1 border border-primary-200 dark:border-primary-800">
              <span className="text-[11px] uppercase tracking-wider text-primary-500 font-semibold px-1">Autre</span>
              <select
                className="bg-transparent text-sm font-semibold num focus:outline-none"
                value={viewYear}
                onChange={(e) => setViewYear(Number(e.target.value))}
                title="Choisir n'importe quel exercice"
              >
                {availableYears.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <button className="btn-outline" onClick={() => downloadBudgetTemplate(org?.name, viewYear, version || 'V1_initial')}>
              <Download className="w-4 h-4" /> Modèle Excel
            </button>
            <button className="btn-outline" onClick={async () => {
              const all = await db.budgets.where('orgId').equals(currentOrgId).toArray();
              if (all.length === 0) { alert('Aucun budget à supprimer.'); return; }
              if (!confirm(`Vider TOUS les budgets de la société ?\n${all.length} ligne(s) seront supprimées (toutes années + versions confondues).`)) return;
              await db.budgets.where('orgId').equals(currentOrgId).delete();
              await db.imports.where('orgId').equals(currentOrgId).filter((i) => i.kind === 'BUDGET').delete();
              setItems([]); setVersion('');
              alert(`${all.length} ligne(s) supprimées.`);
            }}>
              <Trash2 className="w-4 h-4" /> Vider budget
            </button>
          </div>
        }
      />

      <div className="flex gap-1 border-b border-primary-200 dark:border-primary-800 mb-6 flex-wrap">
        {(['import','budget','ecarts','mensuel'] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={clsx('px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition',
              tab === t ? 'border-primary-900 dark:border-primary-100' : 'border-transparent text-primary-500 hover:text-primary-900')}>
            {{ import: 'Import & Historique', budget: 'Budget', ecarts: 'Écarts Budget vs Réalisé', mensuel: 'Mensuel + N-1' }[t]}
          </button>
        ))}
      </div>

      {tab === 'budget' && (
        <div className="flex gap-1 p-1 bg-primary-200 dark:bg-primary-800 rounded-lg w-fit mb-4">
          <button onClick={() => { setBudgetYearMode('N'); setViewYear(currentYear); }}
            className={clsx('px-4 py-1.5 text-xs rounded-md font-medium', budgetYearMode === 'N' ? 'bg-primary-50 dark:bg-primary-900' : 'text-primary-600')}>
            Budget {currentYear} (N)
          </button>
          <button onClick={() => { setBudgetYearMode('N1'); setViewYear(currentYear - 1); }}
            className={clsx('px-4 py-1.5 text-xs rounded-md font-medium', budgetYearMode === 'N1' ? 'bg-primary-50 dark:bg-primary-900' : 'text-primary-600')}>
            Budget {currentYear - 1} (N-1)
          </button>
        </div>
      )}

      {tab === 'budget' && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <StatBox label="Comptes budgétisés" value={items.length.toString()} />
            <StatBox label="Produits prévus" value={fmtMoney(totalProd)} icon={<TrendingUp className="w-5 h-5 text-primary-500" />} />
            <StatBox label="Charges prévues" value={fmtMoney(totalCharge)} icon={<TrendingDown className="w-5 h-5 text-primary-500" />} />
            <StatBox label="Résultat prévisionnel" value={fmtMoney(totalProd - totalCharge)} highlight={totalProd - totalCharge >= 0 ? 'good' : 'bad'} />
          </div>

          {!version ? (
            <Card>
              <div className="py-12 text-center text-primary-500">
                <Wallet className="w-10 h-10 mx-auto mb-3 text-primary-400" />
                <p className="text-primary-700 dark:text-primary-300 font-medium">Aucun budget pour {viewYear}</p>
                <button className="btn-primary mt-4" onClick={() => setTab('import')}>
                  <Download className="w-4 h-4 rotate-180" /> Importer un budget
                </button>
              </div>
            </Card>
          ) : (
            <Card title={`Budget ${viewYear}`}
              action={
                <div className="flex gap-2">
                  <AddAccountDropdown onAdd={addAccount} existing={items.map((i) => i.account)} />
                  <button className="btn-primary" onClick={save} disabled={busy || !dirty}>
                    <Save className="w-4 h-4" /> {busy ? 'Enregistrement…' : dirty ? 'Enregistrer' : 'Enregistré'}
                  </button>
                </div>
              }
              padded={false}>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="border-b-2 border-primary-300 dark:border-primary-700 sticky top-0 bg-primary-100 dark:bg-primary-900 z-10">
                    <tr>
                      <th className="text-left py-2 px-2 w-14">Cpte</th>
                      <th className="text-left py-2 px-2 min-w-[180px]">Libellé</th>
                      {MONTHS.map((m) => <th key={m} className="text-right py-2 px-1 min-w-[80px]">{m}</th>)}
                      <th className="text-right py-2 px-2 min-w-[110px] font-bold">Annuel</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-primary-200 dark:divide-primary-800">
                    {items.map((it, idx) => (
                      <tr key={it.account}>
                        <td className="py-1 px-2 num font-mono">{it.account}</td>
                        <td className="py-1 px-2 text-[11px]">{it.label}</td>
                        {it.monthly.map((v, m) => (
                          <td key={m} className="py-1 px-1">
                            <input type="number"
                              className="num w-full text-right bg-transparent px-1 py-0.5 rounded hover:bg-primary-50 dark:hover:bg-primary-950 focus:bg-primary-50 dark:focus:bg-primary-950 focus:outline-none focus:ring-1 focus:ring-primary-500"
                              value={v || ''} onChange={(e) => setValue(idx, m, Number(e.target.value) || 0)} />
                          </td>
                        ))}
                        <td className="py-1 px-2 text-right num font-bold">{fmtFull(it.total)}</td>
                        <td className="py-1 px-1">
                          <DistributeMenu onPick={(amt, season) => applyDistribution(idx, amt, season)} onRemove={() => removeAccount(idx)} />
                        </td>
                      </tr>
                    ))}
                    {items.length === 0 && (
                      <tr><td colSpan={16} className="py-8 text-center text-primary-500 text-sm">Aucun compte. Ajoutez-en via le bouton ci-dessus.</td></tr>
                    )}
                  </tbody>
                  {items.length > 0 && (
                    <tfoot className="border-t-2 border-primary-300 dark:border-primary-700 font-bold">
                      <tr>
                        <td colSpan={2} className="py-2 px-2">TOTAL</td>
                        {MONTHS.map((_, m) => (
                          <td key={m} className="py-2 px-1 text-right num">
                            {fmtFull(items.reduce((s, i) => s + i.monthly[m], 0))}
                          </td>
                        ))}
                        <td className="py-2 px-2 text-right num">{fmtFull(totalBudget)}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </Card>
          )}
        </>
      )}

      {tab === 'ecarts' && (
        <Variance version={version} rows={variance} orgId={currentOrgId} year={viewYear} />
      )}

      {tab === 'mensuel' && (
        <BudgetMonthlyTab orgId={currentOrgId} year={viewYear} version={version} />
      )}

      {tab === 'import' && (
        <>
          <div className="mb-4 p-4 bg-primary-100 dark:bg-primary-900 rounded-lg border border-primary-200 dark:border-primary-800">
            <p className="text-xs uppercase tracking-wider text-primary-500 font-semibold mb-2">Année cible de l'import</p>
            <div className="flex gap-2">
              <button onClick={() => setViewYear(currentYear)}
                className={clsx('px-4 py-2 rounded-lg text-sm font-medium transition border-2',
                  viewYear === currentYear ? 'bg-primary-900 dark:bg-primary-100 text-primary-50 dark:text-primary-900 border-primary-900 dark:border-primary-100' : 'border-primary-300 dark:border-primary-700 text-primary-600')}>
                Budget {currentYear} <span className="text-[10px] opacity-70 ml-1">(N)</span>
              </button>
              <button onClick={() => setViewYear(currentYear - 1)}
                className={clsx('px-4 py-2 rounded-lg text-sm font-medium transition border-2',
                  viewYear === currentYear - 1 ? 'bg-primary-900 dark:bg-primary-100 text-primary-50 dark:text-primary-900 border-primary-900 dark:border-primary-100' : 'border-primary-300 dark:border-primary-700 text-primary-600')}>
                Budget {currentYear - 1} <span className="text-[10px] opacity-70 ml-1">(N-1)</span>
              </button>
              <select className="input !w-auto" value={viewYear} onChange={(e) => setViewYear(Number(e.target.value))}>
                {availableYears.map((y) => <option key={y} value={y}>Autre : {y}</option>)}
              </select>
            </div>
            <p className="text-[11px] text-primary-500 mt-2">
              Le fichier sera importé pour l'exercice <strong className="text-primary-900 dark:text-primary-100">{viewYear}</strong>.
              Vous pouvez toujours surcharger cette valeur dans le wizard ci-dessous.
            </p>
          </div>
          <BudgetImportTab
            orgId={currentOrgId}
            defaultYear={viewYear}
            onImported={(report) => {
              setViewYear(report.year);
              setVersion(report.version);
              setTab('budget');
            }}
            history={budgetImports}
            orgName={org?.name}
          />
        </>
      )}

    </div>
  );
}

// ─── ONGLET IMPORT : wizard + table d'historique (versionning) ─────
function BudgetImportTab({
  orgId, defaultYear, onImported, history, orgName,
}: {
  orgId: string;
  defaultYear: number;
  onImported: (report: { year: number; version: string }) => void;
  history: ImportLog[];
  orgName?: string;
}) {
  const defaultVersion = `V1_${defaultYear}`;
  const deleteImport = async (imp: ImportLog) => {
    if (!imp.id) return;
    if (imp.year && imp.version) {
      const msg = `Supprimer cet import ET sa version budgétaire « ${imp.version} » (${imp.year}) avec ses lignes ?`;
      if (!confirm(msg)) return;
      await db.transaction('rw', [db.imports, db.budgets], async () => {
        await db.budgets
          .where('[orgId+year+version]').equals([imp.orgId, imp.year!, imp.version!])
          .delete();
        await db.imports.delete(imp.id!);
      });
    } else {
      if (!confirm("Supprimer cet import de l'historique ?")) return;
      await db.imports.delete(imp.id);
    }
  };

  return (
    <div className="space-y-6">
      <Card title={`Import du budget ${defaultYear}`}
        subtitle="CSV · XLSX — une ligne par compte. Détection automatique des 12 colonnes mensuelles.">
        <div className="flex items-center gap-3 flex-wrap">
          <button className="btn-outline" onClick={() => downloadBudgetTemplate(orgName, defaultYear, defaultVersion)}>
            <Download className="w-4 h-4" /> Télécharger le modèle Excel
          </button>
          <label className="btn-primary cursor-pointer">
            <Download className="w-4 h-4 rotate-180" /> Importer un fichier
            <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const ver = prompt(`Nom de la version pour le budget ${defaultYear} :`, defaultVersion);
              if (!ver) return;
              try {
                const res = await importBudgetV2(f, orgId, defaultYear, ver.trim());
                const errPreview = res.errors.slice(0, 5).join('\n');
                alert(`${res.imported > 0 ? '✅' : '⚠️'} Import budget terminé\n\n` +
                  `Fichier : ${f.name}\nFeuille lue : ${res.sheetName || '(aucune)'}\n` +
                  `Comptes importés : ${res.imported}\nLignes insérées : ${res.lines}\nErreurs : ${res.errors.length}` +
                  (errPreview ? '\n\n' + errPreview : ''));
                onImported({ year: defaultYear, version: ver.trim() });
                if (res.imported > 0) window.location.reload();
              } catch (err: any) {
                alert(`❌ Erreur :\n${err.message}`);
              }
              e.target.value = '';
            }} />
          </label>
          <p className="text-xs text-primary-500">
            Importation pour l'exercice <strong>{defaultYear}</strong>. Détection auto des colonnes mensuelles + montant annuel.
          </p>
        </div>
      </Card>

      <Card title="Historique des imports budgétaires" subtitle="Versionning — cliquer sur une version pour la consulter">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wider text-primary-500 border-b border-primary-200 dark:border-primary-800">
              <tr>
                <th className="text-left py-2 px-3">Date</th>
                <th className="text-left py-2 px-3">Utilisateur</th>
                <th className="text-left py-2 px-3">Fichier</th>
                <th className="text-right py-2 px-3">Exercice</th>
                <th className="text-left py-2 px-3">Version</th>
                <th className="text-right py-2 px-3">Comptes</th>
                <th className="text-right py-2 px-3">Rejetées</th>
                <th className="text-left py-2 px-3">Statut</th>
                <th className="text-center py-2 px-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-primary-200 dark:divide-primary-800">
              {history.length === 0 && (
                <tr><td colSpan={9} className="py-6 text-center text-primary-500 text-xs">Aucun import budgétaire</td></tr>
              )}
              {history.map((i) => (
                <tr key={i.id} className="hover:bg-primary-100/50 dark:hover:bg-primary-900/50 cursor-pointer"
                    onClick={() => i.year && i.version && onImported({ year: i.year, version: i.version })}>
                  <td className="py-2 px-3 num text-xs">{new Date(i.date).toLocaleString('fr-FR')}</td>
                  <td className="py-2 px-3">{i.user}</td>
                  <td className="py-2 px-3 font-mono text-xs">{i.fileName}</td>
                  <td className="py-2 px-3 text-right num font-semibold">{i.year ?? '—'}</td>
                  <td className="py-2 px-3"><Badge variant="info">{i.version ?? '—'}</Badge></td>
                  <td className="py-2 px-3 text-right num">{i.count.toLocaleString('fr-FR')}</td>
                  <td className="py-2 px-3 text-right num">{i.rejected}</td>
                  <td className="py-2 px-3">
                    {i.status === 'success' && <Badge variant="success"><CheckCircle2 className="w-3 h-3" /> Succès</Badge>}
                    {i.status === 'partial' && <Badge variant="warning"><FileWarning className="w-3 h-3" /> Partiel</Badge>}
                    {i.status === 'error' && <Badge variant="error"><XCircle className="w-3 h-3" /> Échec</Badge>}
                  </td>
                  <td className="py-2 px-3 text-center">
                    <button className="btn-ghost !p-1.5 text-primary-500 hover:text-error hover:bg-error/10"
                      onClick={(e) => { e.stopPropagation(); deleteImport(i); }}
                      title="Supprimer cet import et la version associée">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function StatBox({ label, value, icon, highlight }: { label: string; value: string; icon?: React.ReactNode; highlight?: 'good'|'bad' }) {
  return (
    <Card>
      <div className="flex items-center gap-3">
        {icon && <div className="shrink-0">{icon}</div>}
        <div>
          <p className="text-xs text-primary-500">{label}</p>
          <p className={clsx('num text-xl font-bold',
            highlight === 'good' && 'text-success',
            highlight === 'bad' && 'text-error')}>{value}</p>
        </div>
      </div>
    </Card>
  );
}

function AddAccountDropdown({ onAdd, existing }: { onAdd: (code: string) => void; existing: string[] }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const available = budgetable.filter((a) => !existing.includes(a.code) && (a.code.includes(q) || a.label.toLowerCase().includes(q.toLowerCase())));
  return (
    <div className="relative">
      <button className="btn-outline" onClick={() => setOpen(!open)}><Plus className="w-4 h-4" /> Ajouter compte</button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-80 max-h-96 overflow-y-auto bg-primary-50 dark:bg-primary-900 border border-primary-200 dark:border-primary-800 rounded-xl shadow-xl z-20">
          <div className="p-2 sticky top-0 bg-primary-50 dark:bg-primary-900 border-b border-primary-200 dark:border-primary-800">
            <input className="input !py-1.5" placeholder="Rechercher un compte…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          </div>
          <div className="p-1">
            {available.slice(0, 50).map((a) => (
              <button key={a.code} className="w-full text-left px-3 py-2 text-sm hover:bg-primary-100 dark:hover:bg-primary-800 rounded flex justify-between"
                onClick={() => { onAdd(a.code); setOpen(false); setQ(''); }}>
                <span><span className="font-mono text-xs mr-2">{a.code}</span>{a.label}</span>
                <Badge>{a.class === '6' ? 'Charge' : 'Produit'}</Badge>
              </button>
            ))}
            {available.length === 0 && <p className="p-3 text-xs text-primary-500">Aucun résultat</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function DistributeMenu({ onPick, onRemove }: { onPick: (amt: number, s: SeasonalityKey) => void; onRemove: () => void }) {
  const [open, setOpen] = useState(false);
  const [amt, setAmt] = useState(0);
  return (
    <div className="relative">
      <button className="btn-ghost !p-1" title="Répartition" onClick={() => setOpen(!open)}><Wand2 className="w-3.5 h-3.5" /></button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-72 bg-primary-50 dark:bg-primary-900 border border-primary-200 dark:border-primary-800 rounded-xl shadow-xl z-20 p-3">
          <p className="text-xs font-semibold mb-2">Répartir un montant annuel</p>
          <input type="number" className="input !py-1.5 mb-2" placeholder="Montant annuel"
            value={amt || ''} onChange={(e) => setAmt(Number(e.target.value) || 0)} />
          <div className="space-y-1">
            {(Object.keys(SEASONALITY_LABELS) as SeasonalityKey[]).map((k) => (
              <button key={k} disabled={!amt}
                className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-primary-100 dark:hover:bg-primary-800 disabled:opacity-50"
                onClick={() => { onPick(amt, k); setOpen(false); setAmt(0); }}>
                {SEASONALITY_LABELS[k]}
              </button>
            ))}
          </div>
          <button className="w-full text-left text-xs px-2 py-1.5 rounded text-error hover:bg-error/10 mt-2 border-t border-primary-200 dark:border-primary-800 pt-2"
            onClick={() => { onRemove(); setOpen(false); }}>
            🗑 Supprimer ce compte
          </button>
        </div>
      )}
    </div>
  );
}

function Variance({ version, rows, orgId, year }: { version: string; rows: VarianceRow[]; orgId: string; year: number }) {
  const [n1Map, setN1Map] = useState<Map<string, number>>(new Map());
  useEffect(() => {
    import('../engine/budgetActual').then(({ computeBudgetActualMonthly }) => {
      computeBudgetActualMonthly(orgId, year).then((raw) => {
        const m = new Map<string, number>();
        for (const r of raw.rows) m.set(r.code, r.totalN1);
        setN1Map(m);
      });
    });
  }, [orgId, year]);
  if (!version) {
    return <Card><div className="py-12 text-center text-primary-500">Sélectionnez une version budgétaire</div></Card>;
  }
  if (rows.length === 0) {
    return <Card><div className="py-12 text-center text-primary-500">Aucune donnée — vérifiez que la version est saisie</div></Card>;
  }

  const totalBudget = rows.reduce((s, r) => s + r.budget, 0);
  const totalRealise = rows.reduce((s, r) => s + r.realise, 0);
  const totalEcart = rows.reduce((s, r) => s + r.ecart, 0);

  const top = rows.slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatBox label="Total budget" value={fmtMoney(totalBudget)} />
        <StatBox label="Total réalisé" value={fmtMoney(totalRealise)} />
        <StatBox label="Écart total" value={fmtMoney(totalEcart)} highlight={totalEcart >= 0 ? 'good' : 'bad'} />
        <StatBox label={`Comptes analysés`} value={rows.length.toString()} />
      </div>

      <Card title="Top 10 écarts" subtitle="Montants absolus les plus importants" padded={false}>
        <Chart height={320}
          option={{
            grid: { left: 180, right: 40 },
            xAxis: { type: 'value', axisLabel: { formatter: (v: number) => fmtK(v) } },
            yAxis: { type: 'category', data: top.map((r) => `${r.account} · ${r.label.substring(0, 24)}`).reverse(), axisLabel: { fontSize: 10 } },
            series: [
              { name: 'Budget', type: 'bar', data: top.map((r) => r.budget).reverse(), itemStyle: { color: '#a3a3a3' } },
              { name: 'Réalisé', type: 'bar', data: top.map((r) => r.realise).reverse(), itemStyle: { color: '#171717' } },
            ],
            legend: { data: ['Budget', 'Réalisé'], top: 0 },
            tooltip: { trigger: 'axis', formatter: (p: any) => p.map((x: any) => `${x.seriesName} : ${fmtMoney(x.value)}`).join('<br/>') },
          }}
        />
      </Card>

      <Card title="Détail des écarts par compte" padded={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wider text-primary-500 border-b border-primary-300 dark:border-primary-700">
              <tr>
                <th className="text-left py-2 px-3">Cpte</th>
                <th className="text-left py-2 px-3">Libellé</th>
                <th className="text-right py-2 px-3">Budget</th>
                <th className="text-right py-2 px-3">Réalisé</th>
                <th className="text-right py-2 px-3">Écart</th>
                <th className="text-right py-2 px-3">Écart %</th>
                <th className="text-right py-2 px-3">N-1</th>
                <th className="text-right py-2 px-3">Var N-1</th>
                <th className="text-center py-2 px-3">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-primary-200 dark:divide-primary-800">
              {rows.map((r) => {
                const n1 = n1Map.get(r.account) ?? 0;
                const varN1 = n1 ? ((r.realise - n1) / Math.abs(n1) * 100) : 0;
                return (
                <tr key={r.account} className="hover:bg-primary-100/50 dark:hover:bg-primary-900/50">
                  <td className="py-1.5 px-3 num font-mono">{r.account}</td>
                  <td className="py-1.5 px-3 text-xs">{r.label}</td>
                  <td className="py-1.5 px-3 text-right num">{fmtFull(r.budget)}</td>
                  <td className="py-1.5 px-3 text-right num">{fmtFull(r.realise)}</td>
                  <td className={clsx('py-1.5 px-3 text-right num font-semibold',
                    r.status === 'favorable' ? 'text-success' : r.status === 'defavorable' ? 'text-error' : '')}>
                    {fmtFull(r.ecart)}
                  </td>
                  <td className={clsx('py-1.5 px-3 text-right num text-xs',
                    r.status === 'favorable' ? 'text-success' : r.status === 'defavorable' ? 'text-error' : 'text-primary-500')}>
                    {fmtPct(r.ecartPct)}
                  </td>
                  <td className="py-1.5 px-3 text-right num text-primary-400">{n1 ? fmtFull(n1) : '—'}</td>
                  <td className={clsx('py-1.5 px-3 text-right num text-xs', varN1 === 0 ? 'text-primary-400' : (r.account.startsWith('6') ? (varN1 <= 0 ? 'text-success' : 'text-error') : (varN1 >= 0 ? 'text-success' : 'text-error')))}>
                    {n1 ? `${varN1 >= 0 ? '+' : ''}${varN1.toFixed(1)}%` : '—'}
                  </td>
                  <td className="py-1.5 px-3 text-center">
                    {r.status === 'favorable' && <Badge variant="success"><ArrowUp className="w-3 h-3" /> Favorable</Badge>}
                    {r.status === 'defavorable' && <Badge variant="error"><ArrowDown className="w-3 h-3" /> Défavorable</Badge>}
                    {r.status === 'neutral' && <Badge>Neutre</Badge>}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function BudgetMonthlyTab({ orgId, year, version }: { orgId: string; year: number; version: string }) {
  const [data, setData] = useState<any>(null);
  const [mode, setMode] = useState<'budget' | 'n1'>('budget');

  useEffect(() => {
    import('../engine/budgetActual').then(({ computeBudgetActualMonthly, monthlySummaryBySection }) => {
      computeBudgetActualMonthly(orgId, year, version || undefined).then((raw) => {
        setData({ months: raw.months, sections: monthlySummaryBySection(raw, orgId), rows: raw.rows });
      });
    });
  }, [orgId, year, version]);

  if (!data) return <Card><div className="py-12 text-center text-primary-500">Chargement...</div></Card>;

  return (
    <div className="space-y-4">
      <div className="flex gap-1 p-1 bg-primary-200 dark:bg-primary-800 rounded-lg w-fit">
        <button onClick={() => setMode('budget')}
          className={clsx('px-3 py-1.5 text-xs rounded-md font-medium', mode === 'budget' ? 'bg-primary-50 dark:bg-primary-900' : 'text-primary-600')}>
          Réalisé vs Budget
        </button>
        <button onClick={() => setMode('n1')}
          className={clsx('px-3 py-1.5 text-xs rounded-md font-medium', mode === 'n1' ? 'bg-primary-50 dark:bg-primary-900' : 'text-primary-600')}>
          Réalisé N vs N-1
        </button>
      </div>

      <Card padded={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead className="bg-primary-100 dark:bg-primary-900 sticky top-0">
              <tr>
                <th className="text-left py-2 px-3 font-semibold min-w-[160px]">Section</th>
                {data.months.map((m: string) => <th key={m} className="text-right py-2 px-1 font-semibold w-[60px]">{m}</th>)}
                <th className="text-right py-2 px-3 font-semibold border-l-2 border-primary-300 dark:border-primary-700">Total</th>
              </tr>
            </thead>
            <tbody>
              {data.sections.map((sec: any) => {
                const cmp = mode === 'budget' ? 'budget' : 'n1';
                const totCmp = mode === 'budget' ? sec.totalBudget : sec.totalN1;
                return (
                  <React.Fragment key={sec.section}>
                    <tr className="border-b border-primary-200 dark:border-primary-800">
                      <td className="py-1.5 px-3 font-semibold" rowSpan={3}>
                        <span className="text-xs">{sec.label}</span>
                      </td>
                      {sec.months.map((m: any, i: number) => <td key={i} className="py-1 px-1 text-right num">{fmtMoney(m.realise).replace(/ XOF/, '')}</td>)}
                      <td className="py-1 px-3 text-right num font-semibold border-l-2 border-primary-300 dark:border-primary-700">{fmtMoney(sec.totalRealise).replace(/ XOF/, '')}</td>
                    </tr>
                    <tr className="text-primary-500">
                      {sec.months.map((m: any, i: number) => <td key={i} className="py-1 px-1 text-right num text-[10px]">{fmtMoney(m[cmp]).replace(/ XOF/, '')}</td>)}
                      <td className="py-1 px-3 text-right num text-[10px] border-l-2 border-primary-300 dark:border-primary-700">{fmtMoney(totCmp).replace(/ XOF/, '')}</td>
                    </tr>
                    <tr className="border-b-2 border-primary-200 dark:border-primary-700">
                      {sec.months.map((m: any, i: number) => {
                        const e = m.realise - m[cmp];
                        return <td key={i} className={clsx('py-1 px-1 text-right num text-[10px] font-medium', e === 0 ? 'text-primary-400' : (sec.isCharge ? (e <= 0 ? 'text-success' : 'text-error') : (e >= 0 ? 'text-success' : 'text-error')))}>{e >= 0 ? '+' : ''}{fmtMoney(e).replace(/ XOF/, '')}</td>;
                      })}
                      <td className="py-1 px-3 text-right num text-[10px] font-semibold border-l-2 border-primary-300 dark:border-primary-700">
                        {(sec.totalRealise - totCmp) >= 0 ? '+' : ''}{fmtMoney(sec.totalRealise - totCmp).replace(/ XOF/, '')}
                      </td>
                    </tr>
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 text-[10px] text-primary-400 border-t border-primary-200 dark:border-primary-800">
          Ligne 1 : Réalisé {year} | Ligne 2 : {mode === 'budget' ? `Budget ${version}` : `Réalisé ${year - 1}`} | Ligne 3 : Écart
        </div>
      </Card>
    </div>
  );
}
