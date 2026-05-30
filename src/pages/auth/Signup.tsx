/* eslint-disable @typescript-eslint/no-explicit-any -- interop dynamique (parsers, payloads Supabase/Edge Functions, helpers Recharts). À typer finement au cas par cas. */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { UserPlus, Mail, Lock, User, Building2, ExternalLink } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

const ATLAS_STUDIO_URL = 'https://atlas-studio.org';

/**
 * /signup — format unifié Atlas Studio Suite
 * Champs : Nom + email + mot de passe + acceptation CGU.
 * Lien : "Se connecter".
 *
 * Si email confirmation est activé Supabase-side : message "vérifie ton email".
 * Sinon : auto-login + redirection /home.
 */
export default function Signup() {
  const { signUp } = useAuth();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState('');
  const [orgName, setOrgName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; email?: string; password?: string; confirmPassword?: string }>({});
  const [globalError, setGlobalError] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailConfirmRequired, setEmailConfirmRequired] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGlobalError('');

    const errs: typeof errors = {};
    if (!fullName.trim()) errs.name = 'Nom requis';
    if (!email.trim()) errs.email = 'Email requis';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errs.email = "Format d'email invalide";
    if (!password) errs.password = 'Mot de passe requis';
    else if (password.length < 8) errs.password = 'Min. 8 caractères';
    if (!confirmPassword) errs.confirmPassword = 'Confirmation requise';
    else if (password !== confirmPassword) errs.confirmPassword = 'Les mots de passe ne correspondent pas';

    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    if (!acceptTerms) {
      setGlobalError('Vous devez accepter les CGU pour créer un compte.');
      return;
    }

    setLoading(true);
    try {
      await signUp(email.trim().toLowerCase(), password, {
        full_name: fullName.trim(),
        org_name: orgName.trim() || undefined,
      });
      // Si Supabase a email confirmation activé, on n'a pas de session immédiate
      // → on affiche le message. Sinon, le useAuth listener redirige automatiquement.
      // On tente quand même la redirection après 600ms : si ça marche, tant mieux.
      setEmailConfirmRequired(true);
      setTimeout(() => navigate('/home', { replace: true }), 600);
    } catch (err: any) {
      setGlobalError(translateError(err.message || "Erreur lors de l'inscription"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-bgpage dark:bg-primary-950 p-4 overflow-hidden">
      <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(60% 45% at 50% 0%, rgb(var(--accent) / 0.14), transparent 70%)' }} />
      <div className="relative w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="font-display text-5xl leading-none text-primary-900 dark:text-primary-100">Cockpit FnA</h1>
          <p className="text-[11px] uppercase tracking-[0.18em] text-primary-400 mt-3 font-medium">Créez votre espace de pilotage</p>
        </div>

        <div className="card p-8">
          <h2 className="text-lg font-semibold mb-6 text-center">Créer un compte</h2>

          {emailConfirmRequired ? (
            <div className="text-center py-4">
              <Mail className="w-10 h-10 mx-auto mb-3 text-success" />
              <p className="font-medium mb-1">Compte créé !</p>
              <p className="text-sm text-primary-500 mb-4">
                Si une confirmation d'email est requise, un lien a été envoyé à <strong>{email}</strong>.
                Sinon, redirection en cours…
              </p>
              <Link to="/login" className="btn-primary">
                Aller à la connexion
              </Link>
            </div>
          ) : (
            <>
              {/* SSO Atlas Studio */}
              <a
                href={`${ATLAS_STUDIO_URL}/portal/signup?next=${encodeURIComponent(window.location.origin + '/home')}`}
                className="btn-primary w-full mb-3"
              >
                Créer un compte Atlas Studio
                <ExternalLink className="w-3 h-3 opacity-70" />
              </a>

              <div className="flex items-center gap-3 my-5">
                <div className="flex-1 h-px bg-primary-200 dark:bg-primary-700" />
                <span className="text-[11px] uppercase tracking-wider text-primary-400">ou inscription locale</span>
                <div className="flex-1 h-px bg-primary-200 dark:bg-primary-700" />
              </div>

              <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                <div>
                  <label className="text-xs font-medium text-primary-600 dark:text-primary-400 mb-1 block">
                    Nom <span className="text-error">*</span>
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-400" />
                    <input
                      type="text"
                      value={fullName}
                      onChange={e => { setFullName(e.target.value); setErrors(p => ({ ...p, name: undefined })); }}
                      className={`input pl-10 ${errors.name ? 'border-error' : ''}`}
                      placeholder="Prénom Nom"
                      autoComplete="name"
                      required
                    />
                  </div>
                  {errors.name && <p className="text-xs text-error mt-1">{errors.name}</p>}
                </div>

                <div>
                  <label className="text-xs font-medium text-primary-600 dark:text-primary-400 mb-1 block">
                    Nom de l'entreprise
                  </label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-400" />
                    <input
                      type="text"
                      value={orgName}
                      onChange={e => setOrgName(e.target.value)}
                      className="input pl-10"
                      placeholder="Ex : EMERGENCE PLAZA SA"
                      autoComplete="organization"
                    />
                  </div>
                  <p className="text-[10px] text-primary-400 mt-1">Laissez vide pour créer un espace personnel</p>
                </div>

                <div>
                  <label className="text-xs font-medium text-primary-600 dark:text-primary-400 mb-1 block">
                    Email <span className="text-error">*</span>
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={e => { setEmail(e.target.value); setErrors(p => ({ ...p, email: undefined })); }}
                      className={`input pl-10 ${errors.email ? 'border-error' : ''}`}
                      placeholder="vous@entreprise.com"
                      autoComplete="email"
                      required
                    />
                  </div>
                  {errors.email && <p className="text-xs text-error mt-1">{errors.email}</p>}
                </div>

                <div>
                  <label className="text-xs font-medium text-primary-600 dark:text-primary-400 mb-1 block">
                    Mot de passe <span className="text-error">*</span>
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-400" />
                    <input
                      type="password"
                      value={password}
                      onChange={e => { setPassword(e.target.value); setErrors(p => ({ ...p, password: undefined })); }}
                      className={`input pl-10 ${errors.password ? 'border-error' : ''}`}
                      placeholder="Min. 8 caractères"
                      autoComplete="new-password"
                      required
                      minLength={8}
                    />
                  </div>
                  {errors.password && <p className="text-xs text-error mt-1">{errors.password}</p>}
                </div>

                <div>
                  <label className="text-xs font-medium text-primary-600 dark:text-primary-400 mb-1 block">
                    Confirmer le mot de passe <span className="text-error">*</span>
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-400" />
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={e => { setConfirmPassword(e.target.value); setErrors(p => ({ ...p, confirmPassword: undefined })); }}
                      className={`input pl-10 ${errors.confirmPassword ? 'border-error' : ''}`}
                      placeholder="Retapez le mot de passe"
                      autoComplete="new-password"
                      required
                      minLength={8}
                    />
                  </div>
                  {errors.confirmPassword && <p className="text-xs text-error mt-1">{errors.confirmPassword}</p>}
                  {confirmPassword && password && password !== confirmPassword && !errors.confirmPassword && (
                    <p className="text-xs text-warning mt-1">⚠ Les mots de passe ne correspondent pas</p>
                  )}
                </div>

                {/* CGU */}
                <label className="flex items-start gap-2 text-xs text-primary-600 dark:text-primary-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={acceptTerms}
                    onChange={e => setAcceptTerms(e.target.checked)}
                    className="mt-0.5 w-4 h-4 cursor-pointer flex-shrink-0"
                  />
                  <span className="leading-snug">
                    J'accepte les{' '}
                    <a href={`${ATLAS_STUDIO_URL}/cgu`} target="_blank" rel="noopener noreferrer" className="font-semibold underline">
                      conditions générales d'utilisation
                    </a>{' '}
                    et la{' '}
                    <a href={`${ATLAS_STUDIO_URL}/confidentialite`} target="_blank" rel="noopener noreferrer" className="font-semibold underline">
                      politique de confidentialité
                    </a>
                    <span className="text-error ml-0.5">*</span>
                  </span>
                </label>

                {globalError && <p className="text-xs text-error">{globalError}</p>}

                <button type="submit" disabled={loading || !acceptTerms} className="btn-accent w-full">
                  {loading ? (
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <><UserPlus className="w-4 h-4" /> Créer mon compte</>
                  )}
                </button>
              </form>

              <p className="text-center text-xs text-primary-500 pt-5 mt-5 border-t border-primary-200 dark:border-primary-700">
                Déjà un compte ?{' '}
                <Link to="/login" className="font-semibold hover:underline">Se connecter</Link>
              </p>
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

function translateError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('already registered') || m.includes('already exists') || m.includes('user already'))
    return 'Un compte existe déjà avec cet email. Connectez-vous ou utilisez « Mot de passe oublié ? ».';
  if (m.includes('password')) return 'Le mot de passe doit faire au moins 8 caractères.';
  if (m.includes('rate limit')) return 'Trop de tentatives. Réessayez dans quelques minutes.';
  return msg;
}
