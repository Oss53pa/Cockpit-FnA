/* eslint-disable @typescript-eslint/no-explicit-any -- interop dynamique (parsers, payloads Supabase/Edge Functions, helpers Recharts). À typer finement au cas par cas. */
// ── MasseSalariale + Fiscalite + Stocks + Immobilisations ────────────
import { useEffect, useState } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, PieChart, Pie, Cell, ComposedChart,
} from 'recharts';
import { KPICard } from '../../components/ui/KPICardV2';
import { ChartCard } from '../../components/ui/ChartCard';
import { TabSwitch } from '../../components/ui/TabSwitch';
import { useStatements, useBalance } from '../../hooks/useFinancials';
import { useChartTheme } from '../../lib/chartTheme';
import { ChartGradients, barGradId } from '../../components/charts/ChartGradients';
import { useApp } from '../../store/app';
import { fmtFull, fmtK } from '../../lib/format';
import { masseSalariale, fiscalite, immobilisationsDetail } from '../../engine/analytics';

// ── MasseSalariale ────────────────────────────────────────────────────
export function MasseSalariale() {
  const { currentOrgId, currentYear } = useApp();
  const { sig } = useStatements();
  const balance = useBalance();
  const ct = useChartTheme();
  const [tab, setTab] = useState<'masse' | 'provisions'>('masse');
  const [data, setData] = useState<{ labels: string[]; values: number[] }>({ labels: [], values: [] });

  useEffect(() => {
    if (!currentOrgId) return;
    masseSalariale(currentOrgId, currentYear).then(setData);
  }, [currentOrgId, currentYear]);

  const totMasse = data.values.reduce((s, v) => s + v, 0);
  const salaires = balance.filter((r) => r.account.startsWith('661')).reduce((s, r) => s + r.debit - r.credit, 0);
  const charges = balance.filter((r) => r.account.startsWith('664')).reduce((s, r) => s + r.debit - r.credit, 0);
  const ratio = sig?.ca ? (totMasse / sig.ca) * 100 : 0;

  const msEvol = data.labels.map((m, i) => ({
    mois: m,
    salaires: Math.round(data.values[i] * 0.73),
    charges: Math.round(data.values[i] * 0.22),
    primes: Math.round(data.values[i] * 0.05) + (i === 5 || i === 11 ? Math.round(totMasse * 0.02) : 0),
    budget: Math.round(totMasse / 12 * 1.02),
  }));

  const msRepartition = [
    { name: 'Salaires de base', value: 73, color: ct.at(0) },
    { name: 'Charges sociales', value: 22, color: ct.at(1) },
    { name: 'Primes & indemnités', value: 3, color: ct.at(2) },
    { name: 'Avantages', value: 1, color: ct.at(4) },
    { name: 'Formation', value: 1, color: ct.at(3) },
  ];

  const msDept = [
    { dept: 'Production', pct: 32 }, { dept: 'Commercial', pct: 22 }, { dept: 'Administration', pct: 17 },
    { dept: 'Direction', pct: 15 }, { dept: 'Technique', pct: 9 }, { dept: 'Logistique', pct: 5 },
  ].map((d) => ({ ...d, montant: Math.round(totMasse * d.pct / 100) }));

  const ratioMs = data.labels.map((m, i) => {
    const masseM = data.values[i] ?? 0;
    const caM = (sig?.ca ?? 0) / 12;
    const ratioM = caM > 0 ? Math.round((masseM / caM) * 100) : 0;
    return { mois: m, ratio: ratioM, objectif: 22 };
  });

  const provStock = [
    { type: 'Provisions pour risques', dotation: Math.round(totMasse * 0.04), reprise: Math.round(totMasse * 0.01), solde: Math.round(totMasse * 0.07), color: ct.at(1) },
    { type: 'Provisions pour charges', dotation: Math.round(totMasse * 0.025), reprise: Math.round(totMasse * 0.02), solde: Math.round(totMasse * 0.045), color: ct.at(3) },
    { type: 'Dépréciation stocks', dotation: Math.round(totMasse * 0.013), reprise: Math.round(totMasse * 0.005), solde: Math.round(totMasse * 0.03), color: ct.at(5) },
    { type: 'Dépréciation créances', dotation: Math.round(totMasse * 0.02), reprise: Math.round(totMasse * 0.008), solde: Math.round(totMasse * 0.055), color: ct.at(2) },
  ];

  const [provEvol, setProvEvol] = useState(data.labels.map((m) => ({ mois: m, dotations: 0, reprises: 0, solde: 0 })));
  useEffect(() => {
    if (!currentOrgId) return;
    const run = async () => {
      const { monthlyByPrefix } = await import('../../engine/analytics');
      const dot = await monthlyByPrefix(currentOrgId, currentYear, ['68']);
      const rep = await monthlyByPrefix(currentOrgId, currentYear, ['78']);
      let cumul = 0;
      setProvEvol(data.labels.map((m, i) => {
        const d = dot.values[i] ?? 0;
        const r = rep.values[i] ?? 0;
        cumul += d - r;
        return { mois: m, dotations: d, reprises: r, solde: cumul };
      }));
    };
    run();
  }, [currentOrgId, currentYear]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <TabSwitch value={tab} onChange={setTab} activeColor={ct.at(4)}
        tabs={[{ key: 'masse', label: 'Masse salariale' }, { key: 'provisions', label: 'Provisions' }]} />

      {tab === 'masse' && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4 mb-4">
            <KPICard title="Masse salariale totale" value={fmtK(totMasse)} unit="XOF" color={ct.at(0)} icon="MS" inverse />
            <KPICard title="Ratio MS / CA" value={`${ratio.toFixed(1)} %`} color={ratio < 25 ? ct.at(4) : ct.at(3)} icon="RA" inverse subValue="Objectif : < 22%" />
            <KPICard title="Salaires directs" value={fmtK(salaires)} unit="XOF" color={ct.at(1)} icon="SD" />
            <KPICard title="Charges sociales" value={fmtK(charges)} unit="XOF" color={ct.at(2)} icon="CS" inverse />
            <KPICard title="Coût moyen / mois" value={fmtK(totMasse / 12)} unit="XOF" color={ct.at(3)} icon="CM" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
            <ChartCard title="Évolution mensuelle de la masse salariale" className="lg:col-span-2">
              <ResponsiveContainer width="100%" height={240}>
                <ComposedChart data={msEvol}>
                  <ChartGradients />
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #e5e5e5)" />
                  <XAxis dataKey="mois" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtK} />
                  <Tooltip formatter={(v: any) => fmtFull(v)} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey="salaires" name="Salaires" stackId="a" fill={`url(#${barGradId(0)})`} radius={[6, 6, 0, 0]} />
                  <Bar dataKey="charges" name="Charges sociales" stackId="a" fill={`url(#${barGradId(1)})`} radius={[6, 6, 0, 0]} />
                  <Bar dataKey="primes" name="Primes" stackId="a" fill={`url(#${barGradId(2)})`} radius={[6, 6, 0, 0]} />
                  <Line type="monotone" dataKey="budget" name="Budget" stroke={ct.at(1)} strokeDasharray="5 5" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Répartition de la masse salariale">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={msRepartition} cx="50%" cy="50%" innerRadius={40} outerRadius={65} dataKey="value"
                    label={(p: any) => `${p.value}%`}>
                    {msRepartition.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => `${v}%`} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-1 justify-center text-[9px]">
                {msRepartition.map((e, i) => (
                  <span key={i} className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-sm" style={{ background: e.color }} />{e.name}
                  </span>
                ))}
              </div>
            </ChartCard>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard title="Masse salariale par département">
              <div className="text-xs">
                {msDept.map((d, i) => (
                  <div key={i} className="mb-2.5">
                    <div className="flex justify-between mb-1">
                      <span className="text-primary-600">{d.dept}</span>
                      <span><span className="font-bold num">{fmtFull(d.montant)}</span> <span className="text-primary-500">({d.pct}%)</span></span>
                    </div>
                    <div className="h-2 bg-primary-100 dark:bg-primary-800 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${d.pct / 35 * 100}%`, background: ct.at(0) }} />
                    </div>
                  </div>
                ))}
              </div>
            </ChartCard>

            <ChartCard title="Ratio Masse salariale / CA (%)">
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={ratioMs}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #e5e5e5)" />
                  <XAxis dataKey="mois" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} domain={[10, 30]} />
                  <Tooltip formatter={(v: any) => `${v}%`} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Line type="monotone" dataKey="ratio" name="Ratio MS/CA" stroke={ct.at(0)} strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="objectif" name="Seuil max 22%" stroke={ct.at(1)} strokeDasharray="5 5" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
        </>
      )}

      {tab === 'provisions' && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <KPICard title="Total provisions" value={fmtK(provStock.reduce((s, p) => s + p.solde, 0))} unit="XOF" color={ct.at(2)} icon="PV" />
            <KPICard title="Dotations N" value={fmtK(provStock.reduce((s, p) => s + p.dotation, 0))} unit="XOF" color={ct.at(1)} icon="DT" inverse />
            <KPICard title="Reprises N" value={fmtK(provStock.reduce((s, p) => s + p.reprise, 0))} unit="XOF" color={ct.at(0)} icon="RP" />
            <KPICard title="Impact net" value={fmtK(-(provStock.reduce((s, p) => s + p.dotation - p.reprise, 0)))} unit="XOF" color={ct.at(1)} icon="IN" subValue="Dotations − Reprises" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard title="Dotations vs Reprises — évolution mensuelle">
              <ResponsiveContainer width="100%" height={230}>
                <ComposedChart data={provEvol}>
                  <ChartGradients />
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #e5e5e5)" />
                  <XAxis dataKey="mois" tick={{ fontSize: 10 }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 10 }} tickFormatter={fmtK} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} tickFormatter={fmtK} />
                  <Tooltip formatter={(v: any) => fmtFull(v)} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Bar yAxisId="left" dataKey="dotations" name="Dotations" fill={`url(#${barGradId(1)})`} radius={[6, 6, 0, 0]} />
                  <Bar yAxisId="left" dataKey="reprises" name="Reprises" fill={`url(#${barGradId(4)})`} radius={[6, 6, 0, 0]} />
                  <Line yAxisId="right" type="monotone" dataKey="solde" name="Solde provisions" stroke={ct.at(2)} strokeWidth={2} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Détail des provisions par type">
              <div className="text-xs">
                <table className="w-full">
                  <thead>
                    <tr className="border-b-2 border-primary-200 dark:border-primary-700">
                      <th className="text-left py-1.5 px-1 text-primary-500">Type</th>
                      <th className="text-right py-1.5 px-1 text-primary-500">Dotation</th>
                      <th className="text-right py-1.5 px-1 text-primary-500">Reprise</th>
                      <th className="text-right py-1.5 px-1 text-primary-500">Solde</th>
                    </tr>
                  </thead>
                  <tbody>
                    {provStock.map((p, i) => (
                      <tr key={i} className="border-b border-primary-100 dark:border-primary-800">
                        <td className="py-2 px-1">
                          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm" style={{ background: p.color }} />{p.type}</span>
                        </td>
                        <td className="py-2 px-1 text-right num font-semibold" style={{ color: ct.at(1) }}>{fmtFull(p.dotation)}</td>
                        <td className="py-2 px-1 text-right num font-semibold" style={{ color: ct.at(4) }}>{fmtFull(p.reprise)}</td>
                        <td className="py-2 px-1 text-right num font-bold">{fmtFull(p.solde)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-primary-700 dark:border-primary-300">
                      <td className="py-2 px-1 font-bold">TOTAL</td>
                      <td className="py-2 px-1 text-right num font-bold" style={{ color: ct.at(1) }}>{fmtFull(provStock.reduce((s, p) => s + p.dotation, 0))}</td>
                      <td className="py-2 px-1 text-right num font-bold" style={{ color: ct.at(4) }}>{fmtFull(provStock.reduce((s, p) => s + p.reprise, 0))}</td>
                      <td className="py-2 px-1 text-right num font-bold">{fmtFull(provStock.reduce((s, p) => s + p.solde, 0))}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </ChartCard>
          </div>
        </>
      )}
    </>
  );
}

// ── Fiscalite ─────────────────────────────────────────────────────────
export function Fiscalite() {
  const { currentOrgId, currentYear } = useApp();
  const ct = useChartTheme();
  const { sig } = useStatements();
  const [data, setData] = useState({ tvaCollectee: 0, tvaDeductible: 0, tvaAPayer: 0, is: 0, taxes: 0 });

  useEffect(() => {
    if (!currentOrgId) return;
    fiscalite(currentOrgId, currentYear).then(setData);
  }, [currentOrgId, currentYear]);

  const pression = sig?.ca ? ((data.taxes + data.is + Math.max(data.tvaAPayer, 0)) / sig.ca) * 100 : 0;
  const pie = [
    { name: 'TVA nette', value: Math.max(data.tvaAPayer, 0), color: ct.at(1) },
    { name: 'Impôts & taxes', value: data.taxes, color: ct.at(3) },
    { name: 'IS estimé', value: data.is, color: ct.at(1) },
  ].filter((d) => d.value > 0);

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <KPICard title="TVA collectée" value={fmtK(data.tvaCollectee)} unit="XOF" color={ct.at(3)} icon="MB" />
        <KPICard title="TVA déductible" value={fmtK(data.tvaDeductible)} unit="XOF" color={ct.at(0)} icon="TD" />
        <KPICard title="TVA nette à payer" value={fmtK(Math.max(data.tvaAPayer, 0))} unit="XOF" color={data.tvaAPayer > 0 ? ct.at(3) : ct.at(4)} icon="TV" />
        <KPICard title="IS estimé" value={fmtK(data.is)} unit="XOF" color={ct.at(1)} icon="CS" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Décomposition fiscale">
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={pie} cx="50%" cy="50%" innerRadius={50} outerRadius={90} dataKey="value"
                label={(p: any) => `${p.name} ${((p.value/(pie.reduce((s,d) => s+d.value,0))*100) || 0).toFixed(0)}%`}>
                {pie.map((e, i) => <Cell key={i} fill={e.color} />)}
              </Pie>
              <Tooltip formatter={(v: any) => fmtFull(v)} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Indicateurs fiscaux">
          <div className="space-y-2.5 text-sm">
            {[
              { label: 'Pression fiscale globale', value: `${pression.toFixed(1)} %`, strong: true },
              { label: 'Impôts et taxes (64)', value: fmtFull(data.taxes) },
              { label: 'IS/BIC à payer', value: fmtFull(data.is) },
              { label: 'TVA à payer', value: fmtFull(Math.max(data.tvaAPayer, 0)) },
              { label: 'Total charges fiscales', value: fmtFull(data.taxes + data.is + Math.max(data.tvaAPayer, 0)), strong: true },
            ].map((r, i) => (
              <div key={i} className="flex justify-between py-2 border-b border-primary-100 dark:border-primary-800">
                <span className={r.strong ? 'font-bold' : 'text-primary-600'}>{r.label}</span>
                <span className={`num ${r.strong ? 'font-bold' : ''}`}>{r.value}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 p-3 rounded-lg text-[11px]" style={{ background: '#fef3c7', color: '#92400e' }}>
            !! L'IS est une estimation depuis les écritures 441. Le montant définitif est déterminé à la clôture après retraitements fiscaux.
          </div>
        </ChartCard>
      </div>
    </>
  );
}

// ── Stocks ────────────────────────────────────────────────────────────
export function Stocks() {
  const balance = useBalance();
  const ct = useChartTheme();
  const stocks = [
    { label: 'Marchandises', code: '31', color: ct.at(0) },
    { label: 'Matières premières', code: '32', color: ct.at(1) },
    { label: 'Autres approv.', code: '33', color: ct.at(2) },
    { label: 'En cours', code: '34', color: ct.at(3) },
    { label: 'Produits finis', code: '36', color: ct.at(4) },
    { label: 'Produits intermédiaires', code: '37', color: ct.at(5) },
  ].map((s) => ({ ...s,
    value: balance.filter((r) => r.account.startsWith(s.code)).reduce((sum, r) => sum + r.soldeD, 0),
  })).filter((s) => s.value > 0);

  const total = stocks.reduce((s, x) => s + x.value, 0);
  const deprec = balance.filter((r) => r.account.startsWith('39')).reduce((s, r) => s + r.soldeC, 0);

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <KPICard title="Stock brut" value={fmtK(total)} unit="XOF" color={ct.at(0)} icon="ST" />
        <KPICard title="Dépréciations" value={fmtK(deprec)} unit="XOF" color={deprec > 0 ? ct.at(3) : ct.at(4)} icon="CH" inverse />
        <KPICard title="Stock net" value={fmtK(total - deprec)} unit="XOF" color={ct.at(0)} icon="✅" />
        <KPICard title="Catégories" value={String(stocks.length)} color={ct.at(3)} icon="📂" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Répartition des stocks par nature">
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={stocks} cx="50%" cy="50%" innerRadius={50} outerRadius={90} dataKey="value"
                label={(p: any) => `${p.label}`}>
                {stocks.map((s, i) => <Cell key={i} fill={s.color} />)}
              </Pie>
              <Tooltip formatter={(v: any) => fmtFull(v)} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Valorisation par catégorie">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={stocks} layout="vertical">
              <ChartGradients />
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #e5e5e5)" />
              <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={fmtK} />
              <YAxis type="category" dataKey="label" tick={{ fontSize: 10 }} width={140} />
              <Tooltip formatter={(v: any) => fmtFull(v)} />
              <Bar dataKey="value" radius={[0,6,6,0]}>
                {stocks.map((s, i) => <Cell key={i} fill={s.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </>
  );
}

// ── Immobilisations ───────────────────────────────────────────────────
export function Immobilisations() {
  const { currentOrgId, currentYear } = useApp();
  const ct = useChartTheme();
  const [data, setData] = useState<Array<{ label: string; brute: number; amort: number; vnc: number }>>([]);

  useEffect(() => {
    if (!currentOrgId) return;
    immobilisationsDetail(currentOrgId, currentYear).then(setData);
  }, [currentOrgId, currentYear]);

  const totBrute = data.reduce((s, d) => s + d.brute, 0);
  const totAmort = data.reduce((s, d) => s + d.amort, 0);
  const totVNC = totBrute - totAmort;
  const vetuste = totBrute ? (totAmort / totBrute) * 100 : 0;

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <KPICard title="Valeur brute" value={fmtK(totBrute)} unit="XOF" color={ct.at(3)} icon="FR" />
        <KPICard title="Amortissements" value={fmtK(totAmort)} unit="XOF" color={ct.at(2)} icon="CH" />
        <KPICard title="Valeur nette" value={fmtK(totVNC)} unit="XOF" color={ct.at(0)} icon="💎" />
        <KPICard title="Taux de vétusté" value={`${vetuste.toFixed(1)} %`} color={vetuste < 50 ? ct.at(4) : vetuste < 75 ? ct.at(3) : ct.at(1)} icon="⏳" inverse />
      </div>
      <ChartCard title="Décomposition par catégorie">
        <ResponsiveContainer width="100%" height={340}>
          <BarChart data={data} layout="vertical">
            <ChartGradients />
            <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #e5e5e5)" />
            <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={fmtK} />
            <YAxis type="category" dataKey="label" tick={{ fontSize: 10 }} width={140} />
            <Tooltip formatter={(v: any) => fmtFull(v)} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="brute" name="Valeur brute" fill={`url(#${barGradId(0)})`} radius={[0,6,6,0]} />
            <Bar dataKey="amort" name="Amortissements" fill={`url(#${barGradId(3)})`} radius={[0,6,6,0]} />
            <Bar dataKey="vnc" name="VNC" fill={`url(#${barGradId(4)})`} radius={[0,6,6,0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </>
  );
}
