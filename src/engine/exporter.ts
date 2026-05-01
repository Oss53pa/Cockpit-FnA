// Exports — Excel (ExcelJS) et PDF (jsPDF)
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Line } from './statements';
import { BalanceRow } from './balance';
import { Ratio } from './ratios';
import { fmtFull } from '../lib/format';

// (P1-8) Le fmt() local est remplacé par fmtFull() de lib/format.ts pour
// garantir la cohérence des séparateurs (espaces insécables remplacés) entre
// l'écran et les exports PDF/Excel.
const fmt = fmtFull;

// ─── EXCEL ──────────────────────────────────────────────────────────────────
export async function exportStatementsXLSX(params: {
  org: string;
  period: string;
  balance: BalanceRow[];
  bilanActif: Line[];
  bilanPassif: Line[];
  cr: Line[];
  ratios: Ratio[];
}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'CockPit F&A';
  wb.created = new Date();

  const header = (ws: ExcelJS.Worksheet, title: string) => {
    ws.addRow([title]);
    ws.addRow([`Société : ${params.org}`, `Période : ${params.period}`]);
    ws.addRow([]);
    ws.getRow(1).font = { bold: true, size: 14 };
    ws.getRow(2).font = { italic: true, color: { argb: 'FF737373' } };
  };

  const writeLines = (ws: ExcelJS.Worksheet, lines: Line[]) => {
    ws.addRow(['Code', 'Poste', 'Montant']);
    const headerRow = ws.lastRow!;
    headerRow.font = { bold: true };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E5E5' } };
    lines.forEach((l) => {
      const row = ws.addRow([l.code.startsWith('_') ? '' : l.code, l.label, l.value]);
      if (l.grand) row.font = { bold: true, color: { argb: 'FFFAFAFA' } };
      else if (l.total) row.font = { bold: true };
      if (l.grand) row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF171717' } };
      else if (l.total) row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
      row.getCell(3).numFmt = '#,##0';
      row.getCell(3).alignment = { horizontal: 'right' };
    });
    ws.columns.forEach((c, i) => {
      c.width = i === 0 ? 8 : i === 1 ? 50 : 20;
    });
  };

  // Bilan
  const wsB = wb.addWorksheet('Bilan');
  header(wsB, 'BILAN — SYSCOHADA révisé 2017');
  wsB.addRow(['ACTIF']).font = { bold: true, size: 12 };
  writeLines(wsB, params.bilanActif);
  wsB.addRow([]);
  wsB.addRow(['PASSIF']).font = { bold: true, size: 12 };
  writeLines(wsB, params.bilanPassif);

  // Compte de résultat
  const wsCR = wb.addWorksheet('Compte de résultat');
  header(wsCR, 'COMPTE DE RÉSULTAT');
  writeLines(wsCR, params.cr);

  // Balance
  const wsBal = wb.addWorksheet('Balance');
  header(wsBal, 'BALANCE GÉNÉRALE');
  wsBal.addRow(['Compte', 'Libellé', 'Débit', 'Crédit', 'Solde D', 'Solde C']).font = { bold: true };
  params.balance.forEach((r) => {
    const row = wsBal.addRow([r.account, r.label, r.debit, r.credit, r.soldeD, r.soldeC]);
    [3, 4, 5, 6].forEach((i) => {
      row.getCell(i).numFmt = '#,##0';
      row.getCell(i).alignment = { horizontal: 'right' };
    });
  });
  wsBal.columns = [{ width: 12 }, { width: 50 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }];

  // Ratios
  const wsR = wb.addWorksheet('Ratios');
  header(wsR, 'RATIOS FINANCIERS');
  wsR.addRow(['Famille', 'Code', 'Libellé', 'Valeur', 'Unité', 'Cible', 'Statut', 'Formule']).font = { bold: true };
  params.ratios.forEach((r) => {
    const row = wsR.addRow([r.family, r.code, r.label, r.value, r.unit, r.target, r.status, r.formula]);
    row.getCell(4).numFmt = r.unit === '%' ? '#,##0.0"%"' : r.unit === 'j' ? '#,##0" j"' : '#,##0.00';
  });
  wsR.columns = [{ width: 14 }, { width: 10 }, { width: 32 }, { width: 14 }, { width: 8 }, { width: 10 }, { width: 10 }, { width: 60 }];

  const buf = await wb.xlsx.writeBuffer();
  saveAs(new Blob([buf]), `CockPit_${params.org}_${params.period}.xlsx`);
}

// ─── PDF ────────────────────────────────────────────────────────────────────
export function exportStatementsPDF(params: {
  org: string;
  period: string;
  bilanActif: Line[];
  bilanPassif: Line[];
  cr: Line[];
  ratios: Ratio[];
}) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const margin = 40;

  const cover = () => {
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text('Rapport financier', margin, 120);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'normal');
    doc.text(params.org, margin, 150);
    doc.setFontSize(11);
    doc.setTextColor(115, 115, 115);
    doc.text(`Période : ${params.period}`, margin, 170);
    doc.text(`Édité le ${new Date().toLocaleDateString('fr-FR')}`, margin, 185);
    doc.setTextColor(10, 10, 10);
    doc.setDrawColor(10, 10, 10);
    doc.line(margin, 200, 555, 200);
    doc.setFontSize(9);
    doc.setTextColor(115, 115, 115);
    doc.text('SYSCOHADA révisé 2017 — CockPit F&A', margin, 800);
  };
  cover();

  const addLineTable = (title: string, lines: Line[]) => {
    doc.addPage();
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(title, margin, margin + 10);
    autoTable(doc, {
      startY: margin + 25,
      head: [['Code', 'Poste', 'Montant']],
      body: lines.map((l) => [
        l.code.startsWith('_') ? '' : l.code,
        (l.indent ? '  '.repeat(l.indent) : '') + l.label,
        fmt(l.value),
      ]),
      headStyles: { fillColor: [23, 23, 23], textColor: 250, fontStyle: 'bold' },
      styles: { fontSize: 9, cellPadding: 4 },
      columnStyles: { 0: { cellWidth: 50 }, 1: { cellWidth: 340 }, 2: { cellWidth: 100, halign: 'right' } },
      didParseCell: (data) => {
        const l = lines[data.row.index];
        if (data.section === 'body' && l) {
          if (l.grand) {
            data.cell.styles.fillColor = [23, 23, 23];
            data.cell.styles.textColor = 250;
            data.cell.styles.fontStyle = 'bold';
          } else if (l.total) {
            data.cell.styles.fillColor = [245, 245, 245];
            data.cell.styles.fontStyle = 'bold';
          }
        }
      },
    });
  };

  addLineTable('BILAN — ACTIF', params.bilanActif);
  addLineTable('BILAN — PASSIF', params.bilanPassif);
  addLineTable('COMPTE DE RÉSULTAT', params.cr);

  doc.addPage();
  doc.setFontSize(14); doc.setFont('helvetica', 'bold');
  doc.text('RATIOS FINANCIERS', margin, margin + 10);
  autoTable(doc, {
    startY: margin + 25,
    head: [['Famille', 'Ratio', 'Valeur', 'Cible', 'Statut']],
    body: params.ratios.map((r) => [
      r.family,
      r.label,
      r.unit === '%' ? `${r.value.toFixed(1)} %` :
      r.unit === 'j' ? `${r.value.toFixed(0)} j` :
      r.unit === 'x' ? `${r.value.toFixed(2)} ×` :
      fmt(r.value),
      r.unit === '%' ? `${r.target.toFixed(0)} %` : `${r.target}`,
      r.status === 'good' ? 'OK' : r.status === 'warn' ? 'Attention' : 'Alerte',
    ]),
    headStyles: { fillColor: [23, 23, 23], textColor: 250 },
    styles: { fontSize: 9, cellPadding: 4 },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 4) {
        const r = params.ratios[data.row.index];
        if (r.status === 'good') data.cell.styles.textColor = [34, 197, 94];
        else if (r.status === 'warn') data.cell.styles.textColor = [245, 158, 11];
        else data.cell.styles.textColor = [239, 68, 68];
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });

  // Footer pagination
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(115, 115, 115);
    doc.text(`${params.org} · ${params.period}`, margin, 820);
    doc.text(`Page ${i} / ${pageCount}`, 520, 820);
  }

  doc.save(`CockPit_${params.org}_${params.period}.pdf`);
}
