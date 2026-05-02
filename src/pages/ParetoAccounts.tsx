// Analyse ABC / Pareto des comptes
// Identifie les 20 % de comptes qui portent 80 % du CA / des charges.
import { useMemo, useState } from 'react';
import { ArrowLeft, TrendingUp, TrendingDown, Target, Activity } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ResponsiveBar } from '@nivo/bar';
import { ResponsiveLine } from '@nivo/line';
import { ChartCard } from '../components/ui/ChartCard';
import { DashHeader } from '../components/ui/DashHeader';
import { KPICard } from '../components/ui/KPICardV2';
import { useApp } from '../store/app';
import { useCurrentOrg, useStatements } from '../hooks/useFinancials';
import { useChartTheme } from '../lib/chartTheme';
import { fmtFull, fmtK } from '../lib/format';

type Mode = 'charges' | 'produits';

export default function ParetoAccounts() {
  const { currentYear } = useApp();
  const org = useCurrentOrg();
  const { movements, balance } = useStatements();
  const ct = useChartTheme();
  const [mode, setMode] = useState<Mode>('charges');

  const { rows, totalPareto, classA, classB, classC } = useMemo(() => {
    const src = movements.length > 0 ? movements : balance;
    const filtered = mode === 'charges'
      ? src.filter((r) => r.account.startsWith('6') || r.account.startsWith('81') || r.account.startsWith('83') || r.account.startsWith('85'))
      : src.filter((r) => r.account.startsWith('7') || r.account.startsWith('82') || r.account.startsWith('84') || r.account.startsWith('86') || r.account.startsWith('88'));

    const sign = mode === 'charges' ? 1 : -1;
    const rows = filtered
      .map((r) => ({ code: r.account, label: r.label, value: Math.abs((r.debit - r.credit) * sign) }))
      .filter((r) => r.value > 0)
      .sort((a, b) => b.value - a.value);

    const total = rows.reduce((s, r) => s + r.value, 0);
    let cumul = 0;
    const enriched = rows.map((r, idx) => {
      cumul += r.value;
      const pctCumul = total ? (cumul / total) * 100 : 0;
      const pct = total ? (r.value / total) * 100 : 0;
      const classe: 'A' | 'B' | 'C' =
        pctCumul <= 80 ? 'A' :
        pctCumul <= 95 ? 'B' : 'C';
      return { ...r, pct, pctCumul, rank: idx + 1, classe };
    });

    const classA = enriched.filter((r) => r.classe === 'A');
    const classB = enriched.filter((r) => r.classe === 'B');
    const classC = enriched.filter((r) => r.classe === 'C');

    return { rows: enriched, totalPareto: total, classA, classB, classC };
  }, [movements, balance, mode]);

  const top20 = rows.slice(0, 20);

  const nivoTheme = {
    background: 'transparent',
    text: { fontSize: 10, fill: 'rgb(var(--p-600))' },
    axis: {
      ticks: { text: { fontSize: 9, fill: 'rgb(var(--p-500))' } },
      legend: { text: { fontSize: 10, fill: 'rgb(var(--p-600))' } },
      domain: { line: { stroke: 'rgb(var(--p-300))', strokeWidth: 1 } },
    },
    grid: { line: { stroke: 'rgb(var(--p-200))', strokeDasharray: '3 3' } },
    tooltip: {
      container: { background: 'rgb(var(--p-900))', color: 'rgb(var(--p-50))', fontSize: 11, borderRadius: 8, padding: '8px 12px' },
    },
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <Link to="/dashboards" className="btn-ghost text-sm"><ArrowLeft className="w-4 h-4" /> Catalogue</Link>
        <div className="flex gap-1 p-0.5 bg-primary-100 dark:bg-primary-900 rounded-lg border border-primary-200 dark:border-primary-800">
          <button onClick={() => setMode('charges')} className={`px-3 py-1 text-[11px] rounded font-medium ${mode === 'charges' ? 'bg-primary-900 text-primary-50 dark:bg-primary-100 dark:text-primary-900' : 'text-primary-600'}`}>Charges</button>
          <button onClick={() => setMode('produits')} className={`px-3 py-1 text-[11px] rounded font-medium ${mode === 'produits' ? 'bg-primary-900 text-primary-50 dark:bg-primary-100 dark:text-primary-900' : 'text-primary-600'}`}>Produits</button>
        </div>
      </div>

      <DashHeader
        icon="AB"
        title={`Analyse ABC — ${mode === 'charges' ? 'Charges' : 'Produits'}`}
        subtitle={`Pareto des comptes qui portent 80 % du volume — ${org?.name ?? '—'} · Exercice ${currentYear}`}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <KPICard title={`Total ${mode}`} value={fmtK(totalPareto)} unit="XOF" icon={mode === 'charges' ? <TrendingDown className="w-4 h-4" /> : <TrendingUp className="w-4 h-4" />} color={mode === 'charges' ? '#ef4444' : '#22c55e'} />
        <KPICard title="Classe A — 80 %" value={String(classA.length)} subValue={`comptes · ${totalPareto ? Math.round((classA.reduce((s, r) => s + r.value, 0) / totalPareto) * 100) : 0} % du total`} icon={<Target className="w-4 h-4" />} color={ct.at(0)} />
        <KPICard title="Classe B — 80-95 %" value={String(classB.length)} subValue="comptes secondaires" icon={<Activity className="w-4 h-4" />} color={ct.at(3)} />
        <KPICard title="Classe C — 95-100 %" value={String(classC.length)} subValue="queue longue" icon={<Activity className="w-4 h-4" />} color={ct.at(5)} />
      </div>

      <ChartCard title="Courbe de Pareto — Top 20 comptes" subtitle="Barres : montant · Ligne : cumulé %" accent={ct.at(0)} className="mb-4">
        <div style={{ height: 280 }}>
          <ResponsiveBar
            data={top20.map((r) => ({ code: r.code, value: Math.round(r.value), cumul: Math.round(r.pctCumul) }))}
            keys={['value']}
            indexBy="code"
            margin={{ top: 20, right: 60, bottom: 60, left: 60 }}
            padding={0.25}
            colors={({ data }) => {
              const pctCumul = (data as any).cumul as number;
              return pctCumul <= 80 ? '#ef4444' : pctCumul <= 95 ? '#f59e0b' : ct.at(5);
            }}
            colorBy="indexValue"
            axisBottom={{ tickRotation: -55, legend: 'Compte', legendOffset: 50, legendPosition: 'middle' }}
            axisLeft={{ format: (v: number) => fmtK(v), legend: 'XOF', legendOffset: -50, legendPosition: 'middle' }}
            borderRadius={2}
            enableLabel={false}
            theme={nivoTheme}
            animate={false}
          />
        </div>
        <div style={{ height: 110 }} className="mt-2">
          <ResponsiveLine
            data={[{ id: '% cumulé', data: top20.map((r) => ({ x: r.code, y: r.pctCumul })) }]}
            margin={{ top: 10, right: 60, bottom: 30, left: 60 }}
            xScale={{ type: 'point' }}
            yScale={{ type: 'linear', min: 0, max: 100 }}
            colors={['#22c55e']}
            lineWidth={2.5}
            enablePoints
            pointSize={5}
            axisBottom={null}
            axisLeft={{ format: (v: number) => `${v} %` }}
            enableGridY
            gridYValues={[0, 50, 80, 100]}
            theme={nivoTheme}
            markers={[
              { axis: 'y', value: 80, lineStyle: { stroke: '#f59e0b', strokeWidth: 1, strokeDasharray: '4 4' }, legend: '80 %', textStyle: { fontSize: 9, fill: '#f59e0b' } },
            ]}
            animate={false}
          />
        </div>
      </ChartCard>

      <ChartCard title="Détail par classe ABC" subtitle={`${rows.length} comptes au total — classés par contribution décroissante`} accent={ct.at(3)}>
        <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
          <table className="w-full text-[12px]">
            <thead className="sticky top-0 bg-primary-100 dark:bg-primary-900 border-b-2 border-primary-300 dark:border-primary-700 text-[10px] uppercase tracking-wider text-primary-500">
              <tr>
                <th className="text-left py-2 px-3">Rang</th>
                <th className="text-left py-2 px-3">Compte</th>
                <th className="text-left py-2 px-3">Libellé</th>
                <th className="text-right py-2 px-3">Montant</th>
                <th className="text-right py-2 px-3">% du total</th>
                <th className="text-right py-2 px-3">% cumulé</th>
                <th className="text-center py-2 px-3">Classe</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-primary-100 dark:divide-primary-800">
              {rows.map((r) => (
                <tr key={r.code} className="hover:bg-primary-100/40 dark:hover:bg-primary-900/40">
                  <td className="py-1.5 px-3 num text-primary-500">{r.rank}</td>
                  <td className="py-1.5 px-3 num font-mono text-primary-700 dark:text-primary-300">{r.code}</td>
                  <td className="py-1.5 px-3">{r.label}</td>
                  <td className="py-1.5 px-3 text-right num font-semibold">{fmtFull(r.value)}</td>
                  <td className="py-1.5 px-3 text-right num text-primary-500">{r.pct.toFixed(1)} %</td>
                  <td className="py-1.5 px-3 text-right num">
                    <div className="inline-flex items-center gap-2">
                      <div className="w-16 h-1 bg-primary-200/60 dark:bg-primary-800/60 rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-primary-900 dark:bg-primary-100" style={{ width: `${r.pctCumul}%` }} />
                      </div>
                      <span>{r.pctCumul.toFixed(1)} %</span>
                    </div>
                  </td>
                  <td className="py-1.5 px-3 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                      r.classe === 'A' ? 'bg-error/15 text-error' :
                      r.classe === 'B' ? 'bg-warning/15 text-warning' :
                      'bg-primary-200 dark:bg-primary-800 text-primary-600 dark:text-primary-300'
                    }`}>
                      {r.classe}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>
    </div>
  );
}
