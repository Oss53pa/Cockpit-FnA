// ── CRBlock — CR par bloc avec zoom/drill-down ──────────────────────
import { useEffect, useState } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import clsx from 'clsx';
import { KPICard } from '../../components/ui/KPICardV2';
import { ChartCard } from '../../components/ui/ChartCard';
import { useBudgetActual } from '../../hooks/useFinancials';
import { ChartGradients, barGradId } from '../../components/charts/ChartGradients';
import { bySection, loadLabels } from '../../engine/budgetActual';
import { useApp } from '../../store/app';
import { fmtFull, fmtK } from '../../lib/format';
import { Diamond, Circle, Layers, Percent, TrendingUp, TrendingDown } from 'lucide-react';

export function CRBlock() {
  const rows = useBudgetActual();
  const { currentOrgId, currentYear } = useApp();
  const sections = bySection(rows, currentOrgId);
  const labels = loadLabels(currentOrgId);
  const [zoom, setZoom] = useState<string | null>(null);

  const [n1Data, setN1Data] = useState<Map<string, number>>(new Map());
  const [monthlyData, setMonthlyData] = useState<Map<string, { months: Array<{ realise: number; budget: number; n1: number }> }>>(new Map());
  const currentMonth = new Date().getMonth();

  useEffect(() => {
    import('../../engine/budgetActual').then(({ computeBudgetActualMonthly }) => {
      computeBudgetActualMonthly(currentOrgId, currentYear).then((raw) => {
        const n1Map = new Map<string, number>();
        const mMap = new Map<string, { months: Array<{ realise: number; budget: number; n1: number }> }>();
        for (const r of raw.rows) {
          n1Map.set(r.code, r.totalN1);
          mMap.set(r.code, { months: r.months });
        }
        setN1Data(n1Map);
        setMonthlyData(mMap);
      });
    });
  }, [currentOrgId, currentYear]);

  if (!rows.length) return <div className="py-12 text-center text-primary-500">Chargement…</div>;

  const totalProduits = sections.filter((s) => !s.isCharge).reduce((acc, s) => acc + s.totalRealise, 0);
  const totalCharges = sections.filter((s) => s.isCharge).reduce((acc, s) => acc + s.totalRealise, 0);
  const resultat = totalProduits - totalCharges;

  const sectionN1 = (sec: typeof sections[0]) => sec.rows.reduce((s, r) => s + (n1Data.get(r.code) ?? 0), 0);

  if (zoom) {
    const sec = sections.find((s) => s.section === zoom);
    if (!sec) return null;
    const total = sec.totalRealise;
    return (
      <>
        <div className="flex items-center justify-between mb-4">
          <button className="btn-outline" onClick={() => setZoom(null)}>← Retour aux blocs</button>
          <h2 className="text-lg font-bold">{labels[sec.section]}</h2>
          <span className="badge bg-primary-200 dark:bg-primary-800">{sec.rows.length} comptes</span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <KPICard title="Total réalisé" value={fmtK(sec.totalRealise)} unit="XOF" icon={<Diamond className="w-4 h-4" strokeWidth={2} />} />
          <KPICard title="Total budget" value={fmtK(sec.totalBudget)} unit="XOF" icon={<Circle className="w-4 h-4" strokeWidth={2} />} />
          <KPICard title="Écart" value={fmtK(sec.totalEcart)} unit="XOF" subValue={`${sec.ecartPct.toFixed(1)} %`} icon={sec.totalEcart >= 0 ? '↑' : '↓'} />
          <KPICard title="% de l'activité" value={`${(sec.isCharge ? totalCharges : totalProduits) ? ((sec.totalRealise / (sec.isCharge ? totalCharges : totalProduits)) * 100).toFixed(1) : 0} %`} icon={<Percent className="w-4 h-4" strokeWidth={2} />} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          <ChartCard title="Top 10 comptes de la section">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={[...sec.rows].sort((a, b) => b.realise - a.realise).slice(0, 10)} layout="vertical">
                <ChartGradients />
                <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #e5e5e5)" />
                <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={fmtK} />
                <YAxis type="category" dataKey="code" tick={{ fontSize: 10 }} width={70} />
                <Tooltip formatter={(v: any) => fmtFull(v)} />
                <Bar dataKey="realise" fill={`url(#${barGradId(0)})`} radius={[0,6,6,0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
          <ChartCard title="Réalisé vs Budget par compte">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={[...sec.rows].sort((a, b) => b.realise - a.realise).slice(0, 10)}>
                <ChartGradients />
                <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #e5e5e5)" />
                <XAxis dataKey="code" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtK} />
                <Tooltip formatter={(v: any) => fmtFull(v)} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="realise" name="Réalisé" fill={`url(#${barGradId(0)})`} radius={[6, 6, 0, 0]} />
                <Bar dataKey="budget" name="Budget" fill={`url(#${barGradId(1)})`} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        <ChartCard title={`Détail des comptes — ${labels[sec.section]}`}>
          <table className="w-full text-sm">
            <thead><tr className="border-b-2 border-primary-300 dark:border-primary-700 text-xs uppercase text-primary-500">
              <th className="text-left py-2 px-3">Compte</th>
              <th className="text-left py-2 px-3">Libellé</th>
              <th className="text-right py-2 px-3">Réalisé</th>
              <th className="text-right py-2 px-3">Budget</th>
              <th className="text-right py-2 px-3">Écart B/R</th>
              <th className="text-right py-2 px-3">N-1</th>
              <th className="text-right py-2 px-3">vs N-1</th>
              <th className="text-right py-2 px-3">% section</th>
            </tr></thead>
            <tbody className="divide-y divide-primary-200 dark:divide-primary-800">
              {(() => {
                const totBSection = sec.rows.reduce((s, r) => s + (r.budget ?? 0), 0);
                const hasBSection = Math.abs(totBSection) > 0.01;
                return sec.rows.map((r) => {
                const n1Val = n1Data.get(r.code) ?? 0;
                const varN1 = n1Val ? ((r.realise - n1Val) / Math.abs(n1Val) * 100) : 0;
                return (
                <tr key={r.code}>
                  <td className="py-2 px-3 num font-mono">{r.code}</td>
                  <td className="py-2 px-3">{r.label}</td>
                  <td className="py-2 px-3 text-right num font-semibold">{fmtFull(r.realise)}</td>
                  <td className="py-2 px-3 text-right num text-primary-500">{hasBSection ? fmtFull(r.budget) : '—'}</td>
                  <td className={clsx('py-2 px-3 text-right num',
                    r.status === 'favorable' ? 'text-success' : r.status === 'defavorable' ? 'text-error' : '')}>
                    {hasBSection ? (r.ecart >= 0 ? '+' : '') + fmtFull(r.ecart) : '—'}
                  </td>
                  <td className="py-2 px-3 text-right num text-primary-400">{fmtFull(n1Val)}</td>
                  <td className={clsx('py-2 px-3 text-right num text-xs', varN1 === 0 ? 'text-primary-400' : (r.isCharge ? (varN1 <= 0 ? 'text-success' : 'text-error') : (varN1 >= 0 ? 'text-success' : 'text-error')))}>
                    {varN1 !== 0 ? `${varN1 >= 0 ? '+' : ''}${varN1.toFixed(1)} %` : '—'}
                  </td>
                  <td className="py-2 px-3 text-right num text-xs text-primary-500">{total ? ((r.realise / total) * 100).toFixed(1) : 0} %</td>
                </tr>
                );
              });
              })()}
            </tbody>
          </table>
        </ChartCard>
      </>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <KPICard title="Total Produits" value={fmtK(totalProduits)} unit="XOF" icon={<TrendingUp className="w-4 h-4" strokeWidth={2} />} />
        <KPICard title="Total Charges" value={fmtK(totalCharges)} unit="XOF" icon={<TrendingDown className="w-4 h-4" strokeWidth={2} />} />
        <KPICard title="Résultat net" value={fmtK(resultat)} unit="XOF" icon={<Diamond className="w-4 h-4" strokeWidth={2} />} />
        <KPICard title="Sections" value={String(sections.length)} icon={<Layers className="w-4 h-4" strokeWidth={2} />} />
      </div>

      <p className="text-xs text-primary-500 mb-3">Chaque bloc ci-dessous représente une section du CR. Cliquez « Analyser → » pour zoomer sur le détail des comptes.</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sections.map((sec) => {
          const top3 = [...sec.rows].sort((a, b) => Math.abs(b.realise) - Math.abs(a.realise)).slice(0, 3);
          const ref = sec.isCharge ? totalCharges : totalProduits;
          return (
            <div key={sec.section} className="card p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={clsx('inline-block w-2 h-2 rounded-full', sec.isCharge ? 'bg-error' : 'bg-success')} />
                    <p className="font-semibold text-base">{labels[sec.section]}</p>
                  </div>
                  <p className="text-xs text-primary-500 mt-0.5">{sec.rows.length} comptes · {sec.isCharge ? 'Charges' : 'Produits'}</p>
                </div>
                <button onClick={() => setZoom(sec.section)} className="btn-outline !py-1.5 text-xs">Analyser →</button>
              </div>

              {(() => {
                const m = currentMonth > 0 ? currentMonth - 1 : 0;
                const secMonthly = sec.rows.reduce((acc, r) => {
                  const md = monthlyData.get(r.code);
                  if (!md) return acc;
                  return { actualM: acc.actualM + md.months[m].realise, budgetM: acc.budgetM + md.months[m].budget, n1M: acc.n1M + md.months[m].n1 };
                }, { actualM: 0, budgetM: 0, n1M: 0 });
                const n1Ytd = sectionN1(sec);
                const MONTHS_SHORT = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
                const monthLabel = MONTHS_SHORT[m];
                return (
                  <table className="w-full text-[10px] mb-3 border border-primary-200 dark:border-primary-800 rounded overflow-hidden">
                    <thead><tr className="bg-primary-100 dark:bg-primary-800">
                      <th className="py-1 px-2"></th>
                      <th className="py-1 px-2 text-right font-semibold" colSpan={3}>Mois ({monthLabel})</th>
                      <th className="py-1 px-2 text-right font-semibold border-l border-primary-200 dark:border-primary-700" colSpan={3}>Year-to-Date</th>
                    </tr>
                    <tr className="bg-primary-50 dark:bg-primary-900 text-primary-500">
                      <th className="py-1 px-2 text-left"></th>
                      <th className="py-1 px-2 text-right">Actual</th>
                      <th className="py-1 px-2 text-right">Budget</th>
                      <th className="py-1 px-2 text-right">N-1</th>
                      <th className="py-1 px-2 text-right border-l border-primary-200 dark:border-primary-700">Actual</th>
                      <th className="py-1 px-2 text-right">Budget</th>
                      <th className="py-1 px-2 text-right">N-1</th>
                    </tr></thead>
                    <tbody>
                      <tr className="font-semibold">
                        <td className="py-1.5 px-2">{sec.isCharge ? 'Charges' : 'Produits'}</td>
                        <td className="py-1.5 px-2 text-right num">{fmtK(secMonthly.actualM)}</td>
                        <td className="py-1.5 px-2 text-right num text-primary-500">{fmtK(secMonthly.budgetM)}</td>
                        <td className="py-1.5 px-2 text-right num text-primary-400">{fmtK(secMonthly.n1M)}</td>
                        <td className="py-1.5 px-2 text-right num border-l border-primary-200 dark:border-primary-700">{fmtK(sec.totalRealise)}</td>
                        <td className="py-1.5 px-2 text-right num text-primary-500">{fmtK(sec.totalBudget)}</td>
                        <td className="py-1.5 px-2 text-right num text-primary-400">{fmtK(n1Ytd)}</td>
                      </tr>
                      <tr className="text-[9px] text-primary-500">
                        <td className="py-1 px-2">Écart</td>
                        <td colSpan={2} className={clsx('py-1 px-2 text-right num', (secMonthly.actualM - secMonthly.budgetM) === 0 ? '' : (sec.isCharge ? (secMonthly.actualM - secMonthly.budgetM <= 0 ? 'text-success' : 'text-error') : (secMonthly.actualM - secMonthly.budgetM >= 0 ? 'text-success' : 'text-error')))}>
                          {(secMonthly.actualM - secMonthly.budgetM) >= 0 ? '+' : ''}{fmtK(secMonthly.actualM - secMonthly.budgetM)}
                        </td>
                        <td className="py-1 px-2 text-right num">{secMonthly.n1M ? `${((secMonthly.actualM - secMonthly.n1M) / Math.abs(secMonthly.n1M) * 100).toFixed(0)}%` : '—'}</td>
                        <td colSpan={2} className={clsx('py-1 px-2 text-right num border-l border-primary-200 dark:border-primary-700', sec.totalEcart === 0 ? '' : (sec.isCharge ? (sec.totalEcart <= 0 ? 'text-success' : 'text-error') : (sec.totalEcart >= 0 ? 'text-success' : 'text-error')))}>
                          {sec.totalEcart >= 0 ? '+' : ''}{fmtK(sec.totalEcart)}
                        </td>
                        <td className="py-1 px-2 text-right num">{n1Ytd ? `${((sec.totalRealise - n1Ytd) / Math.abs(n1Ytd) * 100).toFixed(0)}%` : '—'}</td>
                      </tr>
                    </tbody>
                  </table>
                );
              })()}

              <div className="mb-3">
                <div className="flex justify-between text-[10px] text-primary-500 mb-1">
                  <span>Poids dans l'activité</span>
                  <span className="num font-semibold">{ref ? ((sec.totalRealise / ref) * 100).toFixed(1) : 0} %</span>
                </div>
                <div className="h-2 bg-primary-200 dark:bg-primary-800 rounded-full overflow-hidden">
                  <div className={clsx('h-full rounded-full', sec.isCharge ? 'bg-error' : 'bg-success')}
                       style={{ width: `${ref ? (sec.totalRealise / ref) * 100 : 0}%` }} />
                </div>
              </div>

              <p className="text-[10px] uppercase text-primary-500 font-semibold mb-1.5">Top 3 comptes</p>
              <div className="space-y-1">
                {top3.map((r) => (
                  <div key={r.code} className="flex justify-between items-center text-xs border-b border-primary-100 dark:border-primary-800 pb-1">
                    <span className="truncate"><span className="font-mono text-primary-500 mr-1.5">{r.code}</span>{r.label}</span>
                    <span className="num font-semibold ml-2">{fmtFull(r.realise)}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 card p-4 bg-primary-200/40 dark:bg-primary-800/30 text-xs text-primary-600 dark:text-primary-400">
        <strong>Astuce :</strong> Pour personnaliser les libellés et l'ordre des sections, allez dans <strong>États financiers → Compte de résultat → Synthèse</strong>.
      </div>
    </>
  );
}
