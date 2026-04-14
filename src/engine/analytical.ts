// Comptabilité analytique — P&L par centre de coût / section
import { db } from '../db/schema';

export interface AnalyticalRow {
  section: string;
  axis: string;
  charges: number;
  produits: number;
  resultat: number;
  pctTotal: number;
}

export async function listAxes(orgId: string): Promise<string[]> {
  const entries = await db.gl.where('orgId').equals(orgId).toArray();
  const axes = new Set<string>();
  for (const e of entries) if (e.analyticalAxis) axes.add(e.analyticalAxis);
  return Array.from(axes).sort();
}

export async function listSections(orgId: string, axis?: string): Promise<string[]> {
  const entries = await db.gl.where('orgId').equals(orgId).toArray();
  const sections = new Set<string>();
  for (const e of entries) {
    if (axis && e.analyticalAxis !== axis) continue;
    if (e.analyticalSection) sections.add(e.analyticalSection);
  }
  return Array.from(sections).sort();
}

export async function computeAnalyticalPL(orgId: string, year: number, axis?: string): Promise<AnalyticalRow[]> {
  const periods = await db.periods.where('orgId').equals(orgId).toArray();
  const pIds = new Set(periods.filter((p) => p.year === year && p.month >= 1).map((p) => p.id));
  const entries = await db.gl.where('orgId').equals(orgId).toArray();

  const map = new Map<string, { charges: number; produits: number }>();

  for (const e of entries) {
    if (!pIds.has(e.periodId)) continue;
    const section = e.analyticalSection || '(Non affecté)';
    if (axis && e.analyticalAxis !== axis) continue;
    const c = e.account[0];
    const cur = map.get(section) ?? { charges: 0, produits: 0 };
    if (c === '6' || ['81','83','85','87','89'].some((p) => e.account.startsWith(p))) cur.charges += e.debit - e.credit;
    if (c === '7' || ['82','84','86','88'].some((p) => e.account.startsWith(p))) cur.produits += e.credit - e.debit;
    map.set(section, cur);
  }

  const totalCharges = Array.from(map.values()).reduce((s, v) => s + v.charges, 0) || 1;
  const rows: AnalyticalRow[] = [];
  for (const [section, v] of map) {
    rows.push({
      section, axis: axis ?? 'Tous',
      charges: v.charges, produits: v.produits,
      resultat: v.produits - v.charges,
      pctTotal: Math.round((v.charges / totalCharges) * 100),
    });
  }
  return rows.sort((a, b) => b.charges - a.charges);
}

export async function computeAnalyticalMonthly(orgId: string, year: number, section: string): Promise<{ months: string[]; charges: number[]; produits: number[] }> {
  const MONTHS = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
  const periods = await db.periods.where('orgId').equals(orgId).toArray();
  const entries = await db.gl.where('orgId').equals(orgId).toArray();
  const charges = Array(12).fill(0), produits = Array(12).fill(0);

  for (const p of periods.filter((p) => p.year === year && p.month >= 1)) {
    for (const e of entries) {
      if (e.periodId !== p.id) continue;
      if ((e.analyticalSection || '(Non affecté)') !== section) continue;
      const c = e.account[0];
      if (c === '6') charges[p.month - 1] += e.debit - e.credit;
      if (c === '7') produits[p.month - 1] += e.credit - e.debit;
    }
  }
  return { months: MONTHS, charges, produits };
}
