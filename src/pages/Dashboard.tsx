/* eslint-disable @typescript-eslint/no-explicit-any -- interop dynamique (parsers, payloads Supabase/Edge Functions, helpers Recharts). À typer finement au cas par cas. */
import { Download } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { DashHeader } from '../components/ui/DashHeader';
import { DashboardTopBar } from '../components/ui/DashboardTopBar';
import { useCurrentOrg } from '../hooks/useFinancials';
import { useChartTheme } from '../lib/chartTheme';
import { useApp } from '../store/app';

import { ChargesProduits } from './Dashboard/ChargesProduits';
import { CRBlock } from './Dashboard/CRBlock';
import { ISBudgetVsActual, CashflowStatement, ReceivablesReview } from './Dashboard/ISBvA';
import { CRSecTable, CRSecDetail } from './Dashboard/CRTable';
import { CycleClient, CycleFournisseur } from './Dashboard/Tiers';
import { TresorerieBFR } from './Dashboard/Tresorerie';
import { MasseSalariale, Fiscalite, Stocks, Immobilisations } from './Dashboard/Ressources';
import { Sectoral } from './Dashboard/SectorialB';
import { Analytique } from './Dashboard/Analytique';

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
