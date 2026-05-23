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

export function ChartGradients({ colors, idPrefix = 'cg' }: { colors?: string[]; idPrefix?: string }) {
  const palette = useChartColors();
  const cols = colors ?? palette;
  return (
    <defs>
      {cols.map((c, i) => (
        <linearGradient key={`b-${i}`} id={barGradId(i, idPrefix)} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={c} stopOpacity={0.95} />
          <stop offset="100%" stopColor={c} stopOpacity={0.5} />
        </linearGradient>
      ))}
      {cols.map((c, i) => (
        <linearGradient key={`a-${i}`} id={areaGradId(i, idPrefix)} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={c} stopOpacity={0.34} />
          <stop offset="95%" stopColor={c} stopOpacity={0.02} />
        </linearGradient>
      ))}
    </defs>
  );
}
