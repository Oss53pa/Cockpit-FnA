/* eslint-disable @typescript-eslint/no-explicit-any -- interop dynamique (parsers, payloads Supabase/Edge Functions, helpers Recharts). À typer finement au cas par cas. */
// ─── COMPOSANTS DE BLOC (DnD + Éditeur inline) ────────────────────
import React, { useState } from 'react';
import clsx from 'clsx';
import { Hash, Type, BarChart3, Table as TableIcon, MoveDown, Trash2 } from 'lucide-react';
import type { Block } from '../../engine/reportBlocks';
import { uid } from './reportData';
import { fmtMoney } from '../../lib/format';
import { TABLE_CATALOG, DASHBOARD_CATALOG } from './reportData';
import { TablePreview } from './BlockPreviews';
import { DashboardSnippet } from './BlockPreviews';

// ─── BLOC DRAGGABLE (HTML5 DnD natif) ─────────────────────────────
export function DraggableBlock({ block, index, ops, data, palette }: { block: Block; index: number; ops: any; data: any; palette: any }) {
  const [dragOver, setDragOver] = useState<'above' | 'below' | null>(null);

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('text/plain', block.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = e.currentTarget.getBoundingClientRect();
    const mid = rect.top + rect.height / 2;
    setDragOver(e.clientY < mid ? 'above' : 'below');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const srcId = e.dataTransfer.getData('text/plain');
    if (!srcId || srcId === block.id) { setDragOver(null); return; }
    ops.reorderBlock(srcId, block.id, dragOver === 'below');
    setDragOver(null);
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragLeave={() => setDragOver(null)}
      onDrop={handleDrop}
      className="relative"
    >
      {dragOver === 'above' && <div className="absolute top-0 left-0 right-0 h-0.5 bg-primary-900 dark:bg-primary-100 z-10" />}
      <InsertHere index={index} ops={ops} />
      <BlockEditor block={block} data={data} palette={palette} ops={ops} />
      {dragOver === 'below' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-900 dark:bg-primary-100 z-10" />}
    </div>
  );
}

// ─── BOUTON "+" ENTRE LES BLOCS (aussi droppable) ──────────────
export function InsertHere({ index, ops, alwaysOpen }: { index: number; ops: any; alwaysOpen?: boolean }) {
  const [open, setOpen] = useState(alwaysOpen ?? false);
  const [hover, setHover] = useState(false);
  const [dragHover, setDragHover] = useState(false);

  const ins = (b: Block) => { ops.insertBlockAt(index, b); setOpen(false); };

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragHover(true); };
  const handleDragLeave = () => setDragHover(false);
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const srcId = e.dataTransfer.getData('text/plain');
    if (srcId && ops.moveBlockToIndex) ops.moveBlockToIndex(srcId, index);
    setDragHover(false);
  };

  return (
    <div
      className="relative"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className={clsx('flex items-center transition-all', dragHover ? 'h-8' : open || hover ? 'h-6' : 'h-0.5')}>
        {dragHover && <div className="absolute inset-x-0 top-1/2 h-1 bg-primary-900 dark:bg-primary-100 rounded" />}
        <div className={clsx('flex-1 h-px transition-colors', hover || open ? 'bg-primary-300 dark:bg-primary-700' : 'bg-transparent')} />
        <button
          onClick={() => setOpen(!open)}
          className={clsx('mx-2 transition-all rounded-full flex items-center justify-center text-xs font-bold',
            open || hover
              ? 'w-6 h-6 bg-primary-900 text-primary-50 dark:bg-primary-100 dark:text-primary-900'
              : 'w-3 h-3 bg-primary-300 dark:bg-primary-700 text-transparent')}
          title="Insérer un bloc ici"
        >+</button>
        <div className={clsx('flex-1 h-px transition-colors', hover || open ? 'bg-primary-300 dark:bg-primary-700' : 'bg-transparent')} />
      </div>

      {open && (
        <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 z-20 bg-white dark:bg-primary-900 border border-primary-200 dark:border-primary-800 rounded-lg shadow-lg p-2 w-[420px]">
          <p className="text-[10px] uppercase tracking-wider text-primary-500 font-semibold px-2 mb-2">Choisir le type de bloc</p>
          <div className="grid grid-cols-3 gap-1">
            <PopBtn label="Titre H1" sub="Section principale" icon={<Hash className="w-3.5 h-3.5" />}
              onClick={() => ins({ id: uid(), type: 'h1', text: 'Nouveau titre', inToc: true })} />
            <PopBtn label="Titre H2" sub="Sous-section" icon={<Hash className="w-3.5 h-3.5 opacity-70" />}
              onClick={() => ins({ id: uid(), type: 'h2', text: 'Sous-titre', inToc: true })} />
            <PopBtn label="Titre H3" sub="Sous-rubrique" icon={<Hash className="w-3.5 h-3.5 opacity-50" />}
              onClick={() => ins({ id: uid(), type: 'h3', text: 'Sous-section', inToc: true })} />
            <PopBtn label="Paragraphe" sub="Texte libre" icon={<Type className="w-3.5 h-3.5" />}
              onClick={() => ins({ id: uid(), type: 'paragraph', text: 'Saisissez votre texte ici…' })} />
            <PopBtn label="KPIs" sub="Indicateurs" icon={<BarChart3 className="w-3.5 h-3.5" />}
              onClick={() => ins({ id: uid(), type: 'kpi', items: [{ label: 'KPI 1', value: '—' }, { label: 'KPI 2', value: '—' }] })} />
            <PopBtn label="Saut de page" sub="Nouvelle page" icon={<MoveDown className="w-3.5 h-3.5" />}
              onClick={() => ins({ id: uid(), type: 'pageBreak' })} />
          </div>
          <div className="border-t border-primary-200 dark:border-primary-800 mt-2 pt-2">
            <p className="text-[10px] uppercase tracking-wider text-primary-500 font-semibold px-2 mb-1">Depuis le catalogue</p>
            <div className="grid grid-cols-2 gap-1">
              <PopBtn label="Tables" sub="9 sources comptables" icon={<TableIcon className="w-3.5 h-3.5" />}
                onClick={() => { setOpen(false); ops.openTablesCatalog(index); }} highlight />
              <PopBtn label="Dashboards" sub="25 dashboards prêts" icon={<BarChart3 className="w-3.5 h-3.5" />}
                onClick={() => { setOpen(false); ops.openDashCatalog(index); }} highlight />
            </div>
          </div>
          <div className="flex justify-end mt-2 pt-2 border-t border-primary-200 dark:border-primary-800">
            <button onClick={() => setOpen(false)} className="text-[10px] text-primary-500 hover:text-primary-900">Fermer</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── BOUTON POPUP D'INSERTION ────────────────────────────────────
export function PopBtn({ icon, label, sub, onClick, highlight }: { icon: React.ReactNode; label: string; sub: string; onClick: () => void; highlight?: boolean }) {
  return (
    <button onClick={onClick}
      className={clsx('text-left p-2 rounded border transition',
        highlight
          ? 'border-primary-900 dark:border-primary-100 bg-primary-100 dark:bg-primary-900 hover:bg-primary-200 dark:hover:bg-primary-800'
          : 'border-primary-200 dark:border-primary-800 hover:bg-primary-100 dark:hover:bg-primary-900')}>
      <div className="flex items-center gap-1.5 mb-0.5">
        {icon}
        <span className="text-xs font-semibold">{label}</span>
      </div>
      <p className="text-[9px] text-primary-500 leading-tight">{sub}</p>
    </button>
  );
}

// ─── ÉDITION INLINE D'UN BLOC ────────────────────────────────────
export function BlockEditor({ block, data, palette, ops }: any) {
  const Controls = (
    <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition flex gap-0.5 bg-primary-100 dark:bg-primary-900 p-0.5 rounded shadow z-10">
      <button onClick={() => ops.moveBlock(block.id, -1)} className="btn-ghost !p-1 text-[10px]">↑</button>
      <button onClick={() => ops.moveBlock(block.id, 1)} className="btn-ghost !p-1 text-[10px]">↓</button>
      <button onClick={() => ops.removeBlock(block.id)} className="btn-ghost !p-1 text-[10px] text-error"><Trash2 className="w-3 h-3" /></button>
    </div>
  );

  const wrapper = (children: React.ReactNode) => (
    <div className="group relative hover:bg-primary-100/30 dark:hover:bg-primary-800/20 rounded px-1 py-0">
      {Controls}{children}
    </div>
  );

  if (block.type === 'h1' || block.type === 'h2' || block.type === 'h3') {
    const sizes = { h1: 'text-2xl font-bold', h2: 'text-lg font-bold', h3: 'text-base font-semibold' };
    const Tag = block.type as 'h1' | 'h2' | 'h3';
    return wrapper(
      <>
        <input
          className={clsx(sizes[block.type as keyof typeof sizes], 'w-full bg-transparent border-b border-transparent focus:border-primary-500 outline-none px-1 py-0.5 print:hidden')}
          value={block.text}
          onChange={(e) => ops.updateBlock(block.id, { text: e.target.value })}
          style={{ color: palette.primary }}
        />
        {/* Version texte pour l'impression PDF */}
        <Tag
          className={clsx(sizes[block.type as keyof typeof sizes], 'hidden print:block px-1 py-0.5 m-0')}
          style={{ color: palette.primary }}
        >
          {block.text}
        </Tag>
      </>
    );
  }
  if (block.type === 'paragraph') {
    // Texte affichable en édition (textarea) + version impression (p)
    // Le marker [Proph3t-auto] est nettoyé visuellement
    const cleanText = (block.text || '').replace(/^\[Proph3t-auto\]\s*/, '');
    return wrapper(
      <>
        <textarea
          className="w-full bg-transparent border border-dashed border-transparent focus:border-primary-500 hover:border-primary-300 dark:hover:border-primary-700 rounded px-2 py-1 text-sm resize-none outline-none overflow-hidden print:hidden"
          value={block.text}
          onChange={(e) => {
            ops.updateBlock(block.id, { text: e.target.value });
            e.target.style.height = 'auto';
            e.target.style.height = e.target.scrollHeight + 'px';
          }}
          ref={(el) => {
            if (el) {
              el.style.height = 'auto';
              el.style.height = el.scrollHeight + 'px';
            }
          }}
        />
        <p className="hidden print:block px-2 py-1 text-sm leading-relaxed m-0">{cleanText}</p>
      </>
    );
  }
  if (block.type === 'kpi') {
    return wrapper(
      <div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {block.items.map((it: any, i: number) => (
            <div key={i} className="border border-primary-200 dark:border-primary-800 rounded p-2 bg-primary-50 dark:bg-primary-950">
              <input className="w-full text-[10px] uppercase tracking-wider text-primary-500 font-semibold bg-transparent outline-none" value={it.label}
                onChange={(e) => { const items = [...block.items]; items[i] = { ...items[i], label: e.target.value }; ops.updateBlock(block.id, { items }); }} />
              <input className="w-full num text-base font-bold bg-transparent outline-none mt-1" style={{ color: palette.primary }} value={it.value}
                onChange={(e) => { const items = [...block.items]; items[i] = { ...items[i], value: e.target.value }; ops.updateBlock(block.id, { items }); }} />
              <input className="w-full text-[10px] text-primary-500 bg-transparent outline-none mt-0.5" placeholder="sous-valeur" value={it.subValue ?? ''}
                onChange={(e) => { const items = [...block.items]; items[i] = { ...items[i], subValue: e.target.value }; ops.updateBlock(block.id, { items }); }} />
            </div>
          ))}
        </div>
        <div className="flex gap-1 mt-2">
          <button className="btn-outline !py-1 text-xs" onClick={() => ops.updateBlock(block.id, { items: [...block.items, { label: `KPI ${block.items.length + 1}`, value: '—' }] })}>+ KPI</button>
          {block.items.length > 1 && <button className="btn-outline !py-1 text-xs" onClick={() => ops.updateBlock(block.id, { items: block.items.slice(0, -1) })}>− KPI</button>}
          <select className="input !py-1 text-xs !w-auto" value="" onChange={(e) => {
            if (!e.target.value) return;
            const v = e.target.value;
            const map: Record<string, { label: string; value: string }> = {
              ca: { label: 'CA', value: fmtMoney(data.sig?.ca ?? 0) },
              rn: { label: 'Résultat net', value: fmtMoney(data.sig?.resultat ?? 0) },
              ebe: { label: 'EBE', value: fmtMoney(data.sig?.ebe ?? 0) },
              va: { label: 'Valeur ajoutée', value: fmtMoney(data.sig?.valeurAjoutee ?? 0) },
              actif: { label: 'Total Actif', value: fmtMoney(data.bilanActif?.find((l: any) => l.code === '_BZ')?.value ?? 0) },
            };
            ops.updateBlock(block.id, { items: [...block.items, map[v]] });
            e.target.value = '';
          }}>
            <option value="">+ KPI calculé…</option>
            <option value="ca">CA</option><option value="rn">Résultat net</option><option value="ebe">EBE</option><option value="va">VA</option><option value="actif">Total Actif</option>
          </select>
        </div>
      </div>
    );
  }
  if (block.type === 'table') {
    return wrapper(
      <div>
        <div className="flex gap-2 mb-2 items-center">
          <select className="input !py-1 text-xs !w-auto" value={block.source} onChange={(e) => ops.updateBlock(block.id, { source: e.target.value as any })}>
            {TABLE_CATALOG.map((s) => <option key={s.v} value={s.v}>{s.cat} — {s.label}</option>)}
          </select>
          <input className="input !py-1 text-xs flex-1" placeholder="Titre du tableau (optionnel)" value={block.title ?? ''} onChange={(e) => ops.updateBlock(block.id, { title: e.target.value })} />
        </div>
        <TablePreview source={block.source} data={data} palette={palette} title={block.title} />
      </div>
    );
  }
  if (block.type === 'dashboard') {
    return wrapper(
      <div>
        <div className="flex gap-2 mb-2 items-center">
          <select className="input !py-1 text-xs !w-auto max-w-[280px]" value={block.dashboardId} onChange={(e) => ops.updateBlock(block.id, { dashboardId: e.target.value })}>
            {DASHBOARD_CATALOG.map((d) => <option key={d.id} value={d.id}>{d.cat} — {d.name}</option>)}
          </select>
          <input className="input !py-1 text-xs flex-1" placeholder="Titre (optionnel)" value={block.title ?? ''} onChange={(e) => ops.updateBlock(block.id, { title: e.target.value })} />
        </div>
        <DashboardSnippet id={block.dashboardId} data={data} palette={palette} />
      </div>
    );
  }
  if (block.type === 'pageBreak') {
    return (
      <div className="my-3 text-center text-[10px] text-primary-400 border-t-2 border-dashed border-primary-300 dark:border-primary-700 pt-1 group relative">
        {Controls}— Saut de page —
      </div>
    );
  }
  return null;
}
