/**
 * analyticBranch.ts — détection de la branche WBS d'une écriture GL.
 *
 * Le modèle WBS conditionnel (Option A) fait dépendre la sémantique des axes 2/3
 * de la nature de la ligne :
 *   - revenue       : ligne de produit (compte 70-75)
 *   - project_cost  : ligne de charge (compte 60-69) AVEC un projet renseigné
 *                     (axe 1 affecté ou le label/champ projet est non vide)
 *   - overhead      : ligne de charge (compte 60-69) SANS projet → frais généraux
 *
 * Les comptes hors classe 6/7 (capitaux, immo, stocks, tiers, trésorerie)
 * retournent `undefined` (non analytique au sens WBS).
 *
 * Note : la classe 8 (autres charges/produits HAO) n'est volontairement pas
 * branchée sur le WBS — ce sont des éléments hors exploitation qui ne suivent
 * pas la logique projet.
 */
import type { AnalyticBranch, GLEntry, AnalyticAssignment } from '../db/schema';

export interface InferBranchContext {
  /** Liste des assignations existantes pour cette écriture (cherche un code
   *  projet sur l'axe 1 → si présent, on est en project_cost). */
  assignments?: AnalyticAssignment[];
  /** Si l'écriture a un champ projet renseigné directement (analyticalSection). */
  hasProjectMarker?: boolean;
}

/**
 * Détermine la branche WBS d'une écriture GL.
 * @returns la branche, ou undefined si la ligne n'est pas analytique.
 */
export function inferBranch(
  entry: Pick<GLEntry, 'account' | 'analyticalSection' | 'analyticalAxis'>,
  ctx: InferBranchContext = {},
): AnalyticBranch | undefined {
  const acc = entry.account ?? '';

  // Classe 7 (produits) → Revenue
  if (acc.startsWith('7')) {
    // Exclure 79 (reprises sur amort/provisions) ? On les laisse en revenue par défaut.
    return 'revenue';
  }

  // Classe 6 (charges) → Project Cost ou Overhead selon présence projet
  if (acc.startsWith('6')) {
    const hasProject =
      ctx.hasProjectMarker ||
      !!entry.analyticalSection ||
      !!entry.analyticalAxis ||
      ctx.assignments?.some((a) => a.axisNumber === 1) ||
      false;
    return hasProject ? 'project_cost' : 'overhead';
  }

  // Classes 1/2/3/4/5/8 → pas de branche WBS
  return undefined;
}

/**
 * Vérifie qu'un code analytique est compatible avec une branche.
 * - Si le code n'a pas de branche définie → universel (compatible).
 * - Si la branche de la ligne est undefined (non analytique) → reject.
 * - Sinon → matching strict.
 */
export function isCodeCompatibleWithBranch(
  codeBranch: AnalyticBranch | undefined,
  lineBranch: AnalyticBranch | undefined,
): boolean {
  // Code universel : OK partout
  if (!codeBranch) return true;
  // Code typé mais ligne sans branche : refus (l'utilisateur tente d'affecter
  // un code "Centre de revenu" sur une ligne d'immo, par exemple).
  if (!lineBranch) return false;
  return codeBranch === lineBranch;
}

/**
 * Label humain de la branche (FR) pour l'UI.
 */
export const BRANCH_LABELS: Record<AnalyticBranch, string> = {
  revenue: 'Revenus',
  project_cost: 'Coûts projets',
  overhead: 'Frais généraux',
};

/**
 * Couleur sémantique par branche (compatible Tailwind classes existantes).
 */
export const BRANCH_COLORS: Record<AnalyticBranch, string> = {
  revenue: 'success',       // vert
  project_cost: 'accent',   // sage/clay (couleur d'accent)
  overhead: 'warning',      // ambre
};
