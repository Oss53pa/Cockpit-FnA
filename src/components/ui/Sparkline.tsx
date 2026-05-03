import ReactECharts from 'echarts-for-react';

/**
 * Sparkline premium — niveau Cockpit CR / Stripe Dashboard.
 *
 * - Smooth Bezier curve (pas de pics anguleux)
 * - Gradient fill subtle (opacity 0.15 → 0)
 * - Stroke fin 1.5px
 * - Padding interne pour eviter clipping
 */
export function Sparkline({
  data,
  color = '#7FA88E',
  height = 40,
  strokeWidth = 1.5,
  fillOpacity = 0.15,
}: {
  data: number[];
  color?: string;
  height?: number;
  strokeWidth?: number;
  fillOpacity?: number;
}) {
  // Convertit l'opacity en hex (00-FF)
  const opacityHex = Math.round(fillOpacity * 255).toString(16).padStart(2, '0').toUpperCase();

  const option = {
    grid: { top: 4, right: 2, bottom: 2, left: 2 },
    xAxis: { type: 'category', show: false, data: data.map((_, i) => i) },
    yAxis: { type: 'value', show: false, scale: true },
    tooltip: { show: false },
    animation: false,
    series: [{
      type: 'line',
      smooth: 0.4,
      symbol: 'none',
      data,
      lineStyle: { color, width: strokeWidth, cap: 'round', join: 'round' },
      areaStyle: {
        color: {
          type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: color + opacityHex },
            { offset: 1, color: color + '00' },
          ],
        },
      },
    }],
  };
  return <ReactECharts option={option} style={{ height, width: '100%' }} opts={{ renderer: 'svg' }} />;
}
