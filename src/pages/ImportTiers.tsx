import { useState } from 'react';
import { CheckCircle2, Download, FileWarning, RefreshCw, Trash2, XCircle, Users, Search } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { toast } from '../components/ui/Toast';
import { PageHeader } from '../components/layout/PageHeader';
import { useApp } from '../store/app';
import { db } from '../db/schema';
import { useCurrentOrg, useImportsHistory } from '../hooks/useFinancials';
import { detectTiersColumns, importGLTiers, migrateGLPeriods, resyncAccountLabels, parseFile, TiersMapping, TiersImportReport } from '../engine/importer';
import { downloadTiersTemplate } from '../engine/templates';
import { fmtFull } from '../lib/format';
import { Shield } from 'lucide-react';

const sources = ['SAGE', 'PERFECTO', 'SAARI', 'CEGID', 'ODOO', 'SAP', 'CSV générique', 'Excel'];

const controls = [
  'Rapprochement GL général ↔ GL tiers',
  'Pas de doublons (enrichissement, pas de création)',
  'Cohérence soldes GL vs Tiers par compte collectif',
  'Détection des tiers sans correspondance GL',
  'Validation codes tiers et noms',
  'Mode standalone si GL absent',
];

const tiersFieldLabels: Record<string, string> = {
  date: 'Date',
  account: 'Compte général (411/401)',
  codeTiers: 'Code tiers',
  labelTiers: 'Nom du tiers',
  debit: 'Débit',
  credit: 'Crédit',
  journal: 'Journal',
  piece: 'N° pièce',
  label: 'Libellé écriture',
};

export default function ImportTiers() {
  const { currentOrgId, currentYear } = useApp();
  const org = useCurrentOrg();
  const history = useImportsHistory(currentOrgId, 'TIERS');
  const glHistory = useImportsHistory(currentOrgId, 'GL');
  const [step, setStep] = useState<'idle' | 'mapping' | 'result'>('idle');
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Partial<TiersMapping>>({});
  const [source, setSource] = useState('CSV générique');
  const [report, setReport] = useState<TiersImportReport | null>(null);
  const [loading, setLoading] = useState(false);

  const hasGL = glHistory.length > 0;
  const [tiersTab, setTiersTab] = useState<'all' | 'clients' | 'fournisseurs' | 'personnel' | 'etat' | 'autres'>('all');

  const onFile = async (f: File) => {
    setFile(f);
    setLoading(true);
    try {
      const { headers } = await parseFile(f);
      setHeaders(headers);
      setMapping(detectTiersColumns(headers));
      setStep('mapping');
    } catch (e: any) {
      toast.error('Lecture du fichier impossible', e.message);
    } finally {
      setLoading(false);
    }
  };

  const runImport = async () => {
    if (!file) return;
    const required: (keyof TiersMapping)[] = ['date', 'account', 'codeTiers', 'labelTiers', 'debit', 'credit'];
    for (const k of required) {
      if (!mapping[k]) { toast.warning('Colonne manquante', `Le champ "${tiersFieldLabels[k]}" n'a pas été mappé`); return; }
    }
    setLoading(true);
    try {
      const res = await importGLTiers(file, mapping as TiersMapping, {
        orgId: currentOrgId, user: 'Utilisateur local', source,
      });
      setReport(res);
      setStep('result');
      if (res.enriched > 0 || res.created > 0) {
        toast.success('Import tiers terminé', `${res.enriched} enrichies · ${res.created} créées`);
      }
    } catch (e: any) {
      toast.error("Erreur d'import", e.message);
    } finally {
      setLoading(false);
    }
  };

  const reset = () => { setStep('idle'); setFile(null); setHeaders([]); setMapping({}); setReport(null); };

  const deleteImport = async (imp: typeof history[number]) => {
    if (!confirm(`Supprimer l'import tiers "${imp.fileName}" et ses écritures créées en standalone ?`)) return;
    await db.transaction('rw', [db.gl, db.imports], async () => {
      const impId = String(imp.id);
      const toDelete = await db.gl.filter((e) => e.importId === impId).primaryKeys();
      if (toDelete.length > 0) await db.gl.bulkDelete(toDelete);
      await db.imports.delete(imp.id!);
    });
    toast.success('Import supprimé');
  };

  // Diagnostic tiers : inspecter les écritures d'un code tiers
  const diagnosticTiers = async () => {
    const code = prompt('Diagnostic — entrez un code tiers ou un préfixe de compte (ex: CLI001, 411) :');
    if (!code) return;
    const entries = await db.gl.where('orgId').equals(currentOrgId).toArray();
    const filtered = entries.filter((e) =>
      (e.tiers && e.tiers.toUpperCase().includes(code.toUpperCase())) ||
      e.account.startsWith(code)
    );
    if (filtered.length === 0) {
      toast.info('Aucun résultat', `Aucune écriture trouvée pour "${code}"`);
      return;
    }
    // Regrouper par tiers
    const byTiers = new Map<string, { count: number; debit: number; credit: number; accounts: Set<string> }>();
    for (const e of filtered) {
      const key = e.tiers || e.account;
      const cur = byTiers.get(key) ?? { count: 0, debit: 0, credit: 0, accounts: new Set() };
      cur.count++;
      cur.debit += e.debit;
      cur.credit += e.credit;
      cur.accounts.add(e.account);
      byTiers.set(key, cur);
    }
    const lines = [`Diagnostic tiers "${code}" — ${filtered.length} écriture(s)`, ''];
    for (const [k, v] of Array.from(byTiers.entries()).sort()) {
      const solde = v.debit - v.credit;
      lines.push(`${k} : ${v.count} écr. | D=${fmtFull(v.debit)} C=${fmtFull(v.credit)} | Solde=${fmtFull(solde)} | Comptes: ${[...v.accounts].join(', ')}`);
    }
    console.log(lines.join('\n'));
    toast.info(`Diagnostic "${code}"`, `${filtered.length} écritures · ${byTiers.size} tiers distincts — voir console (F12)`);
  };

  // Statistiques tiers actuelles
  type TiersCat = { label: string; prefix: string; count: number; entries: number; top: Array<{ code: string; label: string; solde: number }> };
  const [tiersStats, setTiersStats] = useState<{ total: number; cats: TiersCat[] } | null>(null);
  const refreshStats = async () => {
    const entries = await db.gl.where('orgId').equals(currentOrgId).toArray();
    const withTiers = entries.filter((e) => !!e.tiers);
    const aggregate = (arr: typeof entries) => {
      const map = new Map<string, { label: string; solde: number }>();
      for (const e of arr) {
        const k = e.tiers || e.account;
        const cur = map.get(k) ?? { label: e.label || k, solde: 0 };
        cur.solde += e.debit - e.credit;
        map.set(k, cur);
      }
      return Array.from(map.entries())
        .map(([code, v]) => ({ code, label: v.label, solde: v.solde }))
        .sort((a, b) => Math.abs(b.solde) - Math.abs(a.solde))
        .slice(0, 10);
    };
    const catDefs = [
      { label: 'Fournisseurs', prefix: '401' },
      { label: 'Clients', prefix: '411' },
      { label: 'Personnel', prefix: '42' },
      { label: 'Organismes sociaux', prefix: '43' },
      { label: 'État & collectivités', prefix: '44' },
      { label: 'Associés & groupe', prefix: '45' },
      { label: 'Débiteurs/créditeurs divers', prefix: '47' },
      { label: 'Créances/dettes HAO', prefix: '48' },
    ];
    const cats: TiersCat[] = catDefs.map((d) => {
      const sub = withTiers.filter((e) => e.account.startsWith(d.prefix));
      return { ...d, count: new Set(sub.map((e) => e.tiers)).size, entries: sub.length, top: aggregate(sub) };
    });
    // Aussi compter les écritures avec tiers sur comptes non-standard
    const allPrefixes = catDefs.map((d) => d.prefix);
    const otherEntries = withTiers.filter((e) => !allPrefixes.some((p) => e.account.startsWith(p)));
    if (otherEntries.length > 0) {
      cats.push({ label: 'Autres comptes', prefix: '—', count: new Set(otherEntries.map((e) => e.tiers)).size, entries: otherEntries.length, top: aggregate(otherEntries) });
    }
    setTiersStats({ total: withTiers.length, cats });
  };

  return (
    <div>
      <PageHeader
        title="Grand Livre Tiers"
        subtitle={`Import auxiliaire clients/fournisseurs — ${org?.name ?? '—'} · Exercice ${currentYear}`}
        action={
          <div className="flex gap-2 flex-wrap">
            <button className="btn-outline" onClick={async () => {
              if (!confirm('Recalculer les périodes de toutes les écritures tiers selon leurs dates ?')) return;
              setLoading(true);
              try {
                const res = await migrateGLPeriods(currentOrgId);
                toast.success('Périodes recalculées', `${res.migrated} écritures réaffectées · ${res.periodsCreated} périodes créées`);
              } catch (e: any) { toast.error('Recalcul impossible', e.message); }
              finally { setLoading(false); }
            }}>
              <RefreshCw className="w-4 h-4" /> Recalculer périodes
            </button>
            <button className="btn-outline" onClick={async () => {
              if (!confirm('Resynchroniser les libellés des comptes tiers depuis le Grand Livre ?')) return;
              setLoading(true);
              try {
                const res = await resyncAccountLabels(currentOrgId);
                toast.success('Libellés synchronisés', `${res.updated} comptes mis à jour`);
              } catch (e: any) { toast.error('Resync impossible', e.message); }
              finally { setLoading(false); }
            }}>
              <RefreshCw className="w-4 h-4" /> Resync libellés
            </button>
            <button className="btn-outline" onClick={diagnosticTiers}>
              <Search className="w-4 h-4" /> Diagnostic compte
            </button>
            <button className="btn-outline" onClick={() => downloadTiersTemplate(org?.name, currentYear)}>
              <Download className="w-4 h-4" /> Modèle Excel
            </button>
            <button className="btn-outline" onClick={async () => {
              setLoading(true);
              try {
                const { verifyChain } = await import('../lib/auditHash');
                const entries = await db.gl.where('orgId').equals(currentOrgId).toArray();
                const tiersEntries = entries.filter((e) => !!e.tiers);
                if (tiersEntries.length === 0) { toast.info('Aucune écriture tiers', 'Importez d\'abord un GL Tiers'); return; }
                const result = await verifyChain(tiersEntries as any);
                if (result.valid) {
                  toast.success('Intégrité vérifiée', `${tiersEntries.length} écritures tiers — chaîne SHA-256 intacte`);
                } else {
                  toast.error('Intégrité compromise', `Rupture à l'index ${result.brokenIndex ?? '?'} (écriture ${result.brokenAt ?? '?'})`);
                }
              } catch (e: any) { toast.error('Vérification impossible', e.message); }
              finally { setLoading(false); }
            }}>
              <Shield className="w-4 h-4" /> Vérifier intégrité
            </button>
            <button className="btn-outline" onClick={async () => {
              setLoading(true);
              try {
                const { auditGL } = await import('../engine/glAudit');
                const result = await auditGL(currentOrgId, currentYear);
                const tiersFindings = result.findings.filter((f: any) =>
                  f.category === 'clients_crediteurs' || f.category === 'fournisseurs_debiteurs' ||
                  f.accounts?.some((a: string) => a.startsWith('41') || a.startsWith('40'))
                );
                console.log('Audit GL Tiers :', tiersFindings);
                toast.info(
                  `Audit GL — Score ${result.scoreGlobal}/100`,
                  `${tiersFindings.length} anomalie(s) tiers détectée(s) — voir console (F12)`
                );
              } catch (e: any) { toast.error('Audit impossible', e.message); }
              finally { setLoading(false); }
            }}>
              <FileWarning className="w-4 h-4" /> Auditer le GL
            </button>
            <button className="btn-outline" onClick={refreshStats}>
              <RefreshCw className="w-4 h-4" /> Stats tiers
            </button>
          </div>
        }
      />

      <div className="space-y-6">
        {/* Alerte si pas de GL importé */}
        {!hasGL && (
          <div className="p-4 rounded-lg bg-warning/10 border-l-4 border-warning">
            <p className="text-sm font-semibold">Aucun Grand Livre importé</p>
            <p className="text-xs text-primary-600 dark:text-primary-300 mt-1">
              Importez d'abord le <strong>Grand Livre Général</strong> (page Imports) pour que le rapprochement fonctionne.
              Sans GL, les écritures tiers seront créées en mode standalone.
            </p>
          </div>
        )}

        {/* Stats tiers actuelles */}
        {tiersStats && (() => {
          const tabFilter: Record<string, string[]> = {
            all: [],
            clients: ['411'],
            fournisseurs: ['401'],
            personnel: ['42'],
            etat: ['43', '44'],
            autres: ['45', '46', '47', '48'],
          };
          const prefixes = tabFilter[tiersTab] ?? [];
          const visibleCats = prefixes.length === 0
            ? tiersStats.cats
            : tiersStats.cats.filter((c) => prefixes.some((p) => c.prefix.startsWith(p)));
          return (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {tiersTab === 'all' && <StatCard label="Total écritures tiers" value={tiersStats.total} />}
                {visibleCats.map((c) => (
                  <StatCard key={c.prefix} label={`${c.label} (${c.prefix})`} value={c.count} good={c.count > 0} />
                ))}
              </div>
              {visibleCats.filter((c) => c.top.length > 0).map((cat) => (
                <Card key={cat.prefix} title={`Top 10 — ${cat.label}`} subtitle={`Comptes ${cat.prefix} · ${cat.entries} écritures · ${cat.count} tiers`}>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead><tr className="border-b border-primary-200 dark:border-primary-800 text-primary-500 uppercase tracking-wider">
                        <th className="text-left py-1.5 px-2">Code tiers</th><th className="text-left py-1.5 px-2">Libellé</th><th className="text-right py-1.5 px-2">Solde</th>
                      </tr></thead>
                      <tbody className="divide-y divide-primary-100 dark:divide-primary-800">
                        {cat.top.map((t, i) => (
                          <tr key={i}><td className="py-1 px-2 font-mono">{t.code}</td><td className="py-1 px-2">{t.label}</td><td className="py-1 px-2 text-right num">{fmtFull(t.solde)}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              ))}
            </div>
          );
        })()}

        {/* Onglets type de tiers SYSCOHADA classe 4 */}
        <div className="flex gap-1 border-b border-primary-200 dark:border-primary-800 overflow-x-auto">
          {([
            { key: 'all' as const, label: 'Tous les tiers' },
            { key: 'clients' as const, label: 'Clients (411)' },
            { key: 'fournisseurs' as const, label: 'Fournisseurs (401)' },
            { key: 'personnel' as const, label: 'Personnel (42)' },
            { key: 'etat' as const, label: 'État & Org. (43-44)' },
            { key: 'autres' as const, label: 'Autres tiers (45-48)' },
          ]).map((t) => (
            <button key={t.key}
              className={`px-3 py-2 text-xs font-medium border-b-2 transition whitespace-nowrap ${tiersTab === t.key ? 'border-accent text-accent' : 'border-transparent text-primary-500 hover:text-primary-700'}`}
              onClick={() => setTiersTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Guide */}
        <div className="p-4 rounded-lg bg-primary-100/60 dark:bg-primary-800/40 text-xs text-primary-600 dark:text-primary-300 space-y-1">
          <p><strong>Comment ça fonctionne :</strong></p>
          <p>1. Importez d'abord le <strong>Grand Livre Général</strong> (page Imports)</p>
          <p>2. Importez ici le <strong>Grand Livre Tiers</strong> (auxiliaire clients/fournisseurs)</p>
          <p>3. Rapprochement automatique par <strong>date + compte + montant</strong> — le code tiers est ajouté sans doublon</p>
          <p>4. Les balances auxiliaires, balances âgées, DSO/DPO et dashboards client/fournisseur se remplissent automatiquement</p>
        </div>

        {step === 'idle' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card title="Déposer le fichier tiers" subtitle="Grand livre auxiliaire — CSV, TXT, XLSX, XLS" className="lg:col-span-2">
              <label className="border-2 border-dashed border-primary-300 dark:border-primary-700 rounded-xl p-10 text-center block hover:border-primary-400 dark:hover:border-primary-600 transition cursor-pointer">
                <Users className="w-10 h-10 mx-auto text-primary-400 mb-3" />
                <p className="text-sm font-medium">Déposez ou cliquez pour choisir un fichier</p>
                <p className="text-xs text-primary-500 mt-1">Formats acceptés : CSV · TXT · XLSX · XLS</p>
                <input type="file" accept=".csv,.txt,.xlsx,.xls" className="hidden"
                  onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
              </label>
              <div className="mt-4 flex flex-wrap gap-2">
                {sources.map((s) => (
                  <button key={s} onClick={() => setSource(s)}
                    className={`btn !py-1.5 text-xs ${source === s ? 'bg-primary-900 text-primary-50 dark:bg-primary-100 dark:text-primary-900' : 'btn-outline'}`}>
                    {s}
                  </button>
                ))}
              </div>
            </Card>
            <Card title="Contrôles automatiques" subtitle="Appliqués à chaque import">
              <ul className="space-y-2 text-sm">
                {controls.map((c) => (
                  <li key={c} className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-primary-500" />
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        )}

        {step === 'mapping' && (
          <Card title="Mapping des colonnes" subtitle={`Fichier : ${file?.name} — ${headers.length} colonnes détectées`}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <Select label="Source ERP" value={source} onChange={setSource}
                options={sources.map((s) => ({ v: s, l: s }))} />
              <div>
                <label className="text-xs text-primary-500 font-medium block mb-1">GL de référence</label>
                <p className="text-sm text-primary-700 dark:text-primary-300 mt-1">
                  {hasGL ? `✓ ${glHistory.length} import(s) GL — rapprochement activé` : '⚠ Pas de GL — mode standalone'}
                </p>
              </div>
            </div>
            <h4 className="text-xs uppercase tracking-wider text-primary-500 font-semibold mb-3">Correspondance des colonnes</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {(['date', 'account', 'codeTiers', 'labelTiers', 'debit', 'credit', 'journal', 'piece', 'label'] as const).map((field) => (
                <Select key={field}
                  label={tiersFieldLabels[field]}
                  value={mapping[field] ?? ''}
                  onChange={(v) => setMapping({ ...mapping, [field]: v || undefined })}
                  options={[{ v: '', l: '— Non mappée —' }, ...headers.map((h) => ({ v: h, l: h }))]}
                  required={['date', 'account', 'codeTiers', 'labelTiers', 'debit', 'credit'].includes(field)} />
              ))}
            </div>
            <div className="flex gap-2 mt-6 pt-4 border-t border-primary-200 dark:border-primary-800">
              <button className="btn-outline" onClick={reset}>Annuler</button>
              <button className="btn-primary" onClick={runImport} disabled={loading}>
                {loading ? 'Import en cours…' : 'Lancer l\'import tiers'}
              </button>
            </div>
          </Card>
        )}

        {step === 'result' && report && (
          <Card title="Résultat de l'import tiers">
            {/* Alerte mode standalone */}
            {report.created > 0 && report.enriched === 0 && (
              <div className="mb-6 p-3 rounded-lg bg-warning/10 border-l-4 border-warning">
                <p className="text-sm font-semibold">Mode standalone : {report.created} écritures créées</p>
                <p className="text-xs text-primary-600 dark:text-primary-300 mt-1">
                  Aucune écriture GL n'a pu être rapprochée. Les écritures tiers ont été créées directement.
                  Vérifiez que le GL général a bien été importé pour la même période.
                </p>
              </div>
            )}
            {report.enriched > 0 && (
              <div className="mb-6 p-3 rounded-lg bg-success/10 border-l-4 border-success">
                <p className="text-sm">
                  ✓ {report.enriched.toLocaleString('fr-FR')} écritures GL enrichies avec le code tiers
                  {report.created > 0 && ` · ${report.created} créées en standalone`}
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
              <StatCard label="Lignes lues" value={report.totalRows} />
              <StatCard label="GL enrichies" value={report.enriched} good={report.enriched > 0} />
              <StatCard label="Créées (standalone)" value={report.created} />
              <StatCard label="Ignorées" value={report.skipped} />
              <StatCard label="Erreurs" value={report.errors.length} bad={report.errors.length > 0} />
            </div>

            {/* Contrôle de cohérence GL vs Tiers */}
            {report.coherenceCheck.length > 0 && (
              <div className="mb-6">
                <h4 className="text-xs uppercase tracking-wider font-semibold mb-2">Contrôle de cohérence GL ↔ Tiers</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-xs uppercase tracking-wider text-primary-500 border-b border-primary-200 dark:border-primary-800 sticky top-0 bg-white dark:bg-primary-950">
                      <tr>
                        <th className="text-left py-1.5 px-2">Compte collectif</th>
                        <th className="text-right py-1.5 px-2">Solde GL</th>
                        <th className="text-right py-1.5 px-2">Solde Tiers</th>
                        <th className="text-right py-1.5 px-2">Écart</th>
                        <th className="text-center py-1.5 px-2">Statut</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-primary-100 dark:divide-primary-800">
                      {report.coherenceCheck.map((c, i) => (
                        <tr key={i} className="hover:bg-primary-50 dark:hover:bg-primary-900/50">
                          <td className="py-1.5 px-2 font-mono">{c.account}</td>
                          <td className="py-1.5 px-2 text-right num">{fmtFull(c.soldeGL)}</td>
                          <td className="py-1.5 px-2 text-right num">{fmtFull(c.soldeTiers)}</td>
                          <td className={`py-1.5 px-2 text-right num ${!c.ok ? 'text-error font-semibold' : ''}`}>{fmtFull(c.ecart)}</td>
                          <td className="py-1.5 px-2 text-center">
                            {c.ok
                              ? <Badge variant="success"><CheckCircle2 className="w-3 h-3" /> OK</Badge>
                              : <Badge variant="error"><XCircle className="w-3 h-3" /> Écart</Badge>
                            }
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {report.errors.length > 0 && (
              <div className="mb-4">
                <h4 className="text-xs uppercase tracking-wider font-semibold mb-2 text-error">{report.errors.length} erreur(s)</h4>
                <div className="max-h-40 overflow-y-auto text-xs font-mono bg-primary-50 dark:bg-primary-900/40 rounded p-3">
                  {report.errors.slice(0, 30).map((e, i) => <div key={i} className="py-0.5">Ligne {e.row} : {e.reason}</div>)}
                  {report.errors.length > 30 && <div className="text-primary-500 mt-1">… et {report.errors.length - 30} autres</div>}
                </div>
              </div>
            )}

            <button className="btn-primary" onClick={reset}>Nouvel import</button>
          </Card>
        )}

        {/* Historique complet */}
        <Card title="Historique des imports tiers" subtitle="Traçabilité complète">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wider text-primary-500 border-b border-primary-200 dark:border-primary-800">
                <tr>
                  <th className="text-left py-2 px-3">Date</th>
                  <th className="text-left py-2 px-3">Utilisateur</th>
                  <th className="text-left py-2 px-3">Fichier</th>
                  <th className="text-left py-2 px-3">Source</th>
                  <th className="text-right py-2 px-3">Écritures</th>
                  <th className="text-right py-2 px-3">Rejetées</th>
                  <th className="text-left py-2 px-3">Statut</th>
                  <th className="text-center py-2 px-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-primary-200 dark:divide-primary-800">
                {history.length === 0 && (
                  <tr><td colSpan={8} className="py-6 text-center text-primary-500 text-xs">Aucun import tiers</td></tr>
                )}
                {history.map((i) => (
                  <tr key={i.id} className="hover:bg-primary-100/50 dark:hover:bg-primary-900/50">
                    <td className="py-2 px-3 num text-xs">{new Date(i.date).toLocaleString('fr-FR')}</td>
                    <td className="py-2 px-3">{i.user}</td>
                    <td className="py-2 px-3 font-mono text-xs">{i.fileName}</td>
                    <td className="py-2 px-3"><Badge>{i.source}</Badge></td>
                    <td className="py-2 px-3 text-right num">{i.count.toLocaleString('fr-FR')}</td>
                    <td className="py-2 px-3 text-right num">{i.rejected}</td>
                    <td className="py-2 px-3">
                      {i.status === 'success' && <Badge variant="success"><CheckCircle2 className="w-3 h-3" /> Succès</Badge>}
                      {i.status === 'partial' && <Badge variant="warning"><FileWarning className="w-3 h-3" /> Partiel</Badge>}
                      {i.status === 'error' && <Badge variant="error"><XCircle className="w-3 h-3" /> Échec</Badge>}
                    </td>
                    <td className="py-2 px-3 text-center">
                      <button className="btn-ghost !p-1.5 text-primary-500 hover:text-error hover:bg-error/10" onClick={() => deleteImport(i)} title="Supprimer cet import et ses écritures standalone">
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
    </div>
  );
}

function Select({ label, value, onChange, options, required }: {
  label: string; value: string; onChange: (v: string) => void;
  options: { v: string; l: string }[]; required?: boolean;
}) {
  return (
    <div>
      <label className="text-xs text-primary-500 font-medium block mb-1">
        {label} {required && <span className="text-error">*</span>}
      </label>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    </div>
  );
}

function StatCard({ label, value, good, bad }: { label: string; value: number; good?: boolean; bad?: boolean }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-primary-500">{label}</p>
      <p className={`num text-2xl font-bold ${good ? 'text-success' : bad ? 'text-error' : ''}`}>
        {value.toLocaleString('fr-FR')}
      </p>
    </div>
  );
}
