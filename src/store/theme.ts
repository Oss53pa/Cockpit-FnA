// Palette globale appliquée à toute l'app (charts, tables, KPIs, dashboards)
import { create } from 'zustand';

export type PaletteKey = 'mono' | 'corporate' | 'forest' | 'sunset' | 'ocean' | 'royal' | 'bw';

export type Palette = {
  name: string;
  primary: string;          // couleur d'accent principale
  secondary: string;
  accent: string;
  tableHeader: string;      // fond du header de table
  tableHeaderText: string;
  chartColors: string[];    // 7 nuances pour graphiques (camembert, etc.)
};

export const PALETTES: Record<PaletteKey, Palette> = {
  mono: {
    name: 'Monochrome (défaut)',
    primary: '#171717', secondary: '#404040', accent: '#737373',
    tableHeader: '#171717', tableHeaderText: '#fafafa',
    chartColors: ['#0a0a0a', '#262626', '#404040', '#525252', '#737373', '#a3a3a3', '#d4d4d4'],
  },
  corporate: {
    name: 'Corporate (bleu)',
    primary: '#1e40af', secondary: '#3b82f6', accent: '#6366f1',
    tableHeader: '#1e3a5f', tableHeaderText: '#ffffff',
    chartColors: ['#1e3a5f', '#1e40af', '#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe', '#dbeafe'],
  },
  forest: {
    name: 'Forêt (vert)',
    primary: '#065f46', secondary: '#10b981', accent: '#14b8a6',
    tableHeader: '#064e3b', tableHeaderText: '#ffffff',
    chartColors: ['#064e3b', '#065f46', '#047857', '#10b981', '#34d399', '#6ee7b7', '#a7f3d0'],
  },
  sunset: {
    name: 'Coucher (orange)',
    primary: '#9a3412', secondary: '#f97316', accent: '#fb923c',
    tableHeader: '#7c2d12', tableHeaderText: '#ffffff',
    chartColors: ['#7c2d12', '#9a3412', '#c2410c', '#f97316', '#fb923c', '#fdba74', '#fed7aa'],
  },
  ocean: {
    name: 'Océan (cyan)',
    primary: '#0e7490', secondary: '#06b6d4', accent: '#22d3ee',
    tableHeader: '#155e75', tableHeaderText: '#ffffff',
    chartColors: ['#155e75', '#0e7490', '#0891b2', '#06b6d4', '#22d3ee', '#67e8f9', '#a5f3fc'],
  },
  royal: {
    name: 'Royal (violet)',
    primary: '#5b21b6', secondary: '#7c3aed', accent: '#a855f7',
    tableHeader: '#4c1d95', tableHeaderText: '#ffffff',
    chartColors: ['#3b0764', '#4c1d95', '#5b21b6', '#7c3aed', '#a855f7', '#c084fc', '#d8b4fe'],
  },
  bw: {
    name: 'N&B strict',
    primary: '#000000', secondary: '#525252', accent: '#737373',
    tableHeader: '#000000', tableHeaderText: '#ffffff',
    chartColors: ['#000000', '#262626', '#404040', '#525252', '#737373', '#a3a3a3', '#d4d4d4'],
  },
};

const KEY = 'app-palette';

type ThemeState = {
  paletteKey: PaletteKey;
  palette: Palette;
  setPalette: (k: PaletteKey) => void;
};

function loadKey(): PaletteKey {
  const v = localStorage.getItem(KEY) as PaletteKey | null;
  return v && v in PALETTES ? v : 'mono';
}

export const useTheme = create<ThemeState>((set) => ({
  paletteKey: loadKey(),
  palette: PALETTES[loadKey()],
  setPalette: (k) => {
    localStorage.setItem(KEY, k);
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
