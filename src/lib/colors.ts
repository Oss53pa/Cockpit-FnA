// Palette grayscale + statuts OHADA (fallback quand le store n'est pas disponible)
export const C = {
  // Grayscale (pour charts, KPIs, éléments neutres)
  primary:   '#171717',
  secondary: '#404040',
  dark:      '#0a0a0a',
  neutral:   '#a3a3a3',
  light:     '#e5e5e5',

  // Statuts fonctionnels
  success:   '#22c55e',
  warning:   '#f59e0b',
  danger:    '#ef4444',
  info:      '#3b82f6',

  // Nuances grayscale utilisées comme "accents" neutres dans les charts
  accent1:   '#525252',
  accent2:   '#737373',
  accent3:   '#262626',
  accent4:   '#d4d4d4',
};

// Couleurs de graphique par défaut (utilisées si aucune palette n'est chargée)
export const CHART_COLORS = ['#374151', '#6b7280', '#9ca3af', '#4b5563', '#d1d5db', '#1f2937', '#e5e7eb'];
