// Helpers d'application de la palette aux Recharts (style Twisty :
// barres fines, axe minimal, tooltip sombre, accent orange)
import { useTheme } from '../store/theme';

export function useChartTheme() {
  const palette = useTheme((s) => s.palette);
  const layout = palette.layout;
  return {
    colors: palette.chartColors,
    // Couleurs de référence pour Bar/Line/Area/Pie
    bar: palette.chartColors[0],
    barAlt: palette.chartColors[1],
    barInactive: palette.scale[2],   // barre "neutre" (gris doux) pour les non-highlighted
    line: palette.chartColors[0],
    area: palette.chartColors[2],
    accent: layout?.accent ?? palette.chartColors[1],
    // Grille & axes
    grid: palette.scale[2],       // couleur légère pour CartesianGrid
    gridDark: palette.scale[8],   // pour le dark mode
    // Style Twisty : barres très fines, espacement large
    barCategoryGap: '40%',
    barSize: 8,
    barRadius: 4 as number,
    // Tooltip dark style Twisty
    tooltipStyle: {
      backgroundColor: palette.scale[10],
      border: 'none',
      borderRadius: 8,
      padding: '6px 10px',
      color: palette.scale[0],
      fontSize: 11,
      fontWeight: 600,
    } as React.CSSProperties,
    tooltipItemStyle: { color: palette.scale[0] } as React.CSSProperties,
    tooltipLabelStyle: { color: palette.scale[3], fontSize: 10, fontWeight: 400 } as React.CSSProperties,
    // Gradients dynamiques pour les headers de dashboards
    gradient: (variant: 'a' | 'b' | 'c') => {
      const s = palette.scale;
      if (variant === 'a') return `linear-gradient(135deg, ${s[10]} 0%, ${s[7]} 100%)`;
      if (variant === 'b') return `linear-gradient(135deg, ${s[9]} 0%, ${s[6]} 100%)`;
      return `linear-gradient(135deg, ${s[8]} 0%, ${s[5]} 100%)`;
    },
    // Couleur indexée
    at: (i: number) => palette.chartColors[i % palette.chartColors.length],
  };
}
