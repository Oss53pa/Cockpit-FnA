// Moteur — Bilan, Compte de résultat, SIG selon SYSCOHADA révisé 2017
import { BalanceRow, sumBy } from './balance';

export type Line = {
  code: string;
  label: string;
  value: number;
  total?: boolean;
  grand?: boolean;
  indent?: number;
  accountCodes?: string;   // codes comptables sources (ex : "20", "21, 281", "411-418")
};

// ─────────────────────────────────────────────────────────────────────────────
// BILAN — format SYSCOHADA
// Les comptes de charges/produits (classe 6,7,8) et de capitaux propres (10-15)
// doivent être retraités pour le résultat.
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @param rows        Balance cumulée (avec à-nouveaux) — donne les soldes
 *                    corrects des classes 1 à 5.
 * @param movements   Optionnel. Balance SANS à-nouveaux (mouvements de
 *                    l'exercice seulement). Si fournie, le résultat de
 *                    l'exercice (classes 6/7/8) est calculé à partir des
 *                    mouvements — ce qui évite de double-compter les
 *                    reports à nouveau déjà passés en réserves.
 *                    Si absent, le résultat est calculé sur `rows`.
 */
export function computeBilan(rows: BalanceRow[], movements?: BalanceRow[]): { actif: Line[]; passif: Line[]; totalActif: number; totalPassif: number } {
  // Fonctions d'aide : solde D positif pour actif, solde C positif pour passif
  const soldeD = (...prefixes: string[]) => {
    let s = 0;
    for (const r of rows) if (prefixes.some((p) => r.account.startsWith(p))) s += r.soldeD;
    return s;
  };
  const soldeC = (...prefixes: string[]) => {
    let s = 0;
    for (const r of rows) if (prefixes.some((p) => r.account.startsWith(p))) s += r.soldeC;
    return s;
  };

  // Résultat de l'exercice : calculé sur les MOUVEMENTS (sans AN) si fournis
  const resSource = movements && movements.length > 0 ? movements : rows;
  const charges = sumBy(resSource, ['6', '81', '83', '85', '87', '89']); // débiteurs
  const produits = -sumBy(resSource, ['7', '82', '84', '86']);           // créditeurs (on inverse)
  const resultat = produits - charges;

  // ── ACTIF ──────────────────────────────────────────────────────────
  const actifImmoBrut_Incorp = soldeD('20', '21');
  const actifImmoBrut_Corp   = soldeD('22', '23', '24', '25');
  const actifImmoBrut_Fin    = soldeD('26', '27');
  const amorts = soldeC('28', '29'); // amortissements cumulés = créditeurs
  const immoNet = actifImmoBrut_Incorp + actifImmoBrut_Corp + actifImmoBrut_Fin - amorts;

  const stocks = soldeD('31', '32', '33', '34', '35', '36', '37', '38') - soldeC('39');
  const creancesClients = soldeD('411', '412', '413', '414', '415', '416', '417', '418')
                        - soldeC('49');
  const autresCreances = soldeD('409', '421', '425', '428', '43', '44', '45', '46', '47', '48') - soldeD('443', '447');
  // TVA à récupérer (445) en autres créances
  const tvaRec = soldeD('445');

  const tresoActive = soldeD('50', '51', '52', '53', '54', '57', '58') - soldeC('59');

  const totalActifImmo = immoNet;
  const totalActifCirc = stocks + creancesClients + autresCreances + tvaRec;
  const totalTreso = tresoActive;
  const totalActif = totalActifImmo + totalActifCirc + totalTreso;

  const actif: Line[] = [
    { code: 'AD', label: 'Charges immobilisées', value: soldeD('20'), indent: 1, accountCodes: '20' },
    { code: 'AE', label: 'Immobilisations incorporelles', value: soldeD('21') - soldeC('281'), indent: 1, accountCodes: '21 − 281' },
    { code: 'AF', label: 'Immobilisations corporelles', value: soldeD('22','23','24','25') - soldeC('282','283','284','285'), indent: 1, accountCodes: '22-25 − 282-285' },
    { code: 'AG', label: 'Immobilisations financières', value: soldeD('26','27') - soldeC('29'), indent: 1, accountCodes: '26, 27 − 29' },
    { code: '_AZ', label: 'TOTAL ACTIF IMMOBILISÉ', value: totalActifImmo, total: true, accountCodes: '20 à 29' },
    { code: 'BA', label: 'Actif circulant HAO', value: soldeD('485'), indent: 1, accountCodes: '485' },
    { code: 'BB', label: 'Stocks et en-cours', value: stocks, indent: 1, accountCodes: '31-38 − 39' },
    { code: 'BH', label: 'Créances clients et comptes rattachés', value: creancesClients, indent: 1, accountCodes: '411-418 − 49' },
    { code: 'BI', label: 'Autres créances', value: autresCreances + tvaRec, indent: 1, accountCodes: '40-48 (hors 411-418)' },
    { code: '_BK', label: 'TOTAL ACTIF CIRCULANT', value: totalActifCirc, total: true, accountCodes: '31 à 49' },
    { code: 'BQ', label: 'Trésorerie - Actif (banques, caisse)', value: tresoActive, indent: 1, accountCodes: '50-58 − 59' },
    { code: '_BT', label: 'TOTAL TRÉSORERIE - ACTIF', value: totalTreso, total: true, accountCodes: '50 à 59' },
    { code: '_BZ', label: 'TOTAL GÉNÉRAL ACTIF', value: totalActif, total: true, grand: true, accountCodes: 'Classes 2 à 5' },
  ];

  // ── PASSIF ─────────────────────────────────────────────────────────
  const capital = soldeC('101', '102', '103', '104');
  const primes = soldeC('105');
  const reserves = soldeC('106', '11');
  const subvInv = soldeC('14');
  const provRegl = soldeC('15');
  const capitauxPropres = capital + primes + reserves + subvInv + provRegl + resultat;

  const emprunts = soldeC('16', '17', '18');
  const provRC = soldeC('19');
  const ressStables = capitauxPropres + emprunts + provRC;

  const dettesFourn = soldeC('401', '402', '408') - soldeD('409');
  const dettesFisc = soldeC('441', '442', '443', '444', '446', '447', '449');
  const dettesPers = soldeC('422', '423', '424', '426', '427', '428', '43');
  const dettesAutres = soldeC('419', '46', '47', '48') - soldeD('46', '47');
  const passifCirc = dettesFourn + dettesFisc + dettesPers + Math.max(dettesAutres, 0);

  const tresoPass = soldeC('561', '564', '565', '566', '56');

  const totalPassif = ressStables + passifCirc + tresoPass;

  const passif: Line[] = [
    { code: 'CA', label: 'Capital', value: capital, indent: 1, accountCodes: '101-104' },
    { code: 'CD', label: 'Primes et réserves', value: primes + reserves, indent: 1, accountCodes: '105, 106, 11' },
    { code: 'CF', label: 'Résultat net de l\'exercice', value: resultat, indent: 1, accountCodes: '12 (Cl. 6 vs 7)' },
    { code: 'CL', label: "Subventions d'investissement", value: subvInv, indent: 1, accountCodes: '14' },
    { code: 'CM', label: 'Provisions réglementées', value: provRegl, indent: 1, accountCodes: '15' },
    { code: '_CP', label: 'TOTAL CAPITAUX PROPRES', value: capitauxPropres, total: true, accountCodes: '10 à 15' },
    { code: 'DA', label: 'Emprunts et dettes financières', value: emprunts, indent: 1, accountCodes: '16, 17, 18' },
    { code: 'DP', label: 'Provisions pour risques et charges', value: provRC, indent: 1, accountCodes: '19' },
    { code: '_DF', label: 'TOTAL RESSOURCES STABLES', value: ressStables, total: true, accountCodes: '10 à 19' },
    { code: 'DJ', label: 'Fournisseurs et comptes rattachés', value: dettesFourn, indent: 1, accountCodes: '401, 402, 408 − 409' },
    { code: 'DK', label: 'Dettes fiscales et sociales', value: dettesFisc + dettesPers, indent: 1, accountCodes: '42, 43, 44' },
    { code: 'DM', label: 'Autres dettes', value: Math.max(dettesAutres, 0), indent: 1, accountCodes: '419, 46, 47, 48' },
    { code: '_DP', label: 'TOTAL PASSIF CIRCULANT', value: passifCirc, total: true, accountCodes: '40 à 48' },
    { code: 'DV', label: 'Trésorerie - Passif (concours bancaires)', value: tresoPass, indent: 1, accountCodes: '561, 564-566' },
    { code: '_DZ', label: 'TOTAL GÉNÉRAL PASSIF', value: totalPassif, total: true, grand: true, accountCodes: 'Classes 1, 4, 5' },
  ];

  return { actif, passif, totalActif, totalPassif };
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPTE DE RÉSULTAT + SIG
// ─────────────────────────────────────────────────────────────────────────────
export type SIG = {
  ca: number;              // chiffre d'affaires
  margeBrute: number;      // marge brute sur marchandises + sur matières
  valeurAjoutee: number;
  ebe: number;             // excédent brut d'exploitation
  re: number;              // résultat d'exploitation
  rf: number;              // résultat financier
  rao: number;             // résultat des activités ordinaires
  rhao: number;            // résultat hors activités ordinaires
  resultat: number;        // résultat net
  impot: number;
};

export function computeSIG(rows: BalanceRow[]): { sig: SIG; cr: Line[] } {
  const soldeC = (...p: string[]) => { let s = 0; for (const r of rows) if (p.some((x) => r.account.startsWith(x))) s += r.soldeC; return s; };
  const soldeD = (...p: string[]) => { let s = 0; for (const r of rows) if (p.some((x) => r.account.startsWith(x))) s += r.soldeD; return s; };

  // Produits d'exploitation
  const venteMarch = soldeC('701');
  const venteProd = soldeC('702', '703', '704', '705', '706', '707');
  const ca = venteMarch + venteProd + soldeC('708');
  const prodStockee = soldeC('73') - soldeD('73');
  const prodImmob = soldeC('72');
  const subvExpl = soldeC('71');
  const autresProd = soldeC('75', '78') - soldeD('75', '78');

  // Charges d'exploitation
  const achatMarch = soldeD('601') - soldeC('601');
  const varStockMarch = soldeD('6031') - soldeC('6031');
  const achatMP = soldeD('602', '604', '605', '608') - soldeC('602', '604', '605', '608');
  const varStockMP = soldeD('6032', '6033') - soldeC('6032', '6033');
  const transport = soldeD('61') - soldeC('61');
  const servExt = soldeD('62', '63') - soldeC('62', '63');
  const impotsTaxes = soldeD('64') - soldeC('64');
  const autresCharges = soldeD('65') - soldeC('65');
  const personnel = soldeD('66') - soldeC('66');
  const dotations = soldeD('68', '69') - soldeC('79');

  // SIG
  const margeMarch = venteMarch - (achatMarch + varStockMarch);
  const margeMP = venteProd + prodStockee - (achatMP + varStockMP);
  const margeBrute = margeMarch + margeMP;
  const valeurAjoutee = margeBrute + prodImmob + subvExpl + autresProd - transport - servExt - impotsTaxes - autresCharges;
  const ebe = valeurAjoutee - personnel;
  const re = ebe - dotations;

  // Résultat financier
  const prodFin = soldeC('77') - soldeD('77');
  const chargeFin = soldeD('67') - soldeC('67');
  const rf = prodFin - chargeFin;

  // Résultat HAO
  const prodHAO = soldeC('82', '84', '86', '88') - soldeD('82', '84', '86', '88');
  const chargeHAO = soldeD('81', '83', '85') - soldeC('81', '83', '85');
  const rhao = prodHAO - chargeHAO;

  const rao = re + rf;
  const participation = soldeD('87') - soldeC('87');
  const impot = soldeD('89') - soldeC('89');
  const resultat = rao + rhao - participation - impot;

  const sig: SIG = { ca, margeBrute, valeurAjoutee, ebe, re, rf, rao, rhao, resultat, impot };

  const cr: Line[] = [
    { code: 'TA', label: 'Ventes de marchandises', value: venteMarch, indent: 1, accountCodes: '701' },
    { code: 'TB', label: 'Ventes de produits / services', value: venteProd + soldeC('708'), indent: 1, accountCodes: '702-707, 708' },
    { code: '_XB', label: 'CHIFFRE D\'AFFAIRES', value: ca, total: true, accountCodes: '70' },
    { code: 'TC', label: 'Production stockée', value: prodStockee, indent: 1, accountCodes: '73' },
    { code: 'TD', label: 'Production immobilisée', value: prodImmob, indent: 1, accountCodes: '72' },
    { code: 'TE', label: 'Subventions d\'exploitation', value: subvExpl, indent: 1, accountCodes: '71' },
    { code: 'TF', label: 'Autres produits', value: autresProd, indent: 1, accountCodes: '75, 78' },
    { code: 'RA', label: 'Achats de marchandises', value: -(achatMarch + varStockMarch), indent: 1, accountCodes: '601, 6031' },
    { code: 'RB', label: 'Achats MP & fournitures', value: -(achatMP + varStockMP), indent: 1, accountCodes: '602, 604, 605, 6032' },
    { code: '_XC', label: 'MARGE BRUTE', value: margeBrute, total: true, accountCodes: '70 − 60' },
    { code: 'RC', label: 'Transports', value: -transport, indent: 1, accountCodes: '61' },
    { code: 'RD', label: 'Services extérieurs', value: -servExt, indent: 1, accountCodes: '62, 63' },
    { code: 'RE', label: 'Impôts et taxes', value: -impotsTaxes, indent: 1, accountCodes: '64' },
    { code: 'RF', label: 'Autres charges', value: -autresCharges, indent: 1, accountCodes: '65' },
    { code: '_XD', label: 'VALEUR AJOUTÉE', value: valeurAjoutee, total: true, accountCodes: 'MB − 61 à 65' },
    { code: 'RG', label: 'Charges de personnel', value: -personnel, indent: 1, accountCodes: '66' },
    { code: '_XE', label: 'EXCÉDENT BRUT D\'EXPLOITATION', value: ebe, total: true, accountCodes: 'VA − 66' },
    { code: 'RH', label: 'Dotations aux amortissements & provisions', value: -dotations, indent: 1, accountCodes: '68, 69 − 79' },
    { code: '_XF', label: 'RÉSULTAT D\'EXPLOITATION', value: re, total: true, accountCodes: 'EBE − 68/69' },
    { code: 'TK', label: 'Revenus financiers', value: prodFin, indent: 1, accountCodes: '77' },
    { code: 'RK', label: 'Charges financières', value: -chargeFin, indent: 1, accountCodes: '67' },
    { code: '_XG', label: 'RÉSULTAT FINANCIER', value: rf, total: true, accountCodes: '77 − 67' },
    { code: '_XH', label: 'RÉSULTAT DES ACTIVITÉS ORDINAIRES', value: rao, total: true, accountCodes: 'RE + RF' },
    { code: 'TL', label: 'Produits HAO', value: prodHAO, indent: 1, accountCodes: '82, 84, 86, 88' },
    { code: 'RL', label: 'Charges HAO', value: -chargeHAO, indent: 1, accountCodes: '81, 83, 85' },
    { code: '_XI', label: 'RÉSULTAT HORS ACTIVITÉS ORDINAIRES', value: rhao, total: true, accountCodes: 'HAO Prod − HAO Charges' },
    { code: 'RM', label: 'Participation des travailleurs', value: -participation, indent: 1, accountCodes: '87' },
    { code: 'RN', label: 'Impôts sur le résultat', value: -impot, indent: 1, accountCodes: '89' },
    { code: '_XJ', label: 'RÉSULTAT NET', value: resultat, total: true, grand: true, accountCodes: 'RAO + RHAO − 87 − 89' },
  ];

  return { sig, cr };
}
