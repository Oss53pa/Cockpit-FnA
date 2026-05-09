/**
 * T02 — Balance Analytique par Axe
 *
 * Soldes par code analytique sur la période courante.
 * Colonnes : Code · Libellé · Axe d'appartenance · Total Débit · Total Crédit
 *           · Solde · Nb d'écritures · Branche.
 *
 * Filtres : axe (sélection), branche WBS, recherche.
 */
import { useEffect, useMemo, useState } from 'react';
import { Calculator, Search, Download } from 'lucide-react';
import { PageHeader } from '../../components/layout/PageHeader';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { useApp } from '../../store/app';
import { dataProvider } from '../../db/provider';
import { fmtFull } from '../../lib/format';
import { loadAnalyticContext, viewEntries } from '../../engine/analyticDashboards';
import { BRANCH_LABELS, BRANCH_COLORS } from '../../engine/analyticBranch';
import type { AnalyticAxis, AnalyticBranch } from '../../db/schema';

interface BalanceRow {
  codeId: string;
  code: string;
  label: string;
  axisNumber: number;
  axisName: string;
  branch: AnalyticBranch | undefined;
  totalDebit: number;
  totalCredit: number;
  solde: number;
  lines: number;
}

export default function AnalyticalBalance() {
  const { currentOrgId, currentYear } = useApp();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<BalanceRow[]>([]);
  const [axes, setAxes] = useState<AnalyticAxis[]>([]);
  const [search, setSearch] = useState('');
  const [axisFilter, setAxisFilter] = useState<'all' | number>('all');
  const [branchFilter, setBranchFilter] = useState<'all' | AnalyticBranch>('all');

  useEffect(() => {
    if (!currentOrgId) return;
    setLoading(true);
    void (async () => {
      try {
        const [ctx, periods] = await Promise.all([
          loadAnalyticContext(currentOrgId, currentYear),
          dataProvider.getPeriods(currentOrgId),
        ]);
        const yearPeriods = periods.filter((p) => p.year === currentYear && p.month >= 1);
        const axesReal = await dataProvider.getAnalyticAxes(currentOrgId);
        setAxes(axesReal);
        const axisById = new Map<string, AnalyticAxis>(axesReal.map((a) => [a.id, a]));

        // Cumule par code à partir des views (axes affectés)
        const views = viewEntries(ctx, yearPeriods);
        const byCode = new Map<string, BalanceRow>();
        for (const v of views) {
          for (const a of v.entry.id !== undefined ? (ctx.assignmentsByEntry.get(v.entry.id) ?? []) : []) {
            const code = ctx.codeById.get(a.codeId);
            if (!code) continue;
            const ax = axisById.get(code.axisId);
            const key = code.id;
            let row = byCode.get(key);
            if (!row) {
              row = {
                codeId: code.id,
                code: code.code,
                label: code.shortLabel,
                axisNumber: ax?.number ?? 0,
                axisName: ax?.name ?? `Axe ${ax?.number ?? '?'}`,
                branch: code.branch,
                totalDebit: 0,
                totalCredit: 0,
                solde: 0,
                lines: 0,
              };
              byCode.set(key, row);
            }
            row.totalDebit += v.entry.debit;
            row.totalCredit += v.entry.credit;
            row.lines += 1;
          }
        }
        for (const r of byCode.values()) r.solde = r.totalDebit - r.totalCredit;
        setRows(Array.from(byCode.values()).sort((a, b) => Math.abs(b.solde) - Math.abs(a.solde)));
      } finally {
        setLoading(false);
      }
    })();
  }, [currentOrgId, currentYear]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (axisFilter !== 'all' && r.axisNumber !== axisFilter) return false;
      if (branchFilter !== 'all' && r.branch !== branchFilter) return false;
      if (s && !`${r.code} ${r.label}`.toLowerCase().includes(s)) return false;
      return true;
    });
  }, [rows, axisFilter, branchFilter, search]);

  const totals = useMemo(() => filtered.reduce((s, r) => ({
    debit: s.debit + r.totalDebit,
    credit: s.credit + r.totalCredit,
    solde: s.solde + r.solde,
    lines: s.lines + r.lines,
  }), { debit: 0, credit: 0, solde: 0, lines: 0 }), [filtered]);

  const exportCsv = () => {
    const header = ['Code', 'Libellé', 'Axe', 'Branche', 'Débit', 'Crédit', 'Solde', 'Lignes'];
    const lines = [header.join(';')];
    for (const r of filtered) {
      lines.push([
        r.code, r.label, r.axisName, r.branch ?? '',
        r.totalDebit, r.totalCredit, r.solde, r.lines,
      ].join(';'));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `balance_analytique_${currentYear}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="w-full space-y-4">
      <PageHeader
        title="T02 — Balance analytique par axe"
        subtitle="Soldes par code analytique sur l'exercice"
        icon={<Calculator className="w-5 h-5" />}
        back="/dashboards"
        action={
          <button className="btn-outline text-sm" onClick={exportCsv} disabled={filtered.length === 0}>
            <Download className="w-4 h-4" /> Export CSV
          </button>
        }
      />

      <Card padded>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="text-[10px] uppercase tracking-wider text-primary-500 font-semibold block mb-1">Recherche</label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-primary-400" />
              <input type="text" placeholder="Code ou libellé…" value={search} onChange={(e) => setSearch(e.target.value)} className="input pl-8 w-full" />
            </div>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-primary-500 font-semibold block mb-1">Axe</label>
            <select value={axisFilter} onChange={(e) => setAxisFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))} className="input !w-auto">
              <option value="all">Tous les axes</option>
              {axes.map((a) => <option key={a.id} value={a.number}>Axe {a.number} — {a.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-primary-500 font-semibold block mb-1">Branche WBS</label>
            <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value as 'all' | AnalyticBranch)} className="input !w-auto">
              <option value="all">Toutes</option>
              <option value="revenue">{BRANCH_LABELS.revenue}</option>
              <option value="project_cost">{BRANCH_LABELS.project_cost}</option>
              <option value="overhead">{BRANCH_LABELS.overhead}</option>
            </select>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Codes" value={filtered.length.toLocaleString('fr-FR')} />
        <Stat label="Total débit" value={fmtFull(totals.debit)} />
        <Stat label="Total crédit" value={fmtFull(totals.credit)} />
        <Stat label="Solde net" value={fmtFull(totals.solde)} />
      </div>

      <Card title={`Balance par code (${filtered.length})`} subtitle={`Exercice ${currentYear}`} padded={false}>
        {loading ? (
          <div className="py-12 text-center text-sm text-primary-500">Chargement…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-xs uppercase tracking-wider text-primary-500 border-b border-primary-200 dark:border-primary-800 bg-primary-50 dark:bg-primary-900/40">
                <tr>
                  <th className="text-left px-3 py-2">Code</th>
                  <th className="text-left px-3 py-2">Libellé</th>
                  <th className="text-left px-3 py-2">Axe</th>
                  <th className="text-center px-3 py-2">Branche</th>
                  <th className="text-right px-3 py-2">Total débit</th>
                  <th className="text-right px-3 py-2">Total crédit</th>
                  <th className="text-right px-3 py-2">Solde</th>
                  <th className="text-right px-3 py-2">Lignes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-primary-100 dark:divide-primary-800">
                {filtered.length === 0 && (
                  <tr><td colSpan={8} className="py-6 text-center text-primary-400">Aucun code analytique mouvementé pour ces filtres.</td></tr>
                )}
                {filtered.map((r) => (
                  <tr key={r.codeId} className="hover:bg-primary-50 dark:hover:bg-primary-900/40">
                    <td className="px-3 py-1.5 font-mono font-semibold">{r.code}</td>
                    <td className="px-3 py-1.5">{r.label}</td>
                    <td className="px-3 py-1.5 text-primary-500">Axe {r.axisNumber} — {r.axisName}</td>
                    <td className="px-3 py-1.5 text-center">
                      {r.branch ? (
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        <Badge variant={BRANCH_COLORS[r.branch] as any}>{BRANCH_LABELS[r.branch]}</Badge>
                      ) : <span className="text-[10px] text-primary-400">—</span>}
                    </td>
                    <td className="px-3 py-1.5 text-right num">{fmtFull(r.totalDebit)}</td>
                    <td className="px-3 py-1.5 text-right num">{fmtFull(r.totalCredit)}</td>
                    <td className={`px-3 py-1.5 text-right num font-bold ${r.solde < 0 ? 'text-error' : ''}`}>{fmtFull(r.solde)}</td>
                    <td className="px-3 py-1.5 text-right num">{r.lines.toLocaleString('fr-FR')}</td>
                  </tr>
                ))}
              </tbody>
              {filtered.length > 0 && (
                <tfoot className="bg-primary-100 dark:bg-primary-900 font-semibold">
                  <tr>
                    <td className="px-3 py-2" colSpan={4}>Total ({filtered.length} codes)</td>
                    <td className="px-3 py-2 text-right num">{fmtFull(totals.debit)}</td>
                    <td className="px-3 py-2 text-right num">{fmtFull(totals.credit)}</td>
                    <td className="px-3 py-2 text-right num">{fmtFull(totals.solde)}</td>
                    <td className="px-3 py-2 text-right num">{totals.lines.toLocaleString('fr-FR')}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card padded>
      <p className="text-[10px] uppercase tracking-wider text-primary-500 font-semibold">{label}</p>
      <p className="num text-xl font-bold mt-1">{value}</p>
    </Card>
  );
}

