/**
 * useOrgPermissions — gating UI basé sur le rôle de l'utilisateur dans l'org courante.
 *
 * Le rôle vient de la table `fna_user_orgs.role` côté backend, exposé par
 * `SupabaseProvider.getOrganizations()` qui le JOIN à chaque org.
 *
 * Hiérarchie : admin > editor > viewer
 *   - admin   : tout (CRUD complet, gestion users, suppression société)
 *   - editor  : lecture + écriture des données métier (GL, budgets, comptes)
 *   - viewer  : lecture seule (dashboards, exports PDF, mais pas d'écriture)
 *
 * Utilisation :
 *   const { canEdit, canAdmin, role } = useOrgPermissions();
 *   <button disabled={!canEdit} title={!canEdit ? 'Lecture seule' : ''}>
 *     Importer GL
 *   </button>
 *
 * Rationale : sans gating, un viewer peut cliquer "Importer GL" → écrit
 * échoue à l'INSERT (RLS rejette) → mauvaise UX. Mieux : désactiver le
 * bouton dès le départ avec un tooltip clair.
 *
 * Mode démo : renvoie toujours `admin` (l'utilisateur peut tout faire dans
 * sa propre démo locale, aucune écriture cloud n'est tentée).
 */
import { useMemo } from 'react';
import { useApp } from '../store/app';
import { useOrganizations } from './useFinancials';

export type OrgRole = 'admin' | 'editor' | 'viewer';

export interface OrgPermissions {
  /** Rôle de l'user dans l'org courante (undefined si pas d'org) */
  role: OrgRole | undefined;
  /** Peut lire (toujours true si l'user a accès à l'org) */
  canRead: boolean;
  /** Peut créer/modifier les données métier (GL, budgets, comptes, alertes…) */
  canEdit: boolean;
  /** Peut administrer (gestion users, suppression société, paramètres système) */
  canAdmin: boolean;
  /** True si l'user est en lecture seule (utile pour afficher un bandeau) */
  isReadOnly: boolean;
  /** Label humain du rôle (FR) */
  roleLabel: string;
}

const ROLE_LABELS: Record<OrgRole, string> = {
  admin: 'Administrateur',
  editor: 'Éditeur',
  viewer: 'Lecture seule',
};

export function useOrgPermissions(): OrgPermissions {
  const currentOrgId = useApp((s) => s.currentOrgId);
  const orgs = useOrganizations();

  return useMemo(() => {
    // Mode démo : toujours admin (parcours guidé sans frottement)
    if (currentOrgId.startsWith('demo-org')) {
      return {
        role: 'admin',
        canRead: true,
        canEdit: true,
        canAdmin: true,
        isReadOnly: false,
        roleLabel: 'Démo',
      };
    }

    const org = orgs.find((o) => o.id === currentOrgId);
    const role = org?.role;

    // Pas de rôle déterminé : on présume viewer par sécurité (fail-safe).
    // Couvre le cas où getOrganizations a fallback sur le SELECT direct
    // (sans JOIN fna_user_orgs) — l'écriture sera de toute façon refusée par RLS.
    const effectiveRole: OrgRole = role ?? 'viewer';

    return {
      role,
      canRead: true,
      canEdit: effectiveRole === 'admin' || effectiveRole === 'editor',
      canAdmin: effectiveRole === 'admin',
      isReadOnly: effectiveRole === 'viewer',
      roleLabel: ROLE_LABELS[effectiveRole],
    };
  }, [currentOrgId, orgs]);
}
