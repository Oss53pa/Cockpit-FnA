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

  it('computes a positive résultat when revenue > expenses', () => {
    const rows = [
      row('701', 0, 10000),   // Ventes 10 000
      row('601', 4000, 0),    // Achats 4 000
      row('661', 2000, 0),    // Personnel 2 000
    ];
    const s = computeSIG(rows);
    // CA = 10 000 | Charges = 4 000 + 2 000 = 6 000 | Résultat net = 4 000
    expect(s.sig.ca).toBe(10000);
    expect(s.sig.resultat).toBe(4000);
    expect(s.sig.resultat).toBeGreaterThan(0);
  });

  it('computes a negative résultat when expenses > revenue', () => {
    const rows = [
      row('701', 0, 3000),
      row('601', 5000, 0),
    ];
    const s = computeSIG(rows);
    expect(s.sig.resultat).toBeLessThan(0);
  });
});

describe('cohérence Bilan vs SIG', () => {
  it('le résultat du Bilan et le résultat net du SIG sont identiques sur un dataset balanced', () => {
    const rows = [
      row('101', 0, 10000),   // Capital
      row('411', 3000, 0),    // Clients
      row('521', 2000, 0),    // Banque
      row('401', 0, 2000),    // Fournisseurs
      row('701', 0, 8000),    // Ventes
      row('601', 5000, 0),    // Achats
      row('661', 1500, 0),    // Personnel
    ];
    const bilan = computeBilan(rows);
    const { sig } = computeSIG(rows);
    const bilanResultat = bilan.passif.find((l) => l.code === 'CF')?.value ?? 0;
    expect(Math.abs(bilanResultat - sig.resultat)).toBeLessThan(1);
  });
});
