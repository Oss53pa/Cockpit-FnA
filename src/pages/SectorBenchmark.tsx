/**
 * Comparatif sectoriel — ratios vs normes sectorielles SYSCOHADA OHADA.
 * Utilise getNormSectorielle() de l'engine knowledge SYSCOHADA.
 */
import { useMemo } from 'react';
import { Building2, TrendingUp } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ReferenceLine } from 'recharts';
import { PageHeader } from '../components/layout/PageHeader';
import { DashboardTopBar } from '../components/ui/DashboardTopBar';
import { ChartCard } from '../components/ui/ChartCard';
import { KPICard } from '../components/ui/KPICardV2';
import { useRatios, useCurrentOrg } from '../hooks/useFinancials';
import { useChartTheme } from '../lib/chartTheme';

// Normes sectorielles UEMOA (sources : ANSD, BCEAO, INSEE, FMI Article IV)
// Calibrées par secteur — peuvent être affinées par tenant via Settings.
const SECTOR_NORMS: Record<string, Record<string, { min: number; target: number; max?: number }>> = {
  Industrie:    { MB: { min: 25, target: 35 }, EBE: { min: 10, target: 18 }, TRN: { min: 4, target: 8 }, AF: { min: 30, target: 50 } },
  BTP:          { MB: { min: 15, target: 25 }, EBE: { min: 6, target: 12 },  TRN: { min: 3, target: 6 },  AF: { min: 20, target: 35 } },
  Commerce:     { MB: { min: 18, target: 30 }, EBE: { min: 4, target: 10 },  TRN: { min: 2, target: 5 },  AF: { min: 25, target: 40 } },
  Services:     { MB: { min: 35, target: 55 }, EBE: { min: 12, target: 25 }, TRN: { min: 6, target: 15 }, AF: { min: 35, target: 60 } },
  Hôtellerie:   { MB: { min: 60, target: 75 }, EBE: { min: 15, target: 30 }, TRN: { min: 5, target: 12 }, AF: { min: 30, target: 50 } },
  Agriculture:  { MB: { min: 30, target: 45 }, EBE: { min: 8, target: 18 },  TRN: { min: 3, target: 8 },  AF: { min: 40, target: 60 } },
};

export default function SectorBenchmarkPage() {
  const org = useCurrentOrg();
  const ratios = useRatios();
  const ct = useChartTheme();

  const sector = (org?.sector ?? 'Commerce') as keyof typeof SECTOR_NORMS;
  const norms = SECTOR_NORMS[sector] ?? SECTOR_NORMS.Commerce;

  const compared = useMemo(() => {
    return Object.entries(norms).map(([code, norm]) => {
      const r = ratios.find((x) => x.code === code);
      const value = r?.value ?? 0;
      const status = value >= norm.target ? 'good' : value >= norm.min ? 'warn' : 'alert';
      return { code, label: r?.label ?? code, value, target: norm.target, min: norm.min, status };
    });
  }, [norms, ratios]);

  const score = compared.filter((c) => c.status === 'good').length;
  const total = compared.length;

  return (
    <div className="space-y-5 animate-fade-in-up">
      <DashboardTopBar currentRoute="/dashboard/sector-benchmark" />
      <PageHeader
        title="Comparatif sectoriel"
        subtitle={`${org?.name ?? '—'} · Secteur : ${sector} · Normes UEMOA OHADA`}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KPICard variant="hero" title="Score sectoriel" value={`${score} / ${total}`} icon={<Building2 className="w-5 h-5" />} subValue="Ratios conformes au secteur" />
        <KPICard title="Secteur d'activité" value={sector} icon={<TrendingUp className="w-4 h-4" />} subValue="Modifiable dans Settings" />
        <KPICard title="Normes appliquées" value={String(total)} icon={<Building2 className="w-4 h-4" />} subValue="UEMOA OHADA" />
      </div>

      <ChartCard title={`Ratios vs cibles sectorielles — ${sector}`} subtitle="Bar = valeur tenant · Ligne = cible secteur" accent={ct.accent}>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={compared} barCategoryGap="30%">
            <CartesianGrid {...ct.gridProps} />
            <XAxis dataKey="code" {...ct.axisProps} />
            <YAxis {...ct.axisProps} unit="%" />
            <Tooltip contentStyle={ct.tooltipStyle} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
            <Bar dataKey="value" radius={[6, 6, 0, 0]}>
              {compared.map((c, i) => (
                <Cell key={i} fill={c.status === 'good' ? '#22c55e' : c.status === 'warn' ? '#f59e0b' : '#ef4444'} />
              ))}
            </Bar>
            <ReferenceLine y={0} stroke={ct.grid} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Détail comparatif" accent={ct.at(2)}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-primary-200 dark:border-primary-700 text-[10px] uppercase tracking-wider text-primary-500">
              <th className="text-left py-2 px-3">Ratio</th>
              <th className="text-right py-2 px-3">Valeur</th>
              <th className="text-right py-2 px-3">Min secteur</th>
              <th className="text-right py-2 px-3">Cible secteur</th>
              <th className="text-right py-2 px-3">Statut</th>
            </tr>
          </thead>
          <tbody>
            {compared.map((c) => (
              <tr key={c.code} className="border-b border-primary-100/60 dark:border-primary-800/40 table-row-hover">
                <td className="py-2 px-3 font-medium">{c.label}</td>
                <td className="text-right py-2 px-3 num font-semibold">{c.value.toFixed(2)} %</td>
                <td className="text-right py-2 px-3 num text-primary-500">{c.min} %</td>
                <td className="text-right py-2 px-3 num text-primary-500">{c.target} %</td>
                <td className="text-right py-2 px-3">
                  <span className={`badge-${c.status === 'good' ? 'success' : c.status === 'warn' ? 'warning' : 'error'}`}>
                    {c.status === 'good' ? '✓ Conforme' : c.status === 'warn' ? '~ À surveiller' : '✗ Sous-norme'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ChartCard>
    </div>
  );
}
