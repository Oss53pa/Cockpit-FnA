// Wrapper autour de React.lazy qui gère le cas "nouveau deploy = chunks renommés".
// Quand Vite/Vercel publient une nouvelle version, les fichiers hashés de
// l'ancienne version disparaissent. Un onglet resté ouvert déclenche alors
// "Failed to fetch dynamically imported module" au moment de naviguer vers
// une route lazy. On intercepte l'erreur, on recharge la page une fois (guard
// via sessionStorage pour éviter une boucle si l'erreur est persistante).
import { lazy, ComponentType } from 'react';

const RELOAD_KEY = 'lazy-retry-reload';

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

export function lazyWithRetry<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>
): ReturnType<typeof lazy<T>> {
  return lazy(async () => {
    try {
      const mod = await factory();
      // Chargement OK : on retire la garde si elle existait
      sessionStorage.removeItem(RELOAD_KEY);
      return mod;
    } catch (err) {
      if (isChunkLoadError(err)) {
        const alreadyReloaded = sessionStorage.getItem(RELOAD_KEY);
        if (!alreadyReloaded) {
          sessionStorage.setItem(RELOAD_KEY, '1');
          // On force un reload "hard" pour récupérer le nouvel index.html
          window.location.reload();
          // Promise qui ne résout jamais — le reload prend le relais
          return new Promise<{ default: T }>(() => {});
        }
      }
      throw err;
    }
  });
}
