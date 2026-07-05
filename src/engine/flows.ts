// TFT, TAFIRE, Variation des capitaux propres — SYSCOHADA révisé 2017
//
// Source de données : Supabase via dataProvider (obligatoire).
import { computeBalance, type BalanceRow } from './balance';
import { computeBilan, computeSIG, Line } from './statements';
import { dataProvider } from '../db/provider';
import { sumMoneyWhere } from '../lib/moneySum';

// ─── Utilitaires ────────────────────────────────────────────────────────────
function get(lines: Line[], code: string): number {
  return lines.find((l) => l.code === code)?.value ?? 0;
}

// Lit les mouvements GL bruts (D et C séparés) pour un ou plusieurs préfixes.
// Indispensable pour distinguer les vraies augmentations / diminutions /
// affectations sur les comptes de capitaux et de tiers, là où le simple
// solde net masque ces flux.
async function getMovementsByPrefix(orgId: string, year: number, prefixes: string[]): Promise<{ debit: number; credit: number }> {
  const [periods, entries] = await Promise.all([
    dataProvider.getPeriods(orgId),
    dataProvider.getGLEntries({ orgId }),
  ]);
  const ids = new Set(periods.filter((p) => p.year === year && p.month >= 1).map((p) => p.id));
  let d = 0, c = 0;
  for (const e of entries) {
    if (!ids.has(e.periodId)) continue;
    if (!prefixes.some((p) => e.account.startsWith(p))) continue;
    d += e.debit;
    c += e.credit;
  }
  return { debit: d, credit: c };
}

// Dotations sur IMMOBILISATIONS = 681 (hors 6817 = prov. actif circulant) + 687
// (DAP HAO sur immo). À utiliser pour reconstituer les ACQUISITIONS brutes
// d'immobilisations — à ne PAS confondre avec les dotations TOTALES (68+69) qui
// servent à la CAFG. Source unique partagée par TFT annuel/mensuel et TAFIRE
// (M-2 : avant, le TFT mensuel et la TAFIRE utilisaient à tort 68+69 complet).
export function sumDotationsImmo(rows: BalanceRow[]): number {
  return rows
    .filter((r) => (r.account.startsWith('681') && !r.account.startsWith('6817')) || r.account.startsWith('687'))
    .reduce((s, r) => s + (r.soldeD - r.soldeC), 0);
}

async function buildSnapshots(orgId: string, year: number) {
  // Ouverture = uniquement à-nouveaux (mois 0)
  const openingBal = await computeBalance({ orgId, year, uptoMonth: 0, includeOpening: true });
  // Clôture = tout l'exercice (à-nouveaux + mouvements)
  const closingBal = await computeBalance({ orgId, year, includeOpening: true });

  const bilanO = computeBilan(openingBal);
  const bilanC = computeBilan(closingBal);
  const { sig } = computeSIG(closingBal);

  // Sommes par préfixe de compte sur le GL
  const sum = (rows: typeof closingBal, prefixes: string[], sign: 'D' | 'C' = 'D'): number => {
    let s = 0;
    for (const r of rows) {
      if (!prefixes.some((p) => r.account.startsWith(p))) continue;
      s += sign === 'D' ? (r.soldeD || 0) : (r.soldeC || 0);
    }
    return s;
  };

  return { openingBal, closingBal, bilanO, bilanC, sig, sum };
}

// ═══════════════════════════════════════════════════════════════════════════
// TFT — Tableau des Flux de Trésorerie (méthode indirecte SYSCOHADA)
// ═══════════════════════════════════════════════════════════════════════════
export type TFTResult = {
  lines: Line[];
  totals: {
    cafg: number;
    fluxOperationnels: number;
    fluxInvestissement: number;
    fluxFinancement: number;
    variationTreso: number;
    tresoOuverture: number;
    tresoCloture: number;
  };
};

export async function computeTFT(orgId: string, year: number): Promise<TFTResult> {
  const { bilanO, bilanC, sig, closingBal } = await buildSnapshots(orgId, year);

  // Résultat net de l'exercice
  const resultat = sig.resultat;

  // Dotations TOTALES (pour CAFG) = 68 + 69 nets de 78 + 79
  const dotationsTot = closingBal
    .filter((r) => r.account.startsWith('68') || r.account.startsWith('69'))
    .reduce((s, r) => s + (r.soldeD - r.soldeC), 0);
  const reprises = closingBal
    .filter((r) => r.account.startsWith('78') || r.account.startsWith('79'))
    .reduce((s, r) => s + (r.soldeC - r.soldeD), 0);
  const dotationsNettes = dotationsTot - reprises;

  // Dotations sur IMMOBILISATIONS uniquement (pour le calcul des acquisitions).
  const dotationsImmo = sumDotationsImmo(closingBal);

  // Plus / moins values sur cessions
  // (P1-4) VNC strictement compte 685 (Valeur nette comptable des immobilisations
  // cédées). Le filtre 81 incluait toutes les charges HAO (811-818) et
  // surestimait la VNC cédée.
  const vnc = closingBal.filter((r) => r.account.startsWith('685')).reduce((s, r) => s + r.soldeD, 0);
  const pxCess = closingBal.filter((r) => r.account.startsWith('82')).reduce((s, r) => s + r.soldeC, 0);
  const plusValueCession = pxCess - vnc;

  // CAFG = Résultat + dotations nettes − plus-values cessions
  const cafg = resultat + dotationsNettes - plusValueCession;

  // Variations du BFR d'exploitation (N − N-1)
  const stocksO = get(bilanO.actif, 'BB');
  const stocksC = get(bilanC.actif, 'BB');
  const creancesO = get(bilanO.actif, 'BH');
  const creancesC = get(bilanC.actif, 'BH');
  const autreCreO = get(bilanO.actif, 'BI');
  const autreCreC = get(bilanC.actif, 'BI');
  const fournO = get(bilanO.passif, 'DJ');
  const fournC = get(bilanC.passif, 'DJ');
  const fiscSocO = get(bilanO.passif, 'DK');
  const fiscSocC = get(bilanC.passif, 'DK');
  const autDetO = get(bilanO.passif, 'DM');
  const autDetC = get(bilanC.passif, 'DM');

  const varStocks = -(stocksC - stocksO);     // augmentation → décaissement
  const varCreances = -((creancesC + autreCreC) - (creancesO + autreCreO));
  const varDettesExpl = (fournC + fiscSocC + autDetC) - (fournO + fiscSocO + autDetO);

  const varBFR = varStocks + varCreances + varDettesExpl;
  const fluxOperationnels = cafg + varBFR;

  // Flux d'investissement — reconstitution des ACQUISITIONS BRUTES à partir de
  // la VNC (valeur nette comptable) :
  //   VNC_clôture = VNC_ouverture + acquisitions − dotations_immo − VNC_cédée
  //   ⇒ acquisitions = ΔVNC + dotations_immo + VNC_cédée
  // (M-1) On ajoute la VNC des immo CÉDÉES (685), sinon les cessions minorent à
  // tort les acquisitions calculées les exercices où il y a des sorties d'actif.
  const immoO = bilanO.actif.filter((l) => ['AD', 'AE', 'AF', 'AG'].includes(l.code)).reduce((s, l) => s + l.value, 0);
  const immoC = bilanC.actif.filter((l) => ['AD', 'AE', 'AF', 'AG'].includes(l.code)).reduce((s, l) => s + l.value, 0);
  const acquisitions = -(immoC - immoO + dotationsImmo + vnc);
  const cessions = pxCess; // prix des cessions (82)
  const fluxInvestissement = acquisitions + cessions;

  // ── Flux de financement — VRAIS mouvements GL ──
  // BUG FIX (audit) : ajout du compte 108 (Compte de l'exploitant — entreprises
  // individuelles), retrait du préfixe '10' qui englobait 109 (Capital non
  // appelé, débiteur normal). Liste explicite des comptes de capital appelé.
  const movCapital = await getMovementsByPrefix(orgId, year, ['101', '102', '103', '104', '105', '108']);
  const augCapital = movCapital.credit;
  const reducCapital = movCapital.debit;

  // Subventions d'investissement reçues = mouvements CRÉDIT sur 14
  const movSubv = await getMovementsByPrefix(orgId, year, ['14']);
  const augSubv = movSubv.credit;

  // Emprunts nouveaux  = mouvements CRÉDIT sur 16, 17, 18
  // Remboursements     = mouvements DÉBIT  sur 16, 17, 18
  const movEmprunts = await getMovementsByPrefix(orgId, year, ['16', '17', '18']);
  const newEmprunts = movEmprunts.credit;
  const remboursementsEmprunts = movEmprunts.debit;

  // BUG FIX (audit) : Distributions de dividendes = mouvements DÉBIT sur 457
  // (paiement effectif aux associés). Le CRÉDIT 457 = constatation de la dette,
  // pas le décaissement. Le TFT méthode indirecte exige les flux EFFECTIFS.
  const movDistrib = await getMovementsByPrefix(orgId, year, ['457']);
  const distributions = movDistrib.debit;

  const fluxFinancement = augCapital - reducCapital + augSubv + newEmprunts - remboursementsEmprunts - distributions;

  const variationTreso = fluxOperationnels + fluxInvestissement + fluxFinancement;

  // Trésorerie effective
  const tresoO = get(bilanO.actif, '_BT') - get(bilanO.passif, 'DV');
  const tresoC = get(bilanC.actif, '_BT') - get(bilanC.passif, 'DV');

  const lines: Line[] = [
    // Activités opérationnelles
    { code: 'FA', label: "Résultat net de l'exercice", value: resultat, indent: 1 },
    { code: 'FB', label: '+ Dotations aux amortissements & provisions', value: dotationsTot, indent: 1 },
    { code: 'FC', label: '− Reprises sur amortissements & provisions', value: -reprises, indent: 1 },
    { code: 'FD', label: '− Plus-values nettes sur cessions', value: -plusValueCession, indent: 1 },
    { code: '_ZA', label: 'CAPACITÉ D\'AUTOFINANCEMENT GLOBALE (CAFG)', value: cafg, total: true },
    { code: 'FE', label: 'Variation des stocks', value: varStocks, indent: 1 },
    { code: 'FF', label: 'Variation des créances d\'exploitation', value: varCreances, indent: 1 },
    { code: 'FG', label: 'Variation des dettes d\'exploitation', value: varDettesExpl, indent: 1 },
    { code: '_ZB', label: 'VARIATION DU BFR LIÉ À L\'EXPLOITATION', value: varBFR, total: true },
    { code: '_ZC', label: 'FLUX DE TRÉSORERIE DES ACTIVITÉS OPÉRATIONNELLES', value: fluxOperationnels, total: true, grand: true },
    // Investissement
    { code: 'FH', label: 'Décaissements liés aux acquisitions d\'immobilisations', value: acquisitions, indent: 1 },
    { code: 'FI', label: 'Encaissements liés aux cessions d\'immobilisations', value: cessions, indent: 1 },
    { code: '_ZD', label: 'FLUX DE TRÉSORERIE DES ACTIVITÉS D\'INVESTISSEMENT', value: fluxInvestissement, total: true, grand: true },
    // Financement
    { code: 'FJ', label: 'Augmentations de capital', value: augCapital, indent: 1, accountCodes: '101-105 (crédit)' },
    { code: 'FJ2', label: 'Réductions de capital', value: -reducCapital, indent: 1, accountCodes: '101-105 (débit)' },
    { code: 'FJ3', label: "Subventions d'investissement reçues", value: augSubv, indent: 1, accountCodes: '14 (crédit)' },
    { code: 'FK', label: 'Emprunts nouveaux', value: newEmprunts, indent: 1, accountCodes: '16-18 (crédit)' },
    { code: 'FK2', label: "Remboursements d'emprunts", value: -remboursementsEmprunts, indent: 1, accountCodes: '16-18 (débit)' },
    { code: 'FL', label: 'Distributions de dividendes', value: -distributions, indent: 1, accountCodes: '457 (crédit)' },
    { code: '_ZE', label: 'FLUX DE TRÉSORERIE DES ACTIVITÉS DE FINANCEMENT', value: fluxFinancement, total: true, grand: true },
    // Synthèse
    { code: '_ZF', label: 'VARIATION DE LA TRÉSORERIE NETTE', value: variationTreso, total: true, grand: true },
    { code: 'FM', label: 'Trésorerie nette à l\'ouverture', value: tresoO, indent: 1 },
    { code: 'FN', label: 'Trésorerie nette à la clôture', value: tresoC, indent: 1 },
    { code: '_ZG', label: 'CONTRÔLE : Clôture − Ouverture (doit = ZF)', value: tresoC - tresoO, total: true },
  ];

  return {
    lines,
    totals: { cafg, fluxOperationnels, fluxInvestissement, fluxFinancement, variationTreso, tresoOuverture: tresoO, tresoCloture: tresoC },
  };
}

// ─── TFT MENSUEL ────────────────────────────────────────────────────────────
// Calcule 12 TFT : chaque mois = bilan fin mois M − bilan fin mois M-1
export type MonthlyTFT = {
  months: string[];
  lines: Array<{
    code: string;
    label: string;
    total?: boolean;
    grand?: boolean;
    indent?: number;
    values: number[];   // 12 valeurs
    ytd: number;
  }>;
};

async function buildSnapshotsForRange(orgId: string, year: number, fromMonth: number, uptoMonth: number) {
  // Snapshot à fin de (fromMonth - 1) = "ouverture" du mois
  // Snapshot à fin de uptoMonth = "clôture"
  const openBal = fromMonth === 1
    ? await computeBalance({ orgId, year, uptoMonth: 0, includeOpening: true })
    : await computeBalance({ orgId, year, uptoMonth: fromMonth - 1, includeOpening: true });
  const closeBal = await computeBalance({ orgId, year, uptoMonth, includeOpening: true });

  // SIG = uniquement sur la période demandée (sans ouverture)
  const periodBal = await computeBalance({ orgId, year, fromMonth, uptoMonth, includeOpening: false });

  const bilanO = computeBilan(openBal);
  const bilanC = computeBilan(closeBal);
  const { sig } = computeSIG(periodBal);

  return { openBal, closeBal, periodBal, bilanO, bilanC, sig };
}

async function computeTFTForRange(orgId: string, year: number, fromMonth: number, uptoMonth: number) {
  const { bilanO, bilanC, sig, periodBal } = await buildSnapshotsForRange(orgId, year, fromMonth, uptoMonth);

  const resultat = sig.resultat;

  // Dotations TOTALES (pour CAFG) = 68 + 69 nets de 78 + 79
  // Cohérent avec computeTFT annuel et SYSCOHADA : la CAFG réintègre
  // TOUTES les dotations (amortissements + provisions) car elles sont
  // des charges non décaissables.
  const dotations = periodBal
    .filter((r) => r.account.startsWith('68') || r.account.startsWith('69'))
    .reduce((s, r) => s + (r.soldeD - r.soldeC), 0);
  const reprises = periodBal
    .filter((r) => r.account.startsWith('78') || r.account.startsWith('79'))
    .reduce((s, r) => s + (r.soldeC - r.soldeD), 0);
  // (M-2) Dotations sur IMMOBILISATIONS (681 hors 6817 + 687) — pour les
  // acquisitions. Distinctes des dotations TOTALES (ci-dessus) qui alimentent la
  // CAFG. Avant, le TFT mensuel utilisait à tort 68+69 complet → acquisitions surévaluées.
  const dotationsImmo = sumDotationsImmo(periodBal);
  // (P1-4) VNC cédée : compte 685 strict (Valeur nette comptable des
  // immobilisations cédées). 81 entier englobait des charges HAO non liées.
  const vnc = periodBal.filter((r) => r.account.startsWith('685')).reduce((s, r) => s + r.soldeD, 0);
  const pxCess = periodBal.filter((r) => r.account.startsWith('82')).reduce((s, r) => s + r.soldeC, 0);
  const plusValueCession = pxCess - vnc;

  const cafg = resultat + dotations - reprises - plusValueCession;

  const stocksVar = -(get(bilanC.actif, 'BB') - get(bilanO.actif, 'BB'));
  const creancesVar = -((get(bilanC.actif, 'BH') + get(bilanC.actif, 'BI')) - (get(bilanO.actif, 'BH') + get(bilanO.actif, 'BI')));
  const dettesVar = (get(bilanC.passif, 'DJ') + get(bilanC.passif, 'DK') + get(bilanC.passif, 'DM')) -
                    (get(bilanO.passif, 'DJ') + get(bilanO.passif, 'DK') + get(bilanO.passif, 'DM'));
  const varBFR = stocksVar + creancesVar + dettesVar;
  const fluxOp = cafg + varBFR;

  const immoO = bilanO.actif.filter((l) => ['AD','AE','AF','AG'].includes(l.code)).reduce((s, l) => s + l.value, 0);
  const immoC = bilanC.actif.filter((l) => ['AD','AE','AF','AG'].includes(l.code)).reduce((s, l) => s + l.value, 0);
  // (M-1/M-2) Acquisitions brutes = ΔVNC + dotations IMMO + VNC cédée.
  const acquisitions = -(immoC - immoO + dotationsImmo + vnc);
  const fluxInv = acquisitions + pxCess;

  // (P1-5) Capital + emprunts : on utilise les MOUVEMENTS BRUTS de la période
  // (pas la simple différence ouverture/clôture) pour distinguer apports et
  // remboursements.
  // BUG FIX (audit) :
  //   - capital : liste explicite 101-105 + 108 (exploitant), exclut 109 (débiteur).
  //   - emprunts : ajout du préfixe '18' pour cohérence avec computeTFT annuel.
  const isCapAcct = (a: string) =>
    a.startsWith('101') || a.startsWith('102') || a.startsWith('103') ||
    a.startsWith('104') || a.startsWith('105') || a.startsWith('108');
  const isEmpAcct = (a: string) =>
    a.startsWith('16') || a.startsWith('17') || a.startsWith('18');
  const augCapitalBrut = sumMoneyWhere(periodBal, (r) => r.soldeC, (r) => isCapAcct(r.account));
  const reductionsCapitalBrut = sumMoneyWhere(periodBal, (r) => r.soldeD, (r) => isCapAcct(r.account));
  const augCapital = augCapitalBrut - reductionsCapitalBrut;
  const nouveauxEmprunts = sumMoneyWhere(periodBal, (r) => r.soldeC, (r) => isEmpAcct(r.account));
  const remboursementsEmprunts = sumMoneyWhere(periodBal, (r) => r.soldeD, (r) => isEmpAcct(r.account));
  const varEmprunts = nouveauxEmprunts - remboursementsEmprunts;
  const fluxFin = augCapital + varEmprunts;

  const variationTreso = fluxOp + fluxInv + fluxFin;
  const tresoO = get(bilanO.actif, '_BT') - get(bilanO.passif, 'DV');
  const tresoC = get(bilanC.actif, '_BT') - get(bilanC.passif, 'DV');

  return {
    resultat, dotations, reprises, plusValueCession, cafg,
    stocksVar, creancesVar, dettesVar, varBFR, fluxOp,
    acquisitions, pxCess, fluxInv,
    augCapital, varEmprunts, fluxFin,
    variationTreso, tresoO, tresoC,
  };
}

export async function computeMonthlyTFT(orgId: string, year: number): Promise<MonthlyTFT> {
  const MONTHS = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
  const values: Awaited<ReturnType<typeof computeTFTForRange>>[] = [];
  for (let m = 1; m <= 12; m++) {
    values.push(await computeTFTForRange(orgId, year, m, m));
  }
  const col = (pick: (x: typeof values[0]) => number) => values.map(pick);
  const ytd = (pick: (x: typeof values[0]) => number) => values.reduce((s, v) => s + pick(v), 0);

  const lines: MonthlyTFT['lines'] = [
    { code: 'FA', label: "Résultat net du mois", indent: 1, values: col((v) => v.resultat), ytd: ytd((v) => v.resultat) },
    { code: 'FB', label: '+ Dotations', indent: 1, values: col((v) => v.dotations), ytd: ytd((v) => v.dotations) },
    { code: 'FC', label: '− Reprises', indent: 1, values: col((v) => -v.reprises), ytd: ytd((v) => -v.reprises) },
    { code: 'FD', label: '− Plus-values cessions', indent: 1, values: col((v) => -v.plusValueCession), ytd: ytd((v) => -v.plusValueCession) },
    { code: '_ZA', label: "CAFG", total: true, values: col((v) => v.cafg), ytd: ytd((v) => v.cafg) },
    { code: 'FE', label: 'Variation des stocks', indent: 1, values: col((v) => v.stocksVar), ytd: ytd((v) => v.stocksVar) },
    { code: 'FF', label: 'Variation des créances', indent: 1, values: col((v) => v.creancesVar), ytd: ytd((v) => v.creancesVar) },
    { code: 'FG', label: "Variation dettes d'exploitation", indent: 1, values: col((v) => v.dettesVar), ytd: ytd((v) => v.dettesVar) },
    { code: '_ZB', label: 'VARIATION DU BFR', total: true, values: col((v) => v.varBFR), ytd: ytd((v) => v.varBFR) },
    { code: '_ZC', label: 'FLUX OPÉRATIONNELS', total: true, grand: true, values: col((v) => v.fluxOp), ytd: ytd((v) => v.fluxOp) },
    { code: 'FH', label: "Acquisitions d'immobilisations", indent: 1, values: col((v) => v.acquisitions), ytd: ytd((v) => v.acquisitions) },
    { code: 'FI', label: "Cessions d'immobilisations", indent: 1, values: col((v) => v.pxCess), ytd: ytd((v) => v.pxCess) },
    { code: '_ZD', label: "FLUX D'INVESTISSEMENT", total: true, grand: true, values: col((v) => v.fluxInv), ytd: ytd((v) => v.fluxInv) },
    { code: 'FJ', label: 'Augmentations de capital', indent: 1, values: col((v) => v.augCapital), ytd: ytd((v) => v.augCapital) },
    { code: 'FK', label: 'Variation des emprunts', indent: 1, values: col((v) => v.varEmprunts), ytd: ytd((v) => v.varEmprunts) },
    { code: '_ZE', label: 'FLUX DE FINANCEMENT', total: true, grand: true, values: col((v) => v.fluxFin), ytd: ytd((v) => v.fluxFin) },
    { code: '_ZF', label: 'VARIATION DE TRÉSORERIE', total: true, grand: true, values: col((v) => v.variationTreso), ytd: ytd((v) => v.variationTreso) },
    { code: 'FM', label: 'Trésorerie ouverture', indent: 1, values: col((v) => v.tresoO), ytd: values[0]?.tresoO ?? 0 },
    { code: 'FN', label: 'Trésorerie clôture', indent: 1, values: col((v) => v.tresoC), ytd: values[11]?.tresoC ?? 0 },
  ];

  return { months: MONTHS, lines };
}

// ═══════════════════════════════════════════════════════════════════════════
// TAFIRE — Tableau Financier des Ressources et des Emplois
// ═══════════════════════════════════════════════════════════════════════════
export type TAFIREResult = {
  emplois: Line[];
  ressources: Line[];
  totalEmplois: number;
  totalRessources: number;
  varFR: number;
  varBFR: number;
  varTN: number;
};

export async function computeTAFIRE(orgId: string, year: number): Promise<TAFIREResult> {
  const { bilanO, bilanC, sig, closingBal } = await buildSnapshots(orgId, year);

  // CAFG (réutilisation simplifiée)
  const dotations = closingBal
    .filter((r) => r.account.startsWith('68') || r.account.startsWith('69'))
    .reduce((s, r) => s + (r.soldeD - r.soldeC), 0);
  const reprises = closingBal
    .filter((r) => r.account.startsWith('78') || r.account.startsWith('79'))
    .reduce((s, r) => s + (r.soldeC - r.soldeD), 0);
  // VNC strict 685 (charges sur cessions d'immo) — pas '81' qui inclut toutes les charges HAO
  const vnc = closingBal.filter((r) => r.account.startsWith('685')).reduce((s, r) => s + r.soldeD, 0);
  // BUG FIX (audit) : prix de cession SYSCOHADA = compte 82 (Produits HAO de cession),
  // PAS 775 qui n'existe pas dans le PCG SYSCOHADA révisé 2017 (775 = PCG français).
  // Aligné avec computeTFT annuel l.104.
  const pxCess = closingBal.filter((r) => r.account.startsWith('82')).reduce((s, r) => s + r.soldeC, 0);
  const plusValueCession = pxCess - vnc;
  const cafg = sig.resultat + dotations - reprises - plusValueCession;

  // Ressources stables
  const capO = get(bilanO.passif, 'CA');
  const capC = get(bilanC.passif, 'CA');
  const primO = get(bilanO.passif, 'CD');
  const primC = get(bilanC.passif, 'CD');
  const augCapital = (capC + primC) - (capO + primO);
  const subvO = get(bilanO.passif, 'CL');
  const subvC = get(bilanC.passif, 'CL');
  const augSubv = subvC - subvO;
  // Emprunts : MOUVEMENTS BRUTS de la période (crédit = nouveaux emprunts,
  // débit = remboursements) et NON la variation nette du solde bilan (DA) avec
  // Math.max. SYSCOHADA TAFIRE présente « Emprunts nouveaux » (ressource) et
  // « Remboursements » (emploi) en deux lignes DISTINCTES : le net masque les
  // remboursements quand de nouveaux emprunts sont contractés le même exercice.
  // Cohérent avec computeTFT annuel (mêmes préfixes 16/17/18).
  const movEmprunts = await getMovementsByPrefix(orgId, year, ['16', '17', '18']);
  const newEmprunts = movEmprunts.credit;
  const remboursements = movEmprunts.debit;

  const totalRessourcesStables = cafg + augCapital + augSubv + pxCess + newEmprunts;

  // Emplois stables
  // (M-1/M-2) Investissements = acquisitions brutes = ΔVNC + dotations IMMO
  // (681 hors 6817 + 687, et NON 68+69 complet) + VNC des immo cédées (685).
  const dotationsImmo = sumDotationsImmo(closingBal);
  const immoO = bilanO.actif.filter((l) => ['AD', 'AE', 'AF', 'AG'].includes(l.code)).reduce((s, l) => s + l.value, 0);
  const immoC = bilanC.actif.filter((l) => ['AD', 'AE', 'AF', 'AG'].includes(l.code)).reduce((s, l) => s + l.value, 0);
  const investissements = Math.max((immoC - immoO + dotationsImmo + vnc), 0);
  // (m-1) Distributions de dividendes = mouvements DÉBIT bruts du compte 457
  // (paiements effectifs aux associés), cohérent avec le TFT annuel (l.~162) et
  // computeCapitalVariation. Le solde NET pouvait sous-estimer les versements
  // quand une dette de dividende est constatée puis soldée dans le même exercice.
  const movDistrib = await getMovementsByPrefix(orgId, year, ['457']);
  const distributions = movDistrib.debit;

  const totalEmploisStables = investissements + distributions + remboursements;

  const varFR = totalRessourcesStables - totalEmploisStables;

  // Variation BFR — convention SYSCOHADA TAFIRE :
  //   Augmentation de créances = EMPLOI (négatif pour la trésorerie)
  //   Augmentation de stocks   = EMPLOI
  //   Augmentation de dettes   = RESSOURCE (positive)
  // (P0-4) Le signe `creancesVar` etait inversé (calculé en (clôture − ouverture)
  // alors que TFT.ts l.117 utilisait −(clôture − ouverture)). Aligné maintenant.
  const stocksVar = -(get(bilanC.actif, 'BB') - get(bilanO.actif, 'BB'));
  const creancesVar = -((get(bilanC.actif, 'BH') + get(bilanC.actif, 'BI')) - (get(bilanO.actif, 'BH') + get(bilanO.actif, 'BI')));
  const dettesVar = (get(bilanC.passif, 'DJ') + get(bilanC.passif, 'DK') + get(bilanC.passif, 'DM')) -
                    (get(bilanO.passif, 'DJ') + get(bilanO.passif, 'DK') + get(bilanO.passif, 'DM'));
  const varBFR = stocksVar + creancesVar + dettesVar;

  // Variation TN = var FR − var BFR
  const varTN = varFR - varBFR;

  const emplois: Line[] = [
    { code: 'EA', label: "Investissements (acquisitions d'immobilisations)", value: investissements, indent: 1, accountCodes: '20-27' },
    { code: 'EB', label: "Distributions de dividendes", value: distributions, indent: 1, accountCodes: '457' },
    { code: 'EC', label: "Remboursements d'emprunts & dettes financières", value: remboursements, indent: 1, accountCodes: '16-17' },
    { code: '_EZ', label: 'TOTAL EMPLOIS STABLES', value: totalEmploisStables, total: true, grand: true, accountCodes: '20-27, 16-17' },
  ];

  const ressources: Line[] = [
    { code: 'RA', label: "Capacité d'autofinancement globale (CAFG)", value: cafg, indent: 1, accountCodes: '12, 68/78' },
    { code: 'RB', label: 'Augmentations de capital (& primes)', value: augCapital, indent: 1, accountCodes: '101, 104, 105' },
    { code: 'RC', label: "Subventions d'investissement reçues", value: augSubv, indent: 1, accountCodes: '14' },
    { code: 'RD', label: "Prix de cession d'immobilisations", value: pxCess, indent: 1, accountCodes: '82' },
    { code: 'RE', label: "Emprunts nouveaux & dettes financières", value: newEmprunts, indent: 1, accountCodes: '16-17' },
    { code: '_RZ', label: 'TOTAL RESSOURCES STABLES', value: totalRessourcesStables, total: true, grand: true, accountCodes: '10-14, 16-17, 82' },
  ];

  return { emplois, ressources, totalEmplois: totalEmploisStables, totalRessources: totalRessourcesStables, varFR, varBFR, varTN };
}

// ═══════════════════════════════════════════════════════════════════════════
// VARIATION DES CAPITAUX PROPRES
// ═══════════════════════════════════════════════════════════════════════════
export type CapitalMovement = {
  rubrique: string;
  accountCodes?: string;
  ouverture: number;
  augmentation: number;
  diminution: number;
  /**
   * Affectation du résultat N-1 — transfert net du RAN vers les réserves/dividendes.
   * Décomposition fine :
   *   - apportRAN : crédit cumulé du RAN dans l'exercice (entrée d'un nouveau résultat
   *                 affecté en RAN, généralement à l'ouverture de l'exercice).
   *   - repriseRAN : débit cumulé du RAN (sortie vers réserves ou dividendes payés).
   * affectationResN1 = repriseRAN (montant qui ALIMENTE les réserves cette année).
   */
  affectationResN1: number;
  apportRAN?: number;
  repriseRAN?: number;
  /** Distributions de dividendes (compte 457 mouvement débit). */
  distributions?: number;
  resultatExercice: number;
  cloture: number;
};

export async function computeCapitalVariation(orgId: string, year: number): Promise<CapitalMovement[]> {
  const { bilanO, bilanC, sig } = await buildSnapshots(orgId, year);

  const g = (lines: Line[], code: string) => lines.find((l) => l.code === code)?.value ?? 0;

  // BUG FIX (audit) : la rubrique 'primes' incluait '12','13' dans `prefixes` ET
  // dans le mvtRAN d'affectation → DOUBLE COMPTAGE des mouvements entre RAN
  // (121/129/13) et réserves (105/106/11). On sépare proprement :
  //   - 'primes' couvre uniquement les comptes RÉSERVES (105, 106, 11)
  //   - L'affectation N-1 (12, 13) reste isolée comme transfert interne
  const rubriques = [
    { key: 'capital',  label: 'Capital social',                accountCodes: '101-104',  bilanCode: 'CA', prefixes: ['101', '102', '103', '104'] },
    { key: 'primes',   label: 'Primes & réserves',             accountCodes: '105, 106, 11', bilanCode: 'CD', prefixes: ['105', '106', '11'] },
    { key: 'subv',     label: "Subventions d'investissement",  accountCodes: '14',       bilanCode: 'CL', prefixes: ['14'] },
    { key: 'provRegl', label: 'Provisions réglementées',       accountCodes: '15',       bilanCode: 'CM', prefixes: ['15'] },
  ];

  const movements: CapitalMovement[] = [];
  // Pré-calcul une seule fois des mouvements RAN (121/129/13) et 457 (dividendes)
  // — réutilisés sur la rubrique 'primes'.
  const mvtRAN = await getMovementsByPrefix(orgId, year, ['121', '129', '13']);
  const mvtDistrib = await getMovementsByPrefix(orgId, year, ['457']);

  for (const r of rubriques) {
    const codeO = g(bilanO.passif, r.bilanCode);
    const codeC = g(bilanC.passif, r.bilanCode);
    const mvt = await getMovementsByPrefix(orgId, year, r.prefixes);
    // Affectation N-1 : transfert interne RAN (121/129/13) → réserves (11x).
    // BUG FIX (audit) : décomposition explicite en apport et reprise pour matérialiser
    //   - apportRAN : crédit cumulé du RAN (entrée — résultat N-1 affecté).
    //   - repriseRAN : débit cumulé du RAN (sortie vers réserves / dividendes).
    //   - distributions : débit cumulé du compte 457 (versements aux associés).
    let affectationResN1 = 0;
    let apportRAN: number | undefined;
    let repriseRAN: number | undefined;
    let distributions: number | undefined;
    if (r.key === 'primes') {
      apportRAN = mvtRAN.credit;
      repriseRAN = mvtRAN.debit;
      affectationResN1 = repriseRAN; // ce qui alimente les réserves cette année
      distributions = mvtDistrib.debit; // versements effectifs (≠ constatation au crédit)
    }
    movements.push({
      rubrique: r.label,
      accountCodes: r.accountCodes,
      ouverture: codeO,
      augmentation: mvt.credit,
      diminution: mvt.debit,
      affectationResN1,
      apportRAN,
      repriseRAN,
      distributions,
      resultatExercice: 0,
      cloture: codeC,
    });
  }

  // ── Résultat de l'exercice (compte 130/131) ──
  // Ouverture = résultat N-1 (= bilan ouverture passif "Résultat" CF si présent,
  // sinon 0 si l'affectation N-1 a déjà été passée). Clôture = résultat N.
  const resultatOuverture = g(bilanO.passif, 'CF');
  movements.push({
    rubrique: "Résultat net de l'exercice",
    accountCodes: '130, 131',
    ouverture: resultatOuverture,
    augmentation: sig.resultat > 0 ? sig.resultat : 0,
    diminution: sig.resultat < 0 ? -sig.resultat : 0,
    affectationResN1: -resultatOuverture, // le N-1 est sorti vers réserves/dividendes
    resultatExercice: sig.resultat,
    cloture: sig.resultat,
  });

  // Total
  const total: CapitalMovement = {
    rubrique: 'TOTAL CAPITAUX PROPRES',
    ouverture: movements.reduce((s, m) => s + m.ouverture, 0),
    augmentation: movements.reduce((s, m) => s + m.augmentation, 0),
    diminution: movements.reduce((s, m) => s + m.diminution, 0),
    affectationResN1: movements.reduce((s, m) => s + m.affectationResN1, 0),
    resultatExercice: movements.reduce((s, m) => s + m.resultatExercice, 0),
    cloture: movements.reduce((s, m) => s + m.cloture, 0),
  };
  movements.push(total);

  return movements;
}
