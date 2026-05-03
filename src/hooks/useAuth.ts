import { useEffect, useState, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { pullFromSupabase } from '../db/supabaseSync';
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
    const localUsers = JSON.parse(localStorage.getItem('cockpit-users') ?? '[]');
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

    // Récupère la session active
    supabase.auth.getSession().then(({ data: { session } }) => {
      const user = session?.user ?? null;
      if (user) {
        loadUserOrgs(user.id);
        syncCurrentUserToStorage(user);
      }
      setState(s => ({ ...s, user, session, loading: false }));
    });

    // Écoute les changements d'auth
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const user = session?.user ?? null;
      if (user) {
        loadUserOrgs(user.id);
        syncCurrentUserToStorage(user);
      } else if (event === 'SIGNED_OUT') {
        // Nettoie au logout pour eviter ghost user dans sidebar/chat
        sessionStorage.removeItem('cockpit-current-user');
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

  const signUp = useCallback(async (email: string, password: string, orgName: string) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
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
