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
import { safeLocalStorage } from '../lib/safeStorage';
import type { BalanceRow } from './balance';
import type { SIG, Line } from './statements';
import type { Ratio } from './ratios';
import type { AttentionPoint, ActionPlan, Organization, Account, GLTiersEntry } from '../db/schema';

const Y = new Date().getFullYear();

// ────────────────────────────────────────────────────────────────────
// Détecteur de mode démo (lu en synchrone depuis localStorage)
// ────────────────────────────────────────────────────────────────────
export function isDemoActive(currentOrgId?: string | null): boolean {
  if (typeof window === 'undefined') return false;
  const flag = safeLocalStorage.getItem('demo-mode') === '1';
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
  {
    id: 2, orgId: 'demo-org', date: NOW - 86_400_000 * 2, user: 'DEMO',
    fileName: 'gl-tiers-demo.csv', source: 'Démo intégrée', kind: 'TIERS' as const,
    count: 9, rejected: 0, status: 'success' as const,
    report: '{"source":"demoSeed"}',
  },
];

// ────────────────────────────────────────────────────────────────────
// Grand Livre Tiers (livre auxiliaire) — échantillon : clients & fournisseurs
// Alimente directement la balance auxiliaire en mode démo.
// ────────────────────────────────────────────────────────────────────
const tiersRow = (
  account: string, codeTiers: string, labelTiers: string,
  debit: number, credit: number, category: GLTiersEntry['category'],
  m = 3, piece = '',
): Omit<GLTiersEntry, 'id'> => ({
  orgId: 'demo-org', importId: 2,
  date: `${Y}-${String(m).padStart(2, '0')}-15`,
  account, codeTiers, labelTiers, label: labelTiers,
  debit, credit, journal: category === 'client' ? 'VT' : 'AC', piece,
  category, createdAt: NOW,
});

export const DEMO_GL_TIERS: Omit<GLTiersEntry, 'id'>[] = [
  // Clients (411) — soldes débiteurs
  tiersRow('411100', 'CLI001', 'SONABEL SA', 18_500_000, 6_000_000, 'client', 2, 'FV-1042'),
  tiersRow('411100', 'CLI002', 'ONEA', 12_300_000, 4_500_000, 'client', 3, 'FV-1067'),
  tiersRow('411100', 'CLI003', 'Groupe Bolloré', 9_800_000, 9_800_000, 'client', 3, 'FV-1071'),
  tiersRow('411100', 'CLI004', 'CFAO Motors', 7_200_000, 2_000_000, 'client', 4, 'FV-1090'),
  tiersRow('411100', 'CLI005', 'Brakina', 4_600_000, 4_600_000, 'client', 4, 'FV-1101'),
  // Fournisseurs (401) — soldes créditeurs
  tiersRow('401100', 'FRN042', 'Total Energies', 1_500_000, 8_900_000, 'fournisseur', 2, 'FA-3301'),
  tiersRow('401100', 'FRN043', 'Orange Burkina', 800_000, 5_400_000, 'fournisseur', 3, 'FA-3312'),
  tiersRow('401100', 'FRN044', 'SODIGAZ', 0, 3_200_000, 'fournisseur', 3, 'FA-3320'),
  tiersRow('401100', 'FRN045', 'Maersk Line', 1_200_000, 2_700_000, 'fournisseur', 4, 'FA-3340'),
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

// ────────────────────────────────────────────────────────────────────
// Bilan mensuel — 12 snapshots cumulés (croissance progressive)
// ────────────────────────────────────────────────────────────────────
const MONTHS_SHORT = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];

function spread(baseAnnual: number, profile?: number[]): number[] {
  // Profile par défaut : croissance linéaire jusqu'au YTD final
  if (profile) return profile.map((p) => Math.round(baseAnnual * p));
  return MONTHS_SHORT.map((_, i) => Math.round(baseAnnual * (i + 1) / 12));
}

// Profile plus réaliste pour les bilans (varient mois par mois sans linéaire pur)
const PROFILE_BS_GROWTH = [0.55, 0.62, 0.68, 0.72, 0.76, 0.80, 0.83, 0.85, 0.89, 0.93, 0.97, 1.00];
const PROFILE_BS_STABLE = [0.95, 0.96, 0.97, 0.97, 0.98, 0.98, 0.99, 0.99, 1.00, 1.00, 1.00, 1.00];

export const DEMO_MONTHLY_BILAN = {
  months: MONTHS_SHORT,
  actif: [
    {
      code: 'AD', label: 'Immobilisations corporelles nettes',
      values: spread(ACTIFS_NETS_IMMO, PROFILE_BS_STABLE),
      ytd: ACTIFS_NETS_IMMO, total: true,
    },
    { code: 'BA', label: 'Stocks', values: spread(21_100_000, PROFILE_BS_GROWTH), ytd: 21_100_000 },
    { code: 'BB', label: 'Créances clients', values: spread(52_300_000, PROFILE_BS_GROWTH), ytd: 52_300_000 },
    { code: 'BG', label: 'TVA déductible', values: spread(6_400_000, PROFILE_BS_GROWTH), ytd: 6_400_000 },
    {
      code: 'BJ', label: 'Trésorerie active',
      values: spread(TRESO_ACTIVE, PROFILE_BS_GROWTH), ytd: TRESO_ACTIVE, total: true,
    },
    {
      code: 'BZ', label: 'Total actif',
      values: spread(TOTAL_ACTIF, PROFILE_BS_GROWTH), ytd: TOTAL_ACTIF, grand: true,
    },
  ],
  passif: [
    { code: 'CA', label: 'Capital social', values: spread(50_000_000, PROFILE_BS_STABLE), ytd: 50_000_000 },
    { code: 'CD', label: 'Réserves', values: spread(5_000_000, PROFILE_BS_STABLE), ytd: 5_000_000 },
    { code: 'CE', label: 'Report à nouveau', values: spread(12_500_000, PROFILE_BS_STABLE), ytd: 12_500_000 },
    {
      code: 'CL', label: 'Résultat net',
      values: MONTHS_SHORT.map((_, i) => Math.round(RN_DEMO * (i + 1) / 12)),
      ytd: RN_DEMO,
    },
    {
      code: 'CP', label: 'Capitaux propres',
      values: MONTHS_SHORT.map((_, i) => Math.round((50_000_000 + 5_000_000 + 12_500_000) * PROFILE_BS_STABLE[i] + RN_DEMO * (i + 1) / 12)),
      ytd: 50_000_000 + 5_000_000 + 12_500_000 + RN_DEMO,
      total: true,
    },
    { code: 'DA', label: 'Emprunts bancaires', values: spread(25_800_000, [1.07, 1.06, 1.05, 1.04, 1.03, 1.02, 1.01, 1.00, 0.99, 0.98, 0.97, 1.00]), ytd: 25_800_000 },
    { code: 'DJ', label: 'Dettes fournisseurs', values: spread(38_500_000, PROFILE_BS_GROWTH), ytd: 38_500_000 },
    { code: 'DK', label: 'Dettes fiscales', values: spread(9_500_000, PROFILE_BS_GROWTH), ytd: 9_500_000 },
    { code: 'DL', label: 'Dettes sociales', values: spread(10_000_000, PROFILE_BS_GROWTH), ytd: 10_000_000 },
    {
      code: 'DZ', label: 'Total passif',
      values: spread(TOTAL_ACTIF, PROFILE_BS_GROWTH), ytd: TOTAL_ACTIF, grand: true,
    },
  ],
};

// ────────────────────────────────────────────────────────────────────
// CR mensuel — 12 mois de produits/charges
// ────────────────────────────────────────────────────────────────────
const MONTHLY_PROFILE_CA = [
  17_000_000, 19_500_000, 21_000_000, 20_200_000, 22_300_000, 23_100_000,
  21_900_000, 18_400_000, 24_500_000, 26_800_000, 25_300_000, 34_000_000,
];
function pctOfCa(annualBase: number) {
  const totalCA = MONTHLY_PROFILE_CA.reduce((s, v) => s + v, 0);
  return MONTHLY_PROFILE_CA.map((m) => Math.round((m / totalCA) * annualBase));
}
const MONTHLY_ACHATS = pctOfCa(ACHATS_CONSO);
const MONTHLY_AUTRES_CHARGES = pctOfCa(14_400_000 + 4_200_000 + 2_640_000 + 3_100_000 + 3_360_000 + 1_020_000);
const MONTHLY_PERSONNEL = MONTHS_SHORT.map(() => Math.round((102_000_000 + 20_400_000) / 12));
const MONTHLY_DOTATIONS = MONTHS_SHORT.map(() => Math.round(9_500_000 / 12));
const MONTHLY_INTERETS = MONTHS_SHORT.map(() => Math.round(2_100_000 / 12));
const MONTHLY_IMPOT = MONTHS_SHORT.map((_, i) => i === 11 ? IMPOT_DEMO : 0);

const monthlyEbe = MONTHS_SHORT.map((_, i) =>
  MONTHLY_PROFILE_CA[i] - MONTHLY_ACHATS[i] - MONTHLY_AUTRES_CHARGES[i] - MONTHLY_PERSONNEL[i],
);
const monthlyRn = MONTHS_SHORT.map((_, i) =>
  monthlyEbe[i] - MONTHLY_DOTATIONS[i] - MONTHLY_INTERETS[i] - MONTHLY_IMPOT[i],
);

function ytd(arr: number[]) {
  return arr.reduce((s, v) => s + v, 0);
}

export const DEMO_MONTHLY_CR = {
  months: MONTHS_SHORT,
  lines: [
    { code: 'CA', label: 'Chiffre d\'affaires', values: MONTHLY_PROFILE_CA, ytd: ytd(MONTHLY_PROFILE_CA), total: true },
    { code: 'ACH', label: 'Achats consommés', values: MONTHLY_ACHATS, ytd: ytd(MONTHLY_ACHATS), isCharge: true },
    { code: 'AUT', label: 'Autres charges externes', values: MONTHLY_AUTRES_CHARGES, ytd: ytd(MONTHLY_AUTRES_CHARGES), isCharge: true },
    { code: 'PERS', label: 'Charges de personnel', values: MONTHLY_PERSONNEL, ytd: ytd(MONTHLY_PERSONNEL), isCharge: true },
    { code: 'EBE', label: 'EBE', values: monthlyEbe, ytd: ytd(monthlyEbe), total: true, intermediate: true },
    { code: 'DOT', label: 'Dotations amortissements', values: MONTHLY_DOTATIONS, ytd: ytd(MONTHLY_DOTATIONS), isCharge: true },
    { code: 'INT', label: 'Charges financières', values: MONTHLY_INTERETS, ytd: ytd(MONTHLY_INTERETS), isCharge: true },
    { code: 'IS', label: 'Impôts sur les bénéfices', values: MONTHLY_IMPOT, ytd: ytd(MONTHLY_IMPOT), isCharge: true },
    { code: 'RN', label: 'Résultat net', values: monthlyRn, ytd: ytd(monthlyRn), grand: true },
  ],
};

// ────────────────────────────────────────────────────────────────────
// TFT (Tableau Flux de Trésorerie) — synthétique
// ────────────────────────────────────────────────────────────────────
export const DEMO_TFT = {
  fluxOperationnel: RN_DEMO + 9_500_000 + 2_500_000, // RN + dotations + var BFR
  fluxInvestissement: -3_500_000,
  fluxFinancement: -4_200_000,
  variationTreso: (RN_DEMO + 9_500_000 + 2_500_000) - 3_500_000 - 4_200_000,
  tresoOuverture: 22_500_000,
  tresoCloture: TRESO_ACTIVE,
  lines: [
    { code: 'CAF', label: 'Capacité d\'autofinancement', value: RN_DEMO + 9_500_000 },
    { code: 'BFR', label: 'Variation du BFR', value: 2_500_000 },
    { code: 'FOP', label: 'Flux opérationnels', value: RN_DEMO + 9_500_000 + 2_500_000, total: true },
    { code: 'FINV', label: 'Flux d\'investissement', value: -3_500_000, total: true },
    { code: 'FFIN', label: 'Flux de financement', value: -4_200_000, total: true },
    { code: 'VAR', label: 'Variation de trésorerie', value: (RN_DEMO + 9_500_000 + 2_500_000) - 3_500_000 - 4_200_000, grand: true },
  ],
};

export const DEMO_MONTHLY_TFT = {
  months: MONTHS_SHORT,
  lines: [
    { code: 'FOP', label: 'Flux opérationnels', values: MONTHS_SHORT.map((_, i) => Math.round((RN_DEMO + 9_500_000 + 2_500_000) / 12 * (1 + (i % 3) * 0.1))), ytd: RN_DEMO + 9_500_000 + 2_500_000 },
    { code: 'FINV', label: 'Flux d\'investissement', values: MONTHS_SHORT.map((_, i) => i === 5 ? -2_000_000 : i === 9 ? -1_500_000 : 0), ytd: -3_500_000 },
    { code: 'FFIN', label: 'Flux de financement', values: MONTHS_SHORT.map(() => -350_000), ytd: -4_200_000 },
  ],
};

// TAFIRE — placeholder synthétique
export const DEMO_TAFIRE = {
  ressources: [
    { code: 'CAF', label: 'Capacité d\'autofinancement', value: RN_DEMO + 9_500_000 },
    { code: 'CESS', label: 'Cessions d\'immobilisations', value: 0 },
    { code: 'SUBV', label: 'Subventions reçues', value: 0 },
  ],
  emplois: [
    { code: 'INV', label: 'Investissements', value: 3_500_000 },
    { code: 'REMB', label: 'Remboursements emprunts', value: 4_200_000 },
  ],
  total: { ressources: RN_DEMO + 9_500_000, emplois: 7_700_000, ecart: (RN_DEMO + 9_500_000) - 7_700_000 },
};

// Variation des capitaux propres
export const DEMO_CAPITAL_VAR = [
  { libelle: 'Solde à l\'ouverture', capital: 50_000_000, reserves: 5_000_000, ran: 12_500_000, resultat: 0, total: 67_500_000 },
  { libelle: 'Affectation N-1', capital: 0, reserves: 0, ran: 0, resultat: 0, total: 0 },
  { libelle: 'Résultat N', capital: 0, reserves: 0, ran: 0, resultat: RN_DEMO, total: RN_DEMO },
  { libelle: 'Solde à la clôture', capital: 50_000_000, reserves: 5_000_000, ran: 12_500_000, resultat: RN_DEMO, total: 67_500_000 + RN_DEMO },
];

// Bilan N-1 (pour comparaison)
export const DEMO_BILAN_N1 = {
  actif: DEMO_BILAN.actif.map((l) => ({ ...l, value: Math.round(l.value * 0.85) })),
  passif: DEMO_BILAN.passif.map((l) => ({ ...l, value: Math.round(l.value * 0.85) })),
  totalActif: Math.round(TOTAL_ACTIF * 0.85),
  totalPassif: Math.round(TOTAL_ACTIF * 0.85),
  unclassifiedAccounts: [] as never[],
};

// ────────────────────────────────────────────────────────────────────
// Plan comptable (dérivé de la balance pour le COA et les imports)
// ────────────────────────────────────────────────────────────────────
const ACCOUNT_TYPES: Record<string, 'A' | 'P' | 'C' | 'R'> = {
  '1': 'P', '2': 'A', '3': 'A', '4': 'A', '5': 'A', '6': 'C', '7': 'R',
};
export const DEMO_ACCOUNTS: Account[] = DEMO_BALANCE.map((b) => ({
  orgId: 'demo-org',
  code: b.account,
  label: b.label,
  class: b.class || b.account[0],
  type: ACCOUNT_TYPES[b.account[0]] || 'A',
  syscoCode: b.syscoCode,
})) as Account[];

// Budget vs Réalisé synthétique
export const DEMO_BUDGET_ACTUAL = [
  { code: '70', label: 'Ventes', budget: 290_000_000, realise: CA_DEMO, ecart: CA_DEMO - 290_000_000, ecartPct: ((CA_DEMO - 290_000_000) / 290_000_000) * 100, status: 'favorable' as const, isCharge: false },
  { code: '60', label: 'Achats', budget: 60_000_000, realise: ACHATS_CONSO, ecart: ACHATS_CONSO - 60_000_000, ecartPct: ((ACHATS_CONSO - 60_000_000) / 60_000_000) * 100, status: 'defavorable' as const, isCharge: true },
  { code: '66', label: 'Charges personnel', budget: 120_000_000, realise: 122_400_000, ecart: 2_400_000, ecartPct: 2.0, status: 'defavorable' as const, isCharge: true },
];
