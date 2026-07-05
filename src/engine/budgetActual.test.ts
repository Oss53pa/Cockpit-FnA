import { describe, it, expect } from 'vitest';
import { bySection, type BudgetActualRow } from './budgetActual';

function row(code: string, realise = 100): BudgetActualRow {
  return {
    code, label: code, realise, budget: 0, ecart: realise, ecartPct: 0,
    status: 'neutral', isCharge: code[0] === '6',
  };
}

// Verrou de la classification SYSCOHADA révisé 2017 des dotations & reprises
// (décision d'expert) : 686/696 = financier, 687/697 = HAO, 796 = financier,
// 797 = HAO. bySection sans orgId utilise les sections par défaut.
describe('bySection — dotations & reprises SYSCOHADA', () => {
  const rows = [
    row('686100'), // dotations financières
    row('696100'), // dotations aux provisions financières
    row('687100'), // dotations HAO
    row('697100'), // dotations aux provisions HAO
    row('796100'), // reprises financières
    row('797100'), // reprises HAO
  ];
  const secs = bySection(rows);
  const codesOf = (id: string) => (secs.find((s) => s.section === id)?.rows ?? []).map((r) => r.code);

  it('686/696 → charges financières', () => {
    const c = codesOf('charges_fin');
    expect(c).toContain('686100');
    expect(c).toContain('696100');
    expect(c).not.toContain('687100');
  });

  it('687/697 → charges HAO', () => {
    const c = codesOf('charges_hao');
    expect(c).toContain('687100');
    expect(c).toContain('697100');
  });

  it('796 → produits financiers, 797 → produits HAO', () => {
    expect(codesOf('produits_fin')).toContain('796100');
    expect(codesOf('produits_hao')).toContain('797100');
  });

  it('aucun double comptage entre sections', () => {
    const seen = new Map<string, number>();
    for (const s of secs) for (const r of s.rows) seen.set(r.code, (seen.get(r.code) ?? 0) + 1);
    for (const [, n] of seen) expect(n).toBe(1);
  });
});
