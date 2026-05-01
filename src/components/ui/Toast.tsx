import { create } from 'zustand';
import { CheckCircle2, AlertCircle, Info, X, AlertTriangle } from 'lucide-react';
import clsx from 'clsx';

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: string;
  variant: ToastVariant;
  title: string;
  description?: string;
}

interface ToastStore {
  toasts: Toast[];
  push: (t: Omit<Toast, 'id'>) => void;
  dismiss: (id: string) => void;
}

const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  push: (t) => {
    const id = Math.random().toString(36).slice(2, 9);
    set((s) => ({ toasts: [...s.toasts, { ...t, id }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) }));
    }, 4500);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));

/** API publique : `toast.success('Saved')`, etc. */
export const toast = {
  success: (title: string, description?: string) => useToastStore.getState().push({ variant: 'success', title, description }),
  error:   (title: string, description?: string) => useToastStore.getState().push({ variant: 'error', title, description }),
  warning: (title: string, description?: string) => useToastStore.getState().push({ variant: 'warning', title, description }),
  info:    (title: string, description?: string) => useToastStore.getState().push({ variant: 'info', title, description }),
};

const ICONS = {
  success: CheckCircle2,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const COLORS = {
  success: 'text-success',
  error: 'text-error',
  warning: 'text-warning',
  info: 'text-info',
};

/** Container — a monter UNE FOIS au niveau App. */
export function ToastContainer() {
  const { toasts, dismiss } = useToastStore();
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => {
        const Icon = ICONS[t.variant];
        return (
          <div
            key={t.id}
            role="alert"
            className={clsx(
              'pointer-events-auto card-glass shadow-lg w-80 max-w-[calc(100vw-3rem)]',
              'flex items-start gap-3 px-4 py-3 animate-fade-in-up',
            )}
          >
            <Icon className={clsx('w-4 h-4 mt-0.5 shrink-0', COLORS[t.variant])} strokeWidth={2} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-primary-900 dark:text-primary-50 leading-snug">{t.title}</p>
              {t.description && (
                <p className="text-xs text-primary-500 mt-0.5 leading-relaxed">{t.description}</p>
              )}
            </div>
            <button
              onClick={() => dismiss(t.id)}
              className="shrink-0 text-primary-400 hover:text-primary-700 dark:hover:text-primary-200 transition-colors"
              aria-label="Fermer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
