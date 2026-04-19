import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { UserPlus, Mail, Lock, Building2, Sparkles } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

export default function Register() {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [orgName, setOrgName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) { setError('Le mot de passe doit contenir au moins 8 caractères'); return; }
    setError('');
    setLoading(true);
    try {
      await signUp(email, password, orgName);
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || "Erreur lors de l'inscription");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-100 to-primary-200 dark:from-primary-950 dark:to-primary-900 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-2">
            <Sparkles className="w-8 h-8 text-primary-700 dark:text-primary-300" />
            <h1 className="text-2xl font-bold text-primary-900 dark:text-primary-100">Cockpit FnA</h1>
          </div>
          <p className="text-sm text-primary-500">Cr&eacute;er votre espace de pilotage</p>
        </div>

        <div className="card p-8">
          <h2 className="text-lg font-semibold mb-6 text-center">Inscription</h2>

          {success ? (
            <div className="text-center py-4">
              <Mail className="w-10 h-10 mx-auto mb-3 text-success" />
              <p className="font-medium mb-1">Inscription r&eacute;ussie !</p>
              <p className="text-sm text-primary-500 mb-4">
                Un email de confirmation a &eacute;t&eacute; envoy&eacute; &agrave; <strong>{email}</strong>.
                Cliquez sur le lien pour activer votre compte.
              </p>
              <Link to="/login" className="btn-primary">Retour &agrave; la connexion</Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-medium text-primary-600 dark:text-primary-400 mb-1 block">Nom de l&apos;entreprise</label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-400" />
                  <input type="text" value={orgName} onChange={e => setOrgName(e.target.value)}
                    className="input pl-10" placeholder="Ma Soci&eacute;t&eacute; SA" required />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-primary-600 dark:text-primary-400 mb-1 block">Email professionnel</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-400" />
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                    className="input pl-10" placeholder="vous@entreprise.com" required />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-primary-600 dark:text-primary-400 mb-1 block">Mot de passe</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-400" />
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                    className="input pl-10" placeholder="8 caract&egrave;res minimum" required minLength={8} />
                </div>
              </div>

              {error && <p className="text-xs text-error">{error}</p>}

              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading ? (
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <><UserPlus className="w-4 h-4" /> Cr&eacute;er mon compte</>
                )}
              </button>

              <p className="text-center text-xs text-primary-500 pt-2">
                D&eacute;j&agrave; un compte ? <Link to="/login" className="font-medium hover:underline">Se connecter</Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
