/**
 * Intercos / Comptes courants associés — opérations entre sociétés du groupe.
 * Comptes 462/463 + 4561 + 167 (intra-groupe).
 */
import { useEffect, useMemo, useState } from 'react';
import { Users, AlertTriangle } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { PageHeader } from '../components/layout/PageHeader';
import { DashboardTopBar } from '../components/ui/DashboardTopBar';
import { ChartCard } from '../components/ui/ChartCard';
import { KPICard } from '../components/ui/KPICardV2';
import { useApp } from '../store/app';
import { db } from '../db/schema';
import { fmtFull, fmtK } from '../lib/format';
import { useChartTheme } from '../lib/chartTheme';
import { useCurrentOrg } from '../hooks/useFinancials';

const INTERCO_PREFIXES = [
  { code: '167', label: 'Avances reçues sociétés du groupe' },
  { code: '267', label: 'Titres de participation' },
  { code: '4561', label: 'Apports en compte courant' },
  { code: '462', label: 'Créances sur cessions intragroupe' },
  { code: '463', label: 'Dettes sur acquisitions intragroupe' },
];

export default function IntercosPage() {
  const { currentOrgId } = useApp();
  const org = useCurrentOrg();
  const ct = useChartTheme();
  const [entries, setEntries] = useState<any[]>([]);

  useEffect(() => {
    if (!currentOrgId) return;
    db.gl.where('orgId').equals(currentOrgId).toArray().then(setEntries);
  }, [currentOrgId]);

  const data = useMemo(() => {
    return INTERCO_PREFIXES.map((p) => {
      const matching = entries.filter((e) => e.account.startsWith(p.code));
      const debit = matching.reduce((s, e) => s + e.debit, 0);
      const credit = matching.reduce((s, e) => s + e.credit, 0);
      return { code: p.code, label: p.label, debit, credit, solde: debit - credit, count: matching.length };
    });
  }, [entries]);

  const totalDebit = data.reduce((s, d) => s + d.debit, 0);
  const totalCredit = data.reduce((s, d) => s + d.credit, 0);
  const totalCount = data.reduce((s, d) => s + d.count, 0);

  return (
    <div className="space-y-5 animate-fade-in-up">
      <DashboardTopBar currentRoute="/dashboard/intercos" />
      <PageHeader title="Intercos / Comptes courants associés" subtitle={`${org?.name ?? '—'} · Opérations intra-groupe — sensible en audit`} />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <KPICard variant="hero" title="Solde net intra-groupe" value={fmtK(totalDebit - totalCredit)} unit="XOF" icon={<Users className="w-5 h-5" />} subValue={totalDebit - totalCredit > 0 ? 'Position prêteuse' : 'Position emprunteuse'} />
        <KPICard title="Total débits" value={fmtK(totalDebit)} unit="XOF" icon={<Users className="w-4 h-4" />} />
        <KPICard title="Total crédits" value={fmtK(totalCredit)} unit="XOF" icon={<Users className="w-4 h-4" />} />
        <KPICard title="Écritures" value={String(totalCount)} icon={<AlertTriangle className="w-4 h-4" />} subValue="À justifier en annexes" />
      </div>

      <ChartCard title="Soldes par compte intra-groupe" accent={ct.accent}>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data} layout="vertical">
            <CartesianGrid {...ct.gridProps} />
            <XAxis type="number" {...ct.axisProps} tickFormatter={fmtK} />
            <YAxis type="category" dataKey="label" width={200} {...ct.axisProps} />
            <Tooltip formatter={(v: any) => fmtFull(v)} contentStyle={ct.tooltipStyle} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
            <Bar dataKey="solde" fill={ct.accent} radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Détail par compte" accent={ct.at(2)}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-primary-200 dark:border-primary-700 text-[10px] uppercase tracking-wider text-primary-500">
              <th className="text-left py-2 px-3">Compte</th>
              <th className="text-left py-2 px-3">Libellé</th>
              <th className="text-right py-2 px-3">Écritures</th>
              <th className="text-right py-2 px-3 text-success">Débit</th>
              <th className="text-right py-2 px-3 text-error">Crédit</th>
              <th className="text-right py-2 px-3">Solde</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.code} className="border-b border-primary-100/60 dark:border-primary-800/40 table-row-hover">
                <td className="py-2 px-3 num font-medium">{d.code}</td>
                <td className="py-2 px-3">{d.label}</td>
                <td className="text-right py-2 px-3 num">{d.count}</td>
                <td className="text-right py-2 px-3 num text-success">{fmtFull(d.debit)}</td>
                <td className="text-right py-2 px-3 num text-error">{fmtFull(d.credit)}</td>
                <td className="text-right py-2 px-3 num font-semibold">{fmtFull(d.solde)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ChartCard>
    </div>
  );
}
