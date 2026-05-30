/* eslint-disable @typescript-eslint/no-explicit-any -- interop dynamique (parsers, payloads Supabase/Edge Functions, helpers Recharts). À typer finement au cas par cas. */
// ── ISBudgetVsActual + CashflowStatement + KPIBox + ReceivablesReview ─
import { useEffect, useState } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, ComposedChart, Line,
} from 'recharts';
import clsx from 'clsx';
import { useStatements, useBudgetActual } from '../../hooks/useFinancials';
import { useChartTheme } from '../../lib/chartTheme';
import { ChartGradients, barGradId } from '../../components/charts/ChartGradients';
import { bySection, loadLabels, computeBudgetActual } from '../../engine/budgetActual';
import { useApp } from '../../store/app';
import { fmtFull, fmtK } from '../../lib/format';
import { tresorerieMonthly, monthlyByPrefix } from '../../engine/analytics';

// ── ISBudgetVsActual ──────────────────────────────────────────────────
export function ISBudgetVsActual() {
  const rows = useBudgetActual();
  const { currentOrgId } = useApp();
  const sections = bySection(rows, currentOrgId);
  const labels = loadLabels(currentOrgId);

  if (!rows.length) return <div className="py-12 text-center text-primary-500">Chargement…</div>;

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { currentYear } = useApp();
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [n1Map, setN1Map] = useState<Map<string, number>>(new Map());
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (!currentOrgId) return;
    computeBudgetActual(currentOrgId, currentYear - 1).then((prev) => {
      const m = new Map<string, number>();
      for (const r of prev) m.set(r.code, r.realise);
      setN1Map(m);
    });
  }, [currentOrgId, currentYear]);

  const buildRow = (r: any) => {
    const realise = r.realise;
    const budget = r.budget;
    const diff = realise - budget;
    const pctActual = budget ? (realise / budget) * 100 : 0;
    const n1 = n1Map.get(r.code) ?? 0;
    const vsN1Pct = n1 ? ((realise - n1) / Math.abs(n1)) * 100 : 0;
    return { ...r, diff, pctActual, n1, vsN1Pct };
  };
  const dot = (pct: number, isCharge: boolean) => {
    const fav = isCharge ? pct <= 100 : pct >= 95;
    if (fav && (isCharge ? pct >= 80 : pct >= 95)) return 'OK';
    if (Math.abs(pct - 100) < 30) return '--';
    return '!!';
  };

  return (
    <div className="space-y-1">
      {sections.map((sec, idx) => {
        const enriched = sec.rows.map(buildRow);
        const totRealise = enriched.reduce((s, r) => s + r.realise, 0);
        const totBudget = enriched.reduce((s, r) => s + r.budget, 0);
        const totDiff = totRealise - totBudget;
        const totN1 = enriched.reduce((s, r) => s + r.n1, 0);
        const totPct = totBudget ? (totRealise / totBudget) * 100 : 0;
        const totVsN1 = totN1 ? ((totRealise - totN1) / Math.abs(totN1)) * 100 : 0;
        const ytdMul = 3;

        return (
          <div key={sec.section} className="card overflow-hidden">
            <div className="bg-primary-900 dark:bg-primary-800 px-4 py-2 flex items-center justify-between">
              <p className="text-primary-50 font-bold text-sm">{idx + 1}. {labels[sec.section]}</p>
              <p className="text-primary-50 text-xs font-semibold">Mars</p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-primary-200 dark:bg-primary-800 border-b border-primary-300 dark:border-primary-700">
                    <th className="text-left py-2 px-3"></th>
                    <th colSpan={5} className="py-2 px-3 text-center font-semibold text-primary-700 dark:text-primary-200">Current period</th>
                    <th colSpan={2} className="py-2 px-3 text-center font-semibold text-primary-700 dark:text-primary-200 border-l border-primary-400 dark:border-primary-600">Versus N-1</th>
                    <th colSpan={4} className="py-2 px-3 text-center font-semibold text-primary-700 dark:text-primary-200 border-l border-primary-400 dark:border-primary-600">Year-to-date</th>
                  </tr>
                  <tr className="bg-primary-100 dark:bg-primary-900 border-b-2 border-primary-300 dark:border-primary-700 text-primary-500 uppercase text-[10px] tracking-wider">
                    <th className="text-left py-2 px-3 w-72"></th>
                    <th className="text-right py-2 px-2">Budget</th>
                    <th className="text-right py-2 px-2">Actual</th>
                    <th className="text-right py-2 px-2">Diff</th>
                    <th className="text-right py-2 px-2">% Actual</th>
                    <th className="w-6"></th>
                    <th className="text-right py-2 px-2 border-l border-primary-300 dark:border-primary-700">Actual</th>
                    <th className="text-right py-2 px-2">%</th>
                    <th className="text-right py-2 px-2 border-l border-primary-300 dark:border-primary-700">Budget</th>
                    <th className="text-right py-2 px-2">Actual</th>
                    <th className="text-right py-2 px-2">Diff</th>
                    <th className="text-right py-2 px-2">% Actual</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-primary-100 dark:divide-primary-800">
                  {enriched.map((r) => (
                    <tr key={r.code} className="hover:bg-primary-50 dark:hover:bg-primary-950">
                      <td className="py-1.5 px-3 text-primary-800 dark:text-primary-200">{r.label}</td>
                      <td className="text-right num py-1.5 px-2">{fmtFull(r.budget)}</td>
                      <td className="text-right num py-1.5 px-2 font-medium">{fmtFull(r.realise)}</td>
                      <td className={clsx('text-right num py-1.5 px-2', r.diff < 0 ? 'text-error' : '')}>
                        {r.diff < 0 ? `(${fmtFull(Math.abs(r.diff))})` : fmtFull(r.diff)}
                      </td>
                      <td className="text-right num py-1.5 px-2">{r.pctActual.toFixed(0)}%</td>
                      <td className="text-center py-1.5">{dot(r.pctActual, sec.isCharge)}</td>
                      <td className="text-right num py-1.5 px-2 border-l border-primary-100 dark:border-primary-800">{fmtFull(r.n1)}</td>
                      <td className={clsx('text-right num py-1.5 px-2', r.vsN1Pct < 0 ? 'text-error' : '')}>{r.vsN1Pct >= 0 ? '+' : ''}{r.vsN1Pct.toFixed(0)}%</td>
                      <td className="text-right num py-1.5 px-2 border-l border-primary-100 dark:border-primary-800">{fmtFull(r.budget * ytdMul)}</td>
                      <td className="text-right num py-1.5 px-2 font-medium">{fmtFull(r.realise * ytdMul)}</td>
                      <td className={clsx('text-right num py-1.5 px-2', r.diff < 0 ? 'text-error' : '')}>
                        {r.diff < 0 ? `(${fmtFull(Math.abs(r.diff) * ytdMul)})` : fmtFull(r.diff * ytdMul)}
                      </td>
                      <td className="text-right num py-1.5 px-2">{r.pctActual.toFixed(0)}%</td>
                    </tr>
                  ))}
                  <tr className="bg-primary-100 dark:bg-primary-900 italic font-semibold border-t-2 border-primary-300 dark:border-primary-700">
                    <td className="py-1.5 px-3 text-primary-800 dark:text-primary-100">Chiffre d'affaires</td>
                    <td className="text-right num py-1.5 px-2">{fmtFull(totBudget)}</td>
                    <td className="text-right num py-1.5 px-2">{fmtFull(totRealise)}</td>
                    <td className={clsx('text-right num py-1.5 px-2', totDiff < 0 ? 'text-error' : '')}>
                      {totDiff < 0 ? `(${fmtFull(Math.abs(totDiff))})` : fmtFull(totDiff)}
                    </td>
                    <td className="text-right num py-1.5 px-2">{totPct.toFixed(0)}%</td>
                    <td></td>
                    <td className="text-right num py-1.5 px-2 border-l">{fmtFull(totN1)}</td>
                    <td className={clsx('text-right num py-1.5 px-2', totVsN1 < 0 ? 'text-error' : '')}>{totVsN1 >= 0 ? '+' : ''}{totVsN1.toFixed(0)}%</td>
                    <td className="text-right num py-1.5 px-2 border-l">{fmtFull(totBudget * ytdMul)}</td>
                    <td className="text-right num py-1.5 px-2">{fmtFull(totRealise * ytdMul)}</td>
                    <td className={clsx('text-right num py-1.5 px-2', totDiff < 0 ? 'text-error' : '')}>
                      {totDiff < 0 ? `(${fmtFull(Math.abs(totDiff) * ytdMul)})` : fmtFull(totDiff * ytdMul)}
                    </td>
                    <td className="text-right num py-1.5 px-2">{totPct.toFixed(0)}%</td>
                  </tr>
                  <tr className="border-t-2 border-error font-bold">
                    <td className="py-2 px-3 text-primary-900 dark:text-primary-50 uppercase text-xs tracking-wider">Adjusted total</td>
                    <td className="text-right num py-2 px-2">{fmtFull(totBudget)}</td>
                    <td className="text-right num py-2 px-2">{fmtFull(totRealise)}</td>
                    <td className={clsx('text-right num py-2 px-2', totDiff < 0 ? 'text-error' : '')}>
                      {totDiff < 0 ? `(${fmtFull(Math.abs(totDiff))})` : fmtFull(totDiff)}
                    </td>
                    <td className="text-right num py-2 px-2">{totPct.toFixed(0)}%</td>
                    <td className="text-center">{dot(totPct, sec.isCharge)}</td>
                    <td className="text-right num py-2 px-2 border-l">{fmtFull(totN1)}</td>
                    <td className={clsx('text-right num py-2 px-2', totVsN1 < 0 ? 'text-error' : '')}>{totVsN1.toFixed(0)}%</td>
                    <td className="text-right num py-2 px-2 border-l">{fmtFull(totBudget * ytdMul)}</td>
                    <td className="text-right num py-2 px-2">{fmtFull(totRealise * ytdMul)}</td>
                    <td className={clsx('text-right num py-2 px-2', totDiff < 0 ? 'text-error' : '')}>
                      {totDiff < 0 ? `(${fmtFull(Math.abs(totDiff) * ytdMul)})` : fmtFull(totDiff * ytdMul)}
                    </td>
                    <td className="text-right num py-2 px-2">{totPct.toFixed(0)}%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── KPIBox ────────────────────────────────────────────────────────────
export function KPIBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-r border-primary-300 dark:border-primary-700 last:border-r-0 px-4 py-3 text-center">
      <p className="text-xs font-semibold text-primary-700 dark:text-primary-300">{label}</p>
      <p className="num text-lg font-bold mt-1">{value}</p>
    </div>
  );
}

// ── CashflowStatement ─────────────────────────────────────────────────
export function CashflowStatement() {
  const { currentOrgId, currentYear } = useApp();
  const ct = useChartTheme();
  const [data, setData] = useState<{ labels: string[]; cumul: number[]; encaissements: number[]; decaissements: number[]; opening: number }>({ labels: [], cumul: [], encaissements: [], decaissements: [], opening: 0 });

  useEffect(() => {
    if (!currentOrgId) return;
    tresorerieMonthly(currentOrgId, currentYear).then(setData);
  }, [currentOrgId, currentYear]);

  const totIn = data.encaissements.reduce((s, v) => s + v, 0);
  const totOut = data.decaissements.reduce((s, v) => s + v, 0);
  const ending = data.cumul.length ? data.cumul[data.cumul.length - 1] : data.opening;
  const incomePct = totIn ? ((totIn - totOut) / totIn) * 100 : 0;

  const chartData = data.labels.map((m, i) => ({
    mois: m,
    cashIn: data.encaissements[i] ?? 0,
    cashOut: data.decaissements[i] ?? 0,
    solde: data.cumul[i] ?? 0,
  }));

  return (
    <div className="card overflow-hidden">
      <div className="bg-white dark:bg-primary-900 border-b border-primary-200 dark:border-primary-800 px-4 py-2 flex justify-between items-center">
        <p className="text-primary-900 dark:text-primary-50 font-bold text-sm">Cashflow statement</p>
        <p className="text-primary-500 font-bold text-xs">Mars</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 border-b border-primary-300 dark:border-primary-700">
        <KPIBox label="Beginning Cash on hand" value={fmtFull(data.opening)} />
        <KPIBox label="Total Income" value={fmtFull(totIn)} />
        <KPIBox label="Total expenses" value={fmtFull(-totOut)} />
        <KPIBox label="Income / (loss) %" value={`${incomePct.toFixed(1)}%`} />
        <KPIBox label="Ending cash on hand" value={fmtFull(ending)} />
      </div>

      <div className="p-4">
        <ResponsiveContainer width="100%" height={380}>
          <ComposedChart data={chartData}>
            <ChartGradients />
            <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #e5e5e5)" />
            <XAxis dataKey="mois" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtK} />
            <Tooltip formatter={(v: any) => fmtFull(v)} />
            <Legend wrapperStyle={{ fontSize: 11 }} verticalAlign="bottom" />
            <Bar dataKey="cashIn" name="Cash in" fill={`url(#${barGradId(0)})`} radius={[6, 6, 0, 0]} />
            <Bar dataKey="cashOut" name="Cash out" fill={`url(#${barGradId(1)})`} radius={[6, 6, 0, 0]} />
            <Line type="linear" dataKey="solde" name="Solde" stroke={ct.at(2)} strokeWidth={2.5} dot={{ r: 4, fill: ct.at(2) }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── DarkKPI ───────────────────────────────────────────────────────────
export function DarkKPI({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-primary-800 dark:bg-primary-700 text-primary-50 px-4 py-3 text-center">
      <p className="text-xs font-semibold">{label}</p>
      <p className="num text-xl font-bold mt-1">{value}</p>
    </div>
  );
}

// ── ReceivablesReview ─────────────────────────────────────────────────
export function ReceivablesReview() {
  const { currentOrgId, currentYear } = useApp();
  const ct = useChartTheme();
  const { balance, movements } = useStatements();
  const [monthlyAR, setMonthlyAR] = useState<{ labels: string[]; values: number[] }>({ labels: [], values: [] });
  const [monthlyAP, setMonthlyAP] = useState<{ labels: string[]; values: number[] }>({ labels: [], values: [] });

  useEffect(() => {
    if (!currentOrgId) return;
    monthlyByPrefix(currentOrgId, currentYear, ['70']).then((d) => {
      let cum = 0;
      const cumValues = d.values.map((v) => (cum += v));
      setMonthlyAR({ labels: d.labels, values: cumValues });
    });
    monthlyByPrefix(currentOrgId, currentYear, ['60', '61', '62', '63']).then((d) => {
      let cum = 0;
      const cumValues = d.values.map((v) => (cum += v));
      setMonthlyAP({ labels: d.labels, values: cumValues });
    });
  }, [currentOrgId, currentYear]);

  const mvSource = movements && movements.length > 0 ? movements : balance;
  const totalSales = mvSource.filter((r) => r.account.startsWith('70')).reduce((s, r) => s + r.credit - r.debit, 0);
  const totalPurchases = mvSource
    .filter((r) => r.account.startsWith('60') || r.account.startsWith('61') || r.account.startsWith('62') || r.account.startsWith('63'))
    .reduce((s, r) => s + r.debit - r.credit, 0);

  const accountReceivable = balance.filter((r) => r.account.startsWith('41')).reduce((s, r) => s + r.soldeD, 0);
  const accountPayable = balance.filter((r) => r.account.startsWith('40')).reduce((s, r) => s + r.soldeC, 0);

  const pctReceivable = totalSales ? Math.round((accountReceivable / totalSales) * 100) : 0;
  const pctPayable = totalPurchases ? Math.round((accountPayable / totalPurchases) * 100) : 0;
  const pctReceivableBar = Math.min(pctReceivable, 100);
  const pctPayableBar = Math.min(pctPayable, 100);

  const arData = monthlyAR.labels.slice(0, 3).map((m, i) => ({ mois: m, value: monthlyAR.values[i] || 0 }));
  const apData = monthlyAP.labels.slice(0, 3).map((m, i) => ({ mois: m, value: monthlyAP.values[i] || 0 }));

  const teal = ct.at(0);
  const red = ct.at(1);

  return (
    <div className="card overflow-hidden">
      <div className="bg-white dark:bg-primary-900 border-b border-primary-200 dark:border-primary-800 px-4 py-2 flex justify-between items-center">
        <p className="text-primary-900 dark:text-primary-50 font-bold text-sm">5. Customer & others receivable management review</p>
        <p className="text-primary-500 font-bold text-xs">Mars</p>
      </div>
      <p className="px-4 py-2 italic text-primary-500 text-xs">This discussion concerns an overview of the level of receivables and debts at the end of 31 mars {currentYear}.</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4">
        <DarkKPI label="Total sales" value={fmtFull(totalSales)} />
        <DarkKPI label="Account receivable" value={fmtFull(accountReceivable)} />
        <DarkKPI label="Total Purchases" value={fmtFull(totalPurchases)} />
        <DarkKPI label="Account payable" value={fmtFull(accountPayable)} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 px-4">
        <div className="border border-primary-200 dark:border-primary-800 p-4">
          <div className="flex items-baseline justify-between mb-2">
            <p className="text-xs font-semibold">% Receivable = AR / Ventes</p>
            {pctReceivable > 100 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-warning/20 text-warning font-semibold">&gt; 100 % — inclut AN</span>}
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={[{ name: 'AR', value: pctReceivableBar }, { name: 'Reste', value: Math.max(100 - pctReceivableBar, 0) }]}
                cx="50%" cy="50%" innerRadius={60} outerRadius={85} dataKey="value" startAngle={90} endAngle={-270}>
                <Cell fill={teal} /><Cell fill={ct.at(5)} />
              </Pie>
              <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" className="num" style={{ fontSize: 24, fontWeight: 700 }}>
                {pctReceivable}%
              </text>
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="border border-primary-200 dark:border-primary-800 p-4">
          <div className="flex items-baseline justify-between mb-2">
            <p className="text-xs font-semibold">% Payable = AP / Achats larges (60-63)</p>
            {pctPayable > 100 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-warning/20 text-warning font-semibold">&gt; 100 % — inclut AN ou autres classes</span>}
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={[{ name: 'AP', value: pctPayableBar }, { name: 'Reste', value: Math.max(100 - pctPayableBar, 0) }]}
                cx="50%" cy="50%" innerRadius={60} outerRadius={85} dataKey="value" startAngle={90} endAngle={-270}>
                <Cell fill={red} /><Cell fill={ct.at(5)} />
              </Pie>
              <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" className="num" style={{ fontSize: 24, fontWeight: 700 }}>
                {pctPayable}%
              </text>
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
        <div className="border border-primary-200 dark:border-primary-800 p-4">
          <p className="text-xs font-semibold mb-2">Account receivable per month</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={arData}>
              <ChartGradients />
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #e5e5e5)" />
              <XAxis dataKey="mois" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtK} />
              <Tooltip formatter={(v: any) => fmtFull(v)} />
              <Bar dataKey="value" fill={teal}>
                {arData.map((_, i) => <Cell key={i} fill={teal} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="border border-primary-200 dark:border-primary-800 p-4">
          <p className="text-xs font-semibold mb-2">Account payable per month</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={apData}>
              <ChartGradients />
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #e5e5e5)" />
              <XAxis dataKey="mois" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtK} />
              <Tooltip formatter={(v: any) => fmtFull(v)} />
              <Bar dataKey="value" fill={red}>
                {apData.map((_, i) => <Cell key={i} fill={red} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
