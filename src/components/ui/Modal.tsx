import { ReactNode, useEffect } from 'react';
import { X } from 'lucide-react';

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
};

const sizes: Record<NonNullable<Props['size']>, string> = {
  sm: 'max-w-md',
  md: 'max-w-xl',
  lg: 'max-w-3xl',
  xl: 'max-w-5xl',
};

/**
 * Modal premium — niveau Linear/Stripe.
 *
 * - Backdrop blur fort + tint sombre subtile
 * - Card avec shadow elevated + 1px ring
 * - Animation entrée scale + fade (cubic-bezier spring)
 * - Header avec icône close raffiné
 * - Footer avec divider gradient
 */
export function Modal({ open, onClose, title, subtitle, children, footer, size = 'md' }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
      {/* Backdrop premium : blur fort + tint sombre */}
      <div
        className="absolute inset-0 bg-primary-950/70 backdrop-blur-md"
        onClick={onClose}
      />
      {/* Card avec shadow elevated + entrée animée */}
      <div
        className={`relative w-full ${sizes[size]} bg-surface dark:bg-primary-900 rounded-2xl
                   max-h-[90vh] flex flex-col overflow-hidden animate-scale-in`}
        style={{ boxShadow: '0 24px 60px -12px rgb(0 0 0 / 0.30), 0 0 0 1px rgb(0 0 0 / 0.05)' }}
      >
        {/* Header raffiné */}
        <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4 border-b border-primary-200/60 dark:border-primary-800/60">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-primary-900 dark:text-primary-50 tracking-tight leading-snug">
              {title}
            </h3>
            {subtitle && (
              <p className="text-xs text-primary-500 dark:text-primary-400 mt-0.5 leading-relaxed">
                {subtitle}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="shrink-0 w-8 h-8 -mr-1 -mt-0.5 rounded-lg
                     text-primary-500 hover:text-primary-900 dark:hover:text-primary-100
                     hover:bg-primary-100 dark:hover:bg-primary-800
                     transition-colors duration-150
                     flex items-center justify-center
                     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {/* Body avec scroll-shadow subtle */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {children}
        </div>
        {/* Footer avec divider gradient subtle */}
        {footer && (
          <div className="px-6 py-4 border-t border-primary-200/60 dark:border-primary-800/60
                        bg-primary-50/50 dark:bg-primary-950/30
                        flex items-center justify-end gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
