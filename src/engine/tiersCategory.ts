// Catégorisation SYSCOHADA des comptes de tiers (classe 4) — source unique
// partagée par l'import GL Tiers (pour stocker la catégorie) et l'UI (filtre
// par nature dans la table GL Tiers + la balance auxiliaire).
import type { TiersCategory } from '../db/schema';

export type { TiersCategory };

export const TIERS_CATEGORIES: { key: TiersCategory; label: string; accountRanges: string }[] = [
  { key: 'client', label: 'Clients', accountRanges: '41' },
  { key: 'fournisseur', label: 'Fournisseurs', accountRanges: '40' },
  { key: 'personnel', label: 'Personnel', accountRanges: '42' },
  { key: 'etat', label: 'État & Organismes', accountRanges: '43-44' },
  { key: 'autres', label: 'Autres tiers', accountRanges: '45-48' },
];

/** Dérive la catégorie de tiers à partir du compte collectif. */
export function categorizeTiersAccount(account: string): TiersCategory {
  const a = account || '';
  if (a.startsWith('41')) return 'client';
  if (a.startsWith('40')) return 'fournisseur';
  if (a.startsWith('42')) return 'personnel';
  if (a.startsWith('43') || a.startsWith('44')) return 'etat';
  return 'autres';
}

export function tiersCategoryLabel(cat: TiersCategory): string {
  return TIERS_CATEGORIES.find((c) => c.key === cat)?.label ?? cat;
}
