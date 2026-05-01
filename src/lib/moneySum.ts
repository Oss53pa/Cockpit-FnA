/**
 * Helpers de migration progressive vers Money.
 *
 * Ces fonctions remplacent les patterns `array.reduce((s, x) => s + x.value, 0)`
 * dans les moteurs de calcul (statements, ratios, flows). Elles accumulent en
 * Money en interne (pas d'erreur d'arrondi), puis renvoient un `number` aux
 * frontières pour ne pas casser les API publiques existantes.
 *
 * Usage type :
 *   // Avant : let sum = 0; for (const r of rows) sum += r.solde;
 *   // Après : const sum = sumMoneyFromNumbers(rows.map(r => r.solde));
 */
import { Money, type Currency } from './Money';

/**
 * Somme déterministe d'un tableau de `number` via Money en interne.
 * Renvoie un `number` pour compatibilité ascendante des API.
 *
 * @param values  Liste de montants (en plus petite unité de la devise)
 * @param currency  Devise (défaut XOF)
 */
export function sumMoneyFromNumbers(values: number[], currency: Currency = 'XOF'): number {
  if (values.length === 0) return 0;
  let acc = Money.zero(currency);
  for (const v of values) {
    if (Number.isFinite(v)) {
      acc = acc.add(Money.from(v, currency));
    }
  }
  return acc.toNumber();
}

/**
 * Somme avec filtrage. Évite la double itération `filter().reduce()` sur les
 * gros datasets balance / GL.
 */
export function sumMoneyWhere<T>(
  items: T[],
  pick: (it: T) => number,
  filter?: (it: T) => boolean,
  currency: Currency = 'XOF',
): number {
  let acc = Money.zero(currency);
  for (const it of items) {
    if (filter && !filter(it)) continue;
    const v = pick(it);
    if (Number.isFinite(v)) acc = acc.add(Money.from(v, currency));
  }
  return acc.toNumber();
}

/**
 * Différence déterministe (a - b) via Money. Évite les pertes flottantes
 * sur des montants comme `1.10 - 1.00 = 0.09999999...`.
 */
export function diffMoney(a: number, b: number, currency: Currency = 'XOF'): number {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return NaN;
  return Money.from(a, currency).sub(Money.from(b, currency)).toNumber();
}

/**
 * Multiplication déterministe (montant × taux). Crucial pour TVA/marge.
 */
export function mulMoney(amount: number, factor: number, currency: Currency = 'XOF'): number {
  if (!Number.isFinite(amount) || !Number.isFinite(factor)) return NaN;
  return Money.from(amount, currency).mul(factor).toNumber();
}
