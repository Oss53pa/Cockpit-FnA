import { Navigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

// Bypass d'accès temporaire (le temps de finaliser la migration Supabase).
// Activé via le bouton bouclier discret du footer Landing.
function isAccessBypassed(): boolean {
  try { return localStorage.getItem('app-bypass') === '1'; } catch { return false; }
}

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading, isLocalMode } = useAuth();

  // Mode local : pas d'auth, accès direct
  if (isLocalMode) return <>{children}</>;

  // Bypass temporaire (clic sur l'icône bouclier de la Landing)
  if (isAccessBypassed()) return <>{children}</>;

  // Chargement de la session
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-primary-50 dark:bg-primary-950">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary-300 border-t-primary-700 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-primary-500">Chargement...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
