/**
 * AdminGate — verrou par mot de passe pour les pages sensibles (Settings).
 *
 * 3 états :
 *  1. Aucun mot de passe configuré → prompt de setup initial
 *  2. Mot de passe configuré, session expirée → prompt de déverrouillage
 *  3. Session active → render children
 */
import { useState, useEffect } from 'react';
import { Lock, Shield, KeyRound, AlertTriangle } from 'lucide-react';
import { isAdminPasswordSet, isAdminUnlocked, setAdminPassword, unlockAdmin, refreshAdminSession } from '../../lib/adminAuth';
import { toast } from '../ui/Toast';

export function AdminGate({ children }: { children: React.ReactNode }) {
  const [unlocked, setUnlocked] = useState(false);
  const [hasPassword, setHasPassword] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setHasPassword(isAdminPasswordSet());
    setUnlocked(isAdminUnlocked());
    setLoading(false);
    // Toutes les minutes, vérifie la session — si expirée, re-lock
    const interval = setInterval(() => {
      const stillUnlocked = isAdminUnlocked();
      if (!stillUnlocked && unlocked) setUnlocked(false);
    }, 60_000);
    return () => clearInterval(interval);
  }, [unlocked]);

  // Renouvelle la session sur chaque action
  useEffect(() => {
    if (!unlocked) return;
    const refresh = () => refreshAdminSession();
    window.addEventListener('click', refresh);
    window.addEventListener('keydown', refresh);
    return () => {
      window.removeEventListener('click', refresh);
      window.removeEventListener('keydown', refresh);
    };
  }, [unlocked]);

  if (loading) return null;
  if (unlocked) return <>{children}</>;

  return hasPassword
    ? <UnlockPrompt onUnlock={() => setUnlocked(true)} />
    : <SetupPrompt onComplete={() => { setHasPassword(true); setUnlocked(true); }} />;
}

function SetupPrompt({ onComplete }: { onComplete: () => void }) {
  const [pwd, setPwd] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (pwd.length < 4) { toast.warning('Trop court', 'Minimum 4 caractères.'); return; }
    if (pwd !== confirm) { toast.warning('Incohérent', 'Les deux mots de passe doivent être identiques.'); return; }
    setSubmitting(true);
    try {
      await setAdminPassword(pwd);
      toast.success('Mot de passe admin configuré', 'Le module Settings est maintenant verrouillé.');
      onComplete();
    } catch (e: any) {
      toast.error('Erreur', e?.message ?? 'Configuration impossible.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-md mx-auto py-12">
      <div className="card-hero p-6 text-center mb-4">
        <Shield className="w-12 h-12 mx-auto mb-3 text-primary-50" />
        <h2 className="text-xl font-bold text-primary-50 mb-2">Première configuration</h2>
        <p className="text-sm text-primary-300">Définissez un mot de passe administrateur pour protéger le module Settings.</p>
      </div>
      <div className="card p-5 space-y-3">
        <div>
          <label className="text-[11px] uppercase tracking-wider text-primary-500 font-semibold block mb-1">Mot de passe admin</label>
          <input type="password" className="input" value={pwd} onChange={(e) => setPwd(e.target.value)} placeholder="Au moins 4 caractères" autoFocus />
        </div>
        <div>
          <label className="text-[11px] uppercase tracking-wider text-primary-500 font-semibold block mb-1">Confirmation</label>
          <input type="password" className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} placeholder="Retapez le mot de passe" />
        </div>
        <div className="flex items-start gap-2 p-3 rounded-lg bg-warning/5 border border-warning/20 text-xs">
          <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
          <p className="text-primary-700 dark:text-primary-300 leading-relaxed">
            <strong>Important</strong> : ce mot de passe est stocké de manière chiffrée (SHA-256) dans votre navigateur. Il ne peut pas être récupéré en cas d'oubli — vous devrez réinitialiser tous les paramètres.
          </p>
        </div>
        <button className="btn-primary w-full" onClick={submit} disabled={submitting || !pwd || !confirm}>
          <Lock className="w-4 h-4" /> {submitting ? 'Configuration…' : 'Configurer et déverrouiller'}
        </button>
      </div>
    </div>
  );
}

function UnlockPrompt({ onUnlock }: { onUnlock: () => void }) {
  const [pwd, setPwd] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [attempts, setAttempts] = useState(0);

  const submit = async () => {
    if (!pwd) return;
    setSubmitting(true);
    try {
      const ok = await unlockAdmin(pwd);
      if (ok) {
        toast.success('Accès autorisé', 'Session admin active 30 min.');
        onUnlock();
      } else {
        setAttempts((a) => a + 1);
        toast.error('Mot de passe incorrect', `Tentative ${attempts + 1}/5`);
        setPwd('');
        if (attempts + 1 >= 5) {
          toast.warning('Trop d\'échecs', 'Réessayez dans une minute.');
          setTimeout(() => setAttempts(0), 60_000);
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-md mx-auto py-12">
      <div className="card-hero p-6 text-center mb-4">
        <Lock className="w-12 h-12 mx-auto mb-3 text-primary-50" />
        <h2 className="text-xl font-bold text-primary-50 mb-2">Module verrouillé</h2>
        <p className="text-sm text-primary-300">Saisissez le mot de passe administrateur pour accéder à Settings.</p>
      </div>
      <div className="card p-5 space-y-3">
        <div>
          <label className="text-[11px] uppercase tracking-wider text-primary-500 font-semibold block mb-1">Mot de passe administrateur</label>
          <input type="password" className="input" value={pwd} onChange={(e) => setPwd(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} placeholder="••••••••" autoFocus disabled={attempts >= 5} />
        </div>
        <button className="btn-primary w-full" onClick={submit} disabled={submitting || !pwd || attempts >= 5}>
          <KeyRound className="w-4 h-4" /> {submitting ? 'Vérification…' : 'Déverrouiller'}
        </button>
        <p className="text-[11px] text-primary-400 text-center pt-2 border-t border-primary-200 dark:border-primary-800">
          Mot de passe oublié ? <a href="#" onClick={(e) => { e.preventDefault(); if (confirm('Réinitialiser le mot de passe admin effacera aussi tous les paramètres locaux. Continuer ?')) { localStorage.clear(); window.location.reload(); } }} className="text-accent underline">Réinitialiser (factory reset)</a>
        </p>
      </div>
    </div>
  );
}
