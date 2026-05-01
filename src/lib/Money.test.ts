import { describe, it, expect } from 'vitest';
import { Money, CurrencyMismatchError, MoneyError } from './Money';

describe('Money — construction', () => {
  it('crée un montant XOF entier', () => {
    const m = Money.from(1000, 'XOF');
    expect(m.toNumber()).toBe(1000);
    expect(m.currency).toBe('XOF');
  });

  it('crée un montant EUR avec décimales', () => {
    const m = Money.from(123.45, 'EUR');
    expect(m.toNumber()).toBe(123.45);
    expect(m.minorUnits).toBe(12345n);
  });

  it('Money.zero retourne 0', () => {
    expect(Money.zero('XOF').toNumber()).toBe(0);
    expect(Money.zero('EUR').isZero()).toBe(true);
  });

  it('Money.fromMinorUnits avancé', () => {
    const m = Money.fromMinorUnits(99999n, 'EUR');
    expect(m.toNumber()).toBe(999.99);
  });

  it('throw sur montant non-fini', () => {
    expect(() => Money.from(NaN, 'EUR')).toThrow(MoneyError);
    expect(() => Money.from(Infinity, 'EUR')).toThrow(MoneyError);
  });
});

describe('Money — addition / soustraction', () => {
  it('addition associative — pas d\'erreur d\'arrondi 0.1 + 0.2', () => {
    const a = Money.from(0.1, 'EUR');
    const b = Money.from(0.2, 'EUR');
    const c = a.add(b);
    expect(c.toNumber()).toBe(0.3);
    expect(c.minorUnits).toBe(30n);
  });

  it('addition associative : (a+b)+c == a+(b+c)', () => {
    const a = Money.from(1.10, 'EUR');
    const b = Money.from(2.20, 'EUR');
    const c = Money.from(3.30, 'EUR');
    expect(a.add(b).add(c).eq(a.add(b.add(c)))).toBe(true);
  });

  it('soustraction simple', () => {
    const a = Money.from(100, 'XOF');
    const b = Money.from(30, 'XOF');
    expect(a.sub(b).toNumber()).toBe(70);
  });

  it('addition de devises différentes throw', () => {
    const a = Money.from(100, 'EUR');
    const b = Money.from(100, 'XOF');
    expect(() => a.add(b)).toThrow(CurrencyMismatchError);
  });

  it('Money.sum somme un tableau', () => {
    const arr = [Money.from(10, 'EUR'), Money.from(20, 'EUR'), Money.from(30, 'EUR')];
    expect(Money.sum(arr).toNumber()).toBe(60);
  });

  it('Money.sum tableau vide nécessite devise', () => {
    expect(() => Money.sum([])).toThrow(MoneyError);
    expect(Money.sum([], 'EUR').isZero()).toBe(true);
  });
});

describe('Money — multiplication / division', () => {
  it('multiplication par scalaire', () => {
    const m = Money.from(100, 'EUR');
    expect(m.mul(2).toNumber()).toBe(200);
    expect(m.mul(0.18).toNumber()).toBe(18);
  });

  it('division par scalaire', () => {
    const m = Money.from(100, 'EUR');
    expect(m.div(4).toNumber()).toBe(25);
    expect(m.div(3).toNumber()).toBe(33.33);
  });

  it('division par 0 throw', () => {
    const m = Money.from(100, 'EUR');
    expect(() => m.div(0)).toThrow(MoneyError);
  });

  it('TVA 18% sur 1000 XOF (sans subdivision)', () => {
    const ht = Money.from(1000, 'XOF');
    const tva = ht.mul(0.18);
    expect(tva.toNumber()).toBe(180);
  });

  it('TVA 19.25% sur 100 EUR (Cameroun)', () => {
    const ht = Money.from(100, 'EUR');
    const tva = ht.mul(0.1925);
    expect(tva.toNumber()).toBe(19.25);
  });
});

describe('Money — arrondi bancaire (half-even)', () => {
  it('arrondit 0.5 → 0 (le pair le plus proche)', () => {
    const m = Money.fromMinorUnits(1n, 'EUR'); // 0.01 EUR = 1 cent
    // Mul par 0.5 → 0.5 cent → arrondi half-even vers 0 (pair)
    expect(m.mul(0.5).minorUnits).toBe(0n);
  });

  it('arrondit 1.5 → 2 (le pair le plus proche)', () => {
    const m = Money.fromMinorUnits(3n, 'EUR'); // 0.03 EUR
    // Mul par 0.5 → 1.5 cent → arrondi half-even vers 2 (pair)
    expect(m.mul(0.5).minorUnits).toBe(2n);
  });

  it('mode half-up : 0.5 → 1', () => {
    const m = Money.fromMinorUnits(1n, 'EUR');
    expect(m.mul(0.5, 'half-up').minorUnits).toBe(1n);
  });

  it('mode down (truncation) : 0.99 → 0', () => {
    const m = Money.fromMinorUnits(1n, 'EUR');
    expect(m.mul(0.99, 'down').minorUnits).toBe(0n);
  });

  it('mode up (ceiling) : 0.01 → 1 cent', () => {
    const m = Money.fromMinorUnits(1n, 'EUR');
    expect(m.mul(0.01, 'up').minorUnits).toBe(1n);
  });
});

describe('Money — comparaisons', () => {
  it('eq / ne', () => {
    const a = Money.from(100, 'EUR');
    const b = Money.from(100, 'EUR');
    const c = Money.from(101, 'EUR');
    expect(a.eq(b)).toBe(true);
    expect(a.ne(c)).toBe(true);
  });

  it('gt / gte / lt / lte', () => {
    const a = Money.from(100, 'EUR');
    const b = Money.from(50, 'EUR');
    expect(a.gt(b)).toBe(true);
    expect(a.gte(b)).toBe(true);
    expect(b.lt(a)).toBe(true);
    expect(b.lte(a)).toBe(true);
    expect(a.gte(a)).toBe(true);
    expect(a.lte(a)).toBe(true);
  });

  it('comparaison de devises différentes throw', () => {
    const a = Money.from(100, 'EUR');
    const b = Money.from(100, 'XOF');
    expect(() => a.eq(b)).toThrow(CurrencyMismatchError);
    expect(() => a.gt(b)).toThrow(CurrencyMismatchError);
  });

  it('isZero / isPositive / isNegative', () => {
    expect(Money.zero('EUR').isZero()).toBe(true);
    expect(Money.from(1, 'EUR').isPositive()).toBe(true);
    expect(Money.from(-1, 'EUR').isNegative()).toBe(true);
  });
});

describe('Money — neg / abs', () => {
  it('neg inverse le signe', () => {
    const m = Money.from(100, 'EUR');
    expect(m.neg().toNumber()).toBe(-100);
    expect(m.neg().neg().toNumber()).toBe(100);
  });

  it('abs valeur absolue', () => {
    expect(Money.from(-100, 'EUR').abs().toNumber()).toBe(100);
    expect(Money.from(100, 'EUR').abs().toNumber()).toBe(100);
  });
});

describe('Money — sérialisation', () => {
  it('toJSON / fromJSON round-trip', () => {
    const a = Money.from(123456.78, 'EUR');
    const json = a.toJSON();
    expect(json).toEqual({ v: '12345678', c: 'EUR' });
    const b = Money.fromJSON(json);
    expect(b.eq(a)).toBe(true);
  });

  it('toString format lisible', () => {
    expect(Money.from(1234.56, 'EUR').toString()).toBe('1234.56 EUR');
    expect(Money.from(1000, 'XOF').toString()).toBe('1000 XOF');
    expect(Money.from(-12.50, 'EUR').toString()).toBe('-12.50 EUR');
  });

  it('JSON.stringify utilise toJSON', () => {
    const a = Money.from(100, 'EUR');
    const s = JSON.stringify({ amount: a });
    expect(s).toBe('{"amount":{"v":"10000","c":"EUR"}}');
  });
});

describe('Money — cas réels comptables', () => {
  it('cumul de 1000 lignes de 0.01 EUR = 10 EUR', () => {
    let total = Money.zero('EUR');
    for (let i = 0; i < 1000; i++) total = total.add(Money.from(0.01, 'EUR'));
    expect(total.toNumber()).toBe(10);
  });

  it('CA - charges = résultat (montants XOF)', () => {
    const ca = Money.from(166_990_000, 'XOF');
    const charges = Money.from(105_140_000, 'XOF');
    const resultat = ca.sub(charges);
    expect(resultat.toNumber()).toBe(61_850_000);
  });

  it('marge nette en % (résultat / CA)', () => {
    const ca = Money.from(166_990_000, 'XOF');
    const rn = Money.from(105_140_000, 'XOF');
    const margeNette = (rn.toNumber() / ca.toNumber()) * 100;
    expect(margeNette).toBeCloseTo(62.96, 2);
  });

  it('TVA collectée 18% sur CA HT = montant TTC', () => {
    const ht = Money.from(1_000_000, 'XOF');
    const tva = ht.mul(0.18);
    const ttc = ht.add(tva);
    expect(ttc.toNumber()).toBe(1_180_000);
  });
});
