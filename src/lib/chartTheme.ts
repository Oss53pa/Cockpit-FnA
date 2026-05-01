// Theme charts premium — niveau international (Stripe / Linear / Vercel)
// Barres tres fines, axes minimaux, tooltip dark, accent sur la donnee active.
import { useTheme } from '../store/theme';

export function useChartTheme() {
  const palette = useTheme((s) => s.palette);
  const layout = palette.layout;
  return {
    colors: palette.chartColors,
    // Couleurs de reference Bar/Line/Area/Pie
    bar: palette.chartColors[0],
    barAlt: palette.chartColors[1],
    barInactive: palette.scale[2],   // barre "neutre" (gris doux)
    line: palette.chartColors[0],
    area: palette.chartColors[2],
    accent: layout?.accent ?? palette.chartColors[1],
    // Grille & axes (minimalistes)
    grid: palette.scale[2],
    gridDark: palette.scale[8],
    axisColor: palette.scale[4],
    // Style Twisty : barres fines, espacement large
    barCategoryGap: '40%',
    barSize: 8,
    barRadius: 4 as number,
    // Tooltip dark style premium
    tooltipStyle: {
      backgroundColor: palette.scale[10],
      border: 'none',
      borderRadius: 10,
      padding: '8px 12px',
      color: palette.scale[0],
      fontSize: 12,
      fontWeight: 600,
      boxShadow: '0 8px 24px -6px rgb(0 0 0 / 0.25), 0 4px 8px -4px rgb(0 0 0 / 0.15)',
    } as React.CSSProperties,
    tooltipItemStyle: { color: palette.scale[0] } as React.CSSProperties,
    tooltipLabelStyle: { color: palette.scale[3], fontSize: 11, fontWeight: 400, marginBottom: 2 } as React.CSSProperties,
    // Props axes minimalistes pour Recharts XAxis / YAxis
    axisProps: {
      stroke: palette.scale[3],
      tick: { fill: palette.scale[5], fontSize: 11, fontFamily: 'Inter' },
      tickLine: false,
      axisLine: { stroke: palette.scale[2] },
    },
    // Cartesian grid : juste horizontale, tres discrete
    gridProps: {
      stroke: palette.scale[2],
      strokeDasharray: '3 3',
      vertical: false,
    },
    // Gradients dynamiques pour les headers de dashboards
    gradient: (variant: 'a' | 'b' | 'c') => {
      const s = palette.scale;
      if (variant === 'a') return `linear-gradient(135deg, ${s[10]} 0%, ${s[7]} 100%)`;
      if (variant === 'b') return `linear-gradient(135deg, ${s[9]} 0%, ${s[6]} 100%)`;
      return `linear-gradient(135deg, ${s[8]} 0%, ${s[5]} 100%)`;
    },
    at: (i: number) => palette.chartColors[i % palette.chartColors.length],
  };
}
