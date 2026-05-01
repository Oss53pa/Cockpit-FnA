// Palette de fallback alignee sur Twisty EXACTE (5 couleurs sources).
// Ces couleurs sont utilisees quand un composant veut une couleur fixe (ex:
// `color={C.primary}` sur un KPICard pour la pastille d'icone). Elles doivent
// rester COHERENTES avec la palette twisty principale (cool-blue + orange).
//
// Pour des couleurs DYNAMIQUES qui suivent la palette active, utiliser
// directement `rgb(var(--accent))`, `rgb(var(--p-900))`, etc. dans le style.
export const C = {
  // Cool-blue Twisty (teinte HSL 218°, 22% — generee depuis #222834)
  primary:   '#222834',  // bleu nuit Twisty (noir source)
  secondary: '#3F4858',
  dark:      '#16191F',
  neutral:   '#939BAA',
  light:     '#E7EBEE',  // shell source

  // Accent Twisty
  accent:    '#DA4D28',  // orange-rouge source
  accentSoft:'#82B0D9',  // bleu clair source

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

  // Nuances cool-blue utilisees comme "accents" neutres dans les charts
  accent1:   '#525C6E',  // 600
  accent2:   '#6E7888',  // 500
  accent3:   '#2D3340',  // 800
  accent4:   '#B5B7C0',  // 300 — gris source
};

// Couleurs de graphique par defaut (utilisees si aucune palette n'est chargee)
// Sequence Twisty : noir -> orange -> bleu -> gris -> gris moyen -> ...
export const CHART_COLORS = ['#222834', '#DA4D28', '#82B0D9', '#B5B7C0', '#6E7888', '#E7EBEE', '#3F4858'];
