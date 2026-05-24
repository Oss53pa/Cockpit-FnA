// Builders d'option ECharts réutilisables — 3 modèles "infographie" themables.
//
// Chaque fonction renvoie un objet `option` à passer tel quel au wrapper
// <Chart option={...} /> (src/components/ui/Chart.tsx). Les couleurs et les
// tons (texte/track) sont injectés via `opts` pour rester sur la palette de
// marque + supporter le mode sombre — voir src/store/theme.ts (useChartColors)
// et useChartTheme().
//
// Usage type (dans une page) :
//   const colors = useChartColors();
//   <Chart option={pillBarOption(data, { colors, unit: '%' })} />

type ChartOption = Record<string, any>;

// Palette de secours si aucune `colors` n'est fournie (= palette Twisty).
const FALLBACK = ['#7FA88E', '#C97A5A', '#5E8772', '#D4A574', '#737373', '#B5C4A8', '#A3A3A3'];

interface CommonOpts {
  /** Palette de la marque — généralement useChartColors() */
  colors?: string[];
  /** Couleur du texte (axes / labels centraux) — adapter au thème */
  textColor?: string;
  /** Couleur des "tracks" fantômes / bordures de parts — adapter au thème */
  trackColor?: string;
  /** Suffixe d'unité ('%', ' M', '€'…) appliqué aux valeurs */
  unit?: string;
  /** Formatage custom des valeurs (prioritaire sur `unit`) — ex. fmtK pour XOF */
  valueFormatter?: (v: number) => string;
  /** Largeur de barre en px */
  barWidth?: number;
}

const pick = (colors: string[], i: number) => colors[i % colors.length];

// ── Modèle 1 : barres "pilule" sur track fantôme (style timeline) ────────────
export interface PillBarDatum {
  label: string;
  value: number;
}

export function pillBarOption(
  data: PillBarDatum[],
  opts: CommonOpts & { max?: number } = {},
): ChartOption {
  const colors = opts.colors ?? FALLBACK;
  const text = opts.textColor ?? '#737373';
  const track = opts.trackColor ?? 'rgba(120,120,120,0.14)';
  const unit = opts.unit ?? '';
  const fmt = opts.valueFormatter ?? ((v: number) => `${v}${unit}`);
  const bw = opts.barWidth ?? 26;
  const max = opts.max ?? Math.ceil((Math.max(...data.map((d) => d.value)) || 1) * 1.15);
  const radius = [bw, bw, bw, bw];

  return {
    grid: { left: 8, right: 8, top: 36, bottom: 24, containLabel: true },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'none' },
      formatter: (ps: any[]) => `${ps[0].axisValue}<br/><b>${fmt(ps[0].value)}</b>`,
    },
    legend: { show: false },
    xAxis: {
      type: 'category',
      data: data.map((d) => d.label),
      axisTick: { show: false },
      axisLine: { lineStyle: { color: track } },
      axisLabel: { color: text, fontFamily: 'Exo 2' },
    },
    yAxis: { type: 'value', max, show: false, splitLine: { show: false } },
    series: [
      {
        type: 'bar',
        barWidth: bw,
        showBackground: true,
        backgroundStyle: { color: track, borderRadius: radius },
        data: data.map((d, i) => ({
          value: d.value,
          itemStyle: { color: pick(colors, i), borderRadius: radius },
        })),
        label: {
          show: true,
          position: 'insideTop',
          distance: 10,
          color: '#fff',
          fontWeight: 700,
          fontFamily: 'Exo 2',
          formatter: (p: any) => fmt(p.value),
        },
      },
    ],
  };
}

// ── Modèle 2 : donut "explosé" avec libellé central ──────────────────────────
export interface DonutDatum {
  name: string;
  value: number;
}

export function explodedDonutOption(
  data: DonutDatum[],
  opts: CommonOpts & {
    centerTitle?: string;
    centerSubtitle?: string;
    explodeIndex?: number;
  } = {},
): ChartOption {
  const colors = opts.colors ?? FALLBACK;
  const text = opts.textColor ?? '#404040';
  const border = opts.trackColor ?? '#ffffff';
  const unit = opts.unit ?? '';
  const fmt = opts.valueFormatter ?? ((v: number) => `${v}${unit}`);
  const explode = opts.explodeIndex ?? -1;

  return {
    grid: { show: false },
    xAxis: { show: false },
    yAxis: { show: false },
    tooltip: {
      trigger: 'item',
      formatter: (p: any) => `${p.name}<br/><b>${fmt(p.value)}</b> (${p.percent}%)`,
    },
    legend: { show: false },
    title: opts.centerTitle
      ? {
          text: opts.centerTitle,
          subtext: opts.centerSubtitle ?? '',
          left: 'center',
          top: 'center',
          textAlign: 'center',
          textStyle: { color: text, fontSize: 26, fontWeight: 800, fontFamily: 'Exo 2' },
          subtextStyle: {
            color: text,
            fontSize: 11,
            fontWeight: 600,
            fontFamily: 'Exo 2',
            opacity: 0.6,
          },
        }
      : undefined,
    series: [
      {
        type: 'pie',
        radius: ['54%', '80%'],
        center: ['50%', '52%'],
        avoidLabelOverlap: true,
        selectedMode: 'single',
        selectedOffset: 16,
        itemStyle: { borderColor: border, borderWidth: 3, borderRadius: 6 },
        labelLine: { show: false },
        label: {
          show: true,
          position: 'inside',
          color: '#fff',
          fontWeight: 700,
          fontFamily: 'Exo 2',
          formatter: (p: any) => `${Math.round(p.percent)}%`,
        },
        data: data.map((d, i) => ({
          name: d.name,
          value: d.value,
          selected: i === explode,
          itemStyle: { color: pick(colors, i) },
        })),
      },
    ],
  };
}

// ── Modèle 3 : waterfall (cascade) à barres "pilule" ─────────────────────────
export interface WaterfallDatum {
  label: string;
  /** Variation (signée) pour les étapes ; valeur absolue si isTotal */
  value: number;
  /** Barre de total/sous-total (part de 0) */
  isTotal?: boolean;
}

export function waterfallOption(
  data: WaterfallDatum[],
  opts: CommonOpts = {},
): ChartOption {
  const colors = opts.colors ?? FALLBACK;
  const incColor = pick(colors, 0);
  const decColor = pick(colors, 1);
  const totalColor = opts.trackColor ?? pick(colors, 4);
  const text = opts.textColor ?? '#737373';
  const unit = opts.unit ?? '';
  const fmt = opts.valueFormatter ?? ((v: number) => `${v}${unit}`);
  // Valeur signée, sans signe pour les totaux/sous-totaux
  const sign = (d: WaterfallDatum) => (d.isTotal || d.value < 0 ? fmt(d.value) : `+${fmt(d.value)}`);
  const bw = opts.barWidth ?? 30;
  const radius = [bw, bw, bw, bw];

  // Astuce waterfall : une série transparente sert de socle, la série visible
  // "flotte" au-dessus. Pour une baisse, le socle descend déjà au cumul final.
  const base: number[] = [];
  const values: number[] = [];
  const itemColors: string[] = [];
  let cum = 0;
  for (const d of data) {
    if (d.isTotal) {
      base.push(0);
      values.push(d.value);
      itemColors.push(totalColor);
      cum = d.value;
    } else if (d.value >= 0) {
      base.push(cum);
      values.push(d.value);
      itemColors.push(incColor);
      cum += d.value;
    } else {
      base.push(cum + d.value);
      values.push(-d.value);
      itemColors.push(decColor);
      cum += d.value;
    }
  }

  return {
    grid: { left: 8, right: 8, top: 36, bottom: 24, containLabel: true },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (ps: any[]) => {
        const d = data[ps[0].dataIndex];
        return `${d.label}<br/><b>${sign(d)}</b>`;
      },
    },
    legend: { show: false },
    xAxis: {
      type: 'category',
      data: data.map((d) => d.label),
      axisTick: { show: false },
      axisLine: { lineStyle: { color: 'rgba(120,120,120,0.25)' } },
      axisLabel: { color: text, fontFamily: 'Exo 2', interval: 0, hideOverlap: true },
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: text, fontFamily: 'Exo 2' },
      splitLine: { lineStyle: { color: 'rgba(120,120,120,0.12)' } },
    },
    series: [
      {
        name: 'base',
        type: 'bar',
        stack: 'wf',
        barWidth: bw,
        itemStyle: { color: 'transparent' },
        emphasis: { itemStyle: { color: 'transparent' } },
        tooltip: { show: false },
        data: base,
      },
      {
        name: 'value',
        type: 'bar',
        stack: 'wf',
        barWidth: bw,
        data: values.map((v, i) => ({
          value: v,
          itemStyle: { color: itemColors[i], borderRadius: radius },
        })),
        label: {
          show: true,
          position: 'top',
          color: text,
          fontWeight: 700,
          fontFamily: 'Exo 2',
          formatter: (p: any) => sign(data[p.dataIndex]),
        },
      },
    ],
  };
}
