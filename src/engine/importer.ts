// Parser et importeur du Grand Livre (CSV / XLSX)
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { db, GLEntry, Account } from '../db/schema';
import { findSyscoAccount, classOf } from '../syscohada/coa';

export type ParsedRow = Record<string, string>;

export type ColumnMapping = {
  date: string;
  journal: string;
  piece: string;
  account: string;
  label: string;
  debit: string;
  credit: string;
  tiers?: string;
  analyticalSection?: string;
};

// ── Patterns de détection des colonnes ──────────────────────────────────────
// Accepte le format CockPit (COMPTE, LIBELLE, DATE, JOURNAL, NUMERO DE SAISIE,
// DESCRIPTION, LETTRAGE, DEBIT, CREDIT) + formats hérités (Date, Pièce, Libellé)
const patterns: Record<keyof ColumnMapping, RegExp[]> = {
  date: [/^date/i, /^jour/i, /^dt$/i],
  journal: [/^journal$/i, /^jnl/i, /^jrn/i, /^j_/i, /^code.?journ/i, /journal/i],
  piece: [/^num[ée]ro\s*de\s*saisi/i, /^n[°u].?\s*saisi/i, /pi[èe]ce/i, /^n[°u].*pi/i, /^num.*doc/i, /^ref/i, /voucher/i],
  account: [/^compte$/i, /^cpte/i, /^n[°u].*compte/i, /^acc/i],
  label: [/^description$/i, /^libell[éeè]\s*[ée]criture/i, /^narration/i, /^intitule/i, /^description/i, /^libelle$/i, /^label/i],
  debit: [/^d[ée]bit$/i, /^debit$/i, /^db$/i, /^dr$/i],
  credit: [/^cr[ée]dit$/i, /^credit$/i, /^cr$/i, /^ct$/i],
  tiers: [/^code\s*tiers/i, /^tiers$/i, /^aux/i, /^client$/i, /^fourn/i, /^partner/i, /tiers/i],
  analyticalSection: [/analyt/i, /^section$/i, /^axe/i, /^cost.?c/i],
};

export function detectColumns(headers: string[]): Partial<ColumnMapping> {
  const mapping: Partial<ColumnMapping> = {};
  for (const key of Object.keys(patterns) as (keyof ColumnMapping)[]) {
    const ps = patterns[key];
    const found = headers.find((h) => ps.some((p) => p.test(h)));
    if (found) mapping[key] = found;
  }
  return mapping;
}

// ── Parsing ─────────────────────────────────────────────────────────────────
export async function parseFile(file: File): Promise<{ headers: string[]; rows: ParsedRow[] }> {
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext === 'csv' || ext === 'txt') {
    return new Promise((resolve, reject) => {
      Papa.parse<ParsedRow>(file, {
        header: true, skipEmptyLines: true, dynamicTyping: false,
        delimitersToGuess: [';', ',', '\t', '|'],
        complete: (res) => resolve({ headers: res.meta.fields ?? [], rows: res.data }),
        error: reject,
      });
    });
  }
  if (ext === 'xlsx' || ext === 'xls') {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<ParsedRow>(ws, { defval: '', raw: false });
    const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
    return { headers, rows };
  }
  throw new Error('Format non supporté (utilisez CSV, TXT, XLSX)');
}

// ── Normalisation d'un montant ──────────────────────────────────────────────
function parseAmount(s: any): number {
  if (s === undefined || s === null || s === '') return 0;
  if (typeof s === 'number') return s;
  const str = String(s).replace(/\s/g, '').replace(/\u00A0/g, '').replace(/[^\d,.\-]/g, '');
  // Détection virgule/point
  const hasC = str.includes(',');
  const hasP = str.includes('.');
  let clean = str;
  if (hasC && hasP) {
    // dernier séparateur = décimal
    if (str.lastIndexOf(',') > str.lastIndexOf('.')) clean = str.replace(/\./g, '').replace(',', '.');
    else clean = str.replace(/,/g, '');
  } else if (hasC) clean = str.replace(',', '.');
  const n = parseFloat(clean);
  return isNaN(n) ? 0 : n;
}

function parseDate(s: any): string | null {
  if (!s) return null;
  if (s instanceof Date) return s.toISOString().substring(0, 10);
  const str = String(s).trim();
  // ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.substring(0, 10);
  // DD/MM/YYYY ou DD-MM-YYYY
  const m = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
  if (m) {
    const d = m[1].padStart(2, '0');
    const mo = m[2].padStart(2, '0');
    let y = m[3];
    if (y.length === 2) y = parseInt(y) > 50 ? '19' + y : '20' + y;
    return `${y}-${mo}-${d}`;
  }
  return null;
}

// ── Contrôles et import ────────────────────────────────────────────────────
export type ImportReport = {
  totalRows: number;
  imported: number;
  rejected: number;
  totalDebit: number;
  totalCredit: number;
  balanced: boolean;
  unknownAccounts: string[];
  errors: { row: number; reason: string }[];
};

export async function importGL(
  file: File,
  mapping: ColumnMapping,
  opts: { orgId: string; periodId: string; user: string; source: string },
): Promise<ImportReport> {
  const { rows } = await parseFile(file);
  const entries: Omit<GLEntry, 'id'>[] = [];
  const errors: ImportReport['errors'] = [];
  const unknownAccounts = new Set<string>();
  let totalDebit = 0;
  let totalCredit = 0;

  rows.forEach((r, idx) => {
    const account = String(r[mapping.account] ?? '').trim();
    if (!account) {
      errors.push({ row: idx + 2, reason: 'Compte manquant' });
      return;
    }
    const date = parseDate(r[mapping.date]);
    if (!date) {
      errors.push({ row: idx + 2, reason: 'Date invalide' });
      return;
    }
    const debit = parseAmount(r[mapping.debit]);
    const credit = parseAmount(r[mapping.credit]);
    if (debit === 0 && credit === 0) {
      errors.push({ row: idx + 2, reason: 'Débit et crédit à 0' });
      return;
    }
    const sysco = findSyscoAccount(account);
    if (!sysco) unknownAccounts.add(account);

    entries.push({
      orgId: opts.orgId,
      periodId: opts.periodId,
      date,
      journal: String(r[mapping.journal] ?? 'OD').trim(),
      piece: String(r[mapping.piece] ?? '').trim(),
      account,
      label: String(r[mapping.label] ?? '').trim(),
      debit, credit,
      tiers: mapping.tiers ? String(r[mapping.tiers] ?? '').trim() || undefined : undefined,
      analyticalSection: mapping.analyticalSection ? String(r[mapping.analyticalSection] ?? '').trim() || undefined : undefined,
    });
    totalDebit += debit;
    totalCredit += credit;
  });

  const balanced = Math.abs(totalDebit - totalCredit) < 0.01;

  // Enregistrement
  await db.transaction('rw', db.gl, db.accounts, db.imports, async () => {
    const importId = await db.imports.add({
      orgId: opts.orgId,
      date: Date.now(),
      user: opts.user,
      fileName: file.name,
      source: opts.source,
      kind: 'GL',
      count: entries.length,
      rejected: errors.length,
      status: errors.length === 0 ? 'success' : (entries.length > 0 ? 'partial' : 'error'),
      report: JSON.stringify({ unknown: [...unknownAccounts], errors: errors.slice(0, 100) }),
    });

    if (entries.length > 0) {
      const tagged = entries.map((e) => ({ ...e, importId: String(importId) })) as GLEntry[];
      await db.gl.bulkAdd(tagged);
    }

    // Créer les comptes inconnus avec mapping SYSCOHADA automatique
    const existing = new Set((await db.accounts.where('orgId').equals(opts.orgId).toArray()).map((a) => a.code));
    const newAccounts: Account[] = [];
    for (const code of new Set(entries.map((e) => e.account))) {
      if (existing.has(code)) continue;
      const sysco = findSyscoAccount(code);
      newAccounts.push({
        orgId: opts.orgId,
        code,
        label: sysco?.label ?? 'Compte importé',
        syscoCode: sysco?.code,
        class: classOf(code) ?? 'X',
        type: sysco?.type ?? 'X',
      });
    }
    if (newAccounts.length > 0) await db.accounts.bulkPut(newAccounts);
  });

  return {
    totalRows: rows.length,
    imported: entries.length,
    rejected: errors.length,
    totalDebit, totalCredit, balanced,
    unknownAccounts: [...unknownAccounts],
    errors,
  };
}
