// Moteur — Bilan, Compte de résultat, SIG selon SYSCOHADA révisé 2017
import { BalanceRow, sumBy } from './balance';
import { sumMoneyWhere } from '../lib/moneySum';

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
  // Fonctions d'aide : solde D positif pour actif, solde C positif pour passif.
  // Utilise sumMoneyWhere (Money interne, bigint) pour éviter les erreurs
  // d'arrondi flottant sur les cumuls de balances volumineuses (1M+ écritures).
  const soldeD = (...prefixes: string[]): number =>
    sumMoneyWhere(rows, (r) => r.soldeD, (r) => prefixes.some((p) => r.account.startsWith(p)));
  const soldeC = (...prefixes: string[]): number =>
    sumMoneyWhere(rows, (r) => r.soldeC, (r) => prefixes.some((p) => r.account.startsWith(p)));

  // Résultat de l'exercice : calculé sur les MOUVEMENTS (sans AN) si fournis.
  // SYSCOHADA art. 38 — Classe 8 (HAO) :
  //   Charges HAO     : 81, 83, 85, 87, 89
  //   Produits HAO    : 82, 84, 86, 88 (88 = produits exceptionnels divers)
  // Le compte 88 (Subventions d'équilibre, dégagements de provisions devenus
  // sans objet, etc.) etait OMIS — provoquait une sous-estimation des produits
  // exceptionnels et donc du résultat net dans certains exercices.
  const resSource = movements && movements.length > 0 ? movements : rows;
  const charges = sumBy(resSource, ['6', '81', '83', '85', '87', '89']);
  const produits = -sumBy(resSource, ['7', '82', '84', '86', '88']);
  const resultat = produits - charges;

  // ── ACTIF ──────────────────────────────────────────────────────────
  // Approche par solde net : chaque compte de classes 2-5 apparaît UNE SEULE FOIS
  // soit à l'actif (soldeD) soit au passif (soldeC), jamais les deux.
  const actifImmoBrut_Incorp = soldeD('20', '21');
  const actifImmoBrut_Corp   = soldeD('22', '23', '24', '25');
  const actifImmoBrut_Fin    = soldeD('26', '27');
  // Comptes de classe 1 à solde DÉBITEUR (cas atypiques mais doivent être en actif) :
  //   109 = Actionnaires, capital souscrit non appelé
  //   169 = Primes de remboursement des obligations à amortir
  const capitalNonAppele = soldeD('109');
  const primesRemb       = soldeD('169');
  const amorts = soldeC('28', '29'); // amortissements cumulés = créditeurs
  const immoNet = actifImmoBrut_Incorp + actifImmoBrut_Corp + actifImmoBrut_Fin + capitalNonAppele + primesRemb - amorts;

  const stocks = soldeD('31', '32', '33', '34', '35', '36', '37', '38') - soldeC('39');
  // Créances clients NETTES = 411/412/413/414/415/416/418 BRUT − provisions 491
  // SYSCOHADA détaille les provisions sur tiers :
  //   491 = provisions sur clients (à déduire des créances clients)
  //   492 = provisions sur fournisseurs (à déduire des créances frn débiteurs / OU à ajouter aux dettes)
  //   493/494/495 = provisions autres créances (à déduire des autres créances)
  //   498 = provisions sur risques d'organismes financiers
  const provClients = soldeC('491');
  const provFourn = soldeC('492');
  const provAutres = soldeC('493', '494', '495', '496', '497', '498');
  const creancesClients = soldeD('41') - provClients;
  // Autres créances : classes 40, 42-48 à solde débiteur, NET des provisions
  // applicables (492 sur fournisseurs débiteurs + 493-498 sur autres tiers).
  const autresCreances = soldeD('40', '42', '43', '44', '45', '46', '47', '48') - provFourn - provAutres;

  // ── TRÉSORERIE — calcul NET par compte pour ne perdre aucun solde ──
  // Bug ancien : un compte 521 en découvert ponctuel (solde C) était perdu :
  //   tresoActive  = soldeD('50','51',...,'58') - soldeC('59')   ← ignorait soldeC('521')
  //   tresoPassif  = soldeC('56')                                ← ignorait découverts sur 521
  // Solution : sommer le NET de chaque compte 50-58 et reclasser selon le signe.
  let tresoActive = 0;
  let tresoPassif = 0;
  for (const r of rows) {
    const a2 = r.account.substring(0, 2);
    if (['50', '51', '52', '53', '54', '55', '57', '58'].includes(a2)) {
      const net = r.soldeD - r.soldeC;
      if (net >= 0) tresoActive += net;
      else tresoPassif += -net;        // banque en découvert → passif
    } else if (a2 === '56') {
      tresoPassif += r.soldeC - r.soldeD; // concours bancaires courants
    } else if (a2 === '59') {
      tresoActive -= (r.soldeC - r.soldeD); // provisions trésorerie diminuent l'actif
    }
  }

  const totalActifImmo = immoNet;
  const totalActifCirc = stocks + creancesClients + autresCreances;
  const totalTreso = tresoActive;
  let totalActif = totalActifImmo + totalActifCirc + totalTreso;

  // (P1-1) Décomposition AE/AF/AG harmonisée :
  //   AE (incorp.)  : classe 21 − amortissements 281
  //   AF (corp.)    : classes 22-25 − amortissements 282-285
  //   AG (financ.)  : classes 26-27 − dépréciations 29 (et provisions financières)
  // Cohérent avec la l.59 amorts = soldeC('28','29') : la somme AE+AF+AG ré-applique
  // exactement les mêmes amortissements/provisions, ventilés par nature d'immobilisation.
  // SYSCOHADA art. 38 — Plan comptable révisé 2017.
  const actif: Line[] = [
    { code: 'AD', label: 'Charges immobilisées', value: soldeD('20'), indent: 1, accountCodes: '20' },
    { code: 'AE', label: 'Immobilisations incorporelles', value: soldeD('21') - soldeC('281'), indent: 1, accountCodes: '21 − 281' },
    { code: 'AF', label: 'Immobilisations corporelles', value: soldeD('22','23','24','25') - soldeC('282','283','284','285'), indent: 1, accountCodes: '22-25 − 282-285' },
    { code: 'AG', label: 'Immobilisations financières', value: soldeD('26','27') - soldeC('29'), indent: 1, accountCodes: '26, 27 − 29' },
    { code: '_AZ', label: 'TOTAL ACTIF IMMOBILISÉ', value: totalActifImmo, total: true, accountCodes: '20 à 29' },
    { code: 'BA', label: 'Actif circulant HAO', value: soldeD('485'), indent: 1, accountCodes: '485' },
    { code: 'BB', label: 'Stocks et en-cours', value: stocks, indent: 1, accountCodes: '31-38 − 39' },
    { code: 'BH', label: 'Créances clients et comptes rattachés', value: creancesClients, indent: 1, accountCodes: '41 (débit.) − 49' },
    { code: 'BI', label: 'Autres créances', value: autresCreances, indent: 1, accountCodes: '40, 42-48 (débit.)' },
    { code: '_BK', label: 'TOTAL ACTIF CIRCULANT', value: totalActifCirc, total: true, accountCodes: '31 à 49' },
    { code: 'BQ', label: 'Trésorerie - Actif (banques, caisse)', value: tresoActive, indent: 1, accountCodes: '50-58 − 59' },
    { code: '_BT', label: 'TOTAL TRÉSORERIE - ACTIF', value: totalTreso, total: true, accountCodes: '50 à 59' },
  ];
  // (Le TOTAL GÉNÉRAL ACTIF est ajouté plus bas, après le calcul de l'écart d'équilibre)

  // ── PASSIF ─────────────────────────────────────────────────────────
  // 108 = Compte de l'exploitant (entreprises individuelles) → capital
  const capital = soldeC('101', '102', '103', '104', '108');
  const primes = soldeC('105');
  const reserves = soldeC('106', '11', '12', '13');
  const subvInv = soldeC('14');
  const provRegl = soldeC('15');
  const capitauxPropres = capital + primes + reserves + subvInv + provRegl + resultat;

  const emprunts = soldeC('16', '17', '18');
  const provRC = soldeC('19');
  const ressStables = capitauxPropres + emprunts + provRC;

  // Passif circulant : comptes de classe 4 à solde créditeur (hors 41x clients)
  const dettesFourn = soldeC('40');
  const dettesFisc = soldeC('44');
  const dettesPers = soldeC('42', '43');
  const dettesAutres = soldeC('41', '45', '46', '47', '48');
  // NB: soldeC('41') = avances clients + clients créditeurs (rare mais possible)
  const passifCirc = dettesFourn + dettesFisc + dettesPers + dettesAutres;

  // Trésorerie passive = découverts banques + concours bancaires (calculée plus haut)
  const tresoPass = tresoPassif;

  let totalPassif = ressStables + passifCirc + tresoPass;

  const passif: Line[] = [
    { code: 'CA', label: 'Capital', value: capital, indent: 1, accountCodes: '101-104' },
    { code: 'CD', label: 'Primes et réserves', value: primes + reserves, indent: 1, accountCodes: '105, 106, 11, 12, 13' },
    { code: 'CF', label: 'Résultat net de l\'exercice', value: resultat, indent: 1, accountCodes: 'Cl. 7 − Cl. 6' },
    { code: 'CL', label: "Subventions d'investissement", value: subvInv, indent: 1, accountCodes: '14' },
    { code: 'CM', label: 'Provisions réglementées', value: provRegl, indent: 1, accountCodes: '15' },
    { code: '_CP', label: 'TOTAL CAPITAUX PROPRES', value: capitauxPropres, total: true, accountCodes: '10 à 15' },
    { code: 'DA', label: 'Emprunts et dettes financières', value: emprunts, indent: 1, accountCodes: '16, 17, 18' },
    { code: 'DP', label: 'Provisions pour risques et charges', value: provRC, indent: 1, accountCodes: '19' },
    { code: '_DF', label: 'TOTAL RESSOURCES STABLES', value: ressStables, total: true, accountCodes: '10 à 19' },
    { code: 'DJ', label: 'Fournisseurs et comptes rattachés', value: dettesFourn, indent: 1, accountCodes: '40' },
    { code: 'DK', label: 'Dettes fiscales et sociales', value: dettesFisc + dettesPers, indent: 1, accountCodes: '42, 43, 44' },
    { code: 'DM', label: 'Autres dettes', value: dettesAutres, indent: 1, accountCodes: '41 (crédit.), 45-48' },
    { code: '_DP', label: 'TOTAL PASSIF CIRCULANT', value: passifCirc, total: true, accountCodes: '40 à 48' },
    { code: 'DV', label: 'Trésorerie - Passif (concours bancaires)', value: tresoPass, indent: 1, accountCodes: '56' },
  ];

  // ─── ÉQUILIBRAGE FORCÉ DU BILAN ─────────────────────────────────────
  // En partie double, Σ(soldeD − soldeC) = 0 sur toutes les écritures donc
  // Total Actif = Total Passif. Si écart, c'est qu'un compte n'a pas été pris
  // dans nos catégories (mapping incomplet, comptes exotiques, écritures
  // déséquilibrées, AN sur classes 6/7/8). On l'AJOUTE explicitement comme
  // ligne d'écart pour garantir l'équilibre visuel + signaler l'anomalie.
  const ecartFinal = totalPassif - totalActif;
  if (Math.abs(ecartFinal) > 1) {
    if (ecartFinal > 0) {
      // Passif > Actif : ajouter un poste d'actif "régularisation"
      actif.push({
        code: '_EC',
        label: '⚠ Écart de balance à analyser (régularisation)',
        value: ecartFinal,
        indent: 1,
        accountCodes: 'Comptes ignorés ou écritures déséquilibrées',
      });
      totalActif = totalPassif;
    } else {
      // Actif > Passif : ajouter un poste de passif "régularisation"
      passif.push({
        code: '_ECP',
        label: '⚠ Écart de balance à analyser (régularisation)',
        value: -ecartFinal,
        indent: 1,
        accountCodes: 'Comptes ignorés ou écritures déséquilibrées',
      });
      totalPassif = totalActif;
    }
  }

  actif.push({ code: '_BZ', label: 'TOTAL GÉNÉRAL ACTIF', value: totalActif, total: true, grand: true, accountCodes: 'Classes 2 à 5' });
  passif.push({ code: '_DZ', label: 'TOTAL GÉNÉRAL PASSIF', value: totalPassif, total: true, grand: true, accountCodes: 'Classes 1, 4, 5' });

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
  // Sum déterministes via Money en interne (cf. lib/moneySum.ts)
  const soldeC = (...p: string[]): number =>
    sumMoneyWhere(rows, (r) => r.soldeC, (r) => p.some((x) => r.account.startsWith(x)));
  const soldeD = (...p: string[]): number =>
    sumMoneyWhere(rows, (r) => r.soldeD, (r) => p.some((x) => r.account.startsWith(x)));
  // Exclut certains préfixes (utilisé pour retirer 7069 de 706)
  const soldeCExcl = (excl: string[], ...p: string[]): number =>
    sumMoneyWhere(
      rows,
      (r) => r.soldeC,
      (r) => p.some((x) => r.account.startsWith(x)) && !excl.some((e) => r.account.startsWith(e)),
    );

  // Produits d'exploitation
  const venteMarch = soldeC('701');
  // Ventes de produits/services HORS RRR accordés (7069xx exclus de 706)
  const venteProd = soldeCExcl(['7069'], '702', '703', '704', '705', '706', '707');
  // RRR accordés (709 + sous-comptes 7069xx) : réduction du CA
  // Ces comptes sont des contre-produits avec solde DÉBITEUR normal.
  // (P2-3) Détection du sens anormal : si solde créditeur > débiteur sur 709/7069,
  // on logue un warning au lieu d'augmenter le CA en silence (saisie inversée
  // probable). Le calcul reste correct mathématiquement (D−C donne un négatif
  // qui se soustrait, ce qui revient à AJOUTER un montant au CA — anomalie).
  const sd709 = soldeD('709'); const sc709 = soldeC('709');
  const sd7069 = soldeD('7069'); const sc7069 = soldeC('7069');
  if (sc709 > sd709 || sc7069 > sd7069) {
    // eslint-disable-next-line no-console
    console.warn('[statements] RRR accordés (709/7069) en solde créditeur — sens inversé probable. Vérifier les écritures.', { sd709, sc709, sd7069, sc7069 });
  }
  const rrrAccordes = (sd709 - sc709) + (sd7069 - sc7069);
  const ca = venteMarch + venteProd + soldeC('708') - rrrAccordes;
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
  // Dotations nettes = (D−C) des classes 68 & 69 d'exploitation, diminuées des
  // reprises nettes sur la classe 79. On utilise le NET (soldeD − soldeC) pour
  // chaque classe pour gérer correctement les éventuels soldes inversés.
  const dotations = (soldeD('68', '69') - soldeC('68', '69')) - (soldeC('79') - soldeD('79'));

  // SIG — Marge brute SYSCOHADA (sans double comptage des RRR)
  // Les ventes brutes (venteMarch / venteProd) n'incluent PAS les comptes
  // 709/7069 (RRR accordés). Le CA est déjà calculé NET de RRR ci-dessus.
  // La marge brute doit donc se calculer SUR LE CA NET, pas sur les ventes
  // brutes ; sinon on déduit les RRR deux fois.
  // Convention SYSCOHADA :
  //   Marge sur marchandises = (Ventes march − RRR sur march) − Coût d'achat march
  //   Marge sur matières     = (Ventes prod − RRR sur prod) + Var prod stockée − Coût matières
  // On répartit le rrrAccordes proportionnellement aux ventes (approximation
  // raisonnable quand le découpage 7019/7029... n'est pas dispo).
  const totalVentesBrut = venteMarch + venteProd;
  const rrrMarch = totalVentesBrut > 0 ? rrrAccordes * (venteMarch / totalVentesBrut) : 0;
  const rrrProd  = totalVentesBrut > 0 ? rrrAccordes * (venteProd / totalVentesBrut) : 0;
  const margeMarch = (venteMarch - rrrMarch) - (achatMarch + varStockMarch);
  const margeMP    = (venteProd  - rrrProd ) + prodStockee - (achatMP + varStockMP);
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
    { code: 'TC_RRR', label: 'RRR accordés (−)', value: -rrrAccordes, indent: 1, accountCodes: '709, 7069' },
    { code: '_XB', label: 'CHIFFRE D\'AFFAIRES', value: ca, total: true, accountCodes: '70 − 709' },
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
