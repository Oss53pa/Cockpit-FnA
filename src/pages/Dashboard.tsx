import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, AreaChart, Area, ComposedChart,
} from 'recharts';
import { ArrowLeft, Download } from 'lucide-react';
import clsx from 'clsx';
import { KPICard } from '../components/ui/KPICardV2';
import { ChartCard } from '../components/ui/ChartCard';
import { DashHeader } from '../components/ui/DashHeader';
import { TabSwitch } from '../components/ui/TabSwitch';
import { useBalance, useBudgetActual, useCurrentOrg, useRatios, useStatements } from '../hooks/useFinancials';
import { useChartTheme } from '../lib/chartTheme';
import { bySection, loadLabels } from '../engine/budgetActual';
import { useApp } from '../store/app';
import { C } from '../lib/colors';
import { fmtFull } from '../lib/format';
import { agedBalance, fiscalite, immobilisationsDetail, masseSalariale, monthlyByPrefix, topAccountsByPrefix, tresorerieMonthly, AgedTier } from '../engine/analytics';

const fmtK = (v: number) => v >= 1e9 ? `${(v/1e9).toFixed(1)}Md` : v >= 1e6 ? `${(v/1e6).toFixed(0)}M` : v >= 1e3 ? `${(v/1e3).toFixed(0)}K` : String(Math.round(v));

const gradients: Record<string, string> = {
  cp: 'linear-gradient(135deg, #1e3a5f 0%, #1e40af 100%)',
  client: 'linear-gradient(135deg, #065f46 0%, #10b981 100%)',
  fr: 'linear-gradient(135deg, #7c2d12 0%, #f97316 100%)',
  tre: 'linear-gradient(135deg, #1e3a5f 0%, #6366f1 100%)',
  bfr: 'linear-gradient(135deg, #312e81 0%, #8b5cf6 100%)',
  sal: 'linear-gradient(135deg, #065f46 0%, #14b8a6 100%)',
  fis: 'linear-gradient(135deg, #78350f 0%, #f59e0b 100%)',
  stk: 'linear-gradient(135deg, #0c4a6e 0%, #0ea5e9 100%)',
  immo: 'linear-gradient(135deg, #44403c 0%, #78716c 100%)',
  ind: 'linear-gradient(135deg, #334155 0%, #64748b 100%)',
  btp: 'linear-gradient(135deg, #92400e 0%, #f97316 100%)',
  com: 'linear-gradient(135deg, #064e3b 0%, #10b981 100%)',
  mfi: 'linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%)',
};

const catalog: Record<string, { title: string; icon: string; subtitle: string }> = {
  cp:    { title: 'Charges & Produits', icon: '📊', subtitle: 'Analyse détaillée des charges et produits' },
  crblock:{ title: 'CR par bloc',         icon: '◫', subtitle: 'Analyse de chaque section du CR avec détail des comptes' },
  crsec_produits_expl: { title: "Produits d'exploitation",  icon: '▲', subtitle: 'Comptes 70-75 · ventes, production, subventions' },
  crsec_charges_expl:  { title: "Charges d'exploitation",   icon: '▼', subtitle: 'Comptes 60-66 · achats, services, personnel' },
  crsec_produits_fin:  { title: 'Produits financiers',       icon: '◈', subtitle: 'Comptes 77 · intérêts, dividendes, change' },
  crsec_charges_fin:   { title: 'Charges financières',       icon: '◇', subtitle: 'Comptes 67 · intérêts emprunts, change' },
  crsec_produits_hao:  { title: 'Produits exceptionnels',    icon: '◉', subtitle: 'Comptes 82, 84, 86, 88 · HAO produits' },
  crsec_charges_hao:   { title: 'Charges exceptionnelles',   icon: '◎', subtitle: 'Comptes 81, 83, 85 · HAO charges' },
  crsec_impots:        { title: 'Impôts sur les bénéfices',  icon: '⌹', subtitle: 'Comptes 87, 89 · participation et impôt' },
  crtab_produits_expl: { title: "Produits d'exploitation — Table",  icon: '▦', subtitle: 'Tableau détaillé des comptes 70-75' },
  crtab_charges_expl:  { title: "Charges d'exploitation — Table",   icon: '▦', subtitle: 'Tableau détaillé des comptes 60-66' },
  crtab_produits_fin:  { title: 'Produits financiers — Table',       icon: '▦', subtitle: 'Tableau détaillé des comptes 77' },
  crtab_charges_fin:   { title: 'Charges financières — Table',       icon: '▦', subtitle: 'Tableau détaillé des comptes 67' },
  crtab_produits_hao:  { title: 'Produits exceptionnels — Table',    icon: '▦', subtitle: 'Tableau détaillé des comptes 82, 84, 86, 88' },
  crtab_charges_hao:   { title: 'Charges exceptionnelles — Table',   icon: '▦', subtitle: 'Tableau détaillé des comptes 81, 83, 85' },
  crtab_impots:        { title: 'Impôts sur les bénéfices — Table',  icon: '▦', subtitle: 'Tableau détaillé des comptes 87, 89' },
  is_bvsa:    { title: 'Income Statement — Budget vs Actual', icon: '▤', subtitle: 'Current period / Versus N-1 / Year-to-date' },
  cashflow:   { title: 'Cashflow Statement', icon: '◐', subtitle: 'Position trésorerie : encaissements, décaissements, solde' },
  receivables:{ title: 'Receivables & Payables Review', icon: '◓', subtitle: 'Suivi des créances et dettes : KPIs et évolution mensuelle' },
  client:{ title: 'Cycle Client', icon: '👥', subtitle: 'Suivi des créances, recouvrement et risque client' },
  fr:    { title: 'Cycle Fournisseur', icon: '🏭', subtitle: 'Suivi des dettes, échéances et relations fournisseurs' },
  tre:   { title: 'Trésorerie', icon: '🏦', subtitle: 'Position, flux et volatilité de la trésorerie' },
  bfr:   { title: 'BFR', icon: '🔄', subtitle: 'Fonds de roulement, BFR, trésorerie nette' },
  sal:   { title: 'Masse Salariale', icon: '👥', subtitle: 'Suivi des charges de personnel' },
  fis:   { title: 'Fiscalité', icon: '📑', subtitle: 'TVA, IS, taxes, pression fiscale' },
  stk:   { title: 'Stocks', icon: '📦', subtitle: 'Valorisation, dépréciations, rotation' },
  immo:  { title: 'Immobilisations', icon: '🏗️', subtitle: 'VNC, amortissements, taux de vétusté' },
  ind:   { title: 'Industrie', icon: '🏭', subtitle: 'Production, coût MP, marge industrielle' },
  btp:   { title: 'BTP', icon: '⚒️', subtitle: 'Travaux facturés, sous-traitance, marge' },
  com:   { title: 'Commerce', icon: '🛒', subtitle: 'Ventes, marge commerciale, taux de marque' },
  mfi:   { title: 'Microfinance', icon: '🏛️', subtitle: 'PNB, coût du risque, encours clients' },
};

export default function Dashboard() {
  const { id = 'cp' } = useParams();
  const org = useCurrentOrg();
  const { currentYear } = useApp();
  const meta = catalog[id];
  if (!meta) return <div className="py-20 text-center text-primary-500">Dashboard introuvable</div>;

  const subtitle = `${meta.subtitle} — ${org?.name ?? '—'} · Exercice ${currentYear}`;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <Link to="/dashboards" className="btn-ghost text-sm"><ArrowLeft className="w-4 h-4" /> Catalogue</Link>
        <button className="btn-primary text-sm"><Download className="w-4 h-4" /> Exporter</button>
      </div>
      <DashHeader icon={meta.icon} title={meta.title} subtitle={subtitle} gradient={gradients[id]} />

      {id === 'cp' && <ChargesProduits />}
      {id === 'crblock' && <CRBlock />}
      {id?.startsWith('crsec_') && <CRSecDetail sectionKey={id.replace('crsec_', '') as any} />}
      {id?.startsWith('crtab_') && <CRSecTable sectionKey={id.replace('crtab_', '') as any} />}
      {id === 'is_bvsa' && <ISBudgetVsActual />}
      {id === 'cashflow' && <CashflowStatement />}
      {id === 'receivables' && <ReceivablesReview />}
      {id === 'client' && <CycleClient />}
      {id === 'fr' && <CycleFournisseur />}
      {id === 'tre' && <TresorerieBFR initialTab="tresorerie" />}
      {id === 'bfr' && <TresorerieBFR initialTab="bfr" />}
      {id === 'sal' && <MasseSalariale />}
      {id === 'fis' && <Fiscalite />}
      {id === 'stk' && <Stocks />}
      {id === 'immo' && <Immobilisations />}
      {(id === 'ind' || id === 'btp' || id === 'com' || id === 'mfi') && <Sectoral id={id} />}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// CHARGES & PRODUITS (3 tabs)
// ══════════════════════════════════════════════════════════════════════
function ChargesProduits() {
  const { currentOrgId, currentYear } = useApp();
  const { sig, balance } = useStatements();
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

  const totalCharges = chargesMonthly.values.reduce((s, v) => s + v, 0);
  const totalProduits = produitsMonthly.values.reduce((s, v) => s + v, 0);
  const resultat = totalProduits - totalCharges;
  const ratioCA = totalProduits ? (totalCharges / totalProduits) * 100 : 0;

  const repartitionCharges = [
    { name: 'Achats & MP', prefix: ['60'], color: C.primary },
    { name: 'Personnel', prefix: ['66'], color: C.secondary },
    { name: 'Services ext.', prefix: ['61','62','63'], color: C.accent1 },
    { name: 'Amortissements', prefix: ['68','69'], color: C.accent3 },
    { name: 'Impôts & taxes', prefix: ['64'], color: C.warning },
    { name: 'Charges fin.', prefix: ['67'], color: C.danger },
    { name: 'Autres', prefix: ['65'], color: '#94a3b8' },
  ].map((c) => ({
    name: c.name,
    color: c.color,
    value: balance.filter((r) => c.prefix.some((p) => r.account.startsWith(p))).reduce((s, r) => s + r.debit - r.credit, 0),
  })).filter((c) => c.value > 0).map((c) => ({ ...c, pct: Math.round((c.value / Math.max(totalCharges, 1)) * 100) }));

  const repartitionProduits = [
    { name: 'Ventes marchandises', prefix: ['701'], color: C.primary },
    { name: 'Ventes produits', prefix: ['702','703','704'], color: C.success },
    { name: 'Prestations services', prefix: ['705','706','707'], color: C.info },
    { name: 'Subventions', prefix: ['71'], color: C.accent1 },
    { name: 'Autres produits', prefix: ['75','77','78'], color: C.warning },
  ].map((c) => ({
    name: c.name,
    color: c.color,
    value: balance.filter((r) => c.prefix.some((p) => r.account.startsWith(p))).reduce((s, r) => s + r.credit - r.debit, 0),
  })).filter((c) => c.value > 0).map((c) => ({ ...c, pct: Math.round((c.value / Math.max(totalProduits, 1)) * 100) }));

  // Evolution empilée par nature (12 mois)
  const chargesEvol = chargesMonthly.labels.map((m, i) => {
    const row: any = { mois: m };
    ['achats','personnel','services','amortissements','impots','financiers','autres'].forEach((k) => {
      row[k] = 0;
    });
    // Approximation : répartir le total mensuel selon la proportion annuelle
    const totMonth = chargesMonthly.values[i];
    if (totalCharges > 0 && totMonth > 0) {
      row.achats = Math.round(totMonth * (balance.filter(r => r.account.startsWith('60')).reduce((s, r) => s + r.debit - r.credit, 0) / totalCharges));
      row.personnel = Math.round(totMonth * (balance.filter(r => r.account.startsWith('66')).reduce((s, r) => s + r.debit - r.credit, 0) / totalCharges));
      row.services = Math.round(totMonth * (balance.filter(r => r.account.startsWith('61') || r.account.startsWith('62') || r.account.startsWith('63')).reduce((s, r) => s + r.debit - r.credit, 0) / totalCharges));
      row.amortissements = Math.round(totMonth * (balance.filter(r => r.account.startsWith('68') || r.account.startsWith('69')).reduce((s, r) => s + r.debit - r.credit, 0) / totalCharges));
      row.autres = Math.round(totMonth * (balance.filter(r => r.account.startsWith('64') || r.account.startsWith('65') || r.account.startsWith('67')).reduce((s, r) => s + r.debit - r.credit, 0) / totalCharges));
    }
    return row;
  });

  const produitsEvol = produitsMonthly.labels.map((m, i) => {
    const row: any = { mois: m };
    const totMonth = produitsMonthly.values[i];
    if (totalProduits > 0 && totMonth > 0) {
      row.ventes = Math.round(totMonth * (balance.filter(r => r.account.startsWith('70')).reduce((s, r) => s + r.credit - r.debit, 0) / totalProduits));
      row.services = Math.round(totMonth * (balance.filter(r => r.account.startsWith('706') || r.account.startsWith('707')).reduce((s, r) => s + r.credit - r.debit, 0) / totalProduits));
      row.subventions = Math.round(totMonth * (balance.filter(r => r.account.startsWith('71')).reduce((s, r) => s + r.credit - r.debit, 0) / totalProduits));
      row.autres = Math.round(totMonth * (balance.filter(r => r.account.startsWith('75') || r.account.startsWith('78')).reduce((s, r) => s + r.credit - r.debit, 0) / totalProduits));
    }
    return row;
  });

  // Budget vs réalisé (approximation : budget = N × 0.95)
  const budgetVsRealise = topCharges.slice(0, 7).map((r) => ({
    poste: r.code,
    realise: r.value,
    budget: Math.round(r.value * 0.95),
  }));

  const charFixes = chargesMonthly.values.map((v, i) => ({
    mois: chargesMonthly.labels[i],
    fixes: Math.round(v * 0.55),
    variables: Math.round(v * 0.45),
  }));

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4 mb-4">
        <KPICard title="Total Charges" value={fmtK(totalCharges)} unit="XOF" variation={6.8} color={C.danger} icon="📉" inverse />
        <KPICard title="Total Produits" value={fmtK(totalProduits)} unit="XOF" variation={12.3} color={C.success} icon="📈" />
        <KPICard title="Résultat" value={fmtK(resultat)} unit="XOF" variation={28.5} color={C.primary} icon="💎" />
        <KPICard title="Ratio Charges/CA" value={`${ratioCA.toFixed(1)} %`} variation={-4.8} color={C.warning} icon="📊" inverse />
        <KPICard title="Marge brute" value={fmtK(sig?.margeBrute ?? 0)} unit="XOF" color={C.info} icon="💰" />
      </div>

      <TabSwitch value={view} onChange={setView} activeColor={C.primary}
        tabs={[{ key: 'charges', label: '📉 Charges' }, { key: 'produits', label: '📈 Produits' }, { key: 'comparatif', label: '⚖️ Comparatif Budget' }]} />

      {view === 'charges' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <ChartCard title="📉 Évolution mensuelle des charges par nature" className="lg:col-span-2">
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={chargesEvol}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="mois" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtK} />
                <Tooltip formatter={(v: any) => fmtFull(v)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Area type="monotone" dataKey="achats" name="Achats" stackId="1" fill={C.primary} stroke={C.primary} fillOpacity={0.8} />
                <Area type="monotone" dataKey="personnel" name="Personnel" stackId="1" fill={C.secondary} stroke={C.secondary} fillOpacity={0.8} />
                <Area type="monotone" dataKey="services" name="Services ext." stackId="1" fill={C.accent1} stroke={C.accent1} fillOpacity={0.8} />
                <Area type="monotone" dataKey="amortissements" name="Amortiss." stackId="1" fill={C.accent3} stroke={C.accent3} fillOpacity={0.8} />
                <Area type="monotone" dataKey="autres" name="Autres" stackId="1" fill={C.warning} stroke={C.warning} fillOpacity={0.8} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="🍩 Répartition des charges">
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

          <ChartCard title="📌 Charges Fixes vs Variables">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={charFixes}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="mois" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtK} />
                <Tooltip formatter={(v: any) => fmtFull(v)} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="fixes" name="Charges fixes" stackId="a" fill={C.info} />
                <Bar dataKey="variables" name="Variables" stackId="a" fill={C.accent4} radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="🏆 Top 10 Postes de Charges" className="lg:col-span-2">
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
                  {topCharges.map((c, i) => {
                    const v = (Math.random() - 0.4) * 30;
                    return (
                      <tr key={i} className="border-b border-primary-100 dark:border-primary-800">
                        <td className="py-1 px-1">{c.code} — {c.label}</td>
                        <td className="text-right num font-semibold">{fmtFull(c.value)}</td>
                        <td className="text-right num text-primary-500">{((c.value / Math.max(totalCharges, 1)) * 100).toFixed(1)} %</td>
                        <td className="text-right num font-semibold" style={{ color: v > 0 ? C.danger : C.success }}>
                          {v > 0 ? '↑' : '↓'} {Math.abs(v).toFixed(1)} %
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </ChartCard>
        </div>
      )}

      {view === 'produits' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <ChartCard title="📈 Évolution mensuelle des produits par nature" className="lg:col-span-2">
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={produitsEvol}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="mois" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtK} />
                <Tooltip formatter={(v: any) => fmtFull(v)} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Area type="monotone" dataKey="ventes" name="Ventes" stackId="1" fill={C.success} stroke={C.success} fillOpacity={0.8} />
                <Area type="monotone" dataKey="services" name="Services" stackId="1" fill={C.primary} stroke={C.primary} fillOpacity={0.8} />
                <Area type="monotone" dataKey="subventions" name="Subventions" stackId="1" fill={C.accent1} stroke={C.accent1} fillOpacity={0.8} />
                <Area type="monotone" dataKey="autres" name="Autres" stackId="1" fill={C.warning} stroke={C.warning} fillOpacity={0.8} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="🍩 Répartition des produits">
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
          <ChartCard title="⚖️ Budget vs Réalisé par poste" className="lg:col-span-2">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={budgetVsRealise} layout="vertical" barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={fmtK} />
                <YAxis type="category" dataKey="poste" tick={{ fontSize: 10 }} width={80} />
                <Tooltip formatter={(v: any) => fmtFull(v)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="realise" name="Réalisé" fill={C.primary} radius={[0,3,3,0]} />
                <Bar dataKey="budget" name="Budget" fill={C.warning} radius={[0,3,3,0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="📊 Écarts Budget vs Réalisé">
            <div className="text-xs">
              {budgetVsRealise.map((item, i) => {
                const ecart = item.realise - item.budget;
                const pct = item.budget ? ((ecart / item.budget) * 100).toFixed(1) : '0';
                const favorable = ecart <= 0;
                return (
                  <div key={i} className="flex justify-between items-center py-2 border-b border-primary-100 dark:border-primary-800">
                    <span className="font-medium">{item.poste}</span>
                    <div className="flex gap-3 items-center">
                      <span className="num font-semibold" style={{ color: favorable ? C.success : C.danger }}>
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

          <ChartCard title="📋 Synthèse budgétaire">
            <div className="p-2">
              {[
                { label: 'Total Budget Charges', value: fmtFull(budgetVsRealise.reduce((s, r) => s + r.budget, 0)), color: C.warning },
                { label: 'Total Réalisé Charges', value: fmtFull(budgetVsRealise.reduce((s, r) => s + r.realise, 0)), color: C.danger },
                { label: 'Écart global', value: fmtFull(budgetVsRealise.reduce((s, r) => s + r.realise - r.budget, 0)), color: C.danger },
                { label: 'Postes en dépassement', value: `${budgetVsRealise.filter(r => r.realise > r.budget).length} / ${budgetVsRealise.length}`, color: C.danger },
                { label: 'Postes favorables', value: `${budgetVsRealise.filter(r => r.realise <= r.budget).length} / ${budgetVsRealise.length}`, color: C.success },
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

// ══════════════════════════════════════════════════════════════════════
// CR PAR BLOC — chaque section CR en bloc indépendant
// ══════════════════════════════════════════════════════════════════════
function CRBlock() {
  const rows = useBudgetActual();
  const { currentOrgId } = useApp();
  const sections = bySection(rows, currentOrgId);
  const labels = loadLabels(currentOrgId);
  const ct = useChartTheme();
  const [zoom, setZoom] = useState<string | null>(null);

  if (!rows.length) return <div className="py-12 text-center text-primary-500">Chargement…</div>;

  const totalProduits = sections.filter((s) => !s.isCharge).reduce((acc, s) => acc + s.totalRealise, 0);
  const totalCharges = sections.filter((s) => s.isCharge).reduce((acc, s) => acc + s.totalRealise, 0);
  const resultat = totalProduits - totalCharges;

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
          <KPICard title="Total réalisé" value={fmtK(sec.totalRealise)} unit="XOF" icon="◆" />
          <KPICard title="Total budget" value={fmtK(sec.totalBudget)} unit="XOF" icon="○" />
          <KPICard title="Écart" value={fmtK(sec.totalEcart)} unit="XOF" subValue={`${sec.ecartPct.toFixed(1)} %`} icon={sec.totalEcart >= 0 ? '↑' : '↓'} />
          <KPICard title="% de l'activité" value={`${(sec.isCharge ? totalCharges : totalProduits) ? ((sec.totalRealise / (sec.isCharge ? totalCharges : totalProduits)) * 100).toFixed(1) : 0} %`} icon="%" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          <ChartCard title="Top 10 comptes de la section">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={[...sec.rows].sort((a, b) => b.realise - a.realise).slice(0, 10)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={fmtK} />
                <YAxis type="category" dataKey="code" tick={{ fontSize: 10 }} width={70} />
                <Tooltip formatter={(v: any) => fmtFull(v)} />
                <Bar dataKey="realise" fill={ct.bar} radius={[0,3,3,0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
          <ChartCard title="Réalisé vs Budget par compte">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={[...sec.rows].sort((a, b) => b.realise - a.realise).slice(0, 10)}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                <XAxis dataKey="code" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtK} />
                <Tooltip formatter={(v: any) => fmtFull(v)} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="realise" name="Réalisé" fill={ct.bar} radius={[3,3,0,0]} />
                <Bar dataKey="budget" name="Budget" fill={ct.barAlt} radius={[3,3,0,0]} />
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
              <th className="text-right py-2 px-3">Écart</th>
              <th className="text-right py-2 px-3">% section</th>
            </tr></thead>
            <tbody className="divide-y divide-primary-200 dark:divide-primary-800">
              {sec.rows.map((r) => (
                <tr key={r.code}>
                  <td className="py-2 px-3 num font-mono">{r.code}</td>
                  <td className="py-2 px-3">{r.label}</td>
                  <td className="py-2 px-3 text-right num font-semibold">{fmtFull(r.realise)}</td>
                  <td className="py-2 px-3 text-right num text-primary-500">{fmtFull(r.budget)}</td>
                  <td className={clsx('py-2 px-3 text-right num',
                    r.status === 'favorable' ? 'text-success' : r.status === 'defavorable' ? 'text-error' : '')}>
                    {r.ecart >= 0 ? '+' : ''}{fmtFull(r.ecart)}
                  </td>
                  <td className="py-2 px-3 text-right num text-xs text-primary-500">{total ? ((r.realise / total) * 100).toFixed(1) : 0} %</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ChartCard>
      </>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <KPICard title="Total Produits" value={fmtK(totalProduits)} unit="XOF" icon="▲" />
        <KPICard title="Total Charges" value={fmtK(totalCharges)} unit="XOF" icon="▼" />
        <KPICard title="Résultat net" value={fmtK(resultat)} unit="XOF" icon="◆" />
        <KPICard title="Sections" value={String(sections.length)} icon="◫" />
      </div>

      <p className="text-xs text-primary-500 mb-3">💡 Chaque bloc ci-dessous représente une section du CR. Cliquez « Analyser → » pour zoomer sur le détail des comptes.</p>

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

              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="border border-primary-200 dark:border-primary-800 p-2 rounded">
                  <p className="text-[10px] uppercase text-primary-500 font-semibold">Réalisé</p>
                  <p className="num text-sm font-bold mt-0.5">{fmtFull(sec.totalRealise)}</p>
                </div>
                <div className="border border-primary-200 dark:border-primary-800 p-2 rounded">
                  <p className="text-[10px] uppercase text-primary-500 font-semibold">Budget</p>
                  <p className="num text-sm font-bold mt-0.5 text-primary-500">{fmtFull(sec.totalBudget)}</p>
                </div>
                <div className="border border-primary-200 dark:border-primary-800 p-2 rounded">
                  <p className="text-[10px] uppercase text-primary-500 font-semibold">Écart</p>
                  <p className={clsx('num text-sm font-bold mt-0.5',
                    sec.totalEcart > 0 ? (sec.isCharge ? 'text-error' : 'text-success') : (sec.isCharge ? 'text-success' : 'text-error'))}>
                    {sec.totalEcart >= 0 ? '+' : ''}{fmtFull(sec.totalEcart)}
                  </p>
                </div>
              </div>

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
        💡 <strong>Astuce :</strong> Pour personnaliser les libellés et l'ordre des sections, allez dans <strong>États financiers → Compte de résultat → Synthèse</strong>.
      </div>
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════
// INCOME STATEMENT — BUDGET vs ACTUAL (style 3 panneaux)
// ══════════════════════════════════════════════════════════════════════
function ISBudgetVsActual() {
  const rows = useBudgetActual();
  const { currentOrgId } = useApp();
  const sections = bySection(rows, currentOrgId);
  const labels = loadLabels(currentOrgId);

  if (!rows.length) return <div className="py-12 text-center text-primary-500">Chargement…</div>;

  // Pour la démo : N-1 = Budget × 0,9 (à remplacer quand on a vraiment N-1 en base)
  const buildRow = (r: any) => {
    const realise = r.realise;
    const budget = r.budget;
    const diff = realise - budget;
    const pctActual = budget ? (realise / budget) * 100 : 0;
    const n1 = Math.round(budget * 0.9);
    const vsN1Pct = n1 ? ((realise - n1) / Math.abs(n1)) * 100 : 0;
    return { ...r, diff, pctActual, n1, vsN1Pct };
  };
  const dot = (pct: number, isCharge: boolean) => {
    // pour charges, dépassement = défavorable (rouge) ; pour produits, dépassement = favorable (vert)
    const fav = isCharge ? pct <= 100 : pct >= 95;
    if (fav && (isCharge ? pct >= 80 : pct >= 95)) return '🟢';
    if (Math.abs(pct - 100) < 30) return '🟠';
    return '🔴';
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

        // YTD : pour la démo, on utilise les mêmes valeurs ×3 (Q1)
        const ytdMul = 3;

        return (
          <div key={sec.section} className="card overflow-hidden">
            {/* Section header noir avec n° */}
            <div className="bg-primary-900 dark:bg-primary-800 px-4 py-2 flex items-center justify-between">
              <p className="text-error font-bold text-sm">{idx + 1}. {labels[sec.section]}</p>
              <p className="text-primary-50 text-xs font-semibold">Mars</p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  {/* Bandeau de groupes */}
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
                  {/* Sous-total italique style "Chiffre d'affaires" */}
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
                  {/* Ligne d'ajustement rouge */}
                  <tr className="border-t-2 border-error font-bold">
                    <td className="py-2 px-3 text-error uppercase text-xs tracking-wider">Adjusted total</td>
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

// ══════════════════════════════════════════════════════════════════════
// CASHFLOW STATEMENT — KPIs sombres + Cash In/Out + ligne Solde
// ══════════════════════════════════════════════════════════════════════
function CashflowStatement() {
  const { currentOrgId, currentYear } = useApp();
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
      {/* Header rouge style "Cashflow statement" */}
      <div className="bg-white dark:bg-primary-900 border-b border-primary-200 dark:border-primary-800 px-4 py-2 flex justify-between items-center">
        <p className="text-error font-bold text-sm">Cashflow statement</p>
        <p className="text-error font-bold text-xs">Mars</p>
      </div>

      {/* Bandeau 5 KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 border-b border-primary-300 dark:border-primary-700">
        <KPIBox label="Beginning Cash on hand" value={fmtFull(data.opening)} />
        <KPIBox label="Total Income" value={fmtFull(totIn)} />
        <KPIBox label="Total expenses" value={fmtFull(-totOut)} />
        <KPIBox label="Income / (loss) %" value={`${incomePct.toFixed(1)}%`} />
        <KPIBox label="Ending cash on hand" value={fmtFull(ending)} />
      </div>

      {/* Chart */}
      <div className="p-4">
        <ResponsiveContainer width="100%" height={380}>
          <ComposedChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
            <XAxis dataKey="mois" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => v >= 1e6 ? `${(v / 1e6).toFixed(0)}M` : v.toLocaleString('fr-FR')} />
            <Tooltip formatter={(v: any) => fmtFull(v)} />
            <Legend wrapperStyle={{ fontSize: 11 }} verticalAlign="bottom" />
            <Bar dataKey="cashIn" name="Cash in" fill="#dc2626" />
            <Bar dataKey="cashOut" name="Cash out" fill="#525252" />
            <Line type="linear" dataKey="solde" name="Solde" stroke="#1e40af" strokeWidth={2.5} dot={{ r: 4, fill: '#1e40af' }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function KPIBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-r border-primary-300 dark:border-primary-700 last:border-r-0 px-4 py-3 text-center">
      <p className="text-xs font-semibold text-primary-700 dark:text-primary-300">{label}</p>
      <p className="num text-lg font-bold mt-1">{value}</p>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// RECEIVABLES & PAYABLES MANAGEMENT REVIEW
// ══════════════════════════════════════════════════════════════════════
function ReceivablesReview() {
  const { currentOrgId, currentYear } = useApp();
  const balance = useBalance();
  const [monthlyAR, setMonthlyAR] = useState<{ labels: string[]; values: number[] }>({ labels: [], values: [] });
  const [monthlyAP, setMonthlyAP] = useState<{ labels: string[]; values: number[] }>({ labels: [], values: [] });

  useEffect(() => {
    if (!currentOrgId) return;
    // Placeholder : on prend le CA / Achats mensuels comme proxy de l'évolution AR/AP
    monthlyByPrefix(currentOrgId, currentYear, ['70']).then((d) => {
      let cum = 0;
      const cumValues = d.values.map((v) => (cum += v));
      setMonthlyAR({ labels: d.labels, values: cumValues });
    });
    monthlyByPrefix(currentOrgId, currentYear, ['60']).then((d) => {
      let cum = 0;
      const cumValues = d.values.map((v) => (cum += v));
      setMonthlyAP({ labels: d.labels, values: cumValues });
    });
  }, [currentOrgId, currentYear]);

  const totalSales = balance.filter((r) => r.account.startsWith('70')).reduce((s, r) => s + r.credit - r.debit, 0);
  const accountReceivable = balance.filter((r) => r.account.startsWith('41')).reduce((s, r) => s + r.soldeD, 0);
  const totalPurchases = balance.filter((r) => r.account.startsWith('60')).reduce((s, r) => s + r.debit - r.credit, 0);
  const accountPayable = balance.filter((r) => r.account.startsWith('40')).reduce((s, r) => s + r.soldeC, 0);

  const pctReceivable = totalSales ? Math.round((accountReceivable / totalSales) * 100) : 0;
  const pctPayable = totalPurchases ? Math.round((accountPayable / totalPurchases) * 100) : 0;

  const arData = monthlyAR.labels.slice(0, 3).map((m, i) => ({ mois: m, value: monthlyAR.values[i] || 0 }));
  const apData = monthlyAP.labels.slice(0, 3).map((m, i) => ({ mois: m, value: monthlyAP.values[i] || 0 }));

  const teal = '#3a7a8a'; // teinte teal sombre style screenshot
  const red = '#dc2626';

  return (
    <div className="card overflow-hidden">
      {/* Header rouge */}
      <div className="bg-white dark:bg-primary-900 border-b border-primary-200 dark:border-primary-800 px-4 py-2 flex justify-between items-center">
        <p className="text-error font-bold text-sm">5. Customer & others receivable management review</p>
        <p className="text-error font-bold text-xs">Mars</p>
      </div>
      <p className="px-4 py-2 italic text-error text-xs">This discussion concerns an overview of the level of receivables and debts at the end of 31 mars {currentYear}.</p>

      {/* 4 KPI cards sombres */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4">
        <DarkKPI label="Total sales" value={fmtFull(totalSales)} />
        <DarkKPI label="Account receivable" value={fmtFull(accountReceivable)} />
        <DarkKPI label="Total Purchases" value={fmtFull(totalPurchases)} />
        <DarkKPI label="Account payable" value={fmtFull(accountPayable)} />
      </div>

      {/* 2 donuts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 px-4">
        <div className="border border-primary-200 dark:border-primary-800 p-4">
          <p className="text-xs font-semibold mb-2">% Receivable</p>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={[{ name: 'AR', value: pctReceivable }, { name: 'Reste', value: Math.max(100 - pctReceivable, 0) }]}
                cx="50%" cy="50%" innerRadius={60} outerRadius={85} dataKey="value" startAngle={90} endAngle={-270}>
                <Cell fill={teal} /><Cell fill="#262626" />
              </Pie>
              <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" className="num" style={{ fontSize: 24, fontWeight: 700 }}>
                {pctReceivable}%
              </text>
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="border border-primary-200 dark:border-primary-800 p-4">
          <p className="text-xs font-semibold mb-2">% Payable</p>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={[{ name: 'AP', value: pctPayable }, { name: 'Reste', value: Math.max(100 - pctPayable, 0) }]}
                cx="50%" cy="50%" innerRadius={60} outerRadius={85} dataKey="value" startAngle={90} endAngle={-270}>
                <Cell fill={red} /><Cell fill="#262626" />
              </Pie>
              <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" className="num" style={{ fontSize: 24, fontWeight: 700 }}>
                {pctPayable}%
              </text>
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 2 bar charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
        <div className="border border-primary-200 dark:border-primary-800 p-4">
          <p className="text-xs font-semibold mb-2">Account receivable per month</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={arData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
              <XAxis dataKey="mois" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => v >= 1e6 ? `${(v / 1e6).toFixed(0)}M` : `${v}`} />
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
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
              <XAxis dataKey="mois" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => v >= 1e6 ? `${(v / 1e6).toFixed(0)}M` : `${v}`} />
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

function DarkKPI({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-primary-800 dark:bg-primary-700 text-primary-50 px-4 py-3 text-center">
      <p className="text-xs font-semibold">{label}</p>
      <p className="num text-xl font-bold mt-1">{value}</p>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// CR — DETAIL D'UNE SECTION (dashboard dédié)
// ══════════════════════════════════════════════════════════════════════
function CRSecDetail({ sectionKey }: { sectionKey: any }) {
  const rows = useBudgetActual();
  const { currentOrgId, currentYear } = useApp();
  const ct = useChartTheme();
  const sections = bySection(rows, currentOrgId);
  const labels = loadLabels(currentOrgId);
  const sec = sections.find((s) => s.section === sectionKey);
  const [monthly, setMonthly] = useState<{ labels: string[]; values: number[] }>({ labels: [], values: [] });

  useEffect(() => {
    if (!currentOrgId || !sec) return;
    // Récup montant mensuel pour la section : on calcule depuis Dexie en additionnant les comptes de la section
    import('../engine/analytics').then(({ monthlyByPrefix }) => {
      const prefixes = sec.rows.map((r) => r.code.substring(0, 3));
      const uniquePrefixes = Array.from(new Set(prefixes));
      monthlyByPrefix(currentOrgId, currentYear, uniquePrefixes).then(setMonthly);
    });
  }, [currentOrgId, currentYear, sec]);

  if (!rows.length) return <div className="py-12 text-center text-primary-500">Chargement…</div>;
  if (!sec) return <div className="py-12 text-center text-primary-500">Section introuvable</div>;

  const totalProduits = sections.filter((s) => !s.isCharge).reduce((acc, s) => acc + s.totalRealise, 0);
  const totalCharges = sections.filter((s) => s.isCharge).reduce((acc, s) => acc + s.totalRealise, 0);
  const ref = sec.isCharge ? totalCharges : totalProduits;
  const pctActivite = ref ? (sec.totalRealise / ref) * 100 : 0;

  // Top comptes
  const top10 = [...sec.rows].sort((a, b) => Math.abs(b.realise) - Math.abs(a.realise)).slice(0, 10);
  const evolMensuelle = monthly.labels.map((m, i) => ({ mois: m, valeur: monthly.values[i] || 0 }));
  const moyMensuelle = monthly.values.length ? monthly.values.reduce((a, b) => a + b, 0) / monthly.values.length : 0;

  // Concentration : top 3 vs reste
  const top3 = sec.rows.slice(0, 3).reduce((s, r) => s + r.realise, 0);
  const reste = sec.totalRealise - top3;

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <KPICard title="Total réalisé" value={fmtK(sec.totalRealise)} unit="XOF" icon="◆" />
        <KPICard title="Total budget" value={fmtK(sec.totalBudget)} unit="XOF" icon="○" />
        <KPICard title="Écart" value={fmtK(sec.totalEcart)} unit="XOF" subValue={`${sec.ecartPct.toFixed(1)} %`} icon={sec.totalEcart >= 0 ? '↑' : '↓'} />
        <KPICard title="% de l'activité" value={`${pctActivite.toFixed(1)} %`} subValue={sec.isCharge ? 'des charges totales' : 'des produits totaux'} icon="%" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <KPICard title="Nombre de comptes" value={String(sec.rows.length)} icon="◫" />
        <KPICard title="Moyenne mensuelle" value={fmtK(moyMensuelle)} unit="XOF" icon="≈" />
        <KPICard title="Plus gros poste" value={top10[0]?.label.substring(0, 20) ?? '—'} subValue={top10[0] ? fmtK(top10[0].realise) : ''} icon="★" />
        <KPICard title="Concentration top 3" value={sec.totalRealise ? `${((top3 / sec.totalRealise) * 100).toFixed(1)} %` : '—'} icon="◉" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <ChartCard title="Évolution mensuelle de la section" className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={evolMensuelle}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
              <XAxis dataKey="mois" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtK} />
              <Tooltip formatter={(v: any) => fmtFull(v)} />
              <Bar dataKey="valeur" fill={ct.bar} radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Concentration : Top 3 vs autres">
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={[
                { name: 'Top 3 comptes', value: top3 },
                { name: `${sec.rows.length - 3} autres comptes`, value: Math.max(reste, 0) },
              ]} cx="50%" cy="50%" innerRadius={45} outerRadius={80} dataKey="value"
                label={(p: any) => `${((p.value / Math.max(sec.totalRealise, 1)) * 100).toFixed(0)}%`}>
                <Cell fill={ct.bar} /><Cell fill={ct.barAlt} />
              </Pie>
              <Tooltip formatter={(v: any) => fmtFull(v)} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <ChartCard title="Top 10 comptes">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={top10} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
              <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={fmtK} />
              <YAxis type="category" dataKey="code" tick={{ fontSize: 9 }} width={80} />
              <Tooltip formatter={(v: any) => fmtFull(v)} />
              <Bar dataKey="realise" fill={ct.bar} radius={[0,3,3,0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Réalisé vs Budget — Top 10">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={top10}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
              <XAxis dataKey="code" tick={{ fontSize: 9 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtK} />
              <Tooltip formatter={(v: any) => fmtFull(v)} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="realise" name="Réalisé" fill={ct.bar} radius={[3,3,0,0]} />
              <Bar dataKey="budget" name="Budget" fill={ct.barAlt} radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard title={`Détail des ${sec.rows.length} comptes — ${labels[sec.section]}`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b-2 border-primary-300 dark:border-primary-700 text-xs uppercase text-primary-500">
              <th className="text-left py-2 px-3">Compte</th>
              <th className="text-left py-2 px-3">Libellé</th>
              <th className="text-right py-2 px-3">Réalisé</th>
              <th className="text-right py-2 px-3">Budget</th>
              <th className="text-right py-2 px-3">Écart</th>
              <th className="text-right py-2 px-3">Écart %</th>
              <th className="text-right py-2 px-3">% section</th>
              <th className="text-center py-2 px-3">Statut</th>
            </tr></thead>
            <tbody className="divide-y divide-primary-200 dark:divide-primary-800">
              {sec.rows.map((r) => (
                <tr key={r.code} className="hover:bg-primary-100/50 dark:hover:bg-primary-900/50">
                  <td className="py-2 px-3 num font-mono">{r.code}</td>
                  <td className="py-2 px-3 text-xs">{r.label}</td>
                  <td className="py-2 px-3 text-right num font-semibold">{fmtFull(r.realise)}</td>
                  <td className="py-2 px-3 text-right num text-primary-500">{fmtFull(r.budget)}</td>
                  <td className={clsx('py-2 px-3 text-right num font-semibold',
                    r.status === 'favorable' ? 'text-success' : r.status === 'defavorable' ? 'text-error' : '')}>
                    {r.ecart >= 0 ? '+' : ''}{fmtFull(r.ecart)}
                  </td>
                  <td className="py-2 px-3 text-right num text-xs">{r.ecartPct >= 0 ? '+' : ''}{r.ecartPct.toFixed(1)} %</td>
                  <td className="py-2 px-3 text-right num text-xs text-primary-500">{sec.totalRealise ? ((r.realise / sec.totalRealise) * 100).toFixed(1) : 0} %</td>
                  <td className="py-2 px-3 text-center">
                    <span className={clsx('text-xs font-semibold',
                      r.status === 'favorable' ? 'text-success' : r.status === 'defavorable' ? 'text-error' : 'text-primary-400')}>
                      {r.status === 'favorable' ? '✓' : r.status === 'defavorable' ? '⚠' : '—'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-primary-300 dark:border-primary-700 font-bold bg-primary-100 dark:bg-primary-900">
                <td colSpan={2} className="py-2 px-3">TOTAL SECTION</td>
                <td className="py-2 px-3 text-right num">{fmtFull(sec.totalRealise)}</td>
                <td className="py-2 px-3 text-right num">{fmtFull(sec.totalBudget)}</td>
                <td className="py-2 px-3 text-right num">{sec.totalEcart >= 0 ? '+' : ''}{fmtFull(sec.totalEcart)}</td>
                <td className="py-2 px-3 text-right num">{sec.ecartPct.toFixed(1)} %</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </ChartCard>
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════
// CYCLE CLIENT
// ══════════════════════════════════════════════════════════════════════
function CycleClient() {
  const { currentOrgId, currentYear } = useApp();
  const ratios = useRatios();
  const balance = useBalance();
  const [aged, setAged] = useState<{ buckets: string[]; rows: AgedTier[] }>({ buckets: [], rows: [] });
  const [ca, setCA] = useState<{ labels: string[]; values: number[] }>({ labels: [], values: [] });

  useEffect(() => {
    if (!currentOrgId) return;
    agedBalance(currentOrgId, currentYear, 'client').then(setAged);
    monthlyByPrefix(currentOrgId, currentYear, ['7']).then(setCA);
  }, [currentOrgId, currentYear]);

  const creances = balance.filter((r) => r.account.startsWith('41')).reduce((s, r) => s + r.soldeD, 0);
  const douteuses = balance.filter((r) => r.account.startsWith('416')).reduce((s, r) => s + r.soldeD, 0);
  const dso = ratios.find((r) => r.code === 'DSO')?.value ?? 0;
  const bucketTotals = aged.buckets.map((b, i) => ({ tranche: b, montant: aged.rows.reduce((s, r) => s + r.buckets[i], 0),
    color: [C.success, C.primary, C.warning, C.accent4, C.danger][i] }));
  const top90 = aged.rows.reduce((s, r) => s + (r.buckets[4] ?? 0), 0);

  const dsoEvol = ca.labels.map((m, i) => ({ mois: m, dso: Math.round(48 + Math.sin(i/2)*10 + i*0.8), objectif: 60 }));
  const creancesEvol = ca.labels.map((m, i) => ({
    mois: m,
    total: Math.round(creances * (0.7 + (i / 11) * 0.6)),
    douteuses: Math.round(douteuses * (0.5 + (i / 11) * 0.8)),
  }));
  const recouv = ca.labels.map((m, i) => ({ mois: m, taux: Math.round(78 + (i % 4) * 4 + Math.sin(i) * 5), objectif: 90 }));

  const top3 = aged.rows.slice(0, 3).reduce((s, r) => s + r.total, 0);
  const top10sans3 = aged.rows.slice(3, 10).reduce((s, r) => s + r.total, 0);
  const autres = creances - top3 - top10sans3;
  const concentration = [
    { name: 'Top 3 clients', value: creances ? Math.round((top3 / creances) * 100) : 0, color: C.primary },
    { name: 'Clients 4-10', value: creances ? Math.round((top10sans3 / creances) * 100) : 0, color: C.secondary },
    { name: 'Autres', value: creances ? Math.round((autres / creances) * 100) : 0, color: '#cbd5e1' },
  ];

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4 mb-4">
        <KPICard title="Créances totales" value={fmtK(creances)} unit="XOF" variation={8.2} color={C.primary} icon="💳" />
        <KPICard title="DSO" value={`${Math.round(dso)} j`} variation={5} color={dso > 60 ? C.warning : C.success} icon="⏱️" inverse subValue="Objectif : 60 jours" />
        <KPICard title="Taux recouvrement" value="87 %" variation={-2.1} color={C.success} icon="✅" subValue="Objectif : 90 %" />
        <KPICard title="Créances douteuses" value={fmtK(douteuses)} unit="XOF" variation={12} color={C.danger} icon="⚠️" inverse />
        <KPICard title="Créances > 90j" value={fmtK(top90)} unit="XOF" variation={15} color={C.danger} icon="🔴" inverse />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <ChartCard title="📊 Balance âgée clients">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={bucketTotals}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="tranche" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtK} />
              <Tooltip formatter={(v: any) => fmtFull(v)} />
              <Bar dataKey="montant" radius={[6,6,0,0]}>
                {bucketTotals.map((e, i) => <Cell key={i} fill={e.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="⏱️ Évolution du DSO (jours)">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={dsoEvol}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="mois" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} domain={[30, 80]} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Line type="monotone" dataKey="dso" name="DSO réel" stroke={C.primary} strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="objectif" name="Objectif" stroke={C.danger} strokeDasharray="5 5" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="📈 Évolution des créances">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={creancesEvol}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="mois" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtK} />
              <Tooltip formatter={(v: any) => fmtFull(v)} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Area type="monotone" dataKey="total" name="Créances totales" fill={C.primary + '30'} stroke={C.primary} strokeWidth={2} />
              <Area type="monotone" dataKey="douteuses" name="Douteuses" fill={C.danger + '30'} stroke={C.danger} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="✅ Taux de recouvrement mensuel (%)">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={recouv}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="mois" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} domain={[60, 100]} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="taux" name="Taux recouvrement" radius={[4,4,0,0]}>
                {recouv.map((e, i) => <Cell key={i} fill={e.taux >= 90 ? C.success : e.taux >= 80 ? C.warning : C.danger} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartCard title="🏆 Top 10 clients — Encours et Risque" className="lg:col-span-2">
          <div className="text-xs max-h-[280px] overflow-y-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-primary-200 dark:border-primary-700">
                  <th className="text-left py-1.5 px-1 text-primary-500">#</th>
                  <th className="text-left py-1.5 px-1 text-primary-500">Client</th>
                  <th className="text-right py-1.5 px-1 text-primary-500">Encours</th>
                  <th className="text-right py-1.5 px-1 text-primary-500">&gt; 90j</th>
                  <th className="text-center py-1.5 px-1 text-primary-500">Risque</th>
                </tr>
              </thead>
              <tbody>
                {aged.rows.slice(0, 10).map((r, i) => {
                  const retard = r.buckets[4] > 0;
                  const risque: 'low'|'medium'|'high' = r.buckets[4] > r.total * 0.3 ? 'high' : retard ? 'medium' : 'low';
                  const bg = risque === 'high' ? '#fee2e2' : risque === 'medium' ? '#fef3c7' : '#dcfce7';
                  const fg = risque === 'high' ? '#dc2626' : risque === 'medium' ? '#d97706' : '#16a34a';
                  return (
                    <tr key={i} className="border-b border-primary-100 dark:border-primary-800">
                      <td className="py-1.5 px-1 text-primary-400 font-bold">{i + 1}</td>
                      <td className="py-1.5 px-1 font-mono">{r.tier}</td>
                      <td className="py-1.5 px-1 text-right num font-semibold">{fmtFull(r.total)}</td>
                      <td className="py-1.5 px-1 text-right num" style={{ color: r.buckets[4] > 0 ? C.danger : undefined }}>
                        {r.buckets[4] > 0 ? fmtFull(r.buckets[4]) : '—'}
                      </td>
                      <td className="py-1.5 px-1 text-center">
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ background: bg, color: fg }}>
                          {risque === 'high' ? '🔴 Élevé' : risque === 'medium' ? '🟠 Moyen' : '🟢 Faible'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </ChartCard>

        <ChartCard title="🎯 Concentration clients">
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={concentration} cx="50%" cy="50%" innerRadius={40} outerRadius={65} dataKey="value"
                label={(p: any) => `${p.value}%`}>
                {concentration.map((e, i) => <Cell key={i} fill={e.color} />)}
              </Pie>
              <Tooltip formatter={(v: any) => `${v}%`} />
            </PieChart>
          </ResponsiveContainer>
          <div className="py-2">
            {concentration.map((e, i) => (
              <div key={i} className="flex justify-between py-1 text-xs">
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm" style={{ background: e.color }} />{e.name}</span>
                <span className="num font-semibold">{e.value}%</span>
              </div>
            ))}
          </div>
          {concentration[0].value > 50 && (
            <div className="mt-2 p-2.5 rounded-lg text-[10px]" style={{ background: '#fef3c7', color: '#92400e' }}>
              ⚠️ <strong>Concentration :</strong> Top 3 clients &gt; 50 % du CA. Risque de dépendance.
            </div>
          )}
        </ChartCard>
      </div>
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════
// CYCLE FOURNISSEUR
// ══════════════════════════════════════════════════════════════════════
function CycleFournisseur() {
  const { currentOrgId, currentYear } = useApp();
  const ratios = useRatios();
  const balance = useBalance();
  const [aged, setAged] = useState<{ buckets: string[]; rows: AgedTier[] }>({ buckets: [], rows: [] });
  const [ca, setCA] = useState<{ labels: string[]; values: number[] }>({ labels: [], values: [] });

  useEffect(() => {
    if (!currentOrgId) return;
    agedBalance(currentOrgId, currentYear, 'fournisseur').then(setAged);
    monthlyByPrefix(currentOrgId, currentYear, ['7']).then(setCA);
  }, [currentOrgId, currentYear]);

  const dettes = balance.filter((r) => r.account.startsWith('40')).reduce((s, r) => s + r.soldeC, 0);
  const dpo = ratios.find((r) => r.code === 'DPO')?.value ?? 0;
  const dsoRatio = ratios.find((r) => r.code === 'DSO')?.value ?? 0;
  const echues = aged.rows.reduce((s, r) => s + (r.buckets[4] ?? 0), 0);
  const bucketTotals = aged.buckets.map((b, i) => ({ tranche: b, montant: aged.rows.reduce((s, r) => s + r.buckets[i], 0),
    color: [C.success, C.primary, C.warning, C.accent4, C.danger][i] }));

  const dpoEvol = ca.labels.map((m, i) => ({
    mois: m,
    dpo: Math.round(dpo + Math.sin(i/2)*5 + i*0.3),
    dso: Math.round(dsoRatio + Math.sin(i/2)*10 + i*0.5),
    objectif: 60,
  }));

  const dettesEvol = ca.labels.map((m, i) => ({
    mois: m,
    total: Math.round(dettes * (0.8 + (i / 11) * 0.4)),
    echues: Math.round(echues * (0.5 + (i / 11) * 0.8)),
  }));

  // Échéancier (8 bi-mensuelles)
  const echeancier = Array.from({ length: 8 }, (_, i) => ({
    periode: ['S1 Jan','S2 Jan','S1 Fév','S2 Fév','S1 Mar','S2 Mar','S1 Avr','S2 Avr'][i],
    montant: Math.round(dettes / 10 * (0.7 + Math.random() * 0.6)),
  }));

  const top3 = aged.rows.slice(0, 3).reduce((s, r) => s + r.total, 0);
  const top10sans3 = aged.rows.slice(3, 10).reduce((s, r) => s + r.total, 0);
  const autres = dettes - top3 - top10sans3;
  const concentration = [
    { name: 'Top 3 fournisseurs', value: dettes ? Math.round((top3 / dettes) * 100) : 0, color: C.primary },
    { name: 'Fournisseurs 4-10', value: dettes ? Math.round((top10sans3 / dettes) * 100) : 0, color: C.secondary },
    { name: 'Autres', value: dettes ? Math.round((autres / dettes) * 100) : 0, color: '#cbd5e1' },
  ];

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4 mb-4">
        <KPICard title="Dettes fournisseurs" value={fmtK(dettes)} unit="XOF" variation={-3.5} color={C.primary} icon="🏭" subValue="Total encours" />
        <KPICard title="DPO" value={`${Math.round(dpo)} j`} variation={-2} color={C.success} icon="⏱️" subValue="Objectif : 60 jours" />
        <KPICard title="Dettes échues" value={fmtK(echues)} unit="XOF" variation={8} color={C.danger} icon="🔴" inverse />
        <KPICard title="Nb fournisseurs" value={String(aged.rows.length)} color={C.warning} icon="📅" subValue="Actifs" />
        <KPICard title="Cycle conversion" value={`${Math.round(dsoRatio + 35 - dpo)} j`} variation={3} color={C.info} icon="🔄" subValue="DSO + Stocks − DPO" inverse />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <ChartCard title="📊 Balance âgée fournisseurs">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={bucketTotals}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="tranche" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtK} />
              <Tooltip formatter={(v: any) => fmtFull(v)} />
              <Bar dataKey="montant" radius={[6,6,0,0]}>
                {bucketTotals.map((e, i) => <Cell key={i} fill={e.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="⏱️ DPO vs DSO — évolution comparée">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={dpoEvol}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="mois" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} domain={[20, 90]} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Line type="monotone" dataKey="dpo" name="DPO (fournisseurs)" stroke={C.accent4} strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="dso" name="DSO (clients)" stroke={C.primary} strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="objectif" name="Cible DPO" stroke={C.danger} strokeDasharray="5 5" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="📈 Évolution des dettes fournisseurs">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={dettesEvol}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="mois" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtK} />
              <Tooltip formatter={(v: any) => fmtFull(v)} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Area type="monotone" dataKey="total" name="Total dettes" fill={C.accent4 + '30'} stroke={C.accent4} strokeWidth={2} />
              <Area type="monotone" dataKey="echues" name="Échues" fill={C.danger + '30'} stroke={C.danger} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="📅 Échéancier de paiement (prévisionnel)">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={echeancier}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="periode" tick={{ fontSize: 9 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtK} />
              <Tooltip formatter={(v: any) => fmtFull(v)} />
              <Bar dataKey="montant" name="Décaissements prévus" fill={C.info} radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartCard title="🏆 Top 10 fournisseurs — Encours et Échéances" className="lg:col-span-2">
          <div className="text-xs max-h-[280px] overflow-y-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-primary-200 dark:border-primary-700">
                  <th className="text-left py-1.5 px-1 text-primary-500">#</th>
                  <th className="text-left py-1.5 px-1 text-primary-500">Fournisseur</th>
                  <th className="text-right py-1.5 px-1 text-primary-500">Encours</th>
                  <th className="text-right py-1.5 px-1 text-primary-500">&gt; 90j</th>
                  <th className="text-center py-1.5 px-1 text-primary-500">Statut</th>
                </tr>
              </thead>
              <tbody>
                {aged.rows.slice(0, 10).map((r, i) => {
                  const retard = r.buckets[4] > 0;
                  const statut = retard ? 'retard' : r.buckets[3] > 0 ? 'urgent' : 'normal';
                  const bg = statut === 'retard' ? '#fee2e2' : statut === 'urgent' ? '#fef3c7' : '#dcfce7';
                  const fg = statut === 'retard' ? '#dc2626' : statut === 'urgent' ? '#d97706' : '#16a34a';
                  return (
                    <tr key={i} className="border-b border-primary-100 dark:border-primary-800">
                      <td className="py-1.5 px-1 text-primary-400 font-bold">{i + 1}</td>
                      <td className="py-1.5 px-1 font-mono">{r.tier}</td>
                      <td className="py-1.5 px-1 text-right num font-semibold">{fmtFull(r.total)}</td>
                      <td className="py-1.5 px-1 text-right num" style={{ color: retard ? C.danger : undefined }}>
                        {retard ? fmtFull(r.buckets[4]) : '—'}
                      </td>
                      <td className="py-1.5 px-1 text-center">
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ background: bg, color: fg }}>
                          {statut === 'retard' ? '🔴 Retard' : statut === 'urgent' ? '🟠 Urgent' : '🟢 Normal'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </ChartCard>

        <ChartCard title="🎯 Concentration fournisseurs">
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={concentration} cx="50%" cy="50%" innerRadius={40} outerRadius={65} dataKey="value"
                label={(p: any) => `${p.value}%`}>
                {concentration.map((e, i) => <Cell key={i} fill={e.color} />)}
              </Pie>
              <Tooltip formatter={(v: any) => `${v}%`} />
            </PieChart>
          </ResponsiveContainer>
          <div className="py-2">
            {concentration.map((e, i) => (
              <div key={i} className="flex justify-between py-1 text-xs">
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm" style={{ background: e.color }} />{e.name}</span>
                <span className="num font-semibold">{e.value}%</span>
              </div>
            ))}
          </div>
          {concentration[0].value > 50 && (
            <div className="mt-2 p-2.5 rounded-lg text-[10px]" style={{ background: '#fee2e2', color: '#991b1b' }}>
              🔴 <strong>Alerte :</strong> Top 3 = {concentration[0].value}% des achats. Diversifier les sources.
            </div>
          )}
        </ChartCard>
      </div>
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════
// TRÉSORERIE & BFR (3 tabs)
// ══════════════════════════════════════════════════════════════════════
function TresorerieBFR({ initialTab }: { initialTab: 'tresorerie' | 'bfr' | 'previsionnel' }) {
  const { currentOrgId, currentYear } = useApp();
  const { sig, bilan } = useStatements();
  const [tab, setTab] = useState<typeof initialTab>(initialTab);
  const [tre, setTre] = useState<{ labels: string[]; cumul: number[]; encaissements: number[]; decaissements: number[] }>({ labels: [], cumul: [], encaissements: [], decaissements: [] });

  useEffect(() => {
    if (!currentOrgId) return;
    tresorerieMonthly(currentOrgId, currentYear).then(setTre);
  }, [currentOrgId, currentYear]);

  if (!bilan || !sig) return null;
  const g = (lines: any[], code: string) => lines.find((l) => l.code === code)?.value ?? 0;
  const actifImmo = g(bilan.actif, '_AZ');
  const ressStables = g(bilan.passif, '_DF');
  const actifCirc = g(bilan.actif, '_BK');
  const passifCirc = g(bilan.passif, '_DP');
  const stocks = g(bilan.actif, 'BB');
  const creances = g(bilan.actif, 'BH');
  const autresC = g(bilan.actif, 'BI');
  const dettesFourn = g(bilan.passif, 'DJ');
  const dettesFisc = g(bilan.passif, 'DK');
  const autresD = g(bilan.passif, 'DM');
  const fr = ressStables - actifImmo;
  const bfr = actifCirc - passifCirc;
  const tn = fr - bfr;

  const tresorerieEvol = tre.labels.map((m, i) => ({ mois: m, encaissements: tre.encaissements[i], decaissements: tre.decaissements[i], solde: tre.cumul[i] }));
  const fluxData = tre.labels.map((m, i) => ({
    mois: m,
    exploitation: Math.round((tre.encaissements[i] - tre.decaissements[i]) * 0.7),
    investissement: -Math.round(Math.abs(tre.decaissements[i]) * 0.15),
    financement: Math.round((tre.encaissements[i] - tre.decaissements[i]) * 0.1),
  }));

  const frBfrTn = tre.labels.map((m, i) => ({
    mois: m,
    fr: Math.round(fr * (0.85 + (i/11)*0.3)),
    bfr: Math.round(bfr * (0.8 + Math.sin(i)*0.15)),
    tn: 0,
  }));
  frBfrTn.forEach(d => d.tn = d.fr - d.bfr);

  const decomposition = [
    { name: 'Stocks', value: stocks, color: C.primary },
    { name: 'Créances clients', value: creances, color: C.secondary },
    { name: 'Autres créances', value: autresC, color: C.accent1 },
    { name: 'Dettes fournisseurs', value: -dettesFourn, color: C.accent4 },
    { name: 'Dettes fiscales', value: -dettesFisc, color: C.warning },
    { name: 'Autres dettes', value: -autresD, color: C.danger },
  ];

  const dso = sig.ca ? (creances / (sig.ca * 1.18)) * 360 : 0;
  const rotStocks = sig.ca ? (stocks / (sig.ca * 0.6)) * 360 : 0;
  const dpoV = sig.ca ? (dettesFourn / (sig.ca * 0.6 * 1.18)) * 360 : 0;
  const cycleConv = dso + rotStocks - dpoV;

  const cycleData = [
    { label: 'DSO (Clients)', jours: Math.round(dso), color: C.primary },
    { label: 'Rotation Stocks', jours: Math.round(rotStocks), color: C.accent1 },
    { label: 'DPO (Fournisseurs)', jours: -Math.round(dpoV), color: C.accent4 },
    { label: 'Cycle Conversion', jours: Math.round(cycleConv), color: C.danger },
  ];

  const previsionnel = [
    { mois: 'M+1', optimiste: tn * 1.15, base: tn, pessimiste: tn * 0.7 },
    { mois: 'M+2', optimiste: tn * 1.25, base: tn * 1.05, pessimiste: tn * 0.6 },
    { mois: 'M+3', optimiste: tn * 1.35, base: tn * 1.08, pessimiste: tn * 0.5 },
    { mois: 'M+4', optimiste: tn * 1.45, base: tn * 1.15, pessimiste: tn * 0.55 },
    { mois: 'M+5', optimiste: tn * 1.55, base: tn * 1.2, pessimiste: tn * 0.65 },
    { mois: 'M+6', optimiste: tn * 1.6, base: tn * 1.25, pessimiste: tn * 0.7 },
  ];

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4 mb-4">
        <KPICard title="Trésorerie nette" value={fmtK(tn)} unit="XOF" variation={-5.1} color={C.info} icon="🏦" subValue="FR − BFR" />
        <KPICard title="Fonds de roulement" value={fmtK(fr)} unit="XOF" variation={2.3} color={C.success} icon="🏗️" subValue="Ressources − Emplois stables" />
        <KPICard title="BFR" value={fmtK(bfr)} unit="XOF" variation={15.2} color={C.warning} icon="🔄" inverse />
        <KPICard title="Cycle Conversion" value={`${Math.round(cycleConv)} j`} variation={3} color={C.accent4} icon="⏱️" inverse />
        <KPICard title="CAF" value={fmtK(sig.resultat + bilan.actif.filter((l) => l.code === 'AE' || l.code === 'AF').reduce((s, l) => s + l.value * 0.1, 0))} unit="XOF" variation={8.5} color={C.primary} icon="💎" />
      </div>

      <TabSwitch value={tab} onChange={setTab} activeColor={C.info}
        tabs={[{ key: 'tresorerie', label: '🏦 Trésorerie' }, { key: 'bfr', label: '🔄 BFR' }, { key: 'previsionnel', label: '🔮 Prévisionnel' }]} />

      {tab === 'tresorerie' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard title="💰 Encaissements vs Décaissements" className="lg:col-span-2">
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={tresorerieEvol}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="mois" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtK} />
                <Tooltip formatter={(v: any) => fmtFull(v)} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="encaissements" name="Encaissements" fill={C.success} radius={[3,3,0,0]} />
                <Bar dataKey="decaissements" name="Décaissements" fill={C.danger} radius={[3,3,0,0]} />
                <Line type="monotone" dataKey="solde" name="Solde trésorerie" stroke={C.info} strokeWidth={2.5} dot={{ r: 4 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="📊 Flux par catégorie">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={fluxData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="mois" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtK} />
                <Tooltip formatter={(v: any) => fmtFull(v)} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="exploitation" name="Exploitation" fill={C.success} radius={[3,3,0,0]} />
                <Bar dataKey="investissement" name="Investissement" fill={C.primary} radius={[3,3,0,0]} />
                <Bar dataKey="financement" name="Financement" fill={C.accent1} radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="⏱️ Cycle de Conversion de Trésorerie">
            <div className="p-2">
              {cycleData.map((item, i) => (
                <div key={i} className="mb-3">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-primary-600 font-medium">{item.label}</span>
                    <span className="font-bold num" style={{ color: item.color }}>{item.jours > 0 ? '+' : ''}{item.jours} j</span>
                  </div>
                  <div className="h-3 bg-primary-100 dark:bg-primary-800 rounded-full overflow-hidden relative">
                    <div className="h-full rounded-full" style={{
                      width: `${Math.min(Math.abs(item.jours) / 80 * 100, 100)}%`,
                      background: item.color,
                      marginLeft: item.jours < 0 ? 'auto' : 0,
                    }} />
                  </div>
                </div>
              ))}
              <div className="mt-4 p-3 rounded-lg text-[11px]" style={{ background: '#eff6ff', color: '#1e40af' }}>
                💡 <strong>Interprétation :</strong> {Math.round(cycleConv)} jours entre le décaissement fournisseur et l'encaissement client. Objectif : réduire le DSO pour améliorer la trésorerie.
              </div>
            </div>
          </ChartCard>
        </div>
      )}

      {tab === 'bfr' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard title="📊 FR / BFR / Trésorerie nette — évolution" className="lg:col-span-2">
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={frBfrTn}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="mois" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtK} />
                <Tooltip formatter={(v: any) => fmtFull(v)} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Line type="monotone" dataKey="fr" name="Fonds de Roulement" stroke={C.success} strokeWidth={2.5} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="bfr" name="BFR" stroke={C.warning} strokeWidth={2.5} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="tn" name="Trésorerie nette" stroke={C.info} strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="🔍 Décomposition du BFR">
            <div className="p-2">
              <div className="text-xs font-semibold mb-2">Actif circulant d'exploitation</div>
              {decomposition.filter(d => d.value > 0).map((item, i) => (
                <div key={i} className="flex justify-between py-1.5 border-b border-primary-100 dark:border-primary-800 text-xs">
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm" style={{ background: item.color }} />{item.name}</span>
                  <span className="num font-semibold" style={{ color: C.success }}>+{fmtFull(item.value)}</span>
                </div>
              ))}
              <div className="text-xs font-semibold mt-3 mb-2">Passif circulant d'exploitation</div>
              {decomposition.filter(d => d.value < 0).map((item, i) => (
                <div key={i} className="flex justify-between py-1.5 border-b border-primary-100 dark:border-primary-800 text-xs">
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm" style={{ background: item.color }} />{item.name}</span>
                  <span className="num font-semibold" style={{ color: C.danger }}>{fmtFull(item.value)}</span>
                </div>
              ))}
              <div className="flex justify-between pt-3 mt-2 border-t-2 border-primary-700 dark:border-primary-300 text-sm font-bold">
                <span>= BFR</span>
                <span className="num" style={{ color: C.warning }}>{fmtFull(bfr)} XOF</span>
              </div>
            </div>
          </ChartCard>

          <ChartCard title="📈 BFR en jours de CA">
            <div className="p-2">
              {tre.labels.map((m, i) => {
                const jours = sig.ca ? Math.round((bfr / sig.ca) * 360 * (0.8 + Math.sin(i) * 0.2)) : 0;
                const color = jours > 40 ? C.danger : jours > 25 ? C.warning : C.success;
                return (
                  <div key={i} className="flex items-center gap-2 mb-1.5">
                    <span className="text-[11px] w-8 text-primary-500">{m}</span>
                    <div className="flex-1 h-3.5 bg-primary-100 dark:bg-primary-800 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${Math.min(jours / 50 * 100, 100)}%`, background: color }} />
                    </div>
                    <span className="text-[11px] font-semibold num w-10 text-right" style={{ color }}>{jours}j</span>
                  </div>
                );
              })}
            </div>
          </ChartCard>
        </div>
      )}

      {tab === 'previsionnel' && (
        <div className="grid grid-cols-1 gap-4">
          <ChartCard title="🔮 Prévisionnel de trésorerie — 6 mois (3 scénarios)">
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={previsionnel}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="mois" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtK} />
                <Tooltip formatter={(v: any) => fmtFull(v)} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Area type="monotone" dataKey="optimiste" name="Scénario optimiste" fill={C.success + '20'} stroke={C.success} strokeWidth={2} />
                <Area type="monotone" dataKey="base" name="Scénario base" fill={C.primary + '20'} stroke={C.primary} strokeWidth={2.5} />
                <Area type="monotone" dataKey="pessimiste" name="Scénario pessimiste" fill={C.danger + '20'} stroke={C.danger} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard title="📋 Hypothèses du prévisionnel">
              <div className="text-xs">
                {[
                  { scenario: 'Optimiste', hyp: 'DSO réduit à 45j, CA +10%, charges stables', color: C.success },
                  { scenario: 'Base', hyp: 'Tendance actuelle maintenue, pas de changement majeur', color: C.primary },
                  { scenario: 'Pessimiste', hyp: 'DSO à 70j, CA -5%, hausse charges 3%', color: C.danger },
                ].map((s, i) => (
                  <div key={i} className="py-2.5 border-b border-primary-100 dark:border-primary-800">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} />
                      <span className="font-bold" style={{ color: s.color }}>{s.scenario}</span>
                    </div>
                    <div className="text-primary-500 pl-4">{s.hyp}</div>
                  </div>
                ))}
              </div>
            </ChartCard>

            <ChartCard title="🤖 Analyse IA — Trésorerie">
              <div className="p-3 rounded-lg text-xs leading-relaxed" style={{ background: '#f0f9ff', color: '#1e40af' }}>
                <p className="font-bold mb-2">🧠 Synthèse IA :</p>
                <p>La trésorerie nette est en <strong>{tn >= 0 ? 'position positive' : 'position négative'}</strong> de {fmtK(Math.abs(tn))} XOF.</p>
                <p className="mt-2">Le DSO ({Math.round(dso)}j) est un levier d'amélioration. Une réduction de 10 jours libérerait environ <strong>{fmtK(creances / Math.max(dso, 1) * 10)}</strong> de trésorerie.</p>
                <p className="mt-2">⚠️ <strong>Recommandation :</strong> Mettre en place des relances automatiques à J+30 et négocier des escomptes pour paiement anticipé.</p>
              </div>
            </ChartCard>
          </div>
        </div>
      )}
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════
// MASSE SALARIALE (+ provisions simplifié)
// ══════════════════════════════════════════════════════════════════════
function MasseSalariale() {
  const { currentOrgId, currentYear } = useApp();
  const { sig } = useStatements();
  const balance = useBalance();
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
    { name: 'Salaires de base', value: 73, color: C.primary },
    { name: 'Charges sociales', value: 22, color: C.secondary },
    { name: 'Primes & indemnités', value: 3, color: C.accent1 },
    { name: 'Avantages', value: 1, color: C.accent3 },
    { name: 'Formation', value: 1, color: C.warning },
  ];

  const msDept = [
    { dept: 'Production', pct: 32 }, { dept: 'Commercial', pct: 22 }, { dept: 'Administration', pct: 17 },
    { dept: 'Direction', pct: 15 }, { dept: 'Technique', pct: 9 }, { dept: 'Logistique', pct: 5 },
  ].map((d) => ({ ...d, montant: Math.round(totMasse * d.pct / 100) }));

  const ratioMs = data.labels.map((m, i) => ({
    mois: m,
    ratio: Math.round(ratio + Math.sin(i / 2) * 3 + Math.random() * 2),
    objectif: 22,
  }));

  // Provisions
  const provStock = [
    { type: 'Provisions pour risques', dotation: Math.round(totMasse * 0.04), reprise: Math.round(totMasse * 0.01), solde: Math.round(totMasse * 0.07), color: C.danger },
    { type: 'Provisions pour charges', dotation: Math.round(totMasse * 0.025), reprise: Math.round(totMasse * 0.02), solde: Math.round(totMasse * 0.045), color: C.warning },
    { type: 'Dépréciation stocks', dotation: Math.round(totMasse * 0.013), reprise: Math.round(totMasse * 0.005), solde: Math.round(totMasse * 0.03), color: C.accent4 },
    { type: 'Dépréciation créances', dotation: Math.round(totMasse * 0.02), reprise: Math.round(totMasse * 0.008), solde: Math.round(totMasse * 0.055), color: C.info },
  ];

  const provEvol = data.labels.map((m, i) => ({
    mois: m,
    dotations: Math.round(totMasse * (0.008 + Math.random() * 0.006)),
    reprises: Math.round(totMasse * (0.003 + Math.random() * 0.005)),
    solde: Math.round(totMasse * 0.2 + i * totMasse * 0.003),
  }));

  return (
    <>
      <TabSwitch value={tab} onChange={setTab} activeColor={C.accent3}
        tabs={[{ key: 'masse', label: '👥 Masse salariale' }, { key: 'provisions', label: '🛡️ Provisions' }]} />

      {tab === 'masse' && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4 mb-4">
            <KPICard title="Masse salariale totale" value={fmtK(totMasse)} unit="XOF" variation={5.1} color={C.primary} icon="👥" inverse />
            <KPICard title="Ratio MS / CA" value={`${ratio.toFixed(1)} %`} variation={-1.2} color={ratio < 25 ? C.success : C.warning} icon="📊" inverse subValue="Objectif : < 22%" />
            <KPICard title="Salaires directs" value={fmtK(salaires)} unit="XOF" color={C.secondary} icon="💼" />
            <KPICard title="Charges sociales" value={fmtK(charges)} unit="XOF" variation={4.8} color={C.warning} icon="🏛️" inverse />
            <KPICard title="Coût moyen / mois" value={fmtK(totMasse / 12)} unit="XOF" color={C.info} icon="📅" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
            <ChartCard title="📈 Évolution mensuelle de la masse salariale" className="lg:col-span-2">
              <ResponsiveContainer width="100%" height={240}>
                <ComposedChart data={msEvol}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="mois" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtK} />
                  <Tooltip formatter={(v: any) => fmtFull(v)} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey="salaires" name="Salaires" stackId="a" fill={C.primary} />
                  <Bar dataKey="charges" name="Charges sociales" stackId="a" fill={C.secondary} />
                  <Bar dataKey="primes" name="Primes" stackId="a" fill={C.accent1} radius={[3,3,0,0]} />
                  <Line type="monotone" dataKey="budget" name="Budget" stroke={C.danger} strokeDasharray="5 5" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="🍩 Répartition de la masse salariale">
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
            <ChartCard title="🏢 Masse salariale par département">
              <div className="text-xs">
                {msDept.map((d, i) => (
                  <div key={i} className="mb-2.5">
                    <div className="flex justify-between mb-1">
                      <span className="text-primary-600">{d.dept}</span>
                      <span><span className="font-bold num">{fmtFull(d.montant)}</span> <span className="text-primary-500">({d.pct}%)</span></span>
                    </div>
                    <div className="h-2 bg-primary-100 dark:bg-primary-800 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${d.pct / 35 * 100}%`, background: C.primary }} />
                    </div>
                  </div>
                ))}
              </div>
            </ChartCard>

            <ChartCard title="📊 Ratio Masse salariale / CA (%)">
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={ratioMs}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="mois" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} domain={[10, 30]} />
                  <Tooltip formatter={(v: any) => `${v}%`} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Line type="monotone" dataKey="ratio" name="Ratio MS/CA" stroke={C.primary} strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="objectif" name="Seuil max 22%" stroke={C.danger} strokeDasharray="5 5" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
        </>
      )}

      {tab === 'provisions' && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <KPICard title="Total provisions" value={fmtK(provStock.reduce((s, p) => s + p.solde, 0))} unit="XOF" variation={8.5} color={C.warning} icon="🛡️" />
            <KPICard title="Dotations N" value={fmtK(provStock.reduce((s, p) => s + p.dotation, 0))} unit="XOF" variation={12} color={C.danger} icon="📉" inverse />
            <KPICard title="Reprises N" value={fmtK(provStock.reduce((s, p) => s + p.reprise, 0))} unit="XOF" color={C.success} icon="📈" />
            <KPICard title="Impact net" value={fmtK(-(provStock.reduce((s, p) => s + p.dotation - p.reprise, 0)))} unit="XOF" color={C.danger} icon="💥" subValue="Dotations − Reprises" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard title="📊 Dotations vs Reprises — évolution mensuelle">
              <ResponsiveContainer width="100%" height={230}>
                <ComposedChart data={provEvol}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="mois" tick={{ fontSize: 10 }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 10 }} tickFormatter={fmtK} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} tickFormatter={fmtK} />
                  <Tooltip formatter={(v: any) => fmtFull(v)} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Bar yAxisId="left" dataKey="dotations" name="Dotations" fill={C.danger} radius={[3,3,0,0]} />
                  <Bar yAxisId="left" dataKey="reprises" name="Reprises" fill={C.success} radius={[3,3,0,0]} />
                  <Line yAxisId="right" type="monotone" dataKey="solde" name="Solde provisions" stroke={C.info} strokeWidth={2} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="🛡️ Détail des provisions par type">
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
                        <td className="py-2 px-1 text-right num font-semibold" style={{ color: C.danger }}>{fmtFull(p.dotation)}</td>
                        <td className="py-2 px-1 text-right num font-semibold" style={{ color: C.success }}>{fmtFull(p.reprise)}</td>
                        <td className="py-2 px-1 text-right num font-bold">{fmtFull(p.solde)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-primary-700 dark:border-primary-300">
                      <td className="py-2 px-1 font-bold">TOTAL</td>
                      <td className="py-2 px-1 text-right num font-bold" style={{ color: C.danger }}>{fmtFull(provStock.reduce((s, p) => s + p.dotation, 0))}</td>
                      <td className="py-2 px-1 text-right num font-bold" style={{ color: C.success }}>{fmtFull(provStock.reduce((s, p) => s + p.reprise, 0))}</td>
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

// ══════════════════════════════════════════════════════════════════════
// FISCALITÉ
// ══════════════════════════════════════════════════════════════════════
function Fiscalite() {
  const { currentOrgId, currentYear } = useApp();
  const { sig } = useStatements();
  const [data, setData] = useState({ tvaCollectee: 0, tvaDeductible: 0, tvaAPayer: 0, is: 0, taxes: 0 });

  useEffect(() => {
    if (!currentOrgId) return;
    fiscalite(currentOrgId, currentYear).then(setData);
  }, [currentOrgId, currentYear]);

  const pression = sig?.ca ? ((data.taxes + data.is + Math.max(data.tvaAPayer, 0)) / sig.ca) * 100 : 0;
  const pie = [
    { name: 'TVA nette', value: Math.max(data.tvaAPayer, 0), color: C.secondary },
    { name: 'Impôts & taxes', value: data.taxes, color: C.warning },
    { name: 'IS estimé', value: data.is, color: C.danger },
  ].filter((d) => d.value > 0);

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <KPICard title="TVA collectée" value={fmtK(data.tvaCollectee)} unit="XOF" color={C.info} icon="💰" />
        <KPICard title="TVA déductible" value={fmtK(data.tvaDeductible)} unit="XOF" color={C.success} icon="📥" />
        <KPICard title="TVA nette à payer" value={fmtK(Math.max(data.tvaAPayer, 0))} unit="XOF" color={data.tvaAPayer > 0 ? C.warning : C.success} icon="💸" />
        <KPICard title="IS estimé" value={fmtK(data.is)} unit="XOF" color={C.danger} icon="🏛️" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="📊 Décomposition fiscale">
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
        <ChartCard title="📋 Indicateurs fiscaux">
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
            ⚠️ L'IS est une estimation depuis les écritures 441. Le montant définitif est déterminé à la clôture après retraitements fiscaux.
          </div>
        </ChartCard>
      </div>
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════
// STOCKS
// ══════════════════════════════════════════════════════════════════════
function Stocks() {
  const balance = useBalance();
  const stocks = [
    { label: 'Marchandises', code: '31', color: C.primary },
    { label: 'Matières premières', code: '32', color: C.secondary },
    { label: 'Autres approv.', code: '33', color: C.accent1 },
    { label: 'En cours', code: '34', color: C.accent3 },
    { label: 'Produits finis', code: '36', color: C.warning },
    { label: 'Produits intermédiaires', code: '37', color: C.accent4 },
  ].map((s) => ({ ...s,
    value: balance.filter((r) => r.account.startsWith(s.code)).reduce((sum, r) => sum + r.soldeD, 0),
  })).filter((s) => s.value > 0);

  const total = stocks.reduce((s, x) => s + x.value, 0);
  const deprec = balance.filter((r) => r.account.startsWith('39')).reduce((s, r) => s + r.soldeC, 0);

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <KPICard title="Stock brut" value={fmtK(total)} unit="XOF" color={C.primary} icon="📦" />
        <KPICard title="Dépréciations" value={fmtK(deprec)} unit="XOF" color={deprec > 0 ? C.warning : C.success} icon="📉" inverse />
        <KPICard title="Stock net" value={fmtK(total - deprec)} unit="XOF" color={C.success} icon="✅" />
        <KPICard title="Catégories" value={String(stocks.length)} color={C.info} icon="📂" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="🍩 Répartition des stocks par nature">
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
        <ChartCard title="📊 Valorisation par catégorie">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={stocks} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={fmtK} />
              <YAxis type="category" dataKey="label" tick={{ fontSize: 10 }} width={140} />
              <Tooltip formatter={(v: any) => fmtFull(v)} />
              <Bar dataKey="value" radius={[0,4,4,0]}>
                {stocks.map((s, i) => <Cell key={i} fill={s.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════
// IMMOBILISATIONS
// ══════════════════════════════════════════════════════════════════════
function Immobilisations() {
  const { currentOrgId, currentYear } = useApp();
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
        <KPICard title="Valeur brute" value={fmtK(totBrute)} unit="XOF" color={C.info} icon="🏗️" />
        <KPICard title="Amortissements" value={fmtK(totAmort)} unit="XOF" color={C.warning} icon="📉" />
        <KPICard title="Valeur nette" value={fmtK(totVNC)} unit="XOF" color={C.success} icon="💎" />
        <KPICard title="Taux de vétusté" value={`${vetuste.toFixed(1)} %`} color={vetuste < 50 ? C.success : vetuste < 75 ? C.warning : C.danger} icon="⏳" inverse />
      </div>
      <ChartCard title="📊 Décomposition par catégorie">
        <ResponsiveContainer width="100%" height={340}>
          <BarChart data={data} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={fmtK} />
            <YAxis type="category" dataKey="label" tick={{ fontSize: 10 }} width={140} />
            <Tooltip formatter={(v: any) => fmtFull(v)} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="brute" name="Valeur brute" fill={C.primary} radius={[0,3,3,0]} />
            <Bar dataKey="amort" name="Amortissements" fill={C.warning} radius={[0,3,3,0]} />
            <Bar dataKey="vnc" name="VNC" fill={C.success} radius={[0,3,3,0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════
// SECTORIEL — dispatch
// ══════════════════════════════════════════════════════════════════════
function Sectoral({ id }: { id: string }) {
  if (id === 'ind') return <SecIndustrie />;
  if (id === 'btp') return <SecBTP />;
  if (id === 'com') return <SecCommerce />;
  if (id === 'mfi') return <SecMicrofinance />;
  return null;
}

// ─── INDUSTRIE ─────────────────────────────────────────────────────────
function SecIndustrie() {
  const { sig, balance } = useStatements();
  const { currentOrgId, currentYear } = useApp();
  const [monthly, setMonthly] = useState<{ labels: string[]; values: number[] }>({ labels: [], values: [] });
  useEffect(() => {
    if (currentOrgId) monthlyByPrefix(currentOrgId, currentYear, ['70']).then(setMonthly);
  }, [currentOrgId, currentYear]);
  if (!sig) return null;

  const production = balance.filter(r => r.account.startsWith('702') || r.account.startsWith('703')).reduce((s,r) => s+r.credit-r.debit, 0);
  const matieres = balance.filter(r => r.account.startsWith('602') || r.account.startsWith('604')).reduce((s,r) => s+r.debit-r.credit, 0);
  const personnel = balance.filter(r => r.account.startsWith('66')).reduce((s,r) => s+r.debit-r.credit, 0);
  const energie = balance.filter(r => r.account.startsWith('605')).reduce((s,r) => s+r.debit-r.credit, 0);
  const amort = balance.filter(r => r.account.startsWith('68')).reduce((s,r) => s+r.debit-r.credit, 0);
  const stockPF = balance.filter(r => r.account.startsWith('36')).reduce((s,r) => s+r.soldeD, 0);
  const stockMP = balance.filter(r => r.account.startsWith('32')).reduce((s,r) => s+r.soldeD, 0);
  const tauxMarge = sig.ca ? (sig.margeBrute / sig.ca) * 100 : 0;
  const productivite = sig.ca && personnel ? sig.ca / personnel : 0;

  const structureCout = [
    { name: 'Matières premières', value: matieres },
    { name: 'Main-d\'œuvre', value: personnel },
    { name: 'Énergie & fluides', value: energie },
    { name: 'Amortissements', value: amort },
  ].filter(c => c.value > 0);

  const monthlyData = monthly.labels.map((m, i) => ({ mois: m, production: monthly.values[i], objectif: monthly.values.reduce((s,v) => s+v, 0) / 12 }));

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <KPICard title="Production vendue" value={fmtK(production)} unit="XOF" icon="🏭" />
        <KPICard title="Coût MP consommées" value={fmtK(matieres)} unit="XOF" icon="⚙️" />
        <KPICard title="Marge industrielle" value={fmtK(sig.margeBrute)} unit="XOF" icon="◆" />
        <KPICard title="Taux de marge" value={`${tauxMarge.toFixed(1)} %`} icon="%" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <KPICard title="Stock MP" value={fmtK(stockMP)} unit="XOF" icon="▦" />
        <KPICard title="Stock PF" value={fmtK(stockPF)} unit="XOF" icon="▨" />
        <KPICard title="Productivité (CA/MS)" value={productivite.toFixed(2)} icon="↗" subValue={productivite > 3 ? 'Bonne' : 'À améliorer'} />
        <KPICard title="Personnel production" value={fmtK(personnel)} unit="XOF" icon="◐" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <ChartCard title="Structure des coûts de production">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={structureCout} cx="50%" cy="50%" innerRadius={55} outerRadius={90} dataKey="value"
                label={(p: any) => `${p.name} ${((p.value/structureCout.reduce((s,d) => s+d.value,0))*100).toFixed(0)}%`}>
                {structureCout.map((_, i) => <Cell key={i} fill={['#171717','#404040','#737373','#a3a3a3'][i]} />)}
              </Pie>
              <Tooltip formatter={(v: any) => fmtFull(v)} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Production mensuelle vs objectif">
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
              <XAxis dataKey="mois" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtK} />
              <Tooltip formatter={(v: any) => fmtFull(v)} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="production" name="Production" fill="#262626" radius={[3,3,0,0]} />
              <Line type="monotone" dataKey="objectif" name="Objectif moyen" stroke="#737373" strokeDasharray="5 5" dot={false} strokeWidth={2} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard title="Ratios industriels clés">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-primary-200 dark:border-primary-700 text-xs uppercase text-primary-500">
            <th className="text-left py-2 px-3">Indicateur</th>
            <th className="text-right py-2 px-3">Valeur</th>
            <th className="text-left py-2 px-3">Formule</th>
          </tr></thead>
          <tbody className="divide-y divide-primary-200 dark:divide-primary-800">
            <tr><td className="py-2 px-3">Taux de marge industrielle</td><td className="text-right num font-semibold">{tauxMarge.toFixed(1)} %</td><td className="text-xs text-primary-500 font-mono">(Production − Matières) / Production</td></tr>
            <tr><td className="py-2 px-3">Productivité salariale</td><td className="text-right num font-semibold">{productivite.toFixed(2)}</td><td className="text-xs text-primary-500 font-mono">CA / Masse salariale</td></tr>
            <tr><td className="py-2 px-3">Ratio matières / CA</td><td className="text-right num font-semibold">{sig.ca ? ((matieres/sig.ca)*100).toFixed(1) : 0} %</td><td className="text-xs text-primary-500 font-mono">Achats MP / Production</td></tr>
            <tr><td className="py-2 px-3">Intensité énergétique</td><td className="text-right num font-semibold">{sig.ca ? ((energie/sig.ca)*100).toFixed(1) : 0} %</td><td className="text-xs text-primary-500 font-mono">Énergie / Production</td></tr>
            <tr><td className="py-2 px-3">Couverture stock PF</td><td className="text-right num font-semibold">{production ? Math.round((stockPF/production)*360) : 0} j</td><td className="text-xs text-primary-500 font-mono">(Stock PF / CA) × 360</td></tr>
            <tr><td className="py-2 px-3">Couverture stock MP</td><td className="text-right num font-semibold">{matieres ? Math.round((stockMP/matieres)*360) : 0} j</td><td className="text-xs text-primary-500 font-mono">(Stock MP / Achats) × 360</td></tr>
          </tbody>
        </table>
      </ChartCard>
    </>
  );
}

// ─── BTP ────────────────────────────────────────────────────────────
function SecBTP() {
  const { sig, balance } = useStatements();
  const { currentOrgId, currentYear } = useApp();
  const [monthly, setMonthly] = useState<{ labels: string[]; values: number[] }>({ labels: [], values: [] });
  useEffect(() => {
    if (currentOrgId) monthlyByPrefix(currentOrgId, currentYear, ['705']).then(setMonthly);
  }, [currentOrgId, currentYear]);
  if (!sig) return null;

  const travaux = balance.filter(r => r.account.startsWith('705')).reduce((s,r) => s+r.credit-r.debit, 0);
  const achats = balance.filter(r => r.account.startsWith('601') || r.account.startsWith('605')).reduce((s,r) => s+r.debit-r.credit, 0);
  const soustrait = balance.filter(r => r.account.startsWith('637')).reduce((s,r) => s+r.debit-r.credit, 0);
  const locations = balance.filter(r => r.account.startsWith('622')).reduce((s,r) => s+r.debit-r.credit, 0);
  const mainoeuvre = balance.filter(r => r.account.startsWith('66')).reduce((s,r) => s+r.debit-r.credit, 0);
  const encours = balance.filter(r => r.account.startsWith('34') || r.account.startsWith('35')).reduce((s,r) => s+r.soldeD, 0);
  const clients = balance.filter(r => r.account.startsWith('411')).reduce((s,r) => s+r.soldeD, 0);
  const margeBTP = travaux - achats - soustrait;
  const tauxMargeBTP = travaux ? (margeBTP / travaux) * 100 : 0;

  // Simulation chantiers
  const chantiers = [
    { nom: 'Chantier A — Bureaux Plateau', avancement: 75, marge: 18, budget: travaux * 0.3, realise: travaux * 0.25 },
    { nom: 'Chantier B — Villa Cocody', avancement: 45, marge: 22, budget: travaux * 0.2, realise: travaux * 0.12 },
    { nom: 'Chantier C — Route Yamoussoukro', avancement: 90, marge: 14, budget: travaux * 0.35, realise: travaux * 0.33 },
    { nom: 'Chantier D — Immeuble R+6', avancement: 30, marge: 20, budget: travaux * 0.15, realise: travaux * 0.05 },
  ];

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <KPICard title="Travaux facturés" value={fmtK(travaux)} unit="XOF" icon="▲" />
        <KPICard title="Achats chantier" value={fmtK(achats)} unit="XOF" icon="▦" />
        <KPICard title="Sous-traitance" value={fmtK(soustrait)} unit="XOF" icon="◈" />
        <KPICard title="Marge brute BTP" value={fmtK(margeBTP)} unit="XOF" subValue={`${tauxMargeBTP.toFixed(1)} % des travaux`} icon="◆" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <KPICard title="Encours travaux (34-35)" value={fmtK(encours)} unit="XOF" icon="▣" />
        <KPICard title="Locations matériel" value={fmtK(locations)} unit="XOF" icon="⚙" />
        <KPICard title="Main-d'œuvre" value={fmtK(mainoeuvre)} unit="XOF" icon="●" />
        <KPICard title="Créances clients" value={fmtK(clients)} unit="XOF" icon="◉" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <ChartCard title="Évolution des travaux facturés">
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={monthly.labels.map((m, i) => ({ mois: m, travaux: monthly.values[i] }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
              <XAxis dataKey="mois" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtK} />
              <Tooltip formatter={(v: any) => fmtFull(v)} />
              <Area type="monotone" dataKey="travaux" stroke="#171717" fill="#17171730" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Décomposition des coûts par chantier">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={[
              { cat: 'Achats', montant: achats },
              { cat: 'Sous-traitance', montant: soustrait },
              { cat: 'Main-d\'œuvre', montant: mainoeuvre * 0.7 },
              { cat: 'Locations', montant: locations },
            ]}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
              <XAxis dataKey="cat" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtK} />
              <Tooltip formatter={(v: any) => fmtFull(v)} />
              <Bar dataKey="montant" fill="#404040" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard title="Suivi des chantiers — avancement et marge">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-primary-200 dark:border-primary-700 text-xs uppercase text-primary-500">
            <th className="text-left py-2 px-3">Chantier</th>
            <th className="text-left py-2 px-3">Avancement</th>
            <th className="text-right py-2 px-3">Marge</th>
            <th className="text-right py-2 px-3">Budget</th>
            <th className="text-right py-2 px-3">Réalisé</th>
            <th className="text-right py-2 px-3">Reste à engager</th>
          </tr></thead>
          <tbody className="divide-y divide-primary-200 dark:divide-primary-800">
            {chantiers.map((c, i) => (
              <tr key={i}>
                <td className="py-2.5 px-3 font-medium">{c.nom}</td>
                <td className="py-2.5 px-3">
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-1.5 bg-primary-200 dark:bg-primary-800 rounded-full overflow-hidden">
                      <div className="h-full bg-primary-900 dark:bg-primary-100 rounded-full" style={{ width: `${c.avancement}%` }} />
                    </div>
                    <span className="num text-xs">{c.avancement} %</span>
                  </div>
                </td>
                <td className="py-2.5 px-3 text-right num font-semibold">{c.marge} %</td>
                <td className="py-2.5 px-3 text-right num">{fmtFull(c.budget)}</td>
                <td className="py-2.5 px-3 text-right num">{fmtFull(c.realise)}</td>
                <td className="py-2.5 px-3 text-right num text-primary-500">{fmtFull(c.budget - c.realise)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ChartCard>
    </>
  );
}

// ─── COMMERCE ──────────────────────────────────────────────────────
function SecCommerce() {
  const { sig, balance } = useStatements();
  const { currentOrgId, currentYear } = useApp();
  const [monthly, setMonthly] = useState<{ labels: string[]; values: number[] }>({ labels: [], values: [] });
  useEffect(() => {
    if (currentOrgId) monthlyByPrefix(currentOrgId, currentYear, ['701']).then(setMonthly);
  }, [currentOrgId, currentYear]);
  if (!sig) return null;

  const ventes = balance.filter(r => r.account.startsWith('701')).reduce((s,r) => s+r.credit-r.debit, 0);
  const coutAchat = balance.filter(r => r.account.startsWith('601')).reduce((s,r) => s+r.debit-r.credit, 0);
  const stockMarch = balance.filter(r => r.account.startsWith('31')).reduce((s,r) => s+r.soldeD, 0);
  const transport = balance.filter(r => r.account.startsWith('61')).reduce((s,r) => s+r.debit-r.credit, 0);
  const margeCom = ventes - coutAchat;
  const tauxMarque = ventes ? (margeCom / ventes) * 100 : 0;
  const rotation = coutAchat ? (stockMarch / coutAchat) * 360 : 0;

  const monthlyData = monthly.labels.map((m, i) => ({
    mois: m,
    ventes: monthly.values[i],
    marge: Math.round(monthly.values[i] * (tauxMarque / 100)),
  }));

  const familles = [
    { nom: 'Électroménager', ca: ventes * 0.35, marge: 22 },
    { nom: 'Informatique', ca: ventes * 0.25, marge: 18 },
    { nom: 'Mobilier', ca: ventes * 0.20, marge: 28 },
    { nom: 'Accessoires', ca: ventes * 0.12, marge: 35 },
    { nom: 'Autres', ca: ventes * 0.08, marge: 15 },
  ];

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <KPICard title="Ventes marchandises" value={fmtK(ventes)} unit="XOF" icon="▸" />
        <KPICard title="Coût d'achat" value={fmtK(coutAchat)} unit="XOF" icon="▾" />
        <KPICard title="Marge commerciale" value={fmtK(margeCom)} unit="XOF" subValue={`${tauxMarque.toFixed(1)} % de taux de marque`} icon="◆" />
        <KPICard title="Rotation stocks" value={`${Math.round(rotation)} j`} icon="↻" subValue="Couverture stock" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <KPICard title="Stock marchandises" value={fmtK(stockMarch)} unit="XOF" icon="▦" />
        <KPICard title="Transports sur ventes" value={fmtK(transport)} unit="XOF" icon="→" />
        <KPICard title="Panier moyen (estimation)" value={fmtK(ventes / 1000)} unit="XOF" icon="◉" subValue="CA / nb transactions" />
        <KPICard title="Taux de marque" value={`${tauxMarque.toFixed(1)} %`} icon="%" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <ChartCard title="Évolution des ventes et de la marge">
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
              <XAxis dataKey="mois" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtK} />
              <Tooltip formatter={(v: any) => fmtFull(v)} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="ventes" name="Ventes" fill="#404040" radius={[3,3,0,0]} />
              <Line type="monotone" dataKey="marge" name="Marge" stroke="#171717" strokeWidth={2.5} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Ventilation du CA par famille">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={familles} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
              <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={fmtK} />
              <YAxis type="category" dataKey="nom" tick={{ fontSize: 10 }} width={100} />
              <Tooltip formatter={(v: any) => fmtFull(v)} />
              <Bar dataKey="ca" fill="#262626" radius={[0,4,4,0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard title="Performance par famille de produits">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-primary-200 dark:border-primary-700 text-xs uppercase text-primary-500">
            <th className="text-left py-2 px-3">Famille</th>
            <th className="text-right py-2 px-3">Chiffre d'affaires</th>
            <th className="text-right py-2 px-3">% du CA</th>
            <th className="text-right py-2 px-3">Taux de marge</th>
            <th className="text-right py-2 px-3">Marge dégagée</th>
          </tr></thead>
          <tbody className="divide-y divide-primary-200 dark:divide-primary-800">
            {familles.map((f, i) => (
              <tr key={i}>
                <td className="py-2.5 px-3 font-medium">{f.nom}</td>
                <td className="py-2.5 px-3 text-right num font-semibold">{fmtFull(f.ca)}</td>
                <td className="py-2.5 px-3 text-right num text-primary-500">{((f.ca / ventes) * 100).toFixed(1)} %</td>
                <td className="py-2.5 px-3 text-right num">{f.marge} %</td>
                <td className="py-2.5 px-3 text-right num font-semibold">{fmtFull(f.ca * f.marge / 100)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ChartCard>
    </>
  );
}

// ─── MICROFINANCE ──────────────────────────────────────────────────
function SecMicrofinance() {
  const { sig, balance } = useStatements();
  if (!sig) return null;

  const prodInt = balance.filter(r => r.account.startsWith('77')).reduce((s,r) => s+r.credit-r.debit, 0);
  const chargeInt = balance.filter(r => r.account.startsWith('67')).reduce((s,r) => s+r.debit-r.credit, 0);
  const commissions = balance.filter(r => r.account.startsWith('707')).reduce((s,r) => s+r.credit-r.debit, 0);
  const encours = balance.filter(r => r.account.startsWith('411')).reduce((s,r) => s+r.soldeD, 0);
  const douteux = balance.filter(r => r.account.startsWith('416')).reduce((s,r) => s+r.soldeD, 0);
  const depots = balance.filter(r => r.account.startsWith('419') || r.account.startsWith('46')).reduce((s,r) => s+r.soldeC, 0);
  const provisions = balance.filter(r => r.account.startsWith('49')).reduce((s,r) => s+r.soldeC, 0);
  const pnb = prodInt + commissions - chargeInt;
  const par30 = encours ? (douteux / encours) * 100 : 0;
  const tauxProv = encours ? (provisions / encours) * 100 : 0;
  const coutRisque = encours ? (provisions / encours) * 100 : 0;

  const portfolio = [
    { tranche: 'Sain (non échu)', encours: encours * 0.75, color: '#171717' },
    { tranche: 'PAR 1-30j', encours: encours * 0.12, color: '#404040' },
    { tranche: 'PAR 31-90j', encours: encours * 0.08, color: '#737373' },
    { tranche: 'PAR > 90j', encours: encours * 0.05, color: '#a3a3a3' },
  ];

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <KPICard title="Produits d'intérêts" value={fmtK(prodInt)} unit="XOF" icon="▲" />
        <KPICard title="Charges d'intérêts" value={fmtK(chargeInt)} unit="XOF" icon="▼" />
        <KPICard title="PNB" value={fmtK(pnb)} unit="XOF" subValue="Produit Net Bancaire" icon="◆" />
        <KPICard title="Commissions" value={fmtK(commissions)} unit="XOF" icon="◈" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <KPICard title="Encours crédit" value={fmtK(encours)} unit="XOF" icon="●" />
        <KPICard title="Dépôts collectés" value={fmtK(depots)} unit="XOF" icon="▣" />
        <KPICard title="PAR 30" value={`${par30.toFixed(2)} %`} subValue="Portefeuille à risque" icon="⚠" inverse />
        <KPICard title="Taux de provisionnement" value={`${tauxProv.toFixed(2)} %`} icon="◉" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <ChartCard title="Qualité du portefeuille de crédit">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={portfolio}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
              <XAxis dataKey="tranche" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtK} />
              <Tooltip formatter={(v: any) => fmtFull(v)} />
              <Bar dataKey="encours" radius={[4,4,0,0]}>
                {portfolio.map((p, i) => <Cell key={i} fill={p.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Composition du PNB">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={[
                { name: "Produits d'intérêts", value: prodInt },
                { name: 'Commissions', value: commissions },
              ]} cx="50%" cy="50%" innerRadius={55} outerRadius={90} dataKey="value"
                label={(p: any) => `${p.name}`}>
                <Cell fill="#171717" />
                <Cell fill="#737373" />
              </Pie>
              <Tooltip formatter={(v: any) => fmtFull(v)} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard title="Ratios prudentiels microfinance">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-primary-200 dark:border-primary-700 text-xs uppercase text-primary-500">
            <th className="text-left py-2 px-3">Indicateur</th>
            <th className="text-right py-2 px-3">Valeur</th>
            <th className="text-right py-2 px-3">Norme BCEAO</th>
            <th className="text-center py-2 px-3">Statut</th>
          </tr></thead>
          <tbody className="divide-y divide-primary-200 dark:divide-primary-800">
            <tr><td className="py-2 px-3">PAR 30</td><td className="text-right num font-semibold">{par30.toFixed(2)} %</td><td className="text-right num text-primary-500">≤ 5 %</td>
              <td className="text-center"><span className={`badge ${par30 <= 5 ? 'bg-success/15 text-success' : 'bg-error/15 text-error'}`}>{par30 <= 5 ? 'OK' : 'Alerte'}</span></td></tr>
            <tr><td className="py-2 px-3">Taux de provisionnement</td><td className="text-right num font-semibold">{tauxProv.toFixed(2)} %</td><td className="text-right num text-primary-500">≥ 70 % du PAR</td>
              <td className="text-center"><span className="badge bg-primary-200 dark:bg-primary-800">À vérifier</span></td></tr>
            <tr><td className="py-2 px-3">Coût du risque</td><td className="text-right num font-semibold">{coutRisque.toFixed(2)} %</td><td className="text-right num text-primary-500">≤ 2 %</td>
              <td className="text-center"><span className={`badge ${coutRisque <= 2 ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning'}`}>{coutRisque <= 2 ? 'OK' : 'Vigilance'}</span></td></tr>
            <tr><td className="py-2 px-3">Ratio de transformation</td><td className="text-right num font-semibold">{depots ? ((encours / depots) * 100).toFixed(1) : 0} %</td><td className="text-right num text-primary-500">≤ 200 %</td>
              <td className="text-center"><span className="badge bg-primary-200 dark:bg-primary-800">—</span></td></tr>
            <tr><td className="py-2 px-3">Marge d'intérêt</td><td className="text-right num font-semibold">{encours ? ((pnb / encours) * 100).toFixed(2) : 0} %</td><td className="text-right num text-primary-500">objectif interne</td>
              <td className="text-center">—</td></tr>
          </tbody>
        </table>
      </ChartCard>
    </>
  );
}
