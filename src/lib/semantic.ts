/**
 * Semantic colors — palette-aware pour les indicateurs financiers.
 *
 * Au lieu d'utiliser des verts vifs (#22c55e) et rouges agressifs (#ef4444)
 * dans les charts, on utilise les couleurs de la palette active (sage primary,
 * terracotta secondary) qui s'adaptent automatiquement au choix utilisateur.
 *
 * Convention :
 *   success / good        → sage primary (vert apaisant)
 *   warning / vigilance   → ocre doux (pas orange agressif)
 *   danger / non-critical → terracotta (clay)
 *   critical / urgent     → rouge profond (réservé aux vraies alertes)
 *   info / neutral        → bleu sarcelle ou gris
 */

// Couleurs sémantiques harmonisées avec la palette active
export const SEMANTIC = {
  /** Vert sage — pour status conforme, KPI sain, ratio respecté */
  success: '#7FA88E',
  successSoft: '#E5EDE3',
  successText: '#4F6E5C',

  /** Ocre doux — pour vigilance, à surveiller, écart modéré */
  warning: '#D4A574',
  warningSoft: '#F5EDE0',
  warningText: '#8B6F3C',

  /** Terracotta — pour alerte non-critique, hausse attention requise */
  danger: '#C97A5A',
  dangerSoft: '#F5E6DC',
  dangerText: '#8B4F35',

  /** Rouge profond — RÉSERVÉ aux vraies urgences (perte, fraude, rupture) */
  critical: '#B91C1C',
  criticalSoft: '#FEE2E2',
  criticalText: '#7F1D1D',

  /** Bleu sarcelle — pour info neutre, statut en cours */
  info: '#5A8FA1',
  infoSoft: '#DBE7EC',
  infoText: '#3F6878',

  /** Neutre — pour valeurs sans connotation */
  neutral: '#737373',
  neutralSoft: '#F5F5F5',
  neutralText: '#525252',
};

/**
 * Helper : retourne la couleur sémantique selon une valeur signée.
 *  - positive → success (sage)
 *  - négative → danger (clay)
 *  - zéro     → neutral
 */
export function signedColor(value: number, options?: { inverse?: boolean }): string {
  if (Math.abs(value) < 0.01) return SEMANTIC.neutral;
  const positive = options?.inverse ? value < 0 : value > 0;
  return positive ? SEMANTIC.success : SEMANTIC.danger;
}

/**
 * Helper : retourne la couleur selon un seuil 3 niveaux.
 *  - >= goodThreshold      → success
 *  - >= warningThreshold   → warning
 *  - sinon                 → danger
 */
export function thresholdColor(
  value: number,
  goodThreshold: number,
  warningThreshold: number,
  options?: { inverse?: boolean },
): string {
  if (options?.inverse) {
    if (value <= goodThreshold) return SEMANTIC.success;
    if (value <= warningThreshold) return SEMANTIC.warning;
    return SEMANTIC.danger;
  }
  if (value >= goodThreshold) return SEMANTIC.success;
  if (value >= warningThreshold) return SEMANTIC.warning;
  return SEMANTIC.danger;
}

/**
 * Helper : retourne la couleur selon un statut texte.
 */
export function statusColor(status: 'good' | 'warn' | 'alert' | 'critical' | string): string {
  if (status === 'good') return SEMANTIC.success;
  if (status === 'warn') return SEMANTIC.warning;
  if (status === 'alert') return SEMANTIC.danger;
  if (status === 'critical') return SEMANTIC.critical;
  return SEMANTIC.neutral;
}
