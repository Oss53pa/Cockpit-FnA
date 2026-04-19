import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import clsx from 'clsx';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { TabSwitch } from '../components/ui/TabSwitch';
import { VirtualTable, type Column } from '../components/ui/VirtualTable';
import { useApp } from '../store/app';
import { db, type GLEntry, type ImportLog } from '../db/schema';
import { computeBalance, computeAuxBalance, type BalanceRow, type AuxBalanceRow } from '../engine/balance';
import { agedBalance, type AgedTier } from '../engine/analytics';
import { fmtFull } from '../lib/format';
import Imports from './Imports';

type Tab = 'import' | 'gl' | 'bg' | 'baC' | 'baF' | 'ageeC' | 'ageeF';

const TABS: { key: Tab; label: string }[] = [
  { key: 'import', label: 'Import' },
  { key: 'gl',     label: 'Grand Livre' },
  { key: 'bg',     label: 'Balance générale' },
  { key: 'baC',    label: 'Bal. aux. Clients' },
  { key: 'baF',    label: 'Bal. aux. Fournisseurs' },
  { key: 'ageeC',  label: 'Bal. âgée Clients' },
  { key: 'ageeF',  label: 'Bal. âgée Fournisseurs' },
];

// ─── Page racine ──────────────────────────────────────────────────
export default function GrandLivre() {
  const { currentOrgId, currentYear } = useApp();
  const [tab, setTab] = useState<Tab>('import');
  const [importId, setImportId] = useState<string>('all');

  const imports = useLiveQuery(async () => {
    if (!currentOrgId) return [] as ImportLog[];
    const list = await db.imports.where('orgId').equals(currentOrgId).toArray();
    return list.filter((i) => i.kind === 'GL').sort((a, b) => b.date - a.date);
  }, [currentOrgId], [] as ImportLog[]);

  const showVersionPicker = tab !== 'import' && imports.length > 0;

  return (
    <div>
      <PageHeader
        title="Grand Livre"
        subtitle="Source unique : le Grand Livre — toutes les balances en sont calculées automatiquement"
        action={showVersionPicker && (
          <div className="flex items-center gap-2">
            <label className="text-xs text-primary-500 font-semibold">Version :</label>
            <select className="input !w-auto !py-1.5 text-xs" value={importId} onChange={(e) => setImportId(e.target.value)}>
              <option value="all">Toutes les versions ({imports.reduce((s, i) => s + i.count, 0).toLocaleString('fr-FR')} écr.)</option>
              {imports.map((i) => (
                <option key={i.id} value={String(i.id)}>
                  {new Date(i.date).toLocaleDateString('fr-FR')} · {i.fileName} · {i.count.toLocaleString('fr-FR')} écr.
                </option>
              ))}
            </select>
          </div>
        )}
      />

      <TabSwitch tabs={TABS} value={tab} onChange={setTab} />

      {tab !== 'import' && imports.length === 0 && (
        <Card>
          <p className="text-sm text-primary-500 text-center py-6">
            Aucun Grand Livre importé — bascule sur l'onglet <strong>Import</strong> pour charger un fichier.
          </p>
        </Card>
      )}

      {tab === 'import' && <Imports />}
      {tab === 'gl'     && imports.length > 0 && <GLView      orgId={currentOrgId} year={currentYear} importId={importId} />}
      {tab === 'bg'     && imports.length > 0 && <BGView      orgId={currentOrgId} year={currentYear} importId={importId} />}
      {tab === 'baC'    && imports.length > 0 && <AuxView     orgId={currentOrgId} year={currentYear} importId={importId} kind="client" />}
      {tab === 'baF'    && imports.length > 0 && <AuxView     orgId={currentOrgId} year={currentYear} importId={importId} kind="fournisseur" />}
      {tab === 'ageeC'  && imports.length > 0 && <AgedView    orgId={currentOrgId} year={currentYear} importId={importId} kind="client" />}
      {tab === 'ageeF'  && imports.length > 0 && <AgedView    orgId={currentOrgId} year={currentYear} importId={importId} kind="fournisseur" />}
    </div>
  );
}

// ─── 1. GRAND LIVRE — table avec SOLDE PROGRESSIF ─────────────────
type GLRow = GLEntry & { soldeProgressif: number; solde: number };

const glColumns: Column<GLRow>[] = [
  { header: 'Compte',          width: '110px', cell: (e) => <span className="num font-mono">{e.account}</span> },
  { header: 'Libellé',         width: '180px', cell: (e) => <span className="text-xs truncate">{e.label}</span> },
  { header: 'Date',            width: '100px', cell: (e) => <span className="num text-xs">{e.date}</span> },
  { header: 'Journal',         width: '70px',  cell: (e) => <span className="text-xs font-mono">{e.journal}</span> },
  { header: 'N° saisi',        width: '100px', cell: (e) => <span className="text-xs font-mono">{e.piece}</span> },
  { header: 'Description',     width: '1fr',   cell: (e) => <span className="text-xs truncate">{e.label}</span> },
  { header: 'Tiers',           width: '110px', cell: (e) => <span className="text-xs font-mono">{e.tiers ?? ''}</span> },
  { header: 'Code analytique', width: '120px', cell: (e) => <span className="text-xs font-mono">{e.analyticalAxis ?? e.analyticalSection ?? ''}</span> },
  { header: 'Lettrage',        width: '70px',  cell: (e) => <span className="text-xs font-mono">{e.lettrage ?? ''}</span> },
  { header: 'Débit',           width: '110px', align: 'right', cell: (e) => <span className="num">{e.debit > 0 ? fmtFull(e.debit) : <span className="text-primary-400">—</span>}</span> },
  { header: 'Crédit',          width: '110px', align: 'right', cell: (e) => <span className="num">{e.credit > 0 ? fmtFull(e.credit) : <span className="text-primary-400">—</span>}</span> },
  { header: 'Solde progressif',width: '130px', align: 'right', cell: (e) => <span className={clsx('num', e.soldeProgressif < 0 ? 'text-error' : '')}>{fmtFull(e.soldeProgressif)}</span> },
  { header: 'Solde',           width: '110px', align: 'right', cell: (e) => <span className={clsx('num', e.solde < 0 ? 'text-error' : '')}>{fmtFull(e.solde)}</span> },
];

function GLView({ orgId, year, importId }: { orgId: string; year: number; importId: string }) {
  const [search, setSearch] = useState('');
  const [journal, setJournal] = useState('all');
  const [accountPrefix, setAccountPrefix] = useState('');

  const periodIds = useLiveQuery(async () => {
    if (!orgId) return new Set<string>();
    const periods = await db.periods.where('orgId').equals(orgId).filter((p) => p.year === year).toArray();
    return new Set(periods.map((p) => p.id));
  }, [orgId, year], new Set<string>());

  const entries = useLiveQuery(async () => {
    if (!orgId) return [] as GLEntry[];
    return db.gl.where('orgId').equals(orgId).toArray();
  }, [orgId], [] as GLEntry[]);

  const journals = useMemo(() => Array.from(new Set(entries.map((e) => e.journal))).sort(), [entries]);

  // Filtre + tri + calcul SOLDE PROGRESSIF par compte
  const rows: GLRow[] = useMemo(() => {
    const filtered = entries
      .filter((e) => periodIds.has(e.periodId))
      .filter((e) => importId === 'all' || e.importId === importId)
      .filter((e) => journal === 'all' || e.journal === journal)
      .filter((e) => !accountPrefix || e.account.startsWith(accountPrefix))
      .filter((e) => {
        if (!search) return true;
        const q = search.toLowerCase();
        return e.label.toLowerCase().includes(q) || e.account.includes(search) || (e.piece || '').toLowerCase().includes(q) || (e.tiers || '').toLowerCase().includes(q);
      });
    // Tri compte → date pour calcul du progressif
    const sorted = [...filtered].sort((a, b) => a.account.localeCompare(b.account) || a.date.localeCompare(b.date));
    const running = new Map<string, number>();
    return sorted.map((e) => {
      const cur = (running.get(e.account) ?? 0) + e.debit - e.credit;
      running.set(e.account, cur);
      return { ...e, soldeProgressif: cur, solde: e.debit - e.credit };
    });
  }, [entries, periodIds, importId, journal, accountPrefix, search]);

  const totD = rows.reduce((s, e) => s + e.debit, 0);
  const totC = rows.reduce((s, e) => s + e.credit, 0);
  const balanced = Math.abs(totD - totC) < 1;

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap gap-2 items-end">
          <input className="input !py-1.5 max-w-sm" placeholder="Rechercher libellé / compte / pièce / tiers…"
            value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className="input !w-auto !py-1.5" value={journal} onChange={(e) => setJournal(e.target.value)}>
            <option value="all">Tous journaux</option>
            {journals.map((j) => <option key={j} value={j}>{j}</option>)}
          </select>
          <input className="input !w-32 !py-1.5 num font-mono" placeholder="Compte…"
            value={accountPrefix} onChange={(e) => setAccountPrefix(e.target.value)} />
          <span className="ml-auto text-xs text-primary-500">
            <span className="num font-semibold">{rows.length}</span> écriture(s) sur <span className="num">{entries.length}</span>
          </span>
          <EquilibreBadge balanced={balanced} delta={totD - totC} />
        </div>
      </Card>

      <Card padded={false}>
        <VirtualTable
          rows={rows} rowKey={(_, i) => i} rowHeight={28} height={620}
          empty="Aucune écriture pour ces filtres" columns={glColumns}
          footer={<>
            <div className="py-2 px-3 col-span-9">TOTAUX</div>
            <div className="py-2 px-3 text-right num">{fmtFull(totD)}</div>
            <div className="py-2 px-3 text-right num">{fmtFull(totC)}</div>
            <div className="py-2 px-3 text-right num"></div>
            <div className="py-2 px-3 text-right num">{fmtFull(totD - totC)}</div>
          </>}
        />
      </Card>
    </div>
  );
}

// ─── 2. BALANCE GÉNÉRALE (avec regroupement par classe collapsible) ──
const CLASS_LABELS: Record<string, string> = {
  '1': 'Classe 1 — Ressources durables',
  '2': 'Classe 2 — Actif immobilisé',
  '3': 'Classe 3 — Stocks',
  '4': 'Classe 4 — Tiers',
  '5': 'Classe 5 — Trésorerie',
  '6': 'Classe 6 — Charges',
  '7': 'Classe 7 — Produits',
  '8': 'Classe 8 — Autres',
};

function BGView({ orgId, year, importId }: { orgId: string; year: number; importId: string }) {
  const [classFilter, setClassFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<BalanceRow[]>([]);
  const [diagEntries, setDiagEntries] = useState<GLEntry[]>([]);
  const [diagOpen, setDiagOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ '1': true, '2': true, '3': true, '4': true, '5': true, '6': true, '7': true, '8': true });
  useEffect(() => { if (orgId) computeBalance({ orgId, year, importId }).then(setRows); }, [orgId, year, importId]);

  // Charge les écritures pour le diagnostic (pièces déséquilibrées)
  useEffect(() => {
    if (!orgId) return;
    (async () => {
      const periods = await db.periods.where('orgId').equals(orgId).toArray();
      const periodIds = new Set(periods.filter((p) => p.year === year).map((p) => p.id));
      const all = await db.gl.where('orgId').equals(orgId).toArray();
      const filtered = all.filter((e) => periodIds.has(e.periodId) && (!importId || importId === 'all' || e.importId === importId));
      setDiagEntries(filtered);
    })();
  }, [orgId, year, importId]);

  const filtered = rows
    .filter((r) => classFilter === 'all' || r.account[0] === classFilter)
    .filter((r) => !search || r.account.includes(search) || r.label.toLowerCase().includes(search.toLowerCase()));
  const totD = filtered.reduce((s, r) => s + r.debit, 0);
  const totC = filtered.reduce((s, r) => s + r.credit, 0);
  const totSD = filtered.reduce((s, r) => s + r.soldeD, 0);
  const totSC = filtered.reduce((s, r) => s + r.soldeC, 0);

  // Groupement par classe
  const byClass = new Map<string, BalanceRow[]>();
  filtered.forEach((r) => {
    const k = r.account[0];
    if (!byClass.has(k)) byClass.set(k, []);
    byClass.get(k)!.push(r);
  });
  const classes = Array.from(byClass.keys()).sort();

  const expandAll = () => setExpanded(Object.fromEntries(classes.map((c) => [c, true])));
  const collapseAll = () => setExpanded({});

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex gap-2 items-center flex-wrap">
          <input className="input !py-1.5 max-w-xs" placeholder="Compte / libellé…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className="input !w-auto !py-1.5" value={classFilter} onChange={(e) => setClassFilter(e.target.value)}>
            <option value="all">Toutes classes</option>
            {['1','2','3','4','5','6','7','8'].map((c) => <option key={c} value={c}>Classe {c}</option>)}
          </select>
          <button onClick={expandAll} className="text-[11px] text-primary-500 hover:text-primary-900 px-2">Tout déplier</button>
          <span className="text-primary-300">·</span>
          <button onClick={collapseAll} className="text-[11px] text-primary-500 hover:text-primary-900 px-2">Tout replier</button>
          <span className="ml-auto text-xs text-primary-500"><span className="num font-semibold">{filtered.length}</span> compte(s) sur <span className="num">{rows.length}</span></span>
          <EquilibreBadge
            balanced={Math.abs(totD - totC) < 1}
            delta={totD - totC}
            onOpen={() => setDiagOpen(true)}
          />
        </div>
      </Card>
      <DiscrepancyModal open={diagOpen} onClose={() => setDiagOpen(false)} rows={rows} entries={diagEntries} />

      <Card padded={false}>
        <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wider text-primary-500 border-b-2 border-primary-300 dark:border-primary-700 sticky top-0 bg-primary-100 dark:bg-primary-900 z-10">
              <tr>
                <th className="text-left py-2 w-8"></th>
                <th className="text-left py-2 px-3">Compte</th>
                <th className="text-left py-2 px-3">Libellé</th>
                <th className="text-right py-2 px-3">Débit</th>
                <th className="text-right py-2 px-3">Crédit</th>
                <th className="text-right py-2 px-3">Solde D</th>
                <th className="text-right py-2 px-3">Solde C</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-primary-200 dark:divide-primary-800">
              {classes.map((c) => {
                const cRows = byClass.get(c) ?? [];
                const cD = cRows.reduce((s, r) => s + r.debit, 0);
                const cC = cRows.reduce((s, r) => s + r.credit, 0);
                const cSD = cRows.reduce((s, r) => s + r.soldeD, 0);
                const cSC = cRows.reduce((s, r) => s + r.soldeC, 0);
                const isOpen = expanded[c];
                return [
                  <tr key={`h-${c}`} className="bg-primary-200 dark:bg-primary-800 font-semibold">
                    <td className="py-2 pl-2 w-8 text-center">
                      <button onClick={() => setExpanded((e) => ({ ...e, [c]: !e[c] }))} className="w-5 h-5 rounded hover:bg-primary-300 dark:hover:bg-primary-700 text-xs font-bold">
                        {isOpen ? '−' : '+'}
                      </button>
                    </td>
                    <td className="py-2 px-3 num font-mono">Cl. {c}</td>
                    <td className="py-2 px-3">{CLASS_LABELS[c] ?? `Classe ${c}`} <span className="text-[10px] text-primary-500 font-normal">({cRows.length} comptes)</span></td>
                    <td className="py-2 px-3 text-right num">{fmtFull(cD)}</td>
                    <td className="py-2 px-3 text-right num">{fmtFull(cC)}</td>
                    <td className="py-2 px-3 text-right num">{fmtFull(cSD)}</td>
                    <td className="py-2 px-3 text-right num">{fmtFull(cSC)}</td>
                  </tr>,
                  ...(isOpen ? cRows.map((r) => (
                    <tr key={r.account} className="hover:bg-primary-100/50 dark:hover:bg-primary-900/50">
                      <td></td>
                      <td className="py-1.5 px-3 num font-mono text-xs">{r.account}</td>
                      <td className="py-1.5 px-3 text-xs">{r.label}</td>
                      <td className="py-1.5 px-3 text-right num text-xs">{fmtFull(r.debit)}</td>
                      <td className="py-1.5 px-3 text-right num text-xs">{fmtFull(r.credit)}</td>
                      <td className="py-1.5 px-3 text-right num text-xs">{r.soldeD ? fmtFull(r.soldeD) : ''}</td>
                      <td className="py-1.5 px-3 text-right num text-xs">{r.soldeC ? fmtFull(r.soldeC) : ''}</td>
                    </tr>
                  )) : []),
                ];
              })}
            </tbody>
            <tfoot className="border-t-2 border-primary-300 dark:border-primary-700 bg-primary-100 dark:bg-primary-900 sticky bottom-0">
              <tr className="font-bold">
                <td></td>
                <td colSpan={2} className="py-2 px-3">TOTAUX</td>
                <td className="py-2 px-3 text-right num">{fmtFull(totD)}</td>
                <td className="py-2 px-3 text-right num">{fmtFull(totC)}</td>
                <td className="py-2 px-3 text-right num">{fmtFull(totSD)}</td>
                <td className="py-2 px-3 text-right num">{fmtFull(totSC)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ─── 3. BALANCE AUXILIAIRE (Clients ou Fournisseurs) ──────────────
const auxColumns: Column<AuxBalanceRow>[] = [
  { header: 'Tiers',   width: '140px', cell: (r) => <span className="num font-mono">{r.tier}</span> },
  { header: 'Libellé', width: '1fr',   cell: (r) => <span className="text-xs">{r.label}</span> },
  { header: 'Compte',  width: '110px', cell: (r) => <span className="num font-mono text-xs text-primary-500">{r.account}</span> },
  { header: 'Débit',   width: '150px', align: 'right', cell: (r) => <span className="num">{r.debit > 0 ? fmtFull(r.debit) : ''}</span> },
  { header: 'Crédit',  width: '150px', align: 'right', cell: (r) => <span className="num">{r.credit > 0 ? fmtFull(r.credit) : ''}</span> },
  { header: 'Solde',   width: '150px', align: 'right', cell: (r) => <span className={clsx('num font-semibold', r.solde < 0 ? 'text-error' : 'text-success')}>{fmtFull(r.solde)}</span> },
];

function AuxView({ orgId, year, importId, kind }: { orgId: string; year: number; importId: string; kind: 'client' | 'fournisseur' }) {
  const [rows, setRows] = useState<AuxBalanceRow[]>([]);
  const [search, setSearch] = useState('');
  useEffect(() => { if (orgId) computeAuxBalance({ orgId, year, kind, importId }).then(setRows); }, [orgId, year, kind, importId]);

  const filtered = rows.filter((r) => !search || r.tier.toLowerCase().includes(search.toLowerCase()) || r.label.toLowerCase().includes(search.toLowerCase()) || r.account.includes(search));
  const totD = filtered.reduce((s, r) => s + r.debit, 0);
  const totC = filtered.reduce((s, r) => s + r.credit, 0);
  const totS = filtered.reduce((s, r) => s + r.solde, 0);
  const balanced = Math.abs(totD - totC - totS) < 1;

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex gap-2 items-center">
          <input className="input !py-1.5 max-w-xs" placeholder={`Tiers / libellé ${kind === 'client' ? 'client' : 'fournisseur'}…`}
            value={search} onChange={(e) => setSearch(e.target.value)} />
          <span className="ml-auto text-xs text-primary-500">
            <span className="num font-semibold">{filtered.length}</span> tiers sur <span className="num">{rows.length}</span>
          </span>
          <EquilibreBadge balanced={balanced} delta={totD - totC} />
        </div>
      </Card>
      <Card padded={false}>
        <VirtualTable
          rows={filtered} rowKey={(r) => r.tier} rowHeight={30} height={560}
          empty={`Aucun tiers ${kind} avec un solde non nul — vérifie que des écritures ${kind === 'client' ? '411' : '401'} existent.`}
          columns={auxColumns}
          footer={<>
            <div className="py-2 px-3 col-span-3">TOTAUX</div>
            <div className="py-2 px-3 text-right num">{fmtFull(totD)}</div>
            <div className="py-2 px-3 text-right num">{fmtFull(totC)}</div>
            <div className="py-2 px-3 text-right num">{fmtFull(totS)}</div>
          </>}
        />
      </Card>
    </div>
  );
}

// ─── Badge équilibre — réutilisé partout ─────────────────────────
function EquilibreBadge({ balanced, delta, onOpen }: { balanced: boolean; delta: number; onOpen?: () => void }) {
  if (balanced) {
    return <span className="text-xs font-semibold text-success bg-success/10 px-2 py-1 rounded-full">✓ Équilibré</span>;
  }
  if (!onOpen) {
    return <span className="text-xs font-semibold text-error bg-error/10 px-2 py-1 rounded-full">⚠ Écart : {fmtFull(delta)}</span>;
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      className="text-xs font-semibold text-error bg-error/10 hover:bg-error/20 px-2 py-1 rounded-full transition cursor-pointer"
      title="Cliquer pour voir les comptes & pièces à l'origine de l'écart"
    >
      ⚠ Écart : {fmtFull(delta)} — diagnostiquer
    </button>
  );
}

// ─── Modale : comptes et pièces contribuant à l'écart ────────────
function DiscrepancyModal({ open, onClose, rows, entries }: {
  open: boolean;
  onClose: () => void;
  rows: BalanceRow[];
  entries: GLEntry[];
}) {
  if (!open) return null;

  // Top 20 comptes contribuant à l'écart (net D-C)
  const topContrib = [...rows]
    .map((r) => ({ account: r.account, label: r.label, debit: r.debit, credit: r.credit, delta: r.debit - r.credit }))
    .filter((r) => Math.abs(r.delta) > 0.5)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 50);

  // Pièces déséquilibrées (journal + piece doit avoir D = C)
  const pieceMap = new Map<string, { journal: string; piece: string; debit: number; credit: number; accounts: Set<string>; count: number; dates: Set<string> }>();
  for (const e of entries) {
    const key = `${e.journal}||${e.piece}`;
    let p = pieceMap.get(key);
    if (!p) {
      p = { journal: e.journal, piece: e.piece, debit: 0, credit: 0, accounts: new Set(), count: 0, dates: new Set() };
      pieceMap.set(key, p);
    }
    p.debit += e.debit;
    p.credit += e.credit;
    p.accounts.add(e.account);
    p.dates.add(e.date);
    p.count++;
  }
  const unbalanced = Array.from(pieceMap.values())
    .map((p) => ({ ...p, gap: p.debit - p.credit }))
    .filter((p) => Math.abs(p.gap) > 0.5)
    .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap))
    .slice(0, 30);
  const totalPiecesUnbalanced = Array.from(pieceMap.values()).filter((p) => Math.abs(p.debit - p.credit) > 0.5).length;

  const totalDelta = rows.reduce((s, r) => s + r.debit - r.credit, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-primary-950/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-5xl bg-primary-50 dark:bg-primary-900 rounded-xl border border-primary-200 dark:border-primary-800 shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-start justify-between px-5 py-4 border-b border-primary-200 dark:border-primary-800">
          <div>
            <h3 className="font-semibold text-primary-900 dark:text-primary-100">Diagnostic de l'écart de balance</h3>
            <p className="text-xs text-primary-500 mt-0.5">Écart total Débit − Crédit&nbsp;: <span className="font-semibold text-error num">{fmtFull(totalDelta)}</span> · {totalPiecesUnbalanced} pièce(s) déséquilibrée(s)</p>
          </div>
          <button onClick={onClose} className="btn-ghost !p-1.5">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          <div>
            <h4 className="text-xs uppercase tracking-wider font-semibold text-primary-500 mb-2">Top comptes avec écart D − C ≠ 0</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-[10px] uppercase tracking-wider text-primary-500 border-b border-primary-300 dark:border-primary-700">
                  <tr>
                    <th className="text-left py-1.5 px-2">Compte</th>
                    <th className="text-left py-1.5 px-2">Libellé</th>
                    <th className="text-right py-1.5 px-2">Débit</th>
                    <th className="text-right py-1.5 px-2">Crédit</th>
                    <th className="text-right py-1.5 px-2">Δ (D − C)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-primary-100 dark:divide-primary-800">
                  {topContrib.map((r) => (
                    <tr key={r.account} className="hover:bg-primary-100/50 dark:hover:bg-primary-900/50">
                      <td className="py-1 px-2 num font-mono">{r.account}</td>
                      <td className="py-1 px-2">{r.label}</td>
                      <td className="py-1 px-2 text-right num">{fmtFull(r.debit)}</td>
                      <td className="py-1 px-2 text-right num">{fmtFull(r.credit)}</td>
                      <td className={clsx('py-1 px-2 text-right num font-semibold', r.delta > 0 ? 'text-primary-700 dark:text-primary-200' : 'text-error')}>{fmtFull(r.delta)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[10px] text-primary-400 mt-2">
              En comptabilité équilibrée, chaque compte peut avoir un solde (D − C), mais la <strong>somme globale</strong> doit être zéro. Si ce n'est pas le cas, ce sont souvent des pièces déséquilibrées à l'import (ci-dessous).
            </p>
          </div>

          <div>
            <h4 className="text-xs uppercase tracking-wider font-semibold text-primary-500 mb-2">Pièces déséquilibrées (journal + n° pièce)</h4>
            {unbalanced.length === 0 ? (
              <p className="text-xs text-primary-500 py-4">Aucune pièce déséquilibrée détectée — l'écart provient uniquement des soldes d'ouverture / comptes non-balancés individuellement.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-[10px] uppercase tracking-wider text-primary-500 border-b border-primary-300 dark:border-primary-700">
                    <tr>
                      <th className="text-left py-1.5 px-2">Journal</th>
                      <th className="text-left py-1.5 px-2">Pièce</th>
                      <th className="text-left py-1.5 px-2">Dates</th>
                      <th className="text-right py-1.5 px-2">Nb lignes</th>
                      <th className="text-right py-1.5 px-2">Débit</th>
                      <th className="text-right py-1.5 px-2">Crédit</th>
                      <th className="text-right py-1.5 px-2">Écart</th>
                      <th className="text-left py-1.5 px-2">Comptes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-primary-100 dark:divide-primary-800">
                    {unbalanced.map((p, i) => (
                      <tr key={i} className="hover:bg-primary-100/50 dark:hover:bg-primary-900/50">
                        <td className="py-1 px-2"><span className="inline-block bg-primary-200 dark:bg-primary-800 rounded px-1.5 py-0.5 font-mono text-[10px]">{p.journal}</span></td>
                        <td className="py-1 px-2 num font-mono">{p.piece || '—'}</td>
                        <td className="py-1 px-2 text-[10px]">{Array.from(p.dates).slice(0, 2).join(', ')}{p.dates.size > 2 ? '…' : ''}</td>
                        <td className="py-1 px-2 text-right num">{p.count}</td>
                        <td className="py-1 px-2 text-right num">{fmtFull(p.debit)}</td>
                        <td className="py-1 px-2 text-right num">{fmtFull(p.credit)}</td>
                        <td className="py-1 px-2 text-right num font-semibold text-error">{fmtFull(p.gap)}</td>
                        <td className="py-1 px-2">
                          <div className="flex flex-wrap gap-0.5">
                            {Array.from(p.accounts).slice(0, 5).map((a) => (
                              <span key={a} className="inline-block bg-primary-100 dark:bg-primary-800 rounded px-1 py-0.5 font-mono text-[9px]">{a}</span>
                            ))}
                            {p.accounts.size > 5 && <span className="text-[9px] text-primary-400">+{p.accounts.size - 5}</span>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── 4. BALANCE ÂGÉE (Clients ou Fournisseurs) ────────────────────
function AgedView({ orgId, year, importId, kind }: { orgId: string; year: number; importId: string; kind: 'client' | 'fournisseur' }) {
  const [data, setData] = useState<{ buckets: string[]; rows: AgedTier[] }>({ buckets: [], rows: [] });
  useEffect(() => { if (orgId) agedBalance(orgId, year, kind, importId).then(setData); }, [orgId, year, kind, importId]);

  if (data.rows.length === 0) {
    return <Card><p className="text-sm text-primary-500 text-center py-6">Aucune balance âgée à afficher.</p></Card>;
  }
  const totalsByBucket = data.buckets.map((_, i) => data.rows.reduce((s, r) => s + r.buckets[i], 0));
  const grandTotal = data.rows.reduce((s, r) => s + r.total, 0);
  // Cohérence : somme des buckets == total ligne pour chaque tiers
  const allRowsConsistent = data.rows.every((r) => Math.abs(r.buckets.reduce((s, v) => s + v, 0) - r.total) < 1);

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center justify-between">
          <span className="text-xs text-primary-500"><span className="num font-semibold">{data.rows.length}</span> tiers — Total : <span className="num font-semibold">{fmtFull(grandTotal)}</span></span>
          <EquilibreBadge balanced={allRowsConsistent} delta={data.rows.reduce((s, r) => s + r.buckets.reduce((a, v) => a + v, 0) - r.total, 0)} />
        </div>
      </Card>
      <Card padded={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wider text-primary-500 border-b border-primary-300 dark:border-primary-700 bg-primary-100 dark:bg-primary-900">
              <tr>
                <th className="text-left py-2 px-3">Tiers</th>
                <th className="text-left py-2 px-3">Libellé</th>
                {data.buckets.map((b) => <th key={b} className="text-right py-2 px-3">{b}</th>)}
                <th className="text-right py-2 px-3">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-primary-200 dark:divide-primary-800">
              {data.rows.map((r) => (
                <tr key={r.tier} className="hover:bg-primary-100/50 dark:hover:bg-primary-900/50">
                  <td className="py-1.5 px-3 num font-mono">{r.tier}</td>
                  <td className="py-1.5 px-3 text-xs">{r.label}</td>
                  {r.buckets.map((v, i) => (
                    <td key={i} className="py-1.5 px-3 text-right num">{Math.abs(v) > 0.01 ? fmtFull(v) : <span className="text-primary-400">—</span>}</td>
                  ))}
                  <td className={clsx('py-1.5 px-3 text-right num font-semibold', r.total < 0 ? 'text-error' : '')}>{fmtFull(r.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-primary-300 dark:border-primary-700 bg-primary-100 dark:bg-primary-900 font-bold">
              <tr>
                <td className="py-2 px-3" colSpan={2}>TOTAUX</td>
                {totalsByBucket.map((v, i) => <td key={i} className="py-2 px-3 text-right num">{fmtFull(v)}</td>)}
                <td className="py-2 px-3 text-right num">{fmtFull(grandTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </div>
  );
}
