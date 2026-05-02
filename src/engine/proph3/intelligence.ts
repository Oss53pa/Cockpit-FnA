/**
 * Proph3t — Module d'Intelligence Avancée (date-aware, predict, correct, suggest, audit, memorize)
 *
 * Capacités :
 *  1. CONTEXTE TEMPOREL : utilise la date système pour calculer le moment du cycle
 *     comptable (en cours / approche clôture / hors période), détecte retards,
 *     compare avec saisonnalité.
 *  2. PRÉDICTIONS : tendances métriques + extrapolation linéaire/Prophet
 *     (CA, marge, trésorerie, BFR, alertes).
 *  3. CORRECTIONS automatiques : détection d'incohérences + propositions de
 *     régularisation (déséquilibres, signes inversés, mappings manquants,
 *     doublons potentiels).
 *  4. SUGGESTIONS contextuelles : recommandations actionnables pondérées par
 *     sévérité (DSO élevé, trésorerie tendue, charges en hausse, etc.).
 *  5. AUDIT comprehensive : intégrité hash chain, périodes verrouillées,
 *     cohérence inter-états (CR ↔ Bilan ↔ TFT), arithmétique SYSCOHADA.
 *  6. MÉMORISATION : agrège observations dans Memory (existant), enrichit
 *     les patterns de tendance et les rapports temporels.
 *
 * Toutes les fonctions sont déterministes (pas de LLM en production) — chaque
 * insight est traçable à une règle métier explicite.
 */

import { db, type GLEntry } from '../../db/schema';
import { computeBalance } from '../balance';
import { computeBilan, computeSIG } from '../statements';
import { computeRatios, type Ratio } from '../ratios';
import { addObservation, getMemory } from './memory';
import { runLearningCycle, recordPrediction, getLearningState, type LearningCycleResult, type ModelAccuracy, type RecurringPattern, type LearnedThreshold } from './learning';
import { verifyChain } from '../../lib/auditHash';
import { isPeriodLocked } from '../../lib/periodLock';

// ═══════════════════════════════════════════════════════════════════════════
// 1. CONTEXTE TEMPOREL (date-aware analysis)
// ═══════════════════════════════════════════════════════════════════════════

export interface TemporalContext {
  now: Date;
  fiscalYear: number;
  daysInYear: number;
  daysSinceYearStart: number;
  daysUntilYearEnd: number;
  progressPct: number;        // 0–100 % de l'exercice écoulé
  phase: 'opening' | 'mid' | 'closing' | 'past';
  closingProximityWeeks: number; // semaines avant clôture (négatif si dépassé)
  recommendations: string[];  // recommandations basées sur le moment du cycle
}

/**
 * Calcule le contexte temporel d'un exercice par rapport à la date du jour.
 * Génère des recommandations adaptées (ex: début d'exercice → budget,
 * approche clôture → provisions/CCA-PCA, post-clôture → audit final).
 */
export function getTemporalContext(fiscalYear: number, now = new Date()): TemporalContext {
  const start = new Date(fiscalYear, 0, 1);
  const end = new Date(fiscalYear, 11, 31, 23, 59, 59);
  const daysInYear = Math.round((end.getTime() - start.getTime()) / 86400000);
  const daysSinceYearStart = Math.max(0, Math.round((now.getTime() - start.getTime()) / 86400000));
  const daysUntilYearEnd = Math.round((end.getTime() - now.getTime()) / 86400000);
  const progressPct = Math.max(0, Math.min(100, (daysSinceYearStart / daysInYear) * 100));

  let phase: TemporalContext['phase'];
  if (now < start) phase = 'opening';
  else if (now > end) phase = 'past';
  else if (progressPct < 25) phase = 'opening';
  else if (progressPct >= 80) phase = 'closing';
  else phase = 'mid';

  const closingProximityWeeks = Math.round(daysUntilYearEnd / 7);

  const recommendations: string[] = [];
  if (phase === 'opening') {
    recommendations.push("Période d'ouverture : valider le report à nouveau et figer le budget annuel.");
    recommendations.push('Vérifier que les soldes d\'ouverture correspondent aux clôtures N-1 (équilibre balance).');
  } else if (phase === 'mid') {
    recommendations.push(`Exercice à ${progressPct.toFixed(0)} % — surveiller l'écart Budget/Réalisé en mensuel.`);
    recommendations.push('Faire un rapprochement bancaire mensuel (compte 52 ↔ relevés).');
  } else if (phase === 'closing') {
    recommendations.push(`Approche clôture (${closingProximityWeeks} sem) — préparer provisions, CCA/PCA, FAE/FAP.`);
    recommendations.push('Lancer l\'inventaire physique des stocks et lettrer tous les comptes tiers.');
    recommendations.push('Constater les amortissements (681x) et provisions pour risques (681x).');
  } else {
    recommendations.push('Exercice clos — verrouiller les périodes via Settings → Period Lock.');
    recommendations.push('Générer le Closing Pack et soumettre aux administrateurs.');
  }

  return { now, fiscalYear, daysInYear, daysSinceYearStart, daysUntilYearEnd, progressPct, phase, closingProximityWeeks, recommendations };
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. PRÉDICTIONS RAPIDES (tendances multi-métriques)
// ═══════════════════════════════════════════════════════════════════════════

export interface QuickPrediction {
  metric: string;
  current: number;
  predicted: number;
  variation: number;     // %
  trend: 'up' | 'down' | 'stable';
  confidence: 'low' | 'medium' | 'high';
  horizon: '30j' | '90j' | 'fin_exercice';
  comment: string;
}

/**
 * Génère prédictions rapides sur les KPIs principaux à partir des observations
 * mémorisées (Memory) et du run-rate actuel.
 */
export function generateQuickPredictions(orgId: string, sig: { ca: number; resultat: number; ebe: number }, ctx: TemporalContext): QuickPrediction[] {
  const out: QuickPrediction[] = [];
  const mem = getMemory(orgId);

  // Run-rate annualisé : on extrapole le réalisé YTD jusqu'en fin d'exercice.
  const annualize = (ytd: number) => ctx.progressPct > 0 ? ytd * (100 / ctx.progressPct) : ytd;

  if (sig.ca > 0) {
    const annualCA = annualize(sig.ca);
    const variation = ((annualCA - sig.ca) / Math.max(1, sig.ca)) * 100;
    out.push({
      metric: "CA fin d'exercice",
      current: sig.ca,
      predicted: Math.round(annualCA),
      variation,
      trend: variation > 5 ? 'up' : variation < -5 ? 'down' : 'stable',
      confidence: ctx.progressPct > 50 ? 'high' : ctx.progressPct > 25 ? 'medium' : 'low',
      horizon: 'fin_exercice',
      comment: `Run-rate annualisé sur ${ctx.progressPct.toFixed(0)} % de l'exercice écoulés.`,
    });
  }

  if (sig.resultat !== 0) {
    const annualRN = annualize(sig.resultat);
    out.push({
      metric: "Résultat fin d'exercice",
      current: sig.resultat,
      predicted: Math.round(annualRN),
      variation: ((annualRN - sig.resultat) / Math.max(1, Math.abs(sig.resultat))) * 100,
      trend: annualRN > sig.resultat ? 'up' : annualRN < sig.resultat ? 'down' : 'stable',
      confidence: ctx.progressPct > 50 ? 'high' : 'medium',
      horizon: 'fin_exercice',
      comment: annualRN < 0 ? '⚠ Projection de perte sur l\'exercice — action requise.' : 'Projection de bénéfice.',
    });
  }

  // Patterns mémorisés : si une métrique a une tendance détectée, l'inclure
  for (const [metric, p] of Object.entries(mem.patterns)) {
    if (p.count < 3) continue;
    out.push({
      metric: `Tendance ${metric}`,
      current: p.lastValue,
      predicted: p.lastValue * (p.trend === 'up' ? 1.1 : p.trend === 'down' ? 0.9 : 1),
      variation: p.trend === 'up' ? 10 : p.trend === 'down' ? -10 : 0,
      trend: p.trend,
      confidence: p.count > 6 ? 'high' : 'medium',
      horizon: '90j',
      comment: `Pattern observé sur ${p.count} relevés.`,
    });
  }

  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. CORRECTIONS AUTOMATIQUES (détections + propositions)
// ═══════════════════════════════════════════════════════════════════════════

export interface Correction {
  id: string;
  severity: 'info' | 'warn' | 'critical';
  category: 'balance' | 'mapping' | 'sign' | 'duplicate' | 'periode' | 'integrity';
  account?: string;
  title: string;
  description: string;
  proposal: string;        // action recommandée
  affectedEntries?: string[]; // IDs des écritures concernées
  estimatedImpact?: number;
}

/**
 * Détecte les incohérences dans les écritures GL et propose des corrections
 * (déséquilibres, doublons potentiels, mappings absents, signes inversés).
 */
export async function detectCorrections(orgId: string, year: number): Promise<Correction[]> {
  const corrections: Correction[] = [];
  const entries = await db.gl.where('orgId').equals(orgId).toArray();
  const yearEntries = entries.filter((e) => new Date(e.date).getFullYear() === year);

  // 3a. Déséquilibres par pièce (debit ≠ credit sur même piece)
  const byPiece = new Map<string, GLEntry[]>();
  for (const e of yearEntries) {
    const k = `${e.journal}/${e.piece ?? 'NA'}`;
    if (!byPiece.has(k)) byPiece.set(k, []);
    byPiece.get(k)!.push(e);
  }
  for (const [piece, lines] of byPiece) {
    const totalD = lines.reduce((s, l) => s + (l.debit || 0), 0);
    const totalC = lines.reduce((s, l) => s + (l.credit || 0), 0);
    const ecart = Math.abs(totalD - totalC);
    if (ecart > 0.01) {
      corrections.push({
        id: `unbalanced-${piece}`,
        severity: ecart > 1000 ? 'critical' : 'warn',
        category: 'balance',
        title: `Pièce déséquilibrée : ${piece}`,
        description: `Débit ${totalD.toFixed(2)} ≠ Crédit ${totalC.toFixed(2)} (écart ${ecart.toFixed(2)})`,
        proposal: `Identifier la ligne manquante ou ajouter une écriture de régularisation au compte 471 "Comptes d'attente" pour ${ecart.toFixed(2)} XOF.`,
        affectedEntries: lines.map((l) => String(l.id ?? '')).filter(Boolean),
        estimatedImpact: ecart,
      });
    }
  }

  // 3b. Doublons potentiels (même date + montant + tiers + journal)
  const seen = new Map<string, GLEntry>();
  for (const e of yearEntries) {
    const k = `${e.date}|${e.account}|${e.debit}|${e.credit}|${e.tiers ?? ''}`;
    if (seen.has(k)) {
      corrections.push({
        id: `dup-${e.id}`,
        severity: 'warn',
        category: 'duplicate',
        account: e.account,
        title: `Doublon potentiel détecté`,
        description: `Écriture ${e.id} identique à ${seen.get(k)!.id} sur le compte ${e.account} le ${e.date}.`,
        proposal: `Vérifier en pièce comptable et supprimer l'une des deux si confirmé.`,
        affectedEntries: [String(e.id ?? ''), String(seen.get(k)!.id ?? '')],
        estimatedImpact: e.debit + e.credit,
      });
    } else seen.set(k, e);
  }

  // 3c. Comptes en classe 6 avec solde créditeur anormal (signe inversé probable)
  const balance = await computeBalance({ orgId, year });
  for (const r of balance) {
    const acc = r.account;
    if (acc.startsWith('6') && (r as any).soldeC > (r as any).soldeD * 1.5) {
      corrections.push({
        id: `sign-${acc}`,
        severity: 'warn',
        category: 'sign',
        account: acc,
        title: `Signe potentiellement inversé : compte ${acc}`,
        description: `Un compte de charge (classe 6) avec solde créditeur dominant (${(r as any).soldeC.toFixed(0)}) suggère un mauvais sens d'imputation.`,
        proposal: `Si c'est un Rabais/Remise (RRR) : utiliser plutôt 609x. Sinon vérifier la saisie des écritures.`,
      });
    }
    // Classe 7 avec solde débiteur anormal
    if (acc.startsWith('7') && (r as any).soldeD > (r as any).soldeC * 1.5) {
      corrections.push({
        id: `sign-${acc}`,
        severity: 'warn',
        category: 'sign',
        account: acc,
        title: `Signe potentiellement inversé : compte ${acc}`,
        description: `Un compte de produit (classe 7) avec solde débiteur dominant (${(r as any).soldeD.toFixed(0)}) suggère un mauvais sens.`,
        proposal: `Si c'est un Rabais/Remise accordé (RRR) : utiliser plutôt 709x. Sinon vérifier la saisie.`,
      });
    }
  }

  // 3d. Comptes inconnus (4 chiffres ne commençant pas par classe 1-9)
  const validClasses = ['1','2','3','4','5','6','7','8','9'];
  for (const r of balance) {
    if (!validClasses.includes(r.account[0])) {
      corrections.push({
        id: `unknown-${r.account}`,
        severity: 'critical',
        category: 'mapping',
        account: r.account,
        title: `Compte inconnu : ${r.account}`,
        description: `Le compte ${r.account} ne respecte pas la nomenclature SYSCOHADA (classes 1-9).`,
        proposal: `Réimporter le plan comptable ou re-mapper ce compte vers le bon code SYSCOHADA.`,
      });
    }
  }

  return corrections.sort((a, b) => {
    const sev = { critical: 0, warn: 1, info: 2 };
    return sev[a.severity] - sev[b.severity];
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. SUGGESTIONS CONTEXTUELLES (recommandations actionnables)
// ═══════════════════════════════════════════════════════════════════════════

export interface Suggestion {
  id: string;
  priority: 'P0' | 'P1' | 'P2';   // P0 = critique, P1 = important, P2 = optionnel
  area: 'tresorerie' | 'pricing' | 'cout' | 'fiscal' | 'audit' | 'rh' | 'commercial';
  title: string;
  rationale: string;       // pourquoi cette suggestion (basée sur quelles données)
  action: string;          // que faire concrètement
  expectedGain?: string;   // gain estimé
  complexity: 'low' | 'medium' | 'high';
  triggerMetric?: string;
  triggerValue?: number;
}

/**
 * Génère des suggestions contextuelles basées sur l'état financier actuel,
 * les ratios, le contexte temporel et les patterns mémorisés.
 */
export function generateSmartSuggestions(
  ratios: Ratio[],
  sig: { ca: number; resultat: number; ebe: number },
  ctx: TemporalContext,
  corrections: Correction[],
): Suggestion[] {
  const out: Suggestion[] = [];
  const r = (code: string) => ratios.find((x) => x.code === code);

  // === Trésorerie ===
  const trn = r('TRN');
  if (trn && trn.value < 0) {
    out.push({
      id: 'treso-rupture',
      priority: 'P0',
      area: 'tresorerie',
      title: 'Trésorerie nette négative',
      rationale: `TRN = ${trn.value.toFixed(2)} % — déficit de financement court terme.`,
      action: 'Négocier une ligne de crédit court terme avec votre banque OU accélérer le recouvrement clients (relances 30-60-90j).',
      expectedGain: 'Restauration de la trésorerie sous 60 jours.',
      complexity: 'medium',
      triggerMetric: 'TRN',
      triggerValue: trn.value,
    });
  }

  // === DSO élevé ===
  const dso = r('DSO');
  if (dso && dso.value > 60) {
    out.push({
      id: 'dso-eleve',
      priority: dso.value > 90 ? 'P0' : 'P1',
      area: 'tresorerie',
      title: 'Délai de paiement clients élevé',
      rationale: `DSO = ${dso.value.toFixed(0)} jours (cible < 60j en zone UEMOA).`,
      action: `Mettre en place un cycle de relance automatique : J+15 (rappel courtois), J+30 (relance), J+45 (mise en demeure), J+60 (recouvrement contentieux). ${ctx.phase === 'closing' ? 'Avant clôture, lancer également un nettoyage des créances douteuses (compte 416 + provisions 491).' : ''}`,
      expectedGain: `Réduire le DSO de 10 jours libère ~${((dso.value - 50) / 360 * sig.ca / 1_000_000).toFixed(1)} M XOF de trésorerie.`,
      complexity: 'low',
      triggerMetric: 'DSO',
      triggerValue: dso.value,
    });
  }

  // === Marge nette ===
  const marge = sig.ca > 0 ? (sig.resultat / sig.ca) * 100 : 0;
  if (marge < 3 && sig.ca > 0) {
    out.push({
      id: 'marge-faible',
      priority: marge < 0 ? 'P0' : 'P1',
      area: 'pricing',
      title: 'Marge nette insuffisante',
      rationale: `Marge nette = ${marge.toFixed(1)} % — sous la médiane sectorielle UEMOA (5-10 %).`,
      action: 'Mener une analyse coût/prix par produit ou service pour identifier les marges négatives. Renégocier les achats supérieurs à 10 % du CA. Réviser la grille tarifaire si l\'élasticité prix le permet.',
      expectedGain: '+1 point de marge = +1 % du CA en résultat net (effet direct).',
      complexity: 'medium',
    });
  }

  // === Charges de personnel ===
  const masseRatio = r('MS_CA');
  if (masseRatio && masseRatio.value > 35) {
    out.push({
      id: 'masse-salariale',
      priority: 'P1',
      area: 'rh',
      title: 'Masse salariale élevée',
      rationale: `Ratio Masse salariale / CA = ${masseRatio.value.toFixed(1)} % — au-dessus du seuil de 30 %.`,
      action: 'Analyser la productivité par poste (CA/ETP), identifier les postes redondants ou sous-utilisés, optimiser via formation polyvalente avant tout licenciement.',
      complexity: 'high',
    });
  }

  // === Autonomie financière ===
  const autonomie = r('AF');
  if (autonomie && autonomie.value < 30) {
    out.push({
      id: 'autonomie-faible',
      priority: 'P1',
      area: 'audit',
      title: 'Autonomie financière fragile',
      rationale: `Capitaux propres / Total bilan = ${autonomie.value.toFixed(1)} % — risque de surendettement.`,
      action: 'Renforcer les capitaux propres : augmentation de capital, mise en compte courant associé bloqué (compte 4561), ou affectation totale du résultat en réserves.',
      complexity: 'high',
    });
  }

  // === Audit / corrections ===
  const critiques = corrections.filter((c) => c.severity === 'critical').length;
  if (critiques > 0) {
    out.push({
      id: 'corrections-critiques',
      priority: 'P0',
      area: 'audit',
      title: `${critiques} correction(s) critique(s) à traiter`,
      rationale: 'Des incohérences ont été détectées qui invalident la fiabilité des états.',
      action: 'Voir le panneau "Corrections automatiques" — traiter les déséquilibres et comptes inconnus avant toute publication.',
      complexity: 'medium',
    });
  }

  // === Saisonnalité / phase ===
  if (ctx.phase === 'closing') {
    out.push({
      id: 'closing-checklist',
      priority: 'P0',
      area: 'audit',
      title: `Clôture dans ${ctx.closingProximityWeeks} semaines`,
      rationale: `Exercice à ${ctx.progressPct.toFixed(0)} % — phase de clôture.`,
      action: 'Lancer la checklist de clôture : inventaire, lettrage, provisions, CCA/PCA, FAE/FAP, amortissements, écritures d\'IS estimées.',
      complexity: 'high',
    });
  }

  return out.sort((a, b) => {
    const p = { P0: 0, P1: 1, P2: 2 };
    return p[a.priority] - p[b.priority];
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. AUDIT COMPRÉHENSIF (intégrité + cohérence)
// ═══════════════════════════════════════════════════════════════════════════

export interface AuditCheck {
  id: string;
  category: 'integrity' | 'consistency' | 'arithmetic' | 'period' | 'mapping';
  status: 'pass' | 'fail' | 'warn' | 'na';
  title: string;
  description: string;
  details?: string;
}

export interface AuditReport {
  timestamp: number;
  fiscalYear: number;
  totalChecks: number;
  passed: number;
  failed: number;
  warnings: number;
  checks: AuditCheck[];
  globalScore: number; // 0-100
}

/**
 * Audit comprehensive : vérifie intégrité hash chain, période locks, équilibre
 * balance, cohérence inter-états, arithmétique SYSCOHADA.
 */
export async function runComprehensiveAudit(orgId: string, year: number): Promise<AuditReport> {
  const checks: AuditCheck[] = [];

  // 5a. Intégrité hash chain
  try {
    const entries = await db.gl.where('orgId').equals(orgId).toArray();
    const yearEntries = entries
      .filter((e) => new Date(e.date).getFullYear() === year)
      .sort((a, b) => (a.date < b.date ? -1 : 1));
    if (yearEntries.length === 0) {
      checks.push({ id: 'hash-chain', category: 'integrity', status: 'na', title: 'Chaîne de hash', description: 'Aucune écriture sur l\'exercice.' });
    } else {
      const result = await verifyChain(yearEntries as any);
      checks.push({
        id: 'hash-chain',
        category: 'integrity',
        status: result.valid ? 'pass' : 'fail',
        title: 'Chaîne de hash SHA-256',
        description: result.valid ? 'Toutes les écritures sont chaînées et non altérées.' : `Rupture détectée à l'écriture ${result.brokenAt} (position ${result.brokenIndex}).`,
        details: `${yearEntries.length} écritures vérifiées.`,
      });
    }
  } catch (e: any) {
    checks.push({ id: 'hash-chain', category: 'integrity', status: 'warn', title: 'Chaîne de hash', description: 'Vérification impossible : ' + (e.message ?? 'erreur'), });
  }

  // 5b. Équilibre balance
  const balance = await computeBalance({ orgId, year });
  const totalD = balance.reduce((s: number, r: any) => s + (r.soldeD || 0), 0);
  const totalC = balance.reduce((s: number, r: any) => s + (r.soldeC || 0), 0);
  const ecart = Math.abs(totalD - totalC);
  checks.push({
    id: 'balance-equilibre',
    category: 'arithmetic',
    status: ecart < 0.01 ? 'pass' : ecart < 100 ? 'warn' : 'fail',
    title: 'Équilibre de la balance',
    description: ecart < 0.01 ? `Total débit = Total crédit = ${totalD.toFixed(2)}.` : `Écart de ${ecart.toFixed(2)} entre débit et crédit.`,
  });

  // 5c. Bilan équilibré
  const { actif, passif } = computeBilan(balance);
  const totA = actif.find((l) => l.code === '_BZ')?.value ?? 0;
  const totP = passif.find((l) => l.code === '_DZ')?.value ?? 0;
  const ecartBilan = Math.abs(totA - totP);
  checks.push({
    id: 'bilan-equilibre',
    category: 'consistency',
    status: ecartBilan < 0.01 ? 'pass' : ecartBilan < 1 ? 'warn' : 'fail',
    title: 'Équilibre du bilan',
    description: ecartBilan < 0.01 ? `Total Actif = Total Passif = ${totA.toFixed(0)}.` : `Total Actif (${totA.toFixed(0)}) ≠ Total Passif (${totP.toFixed(0)}) — écart ${ecartBilan.toFixed(2)}.`,
  });

  // 5d. Cohérence CR ↔ Bilan : Résultat exercice
  const { sig } = computeSIG(balance);
  const resBilan = passif.find((l) => l.code === '_CR' || l.code === 'CR')?.value ?? 0;
  const ecartRes = Math.abs(sig.resultat - resBilan);
  checks.push({
    id: 'coherence-resultat',
    category: 'consistency',
    status: ecartRes < 1 ? 'pass' : ecartRes < 100 ? 'warn' : 'fail',
    title: 'Cohérence CR ↔ Bilan',
    description: ecartRes < 1 ? 'Résultat du CR identique au résultat du bilan.' : `CR (${sig.resultat.toFixed(0)}) ≠ Bilan (${resBilan.toFixed(0)}) — écart ${ecartRes.toFixed(2)}.`,
  });

  // 5e. Période verrouillée pour exercice clos
  const ctx = getTemporalContext(year);
  if (ctx.phase === 'past') {
    try {
      // On teste sur le 31 décembre de l'exercice (fin de période)
      const closingDate = `${year}-12-31`;
      const locked = await isPeriodLocked(closingDate, orgId);
      checks.push({
        id: 'period-lock',
        category: 'period',
        status: locked ? 'pass' : 'warn',
        title: 'Verrouillage de période',
        description: locked ? `Exercice ${year} verrouillé contre les modifications.` : `Exercice ${year} terminé mais NON verrouillé — risque de modifications post-clôture.`,
      });
    } catch {
      checks.push({ id: 'period-lock', category: 'period', status: 'na', title: 'Verrouillage de période', description: 'Impossible à vérifier.' });
    }
  }

  // 5f. Comptes mappés correctement (pas de comptes hors classe 1-9)
  const validClasses = new Set(['1','2','3','4','5','6','7','8','9']);
  const invalides = balance.filter((r: any) => !validClasses.has(r.account[0]));
  checks.push({
    id: 'mapping-syscohada',
    category: 'mapping',
    status: invalides.length === 0 ? 'pass' : 'fail',
    title: 'Conformité plan comptable SYSCOHADA',
    description: invalides.length === 0 ? 'Tous les comptes respectent la nomenclature SYSCOHADA (classes 1-9).' : `${invalides.length} compte(s) hors nomenclature : ${invalides.slice(0, 3).map((r: any) => r.account).join(', ')}${invalides.length > 3 ? '…' : ''}.`,
  });

  // 5g. Ratios calculables (au moins 5 ratios principaux)
  const ratios = computeRatios(balance);
  const calculables = ratios.filter((r) => !Number.isNaN(r.value) && Number.isFinite(r.value)).length;
  checks.push({
    id: 'ratios-calculables',
    category: 'arithmetic',
    status: calculables >= 5 ? 'pass' : calculables > 0 ? 'warn' : 'fail',
    title: 'Ratios financiers calculables',
    description: `${calculables} / ${ratios.length} ratios calculables.`,
  });

  const passed = checks.filter((c) => c.status === 'pass').length;
  const failed = checks.filter((c) => c.status === 'fail').length;
  const warnings = checks.filter((c) => c.status === 'warn').length;
  const total = checks.filter((c) => c.status !== 'na').length;
  const globalScore = total > 0 ? Math.round((passed / total) * 100) : 0;

  return {
    timestamp: Date.now(),
    fiscalYear: year,
    totalChecks: checks.length,
    passed,
    failed,
    warnings,
    checks,
    globalScore,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. ORCHESTRATEUR : analyse intelligence complète
// ═══════════════════════════════════════════════════════════════════════════

export interface IntelligenceReport {
  context: TemporalContext;
  predictions: QuickPrediction[];
  corrections: Correction[];
  suggestions: Suggestion[];
  audit: AuditReport;
  insights: string[];
  /** Résultat du cycle d'apprentissage (boucle fermée prédiction ↔ réalité). */
  learning: LearningCycleResult;
  /** Précision des modèles par métrique (mise à jour à chaque cycle). */
  modelAccuracy: { [metric: string]: ModelAccuracy };
  /** Patterns récurrents détectés sur l'historique. */
  patterns: RecurringPattern[];
  /** Seuils appris spécifiquement à cette entreprise (vs normes UEMOA). */
  learnedThresholds: { [metric: string]: LearnedThreshold };
  /** Synthèse en langage naturel de ce que Proph3t a appris. */
  lessonsLearned: string[];
}

/**
 * Orchestre toutes les capacités d'intelligence Proph3t en un seul rapport.
 * Persiste les observations clés dans la mémoire pour apprentissage continu.
 */
export async function runIntelligenceAnalysis(orgId: string, year: number): Promise<IntelligenceReport> {
  const balance = await computeBalance({ orgId, year });
  const { sig } = computeSIG(balance);
  const ratios = computeRatios(balance);

  const context = getTemporalContext(year);
  const predictions = generateQuickPredictions(orgId, sig, context);
  const corrections = await detectCorrections(orgId, year);
  const audit = await runComprehensiveAudit(orgId, year);
  const suggestions = generateSmartSuggestions(ratios, sig, context, corrections);

  // Mémoriser observations clés
  if (sig.ca > 0) addObservation(orgId, { category: 'kpi', metric: 'ca', value: sig.ca, context: `Exercice ${year}` });
  if (sig.resultat !== 0) addObservation(orgId, { category: 'kpi', metric: 'resultat', value: sig.resultat, context: `Exercice ${year}` });
  for (const r of ratios.slice(0, 5)) {
    if (Number.isFinite(r.value)) addObservation(orgId, { category: 'ratio', metric: r.code.toLowerCase(), value: r.value, context: `Exercice ${year}`, severity: r.status === 'alert' ? 'critical' : r.status === 'warn' ? 'warn' : 'info' });
  }

  // ── APPRENTISSAGE : boucle fermée prédiction ↔ réalité ──────────────────
  // 1) Préparer le snapshot actuel pour résoudre les anciennes prédictions
  const currentSnapshot: { metric: string; value: number; severity?: string }[] = [];
  if (sig.ca > 0) currentSnapshot.push({ metric: 'ca', value: sig.ca });
  if (sig.resultat !== 0) currentSnapshot.push({ metric: 'resultat', value: sig.resultat });
  if (sig.ebe !== 0) currentSnapshot.push({ metric: 'ebe', value: sig.ebe });
  for (const r of ratios.slice(0, 8)) {
    if (Number.isFinite(r.value)) currentSnapshot.push({ metric: r.code.toLowerCase(), value: r.value, severity: r.status });
  }

  // 2) Préparer l'historique depuis Memory pour apprendre les seuils + patterns
  const memSnapshot = getMemory(orgId);
  const history = memSnapshot.observations.map((o) => ({ date: o.date, metric: o.metric, value: o.value, severity: o.severity }));

  // 3) Enregistrer les prédictions de ce cycle pour évaluation future
  for (const p of predictions) {
    if (p.horizon === 'fin_exercice') {
      recordPrediction(orgId, {
        metric: p.metric.toLowerCase().replace(/[^a-z0-9]/g, '_'),
        predictedValue: p.predicted,
        horizonDays: Math.max(7, context.daysUntilYearEnd),
        modelVersion: 'run-rate-v1',
        confidence: p.confidence,
      });
    }
  }

  // 4) Lancer le cycle d'apprentissage (résout, apprend seuils, détecte patterns)
  const learning = runLearningCycle(orgId, currentSnapshot, history);

  // 5) Récupérer l'état appris pour le rapport
  const learnState = getLearningState(orgId);

  // Insights agrégés
  const insights: string[] = [];
  insights.push(`Exercice ${year} à ${context.progressPct.toFixed(0)} % — phase ${context.phase === 'opening' ? 'd\'ouverture' : context.phase === 'mid' ? 'de pleine activité' : context.phase === 'closing' ? 'de clôture' : 'clos'}.`);
  if (audit.globalScore < 80) insights.push(`Score d'audit ${audit.globalScore}/100 — ${audit.failed} contrôle(s) en échec.`);
  if (corrections.filter((c) => c.severity === 'critical').length > 0) insights.push(`${corrections.filter((c) => c.severity === 'critical').length} correction(s) critique(s) à traiter en priorité.`);
  if (suggestions.filter((s) => s.priority === 'P0').length > 0) insights.push(`${suggestions.filter((s) => s.priority === 'P0').length} action(s) P0 (urgent) recommandée(s).`);
  for (const reco of context.recommendations.slice(0, 2)) insights.push(reco);

  // Insights issus de l'apprentissage
  if (learning.iteration > 1) {
    insights.push(`Cycle d'apprentissage #${learning.iteration} — ${learning.predictionsResolved} prédiction(s) résolue(s), ${learning.thresholdsLearned} seuil(s) ajusté(s), ${learning.patternsDetected} pattern(s) détecté(s).`);
  }

  return {
    context, predictions, corrections, suggestions, audit, insights,
    learning,
    modelAccuracy: learnState.accuracy,
    patterns: learnState.patterns,
    learnedThresholds: learnState.thresholds,
    lessonsLearned: learnState.lessonsLearned,
  };
}
