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

/** Valeur entière avec séparateur de milliers, sans devise. Jamais abrégée. */
export const fmtFull = (v: number) =>
  frFull.format(v ?? 0).replace(/\u202F/g, ' ').replace(/\u00A0/g, ' ');

/** Abrégée K/M/Md (utilisable dans les axes/tooltips compacts). Jamais en entier. */
export const fmtShort = (v: number) => {
  const abs = Math.abs(v ?? 0);
  if (abs >= 1_000_000_000) return (v / 1_000_000_000).toFixed(1).replace('.0', '') + ' Md';
  if (abs >= 1_000_000)    return (v / 1_000_000).toFixed(1).replace('.0', '') + ' M';
  if (abs >= 1_000)        return (v / 1_000).toFixed(0) + ' k';
  return String(Math.round(v ?? 0));
};

/**
 * Format monétaire — respecte le mode d'affichage global (localStorage
 * « amount-mode »). En mode 'full' affiche toujours l'entier complet.
 */
export const fmtMoney = (v: number, currency = 'XOF') => {
  const body = currentMode() === 'full' ? fmtFull(v) : fmtShort(v);
  return `${body} ${currency}`;
};

export const fmtPct = (v: number, digits = 1) =>
  `${v >= 0 ? '+' : ''}${(v ?? 0).toFixed(digits)} %`;

export const fmtRatio = (v: number, digits = 2) => (v ?? 0).toFixed(digits);

/**
 * Format compact K/M/Md historiquement utilisé dans Dashboard (KPI cards,
 * axes de charts). Respecte désormais le mode global : en mode 'full' il
 * délègue à fmtFull pour afficher l'entier, sinon garde le format abrégé.
 */
export const fmtK = (v: number) => currentMode() === 'full' ? fmtFull(v) : fmtShort(v);
