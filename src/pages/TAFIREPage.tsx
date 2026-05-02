/**
 * TAFIRE — Tableau Financier des Ressources et Emplois.
 * État SYSCOHADA officiel obligatoire en système Normal.
 * Vue structurelle : où va le cash, d'où vient-il.
 */
import { useEffect, useState } from 'react';
import { ArrowDownToLine, TrendingUp, Banknote } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { PageHeader } from '../components/layout/PageHeader';
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

      {/* Tables Emplois / Ressources avec TOTAUX alignés au MÊME niveau vertical.
          Méthode : on sépare les lignes "data" et "total", on padd la table la
          plus courte avec des lignes invisibles pour que le TOTAL atterrisse au
          bon endroit. Les deux tables ont ainsi la même hauteur et le total est
          aligné. */}
      {(() => {
        const emploisData = data.emplois.filter((e) => !(e.grand || e.total));
        const emploisTotal = data.emplois.filter((e) => e.grand || e.total);
        const ressourcesData = data.ressources.filter((r) => !(r.grand || r.total));
        const ressourcesTotal = data.ressources.filter((r) => r.grand || r.total);
        const maxDataRows = Math.max(emploisData.length, ressourcesData.length);

        const renderRow = (r: any, key: string | number) => (
          <tr key={key} className="border-b border-primary-100/60 dark:border-primary-800/40">
            <td className="py-2 px-2 text-[10px] text-primary-400 num w-24">{r.code}</td>
            <td className="py-2 px-2" style={{ paddingLeft: `${0.5 + (r.indent ?? 0) * 0.75}rem` }}>{r.label}</td>
            <td className="text-right py-2 px-2 num">{fmtFull(r.value)}</td>
          </tr>
        );
        const renderEmptyRow = (key: string) => (
          <tr key={key} className="border-b border-primary-100/60 dark:border-primary-800/40" aria-hidden>
            <td className="py-2 px-2">&nbsp;</td>
            <td className="py-2 px-2">&nbsp;</td>
            <td className="py-2 px-2">&nbsp;</td>
          </tr>
        );
        const renderTotal = (r: any, key: string | number) => (
          <tr key={key} className="font-bold bg-primary-900 text-primary-50 dark:bg-primary-100 dark:text-primary-900">
            <td className="py-2.5 px-2 text-[10px] num opacity-80 w-24">{r.code}</td>
            <td className="py-2.5 px-2" style={{ paddingLeft: `${0.5 + (r.indent ?? 0) * 0.75}rem` }}>{r.label}</td>
            <td className="text-right py-2.5 px-2 num">{fmtFull(r.value)}</td>
          </tr>
        );

        return (
          <div className="grid lg:grid-cols-2 gap-5">
            <ChartCard title="EMPLOIS STABLES" subtitle="Où va le cash" accent={ct.at(1)}>
              <table className="w-full text-sm">
                <tbody>
                  {emploisData.map((e, i) => renderRow(e, `e-${e.code}-${i}`))}
                  {/* Padding pour aligner le total */}
                  {Array.from({ length: maxDataRows - emploisData.length }).map((_, i) => renderEmptyRow(`pad-e-${i}`))}
                  {emploisTotal.map((e, i) => renderTotal(e, `et-${e.code}-${i}`))}
                </tbody>
              </table>
            </ChartCard>

            <ChartCard title="RESSOURCES STABLES" subtitle="D'où vient le cash" accent={ct.at(0)}>
              <table className="w-full text-sm">
                <tbody>
                  {ressourcesData.map((r, i) => renderRow(r, `r-${r.code}-${i}`))}
                  {Array.from({ length: maxDataRows - ressourcesData.length }).map((_, i) => renderEmptyRow(`pad-r-${i}`))}
                  {ressourcesTotal.map((r, i) => renderTotal(r, `rt-${r.code}-${i}`))}
                </tbody>
              </table>
            </ChartCard>
          </div>
        );
      })()}
    </div>
  );
}
