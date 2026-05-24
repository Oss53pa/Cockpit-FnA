/**
 * OrgGuard — protection des routes qui nécessitent une organisation active.
 *
 * Comportement :
 *   1. Si l'utilisateur a au moins 1 org dans fna_user_orgs → laisse passer
 *   2. Sinon → affiche une erreur bloquante avec invitation à compléter
 *      l'onboarding (le OnboardingModal s'affiche en parallèle au niveau App)
 *
 * Cause racine : sans org mappée, toute écriture Supabase échoue en RLS
 * (« new row violates row-level security policy »). Mieux vaut bloquer en
 * amont avec un message clair que laisser l'utilisateur déclencher une erreur
 * cryptique côté DB.
 *
 * Mode démo : laisse passer (le DemoProvider fournit des fixtures sans Supabase).
 */
import { useEffect, useState } from 'react';
import { AlertTriangle, Building2 } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { safeLocalStorage } from '../../lib/safeStorage';

type OrgState = 'loading' | 'has-org' | 'no-org' | 'demo' | 'unauth';

export function OrgGuard({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<OrgState>('loading');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Mode démo : bypass
      if (typeof localStorage !== 'undefined' && safeLocalStorage.getItem('demo-mode') === '1') {
        if (!cancelled) setState('demo');
        return;
      }
      if (!isSupabaseConfigured) {
        if (!cancelled) setState('demo'); // sans Supabase, on laisse passer (dev local)
        return;
      }
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const uid = sessionData.session?.user?.id;
        if (!uid) {
          if (!cancelled) setState('unauth');
          return;
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- table non typée
        const { data: userOrgs } = await (supabase as any)
          .from('fna_user_orgs')
          .select('org_id')
          .eq('user_id', uid);
        const hasOrg = (userOrgs?.length ?? 0) > 0;
        if (!cancelled) setState(hasOrg ? 'has-org' : 'no-org');
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[OrgGuard] détection échouée:', e);
        if (!cancelled) setState('has-org'); // fail-open : ne bloque pas en cas d'erreur réseau
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (state === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xs text-primary-500">Chargement…</div>
      </div>
    );
  }

  if (state === 'no-org') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-100 to-primary-200 dark:from-primary-950 dark:to-primary-900 p-4">
        <div className="bg-white dark:bg-primary-950 rounded-2xl shadow-xl border border-primary-200 dark:border-primary-800 max-w-md w-full p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-warning/15 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-8 h-8 text-warning" />
          </div>
          <h2 className="text-lg font-bold text-primary-900 dark:text-primary-100 mb-2">
            Configuration requise
          </h2>
          <p className="text-sm text-primary-600 dark:text-primary-400 mb-6">
            Vous devez créer une entreprise avant d'accéder à l'application.
            Le wizard de configuration s'affiche au-dessus de cet écran.
          </p>
          <div className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-accent/10 text-accent text-xs">
            <Building2 className="w-4 h-4" />
            Complétez les 4 étapes du wizard pour continuer
          </div>
        </div>
      </div>
    );
  }

  // has-org, demo, unauth (unauth est géré par ProtectedRoute en amont)
  return <>{children}</>;
}
