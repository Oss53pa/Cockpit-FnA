// Palette de fallback alignee sur Twisty (palette par defaut).
// Ces couleurs sont utilisees quand un composant veut une couleur fixe (ex:
// `color={C.primary}` sur un KPICard pour la pastille d'icone). Elles doivent
// rester COHERENTES avec la palette twisty principale (zinc froid + orange).
//
// Pour des couleurs DYNAMIQUES qui suivent la palette active, utiliser
// directement `rgb(var(--accent))`, `rgb(var(--p-900))`, etc. dans le style.
export const C = {
  // Grayscale Twisty (zinc froid Tailwind default)
  primary:   '#18181B',  // accent neutre noir (KPI standard)
  secondary: '#3F3F46',
  dark:      '#09090B',
  neutral:   '#A1A1AA',
  light:     '#E4E4E7',

  // Accent Twisty (orange chaud)
  accent:    '#F47B45',  // accent vif (KPI primaire / CTA)
  accentSoft:'#FFB400',  // accent ambre (badges)

  // Statuts fonctionnels
  success:   '#22c55e',
  warning:   '#f59e0b',
  danger:    '#ef4444',
  info:      '#3b82f6',

  // Niveaux de severite
  sevLow:      '#6b7280',
  sevMedium:   '#f59e0b',
  sevHigh:     '#ef4444',
  sevCritical: '#7f1d1d',

  // Nuances grayscale utilisees comme "accents" neutres dans les charts
  accent1:   '#52525B',
  accent2:   '#71717A',
  accent3:   '#27272A',
  accent4:   '#D4D4D8',
};

// Couleurs de graphique par defaut (utilisees si aucune palette n'est chargee)
// Sequence : noir Twisty -> orange accent -> gris -> ambre -> ...
export const CHART_COLORS = ['#18181B', '#F47B45', '#71717A', '#FFB400', '#3F3F46', '#A1A1AA', '#E4E4E7'];
