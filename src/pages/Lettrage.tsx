/**
 * Lettrage automatique — taux de lettrage par compte tiers, lignes non lettrées par âge.
 * Indicateur de qualité de l'équipe compta.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from 'recharts';
import { PageHeader } from '../components/layout/PageHeader';
import { ChartCard } from '../components/ui/ChartCard';
import { KPICard } from '../components/ui/KPICardV2';
import { useApp } from '../store/app';
import { db } from '../db/schema';
import { fmtPct } from '../lib/format';
import { useChartTheme } from '../lib/chartTheme';
import { useCurrentOrg } from '../hooks/useFinancials';

export default function LettragePage() {
  const { currentOrgId } = useApp();
  const org = useCurrentOrg();
  const ct = useChartTheme();
  const [entries, setEntries] = useState<any[]>([]);

  useEffect(() => {
    if (!currentOrgId) return;
    db.gl.where('orgId').equals(currentOrgId).toArray().then(setEntries);
  }, [currentOrgId]);

  const stats = useMemo(() => {
    const tiers = entries.filter((e) => e.account.startsWith('411') || e.account.startsWith('401'));
    const lettred = tiers.filter((e) => e.lettrage?.trim()).length;
    const total = tiers.length;
    const taux = total ? (lettred / total) * 100 : 0;

    // Par compte
    const byAccount = new Map<string, { account: string; total: number; lettred: number }>();
    for (const e of tiers) {
      const cur = byAccount.get(e.account) ?? { account: e.account, total: 0, lettred: 0 };
      cur.total++;
      if (e.lettrage?.trim()) cur.lettred++;
      byAccount.set(e.account, cur);
    }

    // Par âge (lignes non lettrées)
    const today = new Date();
    const aged = { '< 30j': 0, '30-60j': 0, '60-90j': 0, '> 90j': 0 };
    for (const e of tiers) {
      if (e.lettrage?.trim()) continue;
      const days = Math.floor((today.getTime() - new Date(e.date).getTime()) / (1000 * 86400));
      if (days < 30) aged['< 30j']++;
      else if (days < 60) aged['30-60j']++;
      else if (days < 90) aged['60-90j']++;
      else aged['> 90j']++;
    }

    return { total, lettred, taux, byAccount: Array.from(byAccount.values()).sort((a, b) => b.total - a.total).slice(0, 15), aged };
  }, [entries]);

  return (
    <div className="space-y-5 animate-fade-in-up">
      <PageHeader title="Lettrage des comptes tiers" subtitle={`${org?.name ?? '—'} · Qualité du suivi clients/fournisseurs`} />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <KPICard variant="hero" title="Taux de lettrage global" value={fmtPct(stats.taux)} icon={<Link2 className="w-5 h-5" />} subValue={`${stats.lettred} / ${stats.total} écritures`} />
        <KPICard title="Écritures lettrées" value={String(stats.lettred)} icon={<CheckCircle2 className="w-4 h-4" />} subValue="Statut OK" />
        <KPICard title="Non lettrées" value={String(stats.total - stats.lettred)} icon={<AlertCircle className="w-4 h-4" />} subValue="À traiter" inverse />
        <KPICard title="Anciennes (>90j)" value={String(stats.aged['> 90j'])} icon={<AlertCircle className="w-4 h-4" />} subValue="Risque douteux" inverse />
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <ChartCard title="Vieillissement non lettré" subtitle="Distribution par âge" accent={ct.accent}>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={Object.entries(stats.aged).map(([k, v]) => ({ name: k, count: v }))} barCategoryGap="30%">
              <CartesianGrid {...ct.gridProps} />
              <XAxis dataKey="name" {...ct.axisProps} />
              <YAxis {...ct.axisProps} />
              <Tooltip contentStyle={ct.tooltipStyle} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
              <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                {Object.keys(stats.aged).map((_, i) => (
                  <Cell key={i} fill={i === 0 ? '#22c55e' : i === 1 ? '#f59e0b' : i === 2 ? '#fb923c' : '#ef4444'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Top 15 comptes tiers" subtitle="Taux de lettrage par compte" accent={ct.at(2)}>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b-2 border-primary-200 dark:border-primary-700 text-[10px] uppercase tracking-wider text-primary-500">
                <th className="text-left py-2 px-2">Compte</th>
                <th className="text-right py-2 px-2">Écritures</th>
                <th className="text-right py-2 px-2">Lettrées</th>
                <th className="text-right py-2 px-2">Taux</th>
              </tr>
            </thead>
            <tbody>
              {stats.byAccount.map((a) => {
                const pct = a.total ? (a.lettred / a.total) * 100 : 0;
                return (
                  <tr key={a.account} className="border-b border-primary-100/60 dark:border-primary-800/40">
                    <td className="py-1.5 px-2 num">{a.account}</td>
                    <td className="text-right py-1.5 px-2 num">{a.total}</td>
                    <td className="text-right py-1.5 px-2 num">{a.lettred}</td>
                    <td className="text-right py-1.5 px-2 num font-semibold" style={{ color: pct >= 80 ? '#22c55e' : pct >= 50 ? '#f59e0b' : '#ef4444' }}>{pct.toFixed(0)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </ChartCard>
      </div>
    </div>
  );
}
