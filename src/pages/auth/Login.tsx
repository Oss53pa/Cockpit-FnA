import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { LogIn, Mail, Lock, Sparkles, ExternalLink } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

const ATLAS_STUDIO_URL = 'https://atlas-studio.org';

/**
 * /login — format unifié Atlas Studio Suite
 * Champs : email + mot de passe.
 * Liens : "Mot de passe oublié ?" + "S'inscrire".
 * Plus : bouton SSO "Se connecter avec Atlas Studio" + alternatives Google / Magic Link.
 */
export default function Login() {
  const { signIn, signInWithMagicLink, signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [magicSent, setMagicSent] = useState(false);
  const [showAlternatives, setShowAlternatives] = useState(false);

  // ?next=... pour redirect après auth
  const next = new URLSearchParams(location.search).get('next') || '/home';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signIn(email.trim().toLowerCase(), password);
      navigate(next, { replace: true });
    } catch (err: any) {
      setError(translateError(err.message || 'Erreur de connexion'));
    } finally {
      setLoading(false);
    }
  };

  const handleMagicLink = async () => {
    if (!email.trim()) { setError('Entrez votre email d\'abord'); return; }
    setError('');
    setLoading(true);
    try {
      await signInWithMagicLink(email.trim().toLowerCase());
      setMagicSent(true);
    } catch (err: any) {
      setError(err.message || 'Erreur');
    } finally {
      setLoading(false);
    }
  };

  const ssoUrl = `${ATLAS_STUDIO_URL}/portal/login?next=${encodeURIComponent(window.location.origin + next)}`;

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-bgpage dark:bg-primary-950 p-4 overflow-hidden">
      {/* Halo d'accent de marque (sauge/terracotta selon la palette active) */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(60% 45% at 50% 0%, rgb(var(--accent) / 0.14), transparent 70%)' }}
      />
      <div className="relative w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2.5 mb-2">
            <span className="inline-flex items-center justify-center w-10 h-10 rounded-2xl bg-accent/10 text-accent ring-1 ring-accent/20">
              <Sparkles className="w-6 h-6" />
            </span>
            <h1 className="text-2xl font-bold text-primary-900 dark:text-primary-100">Cockpit FnA</h1>
          </div>
          <p className="text-sm text-primary-500">Pilotage financier SYSCOHADA</p>
        </div>

        <div className="card p-8">
          <h2 className="text-lg font-semibold mb-6 text-center">Se connecter</h2>

          {magicSent ? (
            <div className="text-center py-4">
              <Mail className="w-10 h-10 mx-auto mb-3 text-accent" />
              <p className="font-medium mb-1">Lien envoyé !</p>
              <p className="text-sm text-primary-500">
                Consultez votre boîte <strong>{email}</strong> et cliquez sur le lien de connexion.
              </p>
            </div>
          ) : (
            <>
              {/* SSO Atlas Studio — primary CTA */}
              <a
                href={ssoUrl}
                className="btn-primary w-full mb-3"
                title="Connexion via votre compte Atlas Studio"
              >
                <Sparkles className="w-4 h-4" />
                Se connecter avec Atlas Studio
                <ExternalLink className="w-3 h-3 opacity-70" />
              </a>

              <div className="flex items-center gap-3 my-5">
                <div className="flex-1 h-px bg-primary-200 dark:bg-primary-700" />
                <span className="text-[11px] uppercase tracking-wider text-primary-400">ou avec votre email</span>
                <div className="flex-1 h-px bg-primary-200 dark:bg-primary-700" />
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-primary-600 dark:text-primary-400 mb-1 block">Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      className="input pl-10"
                      placeholder="vous@entreprise.com"
                      required
                      autoComplete="email"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-primary-600 dark:text-primary-400 mb-1 block">Mot de passe</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-400" />
                    <input
                      type="password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      className="input pl-10"
                      placeholder="••••••••"
                      required
                      autoComplete="current-password"
                    />
                  </div>
                </div>

                {error && <p className="text-xs text-error">{error}</p>}

                <button type="submit" disabled={loading} className="btn-accent w-full">
                  {loading ? (
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <><LogIn className="w-4 h-4" /> Se connecter</>
                  )}
                </button>

                <div className="text-center">
                  <Link to="/forgot-password" className="text-xs text-primary-500 hover:underline">
                    Mot de passe oublié ?
                  </Link>
                </div>
              </form>

              {/* Alternatives — collapsed by default */}
              <button
                type="button"
                onClick={() => setShowAlternatives(v => !v)}
                className="w-full mt-5 pt-5 border-t border-primary-200 dark:border-primary-700 text-xs text-primary-400 hover:text-primary-600"
              >
                {showAlternatives ? 'Masquer les autres options' : 'Autres options de connexion'}
              </button>

              {showAlternatives && (
                <div className="space-y-2 mt-3">
                  <button type="button" onClick={() => signInWithGoogle()} className="btn-outline w-full">
                    <svg className="w-4 h-4" viewBox="0 0 24 24"><path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                    Continuer avec Google
                  </button>
                  <button type="button" onClick={handleMagicLink} disabled={loading || !email} className="btn-outline w-full">
                    <Mail className="w-4 h-4" /> Lien magique par email
                  </button>
                </div>
              )}

              <p className="text-center text-xs text-primary-500 pt-5 mt-5 border-t border-primary-200 dark:border-primary-700">
                Pas encore de compte ?{' '}
                <Link to="/signup" className="font-semibold hover:underline">S'inscrire</Link>
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
  if (m.includes('invalid login credentials')) return 'Email ou mot de passe incorrect.';
  if (m.includes('email not confirmed')) return 'Email non confirmé. Vérifiez votre boîte de réception.';
  if (m.includes('rate limit')) return 'Trop de tentatives. Réessayez dans quelques minutes.';
  return msg;
}
