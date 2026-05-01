/**
 * Score de santé financière — Z-Score Altman + score Cockpit 0-100.
 * Vue synthétique de risque de défaillance (utile aux banquiers, investisseurs).
 */
import { useEffect, useState } from 'react';
import { ShieldCheck, AlertTriangle, Award } from 'lucide-react';
import { ResponsiveContainer, RadialBarChart, RadialBar, PolarAngleAxis } from 'recharts';
import { PageHeader } from '../components/layout/PageHeader';
import { ChartCard } from '../components/ui/ChartCard';
import { useApp } from '../store/app';
import { computeFinancialScore, type FinancialScore } from '../engine/proph3/scoring';
import { useStatements, useRatios, useCurrentOrg } from '../hooks/useFinancials';
import { useChartTheme } from '../lib/chartTheme';

export default function ZScorePage() {
  const org = useCurrentOrg();
  const { sig, bilan } = useStatements();
  const ratios = useRatios();
  const ct = useChartTheme();
  const [score, setScore] = useState<FinancialScore | null>(null);

  useEffect(() => {
    if (!sig || !bilan || ratios.length === 0) return;
    setScore(computeFinancialScore(ratios, sig, bilan.actif, bilan.passif));
  }, [sig, bilan, ratios]);

  if (!score) {
    return <div className="py-20 text-center text-primary-400">Calcul en cours…</div>;
  }

  const scoreColor = score.global >= 75 ? '#22c55e' : score.global >= 50 ? '#f59e0b' : '#ef4444';
  const Icon = score.global >= 75 ? Award : score.global >= 50 ? ShieldCheck : AlertTriangle;

  return (
    <div className="space-y-5 animate-fade-in-up">
      <PageHeader
        title="Score de santé financière"
        subtitle={`${org?.name ?? '—'} · Z-Score Altman + scoring multi-critères`}
      />

      {/* Hero score */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card-hero p-6 lg:col-span-1 flex flex-col items-center text-center">
          <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center mb-3">
            <Icon className="w-6 h-6" strokeWidth={2} />
          </div>
          <p className="text-[10px] uppercase tracking-[0.15em] text-primary-300 font-semibold">Score global</p>
          <p className="num text-6xl font-bold mt-2" style={{ color: scoreColor }}>{score.global}</p>
          <p className="text-xs text-primary-300 mt-1">/ 100</p>
          <p className="text-sm font-semibold mt-3" style={{ color: scoreColor }}>{score.label}</p>
        </div>

        <ChartCard title="Z-Score Altman" subtitle="Modèle de prédiction défaillance" accent={ct.accent} className="lg:col-span-2">
          <div className="flex items-center gap-6">
            <div className="w-40 h-40 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <RadialBarChart data={[{ name: 'Z', value: Math.min(Math.max(score.zScore * 30, 0), 100), fill: scoreColor }]} innerRadius="60%" outerRadius="100%" startAngle={90} endAngle={-270}>
                  <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
                  <RadialBar background dataKey="value" cornerRadius={10} />
                </RadialBarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1">
              <p className="num text-4xl font-bold tracking-tight" style={{ color: scoreColor }}>{score.zScore.toFixed(2)}</p>
              <p className="text-sm font-semibold mt-1" style={{ color: scoreColor }}>{score.zLabel}</p>
              <div className="mt-4 grid grid-cols-3 gap-2 text-[10px]">
                <div className="border border-error/30 rounded p-1.5"><p className="text-error font-bold">&lt; 1.81</p><p className="text-primary-500">Détresse</p></div>
                <div className="border border-warning/30 rounded p-1.5"><p className="text-warning font-bold">1.81 - 2.99</p><p className="text-primary-500">Zone grise</p></div>
                <div className="border border-success/30 rounded p-1.5"><p className="text-success font-bold">&gt; 2.99</p><p className="text-primary-500">Sain</p></div>
              </div>
            </div>
          </div>
        </ChartCard>
      </div>

      {/* Familles de score */}
      <ChartCard title="Décomposition par famille" subtitle="Scoring pondéré multi-critères" accent={ct.accent}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {score.families.map((f) => {
            const c = f.score >= 75 ? '#22c55e' : f.score >= 50 ? '#f59e0b' : '#ef4444';
            return (
              <div key={f.family} className="border border-primary-200 dark:border-primary-700 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-primary-700 dark:text-primary-200">{f.family}</p>
                  <p className="text-[10px] text-primary-400 num">{(f.weight * 100).toFixed(0)}%</p>
                </div>
                <p className="num text-3xl font-bold tracking-tight" style={{ color: c }}>{f.score}</p>
                <p className="text-[10px] text-primary-500 mt-0.5">/ 100</p>
                <div className="mt-3 h-1 rounded-full bg-primary-100 dark:bg-primary-800 overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${f.score}%`, background: c }} />
                </div>
                {f.details.length > 0 && (
                  <ul className="text-[10px] text-primary-500 mt-3 space-y-0.5">
                    {f.details.slice(0, 3).map((d, i) => <li key={i}>· {d}</li>)}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </ChartCard>

      {/* Recommandations */}
      {score.recommendations.length > 0 && (
        <ChartCard title="Recommandations" subtitle="Actions prioritaires d'amélioration" accent={ct.at(1)}>
          <ul className="space-y-2">
            {score.recommendations.map((r, i) => (
              <li key={i} className="flex items-start gap-3 text-sm">
                <span className="w-6 h-6 rounded-full bg-accent text-white flex items-center justify-center shrink-0 text-xs font-bold mt-0.5">{i + 1}</span>
                <span className="text-primary-700 dark:text-primary-300">{r}</span>
              </li>
            ))}
          </ul>
        </ChartCard>
      )}
    </div>
  );
}
