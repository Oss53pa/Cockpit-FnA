/**
 * Abstraction du plan comptable.
 *
 * L'application utilise SYSCOHADA par défaut (Afrique de l'Ouest), mais certaines
 * opérations (rapprochement tiers, agrégation par classe) dépendent du système :
 *
 * - SYSCOHADA : classe = 1er chiffre, racine de classe = 2 premiers chiffres,
 *               comptes parents = 3 chiffres (401, 411…), sous-comptes = 4+ chiffres.
 * - PCG_FR    : classe = 1er chiffre, racine = 3 premiers chiffres,
 *               comptes parents = 3 chiffres (401, 411…), sous-comptes = 4+ chiffres.
 *               Très proche du SYSCOHADA (racine plus longue).
 * - IFRS / US_GAAP : pas de plan unique, classification par nature (asset/liability/...).
 *
 * Le classifier est utilisé par :
 *   - importer.ts (rapprochement tiers ↔ GL)
 *   - balance.ts / analytics.ts (détection comptes parents)
 *
 * L'org choisit son système via `Organization.accountingSystem` (à étendre :
 * aujourd'hui seul 'Normal' / 'Allégé' / 'SMT' qui sont des MODES SYSCOHADA).
 * En attendant l'extension du modèle, on retourne toujours SYSCOHADA — l'abstraction
 * est en place pour basculer plus tard sans toucher au code appelant.
 */

export type CoaSystem = 'SYSCOHADA' | 'PCG_FR' | 'IFRS' | 'US_GAAP';

export interface AccountClassifier {
  /** Identifiant du système comptable. */
  readonly system: CoaSystem;
  /**
   * Racine de "classe" utilisée pour le matching tiers et l'agrégation.
   * Ex : SYSCOHADA "401001" → "40", PCG_FR "401001" → "401".
   * Pour les comptes courts (déjà < à la longueur de racine), retourne tel quel.
   */
  classRoot(account: string): string;
  /**
   * `true` si le compte est un parent collectif (sans détail individuel).
   * Ex : SYSCOHADA "401" est parent, "401001" ne l'est pas.
   * Note : cette définition est statique. Pour une détection contextuelle (parent
   * dans un dataset donné), voir balance.ts qui regarde si des sous-comptes existent
   * effectivement dans le GL.
   */
  isParentAccount(account: string): boolean;
  /**
   * Classe haut niveau (1 chiffre en SYSCOHADA et PCG_FR).
   * Ex : "411100" → "4".
   */
  topClass(account: string): string;
}

export const SYSCOHADA_CLASSIFIER: AccountClassifier = {
  system: 'SYSCOHADA',
  classRoot: (a) => (a && a.length >= 2 ? a.substring(0, 2) : a || ''),
  isParentAccount: (a) => !!a && a.length <= 3,
  topClass: (a) => (a && a.length >= 1 ? a.charAt(0) : ''),
};

export const PCG_FR_CLASSIFIER: AccountClassifier = {
  system: 'PCG_FR',
  classRoot: (a) => (a && a.length >= 3 ? a.substring(0, 3) : a || ''),
  isParentAccount: (a) => !!a && a.length <= 3,
  topClass: (a) => (a && a.length >= 1 ? a.charAt(0) : ''),
};

// IFRS / US_GAAP : on garde une classif "neutre" qui ne match que sur account exact.
// L'agrégation par classe n'a pas de sens hors plan comptable normalisé.
export const NEUTRAL_CLASSIFIER: AccountClassifier = {
  system: 'IFRS',
  classRoot: (a) => a || '',
  isParentAccount: () => false,
  topClass: () => '',
};

/**
 * Récupère le classifier adapté à un système. Défaut SYSCOHADA pour rétro-compat.
 */
export function getClassifier(system?: CoaSystem | string): AccountClassifier {
  switch (system) {
    case 'PCG_FR': return PCG_FR_CLASSIFIER;
    case 'IFRS':
    case 'US_GAAP': return NEUTRAL_CLASSIFIER;
    case 'SYSCOHADA':
    default: return SYSCOHADA_CLASSIFIER;
  }
}
