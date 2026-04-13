// Modèle bloc-à-bloc pour le constructeur de rapport
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import PptxGenJS from 'pptxgenjs';
import { Line } from './statements';
import { BalanceRow } from './balance';
import { Ratio } from './ratios';

// ─── PALETTES ──────────────────────────────────────────────────────
export type PaletteKey = 'mono' | 'corporate' | 'forest' | 'sunset' | 'ocean' | 'bw';

export const PALETTES: Record<PaletteKey, { name: string; primary: string; secondary: string; accent: string; success: string; danger: string; neutral: string; tableHeader: string; tableHeaderText: string; chartColors: string[] }> = {
  mono:      { name: 'Monochrome (défaut)', primary: '#171717', secondary: '#404040', accent: '#737373', success: '#22c55e', danger: '#ef4444', neutral: '#a3a3a3', tableHeader: '#171717', tableHeaderText: '#fafafa', chartColors: ['#0a0a0a','#262626','#404040','#525252','#737373','#a3a3a3','#d4d4d4'] },
  corporate: { name: 'Corporate (bleu)',    primary: '#1e40af', secondary: '#3b82f6', accent: '#6366f1', success: '#10b981', danger: '#ef4444', neutral: '#94a3b8', tableHeader: '#1e3a5f', tableHeaderText: '#ffffff', chartColors: ['#1e3a5f','#1e40af','#3b82f6','#60a5fa','#93c5fd','#bfdbfe','#dbeafe'] },
  forest:    { name: 'Forêt (vert)',        primary: '#065f46', secondary: '#10b981', accent: '#14b8a6', success: '#22c55e', danger: '#ef4444', neutral: '#94a3b8', tableHeader: '#064e3b', tableHeaderText: '#ffffff', chartColors: ['#064e3b','#065f46','#047857','#10b981','#34d399','#6ee7b7','#a7f3d0'] },
  sunset:    { name: 'Coucher (orange)',    primary: '#9a3412', secondary: '#f97316', accent: '#fb923c', success: '#22c55e', danger: '#dc2626', neutral: '#94a3b8', tableHeader: '#7c2d12', tableHeaderText: '#ffffff', chartColors: ['#7c2d12','#9a3412','#c2410c','#f97316','#fb923c','#fdba74','#fed7aa'] },
  ocean:     { name: 'Océan (cyan)',        primary: '#0e7490', secondary: '#06b6d4', accent: '#22d3ee', success: '#10b981', danger: '#ef4444', neutral: '#94a3b8', tableHeader: '#155e75', tableHeaderText: '#ffffff', chartColors: ['#155e75','#0e7490','#0891b2','#06b6d4','#22d3ee','#67e8f9','#a5f3fc'] },
  bw:        { name: 'N&B strict',          primary: '#000000', secondary: '#525252', accent: '#737373', success: '#000000', danger: '#000000', neutral: '#a3a3a3', tableHeader: '#000000', tableHeaderText: '#ffffff', chartColors: ['#000000','#262626','#404040','#525252','#737373','#a3a3a3','#d4d4d4'] },
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
export type BlockTable = BlockBase & { type: 'table'; title?: string; source: 'bilan_actif' | 'bilan_passif' | 'cr' | 'sig' | 'balance' | 'ratios' | 'budget_actual' | 'capital' | 'tft'; limit?: number };
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
    author: string;
    confidentiality: 'public' | 'interne' | 'confidentiel' | 'strict';
    logoDataUrl?: string;
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
  palette: 'mono',
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
  budgetActual?: Array<{ code: string; label: string; realise: number; budget: number; ecart: number; status: string }>;
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
      try { doc.addImage(config.identity.logoDataUrl, 'PNG', W / 2 - 40, margin + 70, 80, 60, undefined, 'FAST'); } catch {}
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

      if (t) {
        switch (t.source) {
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
          case 'budget_actual': head = ['Compte', 'Libellé', 'Réalisé', 'Budget', 'Écart']; body = (data.budgetActual ?? []).slice(0, limit).map((r) => [r.code, r.label, fmt(r.realise), fmt(r.budget), fmt(r.ecart)]); title ||= 'Budget vs Réalisé'; break;
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
            case 'cp': return [['Total Charges', fmt(data.cr.filter((l) => l.code === 'RA' || l.code === 'RB' || l.code === 'RC' || l.code === 'RD').reduce((s, l) => s + Math.abs(l.value), 0))], ['Total Produits', fmt(data.sig.ca)], ['Résultat exploitation', fmt(data.sig.re)]];
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
      });
      cursorY = (doc as any).lastAutoTable.finalY + 12;
      continue;
    }

    if (block.type === 'image') {
      const img = block as BlockImage;
      ensureSpace(220);
      try { doc.addImage(img.dataUrl, 'PNG', margin, cursorY, W - 2 * margin, 200, undefined, 'FAST'); } catch {}
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
        doc.text('CockPit F&A · SYSCOHADA révisé 2017', W / 2, H - 20, { align: 'center' });
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
          case 'budget_actual': head = ['Compte','Réalisé','Budget','Écart']; body = (data.budgetActual ?? []).slice(0, limit).map((r) => [r.label, fmt(r.realise), fmt(r.budget), fmt(r.ecart)]); break;
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
