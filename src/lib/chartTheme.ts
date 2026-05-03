// Theme charts premium — niveau Cockpit CR / Linear / Stripe Dashboard
// Barres fines avec radius prononcé, smooth curves, tooltips premium glassmorphic.
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
    // Grille & axes (ultra-minimalistes)
    grid: palette.scale[2],
    gridDark: palette.scale[8],
    axisColor: palette.scale[4],
    // Bars : fines + radius prononcé (signature premium)
    barCategoryGap: '35%',
    barSize: 12,
    barRadius: 6 as number,
    // Smooth curve type pour line charts (Catmull-Rom natural)
    curveType: 'natural' as const,
    // Tooltip — backdrop blur + border refine + shadow premium (style Linear)
    tooltipStyle: {
      backgroundColor: 'rgba(31, 30, 27, 0.96)',
      backdropFilter: 'blur(8px)',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      borderRadius: 12,
      padding: '10px 14px',
      color: palette.scale[0],
      fontSize: 12,
      fontWeight: 500,
      boxShadow: '0 16px 40px -8px rgba(0, 0, 0, 0.30), 0 0 0 1px rgba(0, 0, 0, 0.05)',
      outline: 'none',
    } as React.CSSProperties,
    tooltipItemStyle: { color: palette.scale[0], fontWeight: 600 } as React.CSSProperties,
    tooltipLabelStyle: {
      color: palette.scale[3],
      fontSize: 10,
      fontWeight: 600,
      letterSpacing: '0.06em',
      textTransform: 'uppercase' as const,
      marginBottom: 4,
      opacity: 0.7,
    } as React.CSSProperties,
    tooltipCursor: { fill: 'rgba(0, 0, 0, 0.03)' },
    // Axes ultra-minimalistes
    axisProps: {
      stroke: 'transparent',
      tick: { fill: palette.scale[4], fontSize: 11, fontFamily: 'Inter', fontWeight: 500 },
      tickLine: false,
      axisLine: false,
      tickMargin: 8,
    },
    // Cartesian grid : juste horizontale, dotted, ultra-discrète
    gridProps: {
      stroke: palette.scale[2],
      strokeDasharray: '2 4',
      vertical: false,
    },
    // Gradients pour areas / barres avec effet "glow"
    gradient: (variant: 'a' | 'b' | 'c') => {
      const s = palette.scale;
      if (variant === 'a') return `linear-gradient(135deg, ${s[10]} 0%, ${s[7]} 100%)`;
      if (variant === 'b') return `linear-gradient(135deg, ${s[9]} 0%, ${s[6]} 100%)`;
      return `linear-gradient(135deg, ${s[8]} 0%, ${s[5]} 100%)`;
    },
    at: (i: number) => palette.chartColors[i % palette.chartColors.length],
  };
}
