/**
 * CachedProvider — proxy de cache + déduplication par-dessus le DataProvider.
 *
 * Pourquoi : sur les pages avec plusieurs composants qui appellent
 * `getGLEntries(orgId)` (Home, Bilan, CR, SIG, Ratios, Dashboards…), chaque
 * hook fait son propre fetch paginé. 8 round trips × N composants × N renders
 * = lent. Ce wrapper :
 *
 *   1. **Déduplication** : si une requête est déjà in-flight pour la même clé,
 *      tous les appelants attendent la MÊME promesse. Aucun appel réseau dupliqué.
 *   2. **Cache TTL** : les résultats sont conservés en mémoire pendant 30s.
 *      Naviguer entre pages réutilise le cache. Au-delà de 30s, refresh.
 *   3. **Invalidation explicite** : `invalidateCache(prefix?)` purge les clés
 *      qui matchent (ex: invalidateCache('gl:') après un import).
 *
 * Le cache est en mémoire (Map JS), perdu au reload. Pas de localStorage
 * (trop volumineux pour 8000+ entries × N tables).
 *
 * Scope : on cache UNIQUEMENT les méthodes de lecture lourdes les plus
 * appelées. Les écritures (upsert, insert, delete) invalident automatiquement
 * leur cache correspondant.
 */
import type { DataProvider, GLFilter } from './provider';
import type {
  Organization, FiscalYear, Period, Account, GLEntry, ImportLog,
} from './schema';

const TTL_MS = 30_000;

type CacheEntry<T> = { value: T; expiresAt: number };

const cache = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

function getCached<T>(key: string): T | undefined {
  const e = cache.get(key) as CacheEntry<T> | undefined;
  if (!e) return undefined;
  if (Date.now() > e.expiresAt) {
    cache.delete(key);
    return undefined;
  }
  return e.value;
}

function setCached<T>(key: string, value: T): void {
  cache.set(key, { value, expiresAt: Date.now() + TTL_MS });
}

/**
 * Wrap a fetch function with cache + deduplication.
 * Si une promesse est en cours pour la même clé, on l'attache. Sinon on
 * lance, on stocke en in-flight, puis en cache.
 */
async function memoized<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const cached = getCached<T>(key);
  if (cached !== undefined) return cached;
  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const promise = (async () => {
    try {
      const res = await fetcher();
      setCached(key, res);
      return res;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, promise);
  return promise;
}

/**
 * Invalide les clés du cache. Sans argument : purge tout.
 * Avec un préfixe : purge les clés qui commencent par ce préfixe.
 *
 * Exemples :
 *   invalidateCache()              // tout
 *   invalidateCache('gl:')         // toutes les entrées GL
 *   invalidateCache('gl:org-123')  // GL d'une org spécifique
 */
export function invalidateCache(prefix?: string): void {
  if (!prefix) {
    cache.clear();
    inflight.clear();
    return;
  }
  for (const key of Array.from(cache.keys())) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
  for (const key of Array.from(inflight.keys())) {
    if (key.startsWith(prefix)) inflight.delete(key);
  }
}

/**
 * Construit la clé de cache pour getGLEntries — inclut tous les filtres
 * car ils changent le résultat.
 */
function glKey(filter: GLFilter): string {
  return `gl:${filter.orgId}:${filter.periodId ?? ''}:${filter.importId ?? ''}:${filter.account ?? ''}:${filter.fromDate ?? ''}:${filter.toDate ?? ''}`;
}

/**
 * Décore un DataProvider avec cache + déduplication sur les lectures
 * lourdes. Les écritures restent telles quelles, mais elles invalident
 * automatiquement le cache concerné.
 */
export function withCache(inner: DataProvider): DataProvider {
  return new Proxy(inner, {
    get(target, prop, receiver) {
      const original = Reflect.get(target, prop, receiver);
      if (typeof original !== 'function') return original;

      // ── Lectures cachées ───────────────────────────────────────────
      if (prop === 'getGLEntries') {
        return (filter: GLFilter): Promise<GLEntry[]> =>
          memoized(glKey(filter), () => original.call(target, filter));
      }
      if (prop === 'getOrganizations') {
        return (): Promise<Organization[]> =>
          memoized('orgs:all', () => original.call(target));
      }
      if (prop === 'getOrganization') {
        return (id: string): Promise<Organization | undefined> =>
          memoized(`org:${id}`, () => original.call(target, id));
      }
      if (prop === 'getFiscalYears') {
        return (orgId: string): Promise<FiscalYear[]> =>
          memoized(`fy:${orgId}`, () => original.call(target, orgId));
      }
      if (prop === 'getPeriods') {
        return (orgId: string): Promise<Period[]> =>
          memoized(`periods:${orgId}`, () => original.call(target, orgId));
      }
      if (prop === 'getAccounts') {
        return (orgId: string): Promise<Account[]> =>
          memoized(`accounts:${orgId}`, () => original.call(target, orgId));
      }
      if (prop === 'getImports') {
        return (orgId: string): Promise<ImportLog[]> =>
          memoized(`imports:${orgId}`, () => original.call(target, orgId));
      }

      // ── Écritures : invalider le cache concerné après ──────────────
      if (
        prop === 'bulkInsertGL' || prop === 'bulkUpsertGL' ||
        prop === 'updateGLEntry' || prop === 'deleteGLByImport'
      ) {
        return async (...args: unknown[]) => {
          const result = await original.apply(target, args);
          invalidateCache('gl:');
          return result;
        };
      }
      if (
        prop === 'upsertOrganization' || prop === 'deleteOrganization' ||
        prop === 'deleteOrganizationCascade'
      ) {
        return async (...args: unknown[]) => {
          const result = await original.apply(target, args);
          invalidateCache('orgs:');
          invalidateCache('org:');
          return result;
        };
      }
      if (prop === 'upsertFiscalYear' || prop === 'bulkUpsertFiscalYears' || prop === 'deleteFiscalYearCascade') {
        return async (...args: unknown[]) => {
          const result = await original.apply(target, args);
          invalidateCache('fy:');
          invalidateCache('periods:');
          invalidateCache('gl:');
          return result;
        };
      }
      if (prop === 'upsertPeriod' || prop === 'bulkUpsertPeriods') {
        return async (...args: unknown[]) => {
          const result = await original.apply(target, args);
          invalidateCache('periods:');
          return result;
        };
      }
      if (
        prop === 'upsertAccount' || prop === 'bulkUpsertAccounts' ||
        prop === 'deleteAccount' || prop === 'deleteAccounts'
      ) {
        return async (...args: unknown[]) => {
          const result = await original.apply(target, args);
          invalidateCache('accounts:');
          return result;
        };
      }
      if (prop === 'addImport' || prop === 'deleteImport' || prop === 'deleteImportsByKind') {
        return async (...args: unknown[]) => {
          const result = await original.apply(target, args);
          invalidateCache('imports:');
          invalidateCache('gl:'); // delete cascade GL
          return result;
        };
      }
      // (D-01) Import GL Tiers atomique (RPC) : ajoute un import + enrichit le GL
      // + écrit les lignes non rapprochées → invalider GL ET imports, sinon les
      // dashboards lisent le cache GL périmé juste après l'import.
      if (prop === 'importTiersAtomic') {
        return async (...args: unknown[]) => {
          const result = await original.apply(target, args);
          invalidateCache('gl:');
          invalidateCache('imports:');
          return result;
        };
      }
      // (D-01) Clôture / réouverture d'exercice : bascule `closed` sur l'exercice
      // ET ses périodes → invalider fy + periods (le verrou de période en dépend).
      if (prop === 'setFiscalYearClosed') {
        return async (...args: unknown[]) => {
          const result = await original.apply(target, args);
          invalidateCache('fy:');
          invalidateCache('periods:');
          return result;
        };
      }

      // Tout le reste : passthrough
      return original.bind(target);
    },
  });
}
