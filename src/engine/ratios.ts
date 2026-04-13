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

function pct(n: number, d: number): number {
  return d !== 0 ? (n / d) * 100 : 0;
}

function ratioVal(n: number, d: number): number {
  return d !== 0 ? n / d : 0;
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

export function computeRatios(rows: BalanceRow[], customTargets?: Record<string, RatioTarget>): Ratio[] {
  const targetsMap = customTargets ?? Object.fromEntries(DEFAULT_RATIO_TARGETS.map((r) => [r.code, r]));
  const tg = (code: string) => targetsMap[code];
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

  const caf = sig.resultat + 0; // simplifié — on ajouterait dot. nettes des reprises

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

  const dsoV = sig.ca > 0 ? (creancesClients / (sig.ca * 1.18)) * 360 : 0;
  const dpoV = sig.ca > 0 ? (dettesFourn / (sig.ca * 0.6 * 1.18)) * 360 : 0;

  return [
    mk('MB', 'Taux de marge brute', 'Rentabilité', pct(sig.margeBrute, sig.ca), '%', 'Marge brute / CA', 30),
    mk('TVA', 'Taux de valeur ajoutée', 'Rentabilité', pct(sig.valeurAjoutee, sig.ca), '%', 'Valeur ajoutée / CA', 35),
    mk('EBE', "Taux d'EBE", 'Rentabilité', pct(sig.ebe, sig.ca), '%', 'EBE / CA', 15),
    mk('TRE', "Rentabilité d'exploitation", 'Rentabilité', pct(sig.re, sig.ca), '%', "Résultat d'exploitation / CA", 10),
    mk('TRN', 'Rentabilité nette', 'Rentabilité', pct(sig.resultat, sig.ca), '%', 'Résultat net / CA', 8),
    mk('ROE', 'ROE', 'Rentabilité', pct(sig.resultat, capPropres), '%', 'Résultat net / Capitaux propres', 12),
    mk('ROA', 'ROA', 'Rentabilité', pct(sig.resultat, totalActif), '%', 'Résultat net / Total Actif', 6),
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
