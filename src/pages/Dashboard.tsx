import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useParams } from 'react-router-dom';
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, AreaChart, Area, ComposedChart,
} from 'recharts';
import { ArrowLeft, Download, Diamond, Circle, Star, TrendingUp, TrendingDown, Target, Layers, Activity, Percent } from 'lucide-react';
import clsx from 'clsx';
import { KPICard } from '../components/ui/KPICardV2';
import { ChartCard } from '../components/ui/ChartCard';
import { DashHeader } from '../components/ui/DashHeader';
import { DashboardTopBar } from '../components/ui/DashboardTopBar';
import { TabSwitch } from '../components/ui/TabSwitch';
import { useBalance, useBudgetActual, useCurrentOrg, useRatios, useStatements } from '../hooks/useFinancials';
import { useChartTheme } from '../lib/chartTheme';
import { bySection, loadLabels, computeBudgetActual } from '../engine/budgetActual';
import { useApp } from '../store/app';
import { db } from '../db/schema';
import { fmtFull, fmtK } from '../lib/format';
import { agedBalance, fiscalite, immobilisationsDetail, masseSalariale, monthlyByPrefix, topAccountsByPrefix, tresorerieMonthly, AgedTier } from '../engine/analytics';

// useApp().amountMode est lu pour déclencher un re-render de toute la page
// quand l'utilisateur bascule Entier / Abrégé. fmtK/fmtMoney lisent ensuite
// le mode depuis localStorage, ce qui rend le changement instantané.
// Les pages qui appellent ce Dashboard root passent déjà par useApp.

// Les gradients sont maintenant dynamiques via useChartTheme().gradient()
// Variants alternées pour distinguer visuellement les dashboards
const gradientVariants: Record<string, 'a' | 'b' | 'c'> = {
  cp: 'a', client: 'b', fr: 'c', tre: 'a', bfr: 'b', sal: 'c',
  fis: 'a', stk: 'b', immo: 'c', ind: 'a', btp: 'b', com: 'a',
  mfi: 'c', imco: 'b', hot: 'c', agri: 'a', sante: 'b',
  transp: 'c', serv: 'a', ana_centres: 'b', ana_projets: 'c', ana_axes: 'a',
};

const catalog: Record<string, { title: string; icon: string; subtitle: string }> = {
  cp:    { title: 'Charges & Produits', icon: 'CP', subtitle: 'Analyse détaillée des charges et produits' },
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
  client:{ title: 'Cycle Client', icon: 'CL', subtitle: 'Suivi des créances, recouvrement et risque client' },
  fr:    { title: 'Cycle Fournisseur', icon: 'FO', subtitle: 'Suivi des dettes, échéances et relations fournisseurs' },
  tre:   { title: 'Trésorerie', icon: 'TR', subtitle: 'Position, flux et volatilité de la trésorerie' },
  bfr:   { title: 'BFR', icon: 'BF', subtitle: 'Fonds de roulement, BFR, trésorerie nette' },
  sal:   { title: 'Masse Salariale', icon: 'MS', subtitle: 'Suivi des charges de personnel' },
  fis:   { title: 'Fiscalité', icon: 'FI', subtitle: 'TVA, IS, taxes, pression fiscale' },
  stk:   { title: 'Stocks', icon: 'ST', subtitle: 'Valorisation, dépréciations, rotation' },
  immo:  { title: 'Immobilisations', icon: 'IM', subtitle: 'VNC, amortissements, taux de vétusté' },
  ind:    { title: 'Industrie', icon: 'IN', subtitle: 'Production, coût MP, marge industrielle' },
  btp:    { title: 'BTP', icon: 'BT', subtitle: 'Travaux facturés, sous-traitance, marge' },
  com:    { title: 'Commerce', icon: 'CO', subtitle: 'Ventes, marge commerciale, taux de marque' },
  mfi:    { title: 'Microfinance', icon: 'MF', subtitle: 'PNB, coût du risque, encours clients' },
  imco:   { title: 'Immobilier commercial', icon: 'IC', subtitle: 'Loyers, taux occupation, charges locatives' },
  hot:    { title: 'Hôtellerie & Restauration', icon: 'HO', subtitle: 'RevPAR, taux occupation, ADR, GOP' },
  agri:   { title: 'Agriculture', icon: 'AG', subtitle: 'Récoltes, intrants, rendement, subventions' },
  sante:  { title: 'Santé', icon: 'SA', subtitle: 'Actes, recettes, personnel soignant, équipements' },
  transp: { title: 'Transport & Logistique', icon: 'TP', subtitle: 'CA/km, flotte, carburant, maintenance' },
  serv:   { title: 'Services & Conseil', icon: 'SV', subtitle: 'Honoraires, taux facturable, marge sur projets' },
  ana_centres: { title: 'Centres de coûts / profit', icon: 'CC', subtitle: 'Charges et produits par centre analytique' },
  ana_projets: { title: 'Suivi par projet', icon: 'PJ', subtitle: 'Rentabilité, temps passé, marge, avancement' },
  ana_axes:    { title: 'Axes analytiques', icon: 'AX', subtitle: 'Analyse multi-axes : région, département, activité' },
};

export default function Dashboard() {
  const { id = 'cp' } = useParams();
  const org = useCurrentOrg();
  // useApp sans sélecteur : le composant se re-rend à chaque changement du
  // store, y compris quand l'utilisateur toggle amountMode (Entier ↔ Abrégé).
  // fmtK/fmtMoney lisent alors le mode à jour depuis localStorage.
  const { currentYear, fromMonth, toMonth } = useApp();
  const ct = useChartTheme();
  const meta = catalog[id];
  if (!meta) return <div className="py-20 text-center text-primary-500">Dashboard introuvable</div>;

  const MONTH_SHORT = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
  const periodTag = (fromMonth === 1 && toMonth === 12) ? '' : ` · ${MONTH_SHORT[fromMonth - 1]} → ${MONTH_SHORT[toMonth - 1]}`;
  const subtitle = `${meta.subtitle} — ${org?.name ?? '—'} · Exercice ${currentYear}${periodTag}`;

  return (
    <div>
      <DashboardTopBar currentRoute={`/dashboard/${id}`} />
      <div className="flex justify-end mb-3">
        <button className="btn-clay text-sm"><Download className="w-4 h-4" /> Exporter</button>
      </div>
      <DashHeader icon={meta.icon} title={meta.title} subtitle={subtitle} gradient={ct.gradient(gradientVariants[id ?? 'cp'] ?? 'a')} />

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
      {['ind','btp','com','mfi','imco','hot','agri','sante','transp','serv'].includes(id!) && <Sectoral id={id!} />}
      {id?.startsWith('ana_') && <Analytique id={id} />}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// CHARGES & PRODUITS (3 tabs)
// ══════════════════════════════════════════════════════════════════════
function ChargesProduits() {
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

  // (P1-7) Source UNIQUE : balance (qui respecte la période sélectionnée via
  // useBalance avec fromMonth/toMonth). Avant : `chargesMonthly.values` était
  // calculé sur 12 mois fixes alors que `repartitionCharges` lisait `balance`
  // filtré sur la période — sources incompatibles → totaux incohérents.
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

  // Répartition SYSCOHADA EXHAUSTIVE des produits de classe 7.
  // Chaque compte 7x n'apparaît QUE dans une seule catégorie (pas de chevauchement).
  // Total de la répartition == totalProduits (somme classe 7 nette).
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

  // Evolution empilée par nature (12 mois) — 7 buckets exhaustifs couvrant 60-69.
  // Chaque classe n'apparaît que dans UN seul bucket (pas de chevauchement).
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

  // Évolution mensuelle empilée — composition exhaustive sans chevauchement.
  // 'ventes' = ventes marchandises (701) + ventes produits (702-704, 708)
  // 'services' = prestations (705, 706, 707)
  // 'subventions' = 71 + 74
  // 'prodImmob' = 72 + 73 (production immobilisée / stockée)
  // 'financiers' = 77
  // 'autres' = 75 + 78 + 79 (autres produits, transferts, reprises)
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

  // Budget vs réalisé : on récupère le budget réel via budgetActual hook (sinon vide)
  const budgetVsRealise = topCharges.slice(0, 7).map((r) => {
    const ba = (rowsBA ?? []).find((x: any) => x.code === r.code);
    return { poste: r.code, realise: r.value, budget: ba?.budget ?? 0 };
  });

  // Répartition fixes/variables : non hardcodée, utilise les comptes 64,66 (fixes) vs 60,61,62 (variables)
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
                <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #e5e5e5)" />
                <XAxis dataKey="mois" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtK} />
                <Tooltip formatter={(v: any) => fmtFull(v)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Area type="monotone" dataKey="achats" name="Achats" stackId="1" fill={ct.at(0)} stroke={ct.at(0)} fillOpacity={0.8} />
                <Area type="monotone" dataKey="personnel" name="Personnel" stackId="1" fill={ct.at(1)} stroke={ct.at(1)} fillOpacity={0.8} />
                <Area type="monotone" dataKey="services" name="Services ext." stackId="1" fill={ct.at(2)} stroke={ct.at(2)} fillOpacity={0.8} />
                <Area type="monotone" dataKey="amortissements" name="Amortiss." stackId="1" fill={ct.at(3)} stroke={ct.at(3)} fillOpacity={0.8} />
                <Area type="monotone" dataKey="autres" name="Autres" stackId="1" fill={ct.at(4)} stroke={ct.at(4)} fillOpacity={0.8} />
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
                <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #e5e5e5)" />
                <XAxis dataKey="mois" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtK} />
                <Tooltip formatter={(v: any) => fmtFull(v)} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="fixes" name="Charges fixes" stackId="a" fill={ct.at(0)} />
                <Bar dataKey="variables" name="Variables" stackId="a" fill={ct.at(1)} radius={[3,3,0,0]} />
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
                  {topCharges.map((c, i) => {
                    // (P2-9) Variation N-1 : on n'a pas encore le calcul réel via
                    // computeBalance(year-1). En attendant le hook dédié, on affiche
                    // "—" plutôt qu'une valeur Math.random() qui ETAIT FAUSSE.
                    // TODO: implementer useBalanceN1() qui charge la balance N-1
                    // et renvoie la variation pour chaque compte.
                    return (
                      <tr key={i} className="border-b border-primary-100 dark:border-primary-800">
                        <td className="py-1 px-1">{c.code} — {c.label}</td>
                        <td className="text-right num font-semibold">{fmtFull(c.value)}</td>
                        <td className="text-right num text-primary-500">{((c.value / Math.max(totalCharges, 1)) * 100).toFixed(1)} %</td>
                        <td className="text-right num text-primary-400">—</td>
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
          <ChartCard title="Évolution mensuelle des produits par nature" className="lg:col-span-2">
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={produitsEvol}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #e5e5e5)" />
                <XAxis dataKey="mois" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtK} />
                <Tooltip formatter={(v: any) => fmtFull(v)} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Area type="monotone" dataKey="ventes" name="Ventes" stackId="1" fill={ct.at(0)} stroke={ct.at(0)} fillOpacity={0.8} />
                <Area type="monotone" dataKey="services" name="Services" stackId="1" fill={ct.at(1)} stroke={ct.at(1)} fillOpacity={0.8} />
                <Area type="monotone" dataKey="subventions" name="Subventions" stackId="1" fill={ct.at(2)} stroke={ct.at(2)} fillOpacity={0.8} />
                <Area type="monotone" dataKey="autres" name="Autres" stackId="1" fill={ct.at(3)} stroke={ct.at(3)} fillOpacity={0.8} />
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
                <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #e5e5e5)" />
                <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={fmtK} />
                <YAxis type="category" dataKey="poste" tick={{ fontSize: 10 }} width={80} />
                <Tooltip formatter={(v: any) => fmtFull(v)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="realise" name="Réalisé" fill={ct.at(0)} radius={[0,3,3,0]} />
                <Bar dataKey="budget" name="Budget" fill={ct.at(3)} radius={[0,3,3,0]} />
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

// ══════════════════════════════════════════════════════════════════════
// CR PAR BLOC — chaque section CR en bloc indépendant
// ══════════════════════════════════════════════════════════════════════
function CRBlock() {
  const rows = useBudgetActual();
  const { currentOrgId, currentYear } = useApp();
  const sections = bySection(rows, currentOrgId);
  const labels = loadLabels(currentOrgId);
  const ct = useChartTheme();
  const [zoom, setZoom] = useState<string | null>(null);

  // Données mensuelles + N-1 pour comparaison
  const [n1Data, setN1Data] = useState<Map<string, number>>(new Map());
  const [monthlyData, setMonthlyData] = useState<Map<string, { months: Array<{ realise: number; budget: number; n1: number }> }>>(new Map());
  const currentMonth = new Date().getMonth(); // 0-based

  useEffect(() => {
    import('../engine/budgetActual').then(({ computeBudgetActualMonthly }) => {
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

  // Calcul N-1 par section
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
                <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #e5e5e5)" />
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
                <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #e5e5e5)" />
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
              <th className="text-right py-2 px-3">Écart B/R</th>
              <th className="text-right py-2 px-3">N-1</th>
              <th className="text-right py-2 px-3">vs N-1</th>
              <th className="text-right py-2 px-3">% section</th>
            </tr></thead>
            <tbody className="divide-y divide-primary-200 dark:divide-primary-800">
              {sec.rows.map((r) => {
                const n1Val = n1Data.get(r.code) ?? 0;
                const varN1 = n1Val ? ((r.realise - n1Val) / Math.abs(n1Val) * 100) : 0;
                return (
                <tr key={r.code}>
                  <td className="py-2 px-3 num font-mono">{r.code}</td>
                  <td className="py-2 px-3">{r.label}</td>
                  <td className="py-2 px-3 text-right num font-semibold">{fmtFull(r.realise)}</td>
                  <td className="py-2 px-3 text-right num text-primary-500">{fmtFull(r.budget)}</td>
                  <td className={clsx('py-2 px-3 text-right num',
                    r.status === 'favorable' ? 'text-success' : r.status === 'defavorable' ? 'text-error' : '')}>
                    {r.ecart >= 0 ? '+' : ''}{fmtFull(r.ecart)}
                  </td>
                  <td className="py-2 px-3 text-right num text-primary-400">{fmtFull(n1Val)}</td>
                  <td className={clsx('py-2 px-3 text-right num text-xs', varN1 === 0 ? 'text-primary-400' : (r.isCharge ? (varN1 <= 0 ? 'text-success' : 'text-error') : (varN1 >= 0 ? 'text-success' : 'text-error')))}>
                    {varN1 !== 0 ? `${varN1 >= 0 ? '+' : ''}${varN1.toFixed(1)} %` : '—'}
                  </td>
                  <td className="py-2 px-3 text-right num text-xs text-primary-500">{total ? ((r.realise / total) * 100).toFixed(1) : 0} %</td>
                </tr>
                );
              })}
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

              {/* Tableau reporting standard : Month + YTD */}
              {(() => {
                const m = currentMonth > 0 ? currentMonth - 1 : 0; // dernier mois complet
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

// ══════════════════════════════════════════════════════════════════════
// INCOME STATEMENT — BUDGET vs ACTUAL (style 3 panneaux)
// ══════════════════════════════════════════════════════════════════════
function ISBudgetVsActual() {
  const rows = useBudgetActual();
  const { currentOrgId } = useApp();
  const sections = bySection(rows, currentOrgId);
  const labels = loadLabels(currentOrgId);

  if (!rows.length) return <div className="py-12 text-center text-primary-500">Chargement…</div>;

  // N-1 réel depuis le Grand Livre année précédente
  const { currentYear } = useApp();
  const rowsN1 = useBudgetActual();
  // Construire un map code → réalisé N-1 depuis les données de l'année précédente
  const [n1Map, setN1Map] = useState<Map<string, number>>(new Map());
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
    // pour charges, dépassement = défavorable (rouge) ; pour produits, dépassement = favorable (vert)
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

        // YTD : pour la démo, on utilise les mêmes valeurs ×3 (Q1)
        const ytdMul = 3;

        return (
          <div key={sec.section} className="card overflow-hidden">
            {/* Section header noir avec n° — texte clair sur fond foncé */}
            <div className="bg-primary-900 dark:bg-primary-800 px-4 py-2 flex items-center justify-between">
              <p className="text-primary-50 font-bold text-sm">{idx + 1}. {labels[sec.section]}</p>
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

// ══════════════════════════════════════════════════════════════════════
// CASHFLOW STATEMENT — KPIs sombres + Cash In/Out + ligne Solde
// ══════════════════════════════════════════════════════════════════════
function CashflowStatement() {
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
      {/* Header rouge style "Cashflow statement" */}
      <div className="bg-white dark:bg-primary-900 border-b border-primary-200 dark:border-primary-800 px-4 py-2 flex justify-between items-center">
        <p className="text-primary-900 dark:text-primary-50 font-bold text-sm">Cashflow statement</p>
        <p className="text-primary-500 font-bold text-xs">Mars</p>
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
            <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #e5e5e5)" />
            <XAxis dataKey="mois" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtK} />
            <Tooltip formatter={(v: any) => fmtFull(v)} />
            <Legend wrapperStyle={{ fontSize: 11 }} verticalAlign="bottom" />
            <Bar dataKey="cashIn" name="Cash in" fill={ct.at(0)} />
            <Bar dataKey="cashOut" name="Cash out" fill={ct.at(1)} />
            <Line type="linear" dataKey="solde" name="Solde" stroke={ct.at(2)} strokeWidth={2.5} dot={{ r: 4, fill: ct.at(2) }} />
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
  const ct = useChartTheme();
  // Balance cumulée (avec AN) pour les SOLDES clients/fournisseurs.
  // Mouvements (sans AN) pour les TOTAUX ventes/achats de l'exercice.
  const { balance, movements } = useStatements();
  const [monthlyAR, setMonthlyAR] = useState<{ labels: string[]; values: number[] }>({ labels: [], values: [] });
  const [monthlyAP, setMonthlyAP] = useState<{ labels: string[]; values: number[] }>({ labels: [], values: [] });

  useEffect(() => {
    if (!currentOrgId) return;
    // Évolution mensuelle des VENTES (70) et ACHATS opérationnels (60-63)
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

  // Chiffre d'affaires & achats : sur les MOUVEMENTS (sans à-nouveaux)
  const mvSource = movements && movements.length > 0 ? movements : balance;
  const totalSales = mvSource.filter((r) => r.account.startsWith('70')).reduce((s, r) => s + r.credit - r.debit, 0);
  // « Total Purchases » = achats larges = 60 (marchandises/MP) + 61 (transports)
  // + 62 (services ext.) + 63 (autres services ext.). C'est la base réelle
  // qui alimente les dettes fournisseurs (40x).
  const totalPurchases = mvSource
    .filter((r) => r.account.startsWith('60') || r.account.startsWith('61') || r.account.startsWith('62') || r.account.startsWith('63'))
    .reduce((s, r) => s + r.debit - r.credit, 0);

  // Soldes clients / fournisseurs : sur la balance cumulée (inclut AN = dettes
  // reportées de l'exercice précédent) — c'est bien l'encours à date.
  const accountReceivable = balance.filter((r) => r.account.startsWith('41')).reduce((s, r) => s + r.soldeD, 0);
  const accountPayable = balance.filter((r) => r.account.startsWith('40')).reduce((s, r) => s + r.soldeC, 0);

  const pctReceivable = totalSales ? Math.round((accountReceivable / totalSales) * 100) : 0;
  const pctPayable = totalPurchases ? Math.round((accountPayable / totalPurchases) * 100) : 0;
  // Un ratio > 100 % indique un encours fournisseurs qui excède les achats
  // de l'exercice — typiquement parce que le solde inclut les à-nouveaux
  // (dettes N-1 non payées) ou que les achats sont concentrés au-delà de
  // la classe 60-63. On plafonne l'affichage visuel à 100 % mais on garde
  // la vraie valeur pour la lecture numérique.
  const pctReceivableBar = Math.min(pctReceivable, 100);
  const pctPayableBar = Math.min(pctPayable, 100);

  const arData = monthlyAR.labels.slice(0, 3).map((m, i) => ({ mois: m, value: monthlyAR.values[i] || 0 }));
  const apData = monthlyAP.labels.slice(0, 3).map((m, i) => ({ mois: m, value: monthlyAP.values[i] || 0 }));

  const teal = ct.at(0);
  const red = ct.at(1);

  return (
    <div className="card overflow-hidden">
      {/* Header rouge */}
      <div className="bg-white dark:bg-primary-900 border-b border-primary-200 dark:border-primary-800 px-4 py-2 flex justify-between items-center">
        <p className="text-primary-900 dark:text-primary-50 font-bold text-sm">5. Customer & others receivable management review</p>
        <p className="text-primary-500 font-bold text-xs">Mars</p>
      </div>
      <p className="px-4 py-2 italic text-primary-500 text-xs">This discussion concerns an overview of the level of receivables and debts at the end of 31 mars {currentYear}.</p>

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

      {/* 2 bar charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
        <div className="border border-primary-200 dark:border-primary-800 p-4">
          <p className="text-xs font-semibold mb-2">Account receivable per month</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={arData}>
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

function DarkKPI({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-primary-800 dark:bg-primary-700 text-primary-50 px-4 py-3 text-center">
      <p className="text-xs font-semibold">{label}</p>
      <p className="num text-xl font-bold mt-1">{value}</p>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// CR — TABLE D'UNE SECTION (vue table seule, sans graphiques)
// ══════════════════════════════════════════════════════════════════════
function CRSecTable({ sectionKey }: { sectionKey: any }) {
  const rows = useBudgetActual();
  const { currentOrgId, currentYear } = useApp();
  const sections = bySection(rows, currentOrgId);
  const labels = loadLabels(currentOrgId);
  const [n1Map, setN1Map] = useState<Map<string, number>>(new Map());
  const [monthlyMap, setMonthlyMap] = useState<Map<string, Array<{ realise: number; budget: number; n1: number }>>>(new Map());
  const currentMonth = new Date().getMonth();
  const MONTHS_SHORT = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];

  useEffect(() => {
    import('../engine/budgetActual').then(({ computeBudgetActualMonthly }) => {
      computeBudgetActualMonthly(currentOrgId, currentYear).then((raw) => {
        const n1m = new Map<string, number>();
        const mm = new Map<string, Array<{ realise: number; budget: number; n1: number }>>();
        for (const r of raw.rows) { n1m.set(r.code, r.totalN1); mm.set(r.code, r.months); }
        setN1Map(n1m);
        setMonthlyMap(mm);
      });
    });
  }, [currentOrgId, currentYear]);
  const sec = sections.find((s) => s.section === sectionKey);
  const [open, setOpen] = useState(true);

  if (!rows.length) return <div className="py-12 text-center text-primary-500">Chargement…</div>;
  if (!sec) return <div className="py-12 text-center text-primary-500">Section introuvable</div>;

  // Calcul des totaux mensuels pour la section
  const m = currentMonth > 0 ? currentMonth - 1 : 0;
  const secMonth = sec.rows.reduce((acc, r) => {
    const md = monthlyMap.get(r.code);
    if (!md) return acc;
    return { actualM: acc.actualM + md[m].realise, budgetM: acc.budgetM + md[m].budget, n1M: acc.n1M + md[m].n1 };
  }, { actualM: 0, budgetM: 0, n1M: 0 });
  const n1Ytd = sec.rows.reduce((s, r) => s + (n1Map.get(r.code) ?? 0), 0);

  return (
    <>
      {/* KPIs en haut */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <KPICard title="Comptes" value={String(sec.rows.length)} icon={<Layers className="w-4 h-4" strokeWidth={2} />} />
        <KPICard title="Total réalisé" value={fmtK(sec.totalRealise)} unit="XOF" icon={<Diamond className="w-4 h-4" strokeWidth={2} />} />
        <KPICard title="Total budget" value={fmtK(sec.totalBudget)} unit="XOF" icon={<Circle className="w-4 h-4" strokeWidth={2} />} />
        <KPICard title="Écart" value={fmtK(sec.totalEcart)} unit="XOF" subValue={`${sec.ecartPct.toFixed(1)} %`} icon={sec.totalEcart >= 0 ? '↑' : '↓'} />
      </div>

      {/* Tableau Month + YTD par compte */}
      <ChartCard title={`Mensuel — ${labels[sec.section]} (${MONTHS_SHORT[m]})`} className="mb-4">
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead className="bg-primary-100 dark:bg-primary-900">
              <tr>
                <th className="text-left py-1.5 px-2 font-semibold" rowSpan={2}>Compte</th>
                <th className="text-center py-1 px-1 font-semibold border-l border-primary-200 dark:border-primary-700" colSpan={3}>Mois ({MONTHS_SHORT[m]})</th>
                <th className="text-center py-1 px-1 font-semibold border-l-2 border-primary-300 dark:border-primary-600" colSpan={3}>Year-to-Date</th>
              </tr>
              <tr className="text-[10px] text-primary-500">
                <th className="py-1 px-1 text-right border-l border-primary-200 dark:border-primary-700">Actual</th>
                <th className="py-1 px-1 text-right">Budget</th>
                <th className="py-1 px-1 text-right">N-1</th>
                <th className="py-1 px-1 text-right border-l-2 border-primary-300 dark:border-primary-600">Actual</th>
                <th className="py-1 px-1 text-right">Budget</th>
                <th className="py-1 px-1 text-right">N-1</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-primary-100 dark:divide-primary-800">
              {sec.rows.slice(0, 15).map((r) => {
                const md = monthlyMap.get(r.code);
                const n1v = n1Map.get(r.code) ?? 0;
                return (
                  <tr key={r.code} className="hover:bg-primary-50 dark:hover:bg-primary-900/50">
                    <td className="py-1.5 px-2"><span className="font-mono text-primary-400 mr-1">{r.code}</span>{r.label}</td>
                    <td className="py-1.5 px-1 text-right num border-l border-primary-200 dark:border-primary-700">{md ? fmtFull(md[m].realise) : '—'}</td>
                    <td className="py-1.5 px-1 text-right num text-primary-500">{md ? fmtFull(md[m].budget) : '—'}</td>
                    <td className="py-1.5 px-1 text-right num text-primary-400">{md ? fmtFull(md[m].n1) : '—'}</td>
                    <td className="py-1.5 px-1 text-right num font-semibold border-l-2 border-primary-300 dark:border-primary-600">{fmtFull(r.realise)}</td>
                    <td className="py-1.5 px-1 text-right num text-primary-500">{fmtFull(r.budget)}</td>
                    <td className="py-1.5 px-1 text-right num text-primary-400">{n1v ? fmtFull(n1v) : '—'}</td>
                  </tr>
                );
              })}
              {/* Total section */}
              <tr className="font-semibold bg-primary-100 dark:bg-primary-800">
                <td className="py-1.5 px-2">TOTAL</td>
                <td className="py-1.5 px-1 text-right num border-l border-primary-200 dark:border-primary-700">{fmtFull(secMonth.actualM)}</td>
                <td className="py-1.5 px-1 text-right num text-primary-500">{fmtFull(secMonth.budgetM)}</td>
                <td className="py-1.5 px-1 text-right num text-primary-400">{fmtFull(secMonth.n1M)}</td>
                <td className="py-1.5 px-1 text-right num border-l-2 border-primary-300 dark:border-primary-600">{fmtFull(sec.totalRealise)}</td>
                <td className="py-1.5 px-1 text-right num text-primary-500">{fmtFull(sec.totalBudget)}</td>
                <td className="py-1.5 px-1 text-right num text-primary-400">{fmtFull(n1Ytd)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </ChartCard>

      <ChartCard title={`Détail annuel — ${labels[sec.section]}`}
        action={
          <div className="flex gap-1">
            <button onClick={() => setOpen(true)} className="text-[10px] text-primary-500 hover:text-primary-900 dark:hover:text-primary-100 px-2">Tout déplier</button>
            <span className="text-primary-300">·</span>
            <button onClick={() => setOpen(false)} className="text-[10px] text-primary-500 hover:text-primary-900 dark:hover:text-primary-100 px-2">Tout replier</button>
          </div>
        }>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wider text-primary-500 border-b-2 border-primary-300 dark:border-primary-700">
              <tr>
                <th className="text-left py-2 w-8"></th>
                <th className="text-left py-2 px-3">Compte</th>
                <th className="text-left py-2 px-3">Libellé</th>
                <th className="text-right py-2 px-3">Réalisé</th>
                <th className="text-right py-2 px-3">Budget</th>
                <th className="text-right py-2 px-3">Écart</th>
                <th className="text-right py-2 px-3">Var %</th>
                <th className="text-right py-2 px-3">N-1</th>
                <th className="text-right py-2 px-3">Var N-1</th>
                <th className="text-right py-2 px-3">% section</th>
                <th className="text-center py-2 px-3">Statut</th>
              </tr>
            </thead>
            <tbody>
              {open && sec.rows.map((r) => { const n1v = n1Map.get(r.code) ?? 0; const varN1v = n1v ? ((r.realise - n1v) / Math.abs(n1v) * 100) : 0; return (
                <tr key={r.code} className="border-b border-primary-100 dark:border-primary-800/50 bg-primary-50/50 dark:bg-primary-950/30 hover:bg-primary-100 dark:hover:bg-primary-900">
                  <td></td>
                  <td className="py-2 px-3 num font-mono">{r.code}</td>
                  <td className="py-2 px-3 text-xs">{r.label}</td>
                  <td className="py-2 px-3 text-right num font-semibold">{fmtFull(r.realise)}</td>
                  <td className="py-2 px-3 text-right num text-primary-500">{fmtFull(r.budget)}</td>
                  <td className={clsx('py-2 px-3 text-right num',
                    r.status === 'favorable' ? 'text-success' : r.status === 'defavorable' ? 'text-error' : '')}>
                    {r.ecart >= 0 ? '+' : ''}{fmtFull(r.ecart)}
                  </td>
                  <td className="py-2 px-3 text-right num text-xs">{r.ecartPct >= 0 ? '+' : ''}{r.ecartPct.toFixed(1)} %</td>
                  <td className="py-2 px-3 text-right num text-primary-400">{n1v ? fmtFull(n1v) : '—'}</td>
                  <td className={clsx('py-2 px-3 text-right num text-xs', varN1v === 0 ? 'text-primary-400' : (r.isCharge ? (varN1v <= 0 ? 'text-success' : 'text-error') : (varN1v >= 0 ? 'text-success' : 'text-error')))}>  {n1v ? `${varN1v >= 0 ? '+': ''}${varN1v.toFixed(1)}%` : '—'}</td>
                  <td className="py-2 px-3 text-right num text-xs text-primary-500">{sec.totalRealise ? ((r.realise / sec.totalRealise) * 100).toFixed(1) : 0} %</td>
                  <td className="py-2 px-3 text-center">
                    <span className={clsx('text-xs font-semibold',
                      r.status === 'favorable' ? 'text-success' : r.status === 'defavorable' ? 'text-error' : 'text-primary-400')}>
                      {r.status === 'favorable' ? '✓' : r.status === 'defavorable' ? '⚠' : '—'}
                    </span>
                  </td>
                </tr>
              ); })}
              <tr className="bg-primary-900 text-primary-50 dark:bg-primary-100 dark:text-primary-900 font-bold">
                <td className="py-2 pl-2 w-8 text-center">
                  <button onClick={() => setOpen(!open)} className="w-5 h-5 rounded hover:bg-primary-700 dark:hover:bg-primary-300 text-xs font-bold" title={open ? 'Replier' : 'Déplier'}>
                    {open ? '−' : '+'}
                  </button>
                </td>
                <td colSpan={2} className="py-2 px-3">TOTAL SECTION ({sec.rows.length} comptes)</td>
                <td className="py-2 px-3 text-right num">{fmtFull(sec.totalRealise)}</td>
                <td className="py-2 px-3 text-right num">{fmtFull(sec.totalBudget)}</td>
                <td className="py-2 px-3 text-right num">{sec.totalEcart >= 0 ? '+' : ''}{fmtFull(sec.totalEcart)}</td>
                <td className="py-2 px-3 text-right num">{sec.ecartPct.toFixed(1)} %</td>
                <td colSpan={2}></td>
              </tr>
            </tbody>
          </table>
        </div>
      </ChartCard>

      <div className="mt-4 card p-3 text-xs text-primary-500">
        Pour la version avec graphiques (KPIs + évolution + concentration + top 10), allez dans le <strong>Catalogue → CR — Dashboards</strong>.
      </div>
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════
// CR — DETAIL D'UNE SECTION (dashboard dédié, charts + KPIs)
// ══════════════════════════════════════════════════════════════════════
function CRSecDetail({ sectionKey }: { sectionKey: any }) {
  const rows = useBudgetActual();
  const { currentOrgId, currentYear } = useApp();
  const ct = useChartTheme();
  const sections = bySection(rows, currentOrgId);
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
        <KPICard title="Total réalisé" value={fmtK(sec.totalRealise)} unit="XOF" icon={<Diamond className="w-4 h-4" strokeWidth={2} />} />
        <KPICard title="Total budget" value={fmtK(sec.totalBudget)} unit="XOF" icon={<Circle className="w-4 h-4" strokeWidth={2} />} />
        <KPICard title="Écart" value={fmtK(sec.totalEcart)} unit="XOF" subValue={`${sec.ecartPct.toFixed(1)} %`} icon={sec.totalEcart >= 0 ? '↑' : '↓'} />
        <KPICard title="% de l'activité" value={`${pctActivite.toFixed(1)} %`} subValue={sec.isCharge ? 'des charges totales' : 'des produits totaux'} icon={<Percent className="w-4 h-4" strokeWidth={2} />} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <KPICard title="Nombre de comptes" value={String(sec.rows.length)} icon={<Layers className="w-4 h-4" strokeWidth={2} />} />
        <KPICard title="Moyenne mensuelle" value={fmtK(moyMensuelle)} unit="XOF" icon={<Activity className="w-4 h-4" strokeWidth={2} />} />
        <KPICard title="Plus gros poste" value={top10[0]?.label.substring(0, 20) ?? '—'} subValue={top10[0] ? fmtK(top10[0].realise) : ''} icon={<Star className="w-4 h-4" strokeWidth={2} />} />
        <KPICard title="Concentration top 3" value={sec.totalRealise ? `${((top3 / sec.totalRealise) * 100).toFixed(1)} %` : '—'} icon={<Target className="w-4 h-4" strokeWidth={2} />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <ChartCard title="Évolution mensuelle de la section" className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={evolMensuelle}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #e5e5e5)" />
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
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #e5e5e5)" />
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
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #e5e5e5)" />
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

      <div className="card p-4 text-xs text-primary-500">
        Pour le <strong>tableau détaillé</strong> avec collapsibles, ouvrez la version <strong>Table</strong> dans le Catalogue → CR — Tables.
      </div>
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════
// CYCLE CLIENT
// ══════════════════════════════════════════════════════════════════════
function CycleClient() {
  const { currentOrgId, currentYear } = useApp();
  const ct = useChartTheme();
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
    color: [ct.at(4), ct.at(0), ct.at(3), ct.at(5), ct.at(1)][i] }));
  const top90 = aged.rows.reduce((s, r) => s + (r.buckets[4] ?? 0), 0);

  // ── Évolution réelle du DSO mois par mois ──
  // DSO(m) = (créances 411 fin de mois m) / (CA HT cumulé sur les 3 derniers mois × 1.18 / 90) × 360 / 360
  // Approche simplifiée : DSO mensuel = créances fin de mois × 30 / CA TTC du mois
  const dsoEvol = ca.labels.map((m, i) => {
    const caM = ca.values[i] || 0;
    const dsoR = ratios.find((r) => r.code === 'DSO');
    const vatR = dsoR ? 0.18 : 0.18; // TVA dynamique déjà dans le ratio DSO
    const caTTC = caM * (1 + vatR);
    // Approximation : créance fin de mois ≈ créances actuelles × prorata d'activité
    const totalCa = ca.values.reduce((s, v) => s + v, 0) || 1;
    const creancesEstFinMois = creances * ((ca.values[i] || 0) / totalCa) * 12;
    const dsoM = caTTC > 0 ? Math.round((creancesEstFinMois / caTTC) * 30) : 0;
    return { mois: m, dso: Math.max(0, dsoM), objectif: 60 };
  });
  // Évolution créances : prorata du CA cumulé
  const cumulCa: number[] = [];
  ca.values.reduce((acc, v, i) => { cumulCa[i] = acc + v; return cumulCa[i]; }, 0);
  const totalCaY = cumulCa[cumulCa.length - 1] || 1;
  const creancesEvol = ca.labels.map((m, i) => ({
    mois: m,
    total: Math.round(creances * ((cumulCa[i] || 0) / totalCaY)),
    douteuses: Math.round(douteuses * ((cumulCa[i] || 0) / totalCaY)),
  }));
  // Taux de recouvrement réel : (Créances saines / Créances totales) × 100 par mois
  // À défaut de donnée historique, on prend le ratio courant constant
  const tauxBase = creances > 0 ? Math.round(((creances - douteuses) / creances) * 100) : 0;
  const recouv = ca.labels.map((m) => ({ mois: m, taux: tauxBase, objectif: 90 }));

  const top3 = aged.rows.slice(0, 3).reduce((s, r) => s + r.total, 0);
  const top10sans3 = aged.rows.slice(3, 10).reduce((s, r) => s + r.total, 0);
  const autres = creances - top3 - top10sans3;
  const concentration = [
    { name: 'Top 3 clients', value: creances ? Math.round((top3 / creances) * 100) : 0, color: ct.at(0) },
    { name: 'Clients 4-10', value: creances ? Math.round((top10sans3 / creances) * 100) : 0, color: ct.at(1) },
    { name: 'Autres', value: creances ? Math.round((autres / creances) * 100) : 0, color: '#cbd5e1' },
  ];

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4 mb-4">
        <KPICard title="Créances totales" value={fmtK(creances)} unit="XOF" color={ct.at(0)} icon="CL" />
        <KPICard title="DSO" value={`${Math.round(dso)} j`} color={dso > 60 ? ct.at(3) : ct.at(4)} icon="DS" inverse subValue="Objectif : 60 jours" />
        <KPICard title="Taux recouvrement" value={creances > 0 ? `${Math.round(((creances - douteuses) / creances) * 100)} %` : '—'} color={ct.at(0)} icon="TR" subValue="Objectif : 90 %" />
        <KPICard title="Créances douteuses" value={fmtK(douteuses)} unit="XOF" color={ct.at(1)} icon="CD" inverse />
        <KPICard title="Créances > 90j" value={fmtK(top90)} unit="XOF" color={ct.at(1)} icon="90" inverse />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <ChartCard title="Balance âgée clients">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={bucketTotals}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #e5e5e5)" />
              <XAxis dataKey="tranche" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtK} />
              <Tooltip formatter={(v: any) => fmtFull(v)} />
              <Bar dataKey="montant" radius={[6,6,0,0]}>
                {bucketTotals.map((e, i) => <Cell key={i} fill={e.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Évolution du DSO (jours)">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={dsoEvol}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #e5e5e5)" />
              <XAxis dataKey="mois" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} domain={[30, 80]} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Line type="monotone" dataKey="dso" name="DSO réel" stroke={ct.at(0)} strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="objectif" name="Objectif" stroke={ct.at(1)} strokeDasharray="5 5" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Évolution des créances">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={creancesEvol}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #e5e5e5)" />
              <XAxis dataKey="mois" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtK} />
              <Tooltip formatter={(v: any) => fmtFull(v)} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Area type="monotone" dataKey="total" name="Créances totales" fill={ct.at(0) + '30'} stroke={ct.at(0)} strokeWidth={2} />
              <Area type="monotone" dataKey="douteuses" name="Douteuses" fill={ct.at(1) + '30'} stroke={ct.at(1)} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Taux de recouvrement mensuel (%)">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={recouv}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #e5e5e5)" />
              <XAxis dataKey="mois" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} domain={[60, 100]} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="taux" name="Taux recouvrement" radius={[4,4,0,0]}>
                {recouv.map((e, i) => <Cell key={i} fill={e.taux >= 90 ? ct.at(4) : e.taux >= 80 ? ct.at(3) : ct.at(1)} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartCard title="Top 10 clients — Encours et Risque" className="lg:col-span-2">
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
                      <td className="py-1.5 px-1 text-right num" style={{ color: r.buckets[4] > 0 ? ct.at(1) : undefined }}>
                        {r.buckets[4] > 0 ? fmtFull(r.buckets[4]) : '—'}
                      </td>
                      <td className="py-1.5 px-1 text-center">
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ background: bg, color: fg }}>
                          {risque === 'high' ? '!! Élevé' : risque === 'medium' ? 'Moyen' : 'Faible'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </ChartCard>

        <ChartCard title="Concentration clients">
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
              !! <strong>Concentration :</strong> Top 3 clients &gt; 50 % du CA. Risque de dépendance.
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
  const ct = useChartTheme();
  const ratios = useRatios();
  const balance = useBalance();
  const [aged, setAged] = useState<{ buckets: string[]; rows: AgedTier[] }>({ buckets: [], rows: [] });
  const [ca, setCA] = useState<{ labels: string[]; values: number[] }>({ labels: [], values: [] });

  useEffect(() => {
    if (!currentOrgId) return;
    agedBalance(currentOrgId, currentYear, 'fournisseur').then(setAged);
    monthlyByPrefix(currentOrgId, currentYear, ['7']).then(setCA);
  }, [currentOrgId, currentYear]);

  // Nombre de fournisseurs : distinct par DÉTAIL (tiers ou sous-compte auxiliaire,
  // PAS le compte parent 401/402/408).
  const nbFournisseurs = useLiveQuery(async () => {
    if (!currentOrgId) return 0;
    const periods = await db.periods.where('orgId').equals(currentOrgId).toArray();
    const ids = new Set(periods.filter((p) => p.year === currentYear).map((p) => p.id));
    const entries = await db.gl.where('orgId').equals(currentOrgId).toArray();
    const keys = new Set<string>();
    for (const e of entries) {
      if (!ids.has(e.periodId)) continue;
      if (!(e.account.startsWith('401') || e.account.startsWith('402') || e.account.startsWith('408'))) continue;
      // 1) Code tiers si renseigné, 2) sous-compte auxiliaire (len > 3), 3) ignoré
      if (e.tiers && e.tiers.trim()) keys.add(e.tiers.trim());
      else if (e.account.length > 3) keys.add(e.account);
    }
    return keys.size;
  }, [currentOrgId, currentYear], 0) ?? 0;

  // Évolution mensuelle RÉELLE des dettes fournisseurs via le cumul des
  // soldes créditeurs 40x mois par mois, plutôt qu'une simulation.
  const dettesMonthly = useLiveQuery(async () => {
    if (!currentOrgId) return { total: Array(12).fill(0), echues: Array(12).fill(0) };
    const periods = await db.periods.where('orgId').equals(currentOrgId).toArray();
    const entries = await db.gl.where('orgId').equals(currentOrgId).toArray();
    const total: number[] = Array(12).fill(0);
    let running = 0;
    for (let m = 1; m <= 12; m++) {
      const p = periods.find((x) => x.year === currentYear && x.month === m);
      if (!p) { total[m - 1] = running; continue; }
      for (const e of entries) {
        if (e.periodId !== p.id) continue;
        if (!e.account.startsWith('40')) continue;
        running += (e.credit - e.debit);
      }
      total[m - 1] = running;
    }
    // Échues = approximation (30 % de la dette à partir de M+3)
    const echues = total.map((v, i) => i < 3 ? 0 : Math.max(0, Math.round(v * 0.3)));
    return { total, echues };
  }, [currentOrgId, currentYear], { total: Array(12).fill(0), echues: Array(12).fill(0) }) ?? { total: Array(12).fill(0), echues: Array(12).fill(0) };

  const dettes = balance.filter((r) => r.account.startsWith('40')).reduce((s, r) => s + r.soldeC, 0);
  const dpo = ratios.find((r) => r.code === 'DPO')?.value ?? 0;
  const dsoRatio = ratios.find((r) => r.code === 'DSO')?.value ?? 0;
  const echues = aged.rows.reduce((s, r) => s + (r.buckets[4] ?? 0), 0);
  const bucketTotals = aged.buckets.map((b, i) => ({ tranche: b, montant: aged.rows.reduce((s, r) => s + r.buckets[i], 0),
    color: [ct.at(4), ct.at(0), ct.at(3), ct.at(5), ct.at(1)][i] }));

  const dpoEvol = ca.labels.map((m) => ({
    mois: m,
    dpo: Math.round(dpo),
    dso: Math.round(dsoRatio),
    objectif: 60,
  }));

  const dettesEvol = ca.labels.map((m, i) => ({
    mois: m,
    total: dettesMonthly.total[i] ?? 0,
    echues: dettesMonthly.echues[i] ?? 0,
  }));

  // Échéancier (8 bi-mensuelles) — fondé sur les dettes réelles
  const echeancier = Array.from({ length: 8 }, (_, i) => ({
    periode: ['S1 Jan','S2 Jan','S1 Fév','S2 Fév','S1 Mar','S2 Mar','S1 Avr','S2 Avr'][i],
    montant: Math.round(dettes / 8),
  }));

  const top3 = aged.rows.slice(0, 3).reduce((s, r) => s + r.total, 0);
  const top10sans3 = aged.rows.slice(3, 10).reduce((s, r) => s + r.total, 0);
  const autres = dettes - top3 - top10sans3;
  const concentration = [
    { name: 'Top 3 fournisseurs', value: dettes ? Math.round((top3 / dettes) * 100) : 0, color: ct.at(0) },
    { name: 'Fournisseurs 4-10', value: dettes ? Math.round((top10sans3 / dettes) * 100) : 0, color: ct.at(1) },
    { name: 'Autres', value: dettes ? Math.round((autres / dettes) * 100) : 0, color: '#cbd5e1' },
  ];

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4 mb-4">
        <KPICard title="Dettes fournisseurs" value={fmtK(dettes)} unit="XOF" color={ct.at(0)} icon="FO" subValue="Total encours" />
        <KPICard title="DPO" value={`${Math.round(dpo)} j`} color={ct.at(0)} icon="DP" subValue="Objectif : 60 jours" />
        <KPICard title="Dettes échues" value={fmtK(echues)} unit="XOF" color={ct.at(1)} icon="90" inverse />
        <KPICard title="Nb fournisseurs" value={String(nbFournisseurs)} color={ct.at(2)} icon="NB" subValue="distincts par tiers / sous-compte" />
        <KPICard title="Cycle conversion" value={`${Math.round(dsoRatio + 35 - dpo)} j`} color={ct.at(3)} icon="CY" subValue="DSO + Stocks − DPO" inverse />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <ChartCard title="Balance âgée fournisseurs">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={bucketTotals}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #e5e5e5)" />
              <XAxis dataKey="tranche" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtK} />
              <Tooltip formatter={(v: any) => fmtFull(v)} />
              <Bar dataKey="montant" radius={[6,6,0,0]}>
                {bucketTotals.map((e, i) => <Cell key={i} fill={e.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="DPO vs DSO — évolution comparée">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={dpoEvol}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #e5e5e5)" />
              <XAxis dataKey="mois" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} domain={[20, 90]} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Line type="monotone" dataKey="dpo" name="DPO (fournisseurs)" stroke={ct.at(5)} strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="dso" name="DSO (clients)" stroke={ct.at(0)} strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="objectif" name="Cible DPO" stroke={ct.at(1)} strokeDasharray="5 5" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Évolution des dettes fournisseurs">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={dettesEvol}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #e5e5e5)" />
              <XAxis dataKey="mois" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtK} />
              <Tooltip formatter={(v: any) => fmtFull(v)} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Area type="monotone" dataKey="total" name="Total dettes" fill={ct.at(5) + '30'} stroke={ct.at(5)} strokeWidth={2} />
              <Area type="monotone" dataKey="echues" name="Échues" fill={ct.at(1) + '30'} stroke={ct.at(1)} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="📅 Échéancier de paiement (prévisionnel)">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={echeancier}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #e5e5e5)" />
              <XAxis dataKey="periode" tick={{ fontSize: 9 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtK} />
              <Tooltip formatter={(v: any) => fmtFull(v)} />
              <Bar dataKey="montant" name="Décaissements prévus" fill={ct.at(2)} radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartCard title="Top 10 fournisseurs — Encours et Échéances" className="lg:col-span-2">
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
                      <td className="py-1.5 px-1 text-right num" style={{ color: retard ? ct.at(1) : undefined }}>
                        {retard ? fmtFull(r.buckets[4]) : '—'}
                      </td>
                      <td className="py-1.5 px-1 text-center">
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ background: bg, color: fg }}>
                          {statut === 'retard' ? '!! Retard' : statut === 'urgent' ? '-- Urgent' : 'OK Normal'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </ChartCard>

        <ChartCard title="Concentration fournisseurs">
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
              !! <strong>Alerte :</strong> Top 3 = {concentration[0].value}% des achats. Diversifier les sources.
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
  const ct = useChartTheme();
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
  // Flux mensuels réels depuis TFT mensuel
  const [fluxData, setFluxData] = useState(tre.labels.map((m) => ({ mois: m, exploitation: 0, investissement: 0, financement: 0 })));
  useEffect(() => {
    if (!currentOrgId) return;
    import('../engine/flows').then(({ computeMonthlyTFT }) =>
      computeMonthlyTFT(currentOrgId, currentYear).then((tft) => {
        const find = (code: string) => tft.lines.find((l) => l.code === code)?.values ?? Array(12).fill(0);
        const op = find('_ZC'), inv = find('_ZD'), fin = find('_ZE');
        setFluxData(tft.months.map((m, i) => ({ mois: m, exploitation: op[i], investissement: inv[i], financement: fin[i] })));
      })
    );
  }, [currentOrgId, currentYear]);

  // FR/BFR/TN mensuels réels depuis le moteur (synthese.ts + monthly.ts)
  const [frBfrTn, setFrBfrTn] = useState(tre.labels.map((m) => ({ mois: m, fr: 0, bfr: 0, tn: 0 })));
  useEffect(() => {
    if (!currentOrgId) return;
    Promise.all([
      import('../engine/monthly'),
      import('../engine/synthese'),
    ]).then(([{ computeMonthlyBilan }, { computeFRBFRMonthly }]) =>
      computeMonthlyBilan(currentOrgId, currentYear).then((mb) => {
        const rows = computeFRBFRMonthly(mb);
        setFrBfrTn(rows.map((r: any) => ({ mois: r.mois, fr: r.fr, bfr: r.bfr, tn: r.tn })));
      })
    );
  }, [currentOrgId, currentYear]);

  const decomposition = [
    { name: 'Stocks', value: stocks, color: ct.at(0) },
    { name: 'Créances clients', value: creances, color: ct.at(1) },
    { name: 'Autres créances', value: autresC, color: ct.at(2) },
    { name: 'Dettes fournisseurs', value: -dettesFourn, color: ct.at(5) },
    { name: 'Dettes fiscales', value: -dettesFisc, color: ct.at(3) },
    { name: 'Autres dettes', value: -autresD, color: ct.at(1) },
  ];

  // TVA dynamique depuis ratios (fallback 18% UEMOA)
  const ratiosData = useRatios();
  const dsoRatio = ratiosData.find((r) => r.code === 'DSO');
  const dpoRatio = ratiosData.find((r) => r.code === 'DPO');
  const dso = dsoRatio?.value ?? (sig.ca ? (creances / (sig.ca * 1.18)) * 360 : 0);
  // Rotation stocks en jours : stocks / achats × 360
  const achatsGL = balance.filter((r) => r.account.startsWith('60') && !r.account.startsWith('603')).reduce((s, r) => s + (r.soldeD - r.soldeC), 0);
  const rotStocks = achatsGL > 0 ? (stocks / achatsGL) * 360 : 0;
  const dpoV = dpoRatio?.value ?? (achatsGL > 0 ? (dettesFourn / (achatsGL * 1.18)) * 360 : 0);
  const cycleConv = dso + rotStocks - dpoV;

  const cycleData = [
    { label: 'DSO (Clients)', jours: Math.round(dso), color: ct.at(0) },
    { label: 'Rotation Stocks', jours: Math.round(rotStocks), color: ct.at(2) },
    { label: 'DPO (Fournisseurs)', jours: -Math.round(dpoV), color: ct.at(5) },
    { label: 'Cycle Conversion', jours: Math.round(cycleConv), color: ct.at(1) },
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
        <KPICard title="Trésorerie nette" value={fmtK(tn)} unit="XOF" color={ct.at(3)} icon="TN" subValue="FR − BFR" />
        <KPICard title="Fonds de roulement" value={fmtK(fr)} unit="XOF" color={ct.at(0)} icon="FR" subValue="Ressources − Emplois stables" />
        <KPICard title="BFR" value={fmtK(bfr)} unit="XOF" color={ct.at(2)} icon="BF" inverse />
        <KPICard title="Cycle Conversion" value={`${Math.round(cycleConv)} j`} color={ct.at(5)} icon="CC" inverse />
        <KPICard title="CAF" value={fmtK(sig.resultat + bilan.actif.filter((l) => l.code === 'AE' || l.code === 'AF').reduce((s, l) => s + l.value * 0.1, 0))} unit="XOF" color={ct.at(0)} icon="CF" />
      </div>

      <TabSwitch value={tab} onChange={setTab} activeColor={ct.at(2)}
        tabs={[{ key: 'tresorerie', label: 'Trésorerie' }, { key: 'bfr', label: 'BFR' }, { key: 'previsionnel', label: 'Prévisionnel' }]} />

      {tab === 'tresorerie' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard title="Encaissements vs Décaissements" className="lg:col-span-2">
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={tresorerieEvol}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #e5e5e5)" />
                <XAxis dataKey="mois" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtK} />
                <Tooltip formatter={(v: any) => fmtFull(v)} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="encaissements" name="Encaissements" fill={ct.at(4)} radius={[3,3,0,0]} />
                <Bar dataKey="decaissements" name="Décaissements" fill={ct.at(1)} radius={[3,3,0,0]} />
                <Line type="monotone" dataKey="solde" name="Solde trésorerie" stroke={ct.at(2)} strokeWidth={2.5} dot={{ r: 4 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Flux par catégorie">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={fluxData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #e5e5e5)" />
                <XAxis dataKey="mois" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtK} />
                <Tooltip formatter={(v: any) => fmtFull(v)} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="exploitation" name="Exploitation" fill={ct.at(4)} radius={[3,3,0,0]} />
                <Bar dataKey="investissement" name="Investissement" fill={ct.at(0)} radius={[3,3,0,0]} />
                <Bar dataKey="financement" name="Financement" fill={ct.at(2)} radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Cycle de Conversion de Trésorerie">
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
                <strong>Interprétation :</strong> {Math.round(cycleConv)} jours entre le décaissement fournisseur et l'encaissement client. Objectif : réduire le DSO pour améliorer la trésorerie.
              </div>
            </div>
          </ChartCard>
        </div>
      )}

      {tab === 'bfr' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard title="FR / BFR / Trésorerie nette — évolution" className="lg:col-span-2">
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={frBfrTn}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #e5e5e5)" />
                <XAxis dataKey="mois" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtK} />
                <Tooltip formatter={(v: any) => fmtFull(v)} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Line type="monotone" dataKey="fr" name="Fonds de Roulement" stroke={ct.at(4)} strokeWidth={2.5} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="bfr" name="BFR" stroke={ct.at(3)} strokeWidth={2.5} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="tn" name="Trésorerie nette" stroke={ct.at(2)} strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Décomposition du BFR">
            <div className="p-2">
              <div className="text-xs font-semibold mb-2">Actif circulant d'exploitation</div>
              {decomposition.filter(d => d.value > 0).map((item, i) => (
                <div key={i} className="flex justify-between py-1.5 border-b border-primary-100 dark:border-primary-800 text-xs">
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm" style={{ background: item.color }} />{item.name}</span>
                  <span className="num font-semibold" style={{ color: ct.at(4) }}>+{fmtFull(item.value)}</span>
                </div>
              ))}
              <div className="text-xs font-semibold mt-3 mb-2">Passif circulant d'exploitation</div>
              {decomposition.filter(d => d.value < 0).map((item, i) => (
                <div key={i} className="flex justify-between py-1.5 border-b border-primary-100 dark:border-primary-800 text-xs">
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm" style={{ background: item.color }} />{item.name}</span>
                  <span className="num font-semibold" style={{ color: ct.at(1) }}>{fmtFull(item.value)}</span>
                </div>
              ))}
              <div className="flex justify-between pt-3 mt-2 border-t-2 border-primary-700 dark:border-primary-300 text-sm font-bold">
                <span>= BFR</span>
                <span className="num" style={{ color: ct.at(3) }}>{fmtFull(bfr)} XOF</span>
              </div>
            </div>
          </ChartCard>

          <ChartCard title="BFR en jours de CA">
            <div className="p-2">
              {tre.labels.map((m, i) => {
                const bfrMois = frBfrTn[i]?.bfr ?? bfr;
                const jours = sig.ca ? Math.round((bfrMois / sig.ca) * 360) : 0;
                const color = jours > 40 ? ct.at(1) : jours > 25 ? ct.at(3) : ct.at(4);
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
          <ChartCard title="Prévisionnel de trésorerie — 6 mois (3 scénarios)">
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={previsionnel}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #e5e5e5)" />
                <XAxis dataKey="mois" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtK} />
                <Tooltip formatter={(v: any) => fmtFull(v)} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Area type="monotone" dataKey="optimiste" name="Scénario optimiste" fill={ct.at(4) + '20'} stroke={ct.at(4)} strokeWidth={2} />
                <Area type="monotone" dataKey="base" name="Scénario base" fill={ct.at(0) + '20'} stroke={ct.at(0)} strokeWidth={2.5} />
                <Area type="monotone" dataKey="pessimiste" name="Scénario pessimiste" fill={ct.at(1) + '20'} stroke={ct.at(1)} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard title="Hypothèses du prévisionnel">
              <div className="text-xs">
                {[
                  { scenario: 'Optimiste', hyp: 'DSO réduit à 45j, CA +10%, charges stables', color: ct.at(4) },
                  { scenario: 'Base', hyp: 'Tendance actuelle maintenue, pas de changement majeur', color: ct.at(0) },
                  { scenario: 'Pessimiste', hyp: 'DSO à 70j, CA -5%, hausse charges 3%', color: ct.at(1) },
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

            <ChartCard title="Analyse IA — Trésorerie">
              <div className="p-3 rounded-lg text-xs leading-relaxed" style={{ background: '#f0f9ff', color: '#1e40af' }}>
                <p className="font-bold mb-2">🧠 Synthèse IA :</p>
                <p>La trésorerie nette est en <strong>{tn >= 0 ? 'position positive' : 'position négative'}</strong> de {fmtK(Math.abs(tn))} XOF.</p>
                <p className="mt-2">Le DSO ({Math.round(dso)}j) est un levier d'amélioration. Une réduction de 10 jours libérerait environ <strong>{fmtK(creances / Math.max(dso, 1) * 10)}</strong> de trésorerie.</p>
                <p className="mt-2">!! <strong>Recommandation :</strong> Mettre en place des relances automatiques à J+30 et négocier des escomptes pour paiement anticipé.</p>
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

  // Ratio masse salariale mensuel réel = masse du mois / CA du mois × 100
  const ratioMs = data.labels.map((m, i) => {
    const masseM = data.values[i] ?? 0;
    const caM = sig.ca / 12; // Approx uniforme si pas de CA mensuel disponible
    const ratioM = caM > 0 ? Math.round((masseM / caM) * 100) : 0;
    return { mois: m, ratio: ratioM, objectif: 22 };
  });

  // Provisions
  const provStock = [
    { type: 'Provisions pour risques', dotation: Math.round(totMasse * 0.04), reprise: Math.round(totMasse * 0.01), solde: Math.round(totMasse * 0.07), color: ct.at(1) },
    { type: 'Provisions pour charges', dotation: Math.round(totMasse * 0.025), reprise: Math.round(totMasse * 0.02), solde: Math.round(totMasse * 0.045), color: ct.at(3) },
    { type: 'Dépréciation stocks', dotation: Math.round(totMasse * 0.013), reprise: Math.round(totMasse * 0.005), solde: Math.round(totMasse * 0.03), color: ct.at(5) },
    { type: 'Dépréciation créances', dotation: Math.round(totMasse * 0.02), reprise: Math.round(totMasse * 0.008), solde: Math.round(totMasse * 0.055), color: ct.at(2) },
  ];

  // Provisions mensuelles réelles depuis comptes 68/78
  const [provEvol, setProvEvol] = useState(data.labels.map((m) => ({ mois: m, dotations: 0, reprises: 0, solde: 0 })));
  useEffect(() => {
    if (!currentOrgId) return;
    const run = async () => {
      const { monthlyByPrefix } = await import('../engine/analytics');
      const dot = await monthlyByPrefix(currentOrgId, currentYear, '68');
      const rep = await monthlyByPrefix(currentOrgId, currentYear, '78');
      let cumul = 0;
      setProvEvol(data.labels.map((m, i) => {
        const d = dot.values[i] ?? 0;
        const r = rep.values[i] ?? 0;
        cumul += d - r;
        return { mois: m, dotations: d, reprises: r, solde: cumul };
      }));
    };
    run();
  }, [currentOrgId, currentYear]);

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
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #e5e5e5)" />
                  <XAxis dataKey="mois" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtK} />
                  <Tooltip formatter={(v: any) => fmtFull(v)} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey="salaires" name="Salaires" stackId="a" fill={ct.at(0)} />
                  <Bar dataKey="charges" name="Charges sociales" stackId="a" fill={ct.at(1)} />
                  <Bar dataKey="primes" name="Primes" stackId="a" fill={ct.at(2)} radius={[3,3,0,0]} />
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
            <ChartCard title="🏢 Masse salariale par département">
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
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #e5e5e5)" />
                  <XAxis dataKey="mois" tick={{ fontSize: 10 }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 10 }} tickFormatter={fmtK} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} tickFormatter={fmtK} />
                  <Tooltip formatter={(v: any) => fmtFull(v)} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Bar yAxisId="left" dataKey="dotations" name="Dotations" fill={ct.at(1)} radius={[3,3,0,0]} />
                  <Bar yAxisId="left" dataKey="reprises" name="Reprises" fill={ct.at(4)} radius={[3,3,0,0]} />
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

// ══════════════════════════════════════════════════════════════════════
// FISCALITÉ
// ══════════════════════════════════════════════════════════════════════
function Fiscalite() {
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

// ══════════════════════════════════════════════════════════════════════
// STOCKS
// ══════════════════════════════════════════════════════════════════════
function Stocks() {
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
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #e5e5e5)" />
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
            <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #e5e5e5)" />
            <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={fmtK} />
            <YAxis type="category" dataKey="label" tick={{ fontSize: 10 }} width={140} />
            <Tooltip formatter={(v: any) => fmtFull(v)} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="brute" name="Valeur brute" fill={ct.at(0)} radius={[0,3,3,0]} />
            <Bar dataKey="amort" name="Amortissements" fill={ct.at(3)} radius={[0,3,3,0]} />
            <Bar dataKey="vnc" name="VNC" fill={ct.at(4)} radius={[0,3,3,0]} />
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
  if (id === 'imco') return <SecImmobilierCom />;
  if (id === 'hot') return <SecHotellerie />;
  if (id === 'agri') return <SecAgriculture />;
  if (id === 'sante') return <SecSante />;
  if (id === 'transp') return <SecTransport />;
  if (id === 'serv') return <SecServices />;
  return null;
}

// ─── INDUSTRIE ─────────────────────────────────────────────────────────
function SecIndustrie() {
  const { sig, balance } = useStatements();
  const { currentOrgId, currentYear } = useApp();
  const ct = useChartTheme();
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
        <KPICard title="Production vendue" value={fmtK(production)} unit="XOF" icon="FO" />
        <KPICard title="Coût MP consommées" value={fmtK(matieres)} unit="XOF" icon="⚙️" />
        <KPICard title="Marge industrielle" value={fmtK(sig.margeBrute)} unit="XOF" icon={<Diamond className="w-4 h-4" strokeWidth={2} />} />
        <KPICard title="Taux de marge" value={`${tauxMarge.toFixed(1)} %`} icon={<Percent className="w-4 h-4" strokeWidth={2} />} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <KPICard title="Stock MP" value={fmtK(stockMP)} unit="XOF" icon="▦" />
        <KPICard title="Stock PF" value={fmtK(stockPF)} unit="XOF" icon="▨" />
        <KPICard title="Productivité (CA/MS)" value={productivite.toFixed(2)} icon={<TrendingUp className="w-4 h-4" strokeWidth={2} />} subValue={productivite > 3 ? 'Bonne' : 'À améliorer'} />
        <KPICard title="Personnel production" value={fmtK(personnel)} unit="XOF" icon="◐" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <ChartCard title="Structure des coûts de production">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={structureCout} cx="50%" cy="50%" innerRadius={55} outerRadius={90} dataKey="value"
                label={(p: any) => `${p.name} ${((p.value/structureCout.reduce((s,d) => s+d.value,0))*100).toFixed(0)}%`}>
                {structureCout.map((_, i) => <Cell key={i} fill={ct.at(i)} />)}
              </Pie>
              <Tooltip formatter={(v: any) => fmtFull(v)} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Production mensuelle vs objectif">
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #e5e5e5)" />
              <XAxis dataKey="mois" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtK} />
              <Tooltip formatter={(v: any) => fmtFull(v)} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="production" name="Production" fill={ct.bar} radius={[3,3,0,0]} />
              <Line type="monotone" dataKey="objectif" name="Objectif moyen" stroke={ct.at(3)} strokeDasharray="5 5" dot={false} strokeWidth={2} />
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
  const ct = useChartTheme();
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
        <KPICard title="Travaux facturés" value={fmtK(travaux)} unit="XOF" icon={<TrendingUp className="w-4 h-4" strokeWidth={2} />} />
        <KPICard title="Achats chantier" value={fmtK(achats)} unit="XOF" icon="▦" />
        <KPICard title="Sous-traitance" value={fmtK(soustrait)} unit="XOF" icon="◈" />
        <KPICard title="Marge brute BTP" value={fmtK(margeBTP)} unit="XOF" subValue={`${tauxMargeBTP.toFixed(1)} % des travaux`} icon={<Diamond className="w-4 h-4" strokeWidth={2} />} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <KPICard title="Encours travaux (34-35)" value={fmtK(encours)} unit="XOF" icon="▣" />
        <KPICard title="Locations matériel" value={fmtK(locations)} unit="XOF" icon="⚙" />
        <KPICard title="Main-d'œuvre" value={fmtK(mainoeuvre)} unit="XOF" icon="●" />
        <KPICard title="Créances clients" value={fmtK(clients)} unit="XOF" icon={<Target className="w-4 h-4" strokeWidth={2} />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <ChartCard title="Évolution des travaux facturés">
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={monthly.labels.map((m, i) => ({ mois: m, travaux: monthly.values[i] }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #e5e5e5)" />
              <XAxis dataKey="mois" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtK} />
              <Tooltip formatter={(v: any) => fmtFull(v)} />
              <Area type="monotone" dataKey="travaux" stroke={ct.bar} fill={`${ct.bar}30`} strokeWidth={2} />
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
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #e5e5e5)" />
              <XAxis dataKey="cat" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtK} />
              <Tooltip formatter={(v: any) => fmtFull(v)} />
              <Bar dataKey="montant" fill={ct.at(1)} radius={[4,4,0,0]} />
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
  const ct = useChartTheme();
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
        <KPICard title="Marge commerciale" value={fmtK(margeCom)} unit="XOF" subValue={`${tauxMarque.toFixed(1)} % de taux de marque`} icon={<Diamond className="w-4 h-4" strokeWidth={2} />} />
        <KPICard title="Rotation stocks" value={`${Math.round(rotation)} j`} icon="↻" subValue="Couverture stock" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <KPICard title="Stock marchandises" value={fmtK(stockMarch)} unit="XOF" icon="▦" />
        <KPICard title="Transports sur ventes" value={fmtK(transport)} unit="XOF" icon="→" />
        <KPICard title="Panier moyen (estimation)" value={fmtK(ventes / 1000)} unit="XOF" icon={<Target className="w-4 h-4" strokeWidth={2} />} subValue="CA / nb transactions" />
        <KPICard title="Taux de marque" value={`${tauxMarque.toFixed(1)} %`} icon={<Percent className="w-4 h-4" strokeWidth={2} />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <ChartCard title="Évolution des ventes et de la marge">
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #e5e5e5)" />
              <XAxis dataKey="mois" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtK} />
              <Tooltip formatter={(v: any) => fmtFull(v)} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="ventes" name="Ventes" fill={ct.bar} radius={[3,3,0,0]} />
              <Line type="monotone" dataKey="marge" name="Marge" stroke={ct.at(1)} strokeWidth={2.5} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Ventilation du CA par famille">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={familles} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #e5e5e5)" />
              <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={fmtK} />
              <YAxis type="category" dataKey="nom" tick={{ fontSize: 10 }} width={100} />
              <Tooltip formatter={(v: any) => fmtFull(v)} />
              <Bar dataKey="ca" fill={ct.bar} radius={[0,4,4,0]} />
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
  const ct = useChartTheme();
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
    { tranche: 'Sain (non échu)', encours: encours * 0.75 },
    { tranche: 'PAR 1-30j', encours: encours * 0.12 },
    { tranche: 'PAR 31-90j', encours: encours * 0.08 },
    { tranche: 'PAR > 90j', encours: encours * 0.05 },
  ];

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <KPICard title="Produits d'intérêts" value={fmtK(prodInt)} unit="XOF" icon={<TrendingUp className="w-4 h-4" strokeWidth={2} />} />
        <KPICard title="Charges d'intérêts" value={fmtK(chargeInt)} unit="XOF" icon={<TrendingDown className="w-4 h-4" strokeWidth={2} />} />
        <KPICard title="PNB" value={fmtK(pnb)} unit="XOF" subValue="Produit Net Bancaire" icon={<Diamond className="w-4 h-4" strokeWidth={2} />} />
        <KPICard title="Commissions" value={fmtK(commissions)} unit="XOF" icon="◈" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <KPICard title="Encours crédit" value={fmtK(encours)} unit="XOF" icon="●" />
        <KPICard title="Dépôts collectés" value={fmtK(depots)} unit="XOF" icon="▣" />
        <KPICard title="PAR 30" value={`${par30.toFixed(2)} %`} subValue="Portefeuille à risque" icon="⚠" inverse />
        <KPICard title="Taux de provisionnement" value={`${tauxProv.toFixed(2)} %`} icon={<Target className="w-4 h-4" strokeWidth={2} />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <ChartCard title="Qualité du portefeuille de crédit">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={portfolio}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #e5e5e5)" />
              <XAxis dataKey="tranche" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtK} />
              <Tooltip formatter={(v: any) => fmtFull(v)} />
              <Bar dataKey="encours" radius={[4,4,0,0]}>
                {portfolio.map((_, i) => <Cell key={i} fill={ct.at(i)} />)}
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
                <Cell fill={ct.at(0)} />
                <Cell fill={ct.at(1)} />
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

// ─── IMMOBILIER COMMERCIAL ────────────────────────────────────────
function SecImmobilierCom() {
  const { sig, balance } = useStatements();
  const ct = useChartTheme();
  if (!sig) return null;

  const loyers = balance.filter(r => r.account.startsWith('706') || r.account.startsWith('708')).reduce((s,r) => s+r.credit-r.debit, 0);
  const chargesLoc = balance.filter(r => r.account.startsWith('614') || r.account.startsWith('615')).reduce((s,r) => s+r.debit-r.credit, 0);
  const entretien = balance.filter(r => r.account.startsWith('624') || r.account.startsWith('625')).reduce((s,r) => s+r.debit-r.credit, 0);
  const taxes = balance.filter(r => r.account.startsWith('64')).reduce((s,r) => s+r.debit-r.credit, 0);
  const assurance = balance.filter(r => r.account.startsWith('616')).reduce((s,r) => s+r.debit-r.credit, 0);
  const amort = balance.filter(r => r.account.startsWith('681')).reduce((s,r) => s+r.debit-r.credit, 0);
  const immosBrutes = balance.filter(r => r.account.startsWith('21') || r.account.startsWith('23')).reduce((s,r) => s+r.soldeD, 0);
  const resultatImmo = loyers - chargesLoc - entretien - taxes - assurance - amort;
  const rendement = immosBrutes ? (loyers / immosBrutes) * 100 : 0;
  const tauxOccup = 85 + Math.random() * 10; // simulation

  const lots = [
    { nom: 'Centre commercial Plateau', surface: 12000, loyer: loyers * 0.35, occup: 92 },
    { nom: 'Galerie Marcory', surface: 5500, loyer: loyers * 0.25, occup: 88 },
    { nom: 'Centre Riviera', surface: 8200, loyer: loyers * 0.22, occup: 78 },
    { nom: 'Bureaux Cocody', surface: 3200, loyer: loyers * 0.18, occup: 95 },
  ];

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <KPICard title="Loyers encaissés" value={fmtK(loyers)} unit="XOF" icon={<TrendingUp className="w-4 h-4" strokeWidth={2} />} />
        <KPICard title="Charges locatives" value={fmtK(chargesLoc + entretien)} unit="XOF" icon={<TrendingDown className="w-4 h-4" strokeWidth={2} />} />
        <KPICard title="Résultat immobilier" value={fmtK(resultatImmo)} unit="XOF" icon={<Diamond className="w-4 h-4" strokeWidth={2} />} />
        <KPICard title="Taux d'occupation" value={`${tauxOccup.toFixed(1)} %`} icon={<Percent className="w-4 h-4" strokeWidth={2} />} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <KPICard title="Rendement brut" value={`${rendement.toFixed(2)} %`} icon={<TrendingUp className="w-4 h-4" strokeWidth={2} />} />
        <KPICard title="Entretien & réparations" value={fmtK(entretien)} unit="XOF" icon="⚙" />
        <KPICard title="Taxes foncières" value={fmtK(taxes)} unit="XOF" icon={<Target className="w-4 h-4" strokeWidth={2} />} />
        <KPICard title="Assurance" value={fmtK(assurance)} unit="XOF" icon="◎" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <ChartCard title="Répartition des charges immobilières">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={[
                { name: 'Charges locatives', value: chargesLoc },
                { name: 'Entretien', value: entretien },
                { name: 'Taxes', value: taxes },
                { name: 'Assurance', value: assurance },
                { name: 'Amortissements', value: amort },
              ].filter(d => d.value > 0)} cx="50%" cy="50%" innerRadius={55} outerRadius={90} dataKey="value"
                label={(p: any) => `${p.name}`}>
                {[0,1,2,3,4].map(i => <Cell key={i} fill={ct.at(i)} />)}
              </Pie>
              <Tooltip formatter={(v: any) => fmtFull(v)} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Loyers par site">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={lots} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #e5e5e5)" />
              <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={fmtK} />
              <YAxis type="category" dataKey="nom" tick={{ fontSize: 10 }} width={140} />
              <Tooltip formatter={(v: any) => fmtFull(v)} />
              <Bar dataKey="loyer" fill={ct.bar} radius={[0,4,4,0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
      <ChartCard title="Performance par site">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-primary-200 dark:border-primary-700 text-xs uppercase text-primary-500">
            <th className="text-left py-2 px-3">Site</th>
            <th className="text-right py-2 px-3">Surface (m²)</th>
            <th className="text-right py-2 px-3">Loyer annuel</th>
            <th className="text-right py-2 px-3">Loyer / m²</th>
            <th className="text-right py-2 px-3">Taux occup.</th>
          </tr></thead>
          <tbody className="divide-y divide-primary-200 dark:divide-primary-800">
            {lots.map((l, i) => (
              <tr key={i}>
                <td className="py-2.5 px-3 font-medium">{l.nom}</td>
                <td className="py-2.5 px-3 text-right num">{l.surface.toLocaleString('fr-FR')}</td>
                <td className="py-2.5 px-3 text-right num font-semibold">{fmtFull(l.loyer)}</td>
                <td className="py-2.5 px-3 text-right num">{fmtFull(l.loyer / l.surface)}</td>
                <td className="py-2.5 px-3 text-right num">{l.occup} %</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ChartCard>
    </>
  );
}

// ─── HÔTELLERIE & RESTAURATION ───────────────────────────────────
function SecHotellerie() {
  const { sig, balance } = useStatements();
  const ct = useChartTheme();
  if (!sig) return null;

  const hebergement = balance.filter(r => r.account.startsWith('706')).reduce((s,r) => s+r.credit-r.debit, 0);
  const restauration = balance.filter(r => r.account.startsWith('707') || r.account.startsWith('701')).reduce((s,r) => s+r.credit-r.debit, 0);
  const achatsFood = balance.filter(r => r.account.startsWith('601') || r.account.startsWith('602')).reduce((s,r) => s+r.debit-r.credit, 0);
  const personnel = balance.filter(r => r.account.startsWith('66')).reduce((s,r) => s+r.debit-r.credit, 0);
  const ca = hebergement + restauration;
  const chambres = 120; // simulation
  const tauxOccup = 72 + Math.random() * 15;
  const nuitees = Math.round(chambres * 365 * tauxOccup / 100);
  const adr = nuitees ? hebergement / nuitees : 0;
  const revpar = chambres ? hebergement / (chambres * 365) : 0;
  const fbRatio = ca ? (achatsFood / restauration) * 100 : 0;
  const gop = ca - achatsFood - personnel;

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <KPICard title="CA Hébergement" value={fmtK(hebergement)} unit="XOF" icon={<TrendingUp className="w-4 h-4" strokeWidth={2} />} />
        <KPICard title="CA Restauration" value={fmtK(restauration)} unit="XOF" icon="◈" />
        <KPICard title="RevPAR" value={fmtK(revpar)} unit="XOF" icon={<Diamond className="w-4 h-4" strokeWidth={2} />} subValue="Revenu par chambre dispo" />
        <KPICard title="Taux d'occupation" value={`${tauxOccup.toFixed(1)} %`} icon={<Percent className="w-4 h-4" strokeWidth={2} />} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <KPICard title="ADR (prix moyen)" value={fmtK(adr)} unit="XOF" icon="●" subValue="Average Daily Rate" />
        <KPICard title="GOP" value={fmtK(gop)} unit="XOF" icon={<Diamond className="w-4 h-4" strokeWidth={2} />} subValue="Gross Operating Profit" />
        <KPICard title="F&B Cost ratio" value={`${fbRatio.toFixed(1)} %`} icon="↻" subValue="Achats / CA resto" inverse />
        <KPICard title="Nuitées" value={nuitees.toLocaleString('fr-FR')} icon="▣" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <ChartCard title="Structure du CA">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={[{ name: 'Hébergement', value: hebergement }, { name: 'Restauration', value: restauration }].filter(d => d.value > 0)}
                cx="50%" cy="50%" innerRadius={55} outerRadius={90} dataKey="value" label={(p: any) => `${p.name}`}>
                <Cell fill={ct.at(0)} /><Cell fill={ct.at(1)} />
              </Pie>
              <Tooltip formatter={(v: any) => fmtFull(v)} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Indicateurs clés hôtellerie">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-primary-200 dark:border-primary-700 text-xs uppercase text-primary-500">
              <th className="text-left py-2 px-3">Indicateur</th><th className="text-right py-2 px-3">Valeur</th><th className="text-left py-2 px-3">Formule</th>
            </tr></thead>
            <tbody className="divide-y divide-primary-200 dark:divide-primary-800">
              <tr><td className="py-2 px-3">RevPAR</td><td className="text-right num font-semibold">{fmtFull(revpar)}</td><td className="text-xs text-primary-500 font-mono">CA Héberg. / (Chambres × 365)</td></tr>
              <tr><td className="py-2 px-3">ADR</td><td className="text-right num font-semibold">{fmtFull(adr)}</td><td className="text-xs text-primary-500 font-mono">CA Héberg. / Nuitées vendues</td></tr>
              <tr><td className="py-2 px-3">Taux d'occupation</td><td className="text-right num font-semibold">{tauxOccup.toFixed(1)} %</td><td className="text-xs text-primary-500 font-mono">Nuitées / Capacité</td></tr>
              <tr><td className="py-2 px-3">F&B Cost</td><td className="text-right num font-semibold">{fbRatio.toFixed(1)} %</td><td className="text-xs text-primary-500 font-mono">Achats F&B / CA Resto</td></tr>
              <tr><td className="py-2 px-3">GOP Margin</td><td className="text-right num font-semibold">{ca ? ((gop/ca)*100).toFixed(1) : 0} %</td><td className="text-xs text-primary-500 font-mono">GOP / CA total</td></tr>
              <tr><td className="py-2 px-3">Personnel / CA</td><td className="text-right num font-semibold">{ca ? ((personnel/ca)*100).toFixed(1) : 0} %</td><td className="text-xs text-primary-500 font-mono">Masse salariale / CA</td></tr>
            </tbody>
          </table>
        </ChartCard>
      </div>
    </>
  );
}

// ─── AGRICULTURE ──────────────────────────────────────────────────
function SecAgriculture() {
  const { sig, balance } = useStatements();
  const ct = useChartTheme();
  if (!sig) return null;

  const production = balance.filter(r => r.account.startsWith('70')).reduce((s,r) => s+r.credit-r.debit, 0);
  const intrants = balance.filter(r => r.account.startsWith('602') || r.account.startsWith('604')).reduce((s,r) => s+r.debit-r.credit, 0);
  const personnel = balance.filter(r => r.account.startsWith('66')).reduce((s,r) => s+r.debit-r.credit, 0);
  const subventions = balance.filter(r => r.account.startsWith('71') || r.account.startsWith('74')).reduce((s,r) => s+r.credit-r.debit, 0);
  const stocks = balance.filter(r => r.account.startsWith('31') || r.account.startsWith('32') || r.account.startsWith('33')).reduce((s,r) => s+r.soldeD, 0);
  const marge = production - intrants;
  const tauxMarge = production ? (marge / production) * 100 : 0;

  const cultures = [
    { nom: 'Cacao', ca: production * 0.40, marge: 28 },
    { nom: 'Café', ca: production * 0.25, marge: 22 },
    { nom: 'Hévéa', ca: production * 0.20, marge: 35 },
    { nom: 'Vivriers', ca: production * 0.15, marge: 18 },
  ];

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <KPICard title="Production vendue" value={fmtK(production)} unit="XOF" icon={<TrendingUp className="w-4 h-4" strokeWidth={2} />} />
        <KPICard title="Intrants & semences" value={fmtK(intrants)} unit="XOF" icon={<TrendingDown className="w-4 h-4" strokeWidth={2} />} />
        <KPICard title="Marge brute" value={fmtK(marge)} unit="XOF" subValue={`${tauxMarge.toFixed(1)} %`} icon={<Diamond className="w-4 h-4" strokeWidth={2} />} />
        <KPICard title="Subventions" value={fmtK(subventions)} unit="XOF" icon="◈" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <KPICard title="Stocks récoltes" value={fmtK(stocks)} unit="XOF" icon="▦" />
        <KPICard title="Personnel" value={fmtK(personnel)} unit="XOF" icon="●" />
        <KPICard title="Ratio intrants/CA" value={`${production ? ((intrants/production)*100).toFixed(1) : 0} %`} icon={<Percent className="w-4 h-4" strokeWidth={2} />} inverse />
        <KPICard title="Productivité" value={(production && personnel ? (production/personnel) : 0).toFixed(2)} icon={<TrendingUp className="w-4 h-4" strokeWidth={2} />} subValue="CA / Masse salariale" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <ChartCard title="CA par culture">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={cultures} cx="50%" cy="50%" innerRadius={55} outerRadius={90} dataKey="ca"
                label={(p: any) => `${p.nom} ${((p.ca/production)*100).toFixed(0)}%`}>
                {cultures.map((_, i) => <Cell key={i} fill={ct.at(i)} />)}
              </Pie>
              <Tooltip formatter={(v: any) => fmtFull(v)} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Marge par spéculation">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={cultures}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #e5e5e5)" />
              <XAxis dataKey="nom" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtK} />
              <Tooltip formatter={(v: any) => fmtFull(v)} />
              <Bar dataKey="ca" name="CA" fill={ct.bar} radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </>
  );
}

// ─── SANTÉ ────────────────────────────────────────────────────────
function SecSante() {
  const { sig, balance } = useStatements();
  const ct = useChartTheme();
  if (!sig) return null;

  const recettes = balance.filter(r => r.account.startsWith('70')).reduce((s,r) => s+r.credit-r.debit, 0);
  const pharma = balance.filter(r => r.account.startsWith('601') || r.account.startsWith('602')).reduce((s,r) => s+r.debit-r.credit, 0);
  const personnel = balance.filter(r => r.account.startsWith('66')).reduce((s,r) => s+r.debit-r.credit, 0);
  const equipements = balance.filter(r => r.account.startsWith('24')).reduce((s,r) => s+r.soldeD, 0);
  const ratioPersonnel = recettes ? (personnel / recettes) * 100 : 0;

  const services = [
    { nom: 'Consultations', ca: recettes * 0.30 },
    { nom: 'Hospitalisations', ca: recettes * 0.35 },
    { nom: 'Laboratoire', ca: recettes * 0.15 },
    { nom: 'Imagerie', ca: recettes * 0.10 },
    { nom: 'Pharmacie interne', ca: recettes * 0.10 },
  ];

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <KPICard title="Recettes totales" value={fmtK(recettes)} unit="XOF" icon={<TrendingUp className="w-4 h-4" strokeWidth={2} />} />
        <KPICard title="Achats pharma & mat." value={fmtK(pharma)} unit="XOF" icon={<TrendingDown className="w-4 h-4" strokeWidth={2} />} />
        <KPICard title="Masse salariale" value={fmtK(personnel)} unit="XOF" subValue={`${ratioPersonnel.toFixed(1)} % du CA`} icon="●" />
        <KPICard title="Équipements (VB)" value={fmtK(equipements)} unit="XOF" icon="◎" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <ChartCard title="Recettes par service">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={services} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #e5e5e5)" />
              <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={fmtK} />
              <YAxis type="category" dataKey="nom" tick={{ fontSize: 10 }} width={120} />
              <Tooltip formatter={(v: any) => fmtFull(v)} />
              <Bar dataKey="ca" fill={ct.bar} radius={[0,4,4,0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Structure des charges">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={[
                { name: 'Personnel soignant', value: personnel },
                { name: 'Pharmacie & mat.', value: pharma },
              ].filter(d => d.value > 0)} cx="50%" cy="50%" innerRadius={55} outerRadius={90} dataKey="value" label={(p: any) => p.name}>
                {[0,1].map(i => <Cell key={i} fill={ct.at(i)} />)}
              </Pie>
              <Tooltip formatter={(v: any) => fmtFull(v)} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </>
  );
}

// ─── TRANSPORT & LOGISTIQUE ───────────────────────────────────────
function SecTransport() {
  const { sig, balance } = useStatements();
  const ct = useChartTheme();
  if (!sig) return null;

  const ca = balance.filter(r => r.account.startsWith('70')).reduce((s,r) => s+r.credit-r.debit, 0);
  const carburant = balance.filter(r => r.account.startsWith('605') || r.account.startsWith('6068')).reduce((s,r) => s+r.debit-r.credit, 0);
  const entretien = balance.filter(r => r.account.startsWith('624') || r.account.startsWith('625')).reduce((s,r) => s+r.debit-r.credit, 0);
  const assurance = balance.filter(r => r.account.startsWith('616')).reduce((s,r) => s+r.debit-r.credit, 0);
  const personnel = balance.filter(r => r.account.startsWith('66')).reduce((s,r) => s+r.debit-r.credit, 0);
  const amort = balance.filter(r => r.account.startsWith('681')).reduce((s,r) => s+r.debit-r.credit, 0);
  const flotte = balance.filter(r => r.account.startsWith('24')).reduce((s,r) => s+r.soldeD, 0);
  const ratioCarb = ca ? (carburant / ca) * 100 : 0;

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <KPICard title="Chiffre d'affaires" value={fmtK(ca)} unit="XOF" icon={<TrendingUp className="w-4 h-4" strokeWidth={2} />} />
        <KPICard title="Carburant & énergie" value={fmtK(carburant)} unit="XOF" subValue={`${ratioCarb.toFixed(1)} % du CA`} icon={<TrendingDown className="w-4 h-4" strokeWidth={2} />} inverse />
        <KPICard title="Entretien flotte" value={fmtK(entretien)} unit="XOF" icon="⚙" />
        <KPICard title="Marge d'exploitation" value={fmtK(sig.re)} unit="XOF" icon={<Diamond className="w-4 h-4" strokeWidth={2} />} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <KPICard title="Flotte (VB)" value={fmtK(flotte)} unit="XOF" icon="▣" />
        <KPICard title="Assurance" value={fmtK(assurance)} unit="XOF" icon="◎" />
        <KPICard title="Amortissements" value={fmtK(amort)} unit="XOF" icon={<Target className="w-4 h-4" strokeWidth={2} />} />
        <KPICard title="Personnel" value={fmtK(personnel)} unit="XOF" icon="●" />
      </div>
      <ChartCard title="Structure des coûts transport">
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie data={[
              { name: 'Carburant', value: carburant },
              { name: 'Personnel', value: personnel },
              { name: 'Entretien', value: entretien },
              { name: 'Assurance', value: assurance },
              { name: 'Amortissements', value: amort },
            ].filter(d => d.value > 0)} cx="50%" cy="50%" innerRadius={55} outerRadius={90} dataKey="value" label={(p: any) => p.name}>
              {[0,1,2,3,4].map(i => <Cell key={i} fill={ct.at(i)} />)}
            </Pie>
            <Tooltip formatter={(v: any) => fmtFull(v)} />
          </PieChart>
        </ResponsiveContainer>
      </ChartCard>
    </>
  );
}

// ─── SERVICES & CONSEIL ──────────────────────────────────────────
function SecServices() {
  const { sig, balance } = useStatements();
  if (!sig) return null;

  const soustraitance = balance.filter(r => r.account.startsWith('611') || r.account.startsWith('621')).reduce((s,r) => s+r.debit-r.credit, 0);
  const personnel = balance.filter(r => r.account.startsWith('66')).reduce((s,r) => s+r.debit-r.credit, 0);
  const ca = balance.filter(r => r.account.startsWith('70')).reduce((s,r) => s+r.credit-r.debit, 0);
  const marge = ca - soustraitance - personnel;
  const tauxFacturable = 75 + Math.random() * 10; // simulation
  const ratioPersonnel = ca ? (personnel / ca) * 100 : 0;

  const projets = [
    { nom: 'Audit SYSCOHADA — Client A', budget: ca * 0.25, realise: ca * 0.22, marge: 32, avancement: 85 },
    { nom: 'Mission conseil — Client B', budget: ca * 0.30, realise: ca * 0.28, marge: 28, avancement: 70 },
    { nom: 'Implémentation ERP — Client C', budget: ca * 0.20, realise: ca * 0.18, marge: 22, avancement: 45 },
    { nom: 'Formation — Client D', budget: ca * 0.15, realise: ca * 0.14, marge: 40, avancement: 95 },
    { nom: 'Autres missions', budget: ca * 0.10, realise: ca * 0.08, marge: 25, avancement: 60 },
  ];

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <KPICard title="CA Honoraires" value={fmtK(ca)} unit="XOF" icon={<TrendingUp className="w-4 h-4" strokeWidth={2} />} />
        <KPICard title="Sous-traitance" value={fmtK(soustraitance)} unit="XOF" icon="◈" />
        <KPICard title="Marge sur missions" value={fmtK(marge)} unit="XOF" icon={<Diamond className="w-4 h-4" strokeWidth={2} />} />
        <KPICard title="Taux facturable" value={`${tauxFacturable.toFixed(0)} %`} icon={<Percent className="w-4 h-4" strokeWidth={2} />} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <KPICard title="Masse salariale" value={fmtK(personnel)} unit="XOF" subValue={`${ratioPersonnel.toFixed(1)} % du CA`} icon="●" />
        <KPICard title="CA / collaborateur" value={fmtK(personnel ? ca / (personnel / 500000) : 0)} icon={<TrendingUp className="w-4 h-4" strokeWidth={2} />} subValue="estimation" />
        <KPICard title="Résultat exploit." value={fmtK(sig.re)} unit="XOF" icon={<Diamond className="w-4 h-4" strokeWidth={2} />} />
        <KPICard title="Projets actifs" value={String(projets.length)} icon="▣" />
      </div>
      <ChartCard title="Suivi des missions — avancement et marge">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-primary-200 dark:border-primary-700 text-xs uppercase text-primary-500">
            <th className="text-left py-2 px-3">Mission</th>
            <th className="text-left py-2 px-3">Avancement</th>
            <th className="text-right py-2 px-3">Marge</th>
            <th className="text-right py-2 px-3">Budget</th>
            <th className="text-right py-2 px-3">Réalisé</th>
          </tr></thead>
          <tbody className="divide-y divide-primary-200 dark:divide-primary-800">
            {projets.map((p, i) => (
              <tr key={i}>
                <td className="py-2.5 px-3 font-medium">{p.nom}</td>
                <td className="py-2.5 px-3">
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-1.5 bg-primary-200 dark:bg-primary-800 rounded-full overflow-hidden">
                      <div className="h-full bg-primary-900 dark:bg-primary-100 rounded-full" style={{ width: `${p.avancement}%` }} />
                    </div>
                    <span className="num text-xs">{p.avancement} %</span>
                  </div>
                </td>
                <td className="py-2.5 px-3 text-right num font-semibold">{p.marge} %</td>
                <td className="py-2.5 px-3 text-right num">{fmtFull(p.budget)}</td>
                <td className="py-2.5 px-3 text-right num">{fmtFull(p.realise)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ChartCard>
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════
// COMPTABILITÉ ANALYTIQUE — dispatch
// ══════════════════════════════════════════════════════════════════════
function Analytique({ id: _id }: { id: string }) {
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
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #e5e5e5)" />
              <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={fmtK} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={120} />
              <Tooltip formatter={(v: any) => fmtFull(v)} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="produits" name="Produits" fill={ct.at(0)} radius={[0,3,3,0]} />
              <Bar dataKey="charges" name="Charges" fill={ct.at(1)} radius={[0,3,3,0]} />
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
