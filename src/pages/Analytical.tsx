// Page Analytique — P&L par centre de coût / section
import { useEffect, useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { ChartCard } from '../components/ui/ChartCard';
import { TabSwitch } from '../components/ui/TabSwitch';
import { useApp } from '../store/app';
import { computeAnalyticalPL, computeAnalyticalMonthly, listAxes, type AnalyticalRow } from '../engine/analytical';
import { useChartColors } from '../store/theme';
import { fmtFull } from '../lib/format';

export default function Analytical() {
  const { currentOrgId, currentYear } = useApp();
  const chartColors = useChartColors();
  const [axes, setAxes] = useState<string[]>([]);
  const [selectedAxis, setSelectedAxis] = useState<string>('');
  const [data, setData] = useState<AnalyticalRow[]>([]);
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const [monthly, setMonthly] = useState<{ months: string[]; charges: number[]; produits: number[] } | null>(null);
  const [tab, setTab] = useState<'repartition' | 'detail'>('repartition');

  useEffect(() => { listAxes(currentOrgId).then((a) => { setAxes(a); setSelectedAxis(a[0] ?? ''); }); }, [currentOrgId]);
  useEffect(() => { if (currentOrgId) computeAnalyticalPL(currentOrgId, currentYear, selectedAxis || undefined).then(setData); }, [currentOrgId, currentYear, selectedAxis]);
  useEffect(() => { if (selectedSection && currentOrgId) computeAnalyticalMonthly(currentOrgId, currentYear, selectedSection).then(setMonthly); }, [currentOrgId, currentYear, selectedSection]);

  const totalCharges = data.reduce((s, r) => s + r.charges, 0);
  const totalProduits = data.reduce((s, r) => s + r.produits, 0);
  const totalResultat = totalProduits - totalCharges;

  const pieData = data.filter((r) => r.charges > 0).map((r, i) => ({ name: r.section, value: r.charges, color: chartColors[i % chartColors.length] }));

  return (
    <div>
      <PageHeader title="Comptabilité Analytique" subtitle="P&L par centre de coût / section analytique" />

      <div className="flex flex-wrap items-center gap-3 mb-6">
        {axes.length > 0 ? (
          <select className="input !w-auto !py-1.5 text-sm" value={selectedAxis} onChange={(e) => setSelectedAxis(e.target.value)}>
            <option value="">Tous les axes</option>
            {axes.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        ) : (
          <p className="text-sm text-primary-500">Aucun axe analytique. Importez un Grand Livre avec les colonnes "Axe analytique" et "Section analytique".</p>
        )}
      </div>

      {data.length > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Card padded><p className="text-[10px] uppercase tracking-wider text-primary-500 font-semibold">Sections</p><p className="num text-2xl font-bold mt-1">{data.length}</p></Card>
            <Card padded><p className="text-[10px] uppercase tracking-wider text-primary-500 font-semibold">Charges</p><p className="num text-2xl font-bold mt-1">{fmtFull(totalCharges)}</p></Card>
            <Card padded><p className="text-[10px] uppercase tracking-wider text-primary-500 font-semibold">Produits</p><p className="num text-2xl font-bold mt-1">{fmtFull(totalProduits)}</p></Card>
            <Card padded><p className="text-[10px] uppercase tracking-wider text-primary-500 font-semibold">Résultat</p><p className={`num text-2xl font-bold mt-1 ${totalResultat < 0 ? 'text-primary-500' : ''}`}>{fmtFull(totalResultat)}</p></Card>
          </div>

          <TabSwitch tabs={[{ key: 'repartition' as const, label: 'Répartition' }, { key: 'detail' as const, label: 'Détail par section' }]} value={tab} onChange={setTab} />

          {tab === 'repartition' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ChartCard title="Répartition des charges par section">
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={(e) => e.name}>
                      {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                    <Tooltip formatter={(v) => fmtFull(Number(v))} />
                  </PieChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Top sections par charges">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={data.slice(0, 10)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                    <XAxis type="number" tickFormatter={(v) => fmtFull(v)} tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="section" width={120} tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v) => fmtFull(Number(v))} />
                    <Bar dataKey="charges" fill={chartColors[0]} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>
          )}

          {tab === 'detail' && (
            <Card padded={false}>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-primary-100 dark:bg-primary-900">
                      <th className="text-left px-4 py-2 font-semibold">Section</th>
                      <th className="text-right px-4 py-2 font-semibold">Charges</th>
                      <th className="text-right px-4 py-2 font-semibold">Produits</th>
                      <th className="text-right px-4 py-2 font-semibold">Résultat</th>
                      <th className="text-right px-4 py-2 font-semibold">% Total</th>
                      <th className="text-center px-4 py-2 font-semibold">Évolution</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((r) => (
                      <tr key={r.section} className="border-b border-primary-100 dark:border-primary-800 hover:bg-primary-50 dark:hover:bg-primary-900/50 cursor-pointer" onClick={() => setSelectedSection(r.section)}>
                        <td className="px-4 py-2 font-medium">{r.section}</td>
                        <td className="px-4 py-2 text-right num">{fmtFull(r.charges)}</td>
                        <td className="px-4 py-2 text-right num">{fmtFull(r.produits)}</td>
                        <td className={`px-4 py-2 text-right num font-semibold ${r.resultat < 0 ? 'text-primary-500' : ''}`}>{fmtFull(r.resultat)}</td>
                        <td className="px-4 py-2 text-right num">{r.pctTotal} %</td>
                        <td className="px-4 py-2 text-center">
                          <button className="text-[10px] text-primary-500 hover:text-primary-900 dark:hover:text-primary-100" onClick={(e) => { e.stopPropagation(); setSelectedSection(r.section); }}>Voir</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {selectedSection && monthly && (
            <ChartCard title={`Évolution mensuelle — ${selectedSection}`} className="mt-4">
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={monthly.months.map((m, i) => ({ mois: m, charges: monthly.charges[i], produits: monthly.produits[i] }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                  <XAxis dataKey="mois" tick={{ fontSize: 10 }} />
                  <YAxis tickFormatter={(v) => fmtFull(v)} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v) => fmtFull(Number(v))} />
                  <Line type="monotone" dataKey="charges" stroke={chartColors[0]} strokeWidth={2} dot={false} name="Charges" />
                  <Line type="monotone" dataKey="produits" stroke={chartColors[1]} strokeWidth={2} dot={false} name="Produits" />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          )}
        </>
      )}

      {data.length === 0 && axes.length === 0 && (
        <Card padded>
          <div className="py-16 text-center">
            <p className="text-primary-500 text-sm mb-2">Aucune donnée analytique disponible.</p>
            <p className="text-primary-400 text-xs">Importez un Grand Livre avec les colonnes "Axe analytique" et "Section analytique" pour activer cette fonctionnalité.</p>
          </div>
        </Card>
      )}
    </div>
  );
}
