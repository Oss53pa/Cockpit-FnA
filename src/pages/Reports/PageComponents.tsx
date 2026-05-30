/* eslint-disable @typescript-eslint/no-explicit-any -- interop dynamique (parsers, payloads Supabase/Edge Functions, helpers Recharts). À typer finement au cas par cas. */
// ─── COMPOSANTS DE PAGE A4 ───────────────────────────────────────
import React, { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';

// ─── PAGE A4 — conteneur principal ───────────────────────────────
export function PageA4({ children, style, maxH, pageNum, totalPages, palette, hideNumber, pageType }: {
  children: React.ReactNode;
  style: React.CSSProperties;
  maxH?: number;
  pageNum?: number;
  totalPages?: number;
  palette?: any;
  hideNumber?: boolean;
  pageType?: 'cover' | 'toc' | 'content' | 'back';
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(false);

  useEffect(() => {
    if (!ref.current || !maxH) return;
    const check = () => setOverflow(ref.current!.scrollHeight > maxH);
    check();
    const obs = new ResizeObserver(check);
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [maxH, children]);

  return (
    // Layout flex naturel SANS hauteur forcee a l'ecran : la page A4 prend la
    // hauteur de son contenu (pas d'espace blanc inutile entre les pages).
    // En print, l'@media print impose min-height: 100vh pour le rendu A4.
    <div data-page-type={pageType ?? 'content'} className={clsx('bg-white dark:bg-primary-900 mx-auto relative flex flex-col page-a4',
      overflow ? 'ring-1 ring-error/30' : '')} style={style}>
      {overflow && (
        <div className="absolute top-1 right-1 z-10 px-2 py-0.5 rounded text-[9px] font-semibold bg-error/10 text-error border border-error/20 print:hidden">
          Hors marge — créez un nouveau saut de page
        </div>
      )}
      {/* Pour les pages cover/back : pas de padding wrapper — la cover doit
          remplir EXACTEMENT la page A4 sans débordement vertical.
          Pour les autres : padding standard p-4 pb-2 + flex-1. */}
      {pageType === 'cover' || pageType === 'back' ? (
        <div ref={ref} className="absolute inset-0 flex flex-col">{children}</div>
      ) : (
        <div ref={ref} className="break-words flex-1 w-full flex flex-col gap-1 p-4 pb-2">{children}</div>
      )}
      {/* Footer en flux normal — pas d'absolute pour eviter l'espace vide
          quand la page contient peu de contenu. */}
      {!hideNumber && pageNum && totalPages && (
        <div className="pb-2 flex items-center justify-center text-[10px] text-primary-400 font-medium select-none pointer-events-none">
          <span style={{ color: palette?.primary ?? undefined }}>Page {pageNum} / {totalPages}</span>
        </div>
      )}
    </div>
  );
}

// ─── PANNEAU D'ÉDITION FLOTTANT DE COUVERTURE ─────────────────────
export function CoverEditPanel({ id, setCoverProps, setBgImage }: any) {
  const [open, setOpen] = useState(false);
  if (!setCoverProps) return null;
  return (
    <div className="absolute top-2 right-2 z-30 print:hidden">
      <button onClick={() => setOpen(!open)} className="bg-primary-900/90 dark:bg-primary-100/90 text-primary-50 dark:text-primary-900 rounded-full px-3 py-1.5 text-[10px] font-semibold shadow-lg hover:scale-105 transition">
        Personnaliser
      </button>
      {open && (
        <div className="absolute top-10 right-0 w-72 bg-white dark:bg-primary-900 border border-primary-200 dark:border-primary-800 rounded-lg shadow-2xl p-3 space-y-3">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-primary-500 font-semibold block mb-1">Style</label>
            <select className="input !py-1 text-xs" value={id.coverStyle || 'classic'} onChange={(e) => setCoverProps({ coverStyle: e.target.value })}>
              <option value="classic">Classique (centré)</option>
              <option value="modern">Moderne (bandeau gauche)</option>
              <option value="banner">Banner (bandeau haut)</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-primary-500 font-semibold block mb-1">Couleur de fond</label>
            <div className="flex gap-2 items-center">
              <input type="color" className="w-10 h-8 rounded cursor-pointer border-0" value={id.coverBgColor || '#ffffff'} onChange={(e) => setCoverProps({ coverBgColor: e.target.value })} />
              <input type="text" className="input !py-1 text-xs flex-1" value={id.coverBgColor || '#ffffff'} onChange={(e) => setCoverProps({ coverBgColor: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-primary-500 font-semibold block mb-1">Couleur du titre</label>
            <div className="flex gap-2 items-center">
              <input type="color" className="w-10 h-8 rounded cursor-pointer border-0" value={id.titleColor || '#171717'} onChange={(e) => setCoverProps({ titleColor: e.target.value })} />
              <input type="text" className="input !py-1 text-xs flex-1" value={id.titleColor || ''} placeholder="palette défaut" onChange={(e) => setCoverProps({ titleColor: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-primary-500 font-semibold block mb-1">Couleur sous-titre</label>
            <div className="flex gap-2 items-center">
              <input type="color" className="w-10 h-8 rounded cursor-pointer border-0" value={id.subtitleColor || '#737373'} onChange={(e) => setCoverProps({ subtitleColor: e.target.value })} />
              <input type="text" className="input !py-1 text-xs flex-1" value={id.subtitleColor || ''} placeholder="défaut" onChange={(e) => setCoverProps({ subtitleColor: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-primary-500 font-semibold block mb-1">Image de fond</label>
            <input type="file" accept="image/*" className="text-[10px] w-full" onChange={(e) => { const f = e.target.files?.[0]; if (f) setBgImage(f); }} />
            {id.coverBgImageUrl && (
              <>
                <div className="mt-2 flex gap-2 items-center">
                  <img src={id.coverBgImageUrl} alt="bg" className="h-8 rounded object-cover w-16" />
                  <button className="btn-outline !py-1 text-[10px]" onClick={() => setCoverProps({ coverBgImageUrl: '' })}>Retirer</button>
                </div>
                <label className="text-[9px] text-primary-500 block mt-1">Opacité : {Math.round((id.coverBgOpacity ?? 0.15) * 100)} %</label>
                <input type="range" min={0.05} max={1} step={0.05} value={id.coverBgOpacity ?? 0.15} onChange={(e) => setCoverProps({ coverBgOpacity: parseFloat(e.target.value) })} className="w-full" />
              </>
            )}
          </div>
          <div className="flex justify-between pt-2 border-t border-primary-200 dark:border-primary-800">
            <button className="btn-outline !py-1 text-[10px]" onClick={() => setCoverProps({ coverBgColor: '', coverBgImageUrl: '', titleColor: '', subtitleColor: '', coverStyle: 'classic' })}>Réinitialiser</button>
            <button className="btn-primary !py-1 text-[10px]" onClick={() => setOpen(false)}>Fermer</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── PAGE DE COUVERTURE ───────────────────────────────────────────
export function CoverPage({ config, palette, org, setLogo, setCoverProps }: any) {
  const [dragOver, setDragOver] = useState(false);
  const id = config.identity || {};
  // Cover : on consomme les tokens layout (palette.layout) pour matcher le
  // theme Twisty par defaut — bg creme + accent orange pour les liserés.
  // Important : on traite '#ffffff' comme "pas defini" pour ecraser les vieilles
  // configs persistees en localStorage qui ont coverBgColor='#ffffff'.
  const lay = (palette as any).layout as { bgShell?: string; accent?: string } | undefined;
  const isDefaultBg = !id.coverBgColor || id.coverBgColor.toLowerCase() === '#ffffff' || id.coverBgColor.toLowerCase() === '#fff';
  const titleColor = id.titleColor || palette.primary;
  const subtitleColor = id.subtitleColor || (lay?.accent ?? palette.primary);
  const accentColor = lay?.accent ?? palette.primary;
  const bgColor = isDefaultBg ? (lay?.bgShell ?? '#F4F1EC') : id.coverBgColor;
  const bgImage = id.coverBgImageUrl;
  const bgOpacity = typeof id.coverBgOpacity === 'number' ? id.coverBgOpacity : 0.15;
  const style = (id.coverStyle as 'classic' | 'modern' | 'banner') || 'modern';

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => { if (typeof reader.result === 'string' && setLogo) setLogo(reader.result); };
    reader.readAsDataURL(file);
  };
  const setBgImage = async (file: File) => {
    const reader = new FileReader();
    reader.onload = () => { if (typeof reader.result === 'string' && setCoverProps) setCoverProps({ coverBgImageUrl: reader.result }); };
    reader.readAsDataURL(file);
  };

  // NOTE: `w-full` explicite sur les 3 styles ci-dessous. Le parent PageA4 est un
  // `flex flex-col` dans une cellule grid ; sans w-full, l'enfant peut se réduire
  // à sa largeur intrinsèque (notamment sur les conteneurs `flex` row internes).
  // Style MODERN — bandeau gauche coloré
  // Layout en CSS GRID 2 colonnes (40% / 1fr) au lieu de flex : plus deterministe,
  // les 2 bandeaux occupent TOUJOURS toute la largeur peu importe le contexte parent.
  if (style === 'modern') {
    return (
      <div
        className="w-full h-full relative overflow-hidden grid"
        style={{ minHeight: '100%', height: '100%', background: bgColor, gridTemplateColumns: '40% 1fr' }}
      >
        {bgImage && <div className="absolute inset-0" style={{ backgroundImage: `url(${bgImage})`, backgroundSize: 'cover', backgroundPosition: 'center', opacity: bgOpacity }} />}
        <CoverEditPanel id={id} setCoverProps={setCoverProps} setBgImage={setBgImage} />
        <div className="flex flex-col justify-between p-10 relative z-10" style={{ background: titleColor, color: '#fff' }}>
          {id.logoDataUrl ? (
            <div className="bg-white/10 backdrop-blur p-3 rounded inline-block self-start">
              <img src={id.logoDataUrl} alt="logo" style={{ maxHeight: '72px', maxWidth: '180px', objectFit: 'contain' }} />
            </div>
          ) : <div className="opacity-50 text-xs uppercase tracking-widest">Logo</div>}
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] opacity-80 mb-2">Document {id.confidentiality}</p>
            <p className="text-xs opacity-90">Période : <strong>{id.period}</strong></p>
            <p className="text-xs opacity-90">Date : {new Date().toLocaleDateString('fr-FR')}</p>
            <p className="text-xs opacity-90 mt-3">Émis par {id.author}</p>
          </div>
        </div>
        <div className="flex flex-col justify-center p-12 relative z-10">
          <p className="text-[11px] uppercase tracking-[0.25em] mb-4" style={{ color: titleColor, opacity: 0.7 }}>{org?.name ?? 'Société'}</p>
          <h1 className="text-5xl font-bold leading-tight mb-3" style={{ color: titleColor }}>{id.title}</h1>
          {id.subtitle && <p className="text-lg italic" style={{ color: subtitleColor, opacity: 0.9 }}>{id.subtitle}</p>}
          <div className="mt-12 pt-6 border-t-2" style={{ borderColor: accentColor }}>
            {(org?.rccm || org?.ifu) && <p className="text-xs text-primary-500">{[org?.rccm && `RCCM : ${org.rccm}`, org?.ifu && `IFU : ${org.ifu}`].filter(Boolean).join(' · ')}</p>}
            {org?.address && <p className="text-xs text-primary-500 mt-1">{org.address}</p>}
          </div>
        </div>
      </div>
    );
  }

  // Style BANNER — bandeau horizontal en haut
  if (style === 'banner') {
    return (
      <div className="w-full h-full relative overflow-hidden flex flex-col" style={{ minHeight: '100%', height: '100%', background: bgColor }}>
        {bgImage && <div className="absolute inset-0" style={{ backgroundImage: `url(${bgImage})`, backgroundSize: 'cover', backgroundPosition: 'center', opacity: bgOpacity }} />}
        <CoverEditPanel id={id} setCoverProps={setCoverProps} setBgImage={setBgImage} />
        <div className="h-44 flex items-center justify-between px-12 relative z-10" style={{ background: titleColor, color: '#fff' }}>
          {id.logoDataUrl ? (
            <img src={id.logoDataUrl} alt="logo" className="bg-white/10 p-2 rounded backdrop-blur" style={{ maxHeight: '90px', maxWidth: '200px', objectFit: 'contain' }} />
          ) : <div className="opacity-50">Logo</div>}
          <div className="text-right">
            <p className="text-xs uppercase tracking-widest opacity-90">{org?.name ?? '—'}</p>
            <p className="text-[10px] opacity-70 mt-1">Document {id.confidentiality}</p>
          </div>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-center px-10 relative z-10">
          <h1 className="text-5xl font-bold leading-tight mb-4" style={{ color: titleColor }}>{id.title}</h1>
          {id.subtitle && <p className="text-xl italic mb-12" style={{ color: subtitleColor }}>{id.subtitle}</p>}
          <div className="inline-block px-8 py-4 border-2 rounded-lg" style={{ borderColor: titleColor }}>
            <p className="text-2xl font-bold" style={{ color: titleColor }}>{id.period}</p>
          </div>
        </div>
        <div className="px-10 py-6 text-center text-xs text-primary-500 border-t relative z-10" style={{ borderColor: titleColor + '40' }}>
          <p>Émis par <strong>{id.author}</strong> · {new Date().toLocaleDateString('fr-FR')}</p>
          {(org?.rccm || org?.ifu) && <p className="mt-1">{[org?.rccm && `RCCM : ${org.rccm}`, org?.ifu && `IFU : ${org.ifu}`].filter(Boolean).join(' · ')}</p>}
        </div>
      </div>
    );
  }

  // Style CLASSIC (par défaut) — centré épuré et élégant
  return (
    <div
      className="w-full h-full flex flex-col relative overflow-hidden"
      style={{ minHeight: 480, background: bgColor }}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      {bgImage && <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: `url(${bgImage})`, backgroundSize: 'cover', backgroundPosition: 'center', opacity: bgOpacity }} />}
      <CoverEditPanel id={id} setCoverProps={setCoverProps} setBgImage={setBgImage} />
      {dragOver && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/90 z-20 print:hidden">
          <div className="text-center">
            <p className="text-3xl font-semibold tracking-tight" style={{ color: palette.primary }}>Déposez votre logo</p>
            <p className="text-sm text-primary-500 mt-2">PNG · JPG · SVG</p>
          </div>
        </div>
      )}
      <div className="h-3" style={{ background: titleColor }} />
      {/* Liseré accent (orange Twisty par defaut) sous le bandeau noir principal */}
      <div className="h-1 mt-1 mx-12" style={{ background: accentColor }} />

      <div className="flex-1 flex flex-col p-12 relative z-10">
        <p className="text-center text-[10px] uppercase tracking-[0.25em] text-primary-500 font-semibold">Document {id.confidentiality}</p>

        {id.logoDataUrl ? (
          <div className="text-center mt-8 relative group">
            <img src={id.logoDataUrl} alt="logo" className="inline-block" style={{ maxHeight: '110px', maxWidth: '260px', objectFit: 'contain' }} />
            <button onClick={() => setLogo && setLogo('')} className="absolute top-0 right-1/2 translate-x-32 -translate-y-2 opacity-0 group-hover:opacity-100 bg-error text-white rounded-full w-6 h-6 text-xs font-bold transition print:hidden" title="Retirer le logo">×</button>
          </div>
        ) : (
          <div className="text-center mt-8 print:hidden">
            <label className="inline-block border-2 border-dashed border-primary-300 rounded p-4 cursor-pointer hover:border-primary-500 transition">
              <p className="text-xs text-primary-500">Cliquez ou glissez un logo</p>
              <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                const f = e.target.files?.[0]; if (!f || !setLogo) return;
                const r = new FileReader(); r.onload = () => typeof r.result === 'string' && setLogo(r.result); r.readAsDataURL(f);
              }} />
            </label>
          </div>
        )}

        <div className="flex-1 flex flex-col items-center justify-center text-center">
          {/* Petits traits de cadrage en accent autour du titre */}
          <div className="w-16 h-px mb-6" style={{ background: accentColor }} />
          <h1 className="text-4xl font-bold leading-tight tracking-tight" style={{ color: titleColor }}>{id.title}</h1>
          {id.subtitle && <p className="text-lg italic mt-3" style={{ color: subtitleColor, opacity: 0.9 }}>{id.subtitle}</p>}
          <div className="w-16 h-px mt-6" style={{ background: accentColor }} />

          <p className="text-2xl font-bold mt-12" style={{ color: titleColor + 'cc' }}>{org?.name ?? '—'}</p>
          {(org?.rccm || org?.ifu) && <p className="text-xs text-primary-500 mt-2">{[org?.rccm && `RCCM : ${org.rccm}`, org?.ifu && `IFU : ${org.ifu}`].filter(Boolean).join(' · ')}</p>}
        </div>

        <div className="text-center text-sm space-y-1.5 mt-8 pt-6 border-t" style={{ borderColor: accentColor + '40' }}>
          <p className="text-primary-700"><span className="text-primary-500 text-xs uppercase tracking-wider">Période</span><br /><strong className="text-base">{id.period}</strong></p>
          <p className="text-primary-500 text-xs">Émis par <strong className="text-primary-700">{id.author}</strong> · {new Date().toLocaleDateString('fr-FR')}</p>
        </div>
      </div>

      <div className="h-1 mb-1 mx-12" style={{ background: accentColor }} />
      <div className="h-3" style={{ background: titleColor }} />
    </div>
  );
}

// ─── PAGE DE DOS / 4ÈME DE COUVERTURE ───────────────────────────
export function BackCoverPage({ config, palette, org }: any) {
  const lay = (palette as any).layout as { bgShell?: string; accent?: string } | undefined;
  const accentColor = lay?.accent ?? palette.primary;
  const bgColor = lay?.bgShell ?? '#ffffff';
  return (
    // minHeight aligné sur les covers (480) pour cohérence visuelle ; la hauteur
    // réelle est imposée par PageA4 via `h-full` + maxHeight du pageStyle.
    // Bordure en accent (orange) + fond shell (creme) pour matcher Twisty.
    <div className="w-full border-2 rounded p-6 h-full flex flex-col justify-between" style={{ borderColor: accentColor, minHeight: 480, background: bgColor }}>
      <div className="text-center">
        {config.identity.logoDataUrl && (
          <img
            src={config.identity.logoDataUrl}
            alt="logo"
            className="inline-block opacity-80 mb-4"
            style={{ maxHeight: '64px', maxWidth: '180px', width: 'auto', height: 'auto', objectFit: 'contain' }}
          />
        )}
        <p className="text-xs uppercase tracking-widest text-primary-500 font-semibold">{org?.name ?? '—'}</p>
      </div>

      <div className="space-y-6 px-8">
        <div className="text-center">
          <p className="text-xl font-bold mb-2" style={{ color: palette.primary }}>{config.identity.title}</p>
          {config.identity.subtitle && <p className="text-sm italic text-primary-500">{config.identity.subtitle}</p>}
        </div>

        <div className="border-t border-b py-4 space-y-2 text-xs text-primary-600 dark:text-primary-400" style={{ borderColor: accentColor + '60' }}>
          <p><strong>Document confidentiel</strong> — destiné exclusivement aux destinataires désignés. Toute reproduction ou diffusion non autorisée est strictement interdite.</p>
          <p>Les analyses présentées dans ce rapport sont basées sur les données comptables disponibles à la date d'émission. Elles n'engagent que leur auteur et n'ont pas vocation à constituer un avis d'expertise.</p>
          <p>Conformément aux normes <strong>SYSCOHADA révisé 2017</strong> en vigueur dans l'espace OHADA.</p>
        </div>

        {config.recipients?.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-primary-500 font-semibold mb-2">Destinataires</p>
            <ul className="text-xs space-y-0.5">
              {config.recipients.slice(0, 8).map((r: any, i: number) => <li key={i}>• {r.name} {r.email && <span className="text-primary-400">— {r.email}</span>}</li>)}
            </ul>
          </div>
        )}
      </div>

      <div className="text-center text-[10px] text-primary-400 space-y-1 border-t pt-4" style={{ borderColor: accentColor + '60' }}>
        <p>Émis par {config.identity.author} · {new Date().toLocaleDateString('fr-FR')}</p>
        {(org?.rccm || org?.ifu) && <p>{[org?.rccm && `RCCM : ${org.rccm}`, org?.ifu && `IFU : ${org.ifu}`].filter(Boolean).join(' · ')}</p>}
        {org?.address && <p>{org.address}</p>}
        <p className="mt-2 italic">Généré avec Cockpit FnA · SYSCOHADA 2017</p>
      </div>
    </div>
  );
}

// ─── PAGE SOMMAIRE ────────────────────────────────────────────────
export function TocPage({ config, palette }: any) {
  const toc = config.blocks.filter((b: any) => (b.type === 'h1' || b.type === 'h2' || b.type === 'h3') && b.inToc !== false);
  const lay = (palette as any).layout as { accent?: string } | undefined;
  const accentColor = lay?.accent ?? palette.primary;
  return (
    <div className="w-full">
      <h2 className="text-2xl font-bold pb-2 mb-6 border-b-2" style={{ color: palette.primary, borderColor: accentColor }}>Sommaire</h2>
      <ol className="space-y-2">
        {toc.map((t: any, i: number) => (
          <li key={t.id} className={clsx('flex items-baseline gap-2', t.type === 'h2' && 'pl-4', t.type === 'h3' && 'pl-8')}>
            <span className="num text-xs text-primary-500 w-6">{i + 1}.</span>
            <span className={clsx('text-sm', t.type === 'h1' && 'font-semibold')}>{t.text}</span>
            <span className="flex-1 border-b border-dotted border-primary-300 dark:border-primary-700 mb-1" />
            <span className="num text-xs text-primary-500">—</span>
          </li>
        ))}
        {toc.length === 0 && <li className="text-sm text-primary-400 italic">Ajoutez des titres pour générer le sommaire.</li>}
      </ol>
    </div>
  );
}
