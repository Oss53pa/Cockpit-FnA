import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Lock, CheckCircle2, ArrowRight, Sparkles } from 'lucide-react';
import { supabase } from '../../lib/supabase';

const ATLAS_STUDIO_URL = 'https://atlas-studio.org';

/**
 * /reset-password — Définition d'un nouveau mot de passe.
 * Atterrissage depuis le lien email Supabase :
 * URL = /reset-password#access_token=...&type=recovery&...
 * Le SDK Supabase parse le hash, déclenche l'event PASSWORD_RECOVERY,
 * et établit une session "recovery" temporaire.
 */
export default function ResetPassword() {
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<{ pwd?: string; confirm?: string }>({});
  const [globalError, setGlobalError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [recoveryReady, setRecoveryReady] = useState<'checking' | 'valid' | 'invalid'>('checking');

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setRecoveryReady('valid');
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setRecoveryReady('valid');
      } else {
        setTimeout(() => {
          setRecoveryReady((c) => (c === 'checking' ? 'invalid' : c));
        }, 1500);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGlobalError('');

    const errs: typeof errors = {};
    if (!newPassword) errs.pwd = 'Mot de passe requis';
    else if (newPassword.length < 8) errs.pwd = 'Min. 8 caractères';
    if (!confirmPassword) errs.confirm = 'Confirmation requise';
    else if (newPassword !== confirmPassword) errs.confirm = 'Les mots de passe ne correspondent pas';
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setLoading(false);

    if (error) {
      setGlobalError(error.message);
      return;
    }

    setSuccess(true);
    setTimeout(() => navigate('/home', { replace: true }), 2000);
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-bgpage dark:bg-primary-950 p-4 overflow-hidden">
      <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(60% 45% at 50% 0%, rgb(var(--accent) / 0.14), transparent 70%)' }} />
      <div className="relative w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2.5 mb-2">
            <span className="inline-flex items-center justify-center w-10 h-10 rounded-2xl bg-accent/10 text-accent ring-1 ring-accent/20">
              <Sparkles className="w-6 h-6" />
            </span>
            <h1 className="text-2xl font-bold text-primary-900 dark:text-primary-100">Cockpit FnA</h1>
          </div>
        </div>

        <div className="card p-8">
          {recoveryReady === 'checking' && (
            <div className="text-center py-8">
              <span className="inline-block w-6 h-6 border-2 border-primary-300 border-t-primary-700 rounded-full animate-spin" />
              <p className="text-sm text-primary-500 mt-3">Vérification…</p>
            </div>
          )}

          {recoveryReady === 'invalid' && (
            <div className="text-center py-4">
              <p className="font-medium mb-2">Lien expiré</p>
              <p className="text-sm text-primary-500 mb-5">
                Le lien de réinitialisation est invalide ou a expiré.
              </p>
              <Link to="/forgot-password" className="btn-primary">
                Demander un nouveau lien <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          )}

          {recoveryReady === 'valid' && success && (
            <div className="text-center py-4">
              <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-success" />
              <p className="font-medium mb-1">Mot de passe modifié !</p>
              <p className="text-sm text-primary-500">Redirection en cours…</p>
            </div>
          )}

          {recoveryReady === 'valid' && !success && (
            <>
              <h2 className="text-lg font-semibold mb-2 text-center">Nouveau mot de passe</h2>
              <p className="text-sm text-primary-500 mb-6 text-center">
                Choisissez un mot de passe d'au moins 8 caractères.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                <div>
                  <label className="text-xs font-medium text-primary-600 dark:text-primary-400 mb-1 block">
                    Nouveau mot de passe
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-400" />
                    <input
                      type="password"
                      value={newPassword}
                      onChange={e => { setNewPassword(e.target.value); setErrors(p => ({ ...p, pwd: undefined })); }}
                      className={`input pl-10 ${errors.pwd ? 'border-error' : ''}`}
                      placeholder="Min. 8 caractères"
                      autoComplete="new-password"
                      required
                    />
                  </div>
                  {errors.pwd && <p className="text-xs text-error mt-1">{errors.pwd}</p>}
                </div>

                <div>
                  <label className="text-xs font-medium text-primary-600 dark:text-primary-400 mb-1 block">
                    Confirmer le mot de passe
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-400" />
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={e => { setConfirmPassword(e.target.value); setErrors(p => ({ ...p, confirm: undefined })); }}
                      className={`input pl-10 ${errors.confirm ? 'border-error' : ''}`}
                      placeholder="Retapez le même mot de passe"
                      autoComplete="new-password"
                      required
                    />
                  </div>
                  {errors.confirm && <p className="text-xs text-error mt-1">{errors.confirm}</p>}
                </div>

                {globalError && <p className="text-xs text-error">{globalError}</p>}

                <button type="submit" disabled={loading} className="btn-accent w-full">
                  {loading ? (
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>Enregistrer <ArrowRight className="w-4 h-4" /></>
                  )}
                </button>
              </form>
            </>
          )}
        </div>

        <p className="text-center text-[11px] text-primary-400 mt-6">
          Une application <a href={ATLAS_STUDIO_URL} target="_blank" rel="noopener noreferrer" className="font-semibold hover:text-accent transition-colors">Atlas Studio</a>
        </p>
      </div>
    </div>
  );
}
