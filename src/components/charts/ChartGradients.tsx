// Dégradés SVG réutilisables pour les charts Recharts — identité de marque
// (sauge/terracotta) en version moderne : barres avec fondu vertical, areas
// avec remplissage dégradé → transparent.
//
// Usage (dans un chart Recharts) :
//   <BarChart ...>
//     <ChartGradients />
//     <Bar dataKey="x" fill={`url(#${barGradId(0)})`} radius={[6,6,0,0]} />
//   </BarChart>
//
// Les dégradés sont indexés sur palette.chartColors (mêmes index que ct.at(i)).
// `idPrefix` permet d'isoler plusieurs jeux de dégradés sur une même page si
// besoin (évite toute collision d'id entre SVG distincts).
import { useChartColors } from '../../store/theme';

export const barGradId = (i: number, prefix = 'cg') => `${prefix}-bar-${i}`;
export const areaGradId = (i: number, prefix = 'cg') => `${prefix}-area-${i}`;

// Éclaircit une couleur hex vers le blanc (amt 0..1). Renvoie la couleur telle
// quelle si ce n'est pas un hex (ex. 'rgb(var(--accent))').
export function lighten(color: string, amt: number): string {
  const h = color.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return color;
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  const m = (c: number) => Math.round(c + (255 - c) * amt).toString(16).padStart(2, '0');
  return `#${m(r)}${m(g)}${m(b)}`;
}

export function ChartGradients({ colors, idPrefix = 'cg' }: { colors?: string[]; idPrefix?: string }) {
  const palette = useChartColors();
  const cols = colors ?? palette;
  return (
    <defs>
      {/* Barres : dégradé glossy — sommet éclairci, base saturée */}
      {cols.map((c, i) => (
        <linearGradient key={`b-${i}`} id={barGradId(i, idPrefix)} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={lighten(c, 0.32)} stopOpacity={1} />
          <stop offset="55%" stopColor={c} stopOpacity={1} />
          <stop offset="100%" stopColor={c} stopOpacity={0.82} />
        </linearGradient>
      ))}
      {/* Aires : remplissage dégradé → transparent */}
      {cols.map((c, i) => (
        <linearGradient key={`a-${i}`} id={areaGradId(i, idPrefix)} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={c} stopOpacity={0.38} />
          <stop offset="60%" stopColor={c} stopOpacity={0.12} />
          <stop offset="98%" stopColor={c} stopOpacity={0.01} />
        </linearGradient>
      ))}
    </defs>
  );
}
