// TFT, TAFIRE, Variation des capitaux propres — SYSCOHADA révisé 2017
import { computeBalance } from './balance';
import { computeBilan, computeSIG, Line } from './statements';

// ─── Utilitaires ────────────────────────────────────────────────────────────
function get(lines: Line[], code: string): number {
  return lines.find((l) => l.code === code)?.value ?? 0;
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

  // Dotations aux amortissements & provisions de l'exercice
  // = soldes débiteurs des comptes 68 + 69 (charges) - soldes créditeurs 78 + 79 (reprises)
  const dotations = closingBal
    .filter((r) => r.account.startsWith('68') || r.account.startsWith('69'))
    .reduce((s, r) => s + (r.soldeD - r.soldeC), 0);
  const reprises = closingBal
    .filter((r) => r.account.startsWith('78') || r.account.startsWith('79'))
    .reduce((s, r) => s + (r.soldeC - r.soldeD), 0);
  const dotationsNettes = dotations - reprises;

  // Plus / moins values sur cessions
  const vnc = closingBal.filter((r) => r.account.startsWith('81')).reduce((s, r) => s + r.soldeD, 0);
  const pxCess = closingBal.filter((r) => r.account.startsWith('82')).reduce((s, r) => s + r.soldeC, 0);
  const plusValueCession = pxCess - vnc;

  // CAFG = Résultat + dotations nettes - plus-values cessions
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

  // Flux d'investissement
  // Acquisitions = augmentation brute des immobilisations
  // On se base sur les comptes 20-27 soldes D
  const immoO = bilanO.actif.filter((l) => ['AD', 'AE', 'AF', 'AG'].includes(l.code)).reduce((s, l) => s + l.value, 0);
  const immoC = bilanC.actif.filter((l) => ['AD', 'AE', 'AF', 'AG'].includes(l.code)).reduce((s, l) => s + l.value, 0);
  // variation nette + dotations = acquisitions brutes approximées
  const acquisitions = -(immoC - immoO + dotations);
  const cessions = pxCess; // prix des cessions (82)
  const fluxInvestissement = acquisitions + cessions;

  // Flux de financement
  // Capital : variation
  const capO = get(bilanO.passif, 'CA');
  const capC = get(bilanC.passif, 'CA');
  const primesResO = get(bilanO.passif, 'CD');
  const primesResC = get(bilanC.passif, 'CD');
  const augCapital = (capC + primesResC) - (capO + primesResO);

  const empruntsO = get(bilanO.passif, 'DA');
  const empruntsC = get(bilanC.passif, 'DA');
  const varEmprunts = empruntsC - empruntsO;

  // Distribution de dividendes : approximation = résultat N-1 non conservé (non reporté)
  // Simplifié : considéré nul si pas d'info spécifique
  const distributions = 0;

  const fluxFinancement = augCapital + varEmprunts - distributions;

  const variationTreso = fluxOperationnels + fluxInvestissement + fluxFinancement;

  // Trésorerie effective
  const tresoO = get(bilanO.actif, '_BT') - get(bilanO.passif, 'DV');
  const tresoC = get(bilanC.actif, '_BT') - get(bilanC.passif, 'DV');

  const lines: Line[] = [
    // Activités opérationnelles
    { code: 'FA', label: "Résultat net de l'exercice", value: resultat, indent: 1 },
    { code: 'FB', label: '+ Dotations aux amortissements & provisions', value: dotations, indent: 1 },
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
    { code: 'FJ', label: 'Augmentations de capital (propres + primes)', value: augCapital, indent: 1 },
    { code: 'FK', label: 'Variation des emprunts & dettes financières', value: varEmprunts, indent: 1 },
    { code: 'FL', label: 'Distributions de dividendes', value: -distributions, indent: 1 },
    { code: '_ZE', label: 'FLUX DE TRÉSORERIE DES ACTIVITÉS DE FINANCEMENT', value: fluxFinancement, total: true, grand: true },
    // Synthèse
    { code: '_ZF', label: 'VARIATION DE LA TRÉSORERIE NETTE', value: variationTreso, total: true, grand: true },
    { code: 'FM', label: 'Trésorerie nette à l\'ouverture', value: tresoO, indent: 1 },
    { code: 'FN', label: 'Trésorerie nette à la clôture', value: tresoC, indent: 1 },
    { code: '_ZG', label: 'CONTRÔLE : Clôture − Ouverture', value: tresoC - tresoO, total: true },
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

  const dotations = periodBal
    .filter((r) => r.account.startsWith('68') || r.account.startsWith('69'))
    .reduce((s, r) => s + (r.soldeD - r.soldeC), 0);
  const reprises = periodBal
    .filter((r) => r.account.startsWith('78') || r.account.startsWith('79'))
    .reduce((s, r) => s + (r.soldeC - r.soldeD), 0);
  const vnc = periodBal.filter((r) => r.account.startsWith('81')).reduce((s, r) => s + r.soldeD, 0);
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
  const acquisitions = -(immoC - immoO + dotations);
  const fluxInv = acquisitions + pxCess;

  const capO = get(bilanO.passif, 'CA') + get(bilanO.passif, 'CD');
  const capC = get(bilanC.passif, 'CA') + get(bilanC.passif, 'CD');
  const augCapital = capC - capO;
  const empruntsO = get(bilanO.passif, 'DA');
  const empruntsC = get(bilanC.passif, 'DA');
  const varEmprunts = empruntsC - empruntsO;
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
  const vnc = closingBal.filter((r) => r.account.startsWith('81')).reduce((s, r) => s + r.soldeD, 0);
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
  const empruntsO = get(bilanO.passif, 'DA');
  const empruntsC = get(bilanC.passif, 'DA');
  // Nouveaux emprunts = augmentation. Remboursements = diminution. On les sépare si possible.
  const newEmprunts = Math.max(empruntsC - empruntsO, 0);
  const remboursements = Math.max(empruntsO - empruntsC, 0);

  const totalRessourcesStables = cafg + augCapital + augSubv + pxCess + newEmprunts;

  // Emplois stables
  const immoO = bilanO.actif.filter((l) => ['AD', 'AE', 'AF', 'AG'].includes(l.code)).reduce((s, l) => s + l.value, 0);
  const immoC = bilanC.actif.filter((l) => ['AD', 'AE', 'AF', 'AG'].includes(l.code)).reduce((s, l) => s + l.value, 0);
  const investissements = Math.max((immoC - immoO + dotations), 0);
  const distributions = 0; // hypothèse : pas de distribution (à paramétrer)

  const totalEmploisStables = investissements + distributions + remboursements;

  const varFR = totalRessourcesStables - totalEmploisStables;

  // Variation BFR
  const stocksVar = get(bilanC.actif, 'BB') - get(bilanO.actif, 'BB');
  const creancesVar = (get(bilanC.actif, 'BH') + get(bilanC.actif, 'BI')) - (get(bilanO.actif, 'BH') + get(bilanO.actif, 'BI'));
  const dettesVar = (get(bilanC.passif, 'DJ') + get(bilanC.passif, 'DK') + get(bilanC.passif, 'DM')) -
                    (get(bilanO.passif, 'DJ') + get(bilanO.passif, 'DK') + get(bilanO.passif, 'DM'));
  const varBFR = stocksVar + creancesVar - dettesVar;

  // Variation TN = var FR − var BFR
  const varTN = varFR - varBFR;

  const emplois: Line[] = [
    { code: 'EA', label: "Investissements (acquisitions d'immobilisations)", value: investissements, indent: 1 },
    { code: 'EB', label: "Distributions de dividendes", value: distributions, indent: 1 },
    { code: 'EC', label: "Remboursements d'emprunts & dettes financières", value: remboursements, indent: 1 },
    { code: '_EZ', label: 'TOTAL EMPLOIS STABLES', value: totalEmploisStables, total: true, grand: true },
  ];

  const ressources: Line[] = [
    { code: 'RA', label: "Capacité d'autofinancement globale (CAFG)", value: cafg, indent: 1 },
    { code: 'RB', label: 'Augmentations de capital (& primes)', value: augCapital, indent: 1 },
    { code: 'RC', label: "Subventions d'investissement reçues", value: augSubv, indent: 1 },
    { code: 'RD', label: "Prix de cession d'immobilisations", value: pxCess, indent: 1 },
    { code: 'RE', label: "Emprunts nouveaux & dettes financières", value: newEmprunts, indent: 1 },
    { code: '_RZ', label: 'TOTAL RESSOURCES STABLES', value: totalRessourcesStables, total: true, grand: true },
  ];

  return { emplois, ressources, totalEmplois: totalEmploisStables, totalRessources: totalRessourcesStables, varFR, varBFR, varTN };
}

// ═══════════════════════════════════════════════════════════════════════════
// VARIATION DES CAPITAUX PROPRES
// ═══════════════════════════════════════════════════════════════════════════
export type CapitalMovement = {
  rubrique: string;
  ouverture: number;
  augmentation: number;
  diminution: number;
  affectationResN1: number;
  resultatExercice: number;
  cloture: number;
};

export async function computeCapitalVariation(orgId: string, year: number): Promise<CapitalMovement[]> {
  const { bilanO, bilanC, sig } = await buildSnapshots(orgId, year);

  const g = (lines: Line[], code: string) => lines.find((l) => l.code === code)?.value ?? 0;

  const rubriques = [
    { key: 'capital', label: 'Capital social', codeO: g(bilanO.passif, 'CA'), codeC: g(bilanC.passif, 'CA') },
    { key: 'primes', label: 'Primes & réserves', codeO: g(bilanO.passif, 'CD'), codeC: g(bilanC.passif, 'CD') },
    { key: 'subv', label: "Subventions d'investissement", codeO: g(bilanO.passif, 'CL'), codeC: g(bilanC.passif, 'CL') },
    { key: 'provRegl', label: 'Provisions réglementées', codeO: g(bilanO.passif, 'CM'), codeC: g(bilanC.passif, 'CM') },
  ];

  const movements: CapitalMovement[] = rubriques.map((r) => {
    const diff = r.codeC - r.codeO;
    return {
      rubrique: r.label,
      ouverture: r.codeO,
      augmentation: Math.max(diff, 0),
      diminution: Math.max(-diff, 0),
      affectationResN1: 0,
      resultatExercice: 0,
      cloture: r.codeC,
    };
  });

  // Résultat de l'exercice
  movements.push({
    rubrique: "Résultat net de l'exercice",
    ouverture: 0,
    augmentation: 0,
    diminution: 0,
    affectationResN1: 0,
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
