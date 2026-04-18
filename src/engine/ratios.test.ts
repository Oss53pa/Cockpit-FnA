import { describe, it, expect } from 'vitest';
import { computeRatios } from './ratios';
import type { BalanceRow } from './balance';

function row(account: string, debit: number, credit: number): BalanceRow {
  const solde = debit - credit;
  return {
    account,
    label: '',
    debit,
    credit,
    solde,
    soldeD: solde > 0 ? solde : 0,
    soldeC: solde < 0 ? -solde : 0,
  };
}

describe('computeRatios', () => {
  it('returns a fixed set of ratios even on empty input', () => {
    const ratios = computeRatios([]);
    expect(ratios.length).toBeGreaterThan(0);
    // Famille bien fournie
    for (const r of ratios) {
      expect(['Rentabilité', 'Liquidité', 'Structure', 'Activité']).toContain(r.family);
    }
  });

  it('includes core ratio codes', () => {
    const ratios = computeRatios([]);
    const codes = ratios.map((r) => r.code);
    for (const c of ['MB', 'EBE', 'TRN', 'ROE', 'LG', 'AF', 'DSO', 'DPO']) {
      expect(codes).toContain(c);
    }
  });

  it('handles a minimal dataset without throwing', () => {
    const rows = [
      row('101', 0, 800),
      row('411', 300, 0),
      row('401', 0, 200),
      row('521', 500, 0),
      row('601', 400, 0),
      row('701', 0, 1000),
    ];
    const ratios = computeRatios(rows);
    // Chaque ratio a une valeur numérique finie ou 0
    for (const r of ratios) {
      expect(Number.isFinite(r.value)).toBe(true);
    }
  });

  it('all ratios carry a status', () => {
    const ratios = computeRatios([]);
    for (const r of ratios) {
      expect(['good', 'warn', 'alert']).toContain(r.status);
    }
  });
});
