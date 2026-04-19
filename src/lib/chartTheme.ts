// Helpers d'application de la palette aux Recharts
import { useTheme } from '../store/theme';

export function useChartTheme() {
  const palette = useTheme((s) => s.palette);
  return {
    colors: palette.chartColors,
    // Couleurs de référence pour Bar/Line/Area/Pie
    bar: palette.chartColors[0],
    barAlt: palette.chartColors[1],
    line: palette.chartColors[0],
    area: palette.chartColors[2],
    // Grille & axes
    grid: palette.scale[2],       // couleur légère pour CartesianGrid
    gridDark: palette.scale[8],   // pour le dark mode
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
