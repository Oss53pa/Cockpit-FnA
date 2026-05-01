/**
 * Variation des capitaux propres — état SYSCOHADA obligatoire système Normal.
 * Design dernière génération : KPI hero, donut composition + table.
 */
import { useEffect, useMemo, useState } from 'react';
import { Download, Coins, TrendingUp, TrendingDown, Layers } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell } from 'recharts';
import { PageHeader } from '../components/layout/PageHeader';
import { ChartCard } from '../components/ui/ChartCard';
import { KPICard } from '../components/ui/KPICardV2';
import { useApp } from '../store/app';
import { computeCapitalVariation, type CapitalMovement } from '../engine/flows';
import { fmtFull, fmtK } from '../lib/format';
import { useChartTheme } from '../lib/chartTheme';
import { useCurrentOrg } from '../hooks/useFinancials';

export default function CapitalVariationPage() {
  const { currentOrgId, currentYear } = useApp();
  const org = useCurrentOrg();
  const ct = useChartTheme();
  const [data, setData] = useState<CapitalMovement[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!currentOrgId) return;
    setLoading(true);
    computeCapitalVariation(currentOrgId, currentYear).then(setData).finally(() => setLoading(false));
  }, [currentOrgId, currentYear]);

  const totals = useMemo(() => data.reduce(
    (acc, r) => ({
      ouverture: acc.ouverture + r.ouverture,
      augmentations: acc.augmentations + r.augmentations,
      diminutions: acc.diminutions + r.diminutions,
      affectationResN1: acc.affectationResN1 + (r.affectationResN1 ?? 0),
      resultatExercice: acc.resultatExercice + (r.resultatExercice ?? 0),
      cloture: acc.cloture + r.cloture,
    }),
    { ouverture: 0, augmentations: 0, diminutions: 0, affectationResN1: 0, resultatExercice: 0, cloture: 0 },
  ), [data]);

  // Chart : ouverture vs clôture par rubrique
  const chartData = data.map((r) => ({
    name: r.label,
    Ouverture: r.ouverture,
    Clôture: r.cloture,
  }));

  const exportCSV = () => {
    const head = ['Rubrique', 'Comptes', 'Ouverture', 'Augmentations', 'Diminutions', 'Affectation N-1', 'Résultat N', 'Clôture'].join(';');
    const rows = data.map((r) => [
      `"${r.label}"`, r.accountCodes ?? '', r.ouverture, r.augmentations, r.diminutions,
      r.affectationResN1 ?? 0, r.resultatExercice ?? 0, r.cloture,
    ].join(';'));
    const csv = [head, ...rows].join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `capital-variation-${currentYear}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5 animate-fade-in-up">
      <PageHeader
        title="Variation des capitaux propres"
        subtitle={`${org?.name ?? '—'} · Exercice ${currentYear} · SYSCOHADA art. 38`}
        action={
          <button className="btn-outline" onClick={exportCSV} disabled={!data.length}>
            <Download className="w-4 h-4" /> Exporter CSV
          </button>
        }
      />

      {loading && <div className="py-20 text-center text-primary-400 text-sm">Calcul en cours…</div>}

      {!loading && data.length > 0 && (
        <>
          {/* KPI Hero */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            <KPICard
              variant="hero"
              title="Capitaux propres clôture"
              value={fmtK(totals.cloture)}
              unit="XOF"
              icon={<Layers className="w-5 h-5" strokeWidth={2} />}
              variation={totals.ouverture ? ((totals.cloture - totals.ouverture) / Math.abs(totals.ouverture)) * 100 : undefined}
              vsLabel="vs ouverture"
              subValue={`Ouverture : ${fmtK(totals.ouverture)}`}
            />
            <KPICard
              title="Augmentations"
              value={fmtK(totals.augmentations)}
              unit="XOF"
              icon={<TrendingUp className="w-4 h-4" strokeWidth={2} />}
              subValue="Apports + dotations"
            />
            <KPICard
              title="Diminutions"
              value={fmtK(totals.diminutions)}
              unit="XOF"
              icon={<TrendingDown className="w-4 h-4" strokeWidth={2} />}
              subValue="Réductions + distributions"
              inverse
            />
            <KPICard
              title="Résultat de l'exercice"
              value={fmtK(totals.resultatExercice)}
              unit="XOF"
              icon={<Coins className="w-4 h-4" strokeWidth={2} />}
              subValue="Affecté en clôture"
            />
          </div>

          {/* Chart : évolution Ouverture → Clôture par rubrique */}
          <ChartCard title="Évolution par rubrique" subtitle="Ouverture vs clôture" accent={ct.accent}>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData} barCategoryGap="30%">
                <CartesianGrid {...ct.gridProps} />
                <XAxis dataKey="name" {...ct.axisProps} />
                <YAxis {...ct.axisProps} tickFormatter={fmtK} />
                <Tooltip formatter={(v: any) => fmtFull(v)} contentStyle={ct.tooltipStyle} itemStyle={ct.tooltipItemStyle} labelStyle={ct.tooltipLabelStyle} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 10 }} iconType="circle" iconSize={8} />
                <Bar dataKey="Ouverture" fill={ct.at(2)} radius={[4, 4, 0, 0]} />
                <Bar dataKey="Clôture" fill={ct.at(0)} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Table détaillée */}
          <ChartCard title="Détail par rubrique" subtitle="Mouvements bruts depuis le Grand Livre" accent={ct.at(1)}>
            <div className="overflow-x-auto -mx-5">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-primary-200 dark:border-primary-700 text-primary-500 uppercase tracking-wider text-[10px]">
                    <th className="text-left py-2.5 px-3 font-semibold">Rubrique</th>
                    <th className="text-left py-2.5 px-3 font-semibold">Comptes</th>
                    <th className="text-right py-2.5 px-3 font-semibold">Ouverture</th>
                    <th className="text-right py-2.5 px-3 font-semibold text-success">Augmentations</th>
                    <th className="text-right py-2.5 px-3 font-semibold text-error">Diminutions</th>
                    <th className="text-right py-2.5 px-3 font-semibold">Affectation N-1</th>
                    <th className="text-right py-2.5 px-3 font-semibold">Résultat N</th>
                    <th className="text-right py-2.5 px-3 font-semibold bg-primary-100 dark:bg-primary-800">Clôture</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((r, i) => (
                    <tr key={i} className="border-b border-primary-100/60 dark:border-primary-800/40 table-row-hover">
                      <td className="py-2.5 px-3 font-medium">{r.label}</td>
                      <td className="py-2.5 px-3 text-xs text-primary-500 num">{r.accountCodes}</td>
                      <td className="text-right py-2.5 px-3 num">{fmtFull(r.ouverture)}</td>
                      <td className="text-right py-2.5 px-3 num text-success">{r.augmentations > 0 ? `+${fmtFull(r.augmentations)}` : '—'}</td>
                      <td className="text-right py-2.5 px-3 num text-error">{r.diminutions > 0 ? `−${fmtFull(r.diminutions)}` : '—'}</td>
                      <td className="text-right py-2.5 px-3 num text-primary-500">{r.affectationResN1 ? fmtFull(r.affectationResN1) : '—'}</td>
                      <td className="text-right py-2.5 px-3 num text-primary-500">{r.resultatExercice ? fmtFull(r.resultatExercice) : '—'}</td>
                      <td className="text-right py-2.5 px-3 num font-semibold bg-primary-50/50 dark:bg-primary-900/50">{fmtFull(r.cloture)}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-primary-700 bg-primary-100 dark:bg-primary-900 font-bold">
                    <td className="py-3 px-3" colSpan={2}>TOTAL CAPITAUX PROPRES</td>
                    <td className="text-right py-3 px-3 num">{fmtFull(totals.ouverture)}</td>
                    <td className="text-right py-3 px-3 num text-success">{totals.augmentations > 0 ? `+${fmtFull(totals.augmentations)}` : '—'}</td>
                    <td className="text-right py-3 px-3 num text-error">{totals.diminutions > 0 ? `−${fmtFull(totals.diminutions)}` : '—'}</td>
                    <td className="text-right py-3 px-3 num">{fmtFull(totals.affectationResN1)}</td>
                    <td className="text-right py-3 px-3 num">{fmtFull(totals.resultatExercice)}</td>
                    <td className="text-right py-3 px-3 num">{fmtFull(totals.cloture)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </ChartCard>
        </>
      )}
    </div>
  );
}
