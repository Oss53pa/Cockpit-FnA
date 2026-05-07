/**
 * demoFixtures.ts — Données HARDCODÉES pour le mode démo.
 *
 * Pourquoi des fixtures plutôt que des écritures GL générées ?
 *   → Permet d'afficher des KPIs visuels INSTANTANÉMENT, sans dépendre de
 *     l'authentification Supabase ni d'un calcul de balance. Les utilisateurs
 *     voient une entreprise « vivante » dès la 1ère seconde de la démo.
 *
 * Activation : la fonction `isDemoActive()` retourne `true` si :
 *   - `localStorage['demo-mode'] === '1'` ET
 *   - `currentOrgId` commence par `demo-org`
 *
 * Les hooks `useFinancials` détectent le flag et retournent ces fixtures
 * au lieu d'interroger le dataProvider.
 */
import type { BalanceRow } from './balance';
import type { SIG, Line } from './statements';
import type { Ratio } from './ratios';
import type { AttentionPoint, ActionPlan, Organization } from '../db/schema';

const Y = new Date().getFullYear();

// ────────────────────────────────────────────────────────────────────
// Détecteur de mode démo (lu en synchrone depuis localStorage)
// ────────────────────────────────────────────────────────────────────
export function isDemoActive(currentOrgId?: string | null): boolean {
  if (typeof window === 'undefined') return false;
  const flag = localStorage.getItem('demo-mode') === '1';
  if (!flag) return false;
  if (currentOrgId === undefined) return true; // flag suffit
  return !!currentOrgId && currentOrgId.startsWith('demo-org');
}

// ────────────────────────────────────────────────────────────────────
// Société démo
// ────────────────────────────────────────────────────────────────────
export const DEMO_ORG: Organization = {
  id: 'demo-org',
  name: 'DEMO INDUSTRIES SA',
  sector: 'Industrie',
  currency: 'XOF',
  rccm: 'CI-ABJ-2020-B-12345',
  ifu: '2020112233445',
  address: 'Boulevard VGE, Abidjan, Côte d\'Ivoire',
  createdAt: Date.now() - 86_400_000 * 365,
} as Organization;

// ────────────────────────────────────────────────────────────────────
// Balance synthétique pré-agrégée — montants réalistes PME industrielle
// (totaux exprimés en FCFA, base 280 M€ de CA annuel)
// ────────────────────────────────────────────────────────────────────
function row(account: string, label: string, solde: number, syscoClass: string): BalanceRow {
  const isDebit = solde > 0;
  return {
    account,
    label,
    syscoCode: account.length >= 3 ? account.substring(0, 3) : account,
    class: syscoClass,
    debit: isDebit ? Math.abs(solde) : 0,
    credit: !isDebit ? Math.abs(solde) : 0,
    solde,
    soldeD: isDebit ? Math.abs(solde) : 0,
    soldeC: !isDebit ? Math.abs(solde) : 0,
  };
}

export const DEMO_BALANCE: BalanceRow[] = [
  // CLASSE 1 — Capitaux propres & dettes financières
  row('101', 'Capital social', -50_000_000, '1'),
  row('111', 'Réserve légale', -5_000_000, '1'),
  row('121', 'Report à nouveau créditeur', -12_500_000, '1'),
  row('162', 'Emprunts bancaires', -25_800_000, '1'),

  // CLASSE 2 — Immobilisations
  row('231', 'Bâtiments industriels', 80_000_000, '2'),
  row('241', 'Matériel industriel', 25_000_000, '2'),
  row('244', 'Matériel informatique', 4_500_000, '2'),
  row('281', 'Amortissements bâtiments', -27_500_000, '2'),

  // CLASSE 3 — Stocks
  row('311', 'Marchandises', 12_400_000, '3'),
  row('321', 'Matières premières', 8_700_000, '3'),

  // CLASSE 4 — Tiers
  row('401', 'Fournisseurs', -38_500_000, '4'),
  row('411', 'Clients', 52_300_000, '4'),
  row('4431', 'État, TVA collectée', -8_100_000, '4'),
  row('4452', 'État, TVA déductible', 6_400_000, '4'),
  row('421', 'Personnel rémunérations dues', -7_200_000, '4'),
  row('431', 'Sécurité sociale', -2_800_000, '4'),
  row('447', 'État impôts retenus', -1_400_000, '4'),

  // CLASSE 5 — Trésorerie
  row('521', 'Banque locale', 18_750_000, '5'),
  row('571', 'Caisse siège', 850_000, '5'),

  // CLASSE 6 — Charges (positif = débiteur, normal)
  row('601', 'Achats de marchandises', 28_500_000, '6'),
  row('602', 'Achats matières premières', 26_200_000, '6'),
  row('611', 'Transports sur achats', 1_850_000, '6'),
  row('622', 'Locations', 14_400_000, '6'),
  row('624', 'Entretien et réparations', 4_200_000, '6'),
  row('625', 'Primes d\'assurances', 2_640_000, '6'),
  row('627', 'Publicité', 3_100_000, '6'),
  row('628', 'Frais télécommunications', 3_360_000, '6'),
  row('631', 'Frais bancaires', 1_020_000, '6'),
  row('641', 'Impôts et taxes', 5_800_000, '6'),
  row('661', 'Rémunérations directes', 102_000_000, '6'),
  row('664', 'Charges sociales', 20_400_000, '6'),
  row('671', 'Intérêts des emprunts', 2_100_000, '6'),
  row('681', 'Dotations aux amortissements', 9_500_000, '6'),

  // CLASSE 7 — Produits (négatif = créditeur, normal)
  row('701', 'Ventes de marchandises', -88_500_000, '7'),
  row('702', 'Ventes de produits finis', -127_300_000, '7'),
  row('706', 'Services vendus', -58_200_000, '7'),
  row('771', 'Intérêts perçus', -350_000, '7'),
];

// ────────────────────────────────────────────────────────────────────
// Soldes Intermédiaires de Gestion (SIG)
// CA = 88,5 + 127,3 + 58,2 = 274 M FCFA
// ────────────────────────────────────────────────────────────────────
const CA_DEMO = 274_000_000;
const ACHATS_CONSO = 28_500_000 + 26_200_000 + 1_850_000;
const VA_DEMO = CA_DEMO - ACHATS_CONSO - (14_400_000 + 4_200_000 + 2_640_000 + 3_100_000 + 3_360_000 + 1_020_000);
const EBE_DEMO = VA_DEMO - (5_800_000 + 102_000_000 + 20_400_000);
const RE_DEMO = EBE_DEMO - 9_500_000; // dotation amortissement
const RF_DEMO = 350_000 - 2_100_000;
const RAO_DEMO = RE_DEMO + RF_DEMO;
const IMPOT_DEMO = Math.round(RAO_DEMO * 0.27); // IS 27 %
const RN_DEMO = RAO_DEMO - IMPOT_DEMO;

export const DEMO_SIG: SIG = {
  ca: CA_DEMO,
  margeBrute: CA_DEMO - ACHATS_CONSO,
  valeurAjoutee: VA_DEMO,
  ebe: EBE_DEMO,
  re: RE_DEMO,
  rf: RF_DEMO,
  rao: RAO_DEMO,
  rhao: 0,
  resultat: RN_DEMO,
  impot: IMPOT_DEMO,
};

// ────────────────────────────────────────────────────────────────────
// CR (Compte de Résultat) — lignes simplifiées
// ────────────────────────────────────────────────────────────────────
export const DEMO_CR: Line[] = [
  { code: 'TA', label: 'Ventes de marchandises', value: 88_500_000 },
  { code: 'TB', label: 'Ventes de produits finis', value: 127_300_000 },
  { code: 'TC', label: 'Services vendus', value: 58_200_000 },
  { code: 'XB', label: 'Chiffre d\'affaires', value: CA_DEMO, total: true },
  { code: 'RA', label: 'Achats consommés', value: -ACHATS_CONSO },
  { code: 'XC', label: 'Marge brute', value: DEMO_SIG.margeBrute, total: true },
  { code: 'XD', label: 'Valeur ajoutée', value: VA_DEMO, total: true },
  { code: 'RH', label: 'Charges de personnel', value: -(102_000_000 + 20_400_000) },
  { code: 'XE', label: 'Excédent brut d\'exploitation', value: EBE_DEMO, total: true },
  { code: 'RK', label: 'Dotations aux amortissements', value: -9_500_000 },
  { code: 'XF', label: 'Résultat d\'exploitation', value: RE_DEMO, total: true },
  { code: 'XH', label: 'Résultat financier', value: RF_DEMO, total: true },
  { code: 'XI', label: 'Résultat des activités ordinaires', value: RAO_DEMO, total: true },
  { code: 'RW', label: 'Impôts sur le résultat', value: -IMPOT_DEMO },
  { code: 'XJ', label: 'Résultat net de l\'exercice', value: RN_DEMO, total: true, grand: true },
];

// ────────────────────────────────────────────────────────────────────
// Bilan synthétique (totaux par grande masse)
// ────────────────────────────────────────────────────────────────────
const ACTIFS_NETS_IMMO = 80_000_000 + 25_000_000 + 4_500_000 - 27_500_000;
const ACTIFS_CIRC = 12_400_000 + 8_700_000 + 52_300_000 + 6_400_000;
const TRESO_ACTIVE = 18_750_000 + 850_000;
const TOTAL_ACTIF = ACTIFS_NETS_IMMO + ACTIFS_CIRC + TRESO_ACTIVE;

export const DEMO_BILAN = {
  actif: [
    { code: 'AD', label: 'Immobilisations corporelles nettes', value: ACTIFS_NETS_IMMO, total: true },
    { code: 'BA', label: 'Stocks', value: 21_100_000 },
    { code: 'BB', label: 'Créances clients', value: 52_300_000 },
    { code: 'BG', label: 'TVA déductible', value: 6_400_000 },
    { code: 'BJ', label: 'Trésorerie active', value: TRESO_ACTIVE, total: true },
    { code: 'BZ', label: 'Total actif', value: TOTAL_ACTIF, grand: true },
  ] as Line[],
  passif: [
    { code: 'CA', label: 'Capital social', value: 50_000_000 },
    { code: 'CD', label: 'Réserves', value: 5_000_000 },
    { code: 'CE', label: 'Report à nouveau', value: 12_500_000 },
    { code: 'CL', label: 'Résultat net de l\'exercice', value: RN_DEMO },
    { code: 'CP', label: 'Capitaux propres', value: 50_000_000 + 5_000_000 + 12_500_000 + RN_DEMO, total: true },
    { code: 'DA', label: 'Emprunts bancaires', value: 25_800_000 },
    { code: 'DJ', label: 'Dettes fournisseurs', value: 38_500_000 },
    { code: 'DK', label: 'Dettes fiscales', value: 8_100_000 + 1_400_000 },
    { code: 'DL', label: 'Dettes sociales', value: 7_200_000 + 2_800_000 },
    { code: 'DZ', label: 'Total passif', value: TOTAL_ACTIF, grand: true },
  ] as Line[],
  totalActif: TOTAL_ACTIF,
  totalPassif: TOTAL_ACTIF,
  unclassifiedAccounts: [] as never[],
};

// ────────────────────────────────────────────────────────────────────
// Ratios clés (simplifiés)
// ────────────────────────────────────────────────────────────────────
export const DEMO_RATIOS: Ratio[] = [
  {
    code: 'MN', label: 'Marge nette', family: 'Rentabilité',
    value: (RN_DEMO / CA_DEMO) * 100, unit: '%', target: 5,
    status: 'good', formula: 'RN / CA × 100',
  },
  {
    code: 'EBE', label: 'Taux d\'EBE', family: 'Rentabilité',
    value: (EBE_DEMO / CA_DEMO) * 100, unit: '%', target: 8,
    status: 'good', formula: 'EBE / CA × 100',
  },
  {
    code: 'AUTO', label: 'Autonomie financière', family: 'Structure',
    value: ((50_000_000 + 5_000_000 + 12_500_000 + RN_DEMO) / TOTAL_ACTIF) * 100,
    unit: '%', target: 30, status: 'good',
    formula: 'CP / Total actif × 100',
  },
  {
    code: 'LIQ', label: 'Liquidité générale', family: 'Liquidité',
    value: (ACTIFS_CIRC + TRESO_ACTIVE) / (38_500_000 + 9_500_000 + 10_000_000),
    unit: 'x', target: 1.5, status: 'good',
    formula: '(AC + Tréso) / DCT',
  },
];

// ────────────────────────────────────────────────────────────────────
// CA mensuel — saisonnalité réaliste (décembre +40 %)
// ────────────────────────────────────────────────────────────────────
export const DEMO_MONTHLY_CA: { month: number; label: string; value: number }[] = [
  { month: 1, label: 'Jan', value: 17_000_000 },
  { month: 2, label: 'Fév', value: 19_500_000 },
  { month: 3, label: 'Mar', value: 21_000_000 },
  { month: 4, label: 'Avr', value: 20_200_000 },
  { month: 5, label: 'Mai', value: 22_300_000 },
  { month: 6, label: 'Juin', value: 23_100_000 },
  { month: 7, label: 'Juil', value: 21_900_000 },
  { month: 8, label: 'Août', value: 18_400_000 },
  { month: 9, label: 'Sept', value: 24_500_000 },
  { month: 10, label: 'Oct', value: 26_800_000 },
  { month: 11, label: 'Nov', value: 25_300_000 },
  { month: 12, label: 'Déc', value: 34_000_000 },
];

// ────────────────────────────────────────────────────────────────────
// Points d'attention / alertes
// ────────────────────────────────────────────────────────────────────
const NOW = Date.now();
export const DEMO_ATTENTION_POINTS: AttentionPoint[] = [
  {
    orgId: 'demo-org', title: 'Solde Client OMEGA en dépassement (>90 jours)',
    description: 'Le client 411004 OMEGA SARL présente un solde débiteur > 8M FCFA dont une partie ancienne de plus de 90 jours.',
    severity: 'high', probability: 'high', category: 'Financier', source: '411004',
    detectedAt: NOW - 86_400_000 * 10, status: 'open',
    estimatedFinancialImpact: 8_500_000,
    rootCause: 'Pas de relance automatisée en place',
    recommendation: 'Mettre en place un échéancier de relance + provision pour créance douteuse',
    tags: ['recouvrement', 'BFR'],
  },
  {
    orgId: 'demo-org', title: 'Charges externes en hausse vs N-1 (+18%)',
    description: 'Les charges du compte 622 (locations) ont augmenté de 18% sans explication claire.',
    severity: 'medium', probability: 'medium', category: 'Comptable', source: '622',
    detectedAt: NOW - 86_400_000 * 5, status: 'in_progress',
    recommendation: 'Auditer les nouveaux contrats de location signés en début d\'exercice',
    tags: ['charges'],
  },
  {
    orgId: 'demo-org', title: 'Trésorerie tendue prévue en M+2',
    description: 'Projection de trésorerie négative dans 60 jours sans encaissement majeur.',
    severity: 'critical', probability: 'medium', category: 'Trésorerie', source: '521',
    detectedAt: NOW - 86_400_000, status: 'escalated',
    estimatedFinancialImpact: -3_200_000,
    recommendation: 'Négocier une ligne de crédit court terme + accélérer recouvrement',
    tags: ['cash', 'forecast'],
  },
  {
    orgId: 'demo-org', title: 'Écart budget vs réalisé sur ventes (-12%)',
    description: 'Les ventes du dernier trimestre sont 12% sous le budget V1 initial.',
    severity: 'medium', probability: 'high', category: 'Performance', source: '70',
    detectedAt: NOW - 86_400_000 * 7, status: 'open',
    recommendation: 'Réviser le forecast avec une nouvelle version V2',
    tags: ['budget', 'CA'],
  },
];

// ────────────────────────────────────────────────────────────────────
// Plans d'action
// ────────────────────────────────────────────────────────────────────
export const DEMO_ACTION_PLANS: ActionPlan[] = [
  {
    orgId: 'demo-org',
    title: 'Mettre en place une procédure de relance clients',
    description: 'Définir J+15 / J+30 / J+45 + lettrage automatique mensuel',
    owner: 'DAF', team: 'Comptabilité', sponsor: 'DG',
    startDate: `${Y}-01-15`, dueDate: `${Y}-06-30`,
    priority: 'high', status: 'doing', progress: 35,
    budgetAllocated: 500_000,
    deliverables: 'Procédure rédigée + 3 templates emails + tableau de bord recouvrement',
    successCriteria: 'DSO réduit de 20 jours sous 6 mois',
    tags: ['recouvrement'],
    createdAt: NOW - 86_400_000 * 60, updatedAt: NOW - 86_400_000 * 2,
  },
  {
    orgId: 'demo-org',
    title: 'Négocier ligne de crédit court terme',
    owner: 'DG', team: 'Direction', sponsor: 'Conseil',
    dueDate: `${Y}-04-30`,
    priority: 'critical', status: 'todo', progress: 0,
    deliverables: 'Convention de découvert 15M FCFA',
    tags: ['trésorerie'],
    createdAt: NOW - 86_400_000, updatedAt: NOW - 86_400_000,
  },
  {
    orgId: 'demo-org',
    title: 'Élaborer un forecast révisé V2',
    owner: 'Contrôleur de gestion', team: 'Finance',
    dueDate: `${Y}-05-15`,
    priority: 'medium', status: 'todo', progress: 0,
    deliverables: 'Budget V2 saisi dans Cockpit + note d\'analyse écart',
    tags: ['budget', 'forecast'],
    createdAt: NOW - 86_400_000 * 6, updatedAt: NOW - 86_400_000 * 6,
  },
];

// ────────────────────────────────────────────────────────────────────
// Imports de log (faux historique)
// ────────────────────────────────────────────────────────────────────
export const DEMO_IMPORTS = [
  {
    id: 1, orgId: 'demo-org', date: NOW - 86_400_000 * 3, user: 'DEMO',
    fileName: 'demo-data.json', source: 'Démo intégrée', kind: 'GL' as const,
    count: 2_534, rejected: 0, status: 'success' as const,
    report: '{"source":"demoSeed"}',
  },
];

// ────────────────────────────────────────────────────────────────────
// Périodes (12 mois exercice courant)
// ────────────────────────────────────────────────────────────────────
const monthLabels = ['', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
export const DEMO_PERIODS = Array.from({ length: 12 }, (_, i) => ({
  id: `p-demo-${Y}-${i + 1}`,
  orgId: 'demo-org',
  fiscalYearId: `fy-demo-${Y}`,
  year: Y, month: i + 1, label: `${monthLabels[i + 1]} ${Y}`, closed: false,
}));
