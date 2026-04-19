import { useEffect, useState, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import type { User, Session } from '@supabase/supabase-js';

export type UserRole = 'admin' | 'editor' | 'viewer';

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
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
    role: 'admin',
    orgIds: [],
  });

  useEffect(() => {
    if (!isSupabaseConfigured) {
      // Mode local : pas d'auth, rôle admin par défaut
      setState({ user: null, session: null, loading: false, role: 'admin', orgIds: [] });
      return;
    }

    // Récupère la session active
    supabase.auth.getSession().then(({ data: { session } }) => {
      const user = session?.user ?? null;
      if (user) loadUserOrgs(user.id);
      setState(s => ({ ...s, user, session, loading: false }));
    });

    // Écoute les changements d'auth
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null;
      if (user) loadUserOrgs(user.id);
      setState(s => ({ ...s, user, session, loading: false }));
    });

    return () => subscription.unsubscribe();
  }, []);

  const loadUserOrgs = async (userId: string) => {
    const { data } = await supabase
      .from('user_orgs')
      .select('org_id, role')
      .eq('user_id', userId);
    if (data?.length) {
      setState(s => ({
        ...s,
        role: data[0].role as UserRole,
        orgIds: data.map(d => d.org_id),
      }));
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
      await supabase.from('organizations').insert({
        id: orgId,
        name: orgName,
        currency: 'XOF',
        sector: '',
        accounting_system: 'Normal',
      });
      await supabase.from('user_orgs').insert({
        user_id: data.user.id,
        org_id: orgId,
        role: 'admin',
      });
    }
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setState({ user: null, session: null, loading: false, role: 'admin', orgIds: [] });
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
    signIn,
    signInWithMagicLink,
    signInWithGoogle,
    signUp,
    signOut,
    resetPassword,
  };
}
