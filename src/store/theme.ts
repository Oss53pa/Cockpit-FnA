// Palette globale appliquée à toute l'app (charts, tables, KPIs, dashboards)
import { create } from 'zustand';

export type PaletteKey =
  | 'graphite' | 'ardoise' | 'marine' | 'foret'
  | 'sable' | 'bordeaux' | 'acier' | 'aubergine';

export type Palette = {
  name: string;
  /** Échelle 50→950 de gris teintés pour l'UI entière */
  scale: [string, string, string, string, string, string, string, string, string, string, string];
  /** Couleur d'en-tête de table */
  tableHeader: string;
  tableHeaderText: string;
  /** 7 couleurs distinctes pour les graphiques */
  chartColors: string[];
};

// ── Palettes sobres, élégantes, épurées ────────────────────────────
export const PALETTES: Record<PaletteKey, Palette> = {

  graphite: {
    name: 'Graphite',
    //        50        100       200       300       400       500       600       700       800       900       950
    scale: ['#fafafa','#f5f5f5','#e5e5e5','#d4d4d4','#a3a3a3','#737373','#525252','#404040','#262626','#171717','#0a0a0a'],
    tableHeader: '#171717', tableHeaderText: '#fafafa',
    chartColors: ['#374151','#6b7280','#9ca3af','#4b5563','#d1d5db','#1f2937','#e5e7eb'],
  },

  ardoise: {
    name: 'Ardoise',
    scale: ['#f8fafc','#f1f5f9','#e2e8f0','#cbd5e1','#94a3b8','#64748b','#475569','#334155','#1e293b','#0f172a','#020617'],
    tableHeader: '#0f172a', tableHeaderText: '#f8fafc',
    chartColors: ['#334155','#64748b','#94a3b8','#475569','#cbd5e1','#1e293b','#e2e8f0'],
  },

  marine: {
    name: 'Marine',
    scale: ['#f0f5ff','#e0eafc','#c2d4f2','#9bb5e0','#6889c0','#456da0','#2f5285','#1e3a6a','#122a52','#0a1a38','#050e20'],
    tableHeader: '#122a52', tableHeaderText: '#f0f5ff',
    chartColors: ['#1e3a6a','#456da0','#6889c0','#2f5285','#9bb5e0','#0a1a38','#c2d4f2'],
  },

  foret: {
    name: 'Forêt',
    scale: ['#f2f7f4','#e4efe8','#c8ddd0','#a3c5b0','#6fa388','#4d8068','#375e4c','#264536','#183024','#0e1f16','#06120c'],
    tableHeader: '#183024', tableHeaderText: '#f2f7f4',
    chartColors: ['#264536','#4d8068','#6fa388','#375e4c','#a3c5b0','#0e1f16','#c8ddd0'],
  },

  sable: {
    name: 'Sable',
    scale: ['#faf8f5','#f5f0ea','#e8dfd4','#d4c7b5','#b3a28a','#8e7d66','#6e604a','#544834','#3a3022','#251e14','#14100a'],
    tableHeader: '#3a3022', tableHeaderText: '#faf8f5',
    chartColors: ['#544834','#8e7d66','#b3a28a','#6e604a','#d4c7b5','#251e14','#e8dfd4'],
  },

  bordeaux: {
    name: 'Bordeaux',
    scale: ['#fdf5f5','#f8e8e8','#eecfcf','#dba8a8','#c07878','#9c5555','#7a3c3c','#5e2a2a','#421c1c','#2c1010','#1a0808'],
    tableHeader: '#421c1c', tableHeaderText: '#fdf5f5',
    chartColors: ['#5e2a2a','#9c5555','#c07878','#7a3c3c','#dba8a8','#2c1010','#eecfcf'],
  },

  acier: {
    name: 'Acier',
    scale: ['#f4f6f8','#e8ecf0','#d0d8e0','#adbac7','#8294a5','#5f7485','#46596a','#324050','#212e3b','#141e28','#0a1018'],
    tableHeader: '#212e3b', tableHeaderText: '#f4f6f8',
    chartColors: ['#324050','#5f7485','#8294a5','#46596a','#adbac7','#141e28','#d0d8e0'],
  },

  aubergine: {
    name: 'Aubergine',
    scale: ['#f9f5fa','#f0e8f2','#decfe4','#c4a8cc','#a078aa','#7e558a','#613c6c','#482a52','#321c3a','#201028','#120818'],
    tableHeader: '#321c3a', tableHeaderText: '#f9f5fa',
    chartColors: ['#482a52','#7e558a','#a078aa','#613c6c','#c4a8cc','#201028','#decfe4'],
  },
};

// ── CSS variable injection ─────────────────────────────────────────
const SCALE_KEYS = ['--p-50','--p-100','--p-200','--p-300','--p-400','--p-500','--p-600','--p-700','--p-800','--p-900','--p-950'] as const;

function hexToRgb(hex: string): string {
  const h = hex.replace('#', '');
  return `${parseInt(h.substring(0, 2), 16)} ${parseInt(h.substring(2, 4), 16)} ${parseInt(h.substring(4, 6), 16)}`;
}

function applyPalette(p: Palette) {
  const s = document.documentElement.style;
  for (let i = 0; i < 11; i++) {
    s.setProperty(SCALE_KEYS[i], hexToRgb(p.scale[i]));
  }
  s.setProperty('--th-bg', p.tableHeader);
  s.setProperty('--th-text', p.tableHeaderText);
}

// ── Store ──────────────────────────────────────────────────────────
const KEY = 'app-palette';

type ThemeState = {
  paletteKey: PaletteKey;
  palette: Palette;
  setPalette: (k: PaletteKey) => void;
};

function loadKey(): PaletteKey {
  const v = localStorage.getItem(KEY) as PaletteKey | null;
  return v && v in PALETTES ? v : 'graphite';
}

// Apply on first load
applyPalette(PALETTES[loadKey()]);

export const useTheme = create<ThemeState>((set) => ({
  paletteKey: loadKey(),
  palette: PALETTES[loadKey()],
  setPalette: (k) => {
    localStorage.setItem(KEY, k);
    applyPalette(PALETTES[k]);
    set({ paletteKey: k, palette: PALETTES[k] });
  },
}));

// Helpers pratiques
export function useChartColors() {
  return useTheme((s) => s.palette.chartColors);
}
export function usePalette() {
  return useTheme((s) => s.palette);
}
