/**
 * PaletteSwitcher — sélecteur de palette accessible depuis la navbar.
 *
 * Permet à l'utilisateur de basculer entre les 3 palettes principales
 * (Cockpit Hybride / Éditorial / Sauge) sans aller dans Settings.
 *
 * UX :
 * - Bouton icône Palette dans le Header
 * - Dropdown avec preview de chaque palette + tag (Recommandée / Pitch / Anti-fatigue)
 * - Click extérieur ferme le dropdown
 * - Switch instantané + persistance localStorage
 */
import { useEffect, useRef, useState } from 'react';
import { Palette, Check } from 'lucide-react';
import clsx from 'clsx';
import { useTheme, PALETTES, type PaletteKey } from '../../store/theme';

const MAIN_PALETTES: { key: PaletteKey; tag: string; tagColor: string; desc: string }[] = [
  { key: 'twisty',    tag: 'Recommandée', tagColor: 'bg-success/10 text-success', desc: 'Gris + sage primary + terracotta CTA' },
  { key: 'editorial', tag: 'Pitch',       tagColor: 'bg-accent/10 text-accent',   desc: 'Crème + terracotta orangée vive' },
  { key: 'sauge',     tag: 'Anti-fatigue',tagColor: 'bg-success/10 text-success', desc: 'Gris + sage green pur' },
];

export function PaletteSwitcher() {
  const paletteKey = useTheme((s) => s.paletteKey);
  const setPalette = useTheme((s) => s.setPalette);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  // Toutes les autres palettes (alternatives compactes)
  const altPalettes = (Object.keys(PALETTES) as PaletteKey[]).filter(
    (k) => !MAIN_PALETTES.some((m) => m.key === k),
  );

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="btn-icon"
        aria-label="Changer de palette"
        title="Palette de couleurs"
        aria-expanded={open}
      >
        <Palette className="w-4 h-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 z-50 card-glass rounded-xl overflow-hidden animate-fade-in-up"
             style={{ boxShadow: '0 16px 40px -8px rgb(0 0 0 / 0.15), 0 0 0 1px rgb(0 0 0 / 0.05)' }}>
          {/* Header */}
          <div className="px-4 py-3 border-b border-primary-200/60 dark:border-primary-800/60">
            <p className="text-sm font-semibold text-primary-900 dark:text-primary-50">Palette de couleurs</p>
            <p className="text-[11px] text-primary-500 mt-0.5">Changement instantané sur toute l'app</p>
          </div>

          {/* 3 palettes principales */}
          <div className="p-2 space-y-1">
            {MAIN_PALETTES.map(({ key, tag, tagColor, desc }) => {
              const p = PALETTES[key];
              if (!p) return null;
              const isActive = paletteKey === key;
              return (
                <button
                  key={key}
                  onClick={() => { setPalette(key); setOpen(false); }}
                  className={clsx(
                    'w-full text-left p-2.5 rounded-lg transition-colors',
                    isActive
                      ? 'bg-accent/5 ring-1 ring-accent/30'
                      : 'hover:bg-primary-100/60 dark:hover:bg-primary-800/60',
                  )}
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-semibold text-primary-900 dark:text-primary-50 truncate">{p.name}</span>
                      <span className={clsx('text-[9px] uppercase tracking-[0.08em] font-bold px-1.5 py-0.5 rounded shrink-0', tagColor)}>{tag}</span>
                    </div>
                    {isActive && (
                      <Check className="w-4 h-4 text-accent shrink-0" strokeWidth={2.5} />
                    )}
                  </div>
                  {/* Mini preview swatch */}
                  <div className="flex gap-0.5 rounded overflow-hidden mb-1.5">
                    <div className="flex-1 h-5" style={{ background: p.layout?.bgPage }} />
                    <div className="flex-1 h-5" style={{ background: p.layout?.bgSurface }} />
                    <div className="flex-1 h-5" style={{ background: p.layout?.accent }} />
                    <div className="flex-1 h-5" style={{ background: p.scale[9] }} />
                  </div>
                  <p className="text-[11px] text-primary-500 leading-relaxed">{desc}</p>
                </button>
              );
            })}
          </div>

          {/* Alternatives compactes */}
          {altPalettes.length > 0 && (
            <>
              <div className="px-4 pt-1 pb-1">
                <p className="text-[10px] uppercase tracking-[0.10em] font-semibold text-primary-500">Autres palettes</p>
              </div>
              <div className="px-2 pb-2 grid grid-cols-3 gap-1">
                {altPalettes.map((k) => {
                  const p = PALETTES[k];
                  const isActive = paletteKey === k;
                  return (
                    <button
                      key={k}
                      onClick={() => { setPalette(k); setOpen(false); }}
                      className={clsx(
                        'p-1.5 rounded-md transition-colors',
                        isActive
                          ? 'bg-accent/5 ring-1 ring-accent/30'
                          : 'hover:bg-primary-100/60 dark:hover:bg-primary-800/60',
                      )}
                    >
                      <div className="flex gap-0.5 rounded-sm overflow-hidden mb-1">
                        {p.chartColors.slice(0, 4).map((c, i) => (
                          <div key={i} className="flex-1 h-2.5" style={{ background: c }} />
                        ))}
                      </div>
                      <p className="text-[10px] font-medium text-center truncate">{p.name}</p>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {/* Footer link to full settings */}
          <div className="px-4 py-2.5 border-t border-primary-200/60 dark:border-primary-800/60 bg-primary-50/50 dark:bg-primary-950/30">
            <a href="/settings" className="text-[11px] text-primary-500 hover:text-accent transition-colors">
              Plus d'options dans Paramètres → Apparence →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
