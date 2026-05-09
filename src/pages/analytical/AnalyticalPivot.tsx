/**
 * T04 — Tableau Croisé Multi-Axes
 *
 * Croisement dynamique entre 2 axes au choix.
 * Exemples : Projet × Ressource, Centre × Mois, Type Revenu × Projet,
 *            Centre FG × Compte SYSCOHADA.
 *
 * L'utilisateur choisit la dimension X (lignes) et Y (colonnes) parmi :
 *   - Axe 1 / Axe 2 / Axe 3 (selon plan analytique)
 *   - Mois (Jan-Déc)
 *   - Compte SYSCOHADA (préfixe)
 *   - Branche WBS
 *   - Journal
 *
 * La cellule contient le montant signé (revenue = produit, autres = charge).
 */
import { useEffect, useMemo, useState } from 'react';
import { Grid3x3, Download } from 'lucide-react';
import { PageHeader } from '../../components/layout/PageHeader';
import { Card } from '../../components/ui/Card';
import { useApp } from '../../store/app';
import { dataProvider } from '../../db/provider';
import { fmtFull } from '../../lib/format';
import { loadAnalyticContext, viewEntries } from '../../engine/analyticDashboards';
import { BRANCH_LABELS, inferBranch } from '../../engine/analyticBranch';
import type { AnalyticAxis } from '../../db/schema';

type Dim = 'axe1' | 'axe2' | 'axe3' | 'month' | 'account' | 'branch' | 'journal';

const MONTHS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];

export default function AnalyticalPivot() {
  const { currentOrgId, currentYear } = useApp();
  const [loading, setLoading] = useState(true);
  const [axes, setAxes] = useState<AnalyticAxis[]>([]);
  const [dataMatrix, setDataMatrix] = useState<{ rows: string[]; cols: string[]; cells: Map<string, number>; rowLabels: Map<string, string>; colLabels: Map<string, string> }>({
    rows: [], cols: [], cells: new Map(), rowLabels: new Map(), colLabels: new Map(),
  });
  const [dimX, setDimX] = useState<Dim>('axe1');
  const [dimY, setDimY] = useState<Dim>('month');

  useEffect(() => {
    if (!currentOrgId) return;
    setLoading(true);
    void (async () => {
      try {
        const [ctx, periods, axesData] = await Promise.all([
          loadAnalyticContext(currentOrgId, currentYear),
          dataProvider.getPeriods(currentOrgId),
          dataProvider.getAnalyticAxes(currentOrgId),
        ]);
        setAxes(axesData);
        const yearPeriods = periods.filter((p) => p.year === currentYear && p.month >= 1);
        const views = viewEntries(ctx, yearPeriods);

        const getDimValue = (dim: Dim, v: typeof views[number]): { key: string; label: string } | null => {
          switch (dim) {
            case 'axe1': case 'axe2': case 'axe3': {
              const num = parseInt(dim.slice(3), 10) as 1 | 2 | 3;
              const c = v.codeByAxis.get(num);
              if (!c) return { key: '__none__', label: '— Non affecté —' };
              return { key: c.id, label: `${c.code} — ${c.shortLabel}` };
            }
            case 'month': {
              const m = v.month;
              return { key: `m${m}`, label: MONTHS[m - 1] ?? `M${m}` };
            }
            case 'account': {
              const prefix = v.entry.account.substring(0, 2);
              return { key: prefix, label: `${prefix}xx` };
            }
            case 'branch': {
              const b = v.branch ?? inferBranch(v.entry, { assignments: ctx.assignmentsByEntry.get(v.entry.id ?? -1) ?? [] });
              if (!b) return null;
              return { key: b, label: BRANCH_LABELS[b] };
            }
            case 'journal':
              return { key: v.entry.journal, label: v.entry.journal };
          }
        };

        const cells = new Map<string, number>();
        const rowSet = new Map<string, string>();
        const colSet = new Map<string, string>();
        for (const v of views) {
          const x = getDimValue(dimX, v);
          const y = getDimValue(dimY, v);
          if (!x || !y) continue;
          rowSet.set(x.key, x.label);
          colSet.set(y.key, y.label);
          const key = `${x.key}${y.key}`;
          cells.set(key, (cells.get(key) ?? 0) + v.amount);
        }
        // Tri intelligent : mois en ordre numérique, autres alphabétique
        const sortKeys = (m: Map<string, string>, isMonth: boolean) => {
          if (isMonth) return Array.from(m.keys()).sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1)));
          return Array.from(m.keys()).sort();
        };
        const rows = sortKeys(rowSet, dimX === 'month');
        const cols = sortKeys(colSet, dimY === 'month');
        setDataMatrix({ rows, cols, cells, rowLabels: rowSet, colLabels: colSet });
      } finally {
        setLoading(false);
      }
    })();
  }, [currentOrgId, currentYear, dimX, dimY]);

  const dimLabel = (d: Dim) => {
    if (d === 'axe1') return `Axe 1 — ${axes.find((a) => a.number === 1)?.name ?? 'Projet'}`;
    if (d === 'axe2') return `Axe 2 — ${axes.find((a) => a.number === 2)?.name ?? 'Centre'}`;
    if (d === 'axe3') return `Axe 3 — ${axes.find((a) => a.number === 3)?.name ?? 'Ressource'}`;
    if (d === 'month') return 'Mois';
    if (d === 'account') return 'Compte SYSCOHADA (préfixe)';
    if (d === 'branch') return 'Branche WBS';
    return 'Journal';
  };

  const rowTotals = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of dataMatrix.rows) {
      let sum = 0;
      for (const c of dataMatrix.cols) sum += dataMatrix.cells.get(`${r}${c}`) ?? 0;
      m.set(r, sum);
    }
    return m;
  }, [dataMatrix]);

  const colTotals = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of dataMatrix.cols) {
      let sum = 0;
      for (const r of dataMatrix.rows) sum += dataMatrix.cells.get(`${r}${c}`) ?? 0;
      m.set(c, sum);
    }
    return m;
  }, [dataMatrix]);

  const grandTotal = useMemo(() => {
    let s = 0;
    for (const v of dataMatrix.cells.values()) s += v;
    return s;
  }, [dataMatrix]);

  const exportCsv = () => {
    const lines: string[] = [];
    lines.push([dimLabel(dimX), ...dataMatrix.cols.map((c) => dataMatrix.colLabels.get(c) ?? c), 'Total'].join(';'));
    for (const r of dataMatrix.rows) {
      const cells = dataMatrix.cols.map((c) => String(dataMatrix.cells.get(`${r}${c}`) ?? 0));
      lines.push([dataMatrix.rowLabels.get(r) ?? r, ...cells, String(rowTotals.get(r) ?? 0)].join(';'));
    }
    lines.push(['Total', ...dataMatrix.cols.map((c) => String(colTotals.get(c) ?? 0)), String(grandTotal)].join(';'));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `pivot_${dimX}_x_${dimY}_${currentYear}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const dimOptions: { v: Dim; l: string }[] = [
    { v: 'axe1', l: dimLabel('axe1') },
    { v: 'axe2', l: dimLabel('axe2') },
    { v: 'axe3', l: dimLabel('axe3') },
    { v: 'month', l: 'Mois' },
    { v: 'account', l: 'Compte SYSCOHADA (préfixe)' },
    { v: 'branch', l: 'Branche WBS' },
    { v: 'journal', l: 'Journal' },
  ];

  return (
    <div className="w-full space-y-4">
      <PageHeader
        title="T04 — Tableau croisé multi-axes"
        subtitle="Pivot dynamique entre 2 dimensions au choix (axe, mois, compte, branche, journal)"
        icon={<Grid3x3 className="w-5 h-5" />}
        back="/dashboards"
        action={
          <button className="btn-outline text-sm" onClick={exportCsv} disabled={dataMatrix.rows.length === 0}>
            <Download className="w-4 h-4" /> Export CSV pivot
          </button>
        }
      />

      <Card padded>
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-primary-500 font-semibold block mb-1">Lignes (X)</label>
            <select value={dimX} onChange={(e) => setDimX(e.target.value as Dim)} className="input !w-auto">
              {dimOptions.map((o) => <option key={o.v} value={o.v} disabled={o.v === dimY}>{o.l}</option>)}
            </select>
          </div>
          <div className="text-primary-400 mb-2">×</div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-primary-500 font-semibold block mb-1">Colonnes (Y)</label>
            <select value={dimY} onChange={(e) => setDimY(e.target.value as Dim)} className="input !w-auto">
              {dimOptions.map((o) => <option key={o.v} value={o.v} disabled={o.v === dimX}>{o.l}</option>)}
            </select>
          </div>
          <p className="text-xs text-primary-500 ml-auto">
            Exercice {currentYear} · {dataMatrix.rows.length} ligne(s) × {dataMatrix.cols.length} colonne(s)
          </p>
        </div>
      </Card>

      <Card title={`${dimLabel(dimX)} × ${dimLabel(dimY)}`} subtitle="Montants signés (revenu positif si produit, sinon charge)" padded={false}>
        {loading ? (
          <div className="py-12 text-center text-sm text-primary-500">Calcul en cours…</div>
        ) : dataMatrix.rows.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-primary-400">
            Aucune donnée sur ces 2 dimensions pour l'exercice {currentYear}.
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[70vh]">
            <table className="w-full text-xs">
              <thead className="bg-primary-100 dark:bg-primary-900 sticky top-0 z-10">
                <tr>
                  <th className="text-left px-3 py-2 sticky left-0 bg-primary-100 dark:bg-primary-900 z-20">{dimLabel(dimX)}</th>
                  {dataMatrix.cols.map((c) => (
                    <th key={c} className="text-right px-3 py-2 whitespace-nowrap">{dataMatrix.colLabels.get(c) ?? c}</th>
                  ))}
                  <th className="text-right px-3 py-2 bg-primary-200 dark:bg-primary-800">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-primary-100 dark:divide-primary-800">
                {dataMatrix.rows.map((r) => (
                  <tr key={r} className="hover:bg-primary-50 dark:hover:bg-primary-900/40">
                    <td className="px-3 py-1.5 font-semibold sticky left-0 bg-white dark:bg-primary-950 hover:bg-primary-50 dark:hover:bg-primary-900/40">
                      {dataMatrix.rowLabels.get(r) ?? r}
                    </td>
                    {dataMatrix.cols.map((c) => {
                      const v = dataMatrix.cells.get(`${r}${c}`) ?? 0;
                      return (
                        <td key={c} className={`px-3 py-1.5 text-right num ${v < 0 ? 'text-error' : ''}`}>
                          {v === 0 ? <span className="text-primary-300">—</span> : fmtFull(v)}
                        </td>
                      );
                    })}
                    <td className={`px-3 py-1.5 text-right num font-bold bg-primary-50 dark:bg-primary-900/40 ${(rowTotals.get(r) ?? 0) < 0 ? 'text-error' : ''}`}>
                      {fmtFull(rowTotals.get(r) ?? 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-primary-100 dark:bg-primary-900 font-bold">
                <tr>
                  <td className="px-3 py-2 sticky left-0 bg-primary-100 dark:bg-primary-900">Total</td>
                  {dataMatrix.cols.map((c) => (
                    <td key={c} className={`px-3 py-2 text-right num ${(colTotals.get(c) ?? 0) < 0 ? 'text-error' : ''}`}>
                      {fmtFull(colTotals.get(c) ?? 0)}
                    </td>
                  ))}
                  <td className={`px-3 py-2 text-right num bg-primary-200 dark:bg-primary-800 ${grandTotal < 0 ? 'text-error' : ''}`}>
                    {fmtFull(grandTotal)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
