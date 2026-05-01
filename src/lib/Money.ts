/**
 * Money — classe monétaire déterministe pour calculs financiers.
 *
 * Stockage interne en `bigint` à la PLUS PETITE UNITÉ de la devise (cents pour
 * EUR/USD, satoshis pour BTC, unité pour XOF qui n'a pas de subdivision OHADA).
 * Aucun risque d'erreur d'arrondi flottant (0.1 + 0.2 ≠ 0.3 en `number`).
 *
 * Garde-fous :
 *   - Addition/soustraction/comparaison entre devises différentes → throw `CurrencyMismatchError`
 *   - Multiplication/division par un `number` non-fini → throw `MoneyError`
 *   - Toutes les opérations retournent une nouvelle instance (immutable)
 *
 * Arrondi par défaut : règle bancaire (round-half-to-even / banker's rounding).
 *
 * Référence : SYSCOHADA art. 38, IFRS 9, IAS 21.
 */

// ── Types & erreurs ──────────────────────────────────────────────────

export type Currency = 'XOF' | 'XAF' | 'EUR' | 'USD' | 'GHS' | 'NGN' | 'BTC';

/** Précision (nombre de décimales) par devise. */
const DECIMALS: Record<Currency, number> = {
  XOF: 0,  // Franc CFA UEMOA — pas de subdivision OHADA
  XAF: 0,  // Franc CFA CEMAC — idem
  EUR: 2,
  USD: 2,
  GHS: 2,
  NGN: 2,
  BTC: 8,
};

export type RoundingMode =
  | 'half-even'    // banker's rounding (défaut, IEEE 754 / IFRS)
  | 'half-up'      // 0.5 → 1
  | 'half-down'    // 0.5 → 0
  | 'down'         // toujours vers 0 (truncation)
  | 'up';          // toujours loin de 0 (ceiling abs)

export class CurrencyMismatchError extends Error {
  constructor(a: Currency, b: Currency) {
    super(`Operation entre devises différentes : ${a} vs ${b}`);
    this.name = 'CurrencyMismatchError';
  }
}

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoneyError';
  }
}

// ── Helpers internes ─────────────────────────────────────────────────

/** 10^n en bigint (n petit, donc sûr). */
function pow10(n: number): bigint {
  let r = 1n;
  for (let i = 0; i < n; i++) r *= 10n;
  return r;
}

/** Arrondit un nombre fractionnaire (en bigint × 10^extra) selon le mode demandé. */
function roundBigInt(value: bigint, divisor: bigint, mode: RoundingMode): bigint {
  if (divisor === 1n) return value;
  const sign = value < 0n ? -1n : 1n;
  const abs = value < 0n ? -value : value;
  const quotient = abs / divisor;
  const remainder = abs % divisor;
  if (remainder === 0n) return sign * quotient;

  const half = divisor / 2n;
  const isHalf = remainder * 2n === divisor;
  const isAboveHalf = remainder > half;

  let rounded: bigint;
  switch (mode) {
    case 'down':
      rounded = quotient;
      break;
    case 'up':
      rounded = quotient + 1n;
      break;
    case 'half-up':
      rounded = isHalf || isAboveHalf ? quotient + 1n : quotient;
      break;
    case 'half-down':
      rounded = isAboveHalf ? quotient + 1n : quotient;
      break;
    case 'half-even':
    default:
      if (isHalf) rounded = quotient % 2n === 0n ? quotient : quotient + 1n;
      else rounded = isAboveHalf ? quotient + 1n : quotient;
      break;
  }
  return sign * rounded;
}

// ── Money ────────────────────────────────────────────────────────────

/**
 * Montant monétaire immuable.
 *
 * @example
 *   const a = Money.from(100.50, 'EUR');
 *   const b = Money.from(50.25, 'EUR');
 *   const c = a.add(b);                  // 150.75 EUR
 *   const d = a.mul(0.18);               // 18.09 EUR (TVA 18%)
 *   const e = Money.from(100, 'XOF');
 *   a.add(e);                            // throw CurrencyMismatchError
 */
export class Money {
  /** Montant en plus petite unité (immutable). */
  readonly minorUnits: bigint;
  /** Devise (immutable). */
  readonly currency: Currency;

  private constructor(minorUnits: bigint, currency: Currency) {
    this.minorUnits = minorUnits;
    this.currency = currency;
  }

  // ── Constructeurs ─────────────────────────────────────────────────

  /** Crée un Money depuis un nombre décimal (ex: 123.45 EUR → 12345n centimes). */
  static from(amount: number, currency: Currency, mode: RoundingMode = 'half-even'): Money {
    if (!Number.isFinite(amount)) {
      throw new MoneyError(`Montant non-fini : ${amount}`);
    }
    const decimals = DECIMALS[currency];
    // Multiplication en string pour éviter les erreurs flottantes intermédiaires.
    // Ex: 0.1 * 100 = 10.000000000000002 en JS — on doit éviter.
    const factor = pow10(decimals);
    // On passe par une multiplication × 10^(decimals + 6) pour l'arrondi sur 6 chiffres
    // de précision intermédiaire, puis on arrondit selon `mode`.
    const PRECISION = 6;
    const scaled = BigInt(Math.round(amount * Number(pow10(decimals + PRECISION))));
    const rounded = roundBigInt(scaled, pow10(PRECISION), mode);
    return new Money(rounded * (factor / pow10(decimals)), currency);
  }

  /** Crée un Money à zéro pour une devise. */
  static zero(currency: Currency): Money {
    return new Money(0n, currency);
  }

  /** Crée un Money directement depuis les unités minor (avancé). */
  static fromMinorUnits(minorUnits: bigint, currency: Currency): Money {
    return new Money(minorUnits, currency);
  }

  /** Reconstruit un Money depuis sa forme JSON (toJSON). */
  static fromJSON(json: { v: string; c: Currency }): Money {
    return new Money(BigInt(json.v), json.c);
  }

  /** Somme une liste de Money (toutes même devise). */
  static sum(values: Money[], currency?: Currency): Money {
    if (values.length === 0) {
      if (!currency) throw new MoneyError('sum() sur tableau vide nécessite une devise');
      return Money.zero(currency);
    }
    return values.reduce((acc, v) => acc.add(v), Money.zero(values[0].currency));
  }

  // ── Opérations arithmétiques ──────────────────────────────────────

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.minorUnits + other.minorUnits, this.currency);
  }

  sub(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.minorUnits - other.minorUnits, this.currency);
  }

  /**
   * Multiplie par un scalaire (taux, coefficient). Le résultat est arrondi
   * à la précision de la devise selon `mode` (défaut : half-even).
   */
  mul(factor: number, mode: RoundingMode = 'half-even'): Money {
    if (!Number.isFinite(factor)) throw new MoneyError(`Facteur non-fini : ${factor}`);
    // Pour précision : on convertit le facteur en bigint × 10^9 (9 décimales de
    // précision intermédiaire) puis on multiplie, puis on arrondit.
    const PRECISION = 9;
    const factorBig = BigInt(Math.round(factor * Number(pow10(PRECISION))));
    const product = this.minorUnits * factorBig;
    const rounded = roundBigInt(product, pow10(PRECISION), mode);
    return new Money(rounded, this.currency);
  }

  /** Divise par un scalaire. Arrondi à la précision de la devise. */
  div(divisor: number, mode: RoundingMode = 'half-even'): Money {
    if (!Number.isFinite(divisor)) throw new MoneyError(`Diviseur non-fini : ${divisor}`);
    if (divisor === 0) throw new MoneyError('Division par zéro');
    return this.mul(1 / divisor, mode);
  }

  /** Négation (-a). */
  neg(): Money {
    return new Money(-this.minorUnits, this.currency);
  }

  /** Valeur absolue. */
  abs(): Money {
    return new Money(this.minorUnits < 0n ? -this.minorUnits : this.minorUnits, this.currency);
  }

  // ── Comparaisons ──────────────────────────────────────────────────

  eq(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.minorUnits === other.minorUnits;
  }

  ne(other: Money): boolean {
    return !this.eq(other);
  }

  gt(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.minorUnits > other.minorUnits;
  }

  gte(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.minorUnits >= other.minorUnits;
  }

  lt(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.minorUnits < other.minorUnits;
  }

  lte(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.minorUnits <= other.minorUnits;
  }

  isZero(): boolean { return this.minorUnits === 0n; }
  isPositive(): boolean { return this.minorUnits > 0n; }
  isNegative(): boolean { return this.minorUnits < 0n; }

  // ── Conversions ───────────────────────────────────────────────────

  /**
   * Convertit en `number` (avec PERTE de précision possible pour gros montants).
   * À utiliser UNIQUEMENT aux frontières (UI, exports). Les calculs internes
   * doivent rester en Money.
   */
  toNumber(): number {
    const decimals = DECIMALS[this.currency];
    if (decimals === 0) return Number(this.minorUnits);
    return Number(this.minorUnits) / Number(pow10(decimals));
  }

  /** Représentation textuelle (pour debug, pas pour affichage UI). */
  toString(): string {
    const decimals = DECIMALS[this.currency];
    if (decimals === 0) return `${this.minorUnits} ${this.currency}`;
    const factor = pow10(decimals);
    const sign = this.minorUnits < 0n ? '-' : '';
    const abs = this.minorUnits < 0n ? -this.minorUnits : this.minorUnits;
    const integer = abs / factor;
    const fraction = abs % factor;
    return `${sign}${integer}.${fraction.toString().padStart(decimals, '0')} ${this.currency}`;
  }

  /** Sérialisation JSON déterministe (string pour préserver bigint). */
  toJSON(): { v: string; c: Currency } {
    return { v: this.minorUnits.toString(), c: this.currency };
  }

  // ── Garde-fous ────────────────────────────────────────────────────

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new CurrencyMismatchError(this.currency, other.currency);
    }
  }
}

/**
 * Helper : convertit un tableau de `number` en `Money[]` (toutes même devise).
 * Utilisé pour migrer progressivement les anciens calculs vers Money.
 */
export function moneyArrayFromNumbers(values: number[], currency: Currency = 'XOF'): Money[] {
  return values.map((v) => Money.from(v, currency));
}

/**
 * Helper : convertit `Money[]` → `number[]` aux frontières (UI/exports/DB).
 */
export function numbersFromMoneyArray(values: Money[]): number[] {
  return values.map((m) => m.toNumber());
}
