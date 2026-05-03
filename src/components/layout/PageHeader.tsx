import { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { PillStatus } from '../ui/PillStatus';

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
  /** Eyebrow text (ex: "PILOTAGE", "RAPPORTS") au dessus du titre — premium */
  eyebrow?: string;
  /** Icône facultative à gauche du titre */
  icon?: ReactNode;
  /** Pills de contexte au dessus du titre (Live, Société, Période, Devise…) */
  pills?: Array<{ label: string; value?: string; variant?: 'live' | 'default' | 'accent' | 'success' | 'warning' | 'error'; icon?: ReactNode }>;
  /** Mode "hero" : titre plus grand (3xl) — pour pages d'accueil de dashboards principaux */
  hero?: boolean;
}

/**
 * PageHeader premium — niveau Linear/Vercel/Stripe Dashboard.
 *
 * Améliorations vs version précédente :
 * - Eyebrow uppercase optionnel (ex: "PILOTAGE")
 * - Icône optionnelle dans une pill accent
 * - Typographie raffinée (tracking serré, line-height ajusté)
 * - Divider subtil sous le header avec gradient (au lieu d'un trait dur)
 * - Bouton retour avec micro-interaction (hover slide-left)
 *
 * 100% rétro-compatible — toutes les props existantes sont conservées.
 */
export function PageHeader({ title, subtitle, action, back, eyebrow, icon, pills, hero }: PageHeaderProps) {
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
    <div className="relative mb-6">
      {/* Pills contexte au dessus (Cockpit CR pattern) */}
      {pills && pills.length > 0 && <PillStatus pills={pills} />}
      <div className="flex items-start justify-between gap-4 pb-5">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          {showBack && (
            <button
              type="button"
              onClick={handleBack}
              aria-label="Retour"
              className="group shrink-0 w-9 h-9 rounded-xl border border-primary-200 dark:border-primary-700
                         hover:border-accent hover:text-accent hover:bg-accent/5
                         transition-all duration-150 ease-spring
                         flex items-center justify-center text-primary-500 -ml-1 mt-0.5
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-shell"
            >
              <ArrowLeft className="w-4 h-4 transition-transform duration-150 group-hover:-translate-x-0.5" />
            </button>
          )}
          {icon && (
            <div className="shrink-0 w-11 h-11 rounded-xl bg-accent/10 text-accent flex items-center justify-center mt-0.5">
              {icon}
            </div>
          )}
          <div className="min-w-0">
            {eyebrow && (
              <p className="section-eyebrow mb-1">{eyebrow}</p>
            )}
            <h1 className={hero
              ? 'text-3xl font-semibold text-primary-900 dark:text-primary-50 tracking-tight leading-tight'
              : 'text-xl font-semibold text-primary-900 dark:text-primary-50 tracking-tight leading-snug'}>
              {title}
            </h1>
            {subtitle && (
              <p className={hero
                ? 'text-sm text-primary-500 dark:text-primary-400 mt-2 leading-relaxed max-w-3xl'
                : 'text-xs text-primary-500 dark:text-primary-400 mt-1 leading-relaxed'}>
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {action && <div className="flex items-center gap-2 shrink-0">{action}</div>}
      </div>
      {/* Divider gradient subtil — touche premium signature */}
      <div className="divider-soft" />
    </div>
  );
}
