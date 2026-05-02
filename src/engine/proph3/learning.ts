/**
 * Proph3t — Module d'Apprentissage (Learning Loop)
 *
 * L'apprentissage consiste à FERMER LA BOUCLE entre prédiction et réalité :
 *  1. Enregistrer chaque prédiction faite (avec horizon + métrique + valeur prévue)
 *  2. À l'échéance, comparer à la valeur réelle observée
 *  3. Calculer l'erreur (MAPE) et ajuster la confiance pour les prochaines prédictions
 *  4. Apprendre des seuils SPÉCIFIQUES à cette entreprise (au-delà des normes UEMOA)
 *  5. Détecter les patterns récurrents (saisonnalité, dépenses cycliques, alertes répétées)
 *  6. Maintenir un score de fiabilité du modèle qui évolue dans le temps
 *
 * Toutes les données d'apprentissage sont persistées localement (localStorage)
 * pour que Proph3t s'améliore réellement entre les sessions, par société.
 */

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

export interface PredictionRecord {
  id: string;                  // unique
  metric: string;              // ex: "ca", "treso", "marge_nette"
  predictedAt: number;         // timestamp de la prédiction
  predictedValue: number;
  horizonDays: number;         // jours après predictedAt où la prédiction est censée se réaliser
  targetDate: number;          // predictedAt + horizonDays
  modelVersion: string;        // ex: "run-rate-v1", "prophet-v2"
  confidence: 'low' | 'medium' | 'high';
  // Renseignés à l'échéance :
  actualValue?: number;
  actualAt?: number;
  errorPct?: number;           // |predicted - actual| / |actual| × 100
  resolved?: boolean;
}

export interface LearnedThreshold {
  metric: string;              // ex: "dso", "tauxMarge"
  baselineMean: number;        // moyenne historique sur cette société
  baselineStd: number;         // écart-type
  warningLow: number;          // seuil inférieur (mean - 1.5σ)
  warningHigh: number;         // seuil supérieur (mean + 1.5σ)
  alertLow: number;            // seuil bas critique (mean - 2.5σ)
  alertHigh: number;           // seuil haut critique (mean + 2.5σ)
  sampleSize: number;
  lastUpdate: number;
  source: 'learned' | 'syscohada-default'; // si trop peu d'historique on retombe sur la norme
}

export interface RecurringPattern {
  id: string;
  type: 'monthly-spike' | 'seasonal' | 'recurring-alert' | 'trend';
  metric: string;
  description: string;
  occurrences: number;
  firstSeen: number;
  lastSeen: number;
  confidence: number;          // 0-1
  details?: Record<string, unknown>;
}

export interface ModelAccuracy {
  metric: string;
  totalPredictions: number;
  resolvedPredictions: number;
  meanAbsoluteError: number;   // MAE
  meanAbsolutePctError: number; // MAPE
  bias: number;                // tendance à sur/sous-estimer
  reliability: number;         // 0-100, score global
  trend: 'improving' | 'stable' | 'degrading';
  lastEval: number;
}

export interface LearningState {
  orgId: string;
  predictions: PredictionRecord[];
  thresholds: { [metric: string]: LearnedThreshold };
  patterns: RecurringPattern[];
  accuracy: { [metric: string]: ModelAccuracy };
  lessonsLearned: string[];    // observations textuelles découvertes
  totalIterations: number;     // nb de cycles d'apprentissage exécutés
  lastLearningRun: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// Storage
// ═══════════════════════════════════════════════════════════════════════════

const STORAGE_KEY = 'proph3t-learning';
const MAX_PREDICTIONS = 1000;
const MAX_PATTERNS = 100;

function loadAll(): Record<string, LearningState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveAll(data: Record<string, LearningState>) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch { /* ignore quota */ }
}

export function getLearningState(orgId: string): LearningState {
  const all = loadAll();
  if (!all[orgId]) {
    all[orgId] = {
      orgId,
      predictions: [],
      thresholds: {},
      patterns: [],
      accuracy: {},
      lessonsLearned: [],
      totalIterations: 0,
      lastLearningRun: 0,
    };
  }
  return all[orgId];
}

function persist(state: LearningState) {
  const all = loadAll();
  all[state.orgId] = state;
  saveAll(all);
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. RECORD PREDICTION (boucle ouverte)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Enregistre une prédiction faite par le moteur. Sera évaluée plus tard quand
 * la valeur réelle sera disponible (typiquement au prochain mois).
 */
export function recordPrediction(orgId: string, p: Omit<PredictionRecord, 'id' | 'predictedAt' | 'targetDate' | 'resolved'>): PredictionRecord {
  const state = getLearningState(orgId);
  const now = Date.now();
  const rec: PredictionRecord = {
    ...p,
    id: `${p.metric}-${now}-${Math.random().toString(36).slice(2, 6)}`,
    predictedAt: now,
    targetDate: now + p.horizonDays * 86400000,
    resolved: false,
  };
  state.predictions.push(rec);
  // Limite mémoire
  if (state.predictions.length > MAX_PREDICTIONS) {
    state.predictions = state.predictions.slice(-MAX_PREDICTIONS);
  }
  persist(state);
  return rec;
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. RESOLVE PREDICTION (boucle fermée — apprentissage)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * À l'échéance d'une prédiction, fournit la valeur réelle pour fermer la boucle.
 * Calcule l'erreur, met à jour la fiabilité du modèle, et adapte les futures
 * prédictions pour cette métrique.
 */
export function resolvePrediction(orgId: string, predictionId: string, actualValue: number): { errorPct: number; reliability: number } | null {
  const state = getLearningState(orgId);
  const idx = state.predictions.findIndex((p) => p.id === predictionId);
  if (idx === -1) return null;
  const pred = state.predictions[idx];

  const errorPct = Math.abs(actualValue) > 0.01
    ? Math.abs((pred.predictedValue - actualValue) / actualValue) * 100
    : Math.abs(pred.predictedValue - actualValue);

  pred.actualValue = actualValue;
  pred.actualAt = Date.now();
  pred.errorPct = errorPct;
  pred.resolved = true;

  // Recalculer accuracy pour cette métrique
  updateModelAccuracy(state, pred.metric);
  persist(state);

  return { errorPct, reliability: state.accuracy[pred.metric]?.reliability ?? 0 };
}

/**
 * Auto-résolution : compare les prédictions échues à la valeur observée actuelle
 * passée en paramètre. Utile pour résoudre toutes les prédictions échues d'une
 * métrique donnée en une seule passe.
 */
export function autoResolveMetric(orgId: string, metric: string, currentValue: number): number {
  const state = getLearningState(orgId);
  const now = Date.now();
  let resolvedCount = 0;
  for (const p of state.predictions) {
    if (p.metric === metric && !p.resolved && p.targetDate <= now) {
      p.actualValue = currentValue;
      p.actualAt = now;
      p.errorPct = Math.abs(currentValue) > 0.01
        ? Math.abs((p.predictedValue - currentValue) / currentValue) * 100
        : Math.abs(p.predictedValue - currentValue);
      p.resolved = true;
      resolvedCount++;
    }
  }
  if (resolvedCount > 0) {
    updateModelAccuracy(state, metric);
    persist(state);
  }
  return resolvedCount;
}

function updateModelAccuracy(state: LearningState, metric: string) {
  const resolved = state.predictions.filter((p) => p.metric === metric && p.resolved && p.errorPct !== undefined);
  if (resolved.length === 0) return;

  const errors = resolved.map((p) => p.errorPct!);
  const mae = errors.reduce((s, e) => s + e, 0) / errors.length;
  const totalPredictions = state.predictions.filter((p) => p.metric === metric).length;

  // Bias : moyenne des écarts signés (positif = surestimation)
  const signedErrors = resolved.map((p) => ((p.predictedValue - (p.actualValue ?? 0)) / Math.max(Math.abs(p.actualValue ?? 1), 1)) * 100);
  const bias = signedErrors.reduce((s, e) => s + e, 0) / signedErrors.length;

  // Reliability : 100 - MAPE clampé, pondéré par taille échantillon
  const sampleWeight = Math.min(1, resolved.length / 10);
  const reliability = Math.max(0, Math.min(100, (100 - mae) * sampleWeight + 50 * (1 - sampleWeight)));

  // Trend : comparer 5 dernières erreurs vs 5 précédentes
  let trend: ModelAccuracy['trend'] = 'stable';
  if (resolved.length >= 6) {
    const recent = errors.slice(-3).reduce((s, e) => s + e, 0) / 3;
    const older = errors.slice(-6, -3).reduce((s, e) => s + e, 0) / 3;
    if (recent < older - 5) trend = 'improving';
    else if (recent > older + 5) trend = 'degrading';
  }

  state.accuracy[metric] = {
    metric,
    totalPredictions,
    resolvedPredictions: resolved.length,
    meanAbsoluteError: mae,
    meanAbsolutePctError: mae,
    bias,
    reliability: Math.round(reliability),
    trend,
    lastEval: Date.now(),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. APPRENTISSAGE DES SEUILS (specific à l'entreprise)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Apprend les seuils normaux pour CETTE entreprise à partir de l'historique des
 * observations (mémoire). Permet de remplacer les seuils SYSCOHADA génériques
 * par des seuils ajustés au profil réel de la société.
 *
 * Méthode : moyenne ± 1.5σ pour warning, ± 2.5σ pour alerte (Z-score).
 */
export function learnThreshold(orgId: string, metric: string, observations: number[]): LearnedThreshold {
  const state = getLearningState(orgId);
  if (observations.length < 3) {
    // Pas assez de données — fallback sur seuil SYSCOHADA si disponible
    const existing = state.thresholds[metric];
    if (existing) return existing;
    const fallback: LearnedThreshold = {
      metric,
      baselineMean: observations[0] ?? 0,
      baselineStd: 0,
      warningLow: 0, warningHigh: 0,
      alertLow: 0, alertHigh: 0,
      sampleSize: observations.length,
      lastUpdate: Date.now(),
      source: 'syscohada-default',
    };
    state.thresholds[metric] = fallback;
    persist(state);
    return fallback;
  }

  const mean = observations.reduce((s, v) => s + v, 0) / observations.length;
  const variance = observations.reduce((s, v) => s + (v - mean) ** 2, 0) / observations.length;
  const std = Math.sqrt(variance);

  const learned: LearnedThreshold = {
    metric,
    baselineMean: mean,
    baselineStd: std,
    warningLow: mean - 1.5 * std,
    warningHigh: mean + 1.5 * std,
    alertLow: mean - 2.5 * std,
    alertHigh: mean + 2.5 * std,
    sampleSize: observations.length,
    lastUpdate: Date.now(),
    source: 'learned',
  };

  state.thresholds[metric] = learned;
  persist(state);
  return learned;
}

/**
 * Applique un seuil appris à une nouvelle valeur — détermine son statut.
 */
export function classifyAgainstLearnedThreshold(
  threshold: LearnedThreshold,
  value: number,
): { status: 'normal' | 'warn' | 'alert'; deviation: number; explanation: string } {
  if (threshold.baselineStd === 0) {
    return { status: 'normal', deviation: 0, explanation: 'Pas assez de données pour évaluer.' };
  }
  const z = (value - threshold.baselineMean) / threshold.baselineStd;
  const absZ = Math.abs(z);
  let status: 'normal' | 'warn' | 'alert';
  if (absZ < 1.5) status = 'normal';
  else if (absZ < 2.5) status = 'warn';
  else status = 'alert';
  const explanation = absZ < 1.5
    ? `Dans la plage normale apprise (μ ± 1.5σ).`
    : absZ < 2.5
      ? `Écart de ${z.toFixed(1)}σ par rapport à la moyenne historique de ${threshold.baselineMean.toFixed(2)}.`
      : `Écart critique de ${z.toFixed(1)}σ — valeur très inhabituelle pour cette entreprise.`;
  return { status, deviation: z, explanation };
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. DÉTECTION DE PATTERNS RÉCURRENTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Détecte les patterns récurrents dans les observations historiques :
 *  - Spikes mensuels (ex: charges qui explosent en décembre)
 *  - Saisonnalité (CA cyclique)
 *  - Alertes répétées (même métrique en alerte plusieurs fois)
 *  - Tendances longues (évolution monotone)
 */
export function detectRecurringPatterns(
  orgId: string,
  observations: { date: number; metric: string; value: number; severity?: string }[],
): RecurringPattern[] {
  const state = getLearningState(orgId);
  const patterns: RecurringPattern[] = [];

  // 4a. Spikes mensuels — pour chaque métrique, détecter un mois récurrent à valeur extrême
  const byMetric = new Map<string, typeof observations>();
  for (const obs of observations) {
    if (!byMetric.has(obs.metric)) byMetric.set(obs.metric, []);
    byMetric.get(obs.metric)!.push(obs);
  }

  for (const [metric, obsList] of byMetric) {
    if (obsList.length < 6) continue;
    // Grouper par mois (1-12)
    const byMonth = new Array(12).fill(0).map(() => [] as number[]);
    for (const o of obsList) byMonth[new Date(o.date).getMonth()].push(o.value);
    const monthlyMeans = byMonth.map((arr) => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null);
    const valid = monthlyMeans.filter((m): m is number => m !== null);
    if (valid.length < 6) continue;
    const overallMean = valid.reduce((s, v) => s + v, 0) / valid.length;
    const overallStd = Math.sqrt(valid.reduce((s, v) => s + (v - overallMean) ** 2, 0) / valid.length);
    if (overallStd === 0) continue;

    monthlyMeans.forEach((m, idx) => {
      if (m === null) return;
      const z = (m - overallMean) / overallStd;
      if (Math.abs(z) > 1.5 && byMonth[idx].length >= 2) {
        const monthName = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'][idx];
        patterns.push({
          id: `spike-${metric}-${idx}`,
          type: 'monthly-spike',
          metric,
          description: `${metric} ${z > 0 ? 'systématiquement élevé' : 'systématiquement bas'} en ${monthName} (${byMonth[idx].length} relevés, écart ${z.toFixed(1)}σ).`,
          occurrences: byMonth[idx].length,
          firstSeen: Math.min(...obsList.filter((o) => new Date(o.date).getMonth() === idx).map((o) => o.date)),
          lastSeen: Math.max(...obsList.filter((o) => new Date(o.date).getMonth() === idx).map((o) => o.date)),
          confidence: Math.min(1, byMonth[idx].length / 4),
        });
      }
    });
  }

  // 4b. Alertes répétées — métrique en alerte ≥ 3 fois sur les 12 derniers
  const recentAlerts = observations.filter((o) => o.severity === 'critical' || o.severity === 'warn');
  const alertCount = new Map<string, number>();
  for (const a of recentAlerts) alertCount.set(a.metric, (alertCount.get(a.metric) ?? 0) + 1);
  for (const [metric, count] of alertCount) {
    if (count >= 3) {
      patterns.push({
        id: `recurring-alert-${metric}`,
        type: 'recurring-alert',
        metric,
        description: `${metric} déclenche une alerte de manière récurrente (${count} fois) — problème structurel, pas conjoncturel.`,
        occurrences: count,
        firstSeen: Math.min(...recentAlerts.filter((o) => o.metric === metric).map((o) => o.date)),
        lastSeen: Math.max(...recentAlerts.filter((o) => o.metric === metric).map((o) => o.date)),
        confidence: Math.min(1, count / 6),
      });
    }
  }

  // 4c. Tendances longues — métriques en évolution monotone sur 4+ relevés
  for (const [metric, obsList] of byMetric) {
    if (obsList.length < 4) continue;
    const sorted = [...obsList].sort((a, b) => a.date - b.date);
    const recent = sorted.slice(-4).map((o) => o.value);
    let monotone: 'up' | 'down' | null = null;
    let strict = true;
    for (let i = 1; i < recent.length; i++) {
      if (recent[i] > recent[i - 1]) {
        if (monotone === 'down') { strict = false; break; }
        monotone = 'up';
      } else if (recent[i] < recent[i - 1]) {
        if (monotone === 'up') { strict = false; break; }
        monotone = 'down';
      }
    }
    if (strict && monotone) {
      patterns.push({
        id: `trend-${metric}`,
        type: 'trend',
        metric,
        description: `${metric} en tendance ${monotone === 'up' ? 'haussière' : 'baissière'} continue sur ${recent.length} relevés.`,
        occurrences: recent.length,
        firstSeen: sorted[sorted.length - 4].date,
        lastSeen: sorted[sorted.length - 1].date,
        confidence: 0.8,
      });
    }
  }

  // Persiste les patterns (max MAX_PATTERNS, dédupliqués par id)
  const merged = new Map<string, RecurringPattern>();
  for (const p of state.patterns) merged.set(p.id, p);
  for (const p of patterns) merged.set(p.id, p);
  state.patterns = Array.from(merged.values()).slice(-MAX_PATTERNS);
  persist(state);

  return patterns;
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. LESSONS LEARNED (synthèse textuelle des apprentissages)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Génère une synthèse en langage naturel de ce que Proph3t a appris sur cette
 * entreprise. C'est le visage utilisateur de l'apprentissage.
 */
export function summarizeLessonsLearned(orgId: string): string[] {
  const state = getLearningState(orgId);
  const lessons: string[] = [];

  // Lessons issus de la fiabilité du modèle
  for (const acc of Object.values(state.accuracy)) {
    if (acc.resolvedPredictions < 3) continue;
    if (acc.reliability >= 80) {
      lessons.push(`Modèle ${acc.metric} fiable à ${acc.reliability}% (${acc.resolvedPredictions} prédictions vérifiées, MAPE ${acc.meanAbsolutePctError.toFixed(1)}%).`);
    } else if (acc.reliability < 50) {
      lessons.push(`Modèle ${acc.metric} peu fiable (${acc.reliability}%) — élargir l'historique ou changer de méthode.`);
    }
    if (Math.abs(acc.bias) > 10) {
      lessons.push(`Biais détecté sur ${acc.metric} : ${acc.bias > 0 ? 'sur-estimation' : 'sous-estimation'} systématique de ${Math.abs(acc.bias).toFixed(1)}%.`);
    }
    if (acc.trend === 'improving') lessons.push(`Précision sur ${acc.metric} en amélioration — l'apprentissage progresse.`);
    if (acc.trend === 'degrading') lessons.push(`Précision sur ${acc.metric} en dégradation — le modèle décroche, vérifier les conditions de marché.`);
  }

  // Lessons issus des seuils appris
  const learned = Object.values(state.thresholds).filter((t) => t.source === 'learned');
  if (learned.length > 0) {
    lessons.push(`Seuils ajustés pour cette entreprise sur ${learned.length} métrique(s) — les normes UEMOA sont remplacées par les seuils empiriques quand disponibles.`);
  }

  // Lessons issus des patterns
  const monthlySpikes = state.patterns.filter((p) => p.type === 'monthly-spike');
  if (monthlySpikes.length > 0) {
    lessons.push(`${monthlySpikes.length} pic(s) saisonnier(s) détecté(s) — utiliser pour préparer le budget mensuel.`);
  }
  const recurring = state.patterns.filter((p) => p.type === 'recurring-alert');
  if (recurring.length > 0) {
    lessons.push(`${recurring.length} alerte(s) récurrente(s) — symptôme d'un problème structurel à traiter en priorité.`);
  }
  const trends = state.patterns.filter((p) => p.type === 'trend');
  if (trends.length > 0) {
    lessons.push(`${trends.length} tendance(s) longue(s) identifiée(s) — direction stratégique à valider.`);
  }

  // Si rien à dire encore
  if (lessons.length === 0) {
    lessons.push("Proph3t n'a pas encore assez de données pour apprendre — au moins 3 cycles d'analyse sont nécessaires.");
  }

  return lessons;
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. ORCHESTRATEUR D'APPRENTISSAGE (à appeler à chaque analyse)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Lance un cycle complet d'apprentissage à partir des observations actuelles.
 * Appelé après chaque analyse Proph3t. Retourne une synthèse de ce qui a été
 * appris durant ce cycle.
 */
export interface LearningCycleResult {
  iteration: number;
  predictionsResolved: number;
  thresholdsLearned: number;
  patternsDetected: number;
  newLessons: string[];
  modelReliability: { [metric: string]: number };
}

export function runLearningCycle(
  orgId: string,
  currentSnapshot: { metric: string; value: number; severity?: string }[],
  history: { date: number; metric: string; value: number; severity?: string }[],
): LearningCycleResult {
  const state = getLearningState(orgId);
  state.totalIterations++;
  state.lastLearningRun = Date.now();

  let predictionsResolved = 0;
  for (const snap of currentSnapshot) {
    predictionsResolved += autoResolveMetric(orgId, snap.metric, snap.value);
  }

  // Apprendre les seuils sur les métriques avec assez d'historique
  let thresholdsLearned = 0;
  const byMetric = new Map<string, number[]>();
  for (const h of history) {
    if (!byMetric.has(h.metric)) byMetric.set(h.metric, []);
    byMetric.get(h.metric)!.push(h.value);
  }
  for (const [metric, values] of byMetric) {
    if (values.length >= 3) {
      learnThreshold(orgId, metric, values);
      thresholdsLearned++;
    }
  }

  // Détecter patterns
  const patterns = detectRecurringPatterns(orgId, history);

  // Synthétiser
  const newLessons = summarizeLessonsLearned(orgId);
  state.lessonsLearned = newLessons;

  const modelReliability: { [metric: string]: number } = {};
  for (const [metric, acc] of Object.entries(state.accuracy)) modelReliability[metric] = acc.reliability;

  persist(state);

  return {
    iteration: state.totalIterations,
    predictionsResolved,
    thresholdsLearned,
    patternsDetected: patterns.length,
    newLessons,
    modelReliability,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Reset (utile en debug ou pour repartir à zéro)
// ═══════════════════════════════════════════════════════════════════════════
export function clearLearning(orgId: string) {
  const all = loadAll();
  delete all[orgId];
  saveAll(all);
}
