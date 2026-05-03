/**
 * AcceptInvite — Page de définition du mot de passe pour un nouvel utilisateur invité.
 *
 * Flow :
 * 1. Admin invite un user via Settings → cockpit-invite-user envoie un magic link
 * 2. User clique sur le lien dans son email → redirige ici avec un token Supabase
 * 3. Supabase établit la session automatiquement (event SIGNED_IN)
 * 4. User saisit son mot de passe → updateUser({ password })
 * 5. Redirige vers /home avec session active
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Lock, CheckCircle2, AlertTriangle, Eye, EyeOff } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { toast } from '../../components/ui/Toast';

export default function AcceptInvite() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setError('Supabase non configuré');
      return;
    }
    // Le hash contient access_token / refresh_token après le redirect Supabase
    // L'event SIGNED_IN est dispatché automatiquement
    const sub = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        setUserEmail(session.user.email ?? null);
        setUserName(
          (session.user.user_metadata?.full_name as string | undefined)
          ?? (session.user.user_metadata?.name as string | undefined)
          ?? null,
        );
        setSessionReady(true);
      }
    });
    // Tente de récupérer la session immédiatement (si déjà établie)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUserEmail(session.user.email ?? null);
        setUserName(
          (session.user.user_metadata?.full_name as string | undefined)
          ?? (session.user.user_metadata?.name as string | undefined)
          ?? null,
        );
        setSessionReady(true);
      }
    });
    return () => { sub.data.subscription.unsubscribe(); };
  }, []);

  // Indicateurs de force du mot de passe
  const pwdStrength = (() => {
    let score = 0;
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    return score;
  })();
  const pwdLabel = ['', 'Très faible', 'Faible', 'Correct', 'Fort', 'Très fort'][pwdStrength];
  const pwdColor = ['bg-primary-200', 'bg-error', 'bg-warning', 'bg-warning', 'bg-success', 'bg-success'][pwdStrength];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('Le mot de passe doit faire au moins 8 caractères.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Les deux mots de passe ne correspondent pas.');
      return;
    }
    setSubmitting(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      toast.success('Mot de passe défini', `Bienvenue${userName ? ' ' + userName : ''} ! Connexion en cours…`);
      // Petit délai pour que le toast soit visible
      setTimeout(() => navigate('/home', { replace: true }), 800);
    } catch (e: any) {
      setError(e?.message ?? 'Erreur lors de la définition du mot de passe.');
    } finally {
      setSubmitting(false);
    }
  };

  if (error && !sessionReady) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-bgpage">
        <div className="card p-8 max-w-md text-center">
          <AlertTriangle className="w-10 h-10 mx-auto mb-3 text-error" />
          <h1 className="text-lg font-bold mb-2">Lien invalide ou expiré</h1>
          <p className="text-sm text-primary-500 mb-4">{error}</p>
          <button onClick={() => navigate('/login')} className="btn-primary">
            Aller à la connexion
          </button>
        </div>
      </div>
    );
  }

  if (!sessionReady) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-bgpage">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary-300 border-t-accent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-primary-500">Validation de l'invitation…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-bgpage">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 mb-2">
            <Sparkles className="w-7 h-7 text-accent" />
            <h1 className="text-2xl font-bold text-primary-900 dark:text-primary-50">Cockpit FnA</h1>
          </div>
          <p className="text-sm text-primary-500">Définissez votre mot de passe</p>
        </div>

        <div className="card p-7">
          <div className="flex items-start gap-3 p-3 mb-5 rounded-lg bg-success/5 border border-success/20">
            <CheckCircle2 className="w-4 h-4 text-success shrink-0 mt-0.5" />
            <div className="text-xs text-primary-700 dark:text-primary-200 leading-relaxed">
              <p className="font-semibold mb-0.5">Bienvenue{userName ? ' ' + userName : ''} !</p>
              <p>Pour finaliser votre compte <span className="font-medium">{userEmail}</span>, choisissez un mot de passe sécurisé ci-dessous.</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-[10px] uppercase tracking-wider font-semibold text-primary-500 block mb-1.5">
                Nouveau mot de passe
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-primary-400 pointer-events-none" />
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input !pl-9 !pr-9"
                  placeholder="Minimum 8 caractères"
                  autoFocus
                  minLength={8}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-primary-400 hover:text-primary-700"
                  aria-label={showPwd ? 'Cacher' : 'Afficher'}
                >
                  {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {password && (
                <div className="mt-2">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <div
                        key={n}
                        className={`flex-1 h-1 rounded-full transition-colors ${n <= pwdStrength ? pwdColor : 'bg-primary-200/60'}`}
                      />
                    ))}
                  </div>
                  <p className="text-[10px] text-primary-500 mt-1">{pwdLabel}</p>
                </div>
              )}
            </div>

            <div>
              <label className="text-[10px] uppercase tracking-wider font-semibold text-primary-500 block mb-1.5">
                Confirmer le mot de passe
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-primary-400 pointer-events-none" />
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="input !pl-9"
                  placeholder="Retapez le mot de passe"
                  required
                />
              </div>
              {confirmPassword && password !== confirmPassword && (
                <p className="text-[10px] text-error mt-1">Les mots de passe ne correspondent pas.</p>
              )}
            </div>

            {error && (
              <div className="flex items-start gap-2 p-2.5 rounded-lg bg-error/10 border border-error/30 text-xs text-error">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || password.length < 8 || password !== confirmPassword}
              className="btn-clay w-full"
            >
              {submitting ? 'Validation…' : 'Définir mon mot de passe et continuer →'}
            </button>
          </form>

          <p className="text-[10px] text-primary-400 text-center mt-5 leading-relaxed">
            Conseil : utilisez au moins 12 caractères avec majuscules, chiffres et symboles. Votre mot de passe est haché localement (bcrypt) — Atlas Studio ne le voit jamais.
          </p>
        </div>
      </div>
    </div>
  );
}
