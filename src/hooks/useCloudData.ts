/**
 * useCloudData — remplace `useLiveQuery` de Dexie par un fetch async/await
 * sur le DataProvider (Supabase obligatoire).
 *
 * Différences avec useLiveQuery :
 *   - Pas de réactivité automatique sur les écritures Dexie (puisqu'il n'y a
 *     plus de Dexie). À la place : un mécanisme manuel d'invalidation via
 *     `invalidateCloudData(tag)` qui force tous les hooks portant ce tag à se
 *     rafraîchir.
 *   - Renvoie { data, loading, error, refresh } au lieu de juste les données.
 *
 * Usage :
 *   const { data: orgs, loading } = useCloudData(
 *     () => dataProvider.getOrganizations(),
 *     [],
 *     { tag: 'organizations' },
 *   );
 *
 *   // Après un upsert :
 *   await dataProvider.upsertOrganization(org);
 *   invalidateCloudData('organizations');
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { invalidateCache } from '../db/cachedProvider';

// ── Bus d'invalidation simple (pas de dépendance externe) ─────────────
type Listener = () => void;
const listeners = new Map<string, Set<Listener>>();

function subscribe(tag: string, fn: Listener): () => void {
  let set = listeners.get(tag);
  if (!set) { set = new Set(); listeners.set(tag, set); }
  set.add(fn);
  return () => set!.delete(fn);
}

/**
 * Map tags utilisés par les hooks → préfixes du cache provider.
 * Permet à `invalidateCloudData('gl')` de purger aussi le cache du provider
 * (sinon le hook se relance mais récupère la même donnée en cache).
 */
const TAG_TO_CACHE_PREFIX: Record<string, string> = {
  gl: 'gl:',
  organizations: 'orgs:',
  fiscalYears: 'fy:',
  periods: 'periods:',
  accounts: 'accounts:',
  imports: 'imports:',
};

/** Force tous les hooks abonnés à `tag` à se rafraîchir immédiatement.
 *  Purge aussi le cache du provider pour ce tag (si mapping connu). */
export function invalidateCloudData(tag: string): void {
  // Purger le cache provider AVANT de notifier les hooks (sinon les hooks
  // récupèrent la version cachée au lieu de re-fetcher)
  const prefix = TAG_TO_CACHE_PREFIX[tag];
  if (prefix) invalidateCache(prefix);
  const set = listeners.get(tag);
  if (set) for (const fn of set) fn();
}

/** Invalide tous les tags listés (utile après un import multi-table). */
export function invalidateMany(tags: string[]): void {
  for (const t of tags) invalidateCloudData(t);
}

/**
 * Invalide TOUS les hooks useCloudData enregistrés, indépendamment de leur tag.
 * Cas d'usage : changement d'organisation courante, changement d'utilisateur,
 * sortie du mode démo — toutes les données affichées doivent être rechargées.
 *
 * Préférable à `window.location.reload()` qui perd l'état UI / formulaires.
 */
export function invalidateAllCloudData(): void {
  // Purger tout le cache provider d'abord
  invalidateCache();
  for (const set of listeners.values()) {
    for (const fn of set) fn();
  }
}

// ── Hook principal ────────────────────────────────────────────────────
export interface CloudDataOptions {
  /** Tag d'invalidation. Si fourni, le hook se rafraîchit quand
   *  invalidateCloudData(tag) est appelé. */
  tag?: string | string[];
  /** Valeur initiale avant le premier fetch (évite undefined dans le render). */
  initial?: any;
}

export interface CloudDataResult<T> {
  data: T;
  loading: boolean;
  error: Error | null;
  refresh: () => void;
}

export function useCloudData<T>(
  fetcher: () => Promise<T>,
  deps: ReadonlyArray<unknown>,
  opts: CloudDataOptions & { initial: T },
): CloudDataResult<T>;
export function useCloudData<T>(
  fetcher: () => Promise<T>,
  deps: ReadonlyArray<unknown>,
  opts?: CloudDataOptions,
): CloudDataResult<T | undefined>;
export function useCloudData<T>(
  fetcher: () => Promise<T>,
  deps: ReadonlyArray<unknown>,
  opts: CloudDataOptions = {},
): CloudDataResult<T | undefined> {
  const [data, setData] = useState<T | undefined>(opts.initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetcherRef.current();
      setData(result);
    } catch (e: any) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-fetch quand deps changent
  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  // Abonnement aux invalidations
  useEffect(() => {
    if (!opts.tag) return;
    const tags = Array.isArray(opts.tag) ? opts.tag : [opts.tag];
    const unsubs = tags.map((t) => subscribe(t, run));
    return () => { for (const u of unsubs) u(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Array.isArray(opts.tag) ? opts.tag.join(',') : opts.tag]);

  return { data, loading, error, refresh: run };
}
