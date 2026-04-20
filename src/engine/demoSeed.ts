// Seed de données DEMO — entreprise fictive SYSCOHADA réaliste
// Charge un GL + Plan Comptable + Budget complet + Alertes + Plan d'action
// + Mémoire Proph3t pour démo immédiate de bout en bout
import { db, GLEntry, Account, AttentionPoint, ActionPlan } from '../db/schema';

const DEMO_ORG_ID = 'demo-org';
const DEMO_YEAR = new Date().getFullYear();

// Comptes SYSCOHADA réalistes pour PME industrielle
const DEMO_ACCOUNTS: Account[] = [
  // Capitaux propres
  { orgId: DEMO_ORG_ID, code: '101', label: 'Capital social', class: '1', type: 'P', syscoCode: '101' },
  { orgId: DEMO_ORG_ID, code: '111', label: 'Réserve légale', class: '1', type: 'P', syscoCode: '111' },
  { orgId: DEMO_ORG_ID, code: '121', label: 'Report à nouveau créditeur', class: '1', type: 'P', syscoCode: '121' },
  // Emprunts
  { orgId: DEMO_ORG_ID, code: '162', label: 'Emprunts bancaires', class: '1', type: 'P', syscoCode: '162' },
  // Immo
  { orgId: DEMO_ORG_ID, code: '231', label: 'Bâtiments industriels', class: '2', type: 'A', syscoCode: '231' },
  { orgId: DEMO_ORG_ID, code: '241', label: 'Matériel industriel', class: '2', type: 'A', syscoCode: '241' },
  { orgId: DEMO_ORG_ID, code: '244', label: 'Matériel informatique', class: '2', type: 'A', syscoCode: '244' },
  { orgId: DEMO_ORG_ID, code: '281', label: 'Amortissements bâtiments', class: '2', type: 'P', syscoCode: '281' },
  // Stocks
  { orgId: DEMO_ORG_ID, code: '311', label: 'Marchandises', class: '3', type: 'A', syscoCode: '311' },
  { orgId: DEMO_ORG_ID, code: '321', label: 'Matières premières', class: '3', type: 'A', syscoCode: '321' },
  // Tiers
  { orgId: DEMO_ORG_ID, code: '401001', label: 'FRN ABC SARL', class: '4', type: 'P', syscoCode: '401' },
  { orgId: DEMO_ORG_ID, code: '401002', label: 'FRN XYZ SA', class: '4', type: 'P', syscoCode: '401' },
  { orgId: DEMO_ORG_ID, code: '401003', label: 'FRN DELTA SARL', class: '4', type: 'P', syscoCode: '401' },
  { orgId: DEMO_ORG_ID, code: '411001', label: 'CLIENT ALPHA SA', class: '4', type: 'A', syscoCode: '411' },
  { orgId: DEMO_ORG_ID, code: '411002', label: 'CLIENT BETA SARL', class: '4', type: 'A', syscoCode: '411' },
  { orgId: DEMO_ORG_ID, code: '411003', label: 'CLIENT GAMMA SAS', class: '4', type: 'A', syscoCode: '411' },
  { orgId: DEMO_ORG_ID, code: '411004', label: 'CLIENT OMEGA SARL', class: '4', type: 'A', syscoCode: '411' },
  { orgId: DEMO_ORG_ID, code: '4431', label: 'État, TVA collectée', class: '4', type: 'P', syscoCode: '443' },
  { orgId: DEMO_ORG_ID, code: '4452', label: 'État, TVA déductible', class: '4', type: 'A', syscoCode: '445' },
  { orgId: DEMO_ORG_ID, code: '421', label: 'Personnel rémunérations dues', class: '4', type: 'P', syscoCode: '421' },
  { orgId: DEMO_ORG_ID, code: '431', label: 'Sécurité sociale', class: '4', type: 'P', syscoCode: '431' },
  { orgId: DEMO_ORG_ID, code: '447', label: 'État impôts retenus à la source', class: '4', type: 'P', syscoCode: '447' },
  // Trésorerie
  { orgId: DEMO_ORG_ID, code: '521', label: 'Banque locale principale', class: '5', type: 'A', syscoCode: '521' },
  { orgId: DEMO_ORG_ID, code: '571', label: 'Caisse siège', class: '5', type: 'A', syscoCode: '571' },
  // Charges
  { orgId: DEMO_ORG_ID, code: '601', label: 'Achats de marchandises', class: '6', type: 'C', syscoCode: '601' },
  { orgId: DEMO_ORG_ID, code: '602', label: 'Achats matières premières', class: '6', type: 'C', syscoCode: '602' },
  { orgId: DEMO_ORG_ID, code: '611', label: 'Transports sur achats', class: '6', type: 'C', syscoCode: '611' },
  { orgId: DEMO_ORG_ID, code: '622', label: 'Locations', class: '6', type: 'C', syscoCode: '622' },
  { orgId: DEMO_ORG_ID, code: '624', label: 'Entretien et réparations', class: '6', type: 'C', syscoCode: '624' },
  { orgId: DEMO_ORG_ID, code: '625', label: 'Primes d\'assurances', class: '6', type: 'C', syscoCode: '625' },
  { orgId: DEMO_ORG_ID, code: '627', label: 'Publicité', class: '6', type: 'C', syscoCode: '627' },
  { orgId: DEMO_ORG_ID, code: '628', label: 'Frais de télécommunications', class: '6', type: 'C', syscoCode: '628' },
  { orgId: DEMO_ORG_ID, code: '631', label: 'Frais bancaires', class: '6', type: 'C', syscoCode: '631' },
  { orgId: DEMO_ORG_ID, code: '641', label: 'Impôts et taxes', class: '6', type: 'C', syscoCode: '641' },
  { orgId: DEMO_ORG_ID, code: '661', label: 'Rémunérations directes', class: '6', type: 'C', syscoCode: '661' },
  { orgId: DEMO_ORG_ID, code: '664', label: 'Charges sociales', class: '6', type: 'C', syscoCode: '664' },
  { orgId: DEMO_ORG_ID, code: '671', label: 'Intérêts des emprunts', class: '6', type: 'C', syscoCode: '671' },
  { orgId: DEMO_ORG_ID, code: '681', label: 'Dotations aux amortissements', class: '6', type: 'C', syscoCode: '681' },
  // Produits
  { orgId: DEMO_ORG_ID, code: '701', label: 'Ventes de marchandises', class: '7', type: 'R', syscoCode: '701' },
  { orgId: DEMO_ORG_ID, code: '702', label: 'Ventes de produits finis', class: '7', type: 'R', syscoCode: '702' },
  { orgId: DEMO_ORG_ID, code: '706', label: 'Services vendus', class: '7', type: 'R', syscoCode: '706' },
  { orgId: DEMO_ORG_ID, code: '771', label: 'Intérêts perçus', class: '7', type: 'R', syscoCode: '771' },
];

// Génère un GL réaliste : ventes mensuelles, achats, salaires, OD, paiements
function generateGL(): Omit<GLEntry, 'id' | 'periodId' | 'importId'>[] {
  const entries: Omit<GLEntry, 'id' | 'periodId' | 'importId'>[] = [];
  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const clients = ['411001', '411002', '411003', '411004'];
  const fournisseurs = ['401001', '401002', '401003'];

  // À-nouveaux (RAN — janvier mois 0)
  const ouverture = `${DEMO_YEAR}-01-01`;
  const ranEntries = [
    { account: '101', credit: 50_000_000, label: 'AN Capital social' },
    { account: '111', credit: 5_000_000, label: 'AN Réserve légale' },
    { account: '121', credit: 12_500_000, label: 'AN Report à nouveau' },
    { account: '162', credit: 35_000_000, label: 'AN Emprunts bancaires' },
    { account: '231', debit: 80_000_000, label: 'AN Bâtiments' },
    { account: '241', debit: 25_000_000, label: 'AN Matériel industriel' },
    { account: '244', debit: 4_500_000, label: 'AN Matériel informatique' },
    { account: '281', credit: 18_000_000, label: 'AN Amortissements' },
    { account: '311', debit: 8_500_000, label: 'AN Stocks marchandises' },
    { account: '521', debit: 22_500_000, label: 'AN Solde bancaire' },
  ];
  for (const e of ranEntries) {
    entries.push({
      orgId: DEMO_ORG_ID,
      account: e.account,
      label: e.label,
      date: ouverture,
      journal: 'AN',
      piece: 'AN-001',
      debit: e.debit ?? 0,
      credit: e.credit ?? 0,
    });
  }

  let pieceCounter = 1;
  for (const m of months) {
    const lastDay = new Date(DEMO_YEAR, m, 0).getDate();
    const monthStr = String(m).padStart(2, '0');

    // VENTES — 8 à 15 ventes par mois sur clients aléatoires
    const nbVentes = 10 + Math.floor((m % 4) * 2);
    for (let i = 0; i < nbVentes; i++) {
      const day = String(1 + Math.floor((i / nbVentes) * (lastDay - 1))).padStart(2, '0');
      const date = `${DEMO_YEAR}-${monthStr}-${day}`;
      const client = clients[i % clients.length];
      const montant = Math.round((1_500_000 + (i * 350_000) + (m * 80_000)) * (m === 12 ? 1.4 : 1));
      const tva = Math.round(montant * 0.18);
      const ttc = montant + tva;
      const piece = `VT-${String(pieceCounter++).padStart(4, '0')}`;
      const labelV = `Facture ${piece}`;

      entries.push({ orgId: DEMO_ORG_ID, account: client, label: labelV, date, journal: 'VT', piece, debit: ttc, credit: 0, tiers: client.substring(3) });
      const compteVente = i % 3 === 0 ? '702' : i % 3 === 1 ? '701' : '706';
      entries.push({ orgId: DEMO_ORG_ID, account: compteVente, label: labelV, date, journal: 'VT', piece, debit: 0, credit: montant });
      entries.push({ orgId: DEMO_ORG_ID, account: '4431', label: `TVA collectée ${piece}`, date, journal: 'VT', piece, debit: 0, credit: tva });
    }

    // ACHATS — 5 à 8 achats par mois
    const nbAchats = 6;
    for (let i = 0; i < nbAchats; i++) {
      const day = String(2 + Math.floor((i / nbAchats) * (lastDay - 2))).padStart(2, '0');
      const date = `${DEMO_YEAR}-${monthStr}-${day}`;
      const fournisseur = fournisseurs[i % fournisseurs.length];
      const montant = Math.round(800_000 + i * 220_000);
      const tva = Math.round(montant * 0.18);
      const ttc = montant + tva;
      const piece = `AC-${String(pieceCounter++).padStart(4, '0')}`;
      const labelA = `Facture FRN ${piece}`;
      const compteAchat = i % 2 === 0 ? '601' : '602';

      entries.push({ orgId: DEMO_ORG_ID, account: compteAchat, label: labelA, date, journal: 'AC', piece, debit: montant, credit: 0 });
      entries.push({ orgId: DEMO_ORG_ID, account: '4452', label: `TVA déductible ${piece}`, date, journal: 'AC', piece, debit: tva, credit: 0 });
      entries.push({ orgId: DEMO_ORG_ID, account: fournisseur, label: labelA, date, journal: 'AC', piece, debit: 0, credit: ttc, tiers: fournisseur.substring(3) });
    }

    // CHARGES EXPLOITATION RÉCURRENTES (tous les mois)
    const lastDayStr = String(lastDay).padStart(2, '0');
    const dateFinMois = `${DEMO_YEAR}-${monthStr}-${lastDayStr}`;
    const recurrent = [
      { compte: '622', label: 'Loyer mensuel siège', montant: 1_200_000 },
      { compte: '628', label: 'Téléphonie & internet', montant: 280_000 },
      { compte: '631', label: 'Frais bancaires', montant: 85_000 },
      { compte: '624', label: 'Maintenance équipements', montant: 350_000 },
      { compte: '625', label: 'Prime assurance multirisque', montant: 220_000 },
    ];
    for (const c of recurrent) {
      const piece = `OD-${String(pieceCounter++).padStart(4, '0')}`;
      entries.push({ orgId: DEMO_ORG_ID, account: c.compte, label: c.label, date: dateFinMois, journal: 'OD', piece, debit: c.montant, credit: 0 });
      entries.push({ orgId: DEMO_ORG_ID, account: '521', label: c.label, date: dateFinMois, journal: 'OD', piece, debit: 0, credit: c.montant });
    }

    // SALAIRES (fin de mois)
    const piecePaie = `PAIE-${monthStr}`;
    const brut = 8_500_000;
    const cotisSal = 595_000;
    const irpp = 425_000;
    const cotisPat = 1_700_000;
    const net = brut - cotisSal - irpp;
    entries.push({ orgId: DEMO_ORG_ID, account: '661', label: 'Salaires bruts', date: dateFinMois, journal: 'PAIE', piece: piecePaie, debit: brut, credit: 0 });
    entries.push({ orgId: DEMO_ORG_ID, account: '421', label: 'Net à payer', date: dateFinMois, journal: 'PAIE', piece: piecePaie, debit: 0, credit: net });
    entries.push({ orgId: DEMO_ORG_ID, account: '431', label: 'Cotisations salariales', date: dateFinMois, journal: 'PAIE', piece: piecePaie, debit: 0, credit: cotisSal });
    entries.push({ orgId: DEMO_ORG_ID, account: '447', label: 'IRPP retenu', date: dateFinMois, journal: 'PAIE', piece: piecePaie, debit: 0, credit: irpp });
    entries.push({ orgId: DEMO_ORG_ID, account: '664', label: 'Charges sociales patronales', date: dateFinMois, journal: 'PAIE', piece: piecePaie, debit: cotisPat, credit: 0 });
    entries.push({ orgId: DEMO_ORG_ID, account: '431', label: 'Cotisations patronales', date: dateFinMois, journal: 'PAIE', piece: piecePaie, debit: 0, credit: cotisPat });
    entries.push({ orgId: DEMO_ORG_ID, account: '421', label: 'Paiement net salaires', date: dateFinMois, journal: 'BQ', piece: `BQ-${piecePaie}`, debit: net, credit: 0 });
    entries.push({ orgId: DEMO_ORG_ID, account: '521', label: 'Paiement net salaires', date: dateFinMois, journal: 'BQ', piece: `BQ-${piecePaie}`, debit: 0, credit: net });

    // ENCAISSEMENTS clients (50 % des ventes du mois précédent)
    if (m > 1) {
      for (let i = 0; i < 5; i++) {
        const day = String(10 + i * 3).padStart(2, '0');
        const date = `${DEMO_YEAR}-${monthStr}-${day}`;
        const client = clients[i % clients.length];
        const montant = Math.round(2_500_000 + i * 400_000);
        const piece = `BQ-${String(pieceCounter++).padStart(4, '0')}`;
        entries.push({ orgId: DEMO_ORG_ID, account: '521', label: `Encaissement ${client}`, date, journal: 'BQ', piece, debit: montant, credit: 0 });
        entries.push({ orgId: DEMO_ORG_ID, account: client, label: `Encaissement ${client}`, date, journal: 'BQ', piece, debit: 0, credit: montant, tiers: client.substring(3) });
      }
    }

    // PAIEMENTS fournisseurs
    if (m > 1) {
      for (let i = 0; i < 3; i++) {
        const day = String(15 + i * 4).padStart(2, '0');
        const date = `${DEMO_YEAR}-${monthStr}-${day}`;
        const fournisseur = fournisseurs[i % fournisseurs.length];
        const montant = Math.round(1_200_000 + i * 350_000);
        const piece = `BQ-${String(pieceCounter++).padStart(4, '0')}`;
        entries.push({ orgId: DEMO_ORG_ID, account: fournisseur, label: `Règlement ${fournisseur}`, date, journal: 'BQ', piece, debit: montant, credit: 0, tiers: fournisseur.substring(3) });
        entries.push({ orgId: DEMO_ORG_ID, account: '521', label: `Règlement ${fournisseur}`, date, journal: 'BQ', piece, debit: 0, credit: montant });
      }
    }

    // Échéance emprunt mensuelle
    const piecePret = `OD-EMP-${monthStr}`;
    entries.push({ orgId: DEMO_ORG_ID, account: '162', label: 'Échéance emprunt - capital', date: dateFinMois, journal: 'BQ', piece: piecePret, debit: 850_000, credit: 0 });
    entries.push({ orgId: DEMO_ORG_ID, account: '671', label: 'Intérêts emprunt', date: dateFinMois, journal: 'BQ', piece: piecePret, debit: 175_000, credit: 0 });
    entries.push({ orgId: DEMO_ORG_ID, account: '521', label: 'Échéance emprunt', date: dateFinMois, journal: 'BQ', piece: piecePret, debit: 0, credit: 1_025_000 });
  }

  // Dotation amortissement annuelle (31/12)
  const dec31 = `${DEMO_YEAR}-12-31`;
  entries.push({ orgId: DEMO_ORG_ID, account: '681', label: 'Dotation aux amortissements exercice', date: dec31, journal: 'OD', piece: 'OD-DOT-AMO', debit: 9_500_000, credit: 0 });
  entries.push({ orgId: DEMO_ORG_ID, account: '281', label: 'Amortissement bâtiments', date: dec31, journal: 'OD', piece: 'OD-DOT-AMO', debit: 0, credit: 9_500_000 });

  return entries;
}

export async function loadDemoData(): Promise<{ accounts: number; entries: number; ca: number }> {
  // Reset éventuel — toutes les tables liées à l'org démo
  await db.transaction(
    'rw',
    [db.organizations, db.fiscalYears, db.periods, db.accounts, db.gl, db.imports, db.budgets,
      db.attentionPoints, db.actionPlans, db.reports, db.templates],
    async () => {
      await db.gl.where('orgId').equals(DEMO_ORG_ID).delete();
      await db.imports.where('orgId').equals(DEMO_ORG_ID).delete();
      await db.budgets.where('orgId').equals(DEMO_ORG_ID).delete();
      await db.accounts.where('orgId').equals(DEMO_ORG_ID).delete();
      await db.periods.where('orgId').equals(DEMO_ORG_ID).delete();
      await db.fiscalYears.where('orgId').equals(DEMO_ORG_ID).delete();
      await db.attentionPoints.where('orgId').equals(DEMO_ORG_ID).delete();
      await db.actionPlans.where('orgId').equals(DEMO_ORG_ID).delete();
      await db.reports.where('orgId').equals(DEMO_ORG_ID).delete();
      await db.templates.where('orgId').equals(DEMO_ORG_ID).delete();
      await db.organizations.delete(DEMO_ORG_ID);
    },
  );

  // Société DEMO
  await db.organizations.put({
    id: DEMO_ORG_ID,
    name: 'DEMO INDUSTRIES SA',
    sector: 'Industrie',
    currency: 'XOF',
    rccm: 'CI-ABJ-2020-B-12345',
    ifu: '2020112233445',
    address: 'Boulevard VGE, Abidjan, Côte d\'Ivoire',
    createdAt: Date.now(),
  } as any);

  // Exercice + périodes
  const fyId = `fy-${DEMO_ORG_ID}-${DEMO_YEAR}`;
  await db.fiscalYears.put({ id: fyId, orgId: DEMO_ORG_ID, year: DEMO_YEAR, startDate: `${DEMO_YEAR}-01-01`, endDate: `${DEMO_YEAR}-12-31`, closed: false });
  const monthLabels = ['','Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
  const periods: any[] = [{ id: `p-${DEMO_ORG_ID}-${DEMO_YEAR}-0`, orgId: DEMO_ORG_ID, fiscalYearId: fyId, year: DEMO_YEAR, month: 0, label: `À-nouveaux ${DEMO_YEAR}`, closed: false }];
  for (let m = 1; m <= 12; m++) {
    periods.push({ id: `p-${DEMO_ORG_ID}-${DEMO_YEAR}-${m}`, orgId: DEMO_ORG_ID, fiscalYearId: fyId, year: DEMO_YEAR, month: m, label: `${monthLabels[m]} ${DEMO_YEAR}`, closed: false });
  }
  await db.periods.bulkPut(periods);

  // Plan comptable
  await db.accounts.bulkPut(DEMO_ACCOUNTS);

  // Import log
  const importId = await db.imports.add({
    orgId: DEMO_ORG_ID,
    date: Date.now(),
    user: 'DEMO',
    fileName: 'demo-data.json',
    source: 'Démo intégrée',
    kind: 'GL',
    count: 0,
    rejected: 0,
    status: 'success',
    report: JSON.stringify({ source: 'demoSeed' }),
  });

  // Génération + tagging des écritures avec periodId
  const rawEntries = generateGL();
  const periodByKey = new Map(periods.map((p) => [`${p.year}-${p.month}`, p.id] as const));
  const taggedEntries: GLEntry[] = rawEntries.map((e) => {
    const month = e.journal === 'AN' ? 0 : parseInt(e.date.substring(5, 7));
    const periodId = periodByKey.get(`${DEMO_YEAR}-${month}`) || `p-${DEMO_ORG_ID}-${DEMO_YEAR}-${month}`;
    return { ...e, periodId, importId: String(importId) } as GLEntry;
  });
  await db.gl.bulkAdd(taggedEntries);
  await db.imports.update(importId, { count: taggedEntries.length });

  // Budget DEMO (V1_<year>) — montants approximatifs basés sur le réalisé
  const budgetLines: any[] = [];
  const budgetData = [
    { account: '701', annual: 90_000_000 },
    { account: '702', annual: 130_000_000 },
    { account: '706', annual: 60_000_000 },
    { account: '601', annual: 30_000_000 },
    { account: '602', annual: 28_000_000 },
    { account: '622', annual: 14_400_000 },
    { account: '624', annual: 4_200_000 },
    { account: '625', annual: 2_640_000 },
    { account: '627', annual: 3_000_000 },
    { account: '628', annual: 3_360_000 },
    { account: '631', annual: 1_020_000 },
    { account: '661', annual: 102_000_000 },
    { account: '664', annual: 20_400_000 },
    { account: '671', annual: 2_100_000 },
    { account: '681', annual: 9_500_000 },
  ];
  for (const b of budgetData) {
    const monthly = Math.round(b.annual / 12);
    for (let m = 1; m <= 12; m++) {
      budgetLines.push({ orgId: DEMO_ORG_ID, year: DEMO_YEAR, version: `V1_${DEMO_YEAR}`, account: b.account, month: m, amount: monthly });
    }
  }
  await db.budgets.bulkAdd(budgetLines);
  await db.imports.add({
    orgId: DEMO_ORG_ID, date: Date.now(), user: 'DEMO', fileName: 'demo-budget.json',
    source: 'Démo intégrée', kind: 'BUDGET', count: budgetData.length, rejected: 0,
    status: 'success', year: DEMO_YEAR, version: `V1_${DEMO_YEAR}`,
    report: JSON.stringify({ source: 'demoSeed' }),
  });

  // ─── Points d'attention détectés (alertes persistées) ───────────────
  const now = Date.now();
  const attentionPoints: AttentionPoint[] = [
    {
      orgId: DEMO_ORG_ID, title: 'Solde Client OMEGA en dépassement (>90 jours)',
      description: 'Le client 411004 OMEGA SARL présente un solde débiteur > 8M FCFA dont une partie ancienne de plus de 90 jours.',
      severity: 'high', probability: 'high', category: 'Financier', source: '411004',
      detectedAt: now - 86_400_000 * 10, status: 'open',
      estimatedFinancialImpact: 8_500_000,
      rootCause: 'Pas de relance automatisée en place',
      recommendation: 'Mettre en place un échéancier de relance + provision pour créance douteuse',
      tags: ['recouvrement', 'BFR'],
    },
    {
      orgId: DEMO_ORG_ID, title: 'Charges externes en hausse vs N-1 (+18%)',
      description: 'Les charges du compte 622 (locations) ont augmenté de 18% par rapport à l\'an dernier sans explication claire.',
      severity: 'medium', probability: 'medium', category: 'Comptable', source: '622',
      detectedAt: now - 86_400_000 * 5, status: 'in_progress',
      recommendation: 'Auditer les nouveaux contrats de location signés en début d\'exercice',
      tags: ['charges', 'analyse'],
    },
    {
      orgId: DEMO_ORG_ID, title: 'TVA collectée > déductible : à reverser',
      description: 'Position TVA nette créditrice vis-à-vis de l\'État. Échéance prochaine de déclaration.',
      severity: 'medium', probability: 'high', category: 'Fiscal', source: '4431',
      detectedAt: now - 86_400_000 * 3, status: 'open',
      targetResolutionDate: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-15`,
      recommendation: 'Préparer la déclaration TVA mensuelle avant échéance',
      tags: ['TVA', 'fiscal'],
    },
    {
      orgId: DEMO_ORG_ID, title: 'Trésorerie tendue prévue en M+2',
      description: 'Projection de trésorerie négative dans 60 jours si pas d\'encaissement majeur.',
      severity: 'critical', probability: 'medium', category: 'Trésorerie', source: '521',
      detectedAt: now - 86_400_000 * 1, status: 'escalated',
      estimatedFinancialImpact: -3_200_000,
      recommendation: 'Négocier une ligne de crédit court terme + accélérer recouvrement',
      tags: ['cash', 'forecast'],
    },
    {
      orgId: DEMO_ORG_ID, title: 'Écart budget vs réalisé sur ventes (-12%)',
      description: 'Les ventes du dernier trimestre sont 12% sous le budget V1 initial.',
      severity: 'medium', probability: 'high', category: 'Performance', source: '70',
      detectedAt: now - 86_400_000 * 7, status: 'open',
      recommendation: 'Réviser le forecast avec une nouvelle version V2',
      tags: ['budget', 'CA'],
    },
    {
      orgId: DEMO_ORG_ID, title: 'Compte 471 (suspens) à apurer avant clôture',
      description: 'Solde du compte d\'attente 471 non nul à 4 mois de la clôture.',
      severity: 'low', probability: 'high', category: 'Comptable', source: '471',
      detectedAt: now - 86_400_000 * 14, status: 'open',
      tags: ['clôture', 'révision'],
    },
  ];
  await db.attentionPoints.bulkAdd(attentionPoints);

  // ─── Plans d'action liés ────────────────────────────────────────────
  const apIds = await db.attentionPoints.where('orgId').equals(DEMO_ORG_ID).primaryKeys();
  const actionPlans: ActionPlan[] = [
    {
      orgId: DEMO_ORG_ID, attentionPointId: apIds[0],
      title: 'Mettre en place une procédure de relance clients',
      description: 'Définir J+15 / J+30 / J+45 + lettrage automatique mensuel',
      owner: 'DAF', team: 'Comptabilité', sponsor: 'DG',
      startDate: `${DEMO_YEAR}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`,
      dueDate: `${DEMO_YEAR}-${String(Math.min(12, new Date().getMonth() + 2)).padStart(2, '0')}-30`,
      priority: 'high', status: 'doing', progress: 35,
      budgetAllocated: 500_000,
      deliverables: 'Procédure rédigée + 3 templates emails + tableau de bord recouvrement',
      successCriteria: 'DSO réduit de 20 jours sous 6 mois',
      tags: ['recouvrement'],
      createdAt: now - 86_400_000 * 8, updatedAt: now - 86_400_000 * 2,
    },
    {
      orgId: DEMO_ORG_ID, attentionPointId: apIds[3],
      title: 'Négocier ligne de crédit court terme',
      owner: 'DG', team: 'Direction', sponsor: 'Conseil',
      dueDate: `${DEMO_YEAR}-${String(Math.min(12, new Date().getMonth() + 1)).padStart(2, '0')}-30`,
      priority: 'critical', status: 'todo', progress: 0,
      deliverables: 'Convention de découvert 15M FCFA',
      tags: ['trésorerie'],
      createdAt: now - 86_400_000 * 1, updatedAt: now - 86_400_000 * 1,
    },
    {
      orgId: DEMO_ORG_ID, attentionPointId: apIds[2],
      title: 'Préparer & déposer déclaration TVA',
      owner: 'Comptable', team: 'Comptabilité',
      dueDate: `${DEMO_YEAR}-${String(new Date().getMonth() + 1).padStart(2, '0')}-15`,
      priority: 'high', status: 'doing', progress: 60,
      deliverables: 'Déclaration souscrite + paiement effectué',
      tags: ['TVA', 'fiscal'],
      createdAt: now - 86_400_000 * 3, updatedAt: now - 86_400_000 * 1,
    },
    {
      orgId: DEMO_ORG_ID, attentionPointId: apIds[4],
      title: 'Élaborer un forecast révisé V2',
      owner: 'Contrôleur de gestion', team: 'Finance',
      startDate: `${DEMO_YEAR}-${String(new Date().getMonth() + 1).padStart(2, '0')}-05`,
      dueDate: `${DEMO_YEAR}-${String(Math.min(12, new Date().getMonth() + 2)).padStart(2, '0')}-15`,
      priority: 'medium', status: 'todo', progress: 0,
      deliverables: 'Budget V2 saisi dans Cockpit + note d\'analyse écart',
      tags: ['budget', 'forecast'],
      createdAt: now - 86_400_000 * 6, updatedAt: now - 86_400_000 * 6,
    },
    {
      orgId: DEMO_ORG_ID,
      title: 'Audit annuel : préparer dossier de révision',
      description: 'Préparer la liasse pour le commissaire aux comptes',
      owner: 'DAF', team: 'Comptabilité',
      dueDate: `${DEMO_YEAR}-12-31`,
      priority: 'medium', status: 'todo', progress: 15,
      deliverables: 'Cycles révisés + justificatifs scannés + balance certifiée',
      tags: ['audit', 'clôture'],
      createdAt: now - 86_400_000 * 30, updatedAt: now - 86_400_000 * 5,
    },
  ];
  await db.actionPlans.bulkAdd(actionPlans);

  // ─── Mémoire Proph3t (insights pré-calculés pour démo immédiate) ────
  try {
    const memKey = 'proph3t-memory';
    const memory = {
      observations: [
        { ts: now - 86_400_000 * 30, kind: 'kpi', metric: 'CA', value: 22_500_000, note: 'Ventes M-1 supérieures à la moyenne' },
        { ts: now - 86_400_000 * 14, kind: 'alert', note: 'Solde client OMEGA en alerte' },
        { ts: now - 86_400_000 * 7, kind: 'kpi', metric: 'EBE', value: 4_800_000, note: 'EBE stable malgré hausse charges' },
        { ts: now - 86_400_000 * 3, kind: 'insight', note: 'Marge nette en baisse : surveiller charges externes' },
      ],
      snapshots: [
        { ts: now - 86_400_000 * 60, ca: 18_500_000, rn: 1_200_000, ebe: 3_900_000 },
        { ts: now - 86_400_000 * 30, ca: 22_500_000, rn: 1_650_000, ebe: 4_800_000 },
        { ts: now - 86_400_000 * 1, ca: 24_100_000, rn: 1_800_000, ebe: 5_100_000 },
      ],
      conversations: [
        { ts: now - 86_400_000 * 2, q: 'Quel est mon principal risque ?', a: 'Le risque majeur identifié est la créance client OMEGA (8,5M FCFA) en dépassement >90j combinée à une projection de trésorerie tendue dans 60 jours.' },
      ],
      orgId: DEMO_ORG_ID,
    };
    localStorage.setItem(memKey, JSON.stringify(memory));
  } catch { /* localStorage indisponible */ }

  // ─── Rapport démo pré-rédigé ────────────────────────────────────────
  await db.reports.add({
    orgId: DEMO_ORG_ID,
    title: `Reporting mensuel ${monthLabels[new Date().getMonth() + 1] || 'Décembre'} ${DEMO_YEAR}`,
    type: 'monthly',
    author: 'Démo Cockpit',
    status: 'draft',
    createdAt: now - 86_400_000 * 2,
    updatedAt: now,
    content: JSON.stringify({ source: 'demoSeed', sections: 23 }),
  });

  const ca = budgetData.filter((b) => b.account.startsWith('7')).reduce((s, b) => s + b.annual, 0);
  return { accounts: DEMO_ACCOUNTS.length, entries: taggedEntries.length, ca };
}

// ────────────────────────────────────────────────────────────────────
// Sortie du mode démo : supprime toutes les données + flag
// ────────────────────────────────────────────────────────────────────
export async function unloadDemoData(): Promise<void> {
  await db.transaction(
    'rw',
    [db.organizations, db.fiscalYears, db.periods, db.accounts, db.gl, db.imports, db.budgets,
      db.attentionPoints, db.actionPlans, db.reports, db.templates],
    async () => {
      await db.gl.where('orgId').equals(DEMO_ORG_ID).delete();
      await db.imports.where('orgId').equals(DEMO_ORG_ID).delete();
      await db.budgets.where('orgId').equals(DEMO_ORG_ID).delete();
      await db.accounts.where('orgId').equals(DEMO_ORG_ID).delete();
      await db.periods.where('orgId').equals(DEMO_ORG_ID).delete();
      await db.fiscalYears.where('orgId').equals(DEMO_ORG_ID).delete();
      await db.attentionPoints.where('orgId').equals(DEMO_ORG_ID).delete();
      await db.actionPlans.where('orgId').equals(DEMO_ORG_ID).delete();
      await db.reports.where('orgId').equals(DEMO_ORG_ID).delete();
      await db.templates.where('orgId').equals(DEMO_ORG_ID).delete();
      await db.organizations.delete(DEMO_ORG_ID);
    },
  );
  try { localStorage.removeItem('proph3t-memory'); } catch { /* noop */ }
  try { localStorage.removeItem('demo-mode'); } catch { /* noop */ }
  try { localStorage.removeItem('demo-tour-step'); } catch { /* noop */ }
}

export const DEMO_ORG_ID_EXPORT = DEMO_ORG_ID;
