// Constructeur de rapport PDF multi-sections avec couverture, sommaire, pagination
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Line } from './statements';
import { BalanceRow } from './balance';
import { Ratio } from './ratios';

export type ReportSectionKey =
  | 'cover' | 'toc' | 'summary' | 'bilan' | 'cr' | 'sig' | 'balance'
  | 'ratios' | 'tft' | 'tafire' | 'capital' | 'alerts' | 'comments';

export type ReportParams = {
  title: string;
  subtitle?: string;
  org: string;
  orgSub?: string;   // RCCM, IFU
  period: string;
  author: string;
  confidentiality: 'public' | 'interne' | 'confidentiel' | 'strict';
  logoDataUrl?: string;
  sections: ReportSectionKey[];
  includeCover: boolean;
  includeTOC: boolean;
  comments: Record<string, string>;
};

export type ReportData = {
  balance: BalanceRow[];
  bilanActif: Line[];
  bilanPassif: Line[];
  cr: Line[];
  sig: any;
  ratios: Ratio[];
  tft?: Line[];
  tafireE?: Line[];
  tafireR?: Line[];
  capital?: Array<{ rubrique: string; ouverture: number; augmentation: number; diminution: number; affectationResN1: number; resultatExercice: number; cloture: number }>;
  alerts?: Array<{ title: string; severity: string; msg: string }>;
};

export const SECTION_TITLES: Record<ReportSectionKey, string> = {
  cover: 'Page de couverture',
  toc: 'Sommaire',
  summary: 'Synthèse exécutive',
  bilan: 'Bilan',
  cr: 'Compte de résultat',
  sig: 'Soldes intermédiaires de gestion',
  balance: 'Balance générale',
  ratios: 'Ratios et analyse financière',
  tft: 'Tableau des flux de trésorerie',
  tafire: 'TAFIRE',
  capital: 'Variation des capitaux propres',
  alerts: 'Alertes et points d\'attention',
  comments: 'Commentaires',
};

function fmt(n: number) { return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(n); }
const CONFIDENTIALITY_LABEL: Record<ReportParams['confidentiality'], string> = {
  public: 'Document public',
  interne: 'Usage interne',
  confidentiel: 'Confidentiel',
  strict: 'Strictement confidentiel',
};

export function buildReport(params: ReportParams, data: ReportData): jsPDF {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const margin = 50;

  // ─── HEADER / FOOTER HELPERS ────────────────────────────────────────
  const drawHeader = (sectionTitle: string) => {
    doc.setFontSize(8);
    doc.setTextColor(115, 115, 115);
    doc.text(params.org, margin, 30);
    doc.text(sectionTitle, W / 2, 30, { align: 'center' });
    doc.text(params.period, W - margin, 30, { align: 'right' });
    doc.setDrawColor(229, 229, 229);
    doc.line(margin, 38, W - margin, 38);
    doc.setTextColor(10, 10, 10);
  };
  const drawFooter = (pageNum: number, totalPages: number) => {
    doc.setFontSize(8);
    doc.setTextColor(115, 115, 115);
    doc.setDrawColor(229, 229, 229);
    doc.line(margin, H - 40, W - margin, H - 40);
    doc.text(CONFIDENTIALITY_LABEL[params.confidentiality], margin, H - 25);
    doc.text('CockPit F&A · SYSCOHADA révisé 2017', W / 2, H - 25, { align: 'center' });
    doc.text(`Page ${pageNum} / ${totalPages}`, W - margin, H - 25, { align: 'right' });
    doc.setTextColor(10, 10, 10);
  };

  const sectionPages: Array<{ key: ReportSectionKey; title: string; page: number }> = [];

  // ─── COVER ──────────────────────────────────────────────────────────
  if (params.includeCover) {
    sectionPages.push({ key: 'cover', title: SECTION_TITLES.cover, page: doc.getNumberOfPages() });
    doc.setDrawColor(10, 10, 10);
    doc.setLineWidth(1);
    doc.rect(margin, margin, W - 2 * margin, H - 2 * margin);
    doc.setFontSize(9);
    doc.setTextColor(115, 115, 115);
    doc.text(CONFIDENTIALITY_LABEL[params.confidentiality].toUpperCase(), W / 2, margin + 30, { align: 'center' });
    doc.setTextColor(10, 10, 10);

    if (params.logoDataUrl) {
      try { doc.addImage(params.logoDataUrl, 'PNG', W / 2 - 40, margin + 70, 80, 60, undefined, 'FAST'); } catch { /* ignore */ }
    }

    doc.setFontSize(28);
    doc.setFont('helvetica', 'bold');
    const lines = doc.splitTextToSize(params.title, W - 2 * margin - 40);
    doc.text(lines, W / 2, H / 2 - 20, { align: 'center' });
    if (params.subtitle) {
      doc.setFontSize(14);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(115, 115, 115);
      doc.text(params.subtitle, W / 2, H / 2 + 20, { align: 'center' });
    }
    doc.setTextColor(10, 10, 10);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(params.org, W / 2, H / 2 + 60, { align: 'center' });
    if (params.orgSub) {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(115, 115, 115);
      doc.text(params.orgSub, W / 2, H / 2 + 80, { align: 'center' });
      doc.setTextColor(10, 10, 10);
    }

    doc.setFontSize(11);
    doc.text(`Période : ${params.period}`, W / 2, H - 200, { align: 'center' });
    doc.text(`Émis par : ${params.author}`, W / 2, H - 180, { align: 'center' });
    doc.text(`Date d'émission : ${new Date().toLocaleDateString('fr-FR')}`, W / 2, H - 160, { align: 'center' });

    doc.setFontSize(8);
    doc.setTextColor(115, 115, 115);
    doc.text('SYSCOHADA révisé 2017 · CockPit F&A', W / 2, H - margin - 15, { align: 'center' });
  }

  // ─── PLACEHOLDER TOC (remplie après construction) ───────────────────
  let tocPageNum = 0;
  if (params.includeTOC) {
    doc.addPage();
    tocPageNum = doc.getNumberOfPages();
    sectionPages.push({ key: 'toc', title: SECTION_TITLES.toc, page: tocPageNum });
  }

  // ─── SYNTHÈSE EXÉCUTIVE ─────────────────────────────────────────────
  const addSection = (key: ReportSectionKey, render: () => void) => {
    doc.addPage();
    const p = doc.getNumberOfPages();
    sectionPages.push({ key, title: SECTION_TITLES[key], page: p });
    drawHeader(SECTION_TITLES[key]);
    render();
    if (params.comments[key]) {
      const y = (doc as any).lastAutoTable?.finalY ?? 100;
      const yCommentTop = Math.min(y + 25, H - 160);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(10, 10, 10);
      doc.text('Commentaire', margin, yCommentTop);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(64, 64, 64);
      const c = doc.splitTextToSize(params.comments[key], W - 2 * margin);
      doc.text(c, margin, yCommentTop + 14);
      doc.setTextColor(10, 10, 10);
    }
  };

  const writeTitle = (t: string) => {
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(t, margin, 70);
    doc.setFont('helvetica', 'normal');
  };

  const writeLines = (startY: number, lines: Line[]) => {
    autoTable(doc, {
      startY,
      head: [['Code', 'Poste', 'Montant']],
      body: lines.map((l) => [
        l.code.startsWith('_') ? '' : l.code,
        (l.indent ? '  '.repeat(l.indent) : '') + l.label,
        fmt(l.value),
      ]),
      headStyles: { fillColor: [23, 23, 23], textColor: 250, fontStyle: 'bold', fontSize: 9 },
      styles: { fontSize: 9, cellPadding: 4 },
      columnStyles: { 0: { cellWidth: 50 }, 1: { cellWidth: 340 }, 2: { cellWidth: 100, halign: 'right' } },
      didParseCell: (data) => {
        const l = lines[data.row.index];
        if (data.section === 'body' && l) {
          if (l.grand) { data.cell.styles.fillColor = [23, 23, 23]; data.cell.styles.textColor = 250; data.cell.styles.fontStyle = 'bold'; }
          else if (l.total) { data.cell.styles.fillColor = [229, 229, 229]; data.cell.styles.fontStyle = 'bold'; }
        }
      },
      margin: { left: margin, right: margin },
    });
  };

  // Synthèse exécutive
  if (params.sections.includes('summary')) {
    addSection('summary', () => {
      writeTitle('Synthèse exécutive');
      doc.setFontSize(10);
      doc.setTextColor(64, 64, 64);
      const sig = data.sig;
      const txt = `Sur la période ${params.period}, la société ${params.org} affiche un chiffre d'affaires de ${fmt(sig.ca)} XOF, pour un résultat net de ${fmt(sig.resultat)} XOF (${sig.ca ? ((sig.resultat/sig.ca)*100).toFixed(1) : 0} % de marge nette). La valeur ajoutée atteint ${fmt(sig.valeurAjoutee)} XOF et l'EBE s'établit à ${fmt(sig.ebe)} XOF.\n\n${data.ratios.filter((r) => r.status === 'alert').length} ratio(s) sont en alerte, ${data.ratios.filter((r) => r.status === 'warn').length} en zone de vigilance.`;
      doc.text(doc.splitTextToSize(txt, W - 2 * margin), margin, 100);
      doc.setTextColor(10, 10, 10);

      // Tableau de synthèse
      autoTable(doc, {
        startY: 220,
        head: [['Indicateur', 'Valeur', '% du CA']],
        body: [
          ['Chiffre d\'affaires', fmt(sig.ca), '100,0 %'],
          ['Marge brute', fmt(sig.margeBrute), sig.ca ? `${((sig.margeBrute/sig.ca)*100).toFixed(1)} %` : '—'],
          ['Valeur ajoutée', fmt(sig.valeurAjoutee), sig.ca ? `${((sig.valeurAjoutee/sig.ca)*100).toFixed(1)} %` : '—'],
          ['EBE', fmt(sig.ebe), sig.ca ? `${((sig.ebe/sig.ca)*100).toFixed(1)} %` : '—'],
          ['Résultat d\'exploitation', fmt(sig.re), sig.ca ? `${((sig.re/sig.ca)*100).toFixed(1)} %` : '—'],
          ['Résultat net', fmt(sig.resultat), sig.ca ? `${((sig.resultat/sig.ca)*100).toFixed(1)} %` : '—'],
        ],
        headStyles: { fillColor: [23, 23, 23], textColor: 250, fontSize: 10 },
        styles: { fontSize: 10, cellPadding: 6 },
        columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right', cellWidth: 80 } },
        margin: { left: margin, right: margin },
      });
    });
  }

  // Bilan
  if (params.sections.includes('bilan')) {
    addSection('bilan', () => {
      writeTitle('Bilan — Actif');
      writeLines(85, data.bilanActif);
    });
    addSection('bilan', () => {
      writeTitle('Bilan — Passif');
      writeLines(85, data.bilanPassif);
    });
  }

  // Compte de résultat
  if (params.sections.includes('cr')) {
    addSection('cr', () => {
      writeTitle('Compte de résultat');
      writeLines(85, data.cr);
    });
  }

  // Balance générale
  if (params.sections.includes('balance')) {
    addSection('balance', () => {
      writeTitle('Balance générale');
      autoTable(doc, {
        startY: 85,
        head: [['Compte', 'Libellé', 'Débit', 'Crédit', 'Solde D', 'Solde C']],
        body: data.balance.map((r) => [r.account, r.label, fmt(r.debit), fmt(r.credit), r.soldeD ? fmt(r.soldeD) : '', r.soldeC ? fmt(r.soldeC) : '']),
        headStyles: { fillColor: [23, 23, 23], textColor: 250, fontSize: 9 },
        styles: { fontSize: 8, cellPadding: 3 },
        columnStyles: { 0: { cellWidth: 60 }, 1: { cellWidth: 180 }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
        margin: { left: margin, right: margin },
      });
    });
  }

  // Ratios
  if (params.sections.includes('ratios')) {
    addSection('ratios', () => {
      writeTitle('Ratios financiers');
      autoTable(doc, {
        startY: 85,
        head: [['Famille', 'Ratio', 'Valeur', 'Cible', 'Statut']],
        body: data.ratios.map((r) => [
          r.family, r.label,
          r.unit === '%' ? `${r.value.toFixed(1)} %` : r.unit === 'j' ? `${Math.round(r.value)} j` : r.unit === 'x' ? `${r.value.toFixed(2)} ×` : fmt(r.value),
          r.unit === '%' ? `${r.target} %` : `${r.target}`,
          r.status === 'good' ? 'OK' : r.status === 'warn' ? 'Vigilance' : 'Alerte',
        ]),
        headStyles: { fillColor: [23, 23, 23], textColor: 250, fontSize: 10 },
        styles: { fontSize: 9, cellPadding: 4 },
        didParseCell: (data) => {
          if (data.section === 'body' && data.column.index === 4) {
            data.cell.styles.fontStyle = 'bold';
          }
        },
        margin: { left: margin, right: margin },
      });
    });
  }

  // Alertes
  if (params.sections.includes('alerts') && data.alerts?.length) {
    addSection('alerts', () => {
      writeTitle('Alertes et points d\'attention');
      autoTable(doc, {
        startY: 85,
        head: [['Sévérité', 'Titre', 'Détail']],
        body: data.alerts!.map((a) => [a.severity, a.title, a.msg]),
        headStyles: { fillColor: [23, 23, 23], textColor: 250, fontSize: 10 },
        styles: { fontSize: 9, cellPadding: 4 },
        margin: { left: margin, right: margin },
      });
    });
  }

  // ─── FILL TOC + FOOTERS ─────────────────────────────────────────────
  const totalPages = doc.getNumberOfPages();

  // Fill TOC
  if (params.includeTOC && tocPageNum > 0) {
    doc.setPage(tocPageNum);
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('Sommaire', margin, 80);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    let y = 120;
    for (const s of sectionPages) {
      if (s.key === 'cover' || s.key === 'toc') continue;
      doc.text(s.title, margin, y);
      // dots
      const titleWidth = doc.getTextWidth(s.title);
      const pageStr = String(s.page);
      const pageWidth = doc.getTextWidth(pageStr);
      const dotsStart = margin + titleWidth + 6;
      const dotsEnd = W - margin - pageWidth - 6;
      doc.setTextColor(180, 180, 180);
      let x = dotsStart;
      while (x < dotsEnd) {
        doc.text('.', x, y);
        x += 4;
      }
      doc.setTextColor(10, 10, 10);
      doc.text(pageStr, W - margin, y, { align: 'right' });
      y += 22;
      if (y > H - 80) break;
    }
  }

  // Footers on all pages
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    if (i > 1 || !params.includeCover) {
      // already drew headers on section pages; redraw footer
    }
    drawFooter(i, totalPages);
  }

  return doc;
}
