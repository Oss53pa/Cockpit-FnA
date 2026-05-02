import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LogIn, Mail, Lock, Sparkles } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

export default function Login() {
  const { signIn, signInWithMagicLink, signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'password' | 'magic'>('password');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [magicSent, setMagicSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'magic') {
        await signInWithMagicLink(email);
        setMagicSent(true);
      } else {
        await signIn(email, password);
        // Apres connexion : page d'accueil applicative (pas la Landing publique)
        navigate('/home');
      }
    } catch (err: any) {
      setError(err.message || 'Erreur de connexion');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-100 to-primary-200 dark:from-primary-950 dark:to-primary-900 p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-2">
            <Sparkles className="w-8 h-8 text-primary-700 dark:text-primary-300" />
            <h1 className="text-2xl font-bold text-primary-900 dark:text-primary-100">Cockpit FnA</h1>
          </div>
          <p className="text-sm text-primary-500">Pilotage financier SYSCOHADA</p>
        </div>

        <div className="card p-8">
          <h2 className="text-lg font-semibold mb-6 text-center">Connexion</h2>

          {magicSent ? (
            <div className="text-center py-4">
              <Mail className="w-10 h-10 mx-auto mb-3 text-primary-500" />
              <p className="font-medium mb-1">Lien envoy&eacute; !</p>
              <p className="text-sm text-primary-500">
                Consultez votre bo&icirc;te <strong>{email}</strong> et cliquez sur le lien de connexion.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Mode toggle */}
              <div className="flex gap-1 p-1 bg-primary-100 dark:bg-primary-800 rounded-lg mb-4">
                <button type="button" onClick={() => setMode('password')}
                  className={`flex-1 py-1.5 text-xs rounded-md font-medium transition ${mode === 'password' ? 'bg-white dark:bg-primary-700 shadow-sm' : 'text-primary-500'}`}>
                  Mot de passe
                </button>
                <button type="button" onClick={() => setMode('magic')}
                  className={`flex-1 py-1.5 text-xs rounded-md font-medium transition ${mode === 'magic' ? 'bg-white dark:bg-primary-700 shadow-sm' : 'text-primary-500'}`}>
                  Magic Link
                </button>
              </div>

              <div>
                <label className="text-xs font-medium text-primary-600 dark:text-primary-400 mb-1 block">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-400" />
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                    className="input pl-10" placeholder="vous@entreprise.com" required />
                </div>
              </div>

              {mode === 'password' && (
                <div>
                  <label className="text-xs font-medium text-primary-600 dark:text-primary-400 mb-1 block">Mot de passe</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-400" />
                    <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                      className="input pl-10" placeholder="********" required />
                  </div>
                </div>
              )}

              {error && <p className="text-xs text-error">{error}</p>}

              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading ? (
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <><LogIn className="w-4 h-4" /> {mode === 'magic' ? 'Envoyer le lien' : 'Se connecter'}</>
                )}
              </button>

              {/* Google OAuth */}
              <button type="button" onClick={() => signInWithGoogle()}
                className="btn-outline w-full">
                <svg className="w-4 h-4" viewBox="0 0 24 24"><path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                Continuer avec Google
              </button>

              <div className="text-center text-xs text-primary-500 space-y-1 pt-2">
                {mode === 'password' && (
                  <p><Link to="/forgot-password" className="hover:underline">Mot de passe oubli&eacute; ?</Link></p>
                )}
                <p>Pas encore de compte ? <Link to="/register" className="font-medium hover:underline">S&apos;inscrire</Link></p>
              </div>
            </form>
          )}
        </div>

        {/* Footer attribution */}
        <p className="text-center text-[11px] text-primary-400 mt-6">
          Une application <a href="https://atlas-studio.app" target="_blank" rel="noopener noreferrer" className="font-semibold hover:text-accent transition-colors">Atlas Studio</a>
        </p>
      </div>
    </div>
  );
}
