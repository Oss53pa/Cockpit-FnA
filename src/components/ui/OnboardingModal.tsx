/**
 * OnboardingModal — modal de création de la 1ère organisation au premier login.
 *
 * Affiché automatiquement quand :
 *   - L'utilisateur est authentifié (Supabase session active)
 *   - Aucune organisation n'est mappée à son user_id dans fna_user_orgs
 *   - L'utilisateur n'est PAS en mode démo (pour ne pas casser le parcours guidé)
 *   - Le flag `onboarding-skipped-{userId}` n'est pas dans localStorage
 *
 * Ce modal résout la cause racine de l'erreur RLS « new row violates row-level
 * security policy for table fna_accounts » en garantissant que tout user a au
 * moins une org avec le mapping fna_user_orgs avant la première écriture.
 */
import { useEffect, useState } from 'react';
import { Building2, ArrowRight, X, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import { useApp } from '../../store/app';
import { dataProvider } from '../../db/provider';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { invalidateCloudData } from '../../hooks/useCloudData';

const SKIP_KEY_PREFIX = 'fna-onboarding-skipped-';

type Status = 'idle' | 'submitting' | 'success' | 'error';

export function OnboardingModal() {
  const { currentOrgId, setCurrentOrg } = useApp();
  const [shouldShow, setShouldShow] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [sector, setSector] = useState('');
  const [rccm, setRccm] = useState('');
  const [ifu, setIfu] = useState('');
  const [country, setCountry] = useState('Côte d\'Ivoire');

  // Détection : faut-il afficher le modal ?
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let cancelled = false;
    (async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const uid = sessionData.session?.user?.id;
        if (!uid) return;
        if (cancelled) return;
        setUserId(uid);

        // Skip explicite par l'user
        if (localStorage.getItem(`${SKIP_KEY_PREFIX}${uid}`) === '1') return;

        // En mode démo : ne pas perturber le parcours
        const isDemoMode = localStorage.getItem('demo-mode') === '1';
        if (isDemoMode) return;

        // Vérifie si user a au moins 1 org mappée
        const { data: userOrgs } = await (supabase as any)
          .from('fna_user_orgs')
          .select('org_id')
          .eq('user_id', uid);

        const hasOrg = (userOrgs?.length ?? 0) > 0;
        if (!hasOrg && !cancelled) {
          // Petit délai pour laisser hydrate finir
          setTimeout(() => { if (!cancelled) setShouldShow(true); }, 1500);
        }
      } catch (e) {
        console.warn('[OnboardingModal] détection échouée:', e);
      }
    })();
    return () => { cancelled = true; };
  }, [currentOrgId]);

  const handleSkip = () => {
    if (userId) localStorage.setItem(`${SKIP_KEY_PREFIX}${userId}`, '1');
    setShouldShow(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !userId) return;
    setStatus('submitting');
    setError(null);
    try {
      const orgId = `org-${Date.now()}-${userId.slice(0, 6)}`;
      // 1) Crée l'organisation
      await dataProvider.upsertOrganization({
        id: orgId,
        name: name.trim(),
        sector: sector.trim() || undefined,
        rccm: rccm.trim() || undefined,
        ifu: ifu.trim() || undefined,
        address: country.trim() || undefined,
        currency: 'XOF',
        createdAt: Date.now(),
      } as any);

      // 2) Mapping fna_user_orgs (CRITIQUE pour RLS)
      await (supabase as any).from('fna_user_orgs').upsert(
        { user_id: userId, org_id: orgId, role: 'admin' },
        { onConflict: 'user_id,org_id', ignoreDuplicates: true },
      );

      // 3) Active l'org créée
      setCurrentOrg(orgId);
      invalidateCloudData('organizations');
      setStatus('success');
      setTimeout(() => setShouldShow(false), 1500);
    } catch (err: any) {
      console.error('[OnboardingModal] création échouée:', err);
      setError(err?.message || 'Erreur lors de la création.');
      setStatus('error');
    }
  };

  if (!shouldShow) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      <div className="bg-bgpage dark:bg-primary-950 max-w-lg w-full rounded-2xl shadow-2xl border border-primary-200 dark:border-primary-800 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-5 border-b border-primary-200 dark:border-primary-800 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent/15 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-accent" />
            </div>
            <div>
              <h2 id="onboarding-title" className="text-base font-bold text-primary-900 dark:text-primary-100">
                Bienvenue dans Cockpit FnA
              </h2>
              <p className="text-xs text-primary-600 dark:text-primary-400">
                Créons votre première société
              </p>
            </div>
          </div>
          <button
            onClick={handleSkip}
            className="p-1.5 rounded-lg text-primary-500 hover:bg-primary-100 dark:hover:bg-primary-900 transition"
            aria-label="Fermer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        {status === 'success' ? (
          <div className="p-8 text-center">
            <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-success" />
            <p className="font-semibold text-primary-900 dark:text-primary-100">
              Société créée avec succès
            </p>
            <p className="text-xs text-primary-600 dark:text-primary-400 mt-1">
              Vous pouvez maintenant importer votre Grand Livre.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <p className="text-xs text-primary-600 dark:text-primary-400">
              Renseignez les informations de votre entreprise pour activer l'import de votre
              comptabilité SYSCOHADA. Tous les champs sauf le nom sont optionnels.
            </p>

            <div>
              <label className="text-xs font-semibold text-primary-700 dark:text-primary-300 block mb-1">
                Raison sociale <span className="text-error">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex. Acme Industries SA"
                required
                autoFocus
                className="w-full px-3 py-2 rounded-lg border border-primary-300 dark:border-primary-700 bg-white dark:bg-primary-950 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-primary-700 dark:text-primary-300 block mb-1">
                  Secteur
                </label>
                <input
                  type="text"
                  value={sector}
                  onChange={(e) => setSector(e.target.value)}
                  placeholder="Industrie, Services…"
                  className="w-full px-3 py-2 rounded-lg border border-primary-300 dark:border-primary-700 bg-white dark:bg-primary-950 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-primary-700 dark:text-primary-300 block mb-1">
                  Pays
                </label>
                <input
                  type="text"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-primary-300 dark:border-primary-700 bg-white dark:bg-primary-950 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-primary-700 dark:text-primary-300 block mb-1">
                  N° RCCM
                </label>
                <input
                  type="text"
                  value={rccm}
                  onChange={(e) => setRccm(e.target.value)}
                  placeholder="CI-ABJ-2024-…"
                  className="w-full px-3 py-2 rounded-lg border border-primary-300 dark:border-primary-700 bg-white dark:bg-primary-950 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-primary-700 dark:text-primary-300 block mb-1">
                  N° IFU / NIF
                </label>
                <input
                  type="text"
                  value={ifu}
                  onChange={(e) => setIfu(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-primary-300 dark:border-primary-700 bg-white dark:bg-primary-950 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-error/10 border border-error/30">
                <AlertCircle className="w-4 h-4 text-error shrink-0 mt-0.5" />
                <p className="text-xs text-error">{error}</p>
              </div>
            )}

            <div className="flex items-center justify-between pt-2 border-t border-primary-200 dark:border-primary-800">
              <button
                type="button"
                onClick={handleSkip}
                className="text-xs text-primary-500 hover:text-primary-700 dark:hover:text-primary-300"
              >
                Plus tard
              </button>
              <button
                type="submit"
                disabled={!name.trim() || status === 'submitting'}
                className="btn-primary !py-2 !text-sm inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {status === 'submitting' ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Création…</>
                ) : (
                  <>Créer la société <ArrowRight className="w-3.5 h-3.5" /></>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
