// Mode d'affichage global : lu depuis localStorage. Pour garantir le re-render
// instantané quand l'utilisateur toggle Entier ↔ Abrégé, on dispatch un événement
// custom 'amount-mode-changed' depuis le store. Les composants peuvent s'abonner
// via useSyncExternalStore (voir useAmountMode plus bas).
function currentMode(): 'full' | 'short' {
  try {
    const v = localStorage.getItem('amount-mode');
    return v === 'short' ? 'short' : 'full';
  } catch { return 'full'; }
}

// Émetteur d'événement pour notifier les composants du changement de mode
const subscribers = new Set<() => void>();
export function notifyAmountModeChanged() {
  subscribers.forEach((cb) => cb());
}
function subscribe(cb: () => void) {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}
function getSnapshot(): 'full' | 'short' { return currentMode(); }

// Hook React : retourne le mode actuel et déclenche un re-render à chaque
// changement. Permet aux composants d'utiliser fmtK et compagnie de manière
// réactive sans avoir à s'abonner manuellement au store Zustand.
import { useSyncExternalStore } from 'react';
export function useAmountMode(): 'full' | 'short' {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

const frFull = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

/** Sentinelle "donnée non disponible" — affichée pour NaN/Infinity/null/undefined. */
const NA = '—';
const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
// Caractères de séparation inter-millier que Intl.NumberFormat peut utiliser :
// espace fine insécable (U+202F) et espace insécable (U+00A0). Remplacés par
// un espace classique pour que les exports CSV/PDF restent lisibles partout.
const NARROW_NBSP = String.fromCharCode(0x202F);
const NBSP = String.fromCharCode(0x00A0);

/** Valeur entière avec séparateur de milliers, sans devise. Jamais abrégée.
 *  (P2-7) Retourne "—" pour NaN/Infinity/null/undefined au lieu de "0" silencieux. */
export const fmtFull = (v: number | null | undefined): string => {
  if (!isFiniteNumber(v)) return NA;
  return frFull.format(v).split(NARROW_NBSP).join(' ').split(NBSP).join(' ');
};

/**
 * Format Budget — distingue 'pas de budget saisi' de 'budget réel à zéro'.
 *
 * Usage typique pour une table :
 *   const totBudget = rows.reduce((s, r) => s + r.budget, 0);
 *   const hasBudget = Math.abs(totBudget) > 0.01;
 *   <td>{fmtBudget(r.budget, hasBudget)}</td>
 *
 * Si `hasBudgetGlobal === false` → toujours "—" (pas de budget chargé)
 * Si `hasBudgetGlobal === true`  → affiche la valeur réelle (même si 0)
 * Si `hasBudgetGlobal === undefined` → "—" si valeur ≈ 0, sinon valeur
 */
export const fmtBudget = (v: number | null | undefined, hasBudgetGlobal?: boolean): string => {
  if (!isFiniteNumber(v)) return NA;
  if (hasBudgetGlobal === false) return NA;
  if (hasBudgetGlobal === undefined && Math.abs(v) < 0.01) return NA;
  return fmtFull(v);
};

/** Format Écart — '—' si pas de budget de référence (sinon l'écart n'a pas de sens). */
export const fmtEcart = (v: number | null | undefined, hasBudgetGlobal: boolean): string => {
  if (!isFiniteNumber(v)) return NA;
  if (!hasBudgetGlobal) return NA;
  return fmtFull(v);
};

/** Format Pourcentage écart — '—' si pas de budget. */
export const fmtEcartPct = (v: number | null | undefined, hasBudgetGlobal: boolean, digits = 1): string => {
  if (!isFiniteNumber(v)) return NA;
  if (!hasBudgetGlobal) return NA;
  const sign = v >= 0 ? '+' : '';
  return `${sign}${v.toFixed(digits).replace('.', ',')} %`;
};

/** Abrégée K/M/Md (utilisable dans les axes/tooltips compacts). Jamais en entier.
 *  (P2-7) Retourne "—" pour NaN/Infinity. */
export const fmtShort = (v: number | null | undefined): string => {
  if (!isFiniteNumber(v)) return NA;
  const abs = Math.abs(v);
  if (abs >= 1_000_000_000) return (v / 1_000_000_000).toFixed(1).replace('.0', '') + ' Md';
  if (abs >= 1_000_000)    return (v / 1_000_000).toFixed(1).replace('.0', '') + ' M';
  if (abs >= 1_000)        return (v / 1_000).toFixed(0) + ' k';
  return String(Math.round(v));
};

/**
 * Format monétaire — respecte le mode d'affichage global (localStorage
 * « amount-mode »). En mode 'full' affiche toujours l'entier complet.
 * (P2-7) Retourne "— XOF" pour les valeurs invalides.
 * (P1-8) Centralisé : tous les exports PDF/Excel doivent passer par cette fonction.
 */
export const fmtMoney = (v: number | null | undefined, currency = 'XOF'): string => {
  if (!isFiniteNumber(v)) return `${NA} ${currency}`;
  const body = currentMode() === 'full' ? fmtFull(v) : fmtShort(v);
  return `${body} ${currency}`;
};

/** Pourcentage cohérent : signe explicite (+/−), virgule décimale fr-FR.
 *  (P2-8) Centralisé pour éviter les divergences PDF/écran. */
export const fmtPct = (v: number | null | undefined, digits = 1): string => {
  if (!isFiniteNumber(v)) return NA;
  const sign = v >= 0 ? '+' : '';
  return `${sign}${v.toFixed(digits).replace('.', ',')} %`;
};

/** Ratio (sans unité, ex: 1,5×). Retourne "—" si non-fini. */
export const fmtRatio = (v: number | null | undefined, digits = 2): string => {
  if (!isFiniteNumber(v)) return NA;
  return v.toFixed(digits).replace('.', ',');
};

/**
 * Format compact K/M/Md historiquement utilisé dans Dashboard (KPI cards,
 * axes de charts). Respecte désormais le mode global : en mode 'full' il
 * délègue à fmtFull pour afficher l'entier, sinon garde le format abrégé.
 */
export const fmtK = (v: number | null | undefined): string =>
  currentMode() === 'full' ? fmtFull(v) : fmtShort(v);
