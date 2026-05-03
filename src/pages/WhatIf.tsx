/**
 * Sensibilité (What-if) — sliders sur CA, marge, coûts fixes → impact résultat.
 * Outil de pilotage : "Que se passe-t-il si... ?"
 */
import { useMemo, useState } from 'react';
import { TrendingUp, Sliders, Target } from 'lucide-react';
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine } from 'recharts';
import { PageHeader } from '../components/layout/PageHeader';
import { DashboardTopBar } from '../components/ui/DashboardTopBar';
import { ChartCard } from '../components/ui/ChartCard';
import { KPICard } from '../components/ui/KPICardV2';
import { useStatements, useCurrentOrg } from '../hooks/useFinancials';
import { fmtFull, fmtK, fmtPct } from '../lib/format';
import { useChartTheme } from '../lib/chartTheme';

export default function WhatIfPage() {
  const org = useCurrentOrg();
  const { sig } = useStatements();
  const ct = useChartTheme();

  // Sliders : variations en %
  const [deltaCA, setDeltaCA] = useState(0);
  const [deltaMarge, setDeltaMarge] = useState(0);
  const [deltaCharges, setDeltaCharges] = useState(0);

  const sim = useMemo(() => {
    if (!sig) return null;
    const baseCA = sig.ca;
    const baseMarge = sig.margeBrute;
    const baseCharges = sig.ca - sig.margeBrute - sig.ebe; // estim charges de structure
    const baseRN = sig.resultat;

    const newCA = baseCA * (1 + deltaCA / 100);
    const margePct = baseCA ? baseMarge / baseCA : 0;
    const newMarge = newCA * (margePct + deltaMarge / 100);
    const newCharges = baseCharges * (1 + deltaCharges / 100);
    const newRN = newMarge - newCharges;
    const newMargeNette = newCA ? (newRN / newCA) * 100 : 0;

    return { baseCA, baseMarge, baseCharges, baseRN, newCA, newMarge, newCharges, newRN, newMargeNette };
  }, [sig, deltaCA, deltaMarge, deltaCharges]);

  const chartData = sim ? [
    { name: 'Actuel', CA: sim.baseCA, Marge: sim.baseMarge, Charges: sim.baseCharges, Résultat: sim.baseRN },
    { name: 'Simulé', CA: sim.newCA, Marge: sim.newMarge, Charges: sim.newCharges, Résultat: sim.newRN },
  ] : [];

  if (!sig || !sim) return <div className="py-20 text-center text-primary-400">Chargement…</div>;

  return (
    <div className="space-y-5 animate-fade-in-up">
      <DashboardTopBar currentRoute="/dashboard/whatif" />
      <PageHeader title="Sensibilité (What-if)" subtitle={`${org?.name ?? '—'} · Simulation impacts résultat`} />

      <ChartCard title="Paramètres de simulation" subtitle="Faites varier les hypothèses pour voir l'impact" accent={ct.accent}>
        <div className="grid md:grid-cols-3 gap-6">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-primary-700 dark:text-primary-300">Δ Chiffre d'Affaires</label>
              <span className="text-sm font-bold num" style={{ color: deltaCA >= 0 ? '#22c55e' : '#ef4444' }}>{deltaCA >= 0 ? '+' : ''}{deltaCA}%</span>
            </div>
            <input type="range" min="-50" max="50" value={deltaCA} onChange={(e) => setDeltaCA(parseInt(e.target.value))} className="w-full" />
            <div className="flex justify-between text-[10px] text-primary-400 mt-1"><span>-50%</span><span>0%</span><span>+50%</span></div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-primary-700 dark:text-primary-300">Δ Taux de marge</label>
              <span className="text-sm font-bold num" style={{ color: deltaMarge >= 0 ? '#22c55e' : '#ef4444' }}>{deltaMarge >= 0 ? '+' : ''}{deltaMarge} pts</span>
            </div>
            <input type="range" min="-20" max="20" value={deltaMarge} onChange={(e) => setDeltaMarge(parseInt(e.target.value))} className="w-full" />
            <div className="flex justify-between text-[10px] text-primary-400 mt-1"><span>-20 pts</span><span>0</span><span>+20 pts</span></div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-primary-700 dark:text-primary-300">Δ Charges fixes</label>
              <span className="text-sm font-bold num" style={{ color: deltaCharges <= 0 ? '#22c55e' : '#ef4444' }}>{deltaCharges >= 0 ? '+' : ''}{deltaCharges}%</span>
            </div>
            <input type="range" min="-30" max="30" value={deltaCharges} onChange={(e) => setDeltaCharges(parseInt(e.target.value))} className="w-full" />
            <div className="flex justify-between text-[10px] text-primary-400 mt-1"><span>-30%</span><span>0%</span><span>+30%</span></div>
          </div>
        </div>
      </ChartCard>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <KPICard
          variant="hero"
          title="Résultat simulé"
          value={fmtK(sim.newRN)}
          unit="XOF"
          icon={<Target className="w-5 h-5" />}
          variation={sim.baseRN ? ((sim.newRN - sim.baseRN) / Math.abs(sim.baseRN)) * 100 : undefined}
          vsLabel="vs actuel"
        />
        <KPICard title="CA simulé" value={fmtK(sim.newCA)} unit="XOF" icon={<TrendingUp className="w-4 h-4" />} subValue={`Actuel : ${fmtK(sim.baseCA)}`} />
        <KPICard title="Marge brute simulée" value={fmtK(sim.newMarge)} unit="XOF" icon={<Sliders className="w-4 h-4" />} />
        <KPICard title="Marge nette simulée" value={fmtPct(sim.newMargeNette)} icon={<Target className="w-4 h-4" />} />
      </div>

      <ChartCard title="Comparaison Actuel vs Simulé" accent={ct.accent}>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={chartData} barCategoryGap="30%">
            <CartesianGrid {...ct.gridProps} />
            <XAxis dataKey="name" {...ct.axisProps} />
            <YAxis {...ct.axisProps} tickFormatter={fmtK} />
            <Tooltip formatter={(v: any) => fmtFull(v)} contentStyle={ct.tooltipStyle} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
            <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
            <ReferenceLine y={0} stroke={ct.grid} />
            <Bar dataKey="CA" fill={ct.at(0)} radius={[4, 4, 0, 0]} />
            <Bar dataKey="Marge" fill={ct.at(2)} radius={[4, 4, 0, 0]} />
            <Bar dataKey="Charges" fill={ct.at(3)} radius={[4, 4, 0, 0]} />
            <Line type="monotone" dataKey="Résultat" stroke={ct.accent} strokeWidth={3} dot={{ r: 6 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}
