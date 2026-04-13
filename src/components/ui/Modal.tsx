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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-primary-950/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className={`relative w-full ${sizes[size]} bg-primary-50 dark:bg-primary-900 rounded-xl border border-primary-200 dark:border-primary-800 shadow-2xl max-h-[90vh] flex flex-col`}>
        <div className="flex items-start justify-between px-5 py-4 border-b border-primary-200 dark:border-primary-800">
          <div>
            <h3 className="font-semibold text-primary-900 dark:text-primary-100">{title}</h3>
            {subtitle && <p className="text-xs text-primary-500 mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="btn-ghost !p-1.5">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="px-5 py-3 border-t border-primary-200 dark:border-primary-800 flex justify-end gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
