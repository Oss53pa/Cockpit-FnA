import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

const ATLAS_STUDIO_URL = 'https://atlas-studio.org';

/**
 * /forgot-password — format unifié Atlas Studio Suite
 * L'utilisateur saisit son email, Supabase envoie un magic link vers
 * /reset-password (avec hash recovery dans l'URL).
 */
export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError('Email invalide');
      return;
    }

    setLoading(true);
    const redirectTo = `${window.location.origin}/reset-password`;
    const { error: err } = await supabase.auth.resetPasswordForEmail(trimmed, { redirectTo });
    setLoading(false);

    if (err && err.message.toLowerCase().includes('rate limit')) {
      setError('Trop de demandes. Réessayez dans quelques minutes.');
      return;
    }
    // Sécurité : on affiche le succès même si email inconnu (pas de leak)
    setSent(true);
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-bgpage dark:bg-primary-950 p-4 overflow-hidden">
      <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(60% 45% at 50% 0%, rgb(var(--accent) / 0.14), transparent 70%)' }} />
      <div className="relative w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="font-display text-5xl leading-none text-primary-900 dark:text-primary-100">Cockpit FnA</h1>
          <p className="text-[11px] uppercase tracking-[0.18em] text-primary-400 mt-3 font-medium">Pilotage financier SYSCOHADA</p>
        </div>

        <div className="card p-8">
          {sent ? (
            <div className="text-center py-4">
              <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-success" />
              <p className="font-medium mb-2">Email envoyé !</p>
              <p className="text-sm text-primary-500 mb-2">
                Si un compte existe pour <strong>{email}</strong>, vous recevrez un lien de réinitialisation.
              </p>
              <p className="text-xs text-primary-400 mb-5">
                Pensez à vérifier votre dossier spam si vous ne recevez rien sous quelques minutes.
              </p>
              <Link to="/login" className="btn-primary">
                <ArrowLeft className="w-4 h-4" /> Retour à la connexion
              </Link>
            </div>
          ) : (
            <>
              <h2 className="text-lg font-semibold mb-2 text-center">Mot de passe oublié</h2>
              <p className="text-sm text-primary-500 mb-6 text-center">
                Entrez votre email — nous vous enverrons un lien pour le réinitialiser.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={e => { setEmail(e.target.value); setError(''); }}
                    className={`input pl-10 ${error ? 'border-error' : ''}`}
                    placeholder="vous@entreprise.com"
                    autoComplete="email"
                    required
                  />
                </div>

                {error && <p className="text-xs text-error">{error}</p>}

                <button type="submit" disabled={loading} className="btn-accent w-full">
                  {loading ? (
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <><Mail className="w-4 h-4" /> Envoyer le lien</>
                  )}
                </button>

                <p className="text-center text-xs text-primary-500">
                  <Link to="/login" className="hover:underline">
                    <ArrowLeft className="w-3 h-3 inline" /> Retour à la connexion
                  </Link>
                </p>
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
