/**
 * Saisonnalité CA / charges — détection auto des cycles + index mensuel.
 * Utile pour commerce, agriculture, hôtellerie.
 */
import { useEffect, useMemo, useState } from 'react';
import { Calendar, TrendingUp } from 'lucide-react';
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine } from 'recharts';
import { PageHeader } from '../components/layout/PageHeader';
import { ChartCard } from '../components/ui/ChartCard';
import { KPICard } from '../components/ui/KPICardV2';
import { useApp } from '../store/app';
import { db } from '../db/schema';
import { fmtFull, fmtK, fmtPct } from '../lib/format';
import { useChartTheme } from '../lib/chartTheme';
import { useCurrentOrg } from '../hooks/useFinancials';

const MONTHS = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];

export default function SeasonalityPage() {
  const { currentOrgId } = useApp();
  const org = useCurrentOrg();
  const ct = useChartTheme();
  const [data, setData] = useState<{ mois: string; ca: number; charges: number; index: number }[]>([]);

  useEffect(() => {
    if (!currentOrgId) return;
    db.gl.where('orgId').equals(currentOrgId).toArray().then((entries) => {
      // Agrège CA / charges par mois sur tous les exercices disponibles
      const monthly = Array(12).fill(0).map(() => ({ ca: 0, charges: 0, samples: 0 }));
      for (const e of entries) {
        const m = parseInt(e.date.substring(5, 7), 10) - 1;
        if (m < 0 || m > 11) continue;
        if (e.account?.startsWith('7')) monthly[m].ca += (e.credit - e.debit);
        if (e.account?.startsWith('6')) monthly[m].charges += (e.debit - e.credit);
        monthly[m].samples++;
      }
      const totalCA = monthly.reduce((s, m) => s + m.ca, 0);
      const moyMois = totalCA / 12;
      const result = MONTHS.map((mois, i) => ({
        mois,
        ca: monthly[i].ca,
        charges: monthly[i].charges,
        index: moyMois ? (monthly[i].ca / moyMois) * 100 : 100, // 100 = moyenne
      }));
      setData(result);
    });
  }, [currentOrgId]);

  const stats = useMemo(() => {
    if (data.length === 0) return { peak: '—', low: '—', amplitude: 0 };
    const sorted = [...data].sort((a, b) => b.index - a.index);
    const amplitude = sorted[0].index - sorted[sorted.length - 1].index;
    return { peak: sorted[0].mois, low: sorted[sorted.length - 1].mois, amplitude };
  }, [data]);

  return (
    <div className="space-y-5 animate-fade-in-up">
      <PageHeader title="Saisonnalité" subtitle={`${org?.name ?? '—'} · Détection des cycles d'activité`} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KPICard variant="hero" title="Mois de pic d'activité" value={stats.peak} icon={<TrendingUp className="w-5 h-5" />} subValue="Plus haut volume" />
        <KPICard title="Mois creux" value={stats.low} icon={<Calendar className="w-4 h-4" />} subValue="Plus bas volume" />
        <KPICard title="Amplitude saisonnière" value={fmtPct(stats.amplitude)} icon={<TrendingUp className="w-4 h-4" />} subValue="Pic − Creux (en index)" />
      </div>

      <ChartCard title="Index de saisonnalité mensuel" subtitle="100 = mois moyen · au-dessus = pic, en-dessous = creux" accent={ct.accent}>
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart data={data}>
            <CartesianGrid {...ct.gridProps} />
            <XAxis dataKey="mois" {...ct.axisProps} />
            <YAxis yAxisId="left" {...ct.axisProps} tickFormatter={fmtK} />
            <YAxis yAxisId="right" orientation="right" {...ct.axisProps} domain={[0, 200]} />
            <Tooltip formatter={(v: any) => fmtFull(v)} contentStyle={ct.tooltipStyle} itemStyle={ct.tooltipItemStyle} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
            <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
            <ReferenceLine yAxisId="right" y={100} stroke={ct.accent} strokeDasharray="3 3" label={{ value: 'Moyenne', fill: ct.accent, fontSize: 10 }} />
            <Bar yAxisId="left" dataKey="ca" name="CA" fill={ct.at(0)} radius={[4, 4, 0, 0]} />
            <Line yAxisId="right" type="monotone" dataKey="index" name="Index saisonnier" stroke={ct.accent} strokeWidth={2.5} dot={{ r: 4 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}
