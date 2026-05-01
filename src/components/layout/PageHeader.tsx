import { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  /**
   * Bouton retour : `false` pour le désactiver, une string pour une URL ciblée,
   * `true` pour `navigate(-1)`. Par défaut, auto-détection : retour à /dashboards
   * pour toute route /dashboard/*.
   */
  back?: string | boolean;
}

export function PageHeader({ title, subtitle, action, back }: PageHeaderProps) {
  const navigate = useNavigate();
  const loc = useLocation();

  // Auto-détection : si on est sur /dashboard/* (sauf /dashboards et /dashboard/home),
  // on affiche le bouton retour vers le catalogue.
  const isDashboardSubpage = loc.pathname.startsWith('/dashboard/') && loc.pathname !== '/dashboard/home';
  const showBack = back === false ? false : (back !== undefined ? true : isDashboardSubpage);
  const backTarget = typeof back === 'string' ? back : (isDashboardSubpage ? '/dashboards' : null);

  const handleBack = () => {
    if (backTarget) navigate(backTarget);
    else navigate(-1);
  };

  return (
    <div className="flex items-center justify-between mb-6 pb-4 border-b border-primary-200/60 dark:border-primary-800">
      <div className="flex items-center gap-3 min-w-0">
        {showBack && (
          <button
            type="button"
            onClick={handleBack}
            aria-label="Retour"
            className="shrink-0 w-9 h-9 rounded-xl border border-primary-200 dark:border-primary-700 hover:border-accent hover:text-accent hover:bg-accent/5 transition-all flex items-center justify-center text-primary-500 -ml-1"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
        )}
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-primary-900 dark:text-primary-100 tracking-tight truncate">{title}</h1>
          {subtitle && <p className="text-xs text-primary-400 mt-0.5 truncate">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="flex items-center gap-2 shrink-0">{action}</div>}
    </div>
  );
}
