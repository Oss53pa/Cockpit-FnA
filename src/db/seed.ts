// Génération d'un dataset SYSCOHADA réaliste au premier lancement
import { db, GLEntry, Organization, Period, Account, FiscalYear } from './schema';
import { SYSCOHADA_COA } from '../syscohada/coa';

function rand(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function choice<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

function makeEntries(
  orgId: string,
  periodId: string,
  year: number,
  month: number,
  scale: number,
): GLEntry[] {
  const entries: GLEntry[] = [];
  const daysInMonth = new Date(year, month, 0).getDate();
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = (d: number) => `${year}-${pad(month)}-${pad(d)}`;

  // Helper pour une écriture équilibrée
  const push = (d: string, j: string, piece: string, lines: Array<{ account: string; label: string; debit?: number; credit?: number; tiers?: string }>) => {
    for (const l of lines) {
      entries.push({
        orgId, periodId, date: d, journal: j, piece,
        account: l.account, label: l.label,
        debit: l.debit ?? 0, credit: l.credit ?? 0,
        tiers: l.tiers,
      });
    }
  };

  // ─── Ventes (Journal VT) — 80-120 écritures / mois
  const nbVentes = rand(80, 120);
  for (let i = 0; i < nbVentes; i++) {
    const d = date(rand(1, daysInMonth));
    const pc = `VT-${year}${pad(month)}-${String(i + 1).padStart(4, '0')}`;
    const client = `411${String(rand(1, 40)).padStart(3, '0')}`;
    const montantHT = rand(50_000, 8_000_000) * scale;
    const tva = Math.round(montantHT * 0.18);
    const ttc = montantHT + tva;
    const isProduit = Math.random() > 0.5;
    push(d, 'VT', pc, [
      { account: client, label: 'Facture client', debit: ttc, tiers: client },
      { account: isProduit ? '702' : '701', label: 'Vente', credit: montantHT },
      { account: '4431', label: 'TVA facturée', credit: tva },
    ]);
  }

  // ─── Achats (Journal AC)
  const nbAchats = rand(60, 100);
  for (let i = 0; i < nbAchats; i++) {
    const d = date(rand(1, daysInMonth));
    const pc = `AC-${year}${pad(month)}-${String(i + 1).padStart(4, '0')}`;
    const fr = `401${String(rand(1, 30)).padStart(3, '0')}`;
    const montantHT = rand(30_000, 5_000_000) * scale;
    const tva = Math.round(montantHT * 0.18);
    const ttc = montantHT + tva;
    const typeAchat = choice(['601', '602', '605', '622', '624', '625', '632']);
    push(d, 'AC', pc, [
      { account: typeAchat, label: 'Achat/charge', debit: montantHT },
      { account: '4452', label: 'TVA récupérable', debit: tva },
      { account: fr, label: 'Fournisseur', credit: ttc, tiers: fr },
    ]);
  }

  // ─── Paie (fin de mois)
  const salBrut = (250_000_000 + rand(-20_000_000, 20_000_000)) * scale;
  const chgSoc = Math.round(salBrut * 0.22);
  const net = salBrut - Math.round(salBrut * 0.08);
  push(date(daysInMonth), 'PAIE', `PAIE-${year}${pad(month)}`, [
    { account: '661', label: 'Salaires bruts', debit: salBrut },
    { account: '664', label: 'Charges sociales patronales', debit: chgSoc },
    { account: '422', label: 'Personnel - rémunérations dues', credit: net },
    { account: '431', label: 'Sécurité sociale', credit: chgSoc + (salBrut - net) },
  ]);

  // ─── Règlements banque (encaissements clients)
  for (let i = 0; i < rand(30, 60); i++) {
    const d = date(rand(5, daysInMonth));
    const pc = `BQ-${year}${pad(month)}-R${String(i + 1).padStart(4, '0')}`;
    const client = `411${String(rand(1, 40)).padStart(3, '0')}`;
    const mt = rand(200_000, 6_000_000) * scale;
    push(d, 'BQ', pc, [
      { account: '521', label: 'Encaissement client', debit: mt },
      { account: client, label: 'Règlement', credit: mt, tiers: client },
    ]);
  }

  // ─── Règlements fournisseurs
  for (let i = 0; i < rand(25, 50); i++) {
    const d = date(rand(5, daysInMonth));
    const pc = `BQ-${year}${pad(month)}-P${String(i + 1).padStart(4, '0')}`;
    const fr = `401${String(rand(1, 30)).padStart(3, '0')}`;
    const mt = rand(150_000, 4_000_000) * scale;
    push(d, 'BQ', pc, [
      { account: fr, label: 'Règlement fournisseur', debit: mt, tiers: fr },
      { account: '521', label: 'Décaissement', credit: mt },
    ]);
  }

  // ─── OD : amortissements mensuels (1/12 du plan annuel)
  const dotMens = 12_000_000 * scale;
  push(date(daysInMonth), 'OD', `AMORT-${year}${pad(month)}`, [
    { account: '681', label: 'Dotation aux amortissements', debit: dotMens },
    { account: '284', label: 'Amort. matériel', credit: Math.round(dotMens * 0.6) },
    { account: '283', label: 'Amort. bâtiments', credit: Math.round(dotMens * 0.4) },
  ]);

  // ─── Impôts et taxes
  push(date(15), 'OD', `TAX-${year}${pad(month)}`, [
    { account: '64', label: 'Impôts et taxes', debit: 6_500_000 * scale },
    { account: '447', label: 'État - retenues', credit: 6_500_000 * scale },
  ]);

  // ─── Charges financières (intérêts emprunts)
  if (month % 3 === 0) {
    push(date(daysInMonth), 'BQ', `INT-${year}${pad(month)}`, [
      { account: '671', label: "Intérêts d'emprunt", debit: 14_000_000 * scale },
      { account: '521', label: 'Prélèvement intérêts', credit: 14_000_000 * scale },
    ]);
  }

  return entries;
}

export async function seedOrg(org: Organization, year: number, scale: number) {
  await db.organizations.put(org);

  const fy: FiscalYear = {
    id: `${org.id}-${year}`,
    orgId: org.id,
    year,
    startDate: `${year}-01-01`,
    endDate: `${year}-12-31`,
    closed: false,
  };
  await db.fiscalYears.put(fy);

  // Comptes : on inscrit les comptes SYSCOHADA principaux comme base
  const accounts: Account[] = SYSCOHADA_COA.map((s) => ({
    orgId: org.id,
    code: s.code,
    label: s.label,
    syscoCode: s.code,
    class: s.class,
    type: s.type,
  }));
  await db.accounts.bulkPut(accounts);

  // 12 périodes
  const monthLabels = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
  const periods: Period[] = [];
  for (let m = 1; m <= 12; m++) {
    periods.push({
      id: `${org.id}-${year}-${String(m).padStart(2, '0')}`,
      orgId: org.id,
      fiscalYearId: fy.id,
      year, month: m,
      label: `${monthLabels[m - 1]} ${year}`,
      closed: m < 12,
    });
  }
  await db.periods.bulkPut(periods);

  // GL : 12 mois d'écritures
  const allEntries: GLEntry[] = [];
  for (const p of periods) {
    allEntries.push(...makeEntries(org.id, p.id, p.year, p.month, scale));
  }
  await db.gl.bulkAdd(allEntries);

  // Écritures d'ouverture (À-nouveaux)
  const ouvId = `${org.id}-${year}-00`;
  await db.periods.put({
    id: ouvId, orgId: org.id, fiscalYearId: fy.id,
    year, month: 0, label: `À-nouveaux ${year}`, closed: true,
  });
  const opening: GLEntry[] = [
    { orgId: org.id, periodId: ouvId, date: `${year}-01-01`, journal: 'AN', piece: 'AN-001', account: '101', label: 'Capital social', debit: 0, credit: 800_000_000 * scale },
    { orgId: org.id, periodId: ouvId, date: `${year}-01-01`, journal: 'AN', piece: 'AN-001', account: '106', label: 'Réserves', debit: 0, credit: 320_000_000 * scale },
    { orgId: org.id, periodId: ouvId, date: `${year}-01-01`, journal: 'AN', piece: 'AN-001', account: '11', label: 'Report à nouveau', debit: 0, credit: 150_000_000 * scale },
    { orgId: org.id, periodId: ouvId, date: `${year}-01-01`, journal: 'AN', piece: 'AN-001', account: '162', label: 'Emprunts banques', debit: 0, credit: 420_000_000 * scale },
    { orgId: org.id, periodId: ouvId, date: `${year}-01-01`, journal: 'AN', piece: 'AN-002', account: '231', label: 'Bâtiments', debit: 650_000_000 * scale, credit: 0 },
    { orgId: org.id, periodId: ouvId, date: `${year}-01-01`, journal: 'AN', piece: 'AN-002', account: '241', label: 'Matériel industriel', debit: 480_000_000 * scale, credit: 0 },
    { orgId: org.id, periodId: ouvId, date: `${year}-01-01`, journal: 'AN', piece: 'AN-002', account: '245', label: 'Matériel de transport', debit: 120_000_000 * scale, credit: 0 },
    { orgId: org.id, periodId: ouvId, date: `${year}-01-01`, journal: 'AN', piece: 'AN-002', account: '283', label: 'Amort. bâtiments', debit: 0, credit: 180_000_000 * scale },
    { orgId: org.id, periodId: ouvId, date: `${year}-01-01`, journal: 'AN', piece: 'AN-002', account: '284', label: 'Amort. matériel', debit: 0, credit: 220_000_000 * scale },
    { orgId: org.id, periodId: ouvId, date: `${year}-01-01`, journal: 'AN', piece: 'AN-003', account: '31', label: 'Stock marchandises', debit: 185_000_000 * scale, credit: 0 },
    { orgId: org.id, periodId: ouvId, date: `${year}-01-01`, journal: 'AN', piece: 'AN-003', account: '32', label: 'Stock MP', debit: 95_000_000 * scale, credit: 0 },
    { orgId: org.id, periodId: ouvId, date: `${year}-01-01`, journal: 'AN', piece: 'AN-004', account: '411001', label: 'Clients', debit: 240_000_000 * scale, credit: 0, tiers: '411001' },
    { orgId: org.id, periodId: ouvId, date: `${year}-01-01`, journal: 'AN', piece: 'AN-005', account: '401001', label: 'Fournisseurs', debit: 0, credit: 165_000_000 * scale, tiers: '401001' },
    { orgId: org.id, periodId: ouvId, date: `${year}-01-01`, journal: 'AN', piece: 'AN-006', account: '521', label: 'Banque', debit: 215_000_000 * scale, credit: 0 },
    { orgId: org.id, periodId: ouvId, date: `${year}-01-01`, journal: 'AN', piece: 'AN-006', account: '57', label: 'Caisse', debit: 5_000_000 * scale, credit: 0 },
  ];
  // équilibrage
  const totD = opening.reduce((s, e) => s + e.debit, 0);
  const totC = opening.reduce((s, e) => s + e.credit, 0);
  if (totD !== totC) {
    opening.push({
      orgId: org.id, periodId: ouvId, date: `${year}-01-01`, journal: 'AN', piece: 'AN-999',
      account: '11', label: 'Équilibrage RAN',
      debit: totD < totC ? totC - totD : 0,
      credit: totD > totC ? totD - totC : 0,
    });
  }
  await db.gl.bulkAdd(opening);

  // Log import fictif
  await db.imports.add({
    orgId: org.id,
    date: Date.now(),
    user: 'Système (démo)',
    fileName: `demo_GL_${year}.csv`,
    source: 'Démo',
    kind: 'GL',
    count: allEntries.length,
    rejected: 0,
    status: 'success',
  });
}

export async function ensureSeeded() {
  // Plus de données démo — l'utilisateur importe ses propres données
  // via Grand Livre → Import
}

// Vider toute la base IndexedDB
export async function clearAllData() {
  await db.gl.clear();
  await db.accounts.clear();
  await db.periods.clear();
  await db.fiscalYears.clear();
  await db.organizations.clear();
  await db.imports.clear();
  await db.budgets.clear();
  await db.mappings.clear();
  await db.reports.clear();
  await db.templates.clear();
  await db.attentionPoints.clear();
  await db.actionPlans.clear();
}

// Supprimer les données d'une société spécifique
export async function clearOrgData(orgId: string) {
  await db.gl.where('orgId').equals(orgId).delete();
  await db.accounts.where('orgId').equals(orgId).delete();
  await db.periods.where('orgId').equals(orgId).delete();
  await db.fiscalYears.where('orgId').equals(orgId).delete();
  await db.imports.where('orgId').equals(orgId).delete();
  await db.budgets.where('orgId').equals(orgId).delete();
  await db.mappings.where('orgId').equals(orgId).delete();
  await db.organizations.delete(orgId);
}
