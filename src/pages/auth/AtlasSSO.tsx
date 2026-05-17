/**
 * AtlasSSO.tsx — /auth route handler pour le SSO depuis Atlas Studio.
 *
 * Flow :
 * 1. Récupère ?token=<JWT> dans l'URL (généré par atlas-studio.org/portal/launch)
 * 2. Appelle la fonction atlas-sso pour valider et obtenir un magic link token_hash
 * 3. Utilise supabase.auth.verifyOtp() pour établir la session
 * 4. Redirige vers /home
 */
import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? '';

export default function AtlasSSO() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('Validation du token Atlas Studio...');

  useEffect(() => {
    const token = params.get('token');
    if (!token) {
      setError("Token manquant dans l'URL. Lancez l'application depuis Atlas Studio.");
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        setStatus('Validation du token Atlas Studio...');
        // 1. Appel à atlas-sso pour valider le JWT et obtenir le magic link
        const res = await fetch(`${SUPABASE_URL}/functions/v1/atlas-sso`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        if (cancelled) return;

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error || `Validation échouée (HTTP ${res.status})`);
        }

        const { token_hash, type } = await res.json();
        if (!token_hash) throw new Error('Réponse incomplète (token_hash manquant)');

        // 1bis. Persister le JWT Atlas Studio pour la fédération Proph3t.
        // Ce token est signé par JWT_SECRET (HS256) et accepté par les Edge
        // Functions du core Atlas Studio (proph3t-tool-direct, ...).
        // Voir docs/PROPH3T_FEDERATION.md.
        try {
          localStorage.setItem('atlas_federation_token', token);
        } catch { /* localStorage indispo (Safari incognito) — la fédération sera désactivée. */ }

        // 2. Établir la session Supabase via verifyOtp
        setStatus('Établissement de la session...');
        const { error: otpError } = await supabase.auth.verifyOtp({
          token_hash,
          type: (type || 'magiclink') as 'magiclink',
        });
        if (cancelled) return;
        if (otpError) throw otpError;

        // 3. Redirection vers la page d'accueil
        setStatus('Connexion réussie, redirection...');
        navigate('/home', { replace: true });
      } catch (e) {
        if (cancelled) return;
        console.error('[AtlasSSO] failed:', e);
        const msg = e instanceof Error ? e.message : 'Erreur inconnue';
        setError(msg);
      }
    })();

    return () => { cancelled = true; };
  }, [params, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-primary-50 px-5 py-12">
      <div className="max-w-md w-full text-center">
        {error ? (
          <>
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-100 border border-red-200 mb-5">
              <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h1 className="text-xl font-medium text-primary-900 mb-2">Connexion impossible</h1>
            <p className="text-primary-600 text-sm leading-relaxed mb-6">{error}</p>
            <div className="flex gap-3 justify-center">
              <Link
                to="/login"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-primary-300 text-primary-700 text-[13px] font-medium hover:border-primary-500 transition-colors"
              >
                Connexion classique
              </Link>
              <a
                href="https://atlas-studio.org/portal"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary-700 text-white text-[13px] font-medium hover:bg-primary-800 transition-colors"
              >
                Retour Atlas Studio
              </a>
            </div>
          </>
        ) : (
          <>
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary-100 border border-primary-200 mb-5">
              <div className="w-6 h-6 border-2 border-primary-300 border-t-primary-700 rounded-full animate-spin" />
            </div>
            <h1 className="text-xl font-medium text-primary-900 mb-2">Connexion à Cockpit F&amp;A</h1>
            <p className="text-primary-600 text-sm">{status}</p>
          </>
        )}
      </div>
    </div>
  );
}
