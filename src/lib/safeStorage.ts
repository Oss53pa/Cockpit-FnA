/**
 * safeStorage.ts — wrapper try/catch sur localStorage / sessionStorage.
 *
 * Pourquoi ? Sur Safari iOS / Firefox en navigation privée / quota plein,
 * `localStorage.setItem` throw `QuotaExceededError` ou `SecurityError` —
 * crash le store Zustand au démarrage. Ce wrapper garantit que l'app
 * continue de fonctionner en mode dégradé (mémoire only).
 */

const inMemoryFallback = new Map<string, string>();

function isAvailable(storage: 'local' | 'session'): boolean {
  try {
    const s = storage === 'local' ? window.localStorage : window.sessionStorage;
    const k = `__test__${Math.random()}`;
    s.setItem(k, '1');
    s.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

export const safeLocalStorage = {
  /**
   * Lit une clé du localStorage. Fallback in-memory si indisponible.
   * @returns la valeur stockée, ou null si absente.
   */
  getItem(key: string): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return inMemoryFallback.get(key) ?? null;
    }
  },

  /**
   * Écrit une clé. Si localStorage est plein/indisponible, fallback in-memory.
   * Ne throw jamais. Retourne `true` si écrit, `false` si fallback uniquement.
   */
  setItem(key: string, value: string): boolean {
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch {
      inMemoryFallback.set(key, value);
      return false;
    }
  },

  /**
   * Supprime une clé. Ne throw jamais.
   */
  removeItem(key: string): void {
    try {
      window.localStorage.removeItem(key);
    } catch { /* ignore */ }
    inMemoryFallback.delete(key);
  },

  /**
   * Parse JSON avec fallback. Ne throw jamais.
   * @param fallback la valeur par défaut si la clé est absente ou malformée.
   */
  getJSON<T>(key: string, fallback: T): T {
    const raw = this.getItem(key);
    if (raw === null) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  },

  /**
   * Sérialise et écrit un objet. Ne throw jamais.
   */
  setJSON(key: string, value: unknown): boolean {
    try {
      return this.setItem(key, JSON.stringify(value));
    } catch {
      return false;
    }
  },

  /**
   * @returns `true` si localStorage est utilisable nativement.
   */
  isAvailable(): boolean {
    return isAvailable('local');
  },
};

export const safeSessionStorage = {
  getItem(key: string): string | null {
    try {
      return window.sessionStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string): boolean {
    try {
      window.sessionStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  },
  removeItem(key: string): void {
    try {
      window.sessionStorage.removeItem(key);
    } catch { /* ignore */ }
  },
  getJSON<T>(key: string, fallback: T): T {
    const raw = this.getItem(key);
    if (raw === null) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  },
  setJSON(key: string, value: unknown): boolean {
    try {
      return this.setItem(key, JSON.stringify(value));
    } catch {
      return false;
    }
  },
  isAvailable(): boolean {
    return isAvailable('session');
  },
};
