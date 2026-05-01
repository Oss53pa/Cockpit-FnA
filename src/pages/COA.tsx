import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CheckCircle2, ChevronDown, ChevronRight, Download, FileSpreadsheet, FileWarning, FolderTree, Search, Trash2, XCircle } from 'lucide-react';
import { downloadCOATemplate } from '../engine/templates';
import { importCOAv2 } from '../engine/importer';
import { useCurrentOrg, useImportsHistory } from '../hooks/useFinancials';
import clsx from 'clsx';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { toast } from '../components/ui/Toast';
import { SYSCOHADA_COA, SyscoAccount, findSyscoAccount } from '../syscohada/coa';
import { db, Account, GLEntry, ImportLog } from '../db/schema';
import { useApp } from '../store/app';
import { fmtFull } from '../lib/format';

const CLASS_LABELS: Record<string, string> = {
  '1': 'Classe 1 — Ressources durables',
  '2': 'Classe 2 — Actif immobilisé',
  '3': 'Classe 3 — Stocks et en-cours',
  '4': 'Classe 4 — Tiers',
  '5': 'Classe 5 — Trésorerie',
  '6': 'Classe 6 — Charges des activités ordinaires',
  '7': 'Classe 7 — Produits des activités ordinaires',
  '8': 'Classe 8 — Autres charges et autres produits',
};

const TYPE_LABELS: Record<string, string> = {
  A: 'Actif', P: 'Passif', C: 'Charge', R: 'Produit', X: 'Autre',
};

export default function COA() {
  const { currentOrgId } = useApp();
  const org = useCurrentOrg();
  const [q, setQ] = useState('');
  const [activeClass, setActiveClass] = useState<string>('all');
  const [view, setView] = useState<'sysco' | 'imported' | 'import'>('import');
  const [selected, setSelected] = useState<{ code: string; label: string; type?: string; class?: string } | null>(null);

  const coaImports = useImportsHistory(currentOrgId, 'COA');

  const accounts = useLiveQuery(
    () => (currentOrgId ? db.accounts.where('orgId').equals(currentOrgId).toArray() : Promise.resolve([] as Account[])),
    [currentOrgId], [] as Account[],
  );

  const mouvementes = useLiveQuery(async () => {
    if (!currentOrgId) return new Set<string>();
    const entries = await db.gl.where('orgId').equals(currentOrgId).toArray();
    return new Set(entries.map((e) => e.account));
  }, [currentOrgId], new Set<string>());

  const filteredSysco = useMemo(() => {
    return SYSCOHADA_COA.filter((a) => {
      if (activeClass !== 'all' && a.class !== activeClass) return false;
      if (!q) return true;
      const lq = q.toLowerCase();
      return a.code.includes(q) || a.label.toLowerCase().includes(lq);
    });
  }, [q, activeClass]);

  const filteredImported = useMemo(() => {
    return accounts.filter((a) => {
      if (activeClass !== 'all' && a.class !== activeClass) return false;
      if (!q) return true;
      const lq = q.toLowerCase();
      return a.code.includes(q) || a.label.toLowerCase().includes(lq);
    }).sort((a, b) => a.code.localeCompare(b.code));
  }, [accounts, q, activeClass]);

  const statsByClass = useMemo(() => {
    const s: Record<string, { total: number; used: number }> = {};
    for (let c = 1; c <= 8; c++) {
      const k = String(c);
      s[k] = {
        total: SYSCOHADA_COA.filter((a) => a.class === k).length,
        used: [...mouvementes].filter((code) => code[0] === k).length,
      };
    }
    return s;
  }, [mouvementes]);

  const exportCSV = () => {
    const data = view === 'sysco' ? filteredSysco : filteredImported;
    const csv = [
      'Code;Libellé;Classe;Type',
      ...data.map((a: any) => `${a.code};"${a.label}";${a.class};${a.type}`),
    ].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `plan_comptable_${view}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <PageHeader
        title="Plan comptable [BUILD-v10]"
        subtitle="SYSCOHADA révisé 2017 — classes 1 à 8 + comptes mappés de la société"
        action={
          <div className="flex gap-2">
            <button className="btn-outline" onClick={() => downloadCOATemplate(org?.name)}>
              <FileSpreadsheet className="w-4 h-4" /> Modèle Excel
            </button>
            <label className="btn-primary cursor-pointer">
              <Download className="w-4 h-4 rotate-180" /> Importer
              <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                try {
                  const res = await importCOAv2(f, currentOrgId);
                  if (res.imported > 0) {
                    const desc = `${res.imported} comptes · ${res.updated} mis à jour` + (res.errors.length ? ` · ${res.errors.length} erreurs (voir F12)` : '');
                    toast.success('Import COA terminé', desc);
                    if (res.errors.length) console.warn('[Import COA] Erreurs:', res.errors);
                    window.location.reload();
                  } else {
                    // Aucun compte importe : afficher TOUTES les erreurs (concat) + console string
                    const reason = res.errors.length ? res.errors.join(' ') : 'Aucune ligne valide trouvée dans le fichier';
                    toast.error("Import impossible", reason);
                    // Print en STRING (pas Object collapsed) pour que ce soit immediatement lisible
                    console.error('[Import COA] Échec :\n' + (res.errors.join('\n') || '(aucune erreur explicite)'));
                    console.error('[Import COA] Feuille sélectionnée:', res.sheetName || '(aucune)');
                  }
                } catch (err: any) {
                  toast.error("Erreur d'import COA", err.message);
                  console.error('[Import COA] Exception:', err);
                }
                e.target.value = '';
              }} />
            </label>
            <button className="btn-outline" onClick={exportCSV}>
              <Download className="w-4 h-4" /> Exporter CSV
            </button>
            <button className="btn-outline" onClick={async () => {
              if (!confirm(`Vider le Plan Comptable de l'entreprise ?\n${accounts.length} compte(s) seront supprimés. Le Grand Livre n'est PAS impacté.`)) return;
              const toDel = (await db.accounts.where('orgId').equals(currentOrgId).toArray()).map((a) => [a.orgId, a.code] as [string, string]);
              await db.accounts.bulkDelete(toDel);
              toast.success('Plan comptable vidé', `${toDel.length} comptes supprimés — réimportez via l'onglet Import`);
              window.location.reload();
            }}>
              Vider PC
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-4 md:grid-cols-8 gap-2 mb-6">
        {['1','2','3','4','5','6','7','8'].map((c) => (
          <button key={c} onClick={() => setActiveClass(activeClass === c ? 'all' : c)}
            className={clsx('card p-3 text-left transition',
              activeClass === c && 'ring-2 ring-primary-900 dark:ring-primary-100')}>
            <p className="text-[10px] uppercase tracking-wider text-primary-500 font-semibold">Classe {c}</p>
            <p className="num text-lg font-bold mt-1">{statsByClass[c]?.used ?? 0}</p>
            <p className="text-[10px] text-primary-500">/ {statsByClass[c]?.total ?? 0} actifs</p>
          </button>
        ))}
      </div>

      <div className="flex gap-1 border-b border-primary-200 dark:border-primary-800 mb-4">
        <button onClick={() => setView('import')}
          className={clsx('px-4 py-2.5 text-sm font-medium border-b-2 -mb-px',
            view === 'import' ? 'border-primary-900 dark:border-primary-100' : 'border-transparent text-primary-500')}>
          Import & Historique <Badge>{coaImports.length}</Badge>
        </button>
        <button onClick={() => setView('imported')}
          className={clsx('px-4 py-2.5 text-sm font-medium border-b-2 -mb-px',
            view === 'imported' ? 'border-primary-900 dark:border-primary-100' : 'border-transparent text-primary-500')}>
          Comptes de la société <Badge>{accounts.length}</Badge>
        </button>
        <button onClick={() => setView('sysco')}
          className={clsx('px-4 py-2.5 text-sm font-medium border-b-2 -mb-px',
            view === 'sysco' ? 'border-primary-900 dark:border-primary-100' : 'border-transparent text-primary-500')}>
          Référentiel SYSCOHADA <Badge>{SYSCOHADA_COA.length}</Badge>
        </button>
      </div>

      <div className="mb-4 flex gap-2 items-center">
        <div className="flex-1 max-w-md relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-primary-400" />
          <input className="input pl-9" placeholder="Rechercher par code ou libellé…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {activeClass !== 'all' && (
          <button className="btn-outline !py-1.5" onClick={() => setActiveClass('all')}>Classe {activeClass} ✕</button>
        )}
        <p className="text-xs text-primary-500 ml-auto">Cliquez sur un compte pour voir son détail</p>
      </div>

      {view === 'sysco' && (
        <Card padded={false}>
          <div className="max-h-[70vh] overflow-y-auto">
            <SyscoTree items={filteredSysco} mouvementes={mouvementes} activeClass={activeClass} onSelect={(a) => setSelected(a)} />
          </div>
        </Card>
      )}

      {view === 'imported' && (
        <Card padded={false}>
          <div className="px-4 py-3 border-b border-primary-200 dark:border-primary-800 flex items-center justify-between flex-wrap gap-2">
            <p className="text-xs text-primary-500">{accounts.length} compte(s) dans le plan entreprise</p>
            <div className="flex gap-2 flex-wrap">
            <button className="btn-outline !py-1.5 text-xs" onClick={async () => {
              if (!confirm('Générer le Plan Comptable à partir des comptes mouvementés du Grand Livre ?\nLes libellés seront ceux des écritures GL (le plus fréquent par compte).')) return;
              const entries = await db.gl.where('orgId').equals(currentOrgId).toArray();
              if (entries.length === 0) { toast.warning('Pas de Grand Livre', 'Importez d\'abord un GL pour générer le plan comptable'); return; }
              const freq = new Map<string, Map<string, number>>();
              for (const e of entries) {
                if (!e.label) continue;
                const lbl = e.label.trim(); if (!lbl) continue;
                let m = freq.get(e.account); if (!m) { m = new Map(); freq.set(e.account, m); }
                m.set(lbl, (m.get(lbl) ?? 0) + 1);
              }
              const codes = new Set(entries.map((e) => e.account));
              const toCreate: Account[] = [];
              const existing = new Set(accounts.map((a) => a.code));
              for (const code of codes) {
                if (existing.has(code)) continue;
                const m = freq.get(code);
                let bestLabel = ''; let bestN = 0;
                if (m) for (const [k, v] of m) if (v > bestN) { bestLabel = k; bestN = v; }
                const sysco = SYSCOHADA_COA.find((a) => code.startsWith(a.code));
                toCreate.push({
                  orgId: currentOrgId,
                  code,
                  label: bestLabel || sysco?.label || 'Compte',
                  syscoCode: sysco?.code,
                  class: code[0],
                  type: (sysco?.type as Account['type']) ?? 'X',
                });
              }
              if (toCreate.length === 0) { toast.info('Plan déjà à jour', 'Tous les comptes du GL existent déjà'); return; }
              await db.accounts.bulkPut(toCreate);
              toast.success('Comptes créés', `${toCreate.length} comptes ajoutés depuis le Grand Livre`);
            }}>Générer depuis le GL</button>
            <button className="btn-primary !py-1.5 text-xs" onClick={async () => {
              const code = prompt('Code du nouveau compte (ex: 706111) :', '');
              if (!code || !code.trim()) return;
              const trimmed = code.trim();
              const existing = await db.accounts.where({ orgId: currentOrgId, code: trimmed }).first();
              if (existing) { toast.warning('Compte existant', `Le compte ${trimmed} existe déjà`); return; }
              const label = prompt('Libellé du compte :', '');
              if (!label || !label.trim()) return;
              const sysco = SYSCOHADA_COA.find((a) => trimmed.startsWith(a.code));
              await db.accounts.put({
                orgId: currentOrgId,
                code: trimmed,
                label: label.trim(),
                syscoCode: sysco?.code,
                class: trimmed[0],
                type: sysco?.type ?? 'X',
              });
              toast.success('Compte ajouté', `Compte ${trimmed} créé avec succès`);
            }}>+ Ajouter compte</button>
            </div>
          </div>
          <div className="max-h-[70vh] overflow-y-auto">
            <ImportedTree items={filteredImported} mouvementes={mouvementes} activeClass={activeClass} onSelect={(a) => setSelected(a)} />
          </div>
        </Card>
      )}

      {view === 'import' && (
        <COAImportTab orgId={currentOrgId} orgName={org?.name} history={coaImports} onImported={() => setView('imported')} />
      )}

      {selected && (
        <AccountDetailModal
          orgId={currentOrgId}
          account={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

// ─── ARBORESCENCE SYSCOHADA AVEC SECTIONS COLLAPSIBLES ──────────────
function SyscoTree({ items, mouvementes, activeClass, onSelect }: { items: SyscoAccount[]; mouvementes: Set<string>; activeClass: string; onSelect: (a: any) => void }) {
  const byClass = new Map<string, SyscoAccount[]>();
  for (const a of items) {
    if (!byClass.has(a.class)) byClass.set(a.class, []);
    byClass.get(a.class)!.push(a);
  }
  const classes = activeClass === 'all' ? Array.from(byClass.keys()).sort() : [activeClass].filter((c) => byClass.has(c));

  // Tous dépliés par défaut
  const [open, setOpen] = useState<Record<string, boolean>>(() => Object.fromEntries(classes.map((c) => [c, true])));
  useEffect(() => { setOpen((o) => ({ ...Object.fromEntries(classes.map((c) => [c, true])), ...o })); }, [classes.join(',')]);

  return (
    <div>
      <div className="flex justify-end gap-1 px-3 py-2 border-b border-primary-200 dark:border-primary-800 sticky top-0 bg-primary-100 dark:bg-primary-900 z-10">
        <button onClick={() => setOpen(Object.fromEntries(classes.map((c) => [c, true])))}
          className="text-[10px] text-primary-500 hover:text-primary-900 dark:hover:text-primary-100 px-2">Tout déplier</button>
        <span className="text-primary-300">·</span>
        <button onClick={() => setOpen({})}
          className="text-[10px] text-primary-500 hover:text-primary-900 dark:hover:text-primary-100 px-2">Tout replier</button>
      </div>

      {classes.map((c) => (
        <div key={c}>
          <button onClick={() => setOpen((o) => ({ ...o, [c]: !o[c] }))}
            className="w-full bg-primary-200 dark:bg-primary-800 px-4 py-2 border-y border-primary-300 dark:border-primary-700 flex items-center gap-2 hover:bg-primary-300 dark:hover:bg-primary-700 transition">
            {open[c] ? <ChevronDown className="w-3.5 h-3.5 text-primary-500" /> : <ChevronRight className="w-3.5 h-3.5 text-primary-500" />}
            <FolderTree className="w-4 h-4 text-primary-500" />
            <p className="text-xs font-bold uppercase tracking-wider">{CLASS_LABELS[c]}</p>
            <Badge>{byClass.get(c)?.length ?? 0}</Badge>
          </button>
          {open[c] && (
            <table className="w-full text-sm">
              <tbody className="divide-y divide-primary-200 dark:divide-primary-800">
                {byClass.get(c)!.map((a) => {
                  const isParent = !a.parent;
                  const used = mouvementes.has(a.code) || [...mouvementes].some((m) => m.startsWith(a.code));
                  return (
                    <tr key={a.code} onClick={() => onSelect({ code: a.code, label: a.label, type: a.type, class: a.class })}
                      className={clsx('hover:bg-primary-100 dark:hover:bg-primary-900 cursor-pointer',
                        isParent && 'bg-primary-100/30 dark:bg-primary-900/30 font-semibold')}>
                      <td className="py-1.5 px-3 num font-mono w-24" style={{ paddingLeft: a.parent ? '52px' : '24px' }}>{a.code}</td>
                      <td className="py-1.5 px-3">{a.label}</td>
                      <td className="py-1.5 px-3 w-20"><Badge>{TYPE_LABELS[a.type]}</Badge></td>
                      <td className="py-1.5 px-3 w-20">
                        {used && <Badge variant="info">Utilisé</Badge>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      ))}
      {items.length === 0 && (
        <div className="py-8 text-center text-primary-500 text-sm">Aucun compte ne correspond</div>
      )}
    </div>
  );
}

// ─── COMPTES IMPORTÉS — collapsible par classe ──────────────────────
function ImportedTree({ items, mouvementes, activeClass, onSelect }: { items: Account[]; mouvementes: Set<string>; activeClass: string; onSelect: (a: any) => void }) {
  const byClass = new Map<string, Account[]>();
  for (const a of items) {
    const k = a.class || a.code[0];
    if (!byClass.has(k)) byClass.set(k, []);
    byClass.get(k)!.push(a);
  }
  const classes = activeClass === 'all' ? Array.from(byClass.keys()).sort() : [activeClass].filter((c) => byClass.has(c));
  const [open, setOpen] = useState<Record<string, boolean>>(() => Object.fromEntries(classes.map((c) => [c, true])));
  useEffect(() => { setOpen((o) => ({ ...Object.fromEntries(classes.map((c) => [c, true])), ...o })); }, [classes.join(',')]);

  return (
    <div>
      <div className="flex justify-end gap-1 px-3 py-2 border-b border-primary-200 dark:border-primary-800 sticky top-0 bg-primary-100 dark:bg-primary-900 z-10">
        <button onClick={() => setOpen(Object.fromEntries(classes.map((c) => [c, true])))}
          className="text-[10px] text-primary-500 hover:text-primary-900 dark:hover:text-primary-100 px-2">Tout déplier</button>
        <span className="text-primary-300">·</span>
        <button onClick={() => setOpen({})}
          className="text-[10px] text-primary-500 hover:text-primary-900 dark:hover:text-primary-100 px-2">Tout replier</button>
      </div>
      {classes.map((c) => (
        <div key={c}>
          <button onClick={() => setOpen((o) => ({ ...o, [c]: !o[c] }))}
            className="w-full bg-primary-200 dark:bg-primary-800 px-4 py-2 border-y border-primary-300 dark:border-primary-700 flex items-center gap-2 hover:bg-primary-300 dark:hover:bg-primary-700 transition">
            {open[c] ? <ChevronDown className="w-3.5 h-3.5 text-primary-500" /> : <ChevronRight className="w-3.5 h-3.5 text-primary-500" />}
            <FolderTree className="w-4 h-4 text-primary-500" />
            <p className="text-xs font-bold uppercase tracking-wider">{CLASS_LABELS[c] ?? `Classe ${c}`}</p>
            <Badge>{byClass.get(c)?.length ?? 0}</Badge>
          </button>
          {open[c] && (
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase tracking-wider text-primary-500 border-b border-primary-200 dark:border-primary-800">
                <tr>
                  <th className="text-left py-1.5 px-3">Compte</th>
                  <th className="text-left py-1.5 px-3">Libellé</th>
                  <th className="text-left py-1.5 px-3 w-28">Mappé SYSCOHADA</th>
                  <th className="text-left py-1.5 px-3 w-24">Type</th>
                  <th className="text-left py-1.5 px-3 w-24">Mouvementé</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-primary-200 dark:divide-primary-800">
                {byClass.get(c)!.map((a) => (
                  <tr key={a.code} onClick={() => onSelect({ code: a.code, label: a.label, type: a.type, class: a.class })}
                    className="hover:bg-primary-100 dark:hover:bg-primary-900 cursor-pointer">
                    <td className="py-1.5 px-3 num font-mono font-semibold">{a.code}</td>
                    <td className="py-1.5 px-3 text-xs">{a.label}</td>
                    <td className="py-1.5 px-3 num text-xs">
                      {a.syscoCode
                        ? <Badge variant="success">{a.syscoCode}</Badge>
                        : <Badge variant="warning">Non mappé</Badge>}
                    </td>
                    <td className="py-1.5 px-3 text-xs">{TYPE_LABELS[a.type]}</td>
                    <td className="py-1.5 px-3 text-xs">
                      {mouvementes.has(a.code)
                        ? <Badge variant="info">Oui</Badge>
                        : <span className="text-primary-400">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}
      {items.length === 0 && (
        <div className="py-8 text-center text-primary-500 text-sm">Aucun compte importé pour cette société</div>
      )}
    </div>
  );
}

// ─── MODAL DÉTAIL D'UN COMPTE ────────────────────────────────────────
function AccountDetailModal({ orgId, account, onClose }: { orgId: string; account: { code: string; label: string; type?: string; class?: string }; onClose: () => void }) {
  const entries = useLiveQuery(async () => {
    if (!orgId) return [] as GLEntry[];
    return await db.gl.where('orgId').equals(orgId).filter((e) => e.account === account.code || e.account.startsWith(account.code)).toArray();
  }, [orgId, account.code], [] as GLEntry[]);

  // Édition du compte (uniquement pour les comptes société, pas SYSCOHADA)
  const [editing, setEditing] = useState(false);
  const [editLabel, setEditLabel] = useState(account.label);
  const [editType, setEditType] = useState(account.type ?? 'X');
  const isCompanyAccount = useLiveQuery(async () => {
    if (!orgId) return false;
    const found = await db.accounts.where({ orgId, code: account.code }).first();
    return !!found;
  }, [orgId, account.code], false);
  const saveEdit = async () => {
    const existing = await db.accounts.where({ orgId, code: account.code }).first();
    if (existing) await db.accounts.put({ ...existing, label: editLabel.trim() || existing.label, type: editType as Account['type'] });
    setEditing(false);
  };
  const deleteAccount = async () => {
    if (!confirm(`Supprimer le compte ${account.code} du Plan Comptable de l'entreprise ?\nLes écritures du Grand Livre ne sont PAS impactées.`)) return;
    await db.accounts.where({ orgId, code: account.code }).delete();
    onClose();
  };

  const sortedEntries = useMemo(() => [...entries].sort((a, b) => b.date.localeCompare(a.date)), [entries]);
  const totalDebit = entries.reduce((s, e) => s + e.debit, 0);
  const totalCredit = entries.reduce((s, e) => s + e.credit, 0);
  const solde = totalDebit - totalCredit;
  const sysco = findSyscoAccount(account.code);

  // Évolution mensuelle
  const monthly = useMemo(() => {
    const labels = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
    const data: number[] = Array(12).fill(0);
    for (const e of entries) {
      const m = parseInt(e.date.substring(5, 7));
      if (m >= 1 && m <= 12) {
        data[m - 1] += (e.debit - e.credit);
      }
    }
    const max = Math.max(...data.map(Math.abs), 1);
    return labels.map((l, i) => ({ label: l, value: data[i], pct: (Math.abs(data[i]) / max) * 100 }));
  }, [entries]);

  return (
    <Modal open onClose={onClose} size="xl"
      title={`Compte ${account.code} — ${account.label}`}
      subtitle={sysco ? `Mappé SYSCOHADA : ${sysco.code} · ${sysco.label}` : 'Non mappé au référentiel'}>
      <div className="space-y-5">
        {/* Barre d'actions Édition */}
        {isCompanyAccount && (
          <div className="flex items-center justify-between p-3 bg-primary-100 dark:bg-primary-900 rounded-lg border border-primary-200 dark:border-primary-800">
            {editing ? (
              <div className="flex-1 flex gap-2 items-end">
                <div className="flex-1">
                  <label className="text-[10px] uppercase text-primary-500 block">Libellé</label>
                  <input className="input !py-1.5 text-sm" value={editLabel} onChange={(e) => setEditLabel(e.target.value)} />
                </div>
                <div className="w-32">
                  <label className="text-[10px] uppercase text-primary-500 block">Type</label>
                  <select className="input !py-1.5 text-sm" value={editType} onChange={(e) => setEditType(e.target.value)}>
                    {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <button className="btn-primary !py-1.5" onClick={saveEdit}>Enregistrer</button>
                <button className="btn-outline !py-1.5" onClick={() => { setEditing(false); setEditLabel(account.label); setEditType(account.type ?? 'X'); }}>Annuler</button>
              </div>
            ) : (
              <>
                <p className="text-xs text-primary-500">Compte du plan entreprise — vous pouvez modifier son libellé ou le supprimer.</p>
                <div className="flex gap-2">
                  <button className="btn-outline !py-1.5 text-xs" onClick={() => setEditing(true)}>Modifier</button>
                  <button className="btn-outline !py-1.5 text-xs text-error" onClick={deleteAccount}>Supprimer</button>
                </div>
              </>
            )}
          </div>
        )}
        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Nb écritures" value={entries.length.toLocaleString('fr-FR')} />
          <Stat label="Total Débit" value={fmtFull(totalDebit)} />
          <Stat label="Total Crédit" value={fmtFull(totalCredit)} />
          <Stat label="Solde" value={fmtFull(Math.abs(solde))} sub={solde >= 0 ? 'Débiteur' : 'Créditeur'} />
        </div>

        {/* Métadonnées */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <Meta label="Code">{account.code}</Meta>
          <Meta label="Classe">{account.class ?? account.code[0]}</Meta>
          <Meta label="Type">{TYPE_LABELS[account.type ?? 'X']}</Meta>
          <Meta label="Mapping SYSCOHADA">{sysco ? `${sysco.code} — ${sysco.label}` : 'Non mappé'}</Meta>
        </div>

        {/* Évolution mensuelle (mini bars) */}
        {entries.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-primary-500 uppercase tracking-wider mb-2">Évolution mensuelle (D − C)</p>
            <div className="grid grid-cols-12 gap-1 h-24 items-end">
              {monthly.map((m, i) => (
                <div key={i} className="flex flex-col items-center gap-1 group">
                  <span className="text-[9px] num text-primary-500 opacity-0 group-hover:opacity-100">{fmtFull(m.value)}</span>
                  <div className="w-full bg-primary-900 dark:bg-primary-100 rounded-t" style={{ height: `${Math.max(m.pct, 2)}%` }} />
                  <span className="text-[9px] text-primary-500">{m.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Mouvements */}
        <div>
          <p className="text-xs font-semibold text-primary-500 uppercase tracking-wider mb-2">
            Derniers mouvements ({sortedEntries.length})
          </p>
          {sortedEntries.length === 0 ? (
            <p className="text-sm text-primary-500 text-center py-8">Aucune écriture sur ce compte</p>
          ) : (
            <div className="max-h-80 overflow-y-auto border border-primary-200 dark:border-primary-800 rounded">
              <table className="w-full text-xs">
                <thead className="bg-primary-100 dark:bg-primary-900 sticky top-0">
                  <tr className="text-[10px] uppercase tracking-wider text-primary-500">
                    <th className="text-left py-2 px-3">Date</th>
                    <th className="text-left py-2 px-3">Journal</th>
                    <th className="text-left py-2 px-3">Pièce</th>
                    <th className="text-left py-2 px-3">Libellé</th>
                    <th className="text-left py-2 px-3">Tiers</th>
                    <th className="text-right py-2 px-3">Débit</th>
                    <th className="text-right py-2 px-3">Crédit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-primary-100 dark:divide-primary-800">
                  {sortedEntries.slice(0, 200).map((e, i) => (
                    <tr key={i} className="hover:bg-primary-100/50 dark:hover:bg-primary-900/50">
                      <td className="py-1 px-3 num text-[11px]">{e.date}</td>
                      <td className="py-1 px-3"><Badge>{e.journal}</Badge></td>
                      <td className="py-1 px-3 num font-mono text-[10px]">{e.piece}</td>
                      <td className="py-1 px-3">{e.label}</td>
                      <td className="py-1 px-3 num font-mono text-[10px] text-primary-500">{e.tiers ?? '—'}</td>
                      <td className="py-1 px-3 text-right num">{e.debit ? fmtFull(e.debit) : ''}</td>
                      <td className="py-1 px-3 text-right num">{e.credit ? fmtFull(e.credit) : ''}</td>
                    </tr>
                  ))}
                </tbody>
                {entries.length > 0 && (
                  <tfoot className="border-t-2 border-primary-300 dark:border-primary-700 bg-primary-100 dark:bg-primary-900 sticky bottom-0">
                    <tr className="font-bold">
                      <td colSpan={5} className="py-2 px-3">TOTAUX</td>
                      <td className="py-2 px-3 text-right num">{fmtFull(totalDebit)}</td>
                      <td className="py-2 px-3 text-right num">{fmtFull(totalCredit)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
          {sortedEntries.length > 200 && (
            <p className="text-[10px] text-primary-400 italic mt-2">… {sortedEntries.length - 200} écritures supplémentaires non affichées</p>
          )}
        </div>
      </div>
    </Modal>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card p-3">
      <p className="text-[10px] uppercase tracking-wider text-primary-500 font-semibold">{label}</p>
      <p className="num text-lg font-bold mt-0.5">{value}</p>
      {sub && <p className="text-[10px] text-primary-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-primary-500 font-semibold mb-0.5">{label}</p>
      <p>{children}</p>
    </div>
  );
}

// ─── ONGLET IMPORT + HISTORIQUE (VERSIONNING) ──────────────────────
function COAImportTab({
  orgId, orgName, history, onImported,
}: {
  orgId: string; orgName?: string; history: ImportLog[]; onImported: () => void;
}) {
  const deleteImport = async (imp: ImportLog) => {
    if (!imp.id) return;
    if (!confirm("Supprimer cet import de l'historique ? (les comptes ne sont pas supprimés)")) return;
    await db.imports.delete(imp.id);
  };

  return (
    <div className="space-y-6">
      <Card title="Import du plan comptable"
        subtitle="CSV · XLSX — une ligne = un compte. Détection automatique des colonnes Code, Libellé, Classe, Type.">
        <div className="flex items-center gap-3 flex-wrap">
          <button className="btn-outline" onClick={() => downloadCOATemplate(orgName)}>
            <FileSpreadsheet className="w-4 h-4" /> Télécharger le modèle Excel
          </button>
          <label className="btn-primary cursor-pointer">
            <Download className="w-4 h-4 rotate-180" /> Importer un fichier
            <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                const res = await importCOAv2(f, orgId);
                if (res.imported > 0) {
                  toast.success('Import terminé', `${res.imported} comptes · ${res.updated} mis à jour`);
                  onImported();
                  window.location.reload();
                } else {
                  const reason = res.errors.length ? res.errors.join(' ') : 'Aucune ligne valide trouvée dans le fichier';
                  toast.error("Import impossible", reason);
                  console.error('[Import COA] Échec :\n' + (res.errors.join('\n') || '(aucune erreur explicite)'));
                }
              } catch (err: any) {
                toast.error("Erreur d'import", err.message);
              }
              e.target.value = '';
            }} />
          </label>
          <p className="text-xs text-primary-500">
            Code compte obligatoire (numérique) · Libellé obligatoire · Mapping SYSCOHADA auto par préfixe · Les comptes existants sont mis à jour
          </p>
        </div>
      </Card>

      <Card title="Historique des imports du plan comptable" subtitle="Versionning — chaque import écrase / met à jour les comptes existants">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wider text-primary-500 border-b border-primary-200 dark:border-primary-800">
              <tr>
                <th className="text-left py-2 px-3">Date</th>
                <th className="text-left py-2 px-3">Utilisateur</th>
                <th className="text-left py-2 px-3">Fichier</th>
                <th className="text-left py-2 px-3">Source</th>
                <th className="text-right py-2 px-3">Comptes</th>
                <th className="text-right py-2 px-3">Rejetés</th>
                <th className="text-left py-2 px-3">Statut</th>
                <th className="text-center py-2 px-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-primary-200 dark:divide-primary-800">
              {history.length === 0 && (
                <tr><td colSpan={8} className="py-6 text-center text-primary-500 text-xs">Aucun import</td></tr>
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
                    <button className="btn-ghost !p-1.5 text-primary-500 hover:text-error hover:bg-error/10"
                      onClick={() => deleteImport(i)}
                      title="Supprimer de l'historique">
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
