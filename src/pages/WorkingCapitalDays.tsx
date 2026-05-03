/**
 * Working Capital Days — synthèse DSO + DIO + DPO + Cash Conversion Cycle.
 * Le triplet qui résume l'efficacité du cycle d'exploitation.
 */
import { useMemo } from 'react';
import { Clock, Users, Truck, Package } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, Cell } from 'recharts';
import { PageHeader } from '../components/layout/PageHeader';
import { DashboardTopBar } from '../components/ui/DashboardTopBar';
import { ChartCard } from '../components/ui/ChartCard';
import { KPICard } from '../components/ui/KPICardV2';
import { useStatements, useRatios, useCurrentOrg } from '../hooks/useFinancials';
import { useChartTheme } from '../lib/chartTheme';

export default function WorkingCapitalDaysPage() {
  const org = useCurrentOrg();
  const ratios = useRatios();
  const { sig, bilan } = useStatements();
  const ct = useChartTheme();

  const days = useMemo(() => {
    const dso = ratios.find((r) => r.code === 'DSO')?.value ?? 0;
    const dpo = ratios.find((r) => r.code === 'DPO')?.value ?? 0;
    // DIO = (Stocks / Coût des achats) × 360
    const get = (lines: any[] | undefined, code: string) => lines?.find((l: any) => l.code === code)?.value ?? 0;
    const stocks = get(bilan?.actif ?? [], 'BB') ?? 0;
    const achats = sig?.ca && sig?.margeBrute ? sig.ca - sig.margeBrute : 1;
    const dio = achats > 0 ? (stocks / achats) * 360 : 0;
    const ccc = dso + dio - dpo;
    return { dso, dio, dpo, ccc };
  }, [ratios, bilan, sig]);

  const chartData = [
    { name: 'DSO', value: Math.round(days.dso), label: 'Délai client' },
    { name: 'DIO', value: Math.round(days.dio), label: 'Délai stock' },
    { name: 'DPO', value: Math.round(days.dpo), label: 'Délai fournisseur' },
    { name: 'CCC', value: Math.round(days.ccc), label: 'Cycle de conversion' },
  ];

  return (
    <div className="space-y-5 animate-fade-in-up">
      <DashboardTopBar currentRoute="/dashboard/wcd" />
      <PageHeader
        title="Working Capital Days"
        subtitle={`${org?.name ?? '—'} · Cycle d'exploitation : DSO + DIO − DPO`}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="DSO — Délai client"
          value={`${Math.round(days.dso)}`}
          unit="jours"
          icon={<Users className="w-4 h-4" strokeWidth={2} />}
          subValue="Cible : 60 j"
          inverse
        />
        <KPICard
          title="DIO — Délai stock"
          value={`${Math.round(days.dio)}`}
          unit="jours"
          icon={<Package className="w-4 h-4" strokeWidth={2} />}
          subValue="Rotation des stocks"
          inverse
        />
        <KPICard
          title="DPO — Délai fournisseur"
          value={`${Math.round(days.dpo)}`}
          unit="jours"
          icon={<Truck className="w-4 h-4" strokeWidth={2} />}
          subValue="Cible : 60 j"
        />
        <KPICard
          variant="hero"
          title="Cash Conversion Cycle"
          value={`${Math.round(days.ccc)}`}
          unit="jours"
          icon={<Clock className="w-5 h-5" strokeWidth={2} />}
          subValue="DSO + DIO − DPO"
        />
      </div>

      <ChartCard title="Décomposition du cycle" subtitle="Plus le CCC est court, mieux c'est" accent={ct.accent}>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData} barCategoryGap="30%">
            <CartesianGrid {...ct.gridProps} />
            <XAxis dataKey="name" {...ct.axisProps} />
            <YAxis {...ct.axisProps} />
            <Tooltip
              contentStyle={ct.tooltipStyle}
              itemStyle={ct.tooltipItemStyle}
              labelStyle={ct.tooltipLabelStyle}
              formatter={(v: any) => `${v} jours`}
              cursor={{ fill: 'rgba(0,0,0,0.04)' }}
            />
            <ReferenceLine y={60} stroke={ct.accent} strokeDasharray="3 3" label={{ value: 'Cible 60j', fill: ct.accent, fontSize: 10 }} />
            <Bar dataKey="value" radius={[6, 6, 0, 0]}>
              {chartData.map((d, i) => (
                <Cell key={i} fill={d.name === 'CCC' ? ct.accent : ct.at(i)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Lecture" subtitle="Comprendre les indicateurs" accent={ct.at(2)}>
        <div className="grid md:grid-cols-2 gap-4 text-sm">
          <div className="space-y-2">
            <p><strong>DSO</strong> (Days Sales Outstanding) — délai moyen de paiement de tes clients. Plus bas = mieux.</p>
            <p><strong>DIO</strong> (Days Inventory Outstanding) — durée moyenne de stockage. Plus bas = rotation rapide.</p>
            <p><strong>DPO</strong> (Days Payables Outstanding) — délai moyen de paiement à tes fournisseurs. Plus haut = trésorerie préservée.</p>
          </div>
          <div className="bg-primary-50 dark:bg-primary-950 rounded-xl p-4 border border-primary-200 dark:border-primary-800">
            <p className="font-semibold text-primary-900 dark:text-primary-100 mb-2">Cash Conversion Cycle (CCC)</p>
            <p className="text-primary-600 dark:text-primary-400">
              Représente le nombre de jours entre la sortie de cash (achat fournisseurs)
              et la rentrée de cash (encaissement clients). Un CCC court signifie que ton activité
              s'auto-finance ; un CCC long demande un BFR plus important.
            </p>
          </div>
        </div>
      </ChartCard>
    </div>
  );
}
