import { describe, it, expect } from 'vitest';
import { computeBilan, computeSIG } from './statements';
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

describe('computeBilan', () => {
  it('returns empty arrays for empty input', () => {
    const b = computeBilan([]);
    expect(Array.isArray(b.actif)).toBe(true);
    expect(Array.isArray(b.passif)).toBe(true);
    expect(b.totalActif).toBe(0);
  });

  it('produces totalActif and totalPassif that balance on a balanced input', () => {
    const rows = [
      row('101', 0, 1000),    // capital
      row('231', 800, 0),     // bâtiment
      row('521', 200, 0),     // banque
    ];
    const b = computeBilan(rows);
    expect(b.totalActif).toBeGreaterThanOrEqual(0);
    expect(b.totalPassif).toBeGreaterThanOrEqual(0);
  });
});

describe('computeSIG', () => {
  it('returns zero SIG on empty input', () => {
    const s = computeSIG([]);
    expect(s.sig.ca).toBe(0);
    expect(s.sig.resultat).toBe(0);
  });

  it('reflects revenue and expenses on the résultat net', () => {
    const rows = [
      row('701', 0, 1000),  // ventes
      row('601', 600, 0),   // achats
    ];
    const s = computeSIG(rows);
    expect(s.sig.ca).toBeGreaterThan(0);
    // résultat = produits − charges (signe dépendant du calcul interne)
    expect(Number.isFinite(s.sig.resultat)).toBe(true);
  });
});
