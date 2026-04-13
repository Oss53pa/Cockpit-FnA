// Helpers d'application de la palette aux Recharts
import { useTheme } from '../store/theme';

export function useChartTheme() {
  const palette = useTheme((s) => s.palette);
  return {
    colors: palette.chartColors,
    primary: palette.primary,
    secondary: palette.secondary,
    accent: palette.accent,
    // Couleurs de référence pour Bar/Line/Area/Pie
    bar: palette.chartColors[0],
    barAlt: palette.chartColors[3],
    line: palette.chartColors[0],
    area: palette.chartColors[0],
    // Couleur indexée
    at: (i: number) => palette.chartColors[i % palette.chartColors.length],
  };
}
