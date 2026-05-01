// Génération de templates Excel pré-formatés pour les imports
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { SYSCOHADA_COA } from '../syscohada/coa';

const HEADER_FILL: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF171717' } };
const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFAFAFA' }, size: 11 };
const ALT_FILL: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };

// ─── TEMPLATE GRAND LIVRE ───────────────────────────────────────────
export async function downloadGLTemplate(orgName?: string, year?: number) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'CockPit F&A';
  wb.created = new Date();
  const yyyy = year ?? new Date().getFullYear();

  // Feuille 1 : INSTRUCTIONS
  const wsInfo = wb.addWorksheet('Instructions');
  wsInfo.addRow(["MODÈLE D'IMPORT — GRAND LIVRE"]).font = { bold: true, size: 16 };
  wsInfo.addRow([`Société : ${orgName ?? 'À renseigner'}`]);
  wsInfo.addRow([`Exercice : ${yyyy}`]);
  wsInfo.addRow([]);
  wsInfo.addRow(['STRUCTURE DES COLONNES']).font = { bold: true, size: 13 };
  [
    'COMPTE — N° du compte SYSCOHADA (classes 1 à 9)',
    'LIBELLE — Libellé du compte (ex : Ventes de marchandises)',
    'DATE — Date de l\'écriture (AAAA-MM-JJ ou JJ/MM/AAAA)',
    'JOURNAL — Code journal (VT, AC, BQ, CA, OD, PAIE, AN)',
    'NUMERO DE SAISIE — Numéro de la pièce comptable',
    'DESCRIPTION — Libellé de l\'écriture',
    'LETTRAGE — Code de lettrage (facultatif)',
    'DEBIT — Montant débit',
    'CREDIT — Montant crédit',
    'SOLDE PROGRESSIF — calculé automatiquement (formule Excel)',
    'SOLDE — calculé automatiquement (formule Excel)',
  ].forEach((c) => wsInfo.addRow([c]));
  wsInfo.addRow([]);
  wsInfo.addRow(['JOURNAUX SUGGÉRÉS']).font = { bold: true, size: 13 };
  [
    'VT — Ventes (factures clients)',
    'AC — Achats (factures fournisseurs)',
    'BQ — Banque (encaissements / décaissements)',
    'CA — Caisse',
    'PAIE — Paie',
    'OD — Opérations diverses',
    'AN — À-nouveaux (écritures d\'ouverture)',
  ].forEach((j) => wsInfo.addRow([j]));
  wsInfo.getColumn(1).width = 100;

  // Feuille 2 : GRAND LIVRE
  const ws = wb.addWorksheet('Grand Livre');
  const headers = ['COMPTE', 'LIBELLE', 'DATE', 'JOURNAL', 'NUMERO DE SAISIE', 'DESCRIPTION', 'LETTRAGE', 'DEBIT', 'CREDIT', 'SOLDE PROGRESSIF', 'SOLDE'];
  ws.addRow(headers);
  const headerRow = ws.getRow(1);
  headerRow.eachCell((c) => { c.fill = HEADER_FILL; c.font = HEADER_FONT; c.alignment = { horizontal: 'center', vertical: 'middle' }; });
  headerRow.height = 22;

  // Exemples
  const samples: any[][] = [
    ['411001', 'Clients - SOCIETE A',           `${yyyy}-01-15`, 'VT',   'VT-001',   'Facture FA-2026-001 SOCIETE A', '',    1180000, 0,        null, null],
    ['701',    'Ventes de marchandises',        `${yyyy}-01-15`, 'VT',   'VT-001',   'Facture FA-2026-001',           '',    0,       1000000,  null, null],
    ['4431',   'État, TVA facturée',             `${yyyy}-01-15`, 'VT',   'VT-001',   'TVA 18% sur FA-2026-001',       '',    0,       180000,   null, null],
    ['601',    'Achats de marchandises',         `${yyyy}-01-20`, 'AC',   'AC-001',   'Facture FRN ABC',               '',    850000,  0,        null, null],
    ['4452',   'État, TVA récupérable',          `${yyyy}-01-20`, 'AC',   'AC-001',   'TVA déductible',                '',    153000,  0,        null, null],
    ['401001', 'Fournisseur ABC',                `${yyyy}-01-20`, 'AC',   'AC-001',   'Facture FRN ABC',               '',    0,       1003000,  null, null],
    ['661',    'Rémunérations directes',         `${yyyy}-01-31`, 'PAIE', 'PAIE-01',  'Salaires bruts janvier',        '',    2500000, 0,        null, null],
    ['422',    'Personnel - rémunérations dues', `${yyyy}-01-31`, 'PAIE', 'PAIE-01',  'Net à payer',                   '',    0,       2100000,  null, null],
    ['431',    'Sécurité sociale',               `${yyyy}-01-31`, 'PAIE', 'PAIE-01',  'Charges sociales',              '',    0,       400000,   null, null],
  ];
  samples.forEach((row, i) => {
    const r = ws.addRow(row);
    const rowNum = r.number;
    // Solde progressif = somme cumulée Débit − Crédit pour le même compte
    r.getCell(10).value = { formula: `SUMIFS($H$2:$H${rowNum},$A$2:$A${rowNum},A${rowNum}) - SUMIFS($I$2:$I${rowNum},$A$2:$A${rowNum},A${rowNum})` };
    // Solde = Débit − Crédit (de la ligne)
    r.getCell(11).value = { formula: `H${rowNum}-I${rowNum}` };
    if (i % 2 === 0) r.eachCell((c, idx) => { if (idx > 0) c.fill = ALT_FILL; });
    [8, 9, 10, 11].forEach((col) => { r.getCell(col).numFmt = '#,##0;[Red]-#,##0'; r.getCell(col).alignment = { horizontal: 'right' }; });
  });

  ws.columns = [
    { width: 12 }, { width: 35 }, { width: 12 }, { width: 10 }, { width: 16 },
    { width: 38 }, { width: 12 }, { width: 16 }, { width: 16 }, { width: 18 }, { width: 16 },
  ];
  ws.getColumn(1).alignment = { horizontal: 'center' };
  ws.getColumn(3).alignment = { horizontal: 'center' };
  ws.getColumn(4).alignment = { horizontal: 'center' };
  ws.getColumn(5).alignment = { horizontal: 'center' };
  ws.getColumn(7).alignment = { horizontal: 'center' };

  // 1000 lignes vides pré-formatées avec formules
  for (let i = 0; i < 1000; i++) {
    const r = ws.addRow([]);
    const rn = r.number;
    r.getCell(3).numFmt = 'yyyy-mm-dd';
    r.getCell(10).value = { formula: `IF(A${rn}="","",SUMIFS($H$2:$H${rn},$A$2:$A${rn},A${rn})-SUMIFS($I$2:$I${rn},$A$2:$A${rn},A${rn}))` };
    r.getCell(11).value = { formula: `IF(A${rn}="","",H${rn}-I${rn})` };
    [8, 9, 10, 11].forEach((col) => { r.getCell(col).numFmt = '#,##0;[Red]-#,##0'; });
  }

  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };

  // Feuille 3 : COMPTES SYSCOHADA
  const wsCoa = wb.addWorksheet('Comptes SYSCOHADA');
  wsCoa.addRow(['Code', 'Libellé', 'Classe', 'Type']).eachCell((c) => { c.fill = HEADER_FILL; c.font = HEADER_FONT; c.alignment = { horizontal: 'center' }; });
  SYSCOHADA_COA.forEach((a) => wsCoa.addRow([a.code, a.label, a.class, a.type]));
  wsCoa.columns = [{ width: 10 }, { width: 50 }, { width: 10 }, { width: 10 }];
  wsCoa.views = [{ state: 'frozen', ySplit: 1 }];
  wsCoa.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 4 } };

  const buf = await wb.xlsx.writeBuffer();
  saveAs(new Blob([buf]), `Modele_GrandLivre_${orgName ? orgName.replace(/\s+/g, '_') + '_' : ''}${yyyy}.xlsx`);
}

// ─── TEMPLATE GRAND LIVRE TIERS ─────────────────────────────────────
export async function downloadTiersTemplate(orgName?: string, year?: number) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'CockPit F&A';
  wb.created = new Date();
  const yyyy = year ?? new Date().getFullYear();
  const ws = wb.addWorksheet('GL Tiers');
  const headers = ['DATE', 'JOURNAL', 'N° PIECE', 'COMPTE GENERAL', 'CODE TIERS', 'NOM TIERS', 'LIBELLE', 'DEBIT', 'CREDIT'];
  ws.addRow(headers);
  ws.getRow(1).eachCell((c) => { c.fill = HEADER_FILL; c.font = HEADER_FONT; c.alignment = { horizontal: 'center' }; });
  // Exemples
  const examples = [
    [`01/01/${yyyy}`, 'VT', 'FA001', '411', 'CLI001', 'SOCIETE ALPHA', 'Facture vente marchandises', 1500000, 0],
    [`01/01/${yyyy}`, 'VT', 'FA001', '411', 'CLI002', 'ENTREPRISE BETA', 'Facture prestation services', 850000, 0],
    [`15/01/${yyyy}`, 'BQ', 'RG001', '411', 'CLI001', 'SOCIETE ALPHA', 'Règlement facture FA001', 0, 1500000],
    [`05/02/${yyyy}`, 'AC', 'FF001', '401', 'FRN001', 'FOURNISSEUR GAMMA', 'Facture achat fournitures', 0, 2300000],
    [`20/02/${yyyy}`, 'BQ', 'VP001', '401', 'FRN001', 'FOURNISSEUR GAMMA', 'Virement fournisseur', 2300000, 0],
  ];
  for (let i = 0; i < examples.length; i++) {
    const row = ws.addRow(examples[i]);
    if (i % 2 === 1) row.eachCell((c) => { c.fill = ALT_FILL; });
  }
  ws.columns = [
    { width: 14 }, { width: 10 }, { width: 12 }, { width: 16 }, { width: 14 }, { width: 30 },
    { width: 40 }, { width: 16 }, { width: 16 },
  ];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 9 } };

  // Feuille instructions
  const wsHelp = wb.addWorksheet('Instructions');
  wsHelp.addRow(['IMPORT GRAND LIVRE TIERS — CockPit F&A']);
  wsHelp.addRow([]);
  wsHelp.addRow(['Ce fichier sert à importer le détail des tiers (clients 411 et fournisseurs 401).']);
  wsHelp.addRow(['Il enrichit les écritures du Grand Livre Général avec le code et le nom du tiers.']);
  wsHelp.addRow([]);
  wsHelp.addRow(['Colonnes OBLIGATOIRES : DATE, COMPTE GENERAL, CODE TIERS, NOM TIERS, DEBIT, CREDIT']);
  wsHelp.addRow(['Colonnes optionnelles : JOURNAL, N° PIECE, LIBELLE']);
  wsHelp.addRow([]);
  wsHelp.addRow(['Le rapprochement se fait par : DATE + COMPTE + DEBIT + CREDIT']);
  wsHelp.addRow(['Si une correspondance est trouvée dans le GL, le code tiers est ajouté (pas de doublon).']);
  wsHelp.addRow(['Si aucune correspondance, l\'écriture est créée en mode standalone.']);
  wsHelp.getRow(1).font = { bold: true, size: 14 };
  wsHelp.getColumn(1).width = 80;

  const buf = await wb.xlsx.writeBuffer();
  saveAs(new Blob([buf]), `Modele_GL_Tiers_${orgName ? orgName.replace(/\s+/g, '_') + '_' : ''}${yyyy}.xlsx`);
}

// ─── TEMPLATE BALANCE GÉNÉRALE ──────────────────────────────────────
export async function downloadBalanceGeneraleTemplate(orgName?: string, year?: number) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'CockPit F&A';
  wb.created = new Date();
  const yyyy = year ?? new Date().getFullYear();

  const wsInfo = wb.addWorksheet('Instructions');
  wsInfo.addRow(["MODÈLE D'IMPORT — BALANCE GÉNÉRALE"]).font = { bold: true, size: 16 };
  wsInfo.addRow([`Société : ${orgName ?? '—'} · Exercice : ${yyyy}`]);
  wsInfo.addRow([]);
  ['Une ligne par compte du plan comptable.', 'Mouvements = totaux Débit/Crédit cumulés sur la période.', 'Soldes finaux = Soldes initiaux + Mouvements.'].forEach((l) => wsInfo.addRow([l]));
  wsInfo.getColumn(1).width = 100;

  const ws = wb.addWorksheet('Balance Générale');
  const headers = ['COMPTE', 'LIBELLE', 'SOLDE INITIAL DEBIT', 'SOLDE INITIAL CREDIT', 'MOUVEMENT DEBIT', 'MOUVEMENT CREDIT', 'SOLDE FINAL DEBIT', 'SOLDE FINAL CREDIT'];
  ws.addRow(headers);
  ws.getRow(1).eachCell((c) => { c.fill = HEADER_FILL; c.font = HEADER_FONT; c.alignment = { horizontal: 'center' }; });
  ws.getRow(1).height = 22;

  const examples: any[][] = [
    ['101', 'Capital social',          0, 800000000, 0,        0,         0, 800000000],
    ['411', 'Clients',                  240000000, 0, 1180000,  900000,    520000000, 0],
    ['401', 'Fournisseurs',             0, 165000000, 850000,   1003000,   0, 318000000],
    ['521', 'Banque',                   215000000, 0, 900000,   850000,    215050000, 0],
    ['601', 'Achats marchandises',      0, 0,        850000,    0,         850000, 0],
    ['701', 'Ventes marchandises',      0, 0,        0,         1000000,   0, 1000000],
  ];
  examples.forEach((row, i) => {
    const r = ws.addRow(row);
    const rn = r.number;
    // Formules : solde final = initial + mouvements
    r.getCell(7).value = { formula: `MAX(0, C${rn}+E${rn}-D${rn}-F${rn})` };
    r.getCell(8).value = { formula: `MAX(0, D${rn}+F${rn}-C${rn}-E${rn})` };
    if (i % 2 === 0) r.eachCell((c, idx) => { if (idx > 0) c.fill = ALT_FILL; });
    [3, 4, 5, 6, 7, 8].forEach((col) => { r.getCell(col).numFmt = '#,##0;[Red]-#,##0'; r.getCell(col).alignment = { horizontal: 'right' }; });
  });
  for (let i = 0; i < 500; i++) {
    const r = ws.addRow([]);
    const rn = r.number;
    r.getCell(7).value = { formula: `IF(A${rn}="","",MAX(0,C${rn}+E${rn}-D${rn}-F${rn}))` };
    r.getCell(8).value = { formula: `IF(A${rn}="","",MAX(0,D${rn}+F${rn}-C${rn}-E${rn}))` };
    [3, 4, 5, 6, 7, 8].forEach((col) => { r.getCell(col).numFmt = '#,##0;[Red]-#,##0'; });
  }
  ws.columns = [{ width: 12 }, { width: 38 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }];
  ws.views = [{ state: 'frozen', xSplit: 2, ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };

  const buf = await wb.xlsx.writeBuffer();
  saveAs(new Blob([buf]), `Modele_BalanceGenerale_${orgName ? orgName.replace(/\s+/g, '_') + '_' : ''}${yyyy}.xlsx`);
}

// ─── TEMPLATE BALANCE AUXILIAIRE ────────────────────────────────────
export async function downloadBalanceAuxiliaireTemplate(orgName?: string, year?: number, kind: 'clients' | 'fournisseurs' = 'clients') {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'CockPit F&A';
  wb.created = new Date();
  const yyyy = year ?? new Date().getFullYear();

  const wsInfo = wb.addWorksheet('Instructions');
  wsInfo.addRow([`MODÈLE D'IMPORT — BALANCE AUXILIAIRE ${kind.toUpperCase()}`]).font = { bold: true, size: 16 };
  wsInfo.addRow([`Société : ${orgName ?? '—'} · Exercice : ${yyyy}`]);
  wsInfo.addRow([]);
  ['Une ligne par tiers (client ou fournisseur).', 'Le compte général est habituellement 411 (clients) ou 401 (fournisseurs).', 'Le code tiers est unique par société.'].forEach((l) => wsInfo.addRow([l]));
  wsInfo.getColumn(1).width = 100;

  const ws = wb.addWorksheet(`Balance ${kind === 'clients' ? 'Clients' : 'Fournisseurs'}`);
  const headers = ['COMPTE GENERAL', 'CODE TIERS', 'NOM DU TIERS', 'SOLDE INITIAL DEBIT', 'SOLDE INITIAL CREDIT', 'MOUVEMENT DEBIT', 'MOUVEMENT CREDIT', 'SOLDE FINAL DEBIT', 'SOLDE FINAL CREDIT'];
  ws.addRow(headers);
  ws.getRow(1).eachCell((c) => { c.fill = HEADER_FILL; c.font = HEADER_FONT; c.alignment = { horizontal: 'center' }; });
  ws.getRow(1).height = 22;

  const generalAccount = kind === 'clients' ? '411' : '401';
  const examples = kind === 'clients' ? [
    [generalAccount, 'CLI001', 'SOCIETE GENERALE CI',       80000000,  0, 18000000,  10000000, 0, 0],
    [generalAccount, 'CLI002', 'ORANGE COTE D\'IVOIRE',     65000000,  0, 12000000,  20000000, 0, 0],
    [generalAccount, 'CLI003', 'TOTAL ENERGIES MARKETING',  45000000,  0, 25000000,  18000000, 0, 0],
    [generalAccount, 'CLI004', 'BOLLORE TRANSPORT',         30000000,  0, 8000000,   12000000, 0, 0],
  ] : [
    [generalAccount, 'FRS001', 'CFAO EQUIPMENT',             0, 60000000, 5000000,  20000000,  0, 0],
    [generalAccount, 'FRS002', 'TOTAL ENERGIES',             0, 45000000, 8000000,  15000000,  0, 0],
    [generalAccount, 'FRS003', 'SODECI',                     0, 18000000, 3000000,  10000000,  0, 0],
  ];
  examples.forEach((row, i) => {
    const r = ws.addRow(row);
    const rn = r.number;
    r.getCell(8).value = { formula: `MAX(0, D${rn}+F${rn}-E${rn}-G${rn})` };
    r.getCell(9).value = { formula: `MAX(0, E${rn}+G${rn}-D${rn}-F${rn})` };
    if (i % 2 === 0) r.eachCell((c, idx) => { if (idx > 0) c.fill = ALT_FILL; });
    [4, 5, 6, 7, 8, 9].forEach((col) => { r.getCell(col).numFmt = '#,##0;[Red]-#,##0'; r.getCell(col).alignment = { horizontal: 'right' }; });
  });
  for (let i = 0; i < 500; i++) {
    const r = ws.addRow([]);
    const rn = r.number;
    r.getCell(8).value = { formula: `IF(B${rn}="","",MAX(0,D${rn}+F${rn}-E${rn}-G${rn}))` };
    r.getCell(9).value = { formula: `IF(B${rn}="","",MAX(0,E${rn}+G${rn}-D${rn}-F${rn}))` };
    [4, 5, 6, 7, 8, 9].forEach((col) => { r.getCell(col).numFmt = '#,##0;[Red]-#,##0'; });
  }
  ws.columns = [{ width: 14 }, { width: 14 }, { width: 38 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }];
  ws.views = [{ state: 'frozen', xSplit: 3, ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };

  const buf = await wb.xlsx.writeBuffer();
  saveAs(new Blob([buf]), `Modele_BalanceAuxiliaire_${kind}_${orgName ? orgName.replace(/\s+/g, '_') + '_' : ''}${yyyy}.xlsx`);
}

// ─── TEMPLATE BALANCE ÂGÉE ──────────────────────────────────────────
export async function downloadBalanceAgeeTemplate(orgName?: string, year?: number, kind: 'clients' | 'fournisseurs' = 'clients') {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'CockPit F&A';
  wb.created = new Date();
  const yyyy = year ?? new Date().getFullYear();

  const wsInfo = wb.addWorksheet('Instructions');
  wsInfo.addRow([`MODÈLE D'IMPORT — BALANCE ÂGÉE ${kind.toUpperCase()}`]).font = { bold: true, size: 16 };
  wsInfo.addRow([`Société : ${orgName ?? '—'} · Exercice : ${yyyy}`]);
  wsInfo.addRow([]);
  ['Une ligne par tiers.', 'Total = somme des 5 tranches d\'âge.', 'Date de référence = date de la balance (généralement fin de période).'].forEach((l) => wsInfo.addRow([l]));
  wsInfo.getColumn(1).width = 100;

  const ws = wb.addWorksheet(`Balance Âgée ${kind === 'clients' ? 'Clients' : 'Fournisseurs'}`);
  const headers = ['CODE TIERS', 'NOM DU TIERS', 'COMPTE', 'NON ECHU', '0-30 JOURS', '31-60 JOURS', '61-90 JOURS', '> 90 JOURS', 'TOTAL'];
  ws.addRow(headers);
  ws.getRow(1).eachCell((c) => { c.fill = HEADER_FILL; c.font = HEADER_FONT; c.alignment = { horizontal: 'center' }; });
  ws.getRow(1).height = 22;

  const generalAccount = kind === 'clients' ? '411' : '401';
  const examples = [
    ['CLI001', 'SOCIETE GENERALE CI',       generalAccount, 30000000, 28000000, 12000000, 8000000, 2000000, null],
    ['CLI002', 'ORANGE COTE D\'IVOIRE',     generalAccount, 25000000, 20000000, 12000000, 6000000, 2000000, null],
    ['CLI003', 'TOTAL ENERGIES MARKETING',  generalAccount, 18000000, 15000000, 8000000,  3000000, 1000000, null],
    ['CLI004', 'BOLLORE TRANSPORT',         generalAccount, 12000000, 10000000, 5000000,  2000000, 1000000, null],
  ];
  examples.forEach((row, i) => {
    const r = ws.addRow(row);
    const rn = r.number;
    r.getCell(9).value = { formula: `SUM(D${rn}:H${rn})` };
    if (i % 2 === 0) r.eachCell((c, idx) => { if (idx > 0) c.fill = ALT_FILL; });
    [4, 5, 6, 7, 8, 9].forEach((col) => { r.getCell(col).numFmt = '#,##0;[Red]-#,##0'; r.getCell(col).alignment = { horizontal: 'right' }; });
    r.getCell(9).font = { bold: true };
  });
  for (let i = 0; i < 500; i++) {
    const r = ws.addRow([]);
    const rn = r.number;
    r.getCell(9).value = { formula: `IF(A${rn}="","",SUM(D${rn}:H${rn}))` };
    [4, 5, 6, 7, 8, 9].forEach((col) => { r.getCell(col).numFmt = '#,##0;[Red]-#,##0'; });
  }
  ws.columns = [{ width: 14 }, { width: 38 }, { width: 12 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 18 }];
  ws.views = [{ state: 'frozen', xSplit: 3, ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };

  const buf = await wb.xlsx.writeBuffer();
  saveAs(new Blob([buf]), `Modele_BalanceAgee_${kind}_${orgName ? orgName.replace(/\s+/g, '_') + '_' : ''}${yyyy}.xlsx`);
}

// ─── TEMPLATE PLAN COMPTABLE ───────────────────────────────────────
export async function downloadCOATemplate(orgName?: string) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'CockPit F&A';
  wb.created = new Date();

  // Feuille 1 : INSTRUCTIONS
  const wsInfo = wb.addWorksheet('Instructions');
  wsInfo.addRow(['MODÈLE D\'IMPORT — PLAN COMPTABLE']).font = { bold: true, size: 16 };
  wsInfo.addRow([`Société : ${orgName ?? 'À renseigner'}`]);
  wsInfo.addRow([]);
  wsInfo.addRow(['CONSIGNES DE REMPLISSAGE']).font = { bold: true, size: 13 };
  [
    '1. Une ligne = un compte du plan comptable de la société.',
    '2. Le code compte doit être cohérent avec SYSCOHADA (classes 1 à 9).',
    '3. Le mapping vers le compte SYSCOHADA est automatique par préfixe si non renseigné.',
    '4. Type : A (Actif), P (Passif), C (Charge), R (Produit), X (autre).',
    '5. Classe : premier chiffre du compte (1 à 9).',
    '6. Les comptes auxiliaires (clients, fournisseurs) sont également acceptés.',
    '7. Importer ensuite le fichier dans CockPit → Plan comptable → Importer.',
  ].forEach((c) => wsInfo.addRow([c]));
  wsInfo.getColumn(1).width = 100;

  // Feuille 2 : PLAN COMPTABLE
  const ws = wb.addWorksheet('Plan comptable');
  const headers = ['Code', 'Libellé', 'Classe', 'Type', 'Compte SYSCOHADA', 'Observations'];
  ws.addRow(headers);
  const headerRow = ws.getRow(1);
  headerRow.eachCell((c) => { c.fill = HEADER_FILL; c.font = HEADER_FONT; c.alignment = { horizontal: 'center', vertical: 'middle' }; });
  headerRow.height = 22;

  // Exemples
  const samples = [
    ['10',     'Capital',                     '1', 'P', '10',   'Classe capitaux'],
    ['101',    'Capital social',              '1', 'P', '101',  ''],
    ['106',    'Réserves',                    '1', 'P', '106',  ''],
    ['11',     'Report à nouveau',            '1', 'P', '11',   ''],
    ['231',    'Bâtiments',                   '2', 'A', '231',  ''],
    ['411001', 'Client SOCIETE A',            '4', 'A', '411',  'Compte auxiliaire'],
    ['401001', 'Fournisseur ABC',             '4', 'P', '401',  'Compte auxiliaire'],
    ['521',    'Banque locale',               '5', 'A', '521',  ''],
    ['601',    'Achats de marchandises',      '6', 'C', '601',  ''],
    ['661',    'Rémunérations du personnel',  '6', 'C', '661',  ''],
    ['701',    'Ventes de marchandises',      '7', 'R', '701',  ''],
  ];
  samples.forEach((row, i) => {
    const r = ws.addRow(row);
    if (i % 2 === 0) r.eachCell((c) => { c.fill = ALT_FILL; });
  });

  ws.columns = [
    { width: 14 }, { width: 40 }, { width: 10 }, { width: 10 }, { width: 18 }, { width: 30 },
  ];
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };

  // 500 lignes vides pré-formatées
  for (let i = 0; i < 500; i++) ws.addRow([]);

  // Feuille 3 : RÉFÉRENTIEL SYSCOHADA
  const wsCoa = wb.addWorksheet('Référentiel SYSCOHADA');
  wsCoa.addRow(['Code', 'Libellé', 'Classe', 'Type']).eachCell((c) => { c.fill = HEADER_FILL; c.font = HEADER_FONT; c.alignment = { horizontal: 'center' }; });
  SYSCOHADA_COA.forEach((a) => wsCoa.addRow([a.code, a.label, a.class, a.type]));
  wsCoa.columns = [{ width: 10 }, { width: 50 }, { width: 10 }, { width: 10 }];
  wsCoa.views = [{ state: 'frozen', ySplit: 1 }];
  wsCoa.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 4 } };

  const buf = await wb.xlsx.writeBuffer();
  saveAs(new Blob([buf]), `Modele_PlanComptable_${orgName ? orgName.replace(/\s+/g, '_') + '_' : ''}.xlsx`);
}

// ─── TEMPLATE BUDGET ──────────────────────────────────────────────
export async function downloadBudgetTemplate(orgName?: string, year?: number, version: string = 'V1_initial') {
  const yyyy = year ?? new Date().getFullYear();
  const wb = new ExcelJS.Workbook();
  wb.creator = 'CockPit F&A';
  wb.created = new Date();

  // Feuille 1 : INSTRUCTIONS
  const wsInfo = wb.addWorksheet('Instructions');
  wsInfo.addRow([`MODÈLE D'IMPORT — BUDGET ${yyyy}`]).font = { bold: true, size: 16 };
  wsInfo.addRow([`Société : ${orgName ?? 'À renseigner'}`]);
  wsInfo.addRow([`Version : ${version}`]);
  wsInfo.addRow([]);
  wsInfo.addRow(['CONSIGNES DE REMPLISSAGE']).font = { bold: true, size: 13 };
  [
    "1. Une ligne = un compte budgétisé (classes 6 et 7 du plan SYSCOHADA).",
    "2. Saisissez les montants prévisionnels mensuels de Janvier à Décembre.",
    "3. La colonne « Total annuel » se calcule automatiquement.",
    "4. Vous pouvez ajouter / supprimer des comptes selon vos besoins.",
    "5. Pour répartir un montant annuel : utilisez l'outil de répartition dans CockPit → Budget.",
    "6. Importer ensuite le fichier dans CockPit → Budget → Importer le budget.",
    "7. Plusieurs versions possibles : V1_initial, V2_revise, Forecast, Budget_cible…",
  ].forEach((c) => wsInfo.addRow([c]));
  wsInfo.getColumn(1).width = 100;

  // Feuille 2 : BUDGET
  const ws = wb.addWorksheet(`Budget ${yyyy}`);
  const headers = ['Compte', 'Libellé', 'Type',
    'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
    'Total annuel'];
  ws.addRow(headers);
  const headerRow = ws.getRow(1);
  headerRow.eachCell((c) => { c.fill = HEADER_FILL; c.font = HEADER_FONT; c.alignment = { horizontal: 'center', vertical: 'middle' }; });
  headerRow.height = 22;

  // Pré-population des comptes 6 et 7 budgétisables (3 caractères max — comptes principaux)
  const budgetable = SYSCOHADA_COA.filter((a) => (a.class === '6' || a.class === '7') && a.code.length <= 3);

  // Section PRODUITS
  const sep = (label: string) => {
    const r = ws.addRow([label]);
    r.font = { bold: true, color: { argb: 'FFFAFAFA' } };
    r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF404040' } };
    ws.mergeCells(r.number, 1, r.number, headers.length);
  };

  sep('═══ PRODUITS (classe 7) ═══');
  budgetable.filter((a) => a.class === '7').forEach((a, i) => {
    const r = ws.addRow([a.code, a.label, 'Produit',
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      // Formule total annuel : SUM(D:O)
    ]);
    // Ajouter la formule somme
    const rowNum = r.number;
    r.getCell(16).value = { formula: `SUM(D${rowNum}:O${rowNum})` };
    if (i % 2 === 0) r.eachCell((c, idx) => { if (idx > 0) c.fill = ALT_FILL; });
    for (let m = 4; m <= 16; m++) r.getCell(m).numFmt = '#,##0;[Red]-#,##0';
    r.getCell(16).font = { bold: true };
  });

  ws.addRow([]);
  sep('═══ CHARGES (classe 6) ═══');
  budgetable.filter((a) => a.class === '6').forEach((a, i) => {
    const r = ws.addRow([a.code, a.label, 'Charge',
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);
    const rowNum = r.number;
    r.getCell(16).value = { formula: `SUM(D${rowNum}:O${rowNum})` };
    if (i % 2 === 0) r.eachCell((c, idx) => { if (idx > 0) c.fill = ALT_FILL; });
    for (let m = 4; m <= 16; m++) r.getCell(m).numFmt = '#,##0;[Red]-#,##0';
    r.getCell(16).font = { bold: true };
  });

  // Ligne totale en bas (somme par colonne)
  ws.addRow([]);
  const lastDataRow = ws.lastRow!.number - 1;
  const totalRow = ws.addRow(['TOTAL', '', '']);
  totalRow.font = { bold: true, color: { argb: 'FFFAFAFA' } };
  totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF171717' } };
  for (let m = 4; m <= 16; m++) {
    const cell = totalRow.getCell(m);
    const colLetter = String.fromCharCode(64 + m);
    cell.value = { formula: `SUM(${colLetter}3:${colLetter}${lastDataRow})` };
    cell.numFmt = '#,##0;[Red]-#,##0';
  }

  // Largeurs
  ws.columns = [
    { width: 10 }, { width: 38 }, { width: 10 },
    { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 },
    { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 },
    { width: 16 },
  ];
  ws.views = [{ state: 'frozen', xSplit: 3, ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };

  // Génération + téléchargement
  const buf = await wb.xlsx.writeBuffer();
  const fileName = `Modele_Budget_${orgName ? orgName.replace(/\s+/g, '_') + '_' : ''}${yyyy}_${version}.xlsx`;
  saveAs(new Blob([buf]), fileName);
}
