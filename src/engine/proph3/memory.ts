// Mémoire de Proph3t — apprentissage permanent à partir des observations sur
// l'entreprise. Stockée localement (localStorage) pour persistance entre sessions.
// Format : observations datées, agrégées par société.

export interface Observation {
  date: number;          // timestamp
  category: 'kpi' | 'ratio' | 'alerte' | 'evolution' | 'anomalie' | 'recommandation';
  metric: string;        // ex: "marge_nette", "dso", "treso_nette"
  value: number;
  context?: string;      // ex: "Janvier 2026", "Trimestre 1"
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

const STORAGE_KEY = 'proph3t-memory';
const MAX_OBSERVATIONS = 500;

function loadAll(): Record<string, Memory> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveAll(data: Record<string, Memory>) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch { /* ignore */ }
}

export function getMemory(orgId: string): Memory {
  const all = loadAll();
  if (!all[orgId]) {
    all[orgId] = { orgId, observations: [], patterns: {}, predictions: {}, lastUpdate: 0 };
  }
  return all[orgId];
}

export function addObservation(orgId: string, obs: Omit<Observation, 'date'>) {
  const all = loadAll();
  const mem = all[orgId] || { orgId, observations: [], patterns: {}, predictions: {}, lastUpdate: 0 };
  mem.observations.push({ ...obs, date: Date.now() });
  // Garder uniquement les MAX_OBSERVATIONS plus récentes
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
  all[orgId] = mem;
  saveAll(all);
}

export function recordSnapshot(orgId: string, snapshot: {
  ca?: number; ebe?: number; rn?: number; treso?: number; bfr?: number;
  dso?: number; dpo?: number; capPropres?: number; totActif?: number;
  ratiosAlertes?: number;
  context?: string;
}) {
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
      addObservation(orgId, { category: 'kpi', metric, value, context: ctx });
    }
  }
}

export function predictMetric(orgId: string, metric: string, horizon = 1): { value: number; confidence: number } | null {
  const mem = getMemory(orgId);
  const series = mem.observations.filter((o) => o.metric === metric).slice(-12);
  if (series.length < 3) return null;
  // Régression linéaire simple sur les n derniers points
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
  // Confiance basée sur la variance (R²)
  const ssRes = ys.reduce((s, y, i) => s + (y - (intercept + slope * xs[i])) ** 2, 0);
  const ssTot = ys.reduce((s, y) => s + (y - yMean) ** 2, 0);
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  const confidence = Math.max(0, Math.min(1, r2));
  return { value: predicted, confidence };
}

export function getInsights(orgId: string): {
  patterns: { metric: string; trend: 'up' | 'down' | 'stable'; lastValue: number }[];
  predictions: { metric: string; value: number; confidence: number }[];
  observationCount: number;
} {
  const mem = getMemory(orgId);
  const patterns = Object.entries(mem.patterns).map(([metric, p]) => ({ metric, trend: p.trend, lastValue: p.lastValue }));
  const predictions: { metric: string; value: number; confidence: number }[] = [];
  for (const metric of ['ca', 'ebe', 'rn', 'treso', 'bfr']) {
    const pred = predictMetric(orgId, metric);
    if (pred) predictions.push({ metric, ...pred });
  }
  return { patterns, predictions, observationCount: mem.observations.length };
}

export function clearMemory(orgId: string) {
  const all = loadAll();
  delete all[orgId];
  saveAll(all);
}
