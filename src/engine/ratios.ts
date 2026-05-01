// Moteur — Ratios financiers (rentabilité, liquidité, structure, activité)
import { BalanceRow } from './balance';
import { computeBilan, computeSIG } from './statements';
import { DEFAULT_RATIO_TARGETS, RatioTarget } from '../store/settings';

export type Ratio = {
  code: string;
  label: string;
  family: 'Rentabilité' | 'Liquidité' | 'Structure' | 'Activité';
  value: number;
  unit: '%' | 'x' | 'j' | 'ratio';
  formula: string;
  status: 'good' | 'warn' | 'alert';
  target: number;
  inverse?: boolean;   // si true, plus petit = meilleur
};

/**
 * Pourcentage robuste : retourne undefined si dénominateur nul ou non-fini.
 * (P1-2) — On ne renvoie plus 0 silencieux qui maskait le vrai cas "non calculable".
 * Le rendu UI doit afficher "N/A" pour ces cas (cf. mk() ci-dessous).
 */
function pct(n: number, d: number): number {
  if (!Number.isFinite(d) || d === 0) return NaN;
  return (n / d) * 100;
}

function ratioVal(n: number, d: number): number {
  if (!Number.isFinite(d) || d === 0) return NaN;
  return n / d;
}

/**
 * Clamp un taux de TVA dans la plage [0, 30%]. Au-dessus = anomalie.
 * (P0-3) — Évite les DSO/DPO délirants quand 4431 contient des écritures parasites
 * qui font dépasser 100% de TVA.
 */
function clampVatRate(rate: number, fallback: number): number {
  if (!Number.isFinite(rate) || rate < 0 || rate > 0.30) {
    if (Number.isFinite(rate) && rate !== 0) {
      // eslint-disable-next-line no-console
      console.warn(`[ratios] Taux TVA hors plage (${(rate * 100).toFixed(1)}%) — fallback ${(fallback * 100).toFixed(2)}%`);
    }
    return fallback;
  }
  return rate;
}

function status(value: number, t: RatioTarget | undefined, fallbackTarget: number, inverse = false): Ratio['status'] {
  const target = t?.target ?? fallbackTarget;
  const warn = (t?.warnThreshold ?? 80) / 100;
  const alert = (t?.alertThreshold ?? 60) / 100;
  const inv = t?.inverse ?? inverse;
  if (inv) {
    if (value <= target) return 'good';
    if (value <= target * warn) return 'warn';
    return 'alert';
  }
  if (value >= target) return 'good';
  if (value >= target * warn) return 'warn';
  if (value >= target * alert) return 'warn';
  return 'alert';
}

/**
 * Calcule l'ensemble des ratios financiers (rentabilité, liquidité, structure, activité).
 * @param rows           Balance générale (compute via computeBalance)
 * @param customTargets  Cibles personnalisées par tenant
 * @param opts           Options : periodDays (défaut 360), vatRate (taux TVA tenant, défaut 0.18)
 * @param opts.vatRate   Taux TVA officiel du tenant (Côte d'Ivoire/Sénégal: 0.18, Cameroun: 0.1925, …).
 *                       Utilisé en fallback quand le calcul effectif depuis 443x/445x donne un résultat
 *                       hors plage [0%, 30%]. Source : SYSCOHADA + droit fiscal local.
 * @param opts.previousCapPropres  Capitaux propres d'ouverture (solde N-1 réel). Si fourni, ROE
 *                                 utilise la MOYENNE (ouverture + clôture) / 2 — convention IFRS/US-GAAP.
 *                                 Fallback : approximation `capPropres - résultat` (ne prend pas en compte
 *                                 les apports/distributions intervenus dans l'exercice).
 * @param opts.previousTotalActif  Idem pour ROA (total actif d'ouverture).
 */
export function computeRatios(rows: BalanceRow[], customTargets?: Record<string, RatioTarget>, opts?: { periodDays?: number; vatRate?: number; previousCapPropres?: number; previousTotalActif?: number }): Ratio[] {
  const targetsMap = customTargets ?? Object.fromEntries(DEFAULT_RATIO_TARGETS.map((r) => [r.code, r]));
  const tg = (code: string) => targetsMap[code];
  const periodDays = opts?.periodDays ?? 360;
  const { actif, passif, totalActif } = computeBilan(rows);
  const { sig } = computeSIG(rows);

  // Extraire lignes clés du bilan
  const get = (lines: typeof actif, code: string) => lines.find((l) => l.code === code)?.value ?? 0;

  const capPropres = get(passif, '_CP');
  const ressStables = get(passif, '_DF');
  const actifImmo = get(actif, '_AZ');
  const stocks = get(actif, 'BB');
  const creancesClients = get(actif, 'BH');
  const autresCreances = get(actif, 'BI');
  const tresoActive = get(actif, '_BT');
  const actifCirc = get(actif, '_BK');
  const passifCirc = get(passif, '_DP');
  const tresoPass = get(passif, 'DV');
  const dettesFin = get(passif, 'DA');
  const dettesFourn = get(passif, 'DJ');

  // FR / BFR / TN
  const fr = ressStables - actifImmo;
  const bfr = stocks + creancesClients + autresCreances - passifCirc;
  const tn = fr - bfr;

  // CAF SYSCOHADA (méthode additive simplifiée) :
  //   CAF = Résultat net
  //       + Dotations aux amortissements & provisions (classes 68 + 69)
  //       − Reprises sur amortissements & provisions (classe 79)
  //       + VNC des immo cédées (685) − Produits de cessions (775)
  // Pour rester robuste sans dépendre de comptes optionnels, on prend la
  // dotation NETTE = (D − C) sur 68 + 69 diminuée des reprises 79.
  const dotN = (() => {
    let d = 0, c = 0;
    for (const r of rows) if (r.account.startsWith('68') || r.account.startsWith('69')) { d += r.soldeD; c += r.soldeC; }
    return d - c;
  })();
  const repN = (() => {
    let d = 0, c = 0;
    for (const r of rows) if (r.account.startsWith('79')) { d += r.soldeD; c += r.soldeC; }
    return c - d;
  })();
  const caf = sig.resultat + dotN - repN;

  // Helper factorisé : crée une entrée ratio avec application des cibles custom
  const mk = (code: string, label: string, family: Ratio['family'], value: number, unit: Ratio['unit'], formula: string, fallbackTarget: number, inverse = false): Ratio => {
    const custom = tg(code);
    return {
      code, label, family, value, unit, formula,
      target: custom?.target ?? fallbackTarget,
      inverse: custom?.inverse ?? inverse,
      status: status(value, custom, fallbackTarget, inverse),
    };
  };

  // ── DSO : (Créances clients TTC / CA TTC) × 360 ──
  // (P0-3) Taux TVA hierarchie :
  //   1. Calcul effectif depuis comptes 443x (TVA collectée) si valeur dans [0%, 30%]
  //   2. Fallback paramétré par le tenant (opts.vatRate) — typique 18% UEMOA, 19.25% Cameroun
  //   3. Fallback ultime : 18% (taux UEMOA standard)
  // SYSCOHADA — Plan comptable révisé 2017, comptes 443 (TVA facturée).
  const fallbackVat = opts?.vatRate ?? 0.18;
  const tvaCollectee = rows.filter((r) => r.account.startsWith('443')).reduce((s, r) => s + r.soldeC - r.soldeD, 0);
  const tauxTvaSortieRaw = sig.ca > 0 && tvaCollectee > 0 ? tvaCollectee / sig.ca : fallbackVat;
  const tauxTvaSortie = clampVatRate(tauxTvaSortieRaw, fallbackVat);
  const caTTC = sig.ca * (1 + tauxTvaSortie);
  const dsoV = caTTC > 0 ? (creancesClients / caTTC) * periodDays : NaN;

  // ── DPO : (Dettes fournisseurs TTC / Achats TTC) × 360 ──
  // (P1-3) même logique TVA paramétrable que DSO ci-dessus.
  // Achats RÉELS depuis la balance : 60 (achats marchandises/MP/non-stockés/EE)
  //                                + 61 (transports), 62/63 (services ext.)
  // Variations de stocks (603) exclues pour rester sur les achats consommés.
  const achatsHT = rows
    .filter((r) => (r.account.startsWith('60') && !r.account.startsWith('603')) || r.account.startsWith('61') || r.account.startsWith('62') || r.account.startsWith('63'))
    .reduce((s, r) => s + (r.soldeD - r.soldeC), 0);
  const tvaDeductible = rows.filter((r) => r.account.startsWith('445')).reduce((s, r) => s + r.soldeD - r.soldeC, 0);
  const tauxTvaEntreeRaw = achatsHT > 0 && tvaDeductible > 0 ? tvaDeductible / achatsHT : fallbackVat;
  const tauxTvaEntree = clampVatRate(tauxTvaEntreeRaw, fallbackVat);
  const achatsTTC = achatsHT * (1 + tauxTvaEntree);
  const dpoV = achatsTTC > 0 ? (dettesFourn / achatsTTC) * periodDays : NaN;

  return [
    mk('MB', 'Taux de marge brute', 'Rentabilité', pct(sig.margeBrute, sig.ca), '%', 'Marge brute / CA', 30),
    mk('TVA', 'Taux de valeur ajoutée', 'Rentabilité', pct(sig.valeurAjoutee, sig.ca), '%', 'Valeur ajoutée / CA', 35),
    mk('EBE', "Taux d'EBE", 'Rentabilité', pct(sig.ebe, sig.ca), '%', 'EBE / CA', 15),
    mk('TRE', "Rentabilité d'exploitation", 'Rentabilité', pct(sig.re, sig.ca), '%', "Résultat d'exploitation / CA", 10),
    mk('TRN', 'Rentabilité nette', 'Rentabilité', pct(sig.resultat, sig.ca), '%', 'Résultat net / CA', 8),
    // ROE/ROA basés sur capitaux d'OUVERTURE OU moyenne (P0-2).
    // Convention IFRS/US-GAAP : si capitaux d'ouverture connus, utiliser la
    // moyenne (ouverture + clôture) / 2. Sinon fallback : capPropres - résultat
    // (approximation qui ignore apports/distributions intermédiaires).
    mk('ROE', 'ROE', 'Rentabilité',
      pct(sig.resultat,
        opts?.previousCapPropres !== undefined
          ? (opts.previousCapPropres + capPropres) / 2
          : (capPropres - sig.resultat)),
      '%',
      opts?.previousCapPropres !== undefined
        ? 'Résultat net / [(Capitaux propres N-1 + N) / 2]'
        : 'Résultat net / Capitaux propres (ouverture estimée)',
      12),
    mk('ROA', 'ROA', 'Rentabilité',
      pct(sig.resultat,
        opts?.previousTotalActif !== undefined
          ? (opts.previousTotalActif + totalActif) / 2
          : (totalActif - sig.resultat)),
      '%',
      opts?.previousTotalActif !== undefined
        ? 'Résultat net / [(Total Actif N-1 + N) / 2]'
        : 'Résultat net / Total Actif (ouverture estimée)',
      6),
    mk('LG', 'Liquidité générale', 'Liquidité', ratioVal(actifCirc + tresoActive, passifCirc + tresoPass), 'x', '(Actif circulant + Trésorerie) / (Passif circulant + Trés. passive)', 1.5),
    mk('LR', 'Liquidité réduite', 'Liquidité', ratioVal(actifCirc + tresoActive - stocks, passifCirc + tresoPass), 'x', '(Actif circ. − Stocks + Trés.) / (Passif circ. + Trés. passive)', 1.0),
    mk('LI', 'Liquidité immédiate', 'Liquidité', ratioVal(tresoActive, passifCirc + tresoPass), 'x', 'Trésorerie active / (Passif circ. + Trés. passive)', 0.3),
    mk('AF', 'Autonomie financière', 'Structure', ratioVal(capPropres, totalActif), 'ratio', 'Capitaux propres / Total passif', 0.5),
    mk('END', 'Endettement', 'Structure', ratioVal(dettesFin, capPropres), 'ratio', 'Dettes financières / Capitaux propres', 1.0, true),
    mk('CAP_REMB', 'Capacité de remboursement', 'Structure', ratioVal(dettesFin, caf), 'x', 'Dettes financières / CAF', 4, true),
    { code: 'FR', label: 'Fonds de roulement (FR)', family: 'Structure', value: fr, unit: 'ratio', formula: 'Ressources stables − Actif immobilisé', target: 0, status: fr >= 0 ? 'good' : 'alert' },
    { code: 'BFR', label: 'Besoin en FR (BFR)', family: 'Structure', value: bfr, unit: 'ratio', formula: 'Stocks + Créances − Dettes exploitation', target: 0, status: 'good' },
    { code: 'TN', label: 'Trésorerie nette', family: 'Structure', value: tn, unit: 'ratio', formula: 'FR − BFR', target: 0, status: tn >= 0 ? 'good' : 'alert' },
    mk('DSO', 'DSO — délai clients (jours)', 'Activité', dsoV, 'j', '(Créances clients / CA TTC) × 360', 60, true),
    mk('DPO', 'DPO — délai fournisseurs (jours)', 'Activité', dpoV, 'j', '(Dettes fournisseurs / Achats TTC) × 360', 60),
  ];
}
