import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowLeft, Sparkles } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

export default function ForgotPassword() {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await resetPassword(email);
      setSent(true);
    } catch (err: any) {
      setError(err.message || 'Erreur');
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
        </div>

        <div className="card p-8">
          <h2 className="text-lg font-semibold mb-6 text-center">Mot de passe oubli&eacute;</h2>

          {sent ? (
            <div className="text-center py-4">
              <Mail className="w-10 h-10 mx-auto mb-3 text-primary-500" />
              <p className="font-medium mb-1">Email envoy&eacute; !</p>
              <p className="text-sm text-primary-500 mb-4">
                Si un compte existe pour <strong>{email}</strong>, vous recevrez un lien de r&eacute;initialisation.
              </p>
              <Link to="/login" className="btn-primary"><ArrowLeft className="w-4 h-4" /> Retour</Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-sm text-primary-500">
                Entrez votre adresse email pour recevoir un lien de r&eacute;initialisation.
              </p>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-400" />
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  className="input pl-10" placeholder="vous@entreprise.com" required />
              </div>
              {error && <p className="text-xs text-error">{error}</p>}
              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Envoyer le lien'}
              </button>
              <p className="text-center text-xs text-primary-500">
                <Link to="/login" className="hover:underline"><ArrowLeft className="w-3 h-3 inline" /> Retour &agrave; la connexion</Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
