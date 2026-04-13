import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronDown, ChevronRight, Download, FileSpreadsheet, FolderTree, Search } from 'lucide-react';
import { downloadCOATemplate } from '../engine/templates';
import { useCurrentOrg } from '../hooks/useFinancials';
import clsx from 'clsx';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { SYSCOHADA_COA, SyscoAccount, findSyscoAccount } from '../syscohada/coa';
import { db, Account, GLEntry } from '../db/schema';
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
  const [view, setView] = useState<'sysco' | 'imported'>('sysco');
  const [selected, setSelected] = useState<{ code: string; label: string; type?: string; class?: string } | null>(null);

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
        title="Plan comptable"
        subtitle="SYSCOHADA révisé 2017 — classes 1 à 8 + comptes mappés de la société"
        action={
          <div className="flex gap-2">
            <button className="btn-outline" onClick={() => downloadCOATemplate(org?.name)}>
              <FileSpreadsheet className="w-4 h-4" /> Modèle Excel
            </button>
            <button className="btn-outline" onClick={exportCSV}>
              <Download className="w-4 h-4" /> Exporter CSV
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
        <button onClick={() => setView('sysco')}
          className={clsx('px-4 py-2.5 text-sm font-medium border-b-2 -mb-px',
            view === 'sysco' ? 'border-primary-900 dark:border-primary-100' : 'border-transparent text-primary-500')}>
          Référentiel SYSCOHADA <Badge>{SYSCOHADA_COA.length}</Badge>
        </button>
        <button onClick={() => setView('imported')}
          className={clsx('px-4 py-2.5 text-sm font-medium border-b-2 -mb-px',
            view === 'imported' ? 'border-primary-900 dark:border-primary-100' : 'border-transparent text-primary-500')}>
          Comptes de la société <Badge>{accounts.length}</Badge>
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
          <div className="max-h-[70vh] overflow-y-auto">
            <ImportedTree items={filteredImported} mouvementes={mouvementes} activeClass={activeClass} onSelect={(a) => setSelected(a)} />
          </div>
        </Card>
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
