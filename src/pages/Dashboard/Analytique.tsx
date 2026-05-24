// ── Comptabilité analytique dashboard
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell,
} from 'recharts';
import { KPICard } from '../../components/ui/KPICardV2';
import { ChartCard } from '../../components/ui/ChartCard';
import { useStatements } from '../../hooks/useFinancials';
import { useChartTheme } from '../../lib/chartTheme';
import { ChartGradients, barGradId } from '../../components/charts/ChartGradients';
import { fmtFull, fmtK } from '../../lib/format';
import { Diamond, TrendingUp, TrendingDown } from 'lucide-react';

export function Analytique({ id: _id }: { id: string }) {
  const { balance } = useStatements();
  const ct = useChartTheme();
  if (!balance || balance.length === 0) return <div className="py-20 text-center text-primary-500">Aucune donnée analytique disponible.</div>;

  // Extraire les axes analytiques depuis les écritures GL
  const axes = new Map<string, { charges: number; produits: number }>();
  balance.forEach(r => {
    const axis = (r as any).analyticalSection || (r as any).analyticalAxis;
    if (!axis) return;
    const cur = axes.get(axis) ?? { charges: 0, produits: 0 };
    if (r.account.startsWith('6')) cur.charges += r.debit - r.credit;
    if (r.account.startsWith('7')) cur.produits += r.credit - r.debit;
    axes.set(axis, cur);
  });

  const data = Array.from(axes.entries())
    .map(([name, v]) => ({ name, charges: v.charges, produits: v.produits, resultat: v.produits - v.charges }))
    .sort((a, b) => b.produits - a.produits);

  if (data.length === 0) {
    return (
      <ChartCard title="Comptabilité analytique">
        <div className="py-12 text-center text-primary-500 text-sm">
          <p className="font-medium mb-2">Aucune section analytique détectée dans le Grand Livre.</p>
          <p className="text-xs">Importez un Grand Livre avec une colonne « Section analytique » ou « Axe analytique » pour activer ces dashboards.</p>
        </div>
      </ChartCard>
    );
  }

  const totalCharges = data.reduce((s, d) => s + d.charges, 0);
  const totalProduits = data.reduce((s, d) => s + d.produits, 0);

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <KPICard title="Centres analytiques" value={String(data.length)} icon="▣" />
        <KPICard title="Total produits" value={fmtK(totalProduits)} unit="XOF" icon={<TrendingUp className="w-4 h-4" strokeWidth={2} />} />
        <KPICard title="Total charges" value={fmtK(totalCharges)} unit="XOF" icon={<TrendingDown className="w-4 h-4" strokeWidth={2} />} />
        <KPICard title="Résultat analytique" value={fmtK(totalProduits - totalCharges)} unit="XOF" icon={<Diamond className="w-4 h-4" strokeWidth={2} />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <ChartCard title="Produits vs Charges par centre">
          <ResponsiveContainer width="100%" height={Math.max(260, data.length * 35)}>
            <BarChart data={data.slice(0, 15)} layout="vertical">
              <ChartGradients />
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #e5e5e5)" />
              <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={fmtK} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={120} />
              <Tooltip formatter={(v: any) => fmtFull(v)} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="produits" name="Produits" fill={`url(#${barGradId(0)})`} radius={[0,6,6,0]} />
              <Bar dataKey="charges" name="Charges" fill={`url(#${barGradId(1)})`} radius={[0,6,6,0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Contribution au résultat">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={data.filter(d => d.resultat > 0).slice(0, 7)} cx="50%" cy="50%" innerRadius={55} outerRadius={90} dataKey="resultat"
                label={(p: any) => p.name}>
                {data.slice(0, 7).map((_, i) => <Cell key={i} fill={ct.at(i)} />)}
              </Pie>
              <Tooltip formatter={(v: any) => fmtFull(v)} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard title="Détail par centre analytique">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-primary-200 dark:border-primary-700 text-xs uppercase text-primary-500">
            <th className="text-left py-2 px-3">Centre / Section</th>
            <th className="text-right py-2 px-3">Produits</th>
            <th className="text-right py-2 px-3">Charges</th>
            <th className="text-right py-2 px-3">Résultat</th>
            <th className="text-right py-2 px-3">% du total</th>
          </tr></thead>
          <tbody className="divide-y divide-primary-200 dark:divide-primary-800">
            {data.map((d, i) => (
              <tr key={i}>
                <td className="py-2 px-3 font-medium">{d.name}</td>
                <td className="py-2 px-3 text-right num">{fmtFull(d.produits)}</td>
                <td className="py-2 px-3 text-right num">{fmtFull(d.charges)}</td>
                <td className={`py-2 px-3 text-right num font-semibold ${d.resultat < 0 ? 'text-error' : ''}`}>{fmtFull(d.resultat)}</td>
                <td className="py-2 px-3 text-right num text-primary-500">{totalProduits ? ((d.produits / totalProduits) * 100).toFixed(1) : 0} %</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ChartCard>
    </>
  );
}
