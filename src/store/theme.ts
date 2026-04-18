// Palette globale appliquée à toute l'app (charts, tables, KPIs, dashboards)
import { create } from 'zustand';

export type PaletteKey = string;

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

// ── Génération automatique d'échelle à partir d'une couleur de base ──
function hexToHsl(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16) / 255;
  const g = parseInt(h.substring(2, 4), 16) / 255;
  const b = parseInt(h.substring(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let hue = 0, sat = 0;
  const lig = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    sat = lig > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) hue = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) hue = ((b - r) / d + 2) / 6;
    else hue = ((r - g) / d + 4) / 6;
  }
  return [hue * 360, sat * 100, lig * 100];
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** Génère une échelle 11 nuances à partir d'une couleur de base */
export function generateScale(baseHex: string): Palette['scale'] {
  const [h, s] = hexToHsl(baseHex);
  // lightness targets : 97 → 3 (clair vers foncé)
  const lightnesses = [97, 95, 90, 82, 65, 48, 36, 28, 18, 10, 4];
  // saturation : subtile en haut/bas, pleine au milieu
  const satFactors  = [0.15, 0.2, 0.3, 0.45, 0.65, 0.8, 0.9, 1, 1, 0.95, 0.9];
  return lightnesses.map((l, i) => hslToHex(h, Math.min(s * satFactors[i], 40), l)) as Palette['scale'];
}

// ── Palettes prédéfinies ───────────────────────────────────────────
export const BUILTIN_PALETTES: Record<string, Palette> = {
  graphite: {
    name: 'Graphite',
    scale: ['#fafafa','#f5f5f5','#e5e5e5','#d4d4d4','#a3a3a3','#737373','#525252','#404040','#262626','#171717','#0a0a0a'],
    tableHeader: '#171717', tableHeaderText: '#fafafa',
    chartColors: ['#374151','#dc2626','#2563eb','#d97706','#059669','#7c3aed','#db2777'],
  },
  ardoise: {
    name: 'Ardoise',
    scale: ['#f8fafc','#f1f5f9','#e2e8f0','#cbd5e1','#94a3b8','#64748b','#475569','#334155','#1e293b','#0f172a','#020617'],
    tableHeader: '#0f172a', tableHeaderText: '#f8fafc',
    chartColors: ['#475569','#0ea5e9','#f59e0b','#10b981','#8b5cf6','#f43f5e','#06b6d4'],
  },
  marine: {
    name: 'Marine',
    scale: ['#f0f5ff','#e0eafc','#c2d4f2','#9bb5e0','#6889c0','#456da0','#2f5285','#1e3a6a','#122a52','#0a1a38','#050e20'],
    tableHeader: '#122a52', tableHeaderText: '#f0f5ff',
    chartColors: ['#1e40af','#f59e0b','#10b981','#ef4444','#8b5cf6','#ec4899','#06b6d4'],
  },
  foret: {
    name: 'Forêt',
    scale: ['#f2f7f4','#e4efe8','#c8ddd0','#a3c5b0','#6fa388','#4d8068','#375e4c','#264536','#183024','#0e1f16','#06120c'],
    tableHeader: '#183024', tableHeaderText: '#f2f7f4',
    chartColors: ['#065f46','#d97706','#dc2626','#2563eb','#7c3aed','#db2777','#0891b2'],
  },
  sable: {
    name: 'Sable',
    scale: ['#faf8f5','#f5f0ea','#e8dfd4','#d4c7b5','#b3a28a','#8e7d66','#6e604a','#544834','#3a3022','#251e14','#14100a'],
    tableHeader: '#3a3022', tableHeaderText: '#faf8f5',
    chartColors: ['#92400e','#1d4ed8','#047857','#be123c','#6d28d9','#0e7490','#a16207'],
  },
  bordeaux: {
    name: 'Bordeaux',
    scale: ['#fdf5f5','#f8e8e8','#eecfcf','#dba8a8','#c07878','#9c5555','#7a3c3c','#5e2a2a','#421c1c','#2c1010','#1a0808'],
    tableHeader: '#421c1c', tableHeaderText: '#fdf5f5',
    chartColors: ['#991b1b','#2563eb','#d97706','#059669','#7c3aed','#0891b2','#c2410c'],
  },
  acier: {
    name: 'Acier',
    scale: ['#f4f6f8','#e8ecf0','#d0d8e0','#adbac7','#8294a5','#5f7485','#46596a','#324050','#212e3b','#141e28','#0a1018'],
    tableHeader: '#212e3b', tableHeaderText: '#f4f6f8',
    chartColors: ['#334155','#3b82f6','#f59e0b','#10b981','#ef4444','#8b5cf6','#ec4899'],
  },
  aubergine: {
    name: 'Aubergine',
    scale: ['#f9f5fa','#f0e8f2','#decfe4','#c4a8cc','#a078aa','#7e558a','#613c6c','#482a52','#321c3a','#201028','#120818'],
    tableHeader: '#321c3a', tableHeaderText: '#f9f5fa',
    chartColors: ['#7c3aed','#2563eb','#db2777','#f59e0b','#10b981','#ef4444','#0891b2'],
  },
  cobalt: {
    name: 'Cobalt',
    scale: ['#f0f4fa','#e1e8f4','#c3d1e8','#98b0d4','#6486b8','#45659a','#30497e','#203462','#142348','#0c1530','#060a1a'],
    tableHeader: '#142348', tableHeaderText: '#f0f4fa',
    chartColors: ['#1e40af','#ef4444','#f59e0b','#10b981','#a855f7','#ec4899','#14b8a6'],
  },
  olive: {
    name: 'Olive',
    scale: ['#f7f7f2','#efefe5','#ddddd0','#c2c2aa','#9e9e80','#7a7a5e','#5c5c44','#424230','#2e2e20','#1c1c12','#0e0e08'],
    tableHeader: '#2e2e20', tableHeaderText: '#f7f7f2',
    chartColors: ['#4d7c0f','#b45309','#1d4ed8','#be123c','#7e22ce','#0e7490','#a3a3a3'],
  },
  cuivre: {
    name: 'Cuivre',
    scale: ['#faf6f3','#f4ece5','#e6d5c8','#d0b5a0','#b38c6e','#906a4c','#704f36','#543a26','#3a281a','#261a10','#140e08'],
    tableHeader: '#3a281a', tableHeaderText: '#faf6f3',
    chartColors: ['#b45309','#1d4ed8','#047857','#be123c','#7e22ce','#0e7490','#d97706'],
  },
  encre: {
    name: 'Encre',
    scale: ['#f5f5f8','#eaeaf0','#d4d4e0','#b0b0c8','#8585a8','#636388','#4a4a6c','#353552','#24243a','#161626','#0a0a14'],
    tableHeader: '#24243a', tableHeaderText: '#f5f5f8',
    chartColors: ['#4338ca','#dc2626','#d97706','#059669','#db2777','#0891b2','#7c3aed'],
  },
  lavande: {
    name: 'Lavande',
    scale: ['#f8f5fa','#f0eaf4','#dfd2e8','#c5aed4','#a482b8','#825e9a','#634480','#4a3064','#34204a','#221432','#120a1c'],
    tableHeader: '#34204a', tableHeaderText: '#f8f5fa',
    chartColors: ['#7e22ce','#2563eb','#ec4899','#f59e0b','#059669','#ef4444','#06b6d4'],
  },
  cendre: {
    name: 'Cendre',
    scale: ['#f6f6f5','#edeceb','#dbd9d6','#c0bcb7','#9d9890','#7c766e','#5e5850','#45403a','#302c28','#1e1b18','#100e0c'],
    tableHeader: '#302c28', tableHeaderText: '#f6f6f5',
    chartColors: ['#57534e','#2563eb','#d97706','#059669','#dc2626','#7c3aed','#0891b2'],
  },
  ocean: {
    name: 'Océan',
    scale: ['#f0f7f8','#e0eef0','#c0dce0','#90c0c8','#609aa5','#407a88','#2c5c6a','#1e4250','#142e38','#0c1e25','#061014'],
    tableHeader: '#142e38', tableHeaderText: '#f0f7f8',
    chartColors: ['#0e7490','#2563eb','#f59e0b','#10b981','#ef4444','#8b5cf6','#ec4899'],
  },
  truffe: {
    name: 'Truffe',
    scale: ['#f8f5f5','#f0eae8','#e0d2ce','#c8ada6','#a88078','#886058','#6a4640','#50322e','#381e1c','#241210','#140808'],
    tableHeader: '#381e1c', tableHeaderText: '#f8f5f5',
    chartColors: ['#9a3412','#1d4ed8','#d97706','#047857','#7e22ce','#be123c','#0e7490'],
  },

  ludra: {
    name: 'Ludra',
    scale: ['#f7f8f7','#eff0ef','#dfe0df','#cccccc','#a5a5a5','#8a8a8a','#717171','#595959','#424242','#2e2e2e','#1a1a1a'],
    tableHeader: '#595959', tableHeaderText: '#f7f8f7',
    chartColors: ['#595959','#717171','#a5a5a5','#424242','#cccccc','#2e2e2e','#dfe0df'],
  },

  nuit: {
    name: 'Nuit',
    scale: ['#e8edf2','#d0dae4','#a8b8c8','#8b9da8','#6a7f8e','#4e6272','#3a4f5e','#2a3d4c','#1c2b3a','#0f1a28','#0b1019'],
    tableHeader: '#0f1a28', tableHeaderText: '#e8edf2',
    chartColors: ['#1c2b3a','#4e6272','#6a7f8e','#3a4f5e','#8b9da8','#0b1019','#a8b8c8'],
  },

  automne: {
    name: 'Automne',
    scale: ['#f5f0e8','#e8ddd0','#d4c4a8','#bfa882','#9c8560','#7a6844','#5d8a6b','#3d6b4a','#3d2b1a','#2a1c10','#1a0f08'],
    tableHeader: '#3d2b1a', tableHeaderText: '#f5f0e8',
    chartColors: ['#2d5c3f','#e67e22','#d4a574','#5d8a6b','#3d2b1a','#8b6914','#c0392b'],
  },

  henderson: {
    name: 'Henderson',
    scale: ['#f5f4e8','#ede9d8','#d5cfc0','#b0a890','#8a8068','#6b6050','#4d4538','#352f24','#1e1a14','#0f0e0a','#0a1f1d'],
    tableHeader: '#0a1f1d', tableHeaderText: '#f5f4e8',
    chartColors: ['#0a1f1d','#0d6371','#ffb070','#f5f4e8','#1a3a36','#e6973e','#095c68'],
  },
};

// Compat alias
export const PALETTES = BUILTIN_PALETTES;

// ── Palettes personnalisées (localStorage) ─────────────────────────
const CUSTOM_KEY = 'app-custom-palettes';

export function loadCustomPalettes(): Record<string, Palette> {
  try {
    const raw = localStorage.getItem(CUSTOM_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveCustomPalettes(palettes: Record<string, Palette>) {
  localStorage.setItem(CUSTOM_KEY, JSON.stringify(palettes));
}

/** Toutes les palettes disponibles (built-in + custom) */
export function getAllPalettes(): Record<string, Palette> {
  return { ...BUILTIN_PALETTES, ...loadCustomPalettes() };
}

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
  paletteKey: string;
  palette: Palette;
  customPalettes: Record<string, Palette>;
  setPalette: (k: string) => void;
  addCustomPalette: (id: string, p: Palette) => void;
  removeCustomPalette: (id: string) => void;
  updateCustomPalette: (id: string, p: Palette) => void;
};

function loadKey(): string {
  const v = localStorage.getItem(KEY);
  if (!v) return 'graphite';
  const all = getAllPalettes();
  return v in all ? v : 'graphite';
}

function loadPalette(): Palette {
  return getAllPalettes()[loadKey()] ?? BUILTIN_PALETTES.graphite;
}

// Apply on first load
applyPalette(loadPalette());

export const useTheme = create<ThemeState>((set, get) => ({
  paletteKey: loadKey(),
  palette: loadPalette(),
  customPalettes: loadCustomPalettes(),
  setPalette: (k) => {
    const all = { ...BUILTIN_PALETTES, ...get().customPalettes };
    const p = all[k] ?? BUILTIN_PALETTES.graphite;
    localStorage.setItem(KEY, k);
    applyPalette(p);
    set({ paletteKey: k, palette: p });
  },
  addCustomPalette: (id, p) => {
    const customs = { ...get().customPalettes, [id]: p };
    saveCustomPalettes(customs);
    set({ customPalettes: customs });
  },
  removeCustomPalette: (id) => {
    const customs = { ...get().customPalettes };
    delete customs[id];
    saveCustomPalettes(customs);
    // Si la palette supprimée était active, revenir à graphite
    if (get().paletteKey === id) {
      localStorage.setItem(KEY, 'graphite');
      applyPalette(BUILTIN_PALETTES.graphite);
      set({ customPalettes: customs, paletteKey: 'graphite', palette: BUILTIN_PALETTES.graphite });
    } else {
      set({ customPalettes: customs });
    }
  },
  updateCustomPalette: (id, p) => {
    const customs = { ...get().customPalettes, [id]: p };
    saveCustomPalettes(customs);
    // Si c'est la palette active, re-appliquer
    if (get().paletteKey === id) {
      applyPalette(p);
      set({ customPalettes: customs, palette: p });
    } else {
      set({ customPalettes: customs });
    }
  },
}));

// Helpers pratiques
export function useChartColors() {
  return useTheme((s) => s.palette.chartColors);
}
export function usePalette() {
  return useTheme((s) => s.palette);
}
