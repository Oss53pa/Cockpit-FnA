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
  { key: 'import', label: '📥 Import' },
  { key: 'gl',     label: '📒 Grand Livre' },
  { key: 'bg',     label: '⚖️ Balance générale' },
  { key: 'baC',    label: '👥 Bal. aux. Clients' },
  { key: 'baF',    label: '🏭 Bal. aux. Fournisseurs' },
  { key: 'ageeC',  label: '⏰ Bal. âgée Clients' },
  { key: 'ageeF',  label: '⏰ Bal. âgée Fournisseurs' },
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
          <input className="input !py-1.5 max-w-sm" placeholder="🔍 Rechercher libellé / compte / pièce / tiers…"
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

// ─── 2. BALANCE GÉNÉRALE ──────────────────────────────────────────
const bgColumns: Column<BalanceRow>[] = [
  { header: 'Compte',  width: '140px', cell: (r) => <span className="num font-mono">{r.account}</span> },
  { header: 'Libellé', width: '1fr',   cell: (r) => <span className="text-xs">{r.label}</span> },
  { header: 'Débit',   width: '160px', align: 'right', cell: (r) => <span className="num">{r.debit > 0 ? fmtFull(r.debit) : <span className="text-primary-400">—</span>}</span> },
  { header: 'Crédit',  width: '160px', align: 'right', cell: (r) => <span className="num">{r.credit > 0 ? fmtFull(r.credit) : <span className="text-primary-400">—</span>}</span> },
  { header: 'Solde D', width: '140px', align: 'right', cell: (r) => <span className="num">{r.soldeD > 0 ? fmtFull(r.soldeD) : ''}</span> },
  { header: 'Solde C', width: '140px', align: 'right', cell: (r) => <span className="num">{r.soldeC > 0 ? fmtFull(r.soldeC) : ''}</span> },
];

function BGView({ orgId, year, importId }: { orgId: string; year: number; importId: string }) {
  const [classFilter, setClassFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<BalanceRow[]>([]);
  useEffect(() => { if (orgId) computeBalance({ orgId, year, importId }).then(setRows); }, [orgId, year, importId]);

  const filtered = rows
    .filter((r) => classFilter === 'all' || r.account[0] === classFilter)
    .filter((r) => !search || r.account.includes(search) || r.label.toLowerCase().includes(search.toLowerCase()));
  const totD = filtered.reduce((s, r) => s + r.debit, 0);
  const totC = filtered.reduce((s, r) => s + r.credit, 0);
  const totSD = filtered.reduce((s, r) => s + r.soldeD, 0);
  const totSC = filtered.reduce((s, r) => s + r.soldeC, 0);

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex gap-2 items-center">
          <input className="input !py-1.5 max-w-xs" placeholder="🔍 Compte / libellé…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className="input !w-auto !py-1.5" value={classFilter} onChange={(e) => setClassFilter(e.target.value)}>
            <option value="all">Toutes classes</option>
            {['1','2','3','4','5','6','7','8'].map((c) => <option key={c} value={c}>Classe {c}</option>)}
          </select>
          <span className="ml-auto text-xs text-primary-500"><span className="num font-semibold">{filtered.length}</span> compte(s) sur <span className="num">{rows.length}</span></span>
          <EquilibreBadge balanced={Math.abs(totD - totC) < 1} delta={totD - totC} />
        </div>
      </Card>
      <Card padded={false}>
        <VirtualTable
          rows={filtered} rowKey={(r) => r.account} rowHeight={30} height={560}
          empty="Aucun compte" columns={bgColumns}
          footer={<>
            <div className="py-2 px-3 col-span-2">TOTAUX</div>
            <div className="py-2 px-3 text-right num">{fmtFull(totD)}</div>
            <div className="py-2 px-3 text-right num">{fmtFull(totC)}</div>
            <div className="py-2 px-3 text-right num">{fmtFull(totSD)}</div>
            <div className="py-2 px-3 text-right num">{fmtFull(totSC)}</div>
          </>}
        />
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
          <input className="input !py-1.5 max-w-xs" placeholder={`🔍 Tiers / libellé ${kind === 'client' ? 'client' : 'fournisseur'}…`}
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
function EquilibreBadge({ balanced, delta }: { balanced: boolean; delta: number }) {
  return balanced
    ? <span className="text-xs font-semibold text-success bg-success/10 px-2 py-1 rounded-full">✓ Équilibré</span>
    : <span className="text-xs font-semibold text-error bg-error/10 px-2 py-1 rounded-full">⚠ Écart : {fmtFull(delta)}</span>;
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
