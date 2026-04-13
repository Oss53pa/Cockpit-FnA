import ReactECharts from 'echarts-for-react';

export function Sparkline({ data, color = '#171717', height = 40 }: { data: number[]; color?: string; height?: number }) {
  const option = {
    grid: { top: 2, right: 2, bottom: 2, left: 2 },
    xAxis: { type: 'category', show: false, data: data.map((_, i) => i) },
    yAxis: { type: 'value', show: false, scale: true },
    tooltip: { show: false },
    series: [{
      type: 'line', smooth: true, symbol: 'none',
      data,
      lineStyle: { color, width: 2 },
      areaStyle: {
        color: {
          type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: color + '40' },
            { offset: 1, color: color + '00' },
          ],
        },
      },
    }],
  };
  return <ReactECharts option={option} style={{ height, width: '100%' }} opts={{ renderer: 'svg' }} />;
}
