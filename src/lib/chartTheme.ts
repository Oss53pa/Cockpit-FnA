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
    // Couleur indexée
    at: (i: number) => palette.chartColors[i % palette.chartColors.length],
  };
}
