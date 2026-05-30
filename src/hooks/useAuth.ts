/* eslint-disable @typescript-eslint/no-explicit-any -- interop dynamique (parsers, payloads Supabase/Edge Functions, helpers Recharts). À typer finement au cas par cas. */
import { useEffect, useState, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { safeLocalStorage } from '../lib/safeStorage';
import { pullFromSupabase, autoRecoverDexieToSupabase } from '../db/supabaseSync';
import type { User, Session } from '@supabase/supabase-js';

// Helper: les tables fna_* ne sont pas typees dans Database — bypass le typing
const fromAny = (table: string) => (supabase as any).from(table);

/**
 * Synchronise l'utilisateur Supabase Auth vers sessionStorage.
 * Cle 'cockpit-current-user' utilisee par Chat, Sidebar, auditLog,
 * ActivitySidebar pour identifier l'auteur des messages/comments/audits.
 *
 * Bug en prod : sans ce helper, le user est connecte cote Supabase mais
 * l'app affiche "Vous" / "system" partout car sessionStorage reste vide.
 */
function syncCurrentUserToStorage(user: User) {
  // Recupere le nom depuis user_metadata (defini lors du signup ou par invitation)
  // Fallback en cascade : full_name -> name -> first_name -> email avant @
  const meta = (user.user_metadata ?? {}) as Record<string, any>;
  const name = meta.full_name
    ?? meta.name
    ?? (meta.first_name && meta.last_name ? `${meta.first_name} ${meta.last_name}` : meta.first_name)
    ?? user.email?.split('@')[0]
    ?? 'Utilisateur';

  // Tente aussi de retrouver le user dans la liste locale (Settings → Utilisateurs)
  // pour récupérer le rôle et l'orgIds
  let role = 'viewer';
  let orgIds: string[] = [];
  try {
    const localUsers = JSON.parse(safeLocalStorage.getItem('cockpit-users') ?? '[]');
    const localMatch = localUsers.find((u: any) => u.email?.toLowerCase() === user.email?.toLowerCase());
    if (localMatch) {
      role = localMatch.role ?? role;
      orgIds = localMatch.orgIds ?? [];
    }
  } catch { /* ignore */ }

  const payload = {
    id: user.id,
    name,
    email: user.email ?? '',
    role,
    orgIds,
    avatar: meta.avatar_url ?? meta.picture ?? null,
  };
  sessionStorage.setItem('cockpit-current-user', JSON.stringify(payload));
  // Notifie les composants à l'écoute (Header, ActivitySidebar, Sidebar)
  // pour qu'ils se rafraîchissent immédiatement
  try {
    window.dispatchEvent(new CustomEvent('cockpit-auth-changed', { detail: payload }));
  } catch { /* ignore */ }
}

export type UserRole = 'admin' | 'editor' | 'viewer';

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  syncing: boolean;
  syncStatus: string;
  role: UserRole;
  orgIds: string[];
}

/**
 * Hook d'authentification.
 * En mode local (pas de Supabase), retourne un utilisateur fictif avec rôle admin.
 */
export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    loading: true,
    syncing: false,
    syncStatus: '',
    role: 'admin',
    orgIds: [],
  });

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setState({ user: null, session: null, loading: false, syncing: false, syncStatus: '', role: 'admin', orgIds: [] });
      return;
    }

    // Récupère la session active. CRITIQUE : .catch() obligatoire pour ne pas
    // figer l'état loading=true si le réseau est KO au démarrage (écran blanc).
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        const user = session?.user ?? null;
        if (user) {
          // loadUserOrgs est async — wrap en .catch() pour éviter unhandled rejection
          loadUserOrgs(user.id).catch((e) => console.warn('[useAuth] loadUserOrgs failed:', e));
          syncCurrentUserToStorage(user);
        }
        setState(s => ({ ...s, user, session, loading: false }));
      })
      .catch((e) => {
        console.error('[useAuth] getSession failed:', e);
        // Si le refresh token est corrompu/expiré, on signe out explicitement
        // pour purger les tokens stockés et éviter des erreurs en boucle.
        const msg = e instanceof Error ? e.message : String(e);
        if (/Refresh Token/i.test(msg)) {
          supabase.auth.signOut().catch(() => {});
        }
        // Ne reste PAS bloqué en loading — laisse l'app continuer en mode dégradé
        setState(s => ({ ...s, user: null, session: null, loading: false }));
      });

    // Écoute les changements d'auth
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const user = session?.user ?? null;
      if (user) {
        loadUserOrgs(user.id).catch((e) => console.warn('[useAuth] loadUserOrgs failed:', e));
        syncCurrentUserToStorage(user);
      } else if (event === 'SIGNED_OUT') {
        // Nettoie au logout pour eviter ghost user dans sidebar/chat
        sessionStorage.removeItem('cockpit-current-user');
        // CRITIQUE multi-tenant : ne pas conserver l'org de l'user précédent
        // sur un device partagé. useOrgResolver re-pioche au prochain login.
        safeLocalStorage.removeItem('current-org');
        // Clear aussi les flags démo et autres caches user-spécifiques
        safeLocalStorage.removeItem('demo-mode');
        safeLocalStorage.removeItem('demo-tour-step');
        safeLocalStorage.removeItem('demo-tour-done');
        try {
          window.dispatchEvent(new CustomEvent('cockpit-auth-changed', { detail: null }));
        } catch { /* ignore */ }
      }
      setState(s => ({ ...s, user, session, loading: false }));
    });

    return () => subscription.unsubscribe();
  }, []);

  const loadUserOrgs = async (userId: string) => {
    const { data } = await fromAny('fna_user_orgs')
      .select('org_id, role')
      .eq('user_id', userId);
    if (data?.length) {
      const orgIds = data.map((d: any) => d.org_id);
      setState(s => ({
        ...s,
        role: data[0].role as UserRole,
        orgIds,
        syncing: true,
        syncStatus: 'Synchronisation...',
      }));
      // Sync Supabase → Dexie en arrière-plan
      try {
        await pullFromSupabase(orgIds, (p) => {
          setState(s => ({ ...s, syncStatus: p.step }));
        });

        // ── AUTO-RECOVERY : restaure les données Dexie orphelines ──
        // Cas typique : l'utilisateur avait des données dans Dexie (cache local)
        // mais Supabase est vide pour cet org (la sync n'avait jamais été
        // poussée). L'app ne lisant plus que Supabase, l'utilisateur voyait
        // un écran vide alors que ses données étaient dans IndexedDB.
        // Cette détection automatique pousse Dexie → Supabase au login si
        // le cas est détecté. Idempotent : marker localStorage évite re-trigger.
        try {
          setState(s => ({ ...s, syncStatus: 'Vérification données locales...' }));
          const recovery = await autoRecoverDexieToSupabase(orgIds, (msg) => {
            setState(s => ({ ...s, syncStatus: msg }));
          });
          if (recovery.needed && recovery.migrated.length > 0) {
            const totalRows = recovery.migrated.reduce((s, m) => s + m.rows, 0);
            console.info(`[useAuth] Auto-recovery réussie : ${totalRows} lignes restaurées vers Supabase pour ${recovery.migrated.length} société(s).`);
            setState(s => ({ ...s, syncStatus: `✓ ${totalRows} lignes restaurées depuis le cache local` }));
            // Petite pause pour que l'utilisateur voie le message
            await new Promise(r => setTimeout(r, 1500));
          }
        } catch (e) {
          console.warn('[useAuth] Auto-recovery échouée (non bloquant) :', e);
        }

        // Sync chat + activities pour chaque org (fire-and-forget)
        for (const orgId of orgIds) {
          void Promise.all([
            import('../engine/chatSync').then(async ({ initialChatSync, subscribeChatRealtime }) => {
              await initialChatSync(orgId);
              subscribeChatRealtime(orgId); // realtime subscription persistante
            }),
            import('../engine/activitySync').then(async ({ initialActivitySync, subscribeActivityRealtime }) => {
              await initialActivitySync(orgId);
              subscribeActivityRealtime(orgId);
            }),
          ]).catch((e) => console.warn('[Sync] chat/activities sync error:', e));
        }
        setState(s => ({ ...s, syncing: false, syncStatus: '' }));
      } catch (e) {
        console.error('[Sync] Erreur pull Supabase → Dexie:', e);
        setState(s => ({ ...s, syncing: false, syncStatus: 'Erreur sync' }));
      }
    }
  };

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const signInWithMagicLink = useCallback(async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({ email });
    if (error) throw error;
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google' });
    if (error) throw error;
  }, []);

  /**
   * Inscription utilisateur.
   * @param email - email du user
   * @param password - mot de passe (min 8 chars)
   * @param fullNameOrOrg - rétro-compat : si string, considéré comme nom complet
   *                        utilisé à la fois pour user_metadata.full_name et
   *                        comme nom d'organisation par défaut (modifiable plus tard).
   *                        Si objet { full_name, org_name? }, plus précis.
   */
  const signUp = useCallback(async (
    email: string,
    password: string,
    fullNameOrOrg: string | { full_name: string; org_name?: string }
  ) => {
    const fullName = typeof fullNameOrOrg === 'string' ? fullNameOrOrg : fullNameOrOrg.full_name;
    const orgName = typeof fullNameOrOrg === 'string'
      ? `Espace de ${fullNameOrOrg}`
      : (fullNameOrOrg.org_name || `Espace de ${fullNameOrOrg.full_name}`);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    if (error) throw error;
    // Créer l'organisation et le lien user-org
    if (data.user) {
      const orgId = `org-${Date.now()}`;
      await fromAny('fna_organizations').insert({
        id: orgId,
        name: orgName,
        currency: 'XOF',
        sector: '',
        accounting_system: 'Normal',
      });
      await fromAny('fna_user_orgs').insert({
        user_id: data.user.id,
        org_id: orgId,
        role: 'admin',
      });
    }
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    // Reset Zustand currentOrgId pour qu'au prochain login useOrgResolver
    // re-pioche dynamiquement (pas d'org fantôme du user précédent).
    try {
      const { useApp } = await import('../store/app');
      useApp.getState().setCurrentOrg('');
    } catch { /* ignore */ }
    setState({ user: null, session: null, loading: false, syncing: false, syncStatus: '', role: 'admin', orgIds: [] });
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) throw error;
  }, []);

  return {
    ...state,
    isAuthenticated: !isSupabaseConfigured || !!state.user,
    isLocalMode: !isSupabaseConfigured,
    canEdit: state.role === 'admin' || state.role === 'editor',
    isAdmin: state.role === 'admin',
    syncing: state.syncing,
    syncStatus: state.syncStatus,
    signIn,
    signInWithMagicLink,
    signInWithGoogle,
    signUp,
    signOut,
    resetPassword,
  };
}
