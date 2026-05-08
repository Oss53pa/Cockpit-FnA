/**
 * useOrgResolver — résout automatiquement le `currentOrgId` au login.
 *
 * Avant : `currentOrgId` était hardcodé à `'sa-001'` au démarrage.
 * Maintenant :
 *   - Au login, on charge la liste des orgs de l'utilisateur (via
 *     `useOrganizations` qui JOIN fna_user_orgs côté backend).
 *   - Si `currentOrgId` est vide OU pointe vers une org à laquelle
 *     l'user n'a plus accès → on prend la 1re org disponible.
 *   - Si l'user n'a aucune org → `currentOrgId` reste vide ; le
 *     `OnboardingModal` se déclenche pour créer la 1ère société.
 *
 * À monter une fois au niveau de l'AppLayout (cf. App.tsx).
 */
import { useEffect } from 'react';
import { useApp } from '../store/app';
import { useOrganizations } from './useFinancials';

export function useOrgResolver(): void {
  const currentOrgId = useApp((s) => s.currentOrgId);
  const setCurrentOrg = useApp((s) => s.setCurrentOrg);
  const orgs = useOrganizations();

  useEffect(() => {
    if (orgs.length === 0) return;

    // Préserve une org demo-* (mode démo) sans l'override
    if (currentOrgId && currentOrgId.startsWith('demo-org')) return;

    // Si la sélection courante est invalide ou vide, prendre la 1re org dispo
    const exists = !!currentOrgId && orgs.some((o) => o.id === currentOrgId);
    if (!exists) {
      setCurrentOrg(orgs[0].id);
    }
  }, [orgs, currentOrgId, setCurrentOrg]);
}
