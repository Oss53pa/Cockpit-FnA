/**
 * T01 — Journal Analytique
 *
 * Liste des ventilations analytiques par écriture GL.
 * Colonnes : Date · N° pièce · Compte SYSCOHADA · Libellé · Débit/Crédit
 *           · Plan analytique · Axe 1 (Projet) · Axe 2 (Centre) · Axe 3 · Branche · Statut
 *
 * Filtres : période (année/mois), journal, branche WBS, recherche libre.
 */
import { useEffect, useMemo, useState } from 'react';
import { BookOpen, Search } from 'lucide-react';
import clsx from 'clsx';
import { PageHeader } from '../../components/layout/PageHeader';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { useApp } from '../../store/app';
import { dataProvider } from '../../db/provider';
import type { GLEntry, AnalyticAssignment, AnalyticCode, AnalyticAxis, AnalyticBranch } from '../../db/schema';
import { fmtFull } from '../../lib/format';
import { inferBranch, BRANCH_LABELS, BRANCH_COLORS } from '../../engine/analyticBranch';

const PAGE_SIZE = 100;

export default function AnalyticalJournal() {
  const { currentOrgId, currentYear } = useApp();
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<GLEntry[]>([]);
  const [assignments, setAssignments] = useState<AnalyticAssignment[]>([]);
  const [codes, setCodes] = useState<AnalyticCode[]>([]);
  const [axes, setAxes] = useState<AnalyticAxis[]>([]);

  const [search, setSearch] = useState('');
  const [journalFilter, setJournalFilter] = useState<string>('all');
  const [branchFilter, setBranchFilter] = useState<'all' | AnalyticBranch | 'unassigned'>('all');
  const [page, setPage] = useState(0);

  useEffect(() => {
    if (!currentOrgId) return;
    setLoading(true);
    void (async () => {
      try {
        const [periods, allEntries, ass, c, a] = await Promise.all([
          dataProvider.getPeriods(currentOrgId),
          dataProvider.getGLEntries({ orgId: currentOrgId }),
          dataProvider.getAnalyticAssignments(currentOrgId),
          dataProvider.getAnalyticCodes(currentOrgId),
          dataProvider.getAnalyticAxes(currentOrgId),
        ]);
        const yearPeriodIds = new Set(periods.filter((p) => p.year === currentYear && p.month >= 1).map((p) => p.id));
        setEntries(allEntries.filter((e) => yearPeriodIds.has(e.periodId)));
        setAssignments(ass);
        setCodes(c);
        setAxes(a);
      } finally {
        setLoading(false);
      }
    })();
  }, [currentOrgId, currentYear]);

  const codeById = useMemo(() => new Map(codes.map((c) => [c.id, c])), [codes]);
  const assignmentsByEntry = useMemo(() => {
    const m = new Map<number, AnalyticAssignment[]>();
    for (const a of assignments) {
      if (!a.glEntryId) continue;
      const arr = m.get(a.glEntryId) ?? [];
      arr.push(a);
      m.set(a.glEntryId, arr);
    }
    return m;
  }, [assignments]);

  const journals = useMemo(() => {
    const set = new Set(entries.map((e) => e.journal));
    return Array.from(set).sort();
  }, [entries]);

  // Enrichissement + filtres
  const enrichedEntries = useMemo(() => entries.map((e) => {
    const ass = assignmentsByEntry.get(e.id ?? -1) ?? [];
    const branch = inferBranch(e, { assignments: ass });
    const codeByAxis = new Map<number, AnalyticCode>();
    for (const a of ass) {
      const c = codeById.get(a.codeId);
      if (c) codeByAxis.set(a.axisNumber, c);
    }
    return { entry: e, branch, ass, codeByAxis };
  }), [entries, assignmentsByEntry, codeById]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return enrichedEntries.filter(({ entry, branch, ass }) => {
      if (journalFilter !== 'all' && entry.journal !== journalFilter) return false;
      if (branchFilter === 'unassigned' && ass.length > 0) return false;
      if (branchFilter !== 'all' && branchFilter !== 'unassigned' && branch !== branchFilter) return false;
      if (s) {
        const text = `${entry.account} ${entry.label} ${entry.piece} ${entry.tiers ?? ''}`.toLowerCase();
        if (!text.includes(s)) return false;
      }
      return true;
    });
  }, [enrichedEntries, journalFilter, branchFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const totals = useMemo(() => filtered.reduce((s, { entry, ass }) => ({
    debit: s.debit + entry.debit,
    credit: s.credit + entry.credit,
    assigned: s.assigned + (ass.length > 0 ? 1 : 0),
  }), { debit: 0, credit: 0, assigned: 0 }), [filtered]);

  const axisLabel = (n: number) => axes.find((a) => a.number === n)?.name ?? `Axe ${n}`;

  return (
    <div className="w-full space-y-4">
      <PageHeader
        title="T01 — Journal analytique"
        subtitle="Liste des ventilations analytiques par écriture GL"
        icon={<BookOpen className="w-5 h-5" />}
        back="/dashboards"
      />

      {/* Filtres */}
      <Card padded>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="text-[10px] uppercase tracking-wider text-primary-500 font-semibold block mb-1">Recherche</label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-primary-400" />
              <input
                type="text"
                placeholder="Compte, libellé, pièce, tiers…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                className="input pl-8 w-full"
              />
            </div>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-primary-500 font-semibold block mb-1">Journal</label>
            <select
              value={journalFilter}
              onChange={(e) => { setJournalFilter(e.target.value); setPage(0); }}
              className="input !w-auto"
            >
              <option value="all">Tous</option>
              {journals.map((j) => <option key={j} value={j}>{j}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-primary-500 font-semibold block mb-1">Branche WBS</label>
            <select
              value={branchFilter}
              onChange={(e) => { setBranchFilter(e.target.value as typeof branchFilter); setPage(0); }}
              className="input !w-auto"
            >
              <option value="all">Toutes</option>
              <option value="revenue">{BRANCH_LABELS.revenue}</option>
              <option value="project_cost">{BRANCH_LABELS.project_cost}</option>
              <option value="overhead">{BRANCH_LABELS.overhead}</option>
              <option value="unassigned">Non ventilées</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat label="Écritures filtrées" value={filtered.length.toLocaleString('fr-FR')} />
        <Stat label="Ventilées" value={totals.assigned.toLocaleString('fr-FR')} sub={`${filtered.length > 0 ? Math.round((totals.assigned / filtered.length) * 100) : 0} %`} />
        <Stat label="Non ventilées" value={(filtered.length - totals.assigned).toLocaleString('fr-FR')} />
        <Stat label="Total débit" value={fmtFull(totals.debit)} />
        <Stat label="Total crédit" value={fmtFull(totals.credit)} />
      </div>

      {/* Table */}
      <Card title={`Écritures (${filtered.length.toLocaleString('fr-FR')})`} subtitle={`Exercice ${currentYear}`} padded={false}>
        {loading ? (
          <div className="py-12 text-center text-sm text-primary-500">Chargement…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-xs uppercase tracking-wider text-primary-500 border-b border-primary-200 dark:border-primary-800 bg-primary-50 dark:bg-primary-900/40">
                <tr>
                  <th className="text-left px-3 py-2">Date</th>
                  <th className="text-left px-3 py-2">Pièce</th>
                  <th className="text-left px-3 py-2">Journal</th>
                  <th className="text-left px-3 py-2">Compte</th>
                  <th className="text-left px-3 py-2">Libellé</th>
                  <th className="text-right px-3 py-2">Débit</th>
                  <th className="text-right px-3 py-2">Crédit</th>
                  <th className="text-left px-3 py-2">Axe 1 ({axisLabel(1)})</th>
                  <th className="text-left px-3 py-2">Axe 2 ({axisLabel(2)})</th>
                  <th className="text-left px-3 py-2">Axe 3 ({axisLabel(3)})</th>
                  <th className="text-center px-3 py-2">Branche</th>
                  <th className="text-center px-3 py-2">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-primary-100 dark:divide-primary-800">
                {pageRows.length === 0 && (
                  <tr><td colSpan={12} className="py-6 text-center text-primary-400">Aucune écriture pour ces filtres.</td></tr>
                )}
                {pageRows.map(({ entry, branch, ass, codeByAxis }) => (
                  <tr key={entry.id} className="hover:bg-primary-50 dark:hover:bg-primary-900/40">
                    <td className="px-3 py-1.5 num">{entry.date}</td>
                    <td className="px-3 py-1.5 font-mono">{entry.piece}</td>
                    <td className="px-3 py-1.5 font-mono">{entry.journal}</td>
                    <td className="px-3 py-1.5 font-mono font-semibold">{entry.account}</td>
                    <td className="px-3 py-1.5 truncate max-w-[200px]">{entry.label}</td>
                    <td className="px-3 py-1.5 text-right num">{entry.debit > 0 ? fmtFull(entry.debit) : ''}</td>
                    <td className="px-3 py-1.5 text-right num">{entry.credit > 0 ? fmtFull(entry.credit) : ''}</td>
                    <td className="px-3 py-1.5 font-mono text-[11px]">{codeByAxis.get(1)?.code ?? '—'}</td>
                    <td className="px-3 py-1.5 font-mono text-[11px]">{codeByAxis.get(2)?.code ?? '—'}</td>
                    <td className="px-3 py-1.5 font-mono text-[11px]">{codeByAxis.get(3)?.code ?? '—'}</td>
                    <td className="px-3 py-1.5 text-center">
                      {branch ? (
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        <Badge variant={BRANCH_COLORS[branch] as any}>{BRANCH_LABELS[branch]}</Badge>
                      ) : <span className="text-[10px] text-primary-400">—</span>}
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      {ass.length > 0
                        ? <Badge variant="success">Validé</Badge>
                        : <Badge variant="warning">En attente</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-2.5 border-t border-primary-200 dark:border-primary-800 flex items-center justify-between text-xs">
            <span className="text-primary-500">
              Page {page + 1} / {totalPages} · {PAGE_SIZE} lignes par page
            </span>
            <div className="flex gap-1">
              <button
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                className={clsx('btn-outline !py-1 !px-3', page === 0 && 'opacity-30 cursor-not-allowed')}
              >
                ← Précédent
              </button>
              <button
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                className={clsx('btn-outline !py-1 !px-3', page >= totalPages - 1 && 'opacity-30 cursor-not-allowed')}
              >
                Suivant →
              </button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card padded>
      <p className="text-[10px] uppercase tracking-wider text-primary-500 font-semibold">{label}</p>
      <p className="num text-xl font-bold mt-1">{value}</p>
      {sub && <p className="text-[10px] text-primary-400 mt-0.5">{sub}</p>}
    </Card>
  );
}
