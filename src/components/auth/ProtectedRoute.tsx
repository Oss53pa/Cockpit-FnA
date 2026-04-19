import { Navigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading, isLocalMode } = useAuth();

  // Mode local : pas d'auth, accès direct
  if (isLocalMode) return <>{children}</>;

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
