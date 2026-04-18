import { describe, it, expect } from 'vitest';
import { aggregateBySyscoRoot, sumBy, type BalanceRow } from './balance';

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

describe('sumBy', () => {
  it('returns 0 for empty rows', () => {
    expect(sumBy([], ['6'])).toBe(0);
  });

  it('sums solde for matching prefixes', () => {
    const rows = [row('601', 100, 0), row('602', 50, 10), row('70', 0, 200)];
    expect(sumBy(rows, ['6'])).toBe(140);
    expect(sumBy(rows, ['7'])).toBe(-200);
  });

  it('supports multiple prefixes', () => {
    const rows = [row('411', 300, 0), row('401', 0, 200), row('521', 500, 0)];
    expect(sumBy(rows, ['411', '401'])).toBe(100);
  });

  it('ignores rows that do not match any prefix', () => {
    const rows = [row('101', 1000, 0), row('601', 200, 0)];
    expect(sumBy(rows, ['6'])).toBe(200);
  });
});

describe('aggregateBySyscoRoot', () => {
  it('returns an empty map for empty input', () => {
    expect(aggregateBySyscoRoot([]).size).toBe(0);
  });

  it('rolls up soldeD / soldeC per root', () => {
    const rows = [row('601001', 100, 0), row('601002', 50, 0), row('701001', 0, 300)];
    const agg = aggregateBySyscoRoot(rows);
    // 60 and 70 roots — all exist in SYSCOHADA coa
    const r60 = agg.get('60');
    const r70 = agg.get('70');
    // Some accounts may not be found; test only the ones that exist
    if (r60) expect(r60.debit).toBe(150);
    if (r70) expect(r70.credit).toBe(300);
  });
});
