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
  /** Tokens layout (Twisty-style) : fond page, container shell, surface carte, accent */
  layout?: {
    bgPage: string;     // fond de la page (gris-bleu / neutre)
    bgShell: string;    // grand container arrondi (crème / clair)
    bgSurface: string;  // cartes intérieures (blanc en général)
    accent: string;     // couleur d'accent (orange Twisty, etc.)
    accentSoft: string; // version légère de l'accent (badges, hovers)
  };
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

// ── Palettes prédéfinies — CURATION STRICTE ───────────────────────
// Seules 4 palettes designées sont gardées. Les anciennes (atlas, marine,
// cobalt, lavande, etc.) servaient juste de "skin" interchangeable et
// noyaient le système — un produit international defend UNE direction
// visuelle, pas 18 au choix de l'utilisateur.
export const BUILTIN_PALETTES: Record<string, Palette> = {
  // Palette TWISTY EXACTE — 5 couleurs sources fournies par le designer :
  //   #82B0D9 (bleu clair page) · #222834 (bleu nuit "noir") · #B5B7C0 (gris bleuté)
  //   #E7EBEE (shell tres clair) · #DA4D28 (orange-rouge accent)
  // La scale est generee en gardant la teinte HSL du bleu nuit (218°, 22%) avec
  // luminosite decroissante 97% -> 6%. Resultat : nuances cool-blue cohérentes
  // entre elles (pas de zinc neutre, pas de creme chaud).
  twisty: {
    name: 'Cockpit',
    // Palette signature Cockpit FnA — niveau Cockpit CR (ivoire chaud + graphite + terracotta)
    scale: [
      '#FCFBF9', // 50  — blanc cassé chaud
      '#F7F5F0', // 100 — crème principal (fond app)
      '#E9E6DE', // 200 — séparateurs subtils
      '#CFCBC0', // 300 — décoratif
      '#A5A298', // 400 — secondaire
      '#7A776E', // 500 — support
      '#56544D', // 600 — body
      '#403E39', // 700 — fort
      '#2C2B26', // 800 — surface sombre
      '#1A1916', // 900 — graphite signature
      '#0F0E0B', // 950 — quasi-noir
    ],
    tableHeader: '#1A1916', tableHeaderText: '#F7F5F0',
    // Charts multi-couleurs harmonieux — KPI sémantiques distincts (orange / rouge / ambre / vert / bleu / violet / gris)
    chartColors: ['#DA4D28','#EF4444','#F59E0B','#10B981','#3B82F6','#8B5CF6','#7A776E'],
    layout: {
      bgPage:     '#F7F5F0',  // crème (l'app entière y baigne — pas de fond contrasté)
      bgShell:    '#F7F5F0',  // identique : fluidité totale, pas de shell séparé
      bgSurface:  '#FFFFFF',  // blanc pur (cards se détachent par contraste subtle)
      accent:     '#DA4D28',  // terracotta signature
      accentSoft: '#FBEAE2',  // terracotta pâle (badges, hover)
    },
  },
  // Graphite — neutre pur (style Linear / Vercel)
  graphite: {
    name: 'Graphite',
    scale: ['#fafafa','#f5f5f5','#e5e5e5','#d4d4d4','#a3a3a3','#737373','#525252','#404040','#262626','#171717','#0a0a0a'],
    tableHeader: '#171717', tableHeaderText: '#fafafa',
    chartColors: ['#171717','#dc2626','#2563eb','#d97706','#059669','#7c3aed','#db2777'],
    layout: {
      bgPage:     '#E5E5E5',
      bgShell:    '#FAFAFA',
      bgSurface:  '#FFFFFF',
      accent:     '#171717',
      accentSoft: '#A3A3A3',
    },
  },
  // Atlas — anthracite + or mat (premium éditorial)
  atlas: {
    name: 'Atlas',
    scale: ['#faf8f3','#f3eee2','#e6dcc4','#cfbe95','#b8954a','#9c7d3e','#6e5a2d','#4d3f20','#332915','#1f1f23','#16161A'],
    tableHeader: '#1F1F23', tableHeaderText: '#D4B870',
    chartColors: ['#1F1F23','#B8954A','#D4B870','#9C7D3E','#6E5A2D','#E8D5A0','#4D3F20'],
    layout: {
      bgPage:     '#332915',
      bgShell:    '#FAF8F3',
      bgSurface:  '#FFFFFF',
      accent:     '#B8954A',
      accentSoft: '#D4B870',
    },
  },
  // Nuit — bleu profond (mode sombre/sérieux pour data lourde)
  nuit: {
    name: 'Nuit',
    scale: ['#e8edf2','#d0dae4','#a8b8c8','#8b9da8','#6a7f8e','#4e6272','#3a4f5e','#2a3d4c','#1c2b3a','#0f1a28','#0b1019'],
    tableHeader: '#0f1a28', tableHeaderText: '#e8edf2',
    chartColors: ['#0F1A28','#4E6272','#6A7F8E','#3A4F5E','#8B9DA8','#0B1019','#A8B8C8'],
    layout: {
      bgPage:     '#1C2B3A',
      bgShell:    '#E8EDF2',
      bgSurface:  '#FFFFFF',
      accent:     '#3A4F5E',
      accentSoft: '#8B9DA8',
    },
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
  s.setProperty('--grid-color', p.scale[2]);

  // Tokens layout — fallback intelligent
  const lay = p.layout ?? {
    bgPage: p.scale[3] ?? p.scale[1],
    bgShell: p.scale[0],
    bgSurface: '#FFFFFF',
    accent: p.chartColors[0] ?? p.scale[8],
    accentSoft: p.chartColors[2] ?? p.scale[3],
  };

  // Mode CLAIR (default) : tokens pris de la palette
  s.setProperty('--bg-page', hexToRgb(lay.bgPage));
  s.setProperty('--bg-shell', hexToRgb(lay.bgShell));
  s.setProperty('--bg-surface', hexToRgb(lay.bgSurface));
  s.setProperty('--accent', hexToRgb(lay.accent));
  s.setProperty('--accent-soft', hexToRgb(lay.accentSoft));

  // Mode SOMBRE : tokens recalculés en inversant le contexte
  // (bg-page sombre, shell legerement plus clair, surface plus claire encore)
  // Ces valeurs surchargent les light-tokens UNIQUEMENT quand .dark est active
  // sur <html>. La declaration .dark { --bg-page: ... } se trouve dans index.css.
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

// Migration forcee : on bascule TOUT le monde sur la palette Twisty pendant
// la phase de refonte design. Les anciennes valeurs stockees en localStorage
// sont ecrasees pour qu'on voie la nouvelle identite.
//
// IMPORTANT v2 : on PURGE aussi toute palette custom nommee 'twisty' qui
// pourrait court-circuiter la built-in (les custom ecrasent les built-in dans
// getAllPalettes). Sans cette purge, les utilisateurs qui ont cree une "Twisty"
// custom (mix de vieilles couleurs marine/sable/etc.) continuent de la voir.
const TWISTY_MIGRATION_KEY = 'twisty-migration-v3';
try {
  if (typeof window !== 'undefined' && !localStorage.getItem(TWISTY_MIGRATION_KEY)) {
    localStorage.setItem(KEY, 'twisty');
    // Purge la custom palette 'twisty' eventuelle
    try {
      const raw = localStorage.getItem(CUSTOM_KEY);
      if (raw) {
        const customs = JSON.parse(raw);
        if (customs && typeof customs === 'object' && 'twisty' in customs) {
          delete customs.twisty;
          localStorage.setItem(CUSTOM_KEY, JSON.stringify(customs));
        }
      }
    } catch { /* invalid JSON — on laisse */ }
    localStorage.setItem(TWISTY_MIGRATION_KEY, '1');
  }
} catch { /* SSR / privacy mode */ }

function loadKey(): string {
  const v = localStorage.getItem(KEY);
  if (!v) return 'twisty';
  const all = getAllPalettes();
  return v in all ? v : 'twisty';
}

function loadPalette(): Palette {
  return getAllPalettes()[loadKey()] ?? BUILTIN_PALETTES.twisty;
}

// Apply on first load
applyPalette(loadPalette());

export const useTheme = create<ThemeState>((set, get) => ({
  paletteKey: loadKey(),
  palette: loadPalette(),
  customPalettes: loadCustomPalettes(),
  setPalette: (k) => {
    const all = { ...BUILTIN_PALETTES, ...get().customPalettes };
    const p = all[k] ?? BUILTIN_PALETTES.twisty;
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
      localStorage.setItem(KEY, 'twisty');
      applyPalette(BUILTIN_PALETTES.twisty);
      set({ customPalettes: customs, paletteKey: 'twisty', palette: BUILTIN_PALETTES.twisty });
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
