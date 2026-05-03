/**
 * TAFIRE — Tableau Financier des Ressources et Emplois.
 * État SYSCOHADA officiel obligatoire en système Normal.
 * Vue structurelle : où va le cash, d'où vient-il.
 */
import { useEffect, useState } from 'react';
import { ArrowDownToLine, TrendingUp, Banknote } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { PageHeader } from '../components/layout/PageHeader';
import { DashboardTopBar } from '../components/ui/DashboardTopBar';
import { ChartCard } from '../components/ui/ChartCard';
import { KPICard } from '../components/ui/KPICardV2';
import { useApp } from '../store/app';
import { computeTAFIRE, type TAFIREResult } from '../engine/flows';
import { fmtFull, fmtK } from '../lib/format';
import { useChartTheme } from '../lib/chartTheme';
import { useCurrentOrg } from '../hooks/useFinancials';

export default function TAFIREPage() {
  const { currentOrgId, currentYear } = useApp();
  const org = useCurrentOrg();
  const ct = useChartTheme();
  const [data, setData] = useState<TAFIREResult | null>(null);

  useEffect(() => {
    if (!currentOrgId) return;
    computeTAFIRE(currentOrgId, currentYear).then(setData);
  }, [currentOrgId, currentYear]);

  if (!data) return <div className="py-20 text-center text-primary-400">Calcul TAFIRE en cours…</div>;

  const equilibre = Math.abs(data.varFR - data.varBFR - data.varTN) < 1;

  const chartData = [
    { categorie: 'Emplois', value: data.totalEmplois, fill: ct.at(1) },
    { categorie: 'Ressources', value: data.totalRessources, fill: ct.at(0) },
  ];

  return (
    <div className="space-y-5 animate-fade-in-up">
      <DashboardTopBar currentRoute="/dashboard/tafire" />
      <PageHeader
        title="TAFIRE — Tableau financier des ressources et emplois"
        subtitle={`${org?.name ?? '—'} · Exercice ${currentYear} · SYSCOHADA art. 38 (système Normal)`}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard variant="hero" title="Variation FR" value={fmtK(data.varFR)} unit="XOF" icon={<TrendingUp className="w-5 h-5" />} subValue="Ressources − Emplois" />
        <KPICard title="Variation BFR" value={fmtK(data.varBFR)} unit="XOF" icon={<Banknote className="w-4 h-4" />} subValue="Stocks + Créances − Dettes" />
        <KPICard title="Variation TN" value={fmtK(data.varTN)} unit="XOF" icon={<TrendingUp className="w-4 h-4" />} subValue="ΔFR − ΔBFR" />
        <KPICard title="Total Ressources" value={fmtK(data.totalRessources)} unit="XOF" icon={<ArrowDownToLine className="w-4 h-4" />} subValue={`vs Emplois ${fmtK(data.totalEmplois)}`} />
      </div>

      {!equilibre && (
        <div className="card p-4 border-l-4 border-warning bg-warning/5">
          <p className="font-semibold text-warning text-sm">⚠ Équation TAFIRE déséquilibrée</p>
          <p className="text-xs text-primary-600 dark:text-primary-400 mt-1">ΔFR − ΔBFR ≠ ΔTN — vérifier l'intégrité des soldes ouverture/clôture.</p>
        </div>
      )}

      <ChartCard title="Comparaison Emplois vs Ressources" accent={ct.accent}>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData} barCategoryGap="35%">
            <CartesianGrid {...ct.gridProps} />
            <XAxis dataKey="categorie" {...ct.axisProps} />
            <YAxis {...ct.axisProps} tickFormatter={fmtK} />
            <Tooltip formatter={(v: any) => fmtFull(v)} contentStyle={ct.tooltipStyle} itemStyle={ct.tooltipItemStyle} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
            <Bar dataKey="value" radius={[8, 8, 0, 0]} fill={ct.accent} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Tables Emplois / Ressources — TOTAUX en FOOTER fixe à hauteur égale.
          Architecture : flex column avec data en flex-1 + total en mt-auto.
          Garantit l'alignement même avec un nombre de lignes différent. */}
      {(() => {
        const emploisData = data.emplois.filter((e) => !(e.grand || e.total));
        const emploisTotal = data.emplois.find((e) => e.grand || e.total);
        const ressourcesData = data.ressources.filter((r) => !(r.grand || r.total));
        const ressourcesTotal = data.ressources.find((r) => r.grand || r.total);

        const renderRow = (r: any, key: string | number) => (
          <div key={key} className="grid grid-cols-[6rem_1fr_8rem] items-center gap-2 px-2 py-2 border-b border-primary-100/60 dark:border-primary-800/40 text-sm">
            <span className="text-[10px] text-primary-400 num">{r.code}</span>
            <span style={{ paddingLeft: `${(r.indent ?? 0) * 0.75}rem` }}>{r.label}</span>
            <span className="text-right num">{fmtFull(r.value)}</span>
          </div>
        );
        const renderTotal = (r: any) => (
          <div className="grid grid-cols-[6rem_1fr_8rem] items-center gap-2 px-2 py-3 bg-primary-900 text-primary-50 dark:bg-primary-100 dark:text-primary-900 font-bold rounded-b-lg">
            <span className="text-[10px] num opacity-80">{r.code}</span>
            <span style={{ paddingLeft: `${(r.indent ?? 0) * 0.75}rem` }}>{r.label}</span>
            <span className="text-right num">{fmtFull(r.value)}</span>
          </div>
        );

        // Header (col headers) commun — rendu une fois en haut de chaque table
        const renderHeader = () => (
          <div className="grid grid-cols-[6rem_1fr_8rem] items-center gap-2 px-2 py-2 border-b-2 border-primary-300 dark:border-primary-700 text-[10px] uppercase tracking-wider text-primary-500 font-semibold">
            <span>Comptes</span>
            <span>Poste</span>
            <span className="text-right">Montant</span>
          </div>
        );

        return (
          <div className="grid lg:grid-cols-2 gap-5 items-stretch">
            <ChartCard title="EMPLOIS STABLES" subtitle="Où va le cash" accent={ct.at(1)}>
              <div className="flex flex-col h-full">
                {renderHeader()}
                <div className="flex-1">
                  {emploisData.map((e, i) => renderRow(e, `e-${e.code}-${i}`))}
                </div>
                {emploisTotal && <div className="mt-auto">{renderTotal(emploisTotal)}</div>}
              </div>
            </ChartCard>

            <ChartCard title="RESSOURCES STABLES" subtitle="D'où vient le cash" accent={ct.at(0)}>
              <div className="flex flex-col h-full">
                {renderHeader()}
                <div className="flex-1">
                  {ressourcesData.map((r, i) => renderRow(r, `r-${r.code}-${i}`))}
                </div>
                {ressourcesTotal && <div className="mt-auto">{renderTotal(ressourcesTotal)}</div>}
              </div>
            </ChartCard>
          </div>
        );
      })()}
    </div>
  );
}
