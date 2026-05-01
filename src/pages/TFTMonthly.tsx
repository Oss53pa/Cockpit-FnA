/**
 * TFT mensuel SYSCOHADA — Tableau des Flux de Trésorerie ventilé sur 12 mois.
 * Design dernière génération : KPI hero, charts élégants, hiérarchie forte.
 */
import { useEffect, useMemo, useState } from 'react';
import { Download, ArrowDownToLine, ArrowUpFromLine, Banknote, Activity, TrendingUp } from 'lucide-react';
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine } from 'recharts';
import { PageHeader } from '../components/layout/PageHeader';
import { ChartCard } from '../components/ui/ChartCard';
import { KPICard } from '../components/ui/KPICardV2';
import { useApp } from '../store/app';
import { computeMonthlyTFT, type MonthlyTFT } from '../engine/flows';
import { fmtFull, fmtK } from '../lib/format';
import { useChartTheme } from '../lib/chartTheme';
import { useCurrentOrg } from '../hooks/useFinancials';

export default function TFTMonthlyPage() {
  const { currentOrgId, currentYear } = useApp();
  const org = useCurrentOrg();
  const ct = useChartTheme();
  const [data, setData] = useState<MonthlyTFT | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!currentOrgId) return;
    setLoading(true);
    computeMonthlyTFT(currentOrgId, currentYear).then(setData).finally(() => setLoading(false));
  }, [currentOrgId, currentYear]);

  // Extraction KPI YTD depuis les lignes
  const kpis = useMemo(() => {
    if (!data) return null;
    const find = (code: string) => data.lines.find((l) => l.code === code);
    return {
      fluxOp: find('FE')?.ytd ?? 0,
      fluxInv: find('FI')?.ytd ?? 0,
      fluxFin: find('FF')?.ytd ?? 0,
      varTreso: find('FZ')?.ytd ?? 0,
      cafg: find('FA')?.ytd ?? 0,
    };
  }, [data]);

  // Série mensuelle pour chart évolution flux
  const chartData = useMemo(() => {
    if (!data) return [];
    const findVals = (code: string) => data.lines.find((l) => l.code === code)?.values ?? Array(12).fill(0);
    const op = findVals('FE'); const inv = findVals('FI'); const fin = findVals('FF');
    return data.months.map((m, i) => ({
      mois: m,
      'Exploitation': op[i],
      'Investissement': inv[i],
      'Financement': fin[i],
      'Variation TN': op[i] + inv[i] + fin[i],
    }));
  }, [data]);

  const exportCSV = () => {
    if (!data) return;
    const head = ['Code', 'Libellé', ...data.months, 'YTD'].join(';');
    const rows = data.lines.map((l) => [l.code, `"${l.label}"`, ...l.values.map(String), String(l.ytd)].join(';'));
    const csv = [head, ...rows].join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `tft-mensuel-${currentYear}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5 animate-fade-in-up">
      <PageHeader
        title="Tableau des Flux de Trésorerie"
        subtitle={`${org?.name ?? '—'} · Exercice ${currentYear} · SYSCOHADA art. 38 — vue mensuelle 12 mois`}
        action={
          <button className="btn-outline" onClick={exportCSV} disabled={!data}>
            <Download className="w-4 h-4" /> Exporter CSV
          </button>
        }
      />

      {loading && <div className="py-20 text-center text-primary-400 text-sm">Calcul en cours…</div>}

      {!loading && kpis && (
        <>
          {/* KPI Hero — 4 colonnes avec Variation TN en hero */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            <KPICard
              variant={kpis.varTreso >= 0 ? 'hero' : 'default'}
              title="Variation Trésorerie YTD"
              value={fmtK(kpis.varTreso)}
              unit="XOF"
              icon={<Banknote className="w-5 h-5" strokeWidth={2} />}
              subValue={kpis.varTreso >= 0 ? 'Trésorerie nette en hausse' : 'Tension trésorerie ⚠'}
            />
            <KPICard
              title="Flux d'Exploitation"
              value={fmtK(kpis.fluxOp)}
              unit="XOF"
              icon={<Activity className="w-4 h-4" strokeWidth={2} />}
              subValue={`CAFG : ${fmtK(kpis.cafg)}`}
            />
            <KPICard
              title="Flux d'Investissement"
              value={fmtK(kpis.fluxInv)}
              unit="XOF"
              icon={<ArrowUpFromLine className="w-4 h-4" strokeWidth={2} />}
              subValue={kpis.fluxInv < 0 ? 'Acquisitions nettes' : 'Cessions nettes'}
              inverse
            />
            <KPICard
              title="Flux de Financement"
              value={fmtK(kpis.fluxFin)}
              unit="XOF"
              icon={<TrendingUp className="w-4 h-4" strokeWidth={2} />}
              subValue="Capital + emprunts"
            />
          </div>

          {/* Chart — évolution mensuelle des 3 flux + variation cumulée */}
          <ChartCard
            title="Évolution mensuelle des flux"
            subtitle="Composante par activité + variation de trésorerie nette"
            accent={ct.accent}
          >
            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart data={chartData} barCategoryGap="25%">
                <CartesianGrid {...ct.gridProps} />
                <XAxis dataKey="mois" {...ct.axisProps} />
                <YAxis {...ct.axisProps} tickFormatter={fmtK} />
                <Tooltip
                  formatter={(v: any) => fmtFull(v)}
                  contentStyle={ct.tooltipStyle}
                  itemStyle={ct.tooltipItemStyle}
                  labelStyle={ct.tooltipLabelStyle}
                  cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 10 }} iconType="circle" iconSize={8} />
                <ReferenceLine y={0} stroke={ct.grid} />
                <Bar dataKey="Exploitation" fill={ct.at(0)} radius={[4, 4, 0, 0]} />
                <Bar dataKey="Investissement" fill={ct.at(2)} radius={[4, 4, 0, 0]} />
                <Bar dataKey="Financement" fill={ct.at(3)} radius={[4, 4, 0, 0]} />
                <Line type="monotone" dataKey="Variation TN" stroke={ct.accent} strokeWidth={2.5} dot={{ r: 3, fill: ct.accent }} activeDot={{ r: 5 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Table détaillée 12 mois — réservée aux experts */}
          {data && (
            <ChartCard
              title="Détail mensuel par poste"
              subtitle="12 mois + cumul YTD — exportable"
              accent={ct.at(2)}
            >
              <div className="overflow-x-auto -mx-5">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b-2 border-primary-200 dark:border-primary-700 text-primary-500 uppercase tracking-wider text-[10px]">
                      <th className="text-left py-2.5 px-3 font-semibold sticky left-0 bg-surface dark:bg-primary-900 z-10 w-12">Code</th>
                      <th className="text-left py-2.5 px-3 font-semibold sticky left-12 bg-surface dark:bg-primary-900 z-10 min-w-[240px]">Libellé</th>
                      {data.months.map((m) => (
                        <th key={m} className="text-right py-2.5 px-2.5 font-semibold num min-w-[78px]">{m}</th>
                      ))}
                      <th className="text-right py-2.5 px-3 font-semibold num bg-primary-100 dark:bg-primary-800 min-w-[100px]">YTD</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.lines.map((l, i) => {
                      const isTotal = l.total || l.grand;
                      return (
                        <tr
                          key={l.code + i}
                          className={`${isTotal ? 'bg-primary-100/60 dark:bg-primary-800/60 font-semibold' : 'table-row-hover'} ${l.grand ? 'border-t-2 border-primary-400 dark:border-primary-600' : 'border-b border-primary-100/60 dark:border-primary-800/40'}`}
                        >
                          <td className="py-1.5 px-3 text-primary-400 num sticky left-0 bg-inherit z-10 text-[10px]">{l.code}</td>
                          <td className="py-1.5 px-3 sticky left-12 bg-inherit z-10" style={{ paddingLeft: `${0.75 + (l.indent ?? 0) * 1}rem` }}>
                            {l.label}
                          </td>
                          {l.values.map((v, j) => (
                            <td key={j} className={`text-right py-1.5 px-2.5 num tabular-nums ${v === 0 ? 'text-primary-300' : ''}`}>
                              {v === 0 ? '—' : fmtFull(v)}
                            </td>
                          ))}
                          <td className="text-right py-1.5 px-3 num tabular-nums font-semibold bg-primary-50/50 dark:bg-primary-900/50">
                            {fmtFull(l.ytd)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </ChartCard>
          )}
        </>
      )}
    </div>
  );
}
