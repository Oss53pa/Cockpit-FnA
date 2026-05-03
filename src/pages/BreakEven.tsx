// Seuil de rentabilité — Point mort visuel
// Décompose le CR en coûts fixes vs variables et calcule le point mort.
import { useMemo, useState } from 'react';
import { ArrowLeft, TrendingUp, Target, Activity, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ResponsiveLine } from '@nivo/line';
import { ChartCard } from '../components/ui/ChartCard';
import { DashHeader } from '../components/ui/DashHeader';
import { DashboardTopBar } from '../components/ui/DashboardTopBar';
import { KPICard } from '../components/ui/KPICardV2';
import { useApp } from '../store/app';
import { useBalance, useCurrentOrg, useStatements } from '../hooks/useFinancials';
import { useChartTheme } from '../lib/chartTheme';
import { fmtFull, fmtK } from '../lib/format';

export default function BreakEven() {
  const { currentYear } = useApp();
  const org = useCurrentOrg();
  const { sig, movements } = useStatements();
  const balance = useBalance();
  const ct = useChartTheme();

  // Proportion de variables / fixes — ajustable
  const [variableRatio, setVariableRatio] = useState(60);

  const { ca, cv, cf, mcv, tauxMcv, pointMort, margeSecurite, indiceSecu } = useMemo(() => {
    const ca = sig?.ca ?? 0;
    // Approximation SYSCOHADA :
    // - Coûts variables : achats marchandises/MP + transport + services ext.
    //   pondérés par variableRatio%
    const mvSource = movements.length > 0 ? movements : balance;
    const chargesExpl = mvSource
      .filter((r) => r.account.startsWith('6') && !r.account.startsWith('67') && !r.account.startsWith('68') && !r.account.startsWith('69'))
      .reduce((s, r) => s + r.debit - r.credit, 0);
    const dotations = mvSource
      .filter((r) => r.account.startsWith('68') || r.account.startsWith('69'))
      .reduce((s, r) => s + r.debit - r.credit, 0);
    const personnel = mvSource
      .filter((r) => r.account.startsWith('66'))
      .reduce((s, r) => s + r.debit - r.credit, 0);

    // Fixes = personnel + dotations + chargesFinancières
    const chargesFin = mvSource
      .filter((r) => r.account.startsWith('67'))
      .reduce((s, r) => s + r.debit - r.credit, 0);

    // Variables = part variable des charges d'exploitation hors personnel
    const chargesNonPersonnel = chargesExpl - personnel;
    const cv = chargesNonPersonnel * (variableRatio / 100);
    const cf = (chargesNonPersonnel * (1 - variableRatio / 100)) + personnel + dotations + chargesFin;

    const mcv = ca - cv;
    const tauxMcv = ca ? (mcv / ca) * 100 : 0;
    const pointMort = tauxMcv > 0 ? (cf / (tauxMcv / 100)) : 0;
    const margeSecurite = ca - pointMort;
    const indiceSecu = ca ? (margeSecurite / ca) * 100 : 0;

    return { ca, cv, cf, mcv, tauxMcv, pointMort, margeSecurite, indiceSecu };
  }, [sig, movements, balance, variableRatio]);

  // Courbe CA / Coûts total / Point mort
  const chartData = useMemo(() => {
    const maxCA = Math.max(ca * 1.5, pointMort * 1.5, 1);
    const steps = 10;
    const points: Array<{ x: number }> = [];
    for (let i = 0; i <= steps; i++) points.push({ x: (maxCA * i) / steps });

    return [
      {
        id: "Chiffre d'affaires",
        data: points.map((p) => ({ x: p.x, y: p.x })),
      },
      {
        id: 'Coûts totaux',
        data: points.map((p) => ({ x: p.x, y: cf + p.x * ((cv / ca) || 0) })),
      },
      {
        id: 'Coûts fixes',
        data: points.map((p) => ({ x: p.x, y: cf })),
      },
    ];
  }, [ca, cv, cf, pointMort]);

  const nivoTheme = {
    background: 'transparent',
    text: { fontSize: 10, fill: 'rgb(var(--p-600))' },
    axis: {
      ticks: { text: { fontSize: 9, fill: 'rgb(var(--p-500))' } },
      domain: { line: { stroke: 'rgb(var(--p-300))', strokeWidth: 1 } },
    },
    grid: { line: { stroke: 'rgb(var(--p-200))', strokeDasharray: '3 3' } },
  };

  return (
    <div>
      <DashboardTopBar currentRoute="/dashboard/breakeven" />

      <DashHeader
        icon="BE"
        title="Seuil de rentabilité"
        subtitle={`Point mort & marge de sécurité — ${org?.name ?? '—'} · Exercice ${currentYear}`}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <KPICard title="Chiffre d'affaires" value={fmtK(ca)} unit="XOF" icon={<TrendingUp className="w-4 h-4" />} color={ct.at(0)} />
        <KPICard title="Point mort" value={fmtK(pointMort)} unit="XOF" subValue={`MCV : ${tauxMcv.toFixed(1)} %`} icon={<Target className="w-4 h-4" />} color={ct.at(3)} />
        <KPICard title="Marge de sécurité" value={fmtK(margeSecurite)} unit="XOF" icon={<Activity className="w-4 h-4" />} color={margeSecurite >= 0 ? '#22c55e' : '#ef4444'} />
        <KPICard title="Indice de sécurité" value={`${indiceSecu.toFixed(1)} %`} subValue={indiceSecu > 20 ? 'Zone confortable' : indiceSecu > 0 ? 'Zone de vigilance' : 'SOUS le point mort'} icon={<AlertTriangle className="w-4 h-4" />} color={indiceSecu > 20 ? '#22c55e' : indiceSecu > 0 ? '#f59e0b' : '#ef4444'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-4">
        <ChartCard title="Décomposition coûts" subtitle="Fixes vs variables sur l'exercice" accent={ct.at(1)} className="lg:col-span-1">
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="font-semibold">Coûts fixes</span>
                <span className="num">{fmtFull(cf)}</span>
              </div>
              <div className="h-2 bg-primary-200/60 dark:bg-primary-800/60 rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-primary-900 dark:bg-primary-100" style={{ width: `${(cf / (cf + cv)) * 100}%` }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="font-semibold">Coûts variables</span>
                <span className="num">{fmtFull(cv)}</span>
              </div>
              <div className="h-2 bg-primary-200/60 dark:bg-primary-800/60 rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-primary-500" style={{ width: `${(cv / (cf + cv)) * 100}%` }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="font-semibold text-success">Marge sur coût variable</span>
                <span className="num text-success">{fmtFull(mcv)}</span>
              </div>
              <div className="h-2 bg-success/20 rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-success" style={{ width: `${Math.min(100, Math.max(0, tauxMcv))}%` }} />
              </div>
            </div>

            <div className="pt-3 border-t border-primary-200/50 dark:border-primary-800/50 mt-3">
              <label className="text-[10px] uppercase tracking-wider font-semibold text-primary-500">
                Part variable des charges (hors personnel) : {variableRatio} %
              </label>
              <input
                type="range" min={0} max={100} step={5}
                value={variableRatio}
                onChange={(e) => setVariableRatio(Number(e.target.value))}
                className="w-full mt-1"
              />
              <p className="text-[10px] text-primary-400 mt-1">Ajuste cette proportion selon ton modèle d'activité.</p>
            </div>
          </div>
        </ChartCard>

        <ChartCard title="Courbe du point mort" subtitle="Visualisation classique CA vs Coûts totaux" accent={ct.at(0)} className="lg:col-span-2">
          <div style={{ height: 260 }}>
            <ResponsiveLine
              data={chartData}
              margin={{ top: 20, right: 110, bottom: 40, left: 60 }}
              xScale={{ type: 'linear', min: 0, max: 'auto' }}
              yScale={{ type: 'linear', min: 0, max: 'auto' }}
              curve="linear"
              colors={[ct.at(0), '#ef4444', '#f59e0b']}
              lineWidth={2.5}
              enablePoints={false}
              enableArea={false}
              axisBottom={{ format: (v: number) => fmtK(v), legend: 'Chiffre d\'affaires', legendOffset: 32, legendPosition: 'middle' }}
              axisLeft={{ format: (v: number) => fmtK(v), legend: 'XOF', legendOffset: -50, legendPosition: 'middle' }}
              theme={nivoTheme}
              animate={false}
              legends={[
                { anchor: 'bottom-right', direction: 'column', translateX: 100, translateY: 0, itemWidth: 90, itemHeight: 18, itemTextColor: 'rgb(var(--p-600))', symbolSize: 10 },
              ]}
              markers={pointMort > 0 ? [
                { axis: 'x', value: pointMort, lineStyle: { stroke: '#22c55e', strokeWidth: 1.5, strokeDasharray: '4 4' }, legend: `PM : ${fmtK(pointMort)}`, legendOrientation: 'vertical', textStyle: { fill: '#22c55e', fontSize: 10, fontWeight: 600 } },
              ] : []}
            />
          </div>
        </ChartCard>
      </div>

      <ChartCard title="Lecture" subtitle="Interprétation de l'indice de sécurité" accent={ct.at(3)}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[12px]">
          <div className="card p-3 bg-success/5 border-success/20">
            <p className="font-semibold text-success mb-1">Indice &gt; 20 %</p>
            <p className="text-primary-600 dark:text-primary-300">Zone de confort — le CA peut chuter jusqu'à {Math.max(0, indiceSecu).toFixed(0)} % avant d'entrer dans la perte.</p>
          </div>
          <div className="card p-3 bg-warning/5 border-warning/20">
            <p className="font-semibold text-warning mb-1">Indice entre 0 % et 20 %</p>
            <p className="text-primary-600 dark:text-primary-300">Zone de vigilance — peu de marge de manœuvre. Surveillez les charges fixes.</p>
          </div>
          <div className="card p-3 bg-error/5 border-error/20">
            <p className="font-semibold text-error mb-1">Indice &lt; 0 %</p>
            <p className="text-primary-600 dark:text-primary-300">Vous êtes SOUS le point mort — l'exploitation dégage une perte structurelle à ce niveau de coûts.</p>
          </div>
        </div>
      </ChartCard>
    </div>
  );
}
