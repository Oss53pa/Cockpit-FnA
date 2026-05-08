/**
 * useOrgResolver — résout dynamiquement le `currentOrgId` et écoute les
 * changements de `fna_user_orgs` en temps réel (invitations, expulsions).
 *
 * Comportement :
 *   - Au login, charge la liste des orgs de l'user (via `useOrganizations`
 *     qui JOIN `fna_user_orgs` côté SupabaseProvider).
 *   - Si `currentOrgId` est vide OU pointe vers une org inaccessible →
 *     bascule sur la 1re org dispo.
 *   - Si l'user n'a aucune org → `currentOrgId` reste vide ;
 *     `OnboardingModal` se déclenche.
 *   - Realtime : abonnement Supabase sur les INSERT/UPDATE/DELETE de
 *     `fna_user_orgs` filtré par `user_id` → invalide automatiquement
 *     `useOrganizations` quand une nouvelle invitation arrive ou que
 *     l'user est retiré d'une org.
 *
 * À monter une fois au niveau de l'AppLayout (cf. App.tsx).
 */
import { useEffect } from 'react';
import { useApp } from '../store/app';
import { useOrganizations } from './useFinancials';
import { invalidateCloudData } from './useCloudData';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

export function useOrgResolver(): void {
  const currentOrgId = useApp((s) => s.currentOrgId);
  const setCurrentOrg = useApp((s) => s.setCurrentOrg);
  const orgs = useOrganizations();

  // ── 1) Auto-sélection de la 1re org disponible ──────────────────────
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

  // ── 2) Realtime sur fna_user_orgs (invitations) ──────────────────────
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    (async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const userId = sessionData?.session?.user?.id;
        if (!userId || cancelled) return;

        channel = supabase
          .channel(`user-orgs-${userId}`)
          .on(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            'postgres_changes' as any,
            {
              event: '*',
              schema: 'public',
              table: 'fna_user_orgs',
              filter: `user_id=eq.${userId}`,
            },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (payload: any) => {
              console.info('[useOrgResolver] fna_user_orgs change:', payload.eventType);
              // Refresh la liste des orgs de l'user
              invalidateCloudData('organizations');
            },
          )
          .subscribe();
      } catch (e) {
        console.warn('[useOrgResolver] realtime subscription failed:', e);
      }
    })();

    return () => {
      cancelled = true;
      if (channel) {
        supabase.removeChannel(channel).catch(() => { /* ignore */ });
      }
    };
  }, []);
}
