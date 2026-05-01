# Guide Money — calculs monétaires déterministes

## Pourquoi `Money` ?

JavaScript `number` (IEEE 754 double-precision) **ne peut pas représenter exactement**
de nombreuses valeurs décimales :

```js
0.1 + 0.2          // 0.30000000000000004 (PAS 0.3)
1.10 - 1.00        // 0.09999999999999987
0.07 * 100         // 7.000000000000001
```

Sur des cumuls comptables (1M+ écritures), ces erreurs s'**accumulent** et
peuvent causer des écarts visibles entre :
- Le débit et le crédit d'une balance (pourtant équilibrée)
- Le résultat affiché et la somme des composants
- Les exports PDF et Excel

`Money` stocke les montants en **`bigint` à la plus petite unité** de la devise
(centimes EUR/USD, unités XOF/XAF, satoshis BTC). Pas d'erreur d'arrondi.

---

## API

### Construction

```ts
import { Money } from '@/lib/Money';

Money.from(123.45, 'EUR');       // depuis number décimal
Money.from(1000, 'XOF');         // XOF n'a pas de subdivision OHADA
Money.zero('EUR');               // = Money.from(0, 'EUR')
Money.fromMinorUnits(12345n, 'EUR');  // 123.45 EUR (avancé)
Money.sum([m1, m2, m3]);         // somme déterministe
```

### Arithmétique (immutable, retourne un nouveau Money)

```ts
const a = Money.from(100, 'EUR');
const b = Money.from(50, 'EUR');

a.add(b);             // 150 EUR
a.sub(b);             // 50 EUR
a.mul(0.18);          // 18 EUR (TVA 18%)
a.div(4);             // 25 EUR
a.neg();              // -100 EUR
a.abs();              // 100 EUR
```

### Comparaisons

```ts
a.eq(b)        // équivaut === (mais throw si devises différentes)
a.gt(b)        // > strict
a.gte(b)       // >=
a.lt(b)        // <
a.lte(b)       // <=
a.isZero()     // == 0
a.isPositive() // > 0
a.isNegative() // < 0
```

### Conversions (frontières uniquement)

```ts
a.toNumber()         // → number (perte de précision possible si gros montant)
a.toString()         // → "100.00 EUR" (debug)
a.toJSON()           // → { v: '10000', c: 'EUR' } (sérialisation déterministe)
Money.fromJSON(j)    // round-trip
```

---

## Quand utiliser `Money` ?

| Situation | Recommandation |
|-----------|----------------|
| **Calculs comptables critiques** (bilan, CR, SIG, TFT, ratios) | ✅ Money |
| Cumul d'écritures avec décimales | ✅ Money |
| TVA / marges (multiplications par taux) | ✅ Money |
| Multi-devises (XOF + EUR + USD) | ✅ Money (CurrencyMismatchError protège) |
| **Affichage UI** | ❌ `number` (passer par `formatMoney(m.toNumber())`) |
| Exports PDF/Excel | ❌ `number` (passer `m.toNumber()` à fmtFull) |
| Stockage Dexie/Supabase | ❌ `number` (les `BigInt` ne sont pas sérialisables JSON par défaut) |

---

## Migration progressive — pattern recommandé

### Avant (impur)

```ts
function computeCharges(rows: BalanceRow[]): number {
  return rows
    .filter((r) => r.account.startsWith('6'))
    .reduce((s, r) => s + r.solde, 0);
}
```

### Après (déterministe — préserve l'API publique)

```ts
import { sumMoneyWhere } from '@/lib/moneySum';

function computeCharges(rows: BalanceRow[]): number {
  return sumMoneyWhere(
    rows,
    (r) => r.solde,
    (r) => r.account.startsWith('6'),
    'XOF',
  );
}
```

### Idéal (full Money — quand toutes les API sont migrées)

```ts
function computeCharges(rows: BalanceRow[]): Money {
  return Money.sum(
    rows
      .filter((r) => r.account.startsWith('6'))
      .map((r) => Money.from(r.solde, 'XOF')),
    'XOF',
  );
}
```

---

## Helpers de migration (`src/lib/moneySum.ts`)

- **`sumMoneyFromNumbers(values, currency)`** — somme un `number[]` via Money en interne
- **`sumMoneyWhere(items, pick, filter, currency)`** — somme avec filtre (évite double itération)
- **`diffMoney(a, b, currency)`** — soustraction déterministe
- **`mulMoney(amount, factor, currency)`** — multiplication par taux (TVA, marge)

Tous renvoient `number` pour compatibilité ascendante.

---

## Modes d'arrondi (deuxième argument de `mul`/`div`)

| Mode | Comportement | Cas d'usage |
|------|--------------|-------------|
| `half-even` *(défaut)* | 0.5 → pair le plus proche (banker's) | IFRS, IEEE 754, comptabilité standard |
| `half-up` | 0.5 → loin de 0 | Habitudes commerciales |
| `half-down` | 0.5 → vers 0 | Rare |
| `down` | troncature vers 0 | Estimation conservatrice |
| `up` | ceiling absolu | Estimation prudente |

```ts
Money.from(0.05, 'EUR').mul(0.5);                  // 0.02 (half-even)
Money.from(0.05, 'EUR').mul(0.5, 'half-up');       // 0.03
Money.from(0.05, 'EUR').mul(0.5, 'down');          // 0.02
```

---

## Erreurs

```ts
import { CurrencyMismatchError, MoneyError } from '@/lib/Money';

try {
  Money.from(100, 'EUR').add(Money.from(100, 'XOF'));
} catch (e) {
  if (e instanceof CurrencyMismatchError) {
    // Gestion devise différente
  }
}

Money.from(NaN, 'EUR');         // throw MoneyError("Montant non-fini")
Money.from(100, 'EUR').div(0);  // throw MoneyError("Division par zéro")
```

---

## Tests

37 tests Vitest (`Money.test.ts` + `Money.bench.test.ts`) couvrent :
- Construction (5)
- Add/sub/devise (6)
- Mul/div/TVA (5)
- Arrondi (5)
- Comparaisons (4)
- Neg/abs (2)
- Sérialisation (3)
- Cas comptables réels (4)
- Performance & précision (3)

Lancer : `npm test src/lib/Money`
