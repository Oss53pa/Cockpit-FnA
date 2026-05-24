// ─── RENDU DES PAGES (simulation A4) ─────────────────────────────
import React from 'react';
import type { Block, ReportConfig } from '../../engine/reportBlocks';
import { PageA4, CoverPage, BackCoverPage, TocPage } from './PageComponents';
import { DraggableBlock, InsertHere } from './BlockComponents';

export function renderPages(config: ReportConfig, data: any, palette: any, ops: any) {
  const isLandscape = config.format === 'A4_landscape';
  // maxH = hauteur MAX d'une page (au-delà → badge "Hors marge"). Cela respecte
  // la dimension A4 mais on n'IMPOSE plus de minHeight, donc une page courte
  // ne génère plus d'espace blanc inutile.
  const maxH = config.format === 'pptx' ? 540 : isLandscape ? 760 : 1400;
  // Pas de maxWidth en écran : la page A4 occupe toute la cellule grid centrale.
  // Le ratio A4 réel est respecté à l'impression via les CSS @page (cf. index.css).
  // overflow:hidden empêche le débordement visuel d'un contenu qui déborderait
  // (cover dont le contenu ferait > aspect-ratio * width). Sans ça, le contenu
  // débordait et apparaissait comme une 2e page (artifact visuel de la grille).
  const pageStyle: React.CSSProperties = config.format === 'pptx'
    ? { width: '100%', aspectRatio: '16/9', minHeight: 'auto', maxHeight: maxH, overflow: 'hidden' }
    : isLandscape
      ? { width: '100%', aspectRatio: '297/210', minHeight: 'auto', maxHeight: maxH, overflow: 'hidden' }
      : { width: '100%', aspectRatio: '210/297', minHeight: 'auto', maxHeight: maxH, overflow: 'hidden' };

  // Estimation de la hauteur de chaque bloc (en px) pour pagination auto.
  // Pour les tables : on utilise le NOMBRE RÉEL DE LIGNES dans `data` afin
  // d'éviter qu'une table de 30 lignes soit estimée à 320px et déborde.
  const estimateTableRows = (source: string): number => {
    const ba = data?.budgetActual ?? [];
    if (!source) return 10;
    if (source === 'budget_actual') {
      return ba.filter((r: any) => Math.abs(r.realise) > 0.01 || Math.abs(r.budget) > 0.01).length;
    }
    if (source.startsWith('crtab_')) {
      const PFX: Record<string, string[]> = {
        produits_expl: ['70','71','72','73','74','75','781'],
        charges_expl: ['60','61','62','63','64','65','66','681','691'],
        produits_fin: ['77','786','797'],
        charges_fin: ['67','687','697'],
        produits_hao: ['82','84','86','88'],
        charges_hao: ['81','83','85'],
        impots: ['87','89'],
      };
      const parts = source.replace('crtab_', '').split('_');
      const sectionKey = parts.slice(0, -1).join('_');
      const prefixes = PFX[sectionKey] ?? [];
      return ba
        .filter((r: any) => prefixes.some((p) => r.code?.startsWith(p)))
        .filter((r: any) => Math.abs(r.realise) > 0.01 || Math.abs(r.budget) > 0.01)
        .length;
    }
    if (source === 'balance') return (data?.balance ?? []).filter((r: any) => Math.abs(r.soldeD) > 0.01 || Math.abs(r.soldeC) > 0.01).length;
    if (source === 'bilan_actif') return (data?.bilanActif ?? []).length;
    if (source === 'bilan_passif') return (data?.bilanPassif ?? []).length;
    if (source === 'cr') return (data?.cr ?? []).length;
    if (source === 'ratios') return (data?.ratios ?? []).length;
    if (source === 'tft') return (data?.tft ?? []).length;
    if (source === 'sig') return 5;
    return 10;
  };

  const estimateHeight = (b: Block): number => {
    switch (b.type) {
      case 'h1': return 60;
      case 'h2': return 42;
      case 'h3': return 32;
      case 'paragraph': {
        const text = (b as any).text || '';
        const lines = Math.ceil(text.length / 90);
        return Math.max(40, lines * 22 + 16);
      }
      case 'kpi': {
        const items = (b as any).items?.length || 4;
        const rows = Math.ceil(items / 4);
        return rows * 80 + 40;
      }
      case 'table': {
        // Header (~50) + titre (~25) + N lignes × 24px + footer (~25)
        const rows = Math.min(estimateTableRows((b as any).source), 30);
        return Math.max(120, 100 + rows * 24);
      }
      case 'dashboard': {
        const dashId = (b as any).dashboardId;
        if (dashId === 'pareto') return 540;
        if (dashId === 'client' || dashId === 'fr') return 480;
        if (dashId === 'waterfall') return 280;
        if (dashId === 'cashflow') return 340;
        if (dashId === 'cashforecast') return 340;
        if (dashId === 'bfr') return 280;
        if (dashId === 'exec') return 340;
        if (dashId === 'struct_actif' || dashId === 'struct_passif') return 280;
        if (dashId === 'pyramide_perf') return 380;
        if (dashId === 'ratios_table') return 540;
        if (dashId === 'compliance') return 700; // KPIs + 10 contrôles + recos
        return 220;
      }
      case 'pageBreak': return 0;
      default: return 60;
    }
  };

  // Pagination AUTO uniquement (pas de pageBreak forcé) : on remplit chaque
  // page jusqu'à atteindre la limite, puis on passe à la suivante. Évite tout
  // espace vide au bas des pages courtes.
  const PAGE_BUDGET = maxH - 60; // marge de sécurité (padding p-4 = 32px + safety 28px)
  const blocksWithIndex = config.blocks
    .filter((b) => b.type !== 'pageBreak') // on IGNORE les pageBreak manuels
    .map((b, i) => ({ block: b, index: i }));
  const pages: Array<Array<{ block: Block; index: number }>> = [[]];
  let currentHeight = 0;
  for (const item of blocksWithIndex) {
    const h = estimateHeight(item.block);
    if (h > PAGE_BUDGET && pages[pages.length - 1].length > 0) {
      pages.push([item]);
      currentHeight = h;
      continue;
    }
    if (currentHeight + h > PAGE_BUDGET && pages[pages.length - 1].length > 0) {
      pages.push([item]);
      currentHeight = h;
    } else {
      pages[pages.length - 1].push(item);
      currentHeight += h;
    }
  }
  // Élimine les pages vides éventuelles
  const nonEmptyPages = pages.filter((p) => p.length > 0);

  // Calcul du nombre total de pages pour la pagination
  const coverPages = config.options.includeCover ? 1 : 0;
  const tocPages = config.options.includeTOC ? 1 : 0;
  const backCoverPages = (config.options as any).includeBackCover !== false ? 1 : 0; // activé par défaut
  const totalPages = coverPages + tocPages + nonEmptyPages.length + backCoverPages;
  let pageNum = 0;

  return (
    <>
      {config.options.includeCover && (
        <PageA4 style={pageStyle} maxH={maxH} pageNum={++pageNum} totalPages={totalPages} palette={palette} hideNumber pageType="cover">
          <CoverPage config={config} palette={palette} org={ops.org} setLogo={ops.setLogo} setCoverProps={ops.setCoverProps} />
        </PageA4>
      )}

      {config.options.includeTOC && (
        <PageA4 style={pageStyle} maxH={maxH} pageNum={++pageNum} totalPages={totalPages} palette={palette} pageType="toc">
          <TocPage config={config} palette={palette} />
        </PageA4>
      )}

      {nonEmptyPages.map((pageBlocks, pi) => (
        <PageA4 key={pi} style={pageStyle} maxH={maxH} pageNum={++pageNum} totalPages={totalPages} palette={palette} pageType="content">
          {pageBlocks.map(({ block, index }) => (
            <DraggableBlock key={block.id} block={block} index={index} ops={ops} data={data} palette={palette} />
          ))}
          {pageBlocks.length > 0 && <InsertHere index={pageBlocks[pageBlocks.length - 1].index + 1} ops={ops} />}
        </PageA4>
      ))}

      {backCoverPages > 0 && (
        <PageA4 style={pageStyle} maxH={maxH} pageNum={++pageNum} totalPages={totalPages} palette={palette} hideNumber pageType="back">
          <BackCoverPage config={config} palette={palette} org={ops.org} />
        </PageA4>
      )}
    </>
  );
}
