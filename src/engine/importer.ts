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

    // Chercher la feuille contenant des en-têtes reconnus (COMPTE, DATE, DEBIT…)
    const dataKeywords = /^(compte|date|journal|debit|crédit|credit|libelle|description)$/i;
    let ws = wb.Sheets[wb.SheetNames[0]];
    for (const name of wb.SheetNames) {
      const candidate = wb.Sheets[name];
      const firstRow = XLSX.utils.sheet_to_json<ParsedRow>(candidate, { defval: '', raw: false, header: 1 })[0] as unknown as string[];
      if (firstRow && Array.isArray(firstRow) && firstRow.some((h) => dataKeywords.test(String(h).trim()))) {
        ws = candidate;
        break;
      }
    }

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
  const str = String(s).replace(/\s/g, '').replace(/\u00A0/g, '').replace(/[^\d,.-]/g, '');
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

// Mois français (abrégés et complets) → numéro
const FRENCH_MONTHS: Record<string, string> = {
  'janvier': '01', 'février': '02', 'mars': '03', 'avril': '04',
  'mai': '05', 'juin': '06', 'juillet': '07', 'août': '08',
  'septembre': '09', 'octobre': '10', 'novembre': '11', 'décembre': '12',
  'janv': '01', 'févr': '02', 'avr': '04', 'juil': '07',
  'sept': '09', 'oct': '10', 'nov': '11', 'déc': '12',
  'jan': '01', 'fev': '02', 'fév': '02', 'mar': '03', 'avr.': '04',
  'jui': '06', 'jul': '07', 'aou': '08', 'aoû': '08',
  'sep': '09', 'dec': '12',
};
// Mois anglais
const ENGLISH_MONTHS: Record<string, string> = {
  'january': '01', 'february': '02', 'march': '03', 'april': '04',
  'may': '05', 'june': '06', 'july': '07', 'august': '08',
  'september': '09', 'october': '10', 'november': '11', 'december': '12',
  'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04',
  'jun': '06', 'jul': '07', 'aug': '08', 'sep': '09',
  'oct': '10', 'nov': '11', 'dec': '12',
};
const ALL_MONTHS: Record<string, string> = { ...FRENCH_MONTHS, ...ENGLISH_MONTHS };

function fixYear(y: string): string {
  if (y.length === 2) return parseInt(y) > 50 ? '19' + y : '20' + y;
  return y;
}

function validDate(y: string, m: string, d: string): string | null {
  const yn = parseInt(y), mn = parseInt(m), dn = parseInt(d);
  if (yn < 1900 || yn > 2100 || mn < 1 || mn > 12 || dn < 1 || dn > 31) return null;
  return `${y}-${m}-${d}`;
}

function parseDate(s: any): string | null {
  if (!s) return null;
  if (s instanceof Date && !isNaN(s.getTime())) return s.toISOString().substring(0, 10);

  // Nombre brut → serial Excel (ex: 45307)
  if (typeof s === 'number') {
    if (s > 59) s -= 1; // bug Excel: faux 29 fév 1900
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const d = new Date(epoch.getTime() + s * 86400000);
    if (!isNaN(d.getTime())) return d.toISOString().substring(0, 10);
    return null;
  }

  const str = String(s).trim();
  if (!str) return null;

  // ISO : YYYY-MM-DD (avec ou sans heure)
  const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return validDate(iso[1], iso[2], iso[3]);

  // YYYY/MM/DD
  const ymd = str.match(/^(\d{4})[/.](\d{1,2})[/.](\d{1,2})/);
  if (ymd) return validDate(ymd[1], ymd[2].padStart(2, '0'), ymd[3].padStart(2, '0'));

  // YYYYMMDD (compact)
  const compact = str.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) return validDate(compact[1], compact[2], compact[3]);

  // DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY (avec ou sans heure)
  const dmy = str.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
  if (dmy) {
    const d = dmy[1].padStart(2, '0');
    const mo = dmy[2].padStart(2, '0');
    const y = fixYear(dmy[3]);
    return validDate(y, mo, d);
  }

  // Mois textuels : "15 janvier 2024", "15-janv-2024", "15 jan. 2024"
  const textDmy = str.match(/^(\d{1,2})[\s/\-.,]+([a-zéèûùàô.]+)[\s/\-.,]+(\d{2,4})/i);
  if (textDmy) {
    const mKey = textDmy[2].toLowerCase().replace(/\.$/, '');
    const mo = ALL_MONTHS[mKey];
    if (mo) return validDate(fixYear(textDmy[3]), mo, textDmy[1].padStart(2, '0'));
  }

  // "January 15, 2024", "Jan 15 2024"
  const textMdy = str.match(/^([a-zéèûùàô.]+)[\s/\-.,]+(\d{1,2})[\s,]+(\d{2,4})/i);
  if (textMdy) {
    const mKey = textMdy[1].toLowerCase().replace(/\.$/, '');
    const mo = ALL_MONTHS[mKey];
    if (mo) return validDate(fixYear(textMdy[3]), mo, textMdy[2].padStart(2, '0'));
  }

  // "2024 janvier 15", "2024-Jan-15"
  const textYmd = str.match(/^(\d{4})[\s/\-.,]+([a-zéèûùàô.]+)[\s/\-.,]+(\d{1,2})/i);
  if (textYmd) {
    const mKey = textYmd[2].toLowerCase().replace(/\.$/, '');
    const mo = ALL_MONTHS[mKey];
    if (mo) return validDate(textYmd[1], mo, textYmd[3].padStart(2, '0'));
  }

  // Serial Excel sous forme de string (ex: "45307")
  const num = parseFloat(str);
  if (!isNaN(num) && num > 365 && num < 200000 && /^\d+(\.\d+)?$/.test(str)) {
    let serial = num;
    if (serial > 59) serial -= 1;
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const d = new Date(epoch.getTime() + serial * 86400000);
    if (!isNaN(d.getTime())) return d.toISOString().substring(0, 10);
  }

  return null;
}

// ── Contrôles et import ────────────────────────────────────────────────────
export type UnbalancedPiece = {
  journal: string;
  piece: string;
  debit: number;
  credit: number;
  gap: number;
  accounts: string[];
};

export type ImportReport = {
  totalRows: number;
  imported: number;
  rejected: number;
  totalDebit: number;
  totalCredit: number;
  balanced: boolean;
  unknownAccounts: string[];
  errors: { row: number; reason: string }[];
  unbalancedPieces: UnbalancedPiece[];
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

  // Détection des pièces déséquilibrées avec comptes concernés
  const pieceMap = new Map<string, { debit: number; credit: number; accounts: Set<string> }>();
  for (const e of entries) {
    const key = `${e.journal}||${e.piece}`;
    let p = pieceMap.get(key);
    if (!p) { p = { debit: 0, credit: 0, accounts: new Set() }; pieceMap.set(key, p); }
    p.debit += e.debit;
    p.credit += e.credit;
    p.accounts.add(e.account);
  }
  const unbalancedPieces: UnbalancedPiece[] = [];
  for (const [key, p] of pieceMap) {
    const gap = Math.round((p.debit - p.credit) * 100) / 100;
    if (Math.abs(gap) >= 0.01) {
      const [journal, piece] = key.split('||');
      unbalancedPieces.push({
        journal, piece,
        debit: Math.round(p.debit * 100) / 100,
        credit: Math.round(p.credit * 100) / 100,
        gap,
        accounts: [...p.accounts],
      });
    }
  }
  unbalancedPieces.sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));

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
    unbalancedPieces,
  };
}
