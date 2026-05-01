/**
 * Provisions tracking — dotations / reprises sur provisions par mois.
 */
import { useEffect, useMemo, useState } from 'react';
import { Shield, TrendingUp, TrendingDown } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { PageHeader } from '../components/layout/PageHeader';
import { ChartCard } from '../components/ui/ChartCard';
import { KPICard } from '../components/ui/KPICardV2';
import { useApp } from '../store/app';
import { db } from '../db/schema';
import { fmtFull, fmtK } from '../lib/format';
import { useChartTheme } from '../lib/chartTheme';
import { useCurrentOrg } from '../hooks/useFinancials';

const MONTHS = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];

export default function ProvisionsTrackingPage() {
  const { currentOrgId, currentYear } = useApp();
  const org = useCurrentOrg();
  const ct = useChartTheme();
  const [entries, setEntries] = useState<any[]>([]);

  useEffect(() => {
    if (!currentOrgId) return;
    db.gl.where('orgId').equals(currentOrgId).toArray().then(setEntries);
  }, [currentOrgId]);

  const data = useMemo(() => {
    const yearEntries = entries.filter((e) => e.date.startsWith(String(currentYear)));
    // Provisions : 15 (réglementées), 19 (risques), 29/39/49/59 (dépréciations)
    const provPrefixes = ['15', '19', '29', '39', '49', '59'];
    // Dotations : 681, 691 (provisions), 697
    const dotPrefixes = ['681', '691', '697', '687'];
    // Reprises : 781, 791, 797, 787
    const repPrefixes = ['781', '791', '797', '787'];

    const monthly = MONTHS.map((mois, i) => {
      const monthEntries = yearEntries.filter((e) => parseInt(e.date.substring(5, 7), 10) === i + 1);
      const dotations = monthEntries.filter((e) => dotPrefixes.some((p) => e.account.startsWith(p))).reduce((s, e) => s + e.debit - e.credit, 0);
      const reprises = monthEntries.filter((e) => repPrefixes.some((p) => e.account.startsWith(p))).reduce((s, e) => s + e.credit - e.debit, 0);
      return { mois, Dotations: dotations, Reprises: reprises, Net: dotations - reprises };
    });

    const stockProv = entries.filter((e) => provPrefixes.some((p) => e.account.startsWith(p))).reduce((s, e) => s + e.credit - e.debit, 0);
    const totalDot = monthly.reduce((s, m) => s + m.Dotations, 0);
    const totalRep = monthly.reduce((s, m) => s + m.Reprises, 0);

    return { monthly, stockProv, totalDot, totalRep, net: totalDot - totalRep };
  }, [entries, currentYear]);

  return (
    <div className="space-y-5 animate-fade-in-up">
      <PageHeader title="Suivi des provisions" subtitle={`${org?.name ?? '—'} · Exercice ${currentYear} · Dotations / Reprises mensuelles`} />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <KPICard variant="hero" title="Stock provisions clôture" value={fmtK(data.stockProv)} unit="XOF" icon={<Shield className="w-5 h-5" />} subValue="Tous comptes 15/19/2-5x9" />
        <KPICard title="Dotations YTD" value={fmtK(data.totalDot)} unit="XOF" icon={<TrendingUp className="w-4 h-4" />} subValue="Comptes 681/691/697" />
        <KPICard title="Reprises YTD" value={fmtK(data.totalRep)} unit="XOF" icon={<TrendingDown className="w-4 h-4" />} subValue="Comptes 781/791/797" />
        <KPICard title="Variation nette" value={fmtK(data.net)} unit="XOF" icon={<Shield className="w-4 h-4" />} subValue="Dotations − Reprises" />
      </div>

      <ChartCard title="Mouvements mensuels" subtitle="Dotations vs Reprises sur 12 mois" accent={ct.accent}>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data.monthly} barCategoryGap="25%">
            <CartesianGrid {...ct.gridProps} />
            <XAxis dataKey="mois" {...ct.axisProps} />
            <YAxis {...ct.axisProps} tickFormatter={fmtK} />
            <Tooltip formatter={(v: any) => fmtFull(v)} contentStyle={ct.tooltipStyle} itemStyle={ct.tooltipItemStyle} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
            <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
            <Bar dataKey="Dotations" fill={ct.at(1)} radius={[4, 4, 0, 0]} />
            <Bar dataKey="Reprises" fill={ct.at(0)} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}
