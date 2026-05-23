/**
 * AnalyticalAxisDashboard — composant generique reutilisable pour D03/D04/D05/D06.
 *
 * Centralise la logique commune :
 *   - Charge le contexte analytique (GL + assignments + codes).
 *   - Agrège par code d'un axe donné, filtré par branche optionnelle.
 *   - Affiche : KPIs + Pie répartition + BarChart top + évolution mensuelle + table.
 *
 * Chaque dashboard concret (CostCenters, RevenueCenters, Resources, Overhead)
 * configure : titre, sous-titre, axe cible, branche(s) WBS, label des montants.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, LineChart, Line,
} from 'recharts';
import { PageHeader } from '../../components/layout/PageHeader';
import { Card } from '../../components/ui/Card';
import { ChartCard } from '../../components/ui/ChartCard';
import { ChartGradients, barGradId } from '../../components/charts/ChartGradients';
import { useApp } from '../../store/app';
import { useChartTheme } from '../../lib/chartTheme';
import { fmtFull } from '../../lib/format';
import { dataProvider } from '../../db/provider';
import {
  loadAnalyticContext, viewEntries, aggregateByAxisCode,
} from '../../engine/analyticDashboards';
import type { AnalyticBranch } from '../../db/schema';

const MONTHS_SHORT = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];

export interface AxisDashboardProps {
  /** Titre PageHeader */
  title: string;
  /** Sous-titre PageHeader */
  subtitle: string;
  /** Icône ReactNode (ex. <Layers className="w-5 h-5" />) */
  icon?: React.ReactNode;
  /** Numéro de l'axe (1-5) */
  axisNumber: number;
  /** Branche(s) WBS à filtrer. Undefined = toutes branches. */
  branchFilter?: AnalyticBranch | AnalyticBranch[];
  /** Label des montants (ex. "Coûts", "CA", "Frais"). Default: "Montant". */
  amountLabel?: string;
  /** Seuils d'alerte sur la concentration (ex. >50% sur un seul code = risque). */
  concentrationWarning?: number;
}

interface Row {
  codeId: string;
  code: string;
  label: string;
  amount: number;
  lines: number;
  monthly: number[];
  share: number;
}

export default function AnalyticalAxisDashboard({
  title, subtitle, icon, axisNumber, branchFilter, amountLabel = 'Montant',
  concentrationWarning = 0.5,
}: AxisDashboardProps) {
  const { currentOrgId, currentYear } = useApp();
  const ct = useChartTheme();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [monthlyTotal, setMonthlyTotal] = useState<number[]>(Array(13).fill(0));

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
        const views = viewEntries(ctx, yearPeriods);
        const agg = aggregateByAxisCode(views, axisNumber, branchFilter);

        let totalAmount = 0;
        const monthlyAcc = Array(13).fill(0);
        for (const [, v] of agg) {
          totalAmount += v.amount;
          for (let i = 1; i <= 12; i++) monthlyAcc[i] += v.monthly[i];
        }
        const list: Row[] = Array.from(agg.entries())
          .map(([codeId, v]) => ({
            codeId, code: v.code, label: v.label, amount: v.amount,
            lines: v.lines, monthly: v.monthly,
            share: totalAmount !== 0 ? v.amount / totalAmount : 0,
          }))
          .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));

        setRows(list);
        setTotal(totalAmount);
        setMonthlyTotal(monthlyAcc);
      } finally {
        setLoading(false);
      }
    })();
  }, [currentOrgId, currentYear, axisNumber, JSON.stringify(branchFilter)]);

  const top = rows.slice(0, 10);
  const pieData = top.filter((r) => r.amount !== 0).map((r, i) => ({
    name: r.code, value: Math.abs(r.amount), color: ct.at(i),
  }));
  const monthlyData = MONTHS_SHORT.map((m, i) => ({ mois: m, total: monthlyTotal[i + 1] }));

  // Concentration : top 1 vs total
  const top1Share = top[0]?.share ?? 0;
  const concentrationAlert = Math.abs(top1Share) > concentrationWarning;

  return (
    <div className="w-full space-y-6">
      <PageHeader
        title={title}
        subtitle={subtitle}
        icon={icon}
        back="/dashboards"
      />

      {loading && <div className="py-12 text-center text-sm text-primary-500">Calcul en cours…</div>}

      {!loading && rows.length === 0 && (
        <Card padded>
          <p className="text-sm text-primary-600">
            Aucune affectation trouvée sur l'axe {axisNumber} pour l'exercice {currentYear}
            {branchFilter ? ` (branche : ${Array.isArray(branchFilter) ? branchFilter.join(', ') : branchFilter})` : ''}.
          </p>
          <p className="text-xs text-primary-400 mt-2">
            Vérifiez votre <Link to="/analytical?tab=axes" className="underline">plan analytique</Link>,
            vos <Link to="/analytical?tab=codes" className="underline">codes</Link>,
            et lancez les <Link to="/analytical?tab=rules" className="underline">règles de mapping</Link>.
          </p>
        </Card>
      )}

      {!loading && rows.length > 0 && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KPI label={`${amountLabel} total`} value={fmtFull(total)} />
            <KPI label="Codes mouvementés" value={String(rows.length)} />
            <KPI label="Code dominant" value={rows[0]?.code ?? '—'} sub={`${(top1Share * 100).toFixed(1)} % du total`} />
            <KPI
              label="Lignes affectées"
              value={rows.reduce((s, r) => s + r.lines, 0).toLocaleString('fr-FR')}
              sub="écritures GL"
            />
          </div>

          {concentrationAlert && (
            <Card padded>
              <p className="text-xs text-warning">
                ⚠ Concentration élevée : le code <strong>{top[0].code}</strong> représente
                {' '}{(top1Share * 100).toFixed(1)} % du total. Vérifiez la cohérence du mapping.
              </p>
            </Card>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard title={`Top 10 codes — ${amountLabel}`}>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={top} layout="vertical">
                  <ChartGradients />
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #e5e5e5)" />
                  <XAxis type="number" tickFormatter={fmtFull} tick={{ fontSize: 9 }} />
                  <YAxis type="category" dataKey="code" width={80} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v) => fmtFull(Number(v))} />
                  <Bar dataKey="amount" name={amountLabel} fill={`url(#${barGradId(0)})`} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Répartition (Top 10)">
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={pieData} dataKey="value" nameKey="name"
                    cx="50%" cy="50%" outerRadius={100}
                    label={(e) => `${e.name} (${Math.round((e.value / Math.abs(total)) * 100)}%)`}
                  >
                    {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip formatter={(v) => fmtFull(Number(v))} />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <ChartCard title={`Évolution mensuelle — ${amountLabel} cumulés`}>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #e5e5e5)" />
                <XAxis dataKey="mois" tick={{ fontSize: 10 }} />
                <YAxis tickFormatter={fmtFull} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v) => fmtFull(Number(v))} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Line type="monotone" dataKey="total" name={amountLabel} stroke={ct.at(2)} strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <Card title="Détail par code" padded={false}>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-primary-100 dark:bg-primary-900">
                  <tr>
                    <th className="text-left px-3 py-2">Code</th>
                    <th className="text-left px-3 py-2">Libellé</th>
                    <th className="text-right px-3 py-2">{amountLabel}</th>
                    <th className="text-right px-3 py-2">% du total</th>
                    <th className="text-right px-3 py-2">Nb lignes</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.codeId} className="border-b border-primary-100 dark:border-primary-800 hover:bg-primary-50 dark:hover:bg-primary-900/40">
                      <td className="px-3 py-2 font-mono font-semibold">{r.code}</td>
                      <td className="px-3 py-2">{r.label}</td>
                      <td className="px-3 py-2 text-right num">{fmtFull(r.amount)}</td>
                      <td className="px-3 py-2 text-right num">{(r.share * 100).toFixed(1)} %</td>
                      <td className="px-3 py-2 text-right num">{r.lines.toLocaleString('fr-FR')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function KPI({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card padded>
      <p className="text-[10px] uppercase tracking-wider text-primary-500 font-semibold">{label}</p>
      <p className="num text-xl font-bold mt-1">{value}</p>
      {sub && <p className="text-[10px] text-primary-400 mt-0.5">{sub}</p>}
    </Card>
  );
}
