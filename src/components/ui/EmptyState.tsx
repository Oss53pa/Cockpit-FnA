import { ReactNode } from 'react';
import { LucideIcon } from 'lucide-react';

interface Props {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

/**
 * Empty state premium — icone + titre + description + CTA optionnel.
 * Remplace les "Aucune donnee" basiques.
 */
export function EmptyState({ icon: Icon, title, description, action, className = '' }: Props) {
  return (
    <div className={`flex flex-col items-center justify-center text-center py-16 px-6 ${className}`}>
      {Icon && (
        <div className="w-12 h-12 rounded-full bg-primary-100 dark:bg-primary-800 flex items-center justify-center mb-4">
          <Icon className="w-5 h-5 text-primary-500" strokeWidth={1.5} />
        </div>
      )}
      <h3 className="text-base font-semibold text-primary-900 dark:text-primary-50 mb-1.5">{title}</h3>
      {description && (
        <p className="text-sm text-primary-500 max-w-sm leading-relaxed">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
