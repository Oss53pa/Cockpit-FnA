/**
 * Bilan comparatif mensuel — évolution Actif/Passif sur 12 mois.
 * Suivi de la structure financière mois par mois.
 */
import { useEffect, useState } from 'react';
import { Download, Layers } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { PageHeader } from '../components/layout/PageHeader';
import { ChartCard } from '../components/ui/ChartCard';
import { KPICard } from '../components/ui/KPICardV2';
import { TabSwitch } from '../components/ui/TabSwitch';
import { useApp } from '../store/app';
import { computeMonthlyBilan } from '../engine/monthly';
import { fmtFull, fmtK } from '../lib/format';
import { useChartTheme } from '../lib/chartTheme';
import { useCurrentOrg } from '../hooks/useFinancials';

type Side = 'actif' | 'passif';

export default function BilanMonthlyPage() {
  const { currentOrgId, currentYear } = useApp();
  const org = useCurrentOrg();
  const ct = useChartTheme();
  const [data, setData] = useState<Awaited<ReturnType<typeof computeMonthlyBilan>> | null>(null);
  const [side, setSide] = useState<Side>('actif');

  useEffect(() => {
    if (!currentOrgId) return;
    computeMonthlyBilan(currentOrgId, currentYear).then(setData);
  }, [currentOrgId, currentYear]);

  if (!data) return <div className="py-20 text-center text-primary-400">Calcul en cours…</div>;

  const lines = side === 'actif' ? data.actif : data.passif;
  const totalLine = lines.find((l) => l.code === '_BZ' || l.code === '_DZ');
  const grandsPostes = lines.filter((l) => l.total).slice(0, 5);

  // Chart : evolution top postes
  const chartData = data.months.map((m, i) => {
    const obj: any = { mois: m };
    grandsPostes.forEach((p) => { obj[p.label] = p.values[i]; });
    return obj;
  });

  const exportCSV = () => {
    const head = ['Code', 'Libellé', ...data.months, 'Clôture'].join(';');
    const rows = lines.map((l) => [l.code, `"${l.label}"`, ...l.values.map(String), String(l.ytd)].join(';'));
    const blob = new Blob(['﻿' + [head, ...rows].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `bilan-mensuel-${side}-${currentYear}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5 animate-fade-in-up">
      <PageHeader
        title="Bilan comparatif mensuel"
        subtitle={`${org?.name ?? '—'} · Exercice ${currentYear} · Évolution structure financière 12 mois`}
        action={<button className="btn-outline" onClick={exportCSV}><Download className="w-4 h-4" /> CSV</button>}
      />

      <TabSwitch tabs={[{ key: 'actif', label: 'ACTIF' }, { key: 'passif', label: 'PASSIF' }]} value={side} onChange={(v) => setSide(v as Side)} />

      {/* KPI : totaux ouverture / clôture */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KPICard
          variant="hero"
          title={`Total ${side === 'actif' ? 'Actif' : 'Passif'} — clôture`}
          value={fmtK(totalLine?.ytd ?? 0)}
          unit="XOF"
          icon={<Layers className="w-5 h-5" strokeWidth={2} />}
          variation={totalLine?.values?.[0] ? (((totalLine.ytd ?? 0) - totalLine.values[0]) / Math.abs(totalLine.values[0])) * 100 : undefined}
          vsLabel="vs début exercice"
        />
        <KPICard title="Plus gros poste" value={grandsPostes[0]?.label ?? '—'} subValue={fmtK(grandsPostes[0]?.ytd ?? 0)} icon={<Layers className="w-4 h-4" />} />
        <KPICard title="Nombre de postes" value={String(lines.filter((l) => !l.total).length)} subValue="Lignes détaillées" icon={<Layers className="w-4 h-4" />} />
      </div>

      <ChartCard title={`Évolution ${side} — top postes`} subtitle="12 mois — vue empilée" accent={ct.accent}>
        <ResponsiveContainer width="100%" height={320}>
          <AreaChart data={chartData}>
            <defs>
              {grandsPostes.map((_, i) => (
                <linearGradient key={i} id={`grad-${i}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={ct.at(i)} stopOpacity={0.6} />
                  <stop offset="100%" stopColor={ct.at(i)} stopOpacity={0.05} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid {...ct.gridProps} />
            <XAxis dataKey="mois" {...ct.axisProps} />
            <YAxis {...ct.axisProps} tickFormatter={fmtK} />
            <Tooltip formatter={(v: any) => fmtFull(v)} contentStyle={ct.tooltipStyle} itemStyle={ct.tooltipItemStyle} labelStyle={ct.tooltipLabelStyle} />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 10 }} iconType="circle" iconSize={8} />
            {grandsPostes.map((p, i) => (
              <Area key={p.code} type="monotone" dataKey={p.label} stackId="1" stroke={ct.at(i)} fill={`url(#grad-${i})`} strokeWidth={2} />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Détail par poste — 12 mois" subtitle="Tableau exportable" accent={ct.at(2)}>
        <div className="overflow-x-auto -mx-5">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b-2 border-primary-200 dark:border-primary-700 text-[10px] uppercase tracking-wider text-primary-500">
                <th className="text-left py-2 px-3 sticky left-0 bg-surface dark:bg-primary-900 z-10">Code</th>
                <th className="text-left py-2 px-3 sticky left-12 bg-surface dark:bg-primary-900 z-10 min-w-[220px]">Libellé</th>
                {data.months.map((m) => <th key={m} className="text-right py-2 px-2 num min-w-[70px]">{m}</th>)}
                <th className="text-right py-2 px-3 num bg-primary-100 dark:bg-primary-800 min-w-[90px]">Clôture</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={l.code + i} className={`${l.total ? 'bg-primary-100/60 dark:bg-primary-800/60 font-semibold' : 'table-row-hover'} border-b border-primary-100/60 dark:border-primary-800/40`}>
                  <td className="py-1.5 px-3 text-primary-400 num sticky left-0 bg-inherit text-[10px]">{l.code}</td>
                  <td className="py-1.5 px-3 sticky left-12 bg-inherit" style={{ paddingLeft: `${0.75 + (l.indent ?? 0) * 0.75}rem` }}>{l.label}</td>
                  {l.values.map((v, j) => (
                    <td key={j} className={`text-right py-1.5 px-2 num tabular-nums ${v === 0 ? 'text-primary-300' : ''}`}>{v === 0 ? '—' : fmtK(v)}</td>
                  ))}
                  <td className="text-right py-1.5 px-3 num font-semibold bg-primary-50/50 dark:bg-primary-900/50">{fmtFull(l.ytd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>
    </div>
  );
}
