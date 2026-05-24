// Mémoire de Proph3t — observations + patterns + prédictions par société.
//
// ─── Architecture (post-audit) ─────────────────────────────────────────────
//   Source de vérité : table Supabase `fna_proph3_memory` (RLS par org_id).
//   Données chiffrées AES-GCM côté client avec clé dérivée du user.id Supabase.
//   Cache local : localStorage `proph3t-memory-cache` pour latence (TTL 5 min).
//
//   Multi-device : tous les devices d'un user lisent/écrivent la même ligne
//   Supabase. Synchronisation manuelle (pas realtime) — l'app recharge à
//   l'ouverture et après chaque écriture.
//
//   API publique INCHANGÉE pour ne pas casser les appelants :
//     - getMemory(orgId)         — async, retourne la mémoire (chargée depuis Supabase)
//     - addObservation(...)      — async, persiste vers Supabase + cache
//     - recordSnapshot(...)      — async
//     - predictMetric(...)       — sync (lit le cache déjà chargé)
//     - getInsights(...)         — async (rafraîchit le cache si nécessaire)
//     - clearMemory(orgId)       — async
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { encryptJson, decryptJson } from '../../lib/proph3Crypto';
import { safeLocalStorage } from '../../lib/safeStorage';

export interface Observation {
  date: number;
  category: 'kpi' | 'ratio' | 'alerte' | 'evolution' | 'anomalie' | 'recommandation';
  metric: string;
  value: number;
  context?: string;
  severity?: 'info' | 'warn' | 'critical';
  comment?: string;
}

export interface Memory {
  orgId: string;
  observations: Observation[];
  patterns: { [metric: string]: { trend: 'up' | 'down' | 'stable'; count: number; lastValue: number } };
  predictions: { [metric: string]: { value: number; confidence: number; horizon: string; date: number } };
  lastUpdate: number;
}

const CACHE_KEY = 'proph3t-memory-cache-v2';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_OBSERVATIONS = 500;

interface CacheEntry { mem: Memory; loadedAt: number }
const memCache = new Map<string, CacheEntry>(); // in-memory cache (process)

function emptyMemory(orgId: string): Memory {
  return { orgId, observations: [], patterns: {}, predictions: {}, lastUpdate: 0 };
}

// ─── Cache localStorage (TTL 5 min) ──────────────────────────────────────────
function loadCache(): Record<string, { mem: Memory; loadedAt: number }> {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = safeLocalStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}
function saveCache(data: Record<string, { mem: Memory; loadedAt: number }>) {
  try {
    if (typeof localStorage === 'undefined') return;
    safeLocalStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch { /* quota exceeded — non bloquant */ }
}

// ─── Auth helper : récupère le user.id Supabase pour la clé de chiffrement ──
async function getCryptoKeyId(): Promise<string | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user?.id ?? null;
  } catch { return null; }
}

// ─── Lecture Supabase (avec déchiffrement) ──────────────────────────────────
async function fetchFromSupabase(orgId: string): Promise<Memory | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const { data, error } = await (supabase as any)
      .from('fna_proph3_memory')
      .select('data, data_encrypted, iv')
      .eq('org_id', orgId)
      .maybeSingle();
    if (error || !data) return null;
    // Priorité au chiffré si disponible
    if (data.data_encrypted && data.iv) {
      const userId = await getCryptoKeyId();
      if (userId) {
        try {
          const decrypted = await decryptJson<Memory>(userId, { data_encrypted: data.data_encrypted, iv: data.iv });
          return decrypted;
        } catch (e) {
          console.warn('[proph3 memory] Déchiffrement échoué, fallback données claires:', e);
        }
      }
    }
    // Fallback : données en clair (jsonb) — utile en cas de bascule progressive
    return (data.data as Memory) ?? null;
  } catch (e) {
    console.warn('[proph3 memory] fetch failed:', e);
    return null;
  }
}

// ─── Écriture Supabase (avec chiffrement) ───────────────────────────────────
async function persistToSupabase(orgId: string, mem: Memory): Promise<void> {
  if (!isSupabaseConfigured) return;
  try {
    const userId = await getCryptoKeyId();
    let payload: { org_id: string; data?: any; data_encrypted?: string; iv?: string } = { org_id: orgId };
    if (userId) {
      // Chiffrement côté client
      const enc = await encryptJson(userId, mem);
      payload = { org_id: orgId, data: null, data_encrypted: enc.data_encrypted, iv: enc.iv };
    } else {
      // Fallback non chiffré (utilisateur non authentifié — cas dev local)
      payload = { org_id: orgId, data: mem };
    }
    const { error } = await (supabase as any)
      .from('fna_proph3_memory')
      .upsert(payload, { onConflict: 'org_id' });
    if (error) throw error;
  } catch (e) {
    console.warn('[proph3 memory] persist failed (non bloquant):', e);
  }
}

// ─── API publique ────────────────────────────────────────────────────────────

/**
 * Charge la mémoire depuis Supabase (avec cache 5 min).
 * Synchronisation transparente entre devices.
 */
export async function getMemory(orgId: string): Promise<Memory> {
  // Cache en mémoire (frais)
  const inMem = memCache.get(orgId);
  if (inMem && (Date.now() - inMem.loadedAt) < CACHE_TTL_MS) {
    return inMem.mem;
  }
  // Cache localStorage (entre sessions)
  const lsCache = loadCache();
  const lsEntry = lsCache[orgId];
  if (lsEntry && (Date.now() - lsEntry.loadedAt) < CACHE_TTL_MS) {
    memCache.set(orgId, lsEntry);
    return lsEntry.mem;
  }
  // Fetch Supabase
  const fetched = await fetchFromSupabase(orgId);
  const mem = fetched ?? emptyMemory(orgId);
  const entry = { mem, loadedAt: Date.now() };
  memCache.set(orgId, entry);
  lsCache[orgId] = entry;
  saveCache(lsCache);
  return mem;
}

/** Version SYNCHRONE pour les appelants qui n'attendent pas — lit le cache uniquement. */
export function getMemorySync(orgId: string): Memory {
  return memCache.get(orgId)?.mem ?? loadCache()[orgId]?.mem ?? emptyMemory(orgId);
}

export async function addObservation(orgId: string, obs: Omit<Observation, 'date'>): Promise<void> {
  const mem = await getMemory(orgId);
  mem.observations.push({ ...obs, date: Date.now() });
  if (mem.observations.length > MAX_OBSERVATIONS) {
    mem.observations = mem.observations.slice(-MAX_OBSERVATIONS);
  }
  // Mise à jour des patterns (tendance par métrique)
  const recent = mem.observations.filter((o) => o.metric === obs.metric).slice(-5);
  if (recent.length >= 2) {
    const first = recent[0].value;
    const last = recent[recent.length - 1].value;
    const change = first !== 0 ? ((last - first) / Math.abs(first)) * 100 : 0;
    const trend: 'up' | 'down' | 'stable' = change > 5 ? 'up' : change < -5 ? 'down' : 'stable';
    mem.patterns[obs.metric] = { trend, count: recent.length, lastValue: last };
  }
  mem.lastUpdate = Date.now();
  // Met à jour le cache + persiste vers Supabase
  const entry = { mem, loadedAt: Date.now() };
  memCache.set(orgId, entry);
  const lsCache = loadCache();
  lsCache[orgId] = entry;
  saveCache(lsCache);
  await persistToSupabase(orgId, mem);
}

export async function recordSnapshot(orgId: string, snapshot: {
  ca?: number; ebe?: number; rn?: number; treso?: number; bfr?: number;
  dso?: number; dpo?: number; capPropres?: number; totActif?: number;
  ratiosAlertes?: number;
  context?: string;
}): Promise<void> {
  const ctx = snapshot.context || new Date().toISOString().substring(0, 10);
  const metrics: Record<string, number | undefined> = {
    ca: snapshot.ca, ebe: snapshot.ebe, rn: snapshot.rn,
    treso: snapshot.treso, bfr: snapshot.bfr,
    dso: snapshot.dso, dpo: snapshot.dpo,
    cp: snapshot.capPropres, totActif: snapshot.totActif,
    ratios_alertes: snapshot.ratiosAlertes,
  };
  for (const [metric, value] of Object.entries(metrics)) {
    if (typeof value === 'number' && !isNaN(value)) {
      await addObservation(orgId, { category: 'kpi', metric, value, context: ctx });
    }
  }
}

/**
 * Prédit une métrique à partir des observations en cache.
 * Synchrone : utilise getMemorySync(). Appelez `getMemory()` au préalable
 * si vous voulez forcer un rafraîchissement Supabase.
 */
export function predictMetric(orgId: string, metric: string, horizon = 1): { value: number; confidence: number } | null {
  const mem = getMemorySync(orgId);
  const series = mem.observations.filter((o) => o.metric === metric).slice(-12);
  if (series.length < 3) return null;
  const n = series.length;
  const xs = series.map((_, i) => i);
  const ys = series.map((o) => o.value);
  const xMean = xs.reduce((s, x) => s + x, 0) / n;
  const yMean = ys.reduce((s, y) => s + y, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - xMean) * (ys[i] - yMean);
    den += (xs[i] - xMean) ** 2;
  }
  const slope = den > 0 ? num / den : 0;
  const intercept = yMean - slope * xMean;
  const predicted = intercept + slope * (n - 1 + horizon);
  const ssRes = ys.reduce((s, y, i) => s + (y - (intercept + slope * xs[i])) ** 2, 0);
  const ssTot = ys.reduce((s, y) => s + (y - yMean) ** 2, 0);
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  const confidence = Math.max(0, Math.min(1, r2));
  return { value: predicted, confidence };
}

export interface MemoryInsights {
  patterns: { metric: string; trend: 'up' | 'down' | 'stable'; lastValue: number }[];
  predictions: { metric: string; value: number; confidence: number }[];
  observationCount: number;
}

export async function getInsights(orgId: string): Promise<MemoryInsights> {
  await getMemory(orgId); // s'assure que le cache est à jour
  return getInsightsSync(orgId);
}

/** Version synchrone de getInsights — utilise le cache. À utiliser après un getMemory(). */
export function getInsightsSync(orgId: string): MemoryInsights {
  const mem = getMemorySync(orgId);
  const patterns = Object.entries(mem.patterns).map(([metric, p]) => ({ metric, trend: p.trend, lastValue: p.lastValue }));
  const predictions: { metric: string; value: number; confidence: number }[] = [];
  for (const metric of ['ca', 'ebe', 'rn', 'treso', 'bfr']) {
    const pred = predictMetric(orgId, metric);
    if (pred) predictions.push({ metric, ...pred });
  }
  return { patterns, predictions, observationCount: mem.observations.length };
}

export async function clearMemory(orgId: string): Promise<void> {
  memCache.delete(orgId);
  const lsCache = loadCache();
  delete lsCache[orgId];
  saveCache(lsCache);
  if (isSupabaseConfigured) {
    try {
      await (supabase as any).from('fna_proph3_memory').delete().eq('org_id', orgId);
    } catch (e) {
      console.warn('[proph3 memory] clearMemory Supabase failed:', e);
    }
  }
}
