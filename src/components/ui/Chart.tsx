import ReactECharts from 'echarts-for-react';
import { useApp } from '../../store/app';

export function Chart({ option, height = 280 }: { option: any; height?: number }) {
  const theme = useApp((s) => s.theme);
  const txt = theme === 'dark' ? '#d4d4d4' : '#404040';
  const grid = theme === 'dark' ? '#262626' : '#e5e5e5';

  const merged = {
    textStyle: { fontFamily: 'Exo 2', color: txt },
    grid: { left: 50, right: 20, top: 30, bottom: 30, containLabel: true },
    tooltip: {
      trigger: 'axis',
      backgroundColor: theme === 'dark' ? '#171717' : '#ffffff',
      borderColor: grid,
      textStyle: { color: txt, fontFamily: 'Exo 2' },
    },
    legend: { textStyle: { color: txt }, top: 0 },
    xAxis: {
      axisLine: { lineStyle: { color: grid } },
      axisLabel: { color: txt },
      splitLine: { lineStyle: { color: grid } },
    },
    yAxis: {
      axisLine: { lineStyle: { color: grid } },
      axisLabel: { color: txt },
      splitLine: { lineStyle: { color: grid } },
    },
    ...option,
  };

  return <ReactECharts option={merged} style={{ height }} notMerge theme={theme} />;
}
