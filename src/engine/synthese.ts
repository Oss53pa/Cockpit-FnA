import { C } from '../lib/colors';

type Line = { code: string; value: number };
type MonthlyLine = { code: string; values: number[] };
type BalanceRow = { account: string; debit: number; credit: number; soldeC: number };
type Ratio = { code: string; label: string; family: string; value: number; target: number | string; unit: string; status: string };
type MonthlyCA = { mois: string; realise: number; budget?: number; n1?: number };
type MonthlyBilan = { months: string[]; actif: MonthlyLine[]; passif: MonthlyLine[] };

export type Alert = { severity: 'high' | 'medium' | 'low'; type: string; message: string };
export type FRBFRRow = { mois: string; fr: number; bfr: number; tn: number };
export type CARow = { mois: string; realise: number; budget: number; n1: number };
export type ChargeSlice = { name: string; value: number; color: string; pct: number };

const get = (lines: Line[], code: string) => lines.find((l) => l.code === code)?.value ?? 0;
const getM = (lines: MonthlyLine[], code: string, i: number) => lines.find((l) => l.code === code)?.values[i] ?? 0;

export function computeStructure(bilan: { actif: Line[]; passif: Line[] }, ca: number) {
  const ressStables = get(bilan.passif, '_DF');
  const actifImmo = get(bilan.actif, '_AZ');
  const tresoActive = get(bilan.actif, '_BT');
  const tresoPass = get(bilan.passif, 'DV');
  const passifCirc = get(bilan.passif, '_DP');
  const stocks = get(bilan.actif, 'BB');
  const creances = get(bilan.actif, 'BH');
  const autresC = get(bilan.actif, 'BI');
  const fr = ressStables - actifImmo;
  const bfr = stocks + creances + autresC - passifCirc;
  const tn = tresoActive - tresoPass;
  const jCA = ca ? (bfr / ca) * 360 : 0;
  return { fr, bfr, tn, jCA };
}

export function computeFRBFRMonthly(mb: MonthlyBilan): FRBFRRow[] {
  return mb.months.map((mois, i) => {
    const fr = getM(mb.passif, '_DF', i) - getM(mb.actif, '_AZ', i);
    const bfr = getM(mb.actif, '_BK', i) - getM(mb.passif, '_DP', i);
    // Bug fix: TN doit etre la VRAIE tresorerie nette (tresoActive - tresoPass),
    // PAS la valeur derivee fr - bfr. En theorie l'equation FR = BFR + TN tient,
    // mais des qu'un compte n'est pas mappe (ex: imbalance bilan), fr - bfr
    // donne un faux TN gonfle (observation user: TN reelle 372M, fr-bfr = 1.9B).
    const tn = getM(mb.actif, '_BT', i) - getM(mb.passif, 'DV', i);
    return { mois, fr, bfr, tn };
  });
}

export function computeCaData(monthly: MonthlyCA[], budget?: number[], n1?: number[]): CARow[] {
  return monthly.map((m, i) => ({
    mois: m.mois,
    realise: m.realise,
    // Budget : prioritairement celui inclus dans monthly (depuis useMonthlyCA enrichi),
    // sinon le tableau optionnel passé séparément, sinon 0.
    budget: m.budget ?? budget?.[i] ?? 0,
    n1: m.n1 ?? n1?.[i] ?? 0,
  }));
}

const sumByPrefixes = (balance: BalanceRow[], prefixes: string[]) =>
  balance.filter((r) => prefixes.some((p) => r.account.startsWith(p)))
    .reduce((s, r) => s + r.debit - r.credit, 0);

export function computeChargesData(balance: BalanceRow[]): ChargeSlice[] {
  const slices = [
    { name: 'Achats',         prefixes: ['60'],             color: C.primary },
    { name: 'Personnel',      prefixes: ['66'],             color: C.secondary },
    { name: 'Services ext.',  prefixes: ['61', '62', '63'], color: C.accent1 },
    { name: 'Amortissements', prefixes: ['68', '69'],       color: C.accent3 },
    { name: 'Impôts & taxes', prefixes: ['64'],             color: C.warning },
    { name: 'Autres',         prefixes: ['65', '67'],       color: C.accent2 },
  ].map((s) => ({ name: s.name, color: s.color, value: sumByPrefixes(balance, s.prefixes) }));
  const total = slices.reduce((s, c) => s + c.value, 0);
  return slices
    .filter((c) => c.value > 0)
    .map((c) => ({ ...c, pct: Math.round((c.value / Math.max(total, 1)) * 100) }));
}

export function computeAlerts(ratios: Ratio[], balance: BalanceRow[], limit = 6): Alert[] {
  const list: Alert[] = [];
  ratios.forEach((r) => {
    if (r.status === 'alert')
      list.push({ severity: 'high', type: r.family, message: `${r.label} : ${r.value.toFixed(2)} ${r.unit} (cible ${r.target})` });
    else if (r.status === 'warn')
      list.push({ severity: 'medium', type: r.family, message: `${r.label} en zone de vigilance (${r.value.toFixed(2)} ${r.unit})` });
  });
  balance.forEach((r) => {
    if (r.account.startsWith('6') && r.soldeC > 1000)
      list.push({ severity: 'high', type: 'Anomalie', message: `Compte ${r.account} en solde créditeur anormal` });
  });
  return list.slice(0, limit);
}
