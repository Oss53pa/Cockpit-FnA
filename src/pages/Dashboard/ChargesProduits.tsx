/* eslint-disable @typescript-eslint/no-explicit-any -- interop dynamique (parsers, payloads Supabase/Edge Functions, helpers Recharts). À typer finement au cas par cas. */
// ── ChargesProduits dashboard (Charges & Produits, 3 tabs) ──────────
import { useEffect, useState } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, AreaChart, Area,
} from 'recharts';
import { KPICard } from '../../components/ui/KPICardV2';
import { ChartCard } from '../../components/ui/ChartCard';
import { TabSwitch } from '../../components/ui/TabSwitch';
import { useStatements, useBudgetActual } from '../../hooks/useFinancials';
import { useChartTheme } from '../../lib/chartTheme';
import { ChartGradients, barGradId, areaGradId } from '../../components/charts/ChartGradients';
import { useApp } from '../../store/app';
import { fmtFull, fmtK } from '../../lib/format';
import { monthlyByPrefix, topAccountsByPrefix } from '../../engine/analytics';

export function ChargesProduits() {
  const { currentOrgId, currentYear } = useApp();
  const { sig, balance } = useStatements();
  const rowsBA = useBudgetActual();
  const ct = useChartTheme();
  const [view, setView] = useState<'charges' | 'produits' | 'comparatif'>('charges');
  const [chargesMonthly, setChargesMonthly] = useState<{ labels: string[]; values: number[] }>({ labels: [], values: [] });
  const [produitsMonthly, setProduitsMonthly] = useState<{ labels: string[]; values: number[] }>({ labels: [], values: [] });
  const [topCharges, setTopCharges] = useState<Array<{ code: string; label: string; value: number }>>([]);

  useEffect(() => {
    if (!currentOrgId) return;
    monthlyByPrefix(currentOrgId, currentYear, ['6']).then(setChargesMonthly);
    monthlyByPrefix(currentOrgId, currentYear, ['7']).then(setProduitsMonthly);
    topAccountsByPrefix(currentOrgId, currentYear, ['6'], 10).then(setTopCharges);
  }, [currentOrgId, currentYear]);

  const totalCharges = balance
    .filter((r) => r.account.startsWith('6'))
    .reduce((s, r) => s + (r.debit - r.credit), 0);
  const totalProduits = balance
    .filter((r) => r.account.startsWith('7'))
    .reduce((s, r) => s + (r.credit - r.debit), 0);
  const resultat = totalProduits - totalCharges;
  const ratioCA = totalProduits ? (totalCharges / totalProduits) * 100 : 0;

  const repartitionCharges = [
    { name: 'Achats & MP', prefix: ['60'], color: ct.at(0) },
    { name: 'Personnel', prefix: ['66'], color: ct.at(1) },
    { name: 'Services ext.', prefix: ['61','62','63'], color: ct.at(2) },
    { name: 'Amortissements', prefix: ['68','69'], color: ct.at(3) },
    { name: 'Impôts & taxes', prefix: ['64'], color: ct.at(4) },
    { name: 'Charges fin.', prefix: ['67'], color: ct.at(5) },
    { name: 'Autres', prefix: ['65'], color: ct.at(6) },
  ].map((c) => ({
    name: c.name,
    color: c.color,
    value: balance.filter((r) => c.prefix.some((p) => r.account.startsWith(p))).reduce((s, r) => s + r.debit - r.credit, 0),
  })).filter((c) => c.value > 0).map((c) => ({ ...c, pct: Math.round((c.value / Math.max(totalCharges, 1)) * 100) }));

  const repartitionProduits = [
    { name: 'Ventes marchandises',  prefix: ['701'], color: ct.at(0) },
    { name: 'Ventes produits',      prefix: ['702','703','704','708'], color: ct.at(1) },
    { name: 'Prestations services', prefix: ['705','706','707'], color: ct.at(2) },
    { name: 'Subventions',          prefix: ['71','74'], color: ct.at(3) },
    { name: 'Production (stockée / immobilisée)', prefix: ['72','73'], color: ct.at(4) },
    { name: 'Autres produits / Transferts',       prefix: ['75','78'], color: ct.at(5) },
    { name: 'Produits financiers',  prefix: ['77'], color: ct.at(6) },
    { name: 'Reprises',             prefix: ['79'], color: ct.at(0) + 'aa' },
  ].map((c) => ({
    name: c.name,
    color: c.color,
    value: balance.filter((r) => c.prefix.some((p) => r.account.startsWith(p))).reduce((s, r) => s + r.credit - r.debit, 0),
  })).filter((c) => c.value > 0).map((c) => ({ ...c, pct: Math.round((c.value / Math.max(totalProduits, 1)) * 100) }));

  const chargeShare = (prefixes: string[]) =>
    totalCharges > 0
      ? balance.filter((r) => prefixes.some((p) => r.account.startsWith(p))).reduce((s, r) => s + r.debit - r.credit, 0) / totalCharges
      : 0;
  const shAchats = chargeShare(['60']);
  const shServices = chargeShare(['61','62','63']);
  const shImpots = chargeShare(['64']);
  const shAutresCh = chargeShare(['65']);
  const shPersonnel = chargeShare(['66']);
  const shFin = chargeShare(['67']);
  const shAmort = chargeShare(['68','69']);
  const chargesEvol = chargesMonthly.labels.map((m, i) => {
    const row: any = { mois: m };
    const totMonth = chargesMonthly.values[i];
    row.achats = totalCharges > 0 && totMonth > 0 ? Math.round(totMonth * shAchats) : 0;
    row.services = totalCharges > 0 && totMonth > 0 ? Math.round(totMonth * shServices) : 0;
    row.impots = totalCharges > 0 && totMonth > 0 ? Math.round(totMonth * shImpots) : 0;
    row.autres = totalCharges > 0 && totMonth > 0 ? Math.round(totMonth * shAutresCh) : 0;
    row.personnel = totalCharges > 0 && totMonth > 0 ? Math.round(totMonth * shPersonnel) : 0;
    row.financiers = totalCharges > 0 && totMonth > 0 ? Math.round(totMonth * shFin) : 0;
    row.amortissements = totalCharges > 0 && totMonth > 0 ? Math.round(totMonth * shAmort) : 0;
    return row;
  });

  const prodShare = (prefixes: string[]) =>
    totalProduits > 0
      ? balance.filter((r) => prefixes.some((p) => r.account.startsWith(p))).reduce((s, r) => s + r.credit - r.debit, 0) / totalProduits
      : 0;
  const shareVentes = prodShare(['701','702','703','704','708']);
  const shareServices = prodShare(['705','706','707']);
  const shareSubv = prodShare(['71','74']);
  const shareProdImmob = prodShare(['72','73']);
  const shareFin = prodShare(['77']);
  const shareAutres = prodShare(['75','78','79']);
  const produitsEvol = produitsMonthly.labels.map((m, i) => {
    const row: any = { mois: m };
    const totMonth = produitsMonthly.values[i];
    if (totalProduits > 0 && totMonth > 0) {
      row.ventes = Math.round(totMonth * shareVentes);
      row.services = Math.round(totMonth * shareServices);
      row.subventions = Math.round(totMonth * shareSubv);
      row.prodImmob = Math.round(totMonth * shareProdImmob);
      row.financiers = Math.round(totMonth * shareFin);
      row.autres = Math.round(totMonth * shareAutres);
    } else {
      row.ventes = 0; row.services = 0; row.subventions = 0; row.prodImmob = 0; row.financiers = 0; row.autres = 0;
    }
    return row;
  });

  const budgetVsRealise = topCharges.slice(0, 7).map((r) => {
    const ba = (rowsBA ?? []).find((x: any) => x.code === r.code);
    return { poste: r.code, realise: r.value, budget: ba?.budget ?? 0 };
  });

  const charFixes = chargesMonthly.values.map((v, i) => ({
    mois: chargesMonthly.labels[i],
    fixes: 0,
    variables: 0,
    total: v,
  }));

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4 mb-4">
        <KPICard title="Total Charges" value={fmtK(totalCharges)} unit="XOF" color={ct.at(1)} icon="CH" inverse />
        <KPICard title="Total Produits" value={fmtK(totalProduits)} unit="XOF" color={ct.at(0)} icon="PR" />
        <KPICard title="Résultat" value={fmtK(resultat)} unit="XOF" color={ct.at(0)} icon="RE" />
        <KPICard title="Ratio Charges/CA" value={`${ratioCA.toFixed(1)} %`} color={ct.at(2)} icon="RA" inverse />
        <KPICard title="Marge brute" value={fmtK(sig?.margeBrute ?? 0)} unit="XOF" color={ct.at(3)} icon="MB" />
      </div>

      <TabSwitch value={view} onChange={setView} activeColor={ct.at(0)}
        tabs={[{ key: 'charges', label: 'Charges' }, { key: 'produits', label: 'Produits' }, { key: 'comparatif', label: 'Comparatif Budget' }]} />

      {view === 'charges' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <ChartCard title="Évolution mensuelle des charges par nature" className="lg:col-span-2">
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={chargesEvol}>
                <ChartGradients />
                <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #e5e5e5)" />
                <XAxis dataKey="mois" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtK} />
                <Tooltip formatter={(v: any) => fmtFull(v)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Area type="monotone" dataKey="achats" name="Achats" stackId="1" fill={`url(#${areaGradId(0)})`} stroke={ct.at(0)} fillOpacity={0.8} />
                <Area type="monotone" dataKey="personnel" name="Personnel" stackId="1" fill={`url(#${areaGradId(1)})`} stroke={ct.at(1)} fillOpacity={0.8} />
                <Area type="monotone" dataKey="services" name="Services ext." stackId="1" fill={`url(#${areaGradId(2)})`} stroke={ct.at(2)} fillOpacity={0.8} />
                <Area type="monotone" dataKey="amortissements" name="Amortiss." stackId="1" fill={`url(#${areaGradId(3)})`} stroke={ct.at(3)} fillOpacity={0.8} />
                <Area type="monotone" dataKey="autres" name="Autres" stackId="1" fill={`url(#${areaGradId(4)})`} stroke={ct.at(4)} fillOpacity={0.8} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Répartition des charges">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={repartitionCharges} cx="50%" cy="50%" innerRadius={45} outerRadius={75} dataKey="value"
                  label={(p: any) => `${p.pct}%`}>
                  {repartitionCharges.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Pie>
                <Tooltip formatter={(v: any) => fmtFull(v)} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-1.5 justify-center mt-1">
              {repartitionCharges.map((e, i) => (
                <span key={i} className="text-[9px] flex items-center gap-1">
                  <span className="w-2 h-2 rounded-sm inline-block" style={{ background: e.color }} />{e.name}
                </span>
              ))}
            </div>
          </ChartCard>

          <ChartCard title="Charges Fixes vs Variables">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={charFixes}>
                <ChartGradients />
                <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #e5e5e5)" />
                <XAxis dataKey="mois" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtK} />
                <Tooltip formatter={(v: any) => fmtFull(v)} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="fixes" name="Charges fixes" stackId="a" fill={`url(#${barGradId(0)})`} radius={[6, 6, 0, 0]} />
                <Bar dataKey="variables" name="Variables" stackId="a" fill={`url(#${barGradId(1)})`} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Top 10 Postes de Charges" className="lg:col-span-2">
            <div className="text-xs max-h-[220px] overflow-y-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b-2 border-primary-200 dark:border-primary-700">
                    <th className="text-left py-1.5 px-1 text-primary-500 font-semibold">Compte</th>
                    <th className="text-right py-1.5 px-1 text-primary-500 font-semibold">Montant</th>
                    <th className="text-right py-1.5 px-1 text-primary-500 font-semibold">% Charges</th>
                    <th className="text-right py-1.5 px-1 text-primary-500 font-semibold">Var N-1</th>
                  </tr>
                </thead>
                <tbody>
                  {topCharges.map((c, i) => (
                    <tr key={i} className="border-b border-primary-100 dark:border-primary-800">
                      <td className="py-1 px-1">{c.code} — {c.label}</td>
                      <td className="text-right num font-semibold">{fmtFull(c.value)}</td>
                      <td className="text-right num text-primary-500">{((c.value / Math.max(totalCharges, 1)) * 100).toFixed(1)} %</td>
                      <td className="text-right num text-primary-400">—</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ChartCard>
        </div>
      )}

      {view === 'produits' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <ChartCard title="Évolution mensuelle des produits par nature" className="lg:col-span-2">
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={produitsEvol}>
                <ChartGradients />
                <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #e5e5e5)" />
                <XAxis dataKey="mois" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtK} />
                <Tooltip formatter={(v: any) => fmtFull(v)} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Area type="monotone" dataKey="ventes" name="Ventes" stackId="1" fill={`url(#${areaGradId(0)})`} stroke={ct.at(0)} fillOpacity={0.8} />
                <Area type="monotone" dataKey="services" name="Services" stackId="1" fill={`url(#${areaGradId(1)})`} stroke={ct.at(1)} fillOpacity={0.8} />
                <Area type="monotone" dataKey="subventions" name="Subventions" stackId="1" fill={`url(#${areaGradId(2)})`} stroke={ct.at(2)} fillOpacity={0.8} />
                <Area type="monotone" dataKey="autres" name="Autres" stackId="1" fill={`url(#${areaGradId(3)})`} stroke={ct.at(3)} fillOpacity={0.8} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Répartition des produits">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={repartitionProduits} cx="50%" cy="50%" innerRadius={45} outerRadius={75} dataKey="value"
                  label={(p: any) => `${p.pct}%`}>
                  {repartitionProduits.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Pie>
                <Tooltip formatter={(v: any) => fmtFull(v)} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-1.5 justify-center mt-1">
              {repartitionProduits.map((e, i) => (
                <span key={i} className="text-[9px] flex items-center gap-1">
                  <span className="w-2 h-2 rounded-sm inline-block" style={{ background: e.color }} />{e.name}
                </span>
              ))}
            </div>
          </ChartCard>
        </div>
      )}

      {view === 'comparatif' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard title="Budget vs Réalisé par poste" className="lg:col-span-2">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={budgetVsRealise} layout="vertical" barGap={4}>
                <ChartGradients />
                <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #e5e5e5)" />
                <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={fmtK} />
                <YAxis type="category" dataKey="poste" tick={{ fontSize: 10 }} width={80} />
                <Tooltip formatter={(v: any) => fmtFull(v)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="realise" name="Réalisé" fill={`url(#${barGradId(0)})`} radius={[0,6,6,0]} />
                <Bar dataKey="budget" name="Budget" fill={`url(#${barGradId(3)})`} radius={[0,6,6,0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Écarts Budget vs Réalisé">
            <div className="text-xs">
              {budgetVsRealise.map((item, i) => {
                const ecart = item.realise - item.budget;
                const pct = item.budget ? ((ecart / item.budget) * 100).toFixed(1) : '0';
                const favorable = ecart <= 0;
                return (
                  <div key={i} className="flex justify-between items-center py-2 border-b border-primary-100 dark:border-primary-800">
                    <span className="font-medium">{item.poste}</span>
                    <div className="flex gap-3 items-center">
                      <span className="num font-semibold" style={{ color: favorable ? ct.at(4) : ct.at(1) }}>
                        {ecart > 0 ? '+' : ''}{fmtFull(ecart)}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{
                        background: favorable ? '#dcfce7' : '#fee2e2', color: favorable ? '#16a34a' : '#dc2626' }}>
                        {favorable ? '✓' : '⚠'} {pct}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </ChartCard>

          <ChartCard title="Synthèse budgétaire">
            <div className="p-2">
              {[
                { label: 'Total Budget Charges', value: fmtFull(budgetVsRealise.reduce((s, r) => s + r.budget, 0)), color: ct.at(3) },
                { label: 'Total Réalisé Charges', value: fmtFull(budgetVsRealise.reduce((s, r) => s + r.realise, 0)), color: ct.at(1) },
                { label: 'Écart global', value: fmtFull(budgetVsRealise.reduce((s, r) => s + r.realise - r.budget, 0)), color: ct.at(1) },
                { label: 'Postes en dépassement', value: `${budgetVsRealise.filter(r => r.realise > r.budget).length} / ${budgetVsRealise.length}`, color: ct.at(1) },
                { label: 'Postes favorables', value: `${budgetVsRealise.filter(r => r.realise <= r.budget).length} / ${budgetVsRealise.length}`, color: ct.at(4) },
              ].map((item, i) => (
                <div key={i} className="flex justify-between py-2.5 border-b border-primary-100 dark:border-primary-800">
                  <span className="text-xs text-primary-600">{item.label}</span>
                  <span className="num text-sm font-bold" style={{ color: item.color }}>{item.value}</span>
                </div>
              ))}
            </div>
          </ChartCard>
        </div>
      )}
    </>
  );
}
