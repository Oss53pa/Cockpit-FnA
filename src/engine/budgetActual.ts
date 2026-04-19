// Comparaison Budget vs Réalisé sur le compte de résultat
import { db } from '../db/schema';
import { findSyscoAccount } from '../syscohada/coa';
import { Line } from './statements';

export type BudgetActualRow = {
  code: string;
  label: string;
  realise: number;
  budget: number;
  ecart: number;
  ecartPct: number;
  status: 'favorable' | 'defavorable' | 'neutral';
  isCharge: boolean;
};

// CRSection = identifiant de section (par défaut + sections custom)
export type CRSection = string;
export type CRDefaultSection =
  | 'produits_expl' | 'charges_expl'
  | 'produits_fin' | 'charges_fin'
  | 'produits_hao' | 'charges_hao'
  | 'impots';

export type CustomSection = { id: string; label: string; prefixes: string[]; isCharge: boolean };

// Sections en SYSCOHADA :
// - Produits exploitation : 70-75 + 781 (transferts d'expl.)
// - Charges exploitation  : 60-66 + 681 (dot. expl.) — on inclut classe 6 sauf 67 (financier) et 68/69 réparties
// - Produits financiers   : 77 + 786
// - Charges financières   : 67 + 687
// - Produits HAO          : 82, 84, 86, 88
// - Charges HAO           : 81, 83, 85
// - Impôts sur résultat   : 87 (participation) + 89 (impôt)
const DEFAULT_SECTION_DEFS: Record<CRDefaultSection, { label: string; prefixes: string[]; isCharge: boolean }> = {
  produits_expl: { label: "Produits d'exploitation",  prefixes: ['70','71','72','73','74','75','781','791'], isCharge: false },
  charges_expl:  { label: "Charges d'exploitation",   prefixes: ['60','61','62','63','64','65','66','681','691'], isCharge: true },
  produits_fin:  { label: 'Produits financiers',       prefixes: ['77','786','797'], isCharge: false },
  charges_fin:   { label: 'Charges financières',       prefixes: ['67','687','697'], isCharge: true },
  produits_hao:  { label: 'Produits exceptionnels',    prefixes: ['82','84','86','88'], isCharge: false },
  charges_hao:   { label: 'Charges exceptionnelles',   prefixes: ['81','83','85'], isCharge: true },
  impots:        { label: 'Impôts sur les bénéfices',  prefixes: ['87','89'], isCharge: true },
};

// Résultats intermédiaires calculés (ne sont pas des sections de comptes)
export type CRIntermediate = 'res_expl' | 'res_fin' | 'res_courant' | 'res_except' | 'res_net';
export const INTERMEDIATE_LABELS: Record<CRIntermediate, string> = {
  res_expl:    "Résultat d'exploitation",
  res_fin:     'Résultat financier',
  res_courant: 'Résultat courant avant impôts',
  res_except:  'Résultat exceptionnel',
  res_net:     "Résultat net de l'exercice",
};

// Ordre canonique entrelacé sections + intermédiaires
export const CR_FLOW: Array<{ kind: 'section'; key: CRSection } | { kind: 'inter'; key: CRIntermediate }> = [
  { kind: 'section', key: 'produits_expl' },
  { kind: 'section', key: 'charges_expl' },
  { kind: 'inter',   key: 'res_expl' },
  { kind: 'section', key: 'produits_fin' },
  { kind: 'section', key: 'charges_fin' },
  { kind: 'inter',   key: 'res_fin' },
  { kind: 'inter',   key: 'res_courant' },
  { kind: 'section', key: 'produits_hao' },
  { kind: 'section', key: 'charges_hao' },
  { kind: 'inter',   key: 'res_except' },
  { kind: 'section', key: 'impots' },
  { kind: 'inter',   key: 'res_net' },
];

// Labels personnalisables (persistés en localStorage par société)
const KEY_LABELS = 'cr-section-labels';
const KEY_ORDER  = 'cr-section-order';
const KEY_CUSTOM = 'cr-section-custom';

export function loadCustomSections(orgId: string): CustomSection[] {
  try {
    const raw = localStorage.getItem(`${KEY_CUSTOM}:${orgId}`);
    if (raw) return JSON.parse(raw) as CustomSection[];
  } catch { /* ignore */ }
  return [];
}
export function saveCustomSections(orgId: string, sections: CustomSection[]) {
  localStorage.setItem(`${KEY_CUSTOM}:${orgId}`, JSON.stringify(sections));
}

export function loadLabels(orgId: string): Record<CRSection, string> {
  try {
    const raw = localStorage.getItem(`${KEY_LABELS}:${orgId}`);
    const overrides = raw ? JSON.parse(raw) : {};
    const out: Record<string, string> = {};
    for (const k of Object.keys(DEFAULT_SECTION_DEFS) as CRDefaultSection[]) {
      out[k] = overrides[k] ?? DEFAULT_SECTION_DEFS[k].label;
    }
    for (const c of loadCustomSections(orgId)) {
      out[c.id] = overrides[c.id] ?? c.label;
    }
    return out;
  } catch { return Object.fromEntries(Object.entries(DEFAULT_SECTION_DEFS).map(([k, v]) => [k, v.label])) as any; }
}
export function saveLabels(orgId: string, labels: Record<CRSection, string>) {
  localStorage.setItem(`${KEY_LABELS}:${orgId}`, JSON.stringify(labels));
}
export function loadOrder(orgId: string): CRSection[] {
  const defaults = Object.keys(DEFAULT_SECTION_DEFS) as CRDefaultSection[];
  const customIds = loadCustomSections(orgId).map((c) => c.id);
  let stored: string[] = [];
  try {
    const raw = localStorage.getItem(`${KEY_ORDER}:${orgId}`);
    if (raw) stored = JSON.parse(raw);
  } catch { /* ignore */ }
  const all = [...defaults, ...customIds];
  // Commencer par l'ordre stocké (filtré) puis compléter avec les ids manquants
  const filtered = stored.filter((id) => all.includes(id));
  for (const id of all) if (!filtered.includes(id)) filtered.push(id);
  return filtered;
}
export function saveOrder(orgId: string, order: CRSection[]) {
  localStorage.setItem(`${KEY_ORDER}:${orgId}`, JSON.stringify(order));
}

// CR_SECTIONS dynamique selon labels custom + sections custom
export function getSectionDefs(orgId?: string): Record<string, { label: string; prefixes: string[]; isCharge: boolean }> {
  if (!orgId) return { ...DEFAULT_SECTION_DEFS };
  const labels = loadLabels(orgId);
  const out: Record<string, { label: string; prefixes: string[]; isCharge: boolean }> = {};
  for (const k of Object.keys(DEFAULT_SECTION_DEFS) as CRDefaultSection[]) {
    out[k] = { ...DEFAULT_SECTION_DEFS[k], label: labels[k] ?? DEFAULT_SECTION_DEFS[k].label };
  }
  for (const c of loadCustomSections(orgId)) {
    out[c.id] = { label: labels[c.id] ?? c.label, prefixes: c.prefixes, isCharge: c.isCharge };
  }
  return out;
}

// Compat : utilisation directe des defaults
export const CR_SECTIONS = DEFAULT_SECTION_DEFS;

// Calcul Budget vs Réalisé sur tout le CR (classes 6 et 7)
export async function computeBudgetActual(orgId: string, year: number, version?: string): Promise<BudgetActualRow[]> {
  const periods = await db.periods.where('orgId').equals(orgId).toArray();
  const ids = new Set(periods.filter((p) => p.year === year && p.month >= 1).map((p) => p.id));
  const entries = await db.gl.where('orgId').equals(orgId).toArray();

  // Réalisé par compte (classes 6, 7 et 8 pour HAO / Impôts)
  // BUGFIX : avant l'audit, seules les classes 6 et 7 étaient prises en compte,
  // ce qui faisait apparaître les sections « Produits HAO » (82/84/86/88),
  // « Charges HAO » (81/83/85) et « Impôts » (87/89) avec 0 comptes.
  // SYSCOHADA — classification charge/produit par sous-classe 8 :
  //   81, 83, 85, 87, 89 → charges (solde débiteur normal)
  //   82, 84, 86, 88      → produits (solde créditeur normal)
  const chargeClass8 = new Set(['81', '83', '85', '87', '89']);
  const produitClass8 = new Set(['82', '84', '86', '88']);
  const realiseMap = new Map<string, number>();
  for (const e of entries) {
    if (!ids.has(e.periodId)) continue;
    const c0 = e.account[0];
    if (c0 !== '6' && c0 !== '7' && c0 !== '8') continue;
    let isCharge: boolean;
    if (c0 === '6') isCharge = true;
    else if (c0 === '7') isCharge = false;
    else {
      const sub = e.account.substring(0, 2);
      if (chargeClass8.has(sub)) isCharge = true;
      else if (produitClass8.has(sub)) isCharge = false;
      else continue; // 80, compte de liaison — ignoré
    }
    const v = isCharge ? e.debit - e.credit : e.credit - e.debit;
    realiseMap.set(e.account, (realiseMap.get(e.account) ?? 0) + v);
  }

  // Budget : si version fournie, depuis Dexie ; sinon = réalisé × 0.95 (simulation)
  const budgetMap = new Map<string, number>();
  if (version) {
    const lines = await db.budgets.where('[orgId+year+version]').equals([orgId, year, version]).toArray();
    for (const l of lines) {
      budgetMap.set(l.account, (budgetMap.get(l.account) ?? 0) + l.amount);
    }
  } else {
    realiseMap.forEach((v, k) => budgetMap.set(k, Math.round(v * 0.95)));
  }

  const all = new Set<string>([...realiseMap.keys(), ...budgetMap.keys()]);
  const rows: BudgetActualRow[] = [];
  for (const account of all) {
    const realise = realiseMap.get(account) ?? 0;
    const budget = budgetMap.get(account) ?? 0;
    const ecart = realise - budget;
    const ecartPct = budget !== 0 ? (ecart / Math.abs(budget)) * 100 : 0;
    const sysco = findSyscoAccount(account);
    // Classification charge/produit cohérente avec le calcul du réalisé
    // (classes 6 + 81/83/85/87/89 = charges, classes 7 + 82/84/86/88 = produits)
    const c0 = account[0];
    const sub = account.substring(0, 2);
    const isCharge =
      c0 === '6' ? true :
      c0 === '7' ? false :
      c0 === '8' ? chargeClass8.has(sub) :
      false;
    const status: BudgetActualRow['status'] =
      Math.abs(ecart) < 1 ? 'neutral' :
      isCharge ? (ecart <= 0 ? 'favorable' : 'defavorable') : (ecart >= 0 ? 'favorable' : 'defavorable');
    rows.push({
      code: account,
      label: sysco?.label ?? 'Compte',
      realise, budget, ecart, ecartPct, status, isCharge,
    });
  }
  return rows.sort((a, b) => a.code.localeCompare(b.code));
}

// Agrégation par section (avec labels et ordre personnalisés si orgId fourni)
export function bySection(rows: BudgetActualRow[], orgId?: string): Array<{ section: CRSection; label: string; rows: BudgetActualRow[]; totalRealise: number; totalBudget: number; totalEcart: number; ecartPct: number; isCharge: boolean }> {
  const defs = getSectionDefs(orgId);
  const order = orgId ? loadOrder(orgId) : (Object.keys(defs) as string[]);
  const out: ReturnType<typeof bySection> = [];
  for (const sec of order) {
    const def = defs[sec];
    if (!def) continue;
    const subset = rows.filter((r) => def.prefixes.some((p) => r.code.startsWith(p)));
    const totalRealise = subset.reduce((s, r) => s + r.realise, 0);
    const totalBudget = subset.reduce((s, r) => s + r.budget, 0);
    const totalEcart = totalRealise - totalBudget;
    const ecartPct = totalBudget ? (totalEcart / Math.abs(totalBudget)) * 100 : 0;
    out.push({ section: sec, label: def.label, rows: subset, totalRealise, totalBudget, totalEcart, ecartPct, isCharge: def.isCharge });
  }
  return out;
}

// Détail d'une section seule (pour zoom)
export function sectionDetail(section: CRSection, rows: BudgetActualRow[]): BudgetActualRow[] {
  const def = (DEFAULT_SECTION_DEFS as any)[section];
  if (!def) return [];
  return rows.filter((r) => def.prefixes.some((p: string) => r.code.startsWith(p)));
}

// ─── BUDGET VS RÉALISÉ MENSUEL + N-1 ──────────────────────────────

export type MonthlyBudgetRow = {
  code: string;
  label: string;
  isCharge: boolean;
  months: Array<{ realise: number; budget: number; n1: number; ecart: number }>;
  totalRealise: number;
  totalBudget: number;
  totalN1: number;
  totalEcart: number;
};

export async function computeBudgetActualMonthly(orgId: string, year: number, version?: string): Promise<{ months: string[]; rows: MonthlyBudgetRow[] }> {
  const MONTHS = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
  const periods = await db.periods.where('orgId').equals(orgId).toArray();
  const entries = await db.gl.where('orgId').equals(orgId).toArray();

  // Périodes année N et N-1
  const periodsByMonth = new Map<number, string>(); // month → periodId
  const periodsByMonthN1 = new Map<number, string>();
  for (const p of periods) {
    if (p.year === year && p.month >= 1 && p.month <= 12) periodsByMonth.set(p.month, p.id);
    if (p.year === year - 1 && p.month >= 1 && p.month <= 12) periodsByMonthN1.set(p.month, p.id);
  }

  // Réalisé par compte × mois (année N)
  const realise = new Map<string, number[]>(); // account → [12 mois]
  // Réalisé N-1
  const realiseN1 = new Map<string, number[]>();

  for (const e of entries) {
    const c = e.account[0];
    if (c !== '6' && c !== '7') continue;
    const v = c === '6' ? e.debit - e.credit : e.credit - e.debit;

    // Année N
    for (let m = 1; m <= 12; m++) {
      if (e.periodId === periodsByMonth.get(m)) {
        const arr = realise.get(e.account) ?? Array(12).fill(0);
        arr[m - 1] += v;
        realise.set(e.account, arr);
      }
    }
    // Année N-1
    for (let m = 1; m <= 12; m++) {
      if (e.periodId === periodsByMonthN1.get(m)) {
        const arr = realiseN1.get(e.account) ?? Array(12).fill(0);
        arr[m - 1] += v;
        realiseN1.set(e.account, arr);
      }
    }
  }

  // Budget par compte × mois
  const budgetMonthly = new Map<string, number[]>();
  if (version) {
    const lines = await db.budgets.where('[orgId+year+version]').equals([orgId, year, version]).toArray();
    for (const l of lines) {
      const arr = budgetMonthly.get(l.account) ?? Array(12).fill(0);
      arr[l.month - 1] += l.amount;
      budgetMonthly.set(l.account, arr);
    }
  }

  // Fusionner tous les comptes
  const allAccounts = new Set([...realise.keys(), ...realiseN1.keys(), ...budgetMonthly.keys()]);
  const rows: MonthlyBudgetRow[] = [];

  for (const account of allAccounts) {
    const rN = realise.get(account) ?? Array(12).fill(0);
    const rN1 = realiseN1.get(account) ?? Array(12).fill(0);
    const bud = budgetMonthly.get(account) ?? (version ? Array(12).fill(0) : rN.map((v) => Math.round(v * 0.95)));
    const sysco = findSyscoAccount(account);
    const isCharge = account.startsWith('6');

    const months = rN.map((r, i) => ({
      realise: r,
      budget: bud[i],
      n1: rN1[i],
      ecart: r - bud[i],
    }));

    rows.push({
      code: account,
      label: sysco?.label ?? 'Compte',
      isCharge,
      months,
      totalRealise: rN.reduce((s, v) => s + v, 0),
      totalBudget: bud.reduce((s, v) => s + v, 0),
      totalN1: rN1.reduce((s, v) => s + v, 0),
      totalEcart: rN.reduce((s, v) => s + v, 0) - bud.reduce((s, v) => s + v, 0),
    });
  }

  return { months: MONTHS, rows: rows.sort((a, b) => a.code.localeCompare(b.code)) };
}

// Agréger le mensuel par section
export function monthlySummaryBySection(data: { months: string[]; rows: MonthlyBudgetRow[] }, orgId?: string) {
  const defs = getSectionDefs(orgId);
  const order = orgId ? loadOrder(orgId) : Object.keys(defs);
  const sections: Array<{
    section: string; label: string; isCharge: boolean;
    months: Array<{ realise: number; budget: number; n1: number }>;
    totalRealise: number; totalBudget: number; totalN1: number;
  }> = [];

  for (const sec of order) {
    const def = defs[sec];
    if (!def) continue;
    const subset = data.rows.filter((r) => def.prefixes.some((p) => r.code.startsWith(p)));
    const months = Array.from({ length: 12 }, (_, i) => ({
      realise: subset.reduce((s, r) => s + r.months[i].realise, 0),
      budget: subset.reduce((s, r) => s + r.months[i].budget, 0),
      n1: subset.reduce((s, r) => s + r.months[i].n1, 0),
    }));
    sections.push({
      section: sec, label: def.label, isCharge: def.isCharge, months,
      totalRealise: months.reduce((s, m) => s + m.realise, 0),
      totalBudget: months.reduce((s, m) => s + m.budget, 0),
      totalN1: months.reduce((s, m) => s + m.n1, 0),
    });
  }
  return sections;
}

// Calcul des résultats intermédiaires depuis les sections agrégées
export function computeIntermediates(secs: ReturnType<typeof bySection>) {
  const get = (k: CRSection) => secs.find((s) => s.section === k);
  const sum = (k: CRSection, field: 'totalRealise' | 'totalBudget') => get(k)?.[field] ?? 0;

  const res_expl_R = sum('produits_expl', 'totalRealise') - sum('charges_expl', 'totalRealise');
  const res_expl_B = sum('produits_expl', 'totalBudget')  - sum('charges_expl', 'totalBudget');
  const res_fin_R  = sum('produits_fin', 'totalRealise')  - sum('charges_fin', 'totalRealise');
  const res_fin_B  = sum('produits_fin', 'totalBudget')   - sum('charges_fin', 'totalBudget');
  const res_courant_R = res_expl_R + res_fin_R;
  const res_courant_B = res_expl_B + res_fin_B;
  const res_except_R  = sum('produits_hao', 'totalRealise') - sum('charges_hao', 'totalRealise');
  const res_except_B  = sum('produits_hao', 'totalBudget')  - sum('charges_hao', 'totalBudget');
  const res_net_R = res_courant_R + res_except_R - sum('impots', 'totalRealise');
  const res_net_B = res_courant_B + res_except_B - sum('impots', 'totalBudget');

  return {
    res_expl:    { realise: res_expl_R,    budget: res_expl_B },
    res_fin:     { realise: res_fin_R,     budget: res_fin_B },
    res_courant: { realise: res_courant_R, budget: res_courant_B },
    res_except:  { realise: res_except_R,  budget: res_except_B },
    res_net:     { realise: res_net_R,     budget: res_net_B },
  };
}

// Compte de résultat synthétique (section + total) à partir des rows
export function crBySection(rows: BudgetActualRow[], orgId?: string): Line[] {
  const sections = bySection(rows, orgId);
  const lines: Line[] = [];
  let cumulProduits = 0;
  let cumulCharges = 0;
  for (const sec of sections) {
    lines.push({
      code: sec.section.toUpperCase(),
      label: sec.label + (sec.isCharge ? ' (charges)' : ' (produits)'),
      value: sec.totalRealise,
      total: true,
    });
    if (sec.isCharge) cumulCharges += sec.totalRealise;
    else cumulProduits += sec.totalRealise;
  }
  lines.push({ code: '_RES', label: 'RÉSULTAT', value: cumulProduits - cumulCharges, total: true, grand: true });
  return lines;
}
