// Modèle bloc-à-bloc pour le constructeur de rapport
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import PptxGenJS from 'pptxgenjs';
import { Line } from './statements';
import { BalanceRow } from './balance';
import { Ratio } from './ratios';
import type { IfrsLineC, IfrsReport } from './ifrs';

// ─── PALETTES ──────────────────────────────────────────────────────
export type PaletteKey = string;

export const PALETTES: Record<string, { name: string; primary: string; secondary: string; accent: string; success: string; danger: string; neutral: string; tableHeader: string; tableHeaderText: string; chartColors: string[] }> = {
  // Palette signature Cockpit FnA — graphite + sage primary + terracotta accent (par défaut)
  cockpit:   { name: 'Cockpit',      primary: '#171717', secondary: '#404040', accent: '#7FA88E', success: '#7FA88E', danger: '#C97A5A', neutral: '#737373', tableHeader: '#171717', tableHeaderText: '#FAFAFA', chartColors: ['#7FA88E','#C97A5A','#5E8772','#D4A574','#737373','#B5C4A8','#A3A3A3'] },
  // Palette Atlas Studio : anthracite + or mat
  atlas:     { name: 'Atlas Studio', primary: '#1F1F23', secondary: '#332915', accent: '#B8954A', success: '#22c55e', danger: '#ef4444', neutral: '#9C7D3E', tableHeader: '#1F1F23', tableHeaderText: '#D4B870', chartColors: ['#B8954A','#1F1F23','#D4B870','#9C7D3E','#6E5A2D','#E8D5A0','#4D3F20'] },
  graphite:  { name: 'Graphite',   primary: '#171717', secondary: '#404040', accent: '#737373', success: '#22c55e', danger: '#ef4444', neutral: '#a3a3a3', tableHeader: '#171717', tableHeaderText: '#fafafa', chartColors: ['#374151','#dc2626','#2563eb','#d97706','#059669','#7c3aed','#db2777'] },
  ardoise:   { name: 'Ardoise',    primary: '#0f172a', secondary: '#334155', accent: '#64748b', success: '#22c55e', danger: '#ef4444', neutral: '#94a3b8', tableHeader: '#0f172a', tableHeaderText: '#f8fafc', chartColors: ['#475569','#0ea5e9','#f59e0b','#10b981','#8b5cf6','#f43f5e','#06b6d4'] },
  marine:    { name: 'Marine',     primary: '#122a52', secondary: '#2f5285', accent: '#456da0', success: '#22c55e', danger: '#ef4444', neutral: '#9bb5e0', tableHeader: '#122a52', tableHeaderText: '#f0f5ff', chartColors: ['#1e40af','#f59e0b','#10b981','#ef4444','#8b5cf6','#ec4899','#06b6d4'] },
  foret:     { name: 'Forêt',      primary: '#183024', secondary: '#375e4c', accent: '#4d8068', success: '#22c55e', danger: '#ef4444', neutral: '#a3c5b0', tableHeader: '#183024', tableHeaderText: '#f2f7f4', chartColors: ['#065f46','#d97706','#dc2626','#2563eb','#7c3aed','#db2777','#0891b2'] },
  sable:     { name: 'Sable',      primary: '#3a3022', secondary: '#6e604a', accent: '#8e7d66', success: '#22c55e', danger: '#ef4444', neutral: '#b3a28a', tableHeader: '#3a3022', tableHeaderText: '#faf8f5', chartColors: ['#92400e','#1d4ed8','#047857','#be123c','#6d28d9','#0e7490','#a16207'] },
  bordeaux:  { name: 'Bordeaux',   primary: '#421c1c', secondary: '#7a3c3c', accent: '#9c5555', success: '#22c55e', danger: '#ef4444', neutral: '#c07878', tableHeader: '#421c1c', tableHeaderText: '#fdf5f5', chartColors: ['#991b1b','#2563eb','#d97706','#059669','#7c3aed','#0891b2','#c2410c'] },
  acier:     { name: 'Acier',      primary: '#212e3b', secondary: '#46596a', accent: '#5f7485', success: '#22c55e', danger: '#ef4444', neutral: '#8294a5', tableHeader: '#212e3b', tableHeaderText: '#f4f6f8', chartColors: ['#334155','#3b82f6','#f59e0b','#10b981','#ef4444','#8b5cf6','#ec4899'] },
  aubergine: { name: 'Aubergine',  primary: '#321c3a', secondary: '#613c6c', accent: '#7e558a', success: '#22c55e', danger: '#ef4444', neutral: '#a078aa', tableHeader: '#321c3a', tableHeaderText: '#f9f5fa', chartColors: ['#7c3aed','#2563eb','#db2777','#f59e0b','#10b981','#ef4444','#0891b2'] },
};

// ─── BLOCS ─────────────────────────────────────────────────────────
export type BlockType = 'h1' | 'h2' | 'h3' | 'paragraph' | 'kpi' | 'table' | 'dashboard' | 'pageBreak' | 'image' | 'spacer';

export type BlockBase = {
  id: string;
  type: BlockType;
  inToc?: boolean;            // pour h1/h2/h3 : inclure dans le sommaire
};

export type BlockH = BlockBase & { type: 'h1' | 'h2' | 'h3'; text: string; inToc?: boolean };
export type BlockParagraph = BlockBase & { type: 'paragraph'; text: string };
export type BlockKpi = BlockBase & { type: 'kpi'; items: Array<{ label: string; value: string; subValue?: string }> };
export type BlockTable = BlockBase & { type: 'table'; title?: string; source: string; limit?: number };
export type BlockDashboard = BlockBase & { type: 'dashboard'; dashboardId: string; title?: string };
export type BlockPageBreak = BlockBase & { type: 'pageBreak' };
export type BlockImage = BlockBase & { type: 'image'; dataUrl: string; caption?: string };
export type BlockSpacer = BlockBase & { type: 'spacer'; height?: number };

export type Block = BlockH | BlockParagraph | BlockKpi | BlockTable | BlockDashboard | BlockPageBreak | BlockImage | BlockSpacer;

// ─── REPORT CONFIG ────────────────────────────────────────────────
export type ReportConfig = {
  identity: {
    title: string;
    subtitle: string;
    period: string;
    periodFrom?: string; // YYYY-MM-DD
    periodTo?: string;   // YYYY-MM-DD
    author: string;
    confidentiality: 'public' | 'interne' | 'confidentiel' | 'strict';
    logoDataUrl?: string;
    /** Couleur de fond de la couverture (hex ou rgba) — optionnel, défaut blanc */
    coverBgColor?: string;
    /** Image de fond couverture (data URL) — optionnel */
    coverBgImageUrl?: string;
    /** Opacité de l'image de fond (0-1) — défaut 0.15 */
    coverBgOpacity?: number;
    /** Couleur du titre principal — défaut palette.primary */
    titleColor?: string;
    /** Couleur du sous-titre — défaut palette.primary */
    subtitleColor?: string;
    /** Style de couverture : 'classic' (centré), 'modern' (côté gauche), 'banner' (large bandeau) */
    coverStyle?: 'classic' | 'modern' | 'banner';
  };
  format: 'A4_portrait' | 'A4_landscape' | 'pptx';
  palette: PaletteKey;
  options: {
    includeCover: boolean;
    includeTOC: boolean;
    includeFooter: boolean;
    includePageNumbers: boolean;
  };
  blocks: Block[];
  recipients: string[];
};

export const DEFAULT_CONFIG = (period: string): ReportConfig => ({
  identity: {
    title: 'Rapport mensuel de gestion',
    subtitle: 'Analyse de performance financière',
    period,
    author: 'Direction Financière',
    confidentiality: 'interne',
  },
  format: 'A4_portrait',
  palette: 'cockpit',
  options: { includeCover: true, includeTOC: true, includeFooter: true, includePageNumbers: true },
  blocks: [],
  recipients: [],
});

// ─── DATA RÉFÉRENTIELLE ────────────────────────────────────────────
export type ReportData = {
  bilanActif: Line[];
  bilanPassif: Line[];
  cr: Line[];
  sig: any;
  balance: BalanceRow[];
  ratios: Ratio[];
  tft?: Line[];
  capital?: any[];
  budgetActual?: Array<{ code: string; label: string; realise: number; budget: number; ecart: number; ecartPct?: number; status: string }>;
  /** Liasse IFRS comparative (niveau GT) — alimente les sources ifrs_* */
  ifrs?: IfrsReport | null;
};

// ─── PDF BUILDER ───────────────────────────────────────────────────
const fmt = (n: number) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(n);

const CONFIDENTIALITY_LABEL = { public: 'Document public', interne: 'Usage interne', confidentiel: 'Confidentiel', strict: 'Strictement confidentiel' };

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.substring(0, 2), 16), parseInt(h.substring(2, 4), 16), parseInt(h.substring(4, 6), 16)];
}

export function buildPDFFromBlocks(config: ReportConfig, data: ReportData, orgName: string, orgSub?: string): jsPDF {
  const isLandscape = config.format === 'A4_landscape';
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: isLandscape ? 'landscape' : 'portrait' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const margin = 50;
  const palette = PALETTES[config.palette];
  const headerRGB = hexToRgb(palette.tableHeader);
  const headerTextRGB = hexToRgb(palette.tableHeaderText);
  const primaryRGB = hexToRgb(palette.primary);

  // Titres pour le sommaire
  const tocEntries: Array<{ text: string; level: 1 | 2 | 3; page: number }> = [];

  // ─ Couverture ─
  if (config.options.includeCover) {
    doc.setDrawColor(...primaryRGB);
    doc.setLineWidth(1.5);
    doc.rect(margin, margin, W - 2 * margin, H - 2 * margin);

    doc.setFontSize(9);
    doc.setTextColor(115, 115, 115);
    doc.text(CONFIDENTIALITY_LABEL[config.identity.confidentiality].toUpperCase(), W / 2, margin + 30, { align: 'center' });

    if (config.identity.logoDataUrl) {
      try { doc.addImage(config.identity.logoDataUrl, 'PNG', W / 2 - 40, margin + 70, 80, 60, undefined, 'FAST'); } catch { /* ignore */ }
    }

    doc.setFontSize(28);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...primaryRGB);
    const lines = doc.splitTextToSize(config.identity.title, W - 2 * margin - 40);
    doc.text(lines, W / 2, H / 2 - 30, { align: 'center' });

    if (config.identity.subtitle) {
      doc.setFontSize(14);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(115, 115, 115);
      doc.text(config.identity.subtitle, W / 2, H / 2 + 10, { align: 'center' });
    }

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(10, 10, 10);
    doc.text(orgName, W / 2, H / 2 + 60, { align: 'center' });
    if (orgSub) {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(115, 115, 115);
      doc.text(orgSub, W / 2, H / 2 + 80, { align: 'center' });
    }

    doc.setFontSize(11);
    doc.setTextColor(10, 10, 10);
    doc.text(`Période : ${config.identity.period}`, W / 2, H - 200, { align: 'center' });
    doc.text(`Émis par : ${config.identity.author}`, W / 2, H - 180, { align: 'center' });
    doc.text(`Date d'émission : ${new Date().toLocaleDateString('fr-FR')}`, W / 2, H - 160, { align: 'center' });
  }

  // ─ Sommaire (placeholder, on remplit après) ─
  let tocPage = 0;
  if (config.options.includeTOC) {
    doc.addPage();
    tocPage = doc.getNumberOfPages();
  }

  // ─ Helpers ─
  let cursorY = 0;
  const startNewContentPage = () => {
    doc.addPage();
    cursorY = margin + 20;
    drawPageHeader();
  };
  const ensureSpace = (need: number) => {
    if (cursorY + need > H - margin - 30) startNewContentPage();
  };
  const drawPageHeader = () => {
    doc.setFontSize(8);
    doc.setTextColor(115, 115, 115);
    doc.text(orgName, margin, 30);
    doc.text(config.identity.title, W / 2, 30, { align: 'center' });
    doc.text(config.identity.period, W - margin, 30, { align: 'right' });
    doc.setDrawColor(229, 229, 229);
    doc.line(margin, 38, W - margin, 38);
    doc.setTextColor(10, 10, 10);
  };

  startNewContentPage();

  // ─ Render blocks ─
  for (const block of config.blocks) {
    if (block.type === 'pageBreak') { startNewContentPage(); continue; }
    if (block.type === 'spacer') { cursorY += (block.height ?? 20); continue; }

    if (block.type === 'h1' || block.type === 'h2' || block.type === 'h3') {
      const h = block as BlockH;
      const sizes = { h1: 18, h2: 14, h3: 12 };
      const heights = { h1: 28, h2: 22, h3: 18 };
      ensureSpace(heights[h.type]);
      doc.setFontSize(sizes[h.type]);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...primaryRGB);
      doc.text(h.text, margin, cursorY + 8);
      if (h.type === 'h1') {
        doc.setDrawColor(...primaryRGB);
        doc.setLineWidth(0.8);
        doc.line(margin, cursorY + 14, W - margin, cursorY + 14);
      }
      cursorY += heights[h.type];
      doc.setTextColor(10, 10, 10);
      if (h.inToc !== false) {
        const level = h.type === 'h1' ? 1 : h.type === 'h2' ? 2 : 3;
        tocEntries.push({ text: h.text, level, page: doc.getNumberOfPages() });
      }
      continue;
    }

    if (block.type === 'paragraph') {
      const p = block as BlockParagraph;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(40, 40, 40);
      const wrapped = doc.splitTextToSize(p.text, W - 2 * margin);
      ensureSpace(wrapped.length * 12 + 6);
      doc.text(wrapped, margin, cursorY + 4);
      cursorY += wrapped.length * 12 + 8;
      doc.setTextColor(10, 10, 10);
      continue;
    }

    if (block.type === 'kpi') {
      const k = block as BlockKpi;
      const cols = Math.min(k.items.length, 4);
      const cellW = (W - 2 * margin) / cols;
      const cellH = 50;
      ensureSpace(cellH + 10);
      k.items.forEach((it, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = margin + col * cellW;
        const y = cursorY + row * (cellH + 6);
        doc.setDrawColor(229, 229, 229);
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(x + 2, y, cellW - 4, cellH, 4, 4, 'FD');
        doc.setFontSize(8);
        doc.setTextColor(115, 115, 115);
        doc.text(it.label.toUpperCase(), x + 8, y + 14);
        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...primaryRGB);
        doc.text(it.value, x + 8, y + 32);
        if (it.subValue) {
          doc.setFontSize(7);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(115, 115, 115);
          doc.text(it.subValue, x + 8, y + 44);
        }
      });
      const rows = Math.ceil(k.items.length / cols);
      cursorY += rows * (cellH + 6) + 6;
      doc.setTextColor(10, 10, 10);
      continue;
    }

    if (block.type === 'table' || block.type === 'dashboard') {
      const t = block.type === 'table' ? (block as BlockTable) : null;
      const d = block.type === 'dashboard' ? (block as BlockDashboard) : null;
      let body: any[][] = [];
      let head: string[] = [];
      let title = (t?.title || d?.title || '');
      const limit = t?.limit ?? 30;
      // Style « GT » pour les états financiers pro (sources ifrs_*) :
      // sous-totaux en gras sur fond léger, colonne Réf. normative grisée,
      // montants alignés à droite.
      const boldRows = new Set<number>();
      let refCol: number | null = null;

      // Helpers liasse IFRS (comparatif N/N-1 + réf. IAS/IFRS)
      const rep = data.ifrs ?? null;
      const ifrsHead = (r: IfrsReport) => (r.hasPrior ? ['Poste', String(r.yearN), String(r.yearN1), 'Réf.'] : ['Poste', String(r.yearN), 'Réf.']);
      const ifrsRow = (r: IfrsReport, l: IfrsLineC) => {
        const label = `${l.indent ? '    ' : ''}${l.fr}`;
        return r.hasPrior ? [label, fmt(l.value), fmt(l.prior), l.ref ?? ''] : [label, fmt(l.value), l.ref ?? ''];
      };
      const ifrsFill = (r: IfrsReport, lines: IfrsLineC[], startIdx = 0): number => {
        let i = startIdx;
        for (const l of lines) { if (l.total) boldRows.add(i); body.push(ifrsRow(r, l)); i++; }
        return i;
      };
      const ifrsSection = (r: IfrsReport, label: string, lines: IfrsLineC[], i: number): number => {
        boldRows.add(i);
        body.push(r.hasPrior ? [label, '', '', ''] : [label, '', '']);
        return ifrsFill(r, lines, i + 1);
      };
      const ifrsMissing = (fallbackTitle: string) => {
        head = ['Information'];
        body = [["Liasse IFRS indisponible — vérifier l'import du Grand Livre (module Reporting IFRS)."]];
        title ||= fallbackTitle;
      };

      if (t) {
        switch (t.source) {
          case 'ifrs_pnl': {
            if (!rep) { ifrsMissing('Compte de résultat IFRS'); break; }
            head = ifrsHead(rep); refCol = head.length - 1;
            ifrsFill(rep, rep.pnl);
            title ||= 'Compte de résultat IFRS (IAS 1 — par nature)';
            break;
          }
          case 'ifrs_oci': {
            if (!rep) { ifrsMissing('Résultat global (OCI)'); break; }
            head = ifrsHead(rep); refCol = head.length - 1;
            ifrsFill(rep, rep.oci);
            title ||= 'État du résultat global (IAS 1.82A)';
            break;
          }
          case 'ifrs_sofp': {
            if (!rep) { ifrsMissing('Situation financière IFRS'); break; }
            head = ifrsHead(rep); refCol = head.length - 1;
            let i = 0;
            i = ifrsSection(rep, 'ACTIFS NON COURANTS', rep.sofpNCA, i);
            i = ifrsSection(rep, 'ACTIFS COURANTS', rep.sofpCA, i);
            boldRows.add(i);
            body.push(rep.hasPrior ? ['TOTAL ACTIF', fmt(rep.totalAssetsN), fmt(rep.totalAssetsN1), ''] : ['TOTAL ACTIF', fmt(rep.totalAssetsN), '']);
            i++;
            i = ifrsSection(rep, 'CAPITAUX PROPRES', rep.sofpEquity, i);
            i = ifrsSection(rep, 'PASSIFS NON COURANTS', rep.sofpNCL, i);
            i = ifrsSection(rep, 'PASSIFS COURANTS', rep.sofpCL, i);
            boldRows.add(i);
            body.push(rep.hasPrior ? ['TOTAL CAPITAUX PROPRES & PASSIFS', fmt(rep.totalELN), fmt(rep.totalELN1), ''] : ['TOTAL CAPITAUX PROPRES & PASSIFS', fmt(rep.totalELN), '']);
            title ||= 'État de la situation financière (IAS 1 — current / non-current)';
            break;
          }
          case 'ifrs_sce': {
            if (!rep) { ifrsMissing('Variation des capitaux propres IFRS'); break; }
            head = ['', ...rep.sce.components];
            rep.sce.rows.forEach((row, i) => {
              if (i === 0 || i === rep.sce.rows.length - 1) boldRows.add(i);
              body.push([row.label, ...row.values.map((v) => (v !== 0 ? fmt(v) : '—'))]);
            });
            title ||= 'Variation des capitaux propres (IAS 1.106)';
            break;
          }
          case 'ifrs_cashflow': {
            if (!rep) { ifrsMissing('Flux de trésorerie IFRS'); break; }
            head = ['Poste', String(rep.yearN), 'Réf.']; refCol = 2;
            rep.cashflow.forEach((l, i) => {
              if (l.total || /h$/.test(l.code)) boldRows.add(i);
              body.push([`${l.indent ? '    ' : ''}${l.fr}`, l.value !== 0 || l.total ? fmt(l.value) : '', l.ref ?? '']);
            });
            title ||= 'Tableau des flux de trésorerie (IAS 7 — méthode indirecte)';
            break;
          }
          case 'ifrs_recon': {
            if (!rep) { ifrsMissing('Réconciliation SYSCOHADA → IFRS'); break; }
            head = ['Pont des capitaux propres (IFRS 1)', 'Montant'];
            rep.reconEquity.forEach((l, i) => { if (l.total) boldRows.add(i); body.push([`${l.indent ? '    ' : ''}${l.fr}`, fmt(l.value)]); });
            const offset = rep.reconEquity.length;
            boldRows.add(offset);
            body.push(['', '']);
            body.push(['PONT DU RÉSULTAT', '']);
            boldRows.add(offset + 1);
            rep.reconResult.forEach((l, i) => { if (l.total) boldRows.add(offset + 2 + i); body.push([`${l.indent ? '    ' : ''}${l.fr}`, fmt(l.value)]); });
            title ||= 'Réconciliation SYSCOHADA → IFRS (capitaux propres & résultat)';
            break;
          }
          case 'bilan_actif': head = ['Code', 'Poste', 'Montant']; body = data.bilanActif.map((l) => [l.code.startsWith('_') ? '' : l.code, l.label, fmt(l.value)]); title ||= 'Bilan — Actif'; break;
          case 'bilan_passif': head = ['Code', 'Poste', 'Montant']; body = data.bilanPassif.map((l) => [l.code.startsWith('_') ? '' : l.code, l.label, fmt(l.value)]); title ||= 'Bilan — Passif'; break;
          case 'cr': head = ['Code', 'Poste', 'Montant']; body = data.cr.map((l) => [l.code.startsWith('_') ? '' : l.code, l.label, fmt(l.value)]); title ||= 'Compte de résultat'; break;
          case 'sig': head = ['Solde', 'Valeur']; body = [
            ['Marge brute', fmt(data.sig.margeBrute)], ['Valeur ajoutée', fmt(data.sig.valeurAjoutee)],
            ['EBE', fmt(data.sig.ebe)], ["Résultat d'exploitation", fmt(data.sig.re)],
            ['Résultat financier', fmt(data.sig.rf)], ['Résultat net', fmt(data.sig.resultat)],
          ]; title ||= 'Soldes intermédiaires de gestion'; break;
          case 'balance': head = ['Compte', 'Libellé', 'Débit', 'Crédit', 'Solde D', 'Solde C']; body = data.balance.slice(0, limit).map((r) => [r.account, r.label, fmt(r.debit), fmt(r.credit), r.soldeD ? fmt(r.soldeD) : '', r.soldeC ? fmt(r.soldeC) : '']); title ||= `Balance générale (${Math.min(limit, data.balance.length)} sur ${data.balance.length})`; break;
          case 'ratios': head = ['Famille', 'Ratio', 'Valeur', 'Cible', 'Statut']; body = data.ratios.map((r) => [r.family, r.label, r.unit === '%' ? `${r.value.toFixed(1)} %` : r.unit === 'j' ? `${Math.round(r.value)} j` : r.value.toFixed(2), `${r.target}${r.unit === '%' ? ' %' : ''}`, r.status === 'good' ? 'OK' : r.status === 'warn' ? 'Vigilance' : 'Alerte']); title ||= 'Ratios financiers'; break;
          case 'budget_actual': {
            const ba = data.budgetActual ?? [];
            const totB = ba.reduce((s: number, r: any) => s + (r.budget ?? 0), 0);
            const hasB = Math.abs(totB) > 0.01;
            head = ['Compte', 'Libellé', 'Réalisé', 'Budget', 'Écart', 'Var %'];
            body = ba.slice(0, limit).map((r) => [
              r.code, r.label, fmt(r.realise),
              hasB ? fmt(r.budget) : '—',
              hasB ? fmt(r.ecart) : '—',
              hasB && r.ecartPct ? r.ecartPct.toFixed(1) + '%' : '—',
            ]);
            title ||= 'Budget vs Réalisé';
            break;
          }
          case 'capital': head = ['Rubrique', 'Ouverture', 'Augm.', 'Dimin.', 'Clôture']; body = (data.capital ?? []).map((m: any) => [m.rubrique, fmt(m.ouverture), m.augmentation ? '+' + fmt(m.augmentation) : '—', m.diminution ? '−' + fmt(m.diminution) : '—', fmt(m.cloture)]); title ||= 'Variation des capitaux propres'; break;
          case 'tft': head = ['Code', 'Poste', 'Montant']; body = (data.tft ?? []).map((l) => [l.code.startsWith('_') ? '' : l.code, l.label, fmt(l.value)]); title ||= 'Tableau des flux de trésorerie'; break;
        }
      }

      if (d) {
        // Pour les dashboards, on injecte un placeholder text + un sous-ensemble de KPIs déjà calculés depuis data
        title ||= `Dashboard : ${d.dashboardId}`;
        head = ['Indicateur', 'Valeur'];
        const dashKpi = (() => {
          switch (d.dashboardId) {
            case 'home': return [['Chiffre d\'affaires', fmt(data.sig.ca)], ['Résultat net', fmt(data.sig.resultat)], ['EBE', fmt(data.sig.ebe)], ['Marge brute', fmt(data.sig.margeBrute)]];
            // BUG FIX (audit) : Charges & Produits.
            // En SYSCOHADA : RA = Ventes marchandises (PRODUIT), RB = Achats march. (CHARGE),
            // RC = Var. stocks march. (CHARGE), RD = MARGE BRUTE marchandises (calculée).
            // L'ancienne formule sommait RA+RB+RC+RD comme "Total Charges" — non sensé
            // comptablement. Désormais on prend les vrais agrégats SIG.
            case 'cp': {
              const sig = data.sig;
              // Charges = sig.charges si dispo, sinon CA - résultat (approx).
              const totalCharges = (sig.ca ?? 0) - (sig.resultat ?? 0);
              return [
                ['Chiffre d\'affaires (produits)', fmt(sig.ca ?? 0)],
                ['Total charges (≈ CA − résultat)', fmt(totalCharges)],
                ['Résultat exploitation', fmt(sig.re ?? 0)],
                ['Résultat net', fmt(sig.resultat ?? 0)],
              ];
            }
            case 'ratios': return data.ratios.slice(0, 6).map((r) => [r.label, r.unit === '%' ? `${r.value.toFixed(1)} %` : `${r.value.toFixed(2)}`]);
            default: return [['CA', fmt(data.sig.ca)], ['Résultat', fmt(data.sig.resultat)]];
          }
        })();
        body = dashKpi;
      }

      ensureSpace(120);
      if (title) {
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...primaryRGB);
        doc.text(title, margin, cursorY + 8);
        cursorY += 14;
        doc.setTextColor(10, 10, 10);
      }
      autoTable(doc, {
        startY: cursorY,
        head: [head], body,
        headStyles: { fillColor: headerRGB, textColor: headerTextRGB, fontSize: 9 },
        styles: { fontSize: 9, cellPadding: 4 },
        margin: { left: margin, right: margin },
        didDrawPage: (data) => { cursorY = data.cursor?.y ?? cursorY; drawPageHeader(); },
        // Style « GT » (états financiers pro) : sous-totaux gras sur fond léger,
        // montants alignés à droite, colonne Réf. normative discrète.
        didParseCell: (h) => {
          if (h.section !== 'body') return;
          if (boldRows.has(h.row.index)) {
            h.cell.styles.fontStyle = 'bold';
            h.cell.styles.fillColor = [246, 245, 243];
          }
          if (refCol !== null) {
            if (h.column.index === refCol) {
              h.cell.styles.textColor = [160, 160, 160];
              h.cell.styles.fontSize = 6.5;
              h.cell.styles.halign = 'right';
            } else if (h.column.index > 0) {
              h.cell.styles.halign = 'right';
            }
          }
        },
      });
      cursorY = (doc as any).lastAutoTable.finalY + 12;
      continue;
    }

    if (block.type === 'image') {
      const img = block as BlockImage;
      ensureSpace(220);
      try { doc.addImage(img.dataUrl, 'PNG', margin, cursorY, W - 2 * margin, 200, undefined, 'FAST'); } catch { /* ignore */ }
      cursorY += 210;
      if (img.caption) {
        doc.setFontSize(9);
        doc.setTextColor(115, 115, 115);
        doc.text(img.caption, W / 2, cursorY, { align: 'center' });
        cursorY += 14;
        doc.setTextColor(10, 10, 10);
      }
      continue;
    }
  }

  // ─ Fill TOC ─
  if (config.options.includeTOC && tocPage > 0) {
    doc.setPage(tocPage);
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...primaryRGB);
    doc.text('Sommaire', margin, 80);
    doc.setTextColor(10, 10, 10);
    doc.setFont('helvetica', 'normal');
    let y = 120;
    for (const e of tocEntries) {
      doc.setFontSize(e.level === 1 ? 11 : e.level === 2 ? 10 : 9);
      const indent = (e.level - 1) * 16;
      const text = e.text.length > 70 ? e.text.substring(0, 70) + '…' : e.text;
      doc.text(text, margin + indent, y);
      const tw = doc.getTextWidth(text);
      const pw = doc.getTextWidth(String(e.page));
      doc.setTextColor(180, 180, 180);
      let x = margin + indent + tw + 6;
      while (x < W - margin - pw - 6) { doc.text('.', x, y); x += 4; }
      doc.setTextColor(10, 10, 10);
      doc.text(String(e.page), W - margin, y, { align: 'right' });
      y += e.level === 1 ? 20 : 16;
      if (y > H - 80) break;
    }
  }

  // ─ Footer ─
  if (config.options.includeFooter || config.options.includePageNumbers) {
    const total = doc.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(115, 115, 115);
      doc.setDrawColor(229, 229, 229);
      doc.line(margin, H - 35, W - margin, H - 35);
      if (config.options.includeFooter) {
        doc.text(CONFIDENTIALITY_LABEL[config.identity.confidentiality], margin, H - 20);
        doc.text('Cockpit FnA · SYSCOHADA révisé 2017', W / 2, H - 20, { align: 'center' });
      }
      if (config.options.includePageNumbers) {
        doc.text(`Page ${i} / ${total}`, W - margin, H - 20, { align: 'right' });
      }
      doc.setTextColor(10, 10, 10);
    }
  }

  return doc;
}

// ─── PPTX BUILDER ──────────────────────────────────────────────────
export async function buildPPTXFromBlocks(config: ReportConfig, data: ReportData, orgName: string): Promise<Blob> {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.title = config.identity.title;
  pptx.author = config.identity.author;
  const palette = PALETTES[config.palette];

  // Cover slide
  if (config.options.includeCover) {
    const s = pptx.addSlide();
    s.background = { color: 'FFFFFF' };
    s.addText(config.identity.title, { x: 0.5, y: 1.5, w: 12.3, h: 1.5, fontSize: 36, bold: true, color: palette.primary.replace('#',''), align: 'center' });
    if (config.identity.subtitle) s.addText(config.identity.subtitle, { x: 0.5, y: 3, w: 12.3, h: 0.8, fontSize: 18, italic: true, color: '737373', align: 'center' });
    s.addText(orgName, { x: 0.5, y: 4.5, w: 12.3, h: 0.6, fontSize: 22, bold: true, align: 'center' });
    s.addText(`Période : ${config.identity.period}`, { x: 0.5, y: 5.5, w: 12.3, h: 0.4, fontSize: 12, align: 'center', color: '525252' });
    s.addText(`Émis par : ${config.identity.author}`, { x: 0.5, y: 5.9, w: 12.3, h: 0.4, fontSize: 12, align: 'center', color: '525252' });
  }

  // Process blocks
  let currentSlide = pptx.addSlide();
  let yPos = 0.5;
  const newSlide = () => { currentSlide = pptx.addSlide(); yPos = 0.5; };

  for (const b of config.blocks) {
    if (b.type === 'pageBreak') { newSlide(); continue; }
    if (b.type === 'spacer') { yPos += 0.3; continue; }
    if (yPos > 6.5) newSlide();

    if (b.type === 'h1' || b.type === 'h2' || b.type === 'h3') {
      const h = b as BlockH;
      const fs = b.type === 'h1' ? 28 : b.type === 'h2' ? 22 : 16;
      currentSlide.addText(h.text, { x: 0.5, y: yPos, w: 12.3, h: 0.6, fontSize: fs, bold: true, color: palette.primary.replace('#','') });
      yPos += b.type === 'h1' ? 0.8 : 0.6;
      continue;
    }
    if (b.type === 'paragraph') {
      const p = b as BlockParagraph;
      currentSlide.addText(p.text, { x: 0.5, y: yPos, w: 12.3, h: 1, fontSize: 12, color: '262626' });
      yPos += 1.1;
      continue;
    }
    if (b.type === 'kpi') {
      const k = b as BlockKpi;
      const cols = Math.min(k.items.length, 4);
      const cellW = 12.3 / cols;
      k.items.forEach((it, i) => {
        const x = 0.5 + (i % cols) * cellW;
        const y = yPos + Math.floor(i / cols) * 1.2;
        currentSlide.addShape('rect', { x, y, w: cellW - 0.1, h: 1.1, fill: { color: 'F8FAFC' }, line: { color: 'E2E8F0', width: 0.5 } });
        currentSlide.addText(it.label, { x: x + 0.1, y: y + 0.1, w: cellW - 0.3, h: 0.3, fontSize: 9, color: '737373', bold: true });
        currentSlide.addText(it.value, { x: x + 0.1, y: y + 0.45, w: cellW - 0.3, h: 0.5, fontSize: 18, bold: true, color: palette.primary.replace('#','') });
        if (it.subValue) currentSlide.addText(it.subValue, { x: x + 0.1, y: y + 0.85, w: cellW - 0.3, h: 0.25, fontSize: 8, color: '737373' });
      });
      yPos += Math.ceil(k.items.length / cols) * 1.2 + 0.2;
      continue;
    }
    if (b.type === 'table' || b.type === 'dashboard') {
      const t = b.type === 'table' ? (b as BlockTable) : null;
      const limit = 12;
      let head: string[] = [], body: any[][] = [];
      if (t) {
        switch (t.source) {
          case 'bilan_actif': head = ['Code','Poste','Montant']; body = data.bilanActif.slice(0, limit).map((l) => [l.code.startsWith('_')?'':l.code, l.label, fmt(l.value)]); break;
          case 'bilan_passif': head = ['Code','Poste','Montant']; body = data.bilanPassif.slice(0, limit).map((l) => [l.code.startsWith('_')?'':l.code, l.label, fmt(l.value)]); break;
          case 'cr': head = ['Code','Poste','Montant']; body = data.cr.slice(0, limit).map((l) => [l.code.startsWith('_')?'':l.code, l.label, fmt(l.value)]); break;
          case 'ratios': head = ['Ratio','Valeur','Cible']; body = data.ratios.slice(0, limit).map((r) => [r.label, r.unit==='%'?`${r.value.toFixed(1)} %`:r.value.toFixed(2), `${r.target}`]); break;
          case 'budget_actual': {
            const ba = data.budgetActual ?? [];
            const totB = ba.reduce((s: number, r: any) => s + (r.budget ?? 0), 0);
            const hasB = Math.abs(totB) > 0.01;
            head = ['Compte', 'Réalisé', 'Budget', 'Écart'];
            body = ba.slice(0, limit).map((r) => [
              r.label, fmt(r.realise),
              hasB ? fmt(r.budget) : '—',
              hasB ? fmt(r.ecart) : '—',
            ]);
            break;
          }
          case 'ifrs_pnl': case 'ifrs_oci': case 'ifrs_sofp': case 'ifrs_cashflow': case 'ifrs_recon': {
            const r = data.ifrs;
            if (!r) { head = ['Info']; body = [['Liasse IFRS indisponible']]; break; }
            head = r.hasPrior && t.source !== 'ifrs_cashflow' && t.source !== 'ifrs_recon' ? ['Poste', String(r.yearN), String(r.yearN1)] : ['Poste', String(r.yearN)];
            const src: IfrsLineC[] = t.source === 'ifrs_pnl' ? r.pnl : t.source === 'ifrs_oci' ? r.oci : t.source === 'ifrs_cashflow' ? r.cashflow : t.source === 'ifrs_recon' ? r.reconEquity : [...r.sofpNCA, ...r.sofpCA, ...r.sofpEquity];
            body = src.slice(0, limit).map((l) => (head.length === 3 ? [l.fr, fmt(l.value), fmt(l.prior)] : [l.fr, fmt(l.value)]));
            break;
          }
          case 'ifrs_sce': {
            const r = data.ifrs;
            if (!r) { head = ['Info']; body = [['Liasse IFRS indisponible']]; break; }
            head = ['', ...r.sce.components];
            body = r.sce.rows.map((row) => [row.label, ...row.values.map((v) => (v !== 0 ? fmt(v) : '—'))]);
            break;
          }
          default: head = ['Indicateur','Valeur']; body = [['CA', fmt(data.sig.ca)], ['Résultat', fmt(data.sig.resultat)]];
        }
      } else {
        head = ['Indicateur','Valeur'];
        body = [['CA', fmt(data.sig.ca)], ['Résultat', fmt(data.sig.resultat)], ['EBE', fmt(data.sig.ebe)]];
      }
      const tableData = [head.map((h) => ({ text: h, options: { bold: true, color: 'FFFFFF', fill: { color: palette.tableHeader.replace('#','') }, fontSize: 10 } })), ...body.map((row) => row.map((c) => ({ text: String(c), options: { fontSize: 9 } })))];
      currentSlide.addTable(tableData as any, { x: 0.5, y: yPos, w: 12.3, fontSize: 9 });
      yPos += body.length * 0.3 + 0.5;
      continue;
    }
  }

  // Footer pages
  // Note: pptxgenjs ne supporte pas masters facilement ici, on les passe.

  return await pptx.write({ outputType: 'blob' }) as Blob;
}
