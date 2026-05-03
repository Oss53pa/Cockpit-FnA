import { ReactNode } from 'react';
import { LucideIcon } from 'lucide-react';

interface Props {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  /** Variante : 'default' (centré sur card) | 'inline' (compact, dans une row) */
  variant?: 'default' | 'inline';
}

/**
 * Empty state premium — niveau Linear/Notion.
 *
 * - Icône dans cercle accent subtle (vs gris terne avant)
 * - Anneau décoratif autour de l'icône (signature visuelle)
 * - Typo refinée (titre semibold + description max-width contraint)
 * - Variant inline pour cas compacts
 */
export function EmptyState({ icon: Icon, title, description, action, className = '', variant = 'default' }: Props) {
  if (variant === 'inline') {
    return (
      <div className={`flex items-center justify-center text-center py-8 px-4 gap-3 ${className}`}>
        {Icon && <Icon className="w-4 h-4 text-primary-400" strokeWidth={1.8} />}
        <div className="flex-1 max-w-md">
          <p className="text-sm font-medium text-primary-700 dark:text-primary-300">{title}</p>
          {description && <p className="text-xs text-primary-500 mt-0.5">{description}</p>}
        </div>
        {action && <div>{action}</div>}
      </div>
    );
  }

  return (
    <div className={`flex flex-col items-center justify-center text-center py-16 px-6 ${className}`}>
      {Icon && (
        <div className="relative mb-5">
          {/* Anneau décoratif extérieur — signature premium */}
          <div className="absolute inset-0 rounded-full bg-accent/5 blur-md" aria-hidden />
          <div className="relative w-14 h-14 rounded-full bg-accent/10
                         flex items-center justify-center
                         border border-accent/20">
            <Icon className="w-6 h-6 text-accent" strokeWidth={1.5} />
          </div>
        </div>
      )}
      <h3 className="text-base font-semibold text-primary-900 dark:text-primary-50 mb-1.5 tracking-tight">{title}</h3>
      {description && (
        <p className="text-sm text-primary-500 dark:text-primary-400 max-w-sm leading-relaxed">{description}</p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
