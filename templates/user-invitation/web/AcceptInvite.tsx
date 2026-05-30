/* eslint-disable @typescript-eslint/no-explicit-any -- interop dynamique (parsers, payloads Supabase/Edge Functions, helpers Recharts). À typer finement au cas par cas. */
// ════════════════════════════════════════════════════════════════════
// TEMPLATE — Page d'acceptation d'invitation (React + supabase-js)
// Route à monter : /auth/accept-invite
//
// Flow anti-prefetch :
//   1. L'email contient ${appUrl}/auth/accept-invite?token_hash=XXX&type=invite
//   2. Ici, JS appelle supabase.auth.verifyOtp({ token_hash, type }) → crée la
//      session. Les scanners email (SafeLinks, Proofpoint, Gmail) ne peuvent PAS
//      consommer le token car la vérification exige l'exécution du JS.
//   3. L'utilisateur définit son mot de passe → updateUser({ password }).
//   4. On lit user_orgs pour fixer l'org courante, puis redirection.
//
// Adaptez : remplacez `supabase` par votre client, le redirect final, le style.
// ════════════════════════════════════════════════════════════════════
import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient'; // ← votre client supabase-js

const HOME_ROUTE = '/'; // ← où rediriger après activation
const LOGIN_ROUTE = '/login';
const ORG_STORAGE_KEY = 'current-org';

export default function AcceptInvite() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [email, setEmail] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sub = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user) { setEmail(session.user.email ?? null); setReady(true); }
    });

    const params = new URLSearchParams(window.location.search);
    const tokenHash = params.get('token_hash');
    const type = params.get('type'); // 'invite' | 'recovery'

    if (tokenHash && type) {
      (async () => {
        const { data, error: verifyErr } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as any });
        if (verifyErr) { setError(verifyErr.message || 'Lien invalide ou déjà utilisé.'); return; }
        if (data.session?.user) {
          setEmail(data.session.user.email ?? null);
          setReady(true);
          window.history.replaceState({}, '', window.location.pathname); // nettoie le token de l'URL
        } else {
          setError('Session non créée après vérification du lien.');
        }
      })();
    } else {
      // Repli legacy : Supabase auto-détecte un éventuel #access_token=…
      supabase.auth.getSession().then(({ data }) => {
        if (data.session?.user) { setEmail(data.session.user.email ?? null); setReady(true); }
      });
    }
    return () => sub.data.subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError('Le mot de passe doit faire au moins 8 caractères.');
    if (password !== confirm) return setError('Les deux mots de passe ne correspondent pas.');
    setSubmitting(true);
    try {
      const { error: upErr } = await supabase.auth.updateUser({ password });
      if (upErr) throw upErr;

      // Fixe l'org d'atterrissage = 1re org de user_orgs (peuplée par l'Edge Function).
      try {
        const { data: s } = await supabase.auth.getSession();
        const uid = s?.session?.user?.id;
        if (uid) {
          const { data: orgs } = await supabase.from('user_orgs').select('org_id').eq('user_id', uid);
          const first = orgs?.[0]?.org_id;
          if (first) { try { localStorage.setItem(ORG_STORAGE_KEY, first); } catch { /* quota */ } }
        }
      } catch { /* non bloquant */ }

      window.location.assign(HOME_ROUTE);
    } catch (e: any) {
      setError(e?.message ?? 'Erreur lors de la définition du mot de passe.');
    } finally {
      setSubmitting(false);
    }
  };

  if (error && !ready) {
    return (
      <div style={{ maxWidth: 420, margin: '80px auto', textAlign: 'center', fontFamily: 'system-ui' }}>
        <h1>Lien invalide ou expiré</h1>
        <p style={{ color: '#888' }}>{error}</p>
        <a href={LOGIN_ROUTE}>Aller à la connexion</a>
      </div>
    );
  }
  if (!ready) {
    return <div style={{ textAlign: 'center', marginTop: 120, fontFamily: 'system-ui' }}>Validation de l'invitation…</div>;
  }

  return (
    <div style={{ maxWidth: 420, margin: '80px auto', fontFamily: 'system-ui' }}>
      <h1>Définissez votre mot de passe</h1>
      <p>Compte : <strong>{email}</strong></p>
      <form onSubmit={handleSubmit}>
        <input type="password" placeholder="Mot de passe (min. 8)" value={password}
          onChange={(e) => setPassword(e.target.value)} minLength={8} required style={{ display: 'block', width: '100%', margin: '8px 0', padding: 10 }} />
        <input type="password" placeholder="Confirmer" value={confirm}
          onChange={(e) => setConfirm(e.target.value)} required style={{ display: 'block', width: '100%', margin: '8px 0', padding: 10 }} />
        {error && <p style={{ color: '#c00' }}>{error}</p>}
        <button type="submit" disabled={submitting || password.length < 8 || password !== confirm}
          style={{ width: '100%', padding: 12, marginTop: 8 }}>
          {submitting ? 'Validation…' : 'Définir mon mot de passe et continuer →'}
        </button>
      </form>
    </div>
  );
}
