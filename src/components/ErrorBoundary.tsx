// Global error boundary — évite qu'un crash d'une page casse l'app entière.
// Cas particulier : "Failed to fetch dynamically imported module" après un
// redéploiement (chunks hashés renommés) — on reload automatiquement pour
// récupérer le nouveau index.html.
import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

type Props = { children: ReactNode };
type State = { error: Error | null; reloading: boolean };

const RELOAD_KEY = 'error-boundary-reload';

function isChunkLoadError(err: unknown): boolean {
  if (!err) return false;
  const msg = err instanceof Error ? err.message : String(err);
  return (
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /Loading chunk [\d]+ failed/i.test(msg) ||
    /Importing a module script failed/i.test(msg) ||
    /ChunkLoadError/i.test(msg)
  );
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, reloading: false };

  static getDerivedStateFromError(error: Error): State {
    // Si c'est un chunk load error et qu'on n'a pas encore tenté de reload
    // dans cette session, on déclenche le reload dans un effet post-render.
    if (isChunkLoadError(error)) {
      const already = typeof sessionStorage !== 'undefined' && sessionStorage.getItem(RELOAD_KEY);
      if (!already) {
        return { error, reloading: true };
      }
    }
    return { error, reloading: false };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  componentDidUpdate() {
    if (this.state.reloading) {
      try { sessionStorage.setItem(RELOAD_KEY, '1'); } catch { /* ignore */ }
      window.location.reload();
    }
  }

  handleReset = () => this.setState({ error: null, reloading: false });
  handleReload = () => {
    try { sessionStorage.removeItem(RELOAD_KEY); } catch { /* ignore */ }
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;

    // Si on est en train de recharger, on affiche juste un placeholder sobre
    if (this.state.reloading) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-primary-50 dark:bg-primary-950">
          <div className="flex items-center gap-3 text-primary-500 text-sm">
            <RefreshCw className="w-4 h-4 animate-spin" />
            Mise à jour de l'application…
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-primary-50 dark:bg-primary-950">
        <div className="max-w-lg w-full bg-white dark:bg-primary-900 border border-primary-200 dark:border-primary-800 rounded-xl shadow-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-error/15 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-error" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-primary-900 dark:text-primary-100">Une erreur est survenue</h2>
              <p className="text-xs text-primary-500">L'application a rencontré un problème inattendu.</p>
            </div>
          </div>
          <pre className="text-[11px] bg-primary-100 dark:bg-primary-800/50 text-primary-700 dark:text-primary-200 p-3 rounded-lg overflow-x-auto max-h-48 mb-4 whitespace-pre-wrap break-words">
            {this.state.error.message}
          </pre>
          <div className="flex gap-2 justify-end">
            <button
              onClick={this.handleReset}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-primary-100 dark:bg-primary-800 hover:bg-primary-200 dark:hover:bg-primary-700 text-primary-900 dark:text-primary-100"
            >
              Réessayer
            </button>
            <button
              onClick={this.handleReload}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-primary-900 dark:bg-primary-100 text-primary-50 dark:text-primary-900 hover:opacity-90"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Recharger la page
            </button>
          </div>
        </div>
      </div>
    );
  }
}
