// Parser et importeur du Grand Livre (CSV / XLSX)
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { db, GLEntry, Account } from '../db/schema';
import { findSyscoAccount, classOf, SYSCOHADA_COA } from '../syscohada/coa';

// ─── IMPORT BULLETPROOF AVEC EXCELJS ────────────────────────────────────
// Lit n'importe quel fichier Excel généré par ExcelJS sans dépendre de la
// détection de feuille. Stratégie : scanne TOUTES les feuilles, trouve la
// première ligne qui ressemble à un header (≥ 2 mots-clés connus), extrait
// les données en dessous, retourne tout en objets.
type AnyRow = Record<string, any>;

async function readExcelBulletproof(file: File): Promise<{ headers: string[]; rows: AnyRow[]; sheetName: string; debug: { allSheets: string[]; candidates: Array<{ sheet: string; score: number; headerRow: number; rows: number; preferred: boolean }>; selectedSheet?: string } }> {
  const wb = new ExcelJS.Workbook();
  const buf = await file.arrayBuffer();
  await wb.xlsx.load(buf);

  const dataKeywords = /(compte|cpte|code|num[ée]ro|date|journal|jrn|d[ée]bit|cr[ée]dit|libell[éeè]|label|intitul|description|classe|type|sysco|tiers|piece|janv|f[ée]vr|mars|avr|mai|juin|juil|ao[ûu]t|sept|octo|nov|d[ée]ce|montant|amount|solde|annuel)/i;
  const blacklist = /^(instructions?|consignes?|aide|help|r[ée]f[ée]rentiel|reference|sysco(hada)?|notes?|intro|readme|à\s*propos|about|exemples?|samples?)$/i;
  const preferred = /(plan\s*comptable|comptes|grand\s*livre|gl|grandlivre|budget|balance|écritures?|donn[ée]es)/i;
  const allSheets = wb.worksheets.map((w) => w.name);

  type Cand = { sheetName: string; headerRow: number; score: number; rowsCount: number; preferredScore: number; order: number; matrix: any[][] };
  const cands: Cand[] = [];

  let order = 0;
  wb.eachSheet((ws, _id) => {
    order++;
    const name = ws.name.trim();
    if (blacklist.test(name)) return;

    // Convertir la feuille en matrice de cellules
    const matrix: any[][] = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const arr: any[] = [];
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        // Extraction VALEUR de cellule : ExcelJS expose plusieurs formats
        // - string/number direct
        // - { formula, result } : formule avec resultat
        // - { richText: [...] } : texte enrichi
        // - { hyperlink, text } : lien hypertexte
        // - { sharedFormula, result } : formule partagee
        // - { error: '#REF!' } : erreur Excel
        // - Date instance
        let v: any = cell.value;
        if (v && typeof v === 'object' && !(v instanceof Date)) {
          if ('error' in v) v = '';                                                     // erreur Excel -> vide
          else if ('result' in v && v.result !== undefined && v.result !== null) v = (v as any).result;
          else if ('richText' in v && Array.isArray((v as any).richText)) v = (v as any).richText.map((r: any) => r.text || '').join('');
          else if ('text' in v) v = (v as any).text;
          else if ('hyperlink' in v) v = (v as any).text || (v as any).hyperlink || '';
          else if ('formula' in v) v = (v as any).result ?? '';
          // Si rien ne match, fallback sur cell.text (string render Excel)
          else v = cell.text || '';
        }
        arr[colNumber - 1] = v;
      });
      matrix.push(arr);
    });

    if (matrix.length === 0) return;

    // Détecter la ligne d'en-tête (scan large : 30 lignes).
    // SCORE PONDÉRÉ : on compte les en-tetes UNIQUES (pas juste le nombre de
    // cellules avec un mot-cle). Une ligne "Type | Type | Type" = score 1, pas 3.
    // On preferera donc la ligne qui contient PLUSIEURS keywords differents.
    let bestRow = 0; let bestScore = 0;
    for (let r = 0; r < Math.min(matrix.length, 30); r++) {
      const row = matrix[r] || [];
      // Compter les en-tetes UNIQUES qui matchent dataKeywords
      const matched = new Set<string>();
      for (const cell of row) {
        if (cell === undefined || cell === null) continue;
        const s = String(cell).trim().toLowerCase();
        if (!s) continue;
        if (dataKeywords.test(s)) matched.add(s);
      }
      const score = matched.size;
      // En cas d'egalite, on prefere la ligne avec PLUS de cellules non-vides
      // (= la ligne qui ressemble vraiment a un header complet).
      const fullness = row.filter((h) => h !== undefined && h !== null && String(h).trim()).length;
      const composite = score * 100 + fullness;
      if (composite > bestScore) { bestScore = composite; bestRow = r; }
    }
    // bestScore est composite (score*100 + fullness). On extrait le score reel :
    const realScore = Math.floor(bestScore / 100);
    if (realScore < 1) return;

    cands.push({
      sheetName: name,
      headerRow: bestRow,
      score: bestScore,
      rowsCount: matrix.length - bestRow - 1,
      preferredScore: preferred.test(name) ? 100 : 0,
      order,
      matrix,
    });
  });

  const debugCands = cands.map((c) => ({
    sheet: c.sheetName, score: c.score, headerRow: c.headerRow, rows: c.rowsCount, preferred: c.preferredScore > 0,
  }));
  console.log('🔵 [readExcelBulletproof v3] Toutes les feuilles :', allSheets);
  console.log('🔵 [readExcelBulletproof v3] Feuilles candidates :', debugCands);

  if (cands.length === 0) {
    console.error('🔵 Aucune feuille reconnue. Toutes les feuilles :', allSheets);
    return { headers: [], rows: [], sheetName: '', debug: { allSheets, candidates: [] } };
  }

  cands.sort((a, b) =>
    (b.preferredScore - a.preferredScore) ||
    (b.score - a.score) ||
    (b.rowsCount - a.rowsCount) ||
    (a.order - b.order)
  );
  const best = cands[0];
  console.log('🔵 Feuille SÉLECTIONNÉE :', best.sheetName, '(headerRow:', best.headerRow, ')');

  // Construire les objets
  const headerArr: string[] = (best.matrix[best.headerRow] || []).map((h: any, i: number) => {
    const s = h !== undefined && h !== null ? String(h).trim() : '';
    return s || `Colonne ${i + 1}`;
  });
  const rows: AnyRow[] = [];
  for (let r = best.headerRow + 1; r < best.matrix.length; r++) {
    const arr = best.matrix[r] || [];
    const allEmpty = arr.every((v: any) => v === undefined || v === null || v === '');
    if (allEmpty) continue;
    const obj: AnyRow = {};
    for (let c = 0; c < headerArr.length; c++) {
      obj[headerArr[c]] = arr[c] !== undefined ? arr[c] : '';
    }
    rows.push(obj);
  }

  console.log('🔵 Headers extraits :', headerArr);
  console.log('🔵 Lignes data :', rows.length, '— premières :', rows.slice(0, 3));
  return { headers: headerArr, rows, sheetName: best.sheetName, debug: { allSheets, candidates: debugCands, selectedSheet: best.sheetName } };
}

// Wrappers simples pour PC et Budget
export async function importCOAv2(file: File, orgId: string): Promise<{ imported: number; updated: number; errors: string[]; sheetName: string }> {
  console.log('🟢 [importCOAv2] Start, file:', file.name);
  const { headers, rows, sheetName, debug } = await readExcelBulletproof(file);
  if (rows.length === 0) {
    // Diagnostic explicite : toutes feuilles + candidates + raisons
    const lines: string[] = [];
    if (debug.candidates.length === 0) {
      lines.push(`Aucune feuille reconnue dans le classeur.`);
      lines.push(`Feuilles présentes : ${debug.allSheets.join(' · ') || '(aucune)'}.`);
      lines.push(`Causes possibles : feuille blacklistée (Notes/Aide/...), en-têtes < 2 mots-clés reconnus, ou cellules fusionnées.`);
    } else {
      const top = debug.candidates[0];
      lines.push(`Feuille sélectionnée : "${top.sheet}" (ligne d'en-tête ${top.headerRow + 1}, ${top.rows} lignes data).`);
      lines.push(`Mais aucune ligne valide trouvée — les en-têtes ne contiennent peut-être pas Code/Libellé.`);
    }
    return { imported: 0, updated: 0, errors: lines, sheetName };
  }
  // === DETECTION DES COLONNES — DOUBLE STRATEGIE ===
  // 1) Par NOM d'en-tete (Code, Libellé, Compte, Numéro, etc.)
  // 2) Par CONTENU des donnees (fallback robuste pour Sage avec décalage de
  //    cellules fusionnées : si la colonne nommée "N°compte" est vide alors
  //    qu'une autre colonne contient des codes 2-10 chiffres, on prend l'autre)
  //
  // Cette double strategie garantit que peu importe le decalage Excel ou les
  // cellules fusionnees, on retrouve les bonnes colonnes par leur contenu.

  /** Devine la colonne Code en regardant les valeurs : 30+ lignes numériques (2-10 chiffres) sur les 50 premières */
  const guessCodeColByContent = (): string | undefined => {
    let best: { h: string; count: number } | undefined;
    for (const h of headers) {
      let count = 0;
      for (const r of rows.slice(0, Math.min(50, rows.length))) {
        const v = r[h];
        if (v === null || v === undefined || v === '') continue;
        const s = String(v).trim();
        if (/^\d{2,10}$/.test(s)) count++;
      }
      if (count >= 10 && (!best || count > best.count)) best = { h, count };
    }
    return best?.h;
  };
  /** Devine la colonne Libellé : 30+ lignes avec du texte alphabétique > 3 char */
  const guessLabelColByContent = (excludeCol?: string): string | undefined => {
    let best: { h: string; count: number } | undefined;
    for (const h of headers) {
      if (h === excludeCol) continue;
      let count = 0;
      for (const r of rows.slice(0, Math.min(50, rows.length))) {
        const v = r[h];
        if (v === null || v === undefined || v === '') continue;
        const s = String(v).trim();
        // Au moins 4 caracteres dont une lettre alphabetique
        if (s.length >= 4 && /[a-zA-ZÀ-ÿ]/.test(s) && !/^\d+$/.test(s)) count++;
      }
      if (count >= 10 && (!best || count > best.count)) best = { h, count };
    }
    return best?.h;
  };

  /** Verifie si une colonne (par nom) contient effectivement des donnees code-like */
  const colHasNumericCodes = (h: string | undefined): boolean => {
    if (!h) return false;
    let count = 0;
    for (const r of rows.slice(0, Math.min(20, rows.length))) {
      const v = r[h];
      if (v && /^\d{2,10}$/.test(String(v).trim())) count++;
    }
    return count >= 5;
  };

  // 1) D'abord par nom
  let colCode = headers.find((h) => /^(code|compte|cpte|n[°ºo]?\s*compte|num[ée]ro|n[°ºo]\s*cpte)$/i.test(h.trim()))
    || headers.find((h) => /code|compte|cpte|num[ée]ro/i.test(h));
  let colLabel = headers.find((h) => /^(libell[éeè]|label|intitul[ée]?|description|d[ée]signation|nom)$/i.test(h.trim()))
    || headers.find((h) => /libell|label|intitul|d[ée]signation|description/i.test(h));

  // 2) Si la colonne par nom est vide en data, fallback CONTENU
  if (!colHasNumericCodes(colCode)) {
    const guessed = guessCodeColByContent();
    if (guessed) {
      console.log(`🟢 [importCOAv2] colCode "${colCode}" vide en data, fallback contenu: "${guessed}"`);
      colCode = guessed;
    }
  }
  if (colLabel) {
    // Verifier si colLabel a du texte
    let textCount = 0;
    for (const r of rows.slice(0, 20)) {
      const v = r[colLabel];
      if (v && /[a-zA-ZÀ-ÿ]/.test(String(v))) textCount++;
    }
    if (textCount < 5) {
      const guessed = guessLabelColByContent(colCode);
      if (guessed) {
        console.log(`🟢 [importCOAv2] colLabel "${colLabel}" vide en data, fallback contenu: "${guessed}"`);
        colLabel = guessed;
      }
    }
  } else {
    colLabel = guessLabelColByContent(colCode);
  }
  // Si tout par nom a echoue
  if (!colCode) colCode = guessCodeColByContent();
  if (!colLabel) colLabel = guessLabelColByContent(colCode);

  const colClass = headers.find((h) => /classe/i.test(h));
  const typeCols = headers.filter((h) => /^type(\s*\d+)?$/i.test(h.trim()));
  const colSysco = headers.find((h) => /sysco/i.test(h));

  console.log('🟢 [importCOAv2] Colonnes finales:', { colCode, colLabel, colClass, typeCols, colSysco });

  if (!colCode) return { imported: 0, updated: 0, errors: [`Colonne "Code" introuvable (ni par nom, ni par contenu). Headers : ${headers.join(', ')}`], sheetName };
  if (!colLabel) return { imported: 0, updated: 0, errors: [`Colonne "Libellé" introuvable (ni par nom, ni par contenu). Headers : ${headers.join(', ')}`], sheetName };

  const existing = new Set((await db.accounts.where('orgId').equals(orgId).toArray()).map((a) => a.code));
  const toImport: Account[] = [];
  const errors: string[] = [];
  let updatedCount = 0;

  // Normalise une valeur de type vers le code court : P / A / C / R / X
  // Accepte : 'P', 'PASSIF', 'A', 'ACTIF', 'C', 'CHARGE(S)', 'R', 'RECETTE(S)',
  // 'PRODUIT(S)', 'REVENUE', 'REVENU(S)' — en majuscules ou minuscules.
  const normalizeType = (raw: string): Account['type'] => {
    const v = raw.trim().toUpperCase();
    if (!v) return 'X';
    if (v === 'P' || v.startsWith('PASSIF')) return 'P';
    if (v === 'A' || v.startsWith('ACTIF')) return 'A';
    if (v === 'C' || v.startsWith('CHARGE')) return 'C';
    if (v === 'R' || v.startsWith('RECETTE') || v.startsWith('PRODUIT') || v.startsWith('REVENU')) return 'R';
    return 'X';
  };

  // Diagnostic : compteurs des raisons de skip pour expliquer si 0 import
  let skipCodeAbsent = 0;
  let skipCodeNonNumerique = 0;
  let skipLabelAbsent = 0;
  const sampleRejets: string[] = [];

  for (const r of rows) {
    let code = r[colCode];
    if (code === undefined || code === null) { skipCodeAbsent++; continue; }
    code = String(code).trim();
    if (!code) { skipCodeAbsent++; continue; }
    if (!/^\d/.test(code)) {
      skipCodeNonNumerique++;
      if (sampleRejets.length < 5) sampleRejets.push(`"${code}"`);
      continue;
    }
    const label = String(r[colLabel] ?? '').trim();
    if (!label) { skipLabelAbsent++; errors.push(`Compte ${code} sans libellé — ignoré`); continue; }
    const cls = colClass ? String(r[colClass] ?? '').trim() : (classOf(code) ?? code[0]);
    // Type : essaie chaque colonne "Type*" jusqu'a obtenir un code valide
    let type: Account['type'] = 'X';
    for (const tc of typeCols) {
      const t = normalizeType(String(r[tc] ?? ''));
      if (t !== 'X') { type = t; break; }
    }
    // Fallback : deduire depuis le plan SYSCOHADA officiel
    if (type === 'X') type = (findSyscoAccount(code)?.type ?? 'X') as Account['type'];
    const syscoCode = colSysco ? String(r[colSysco] ?? '').trim() : findSyscoAccount(code)?.code;
    if (existing.has(code)) updatedCount++;
    toImport.push({ orgId, code, label, class: cls || code[0], type, syscoCode });
  }

  console.log('🟢 [importCOAv2] Comptes à importer:', toImport.length, '— skip:', { skipCodeAbsent, skipCodeNonNumerique, skipLabelAbsent });

  // Si 0 import : ajouter un diagnostic au debut des erreurs
  if (toImport.length === 0) {
    const totalRows = rows.length;
    const diag: string[] = [];
    diag.push(`Lecture OK : feuille "${sheetName}", ${totalRows} lignes data extraites.`);
    // ALL HEADERS — pour voir si la mauvaise ligne d'en-tete a ete detectee
    diag.push(`En-têtes détectés : [${headers.map((h) => `"${h}"`).join(', ')}]`);
    diag.push(`Colonnes mappées : Code = "${colCode}", Libellé = "${colLabel}".`);
    // Echantillon de la 1ere ligne pour diagnostic immediat
    if (rows[0]) {
      const r0 = rows[0];
      const sampleKeys = Object.keys(r0).slice(0, 6);
      const sample = sampleKeys.map((k) => `${k}=${JSON.stringify(r0[k]).slice(0, 30)}`).join(' | ');
      diag.push(`Échantillon ligne 1 : ${sample}`);
    }
    if (skipCodeAbsent) diag.push(`${skipCodeAbsent} ligne(s) sans valeur de code.`);
    if (skipCodeNonNumerique) diag.push(`${skipCodeNonNumerique} ligne(s) avec un code NON-numérique (ex: ${sampleRejets.join(', ')}). Le compte doit commencer par un chiffre.`);
    if (skipLabelAbsent) diag.push(`${skipLabelAbsent} ligne(s) sans libellé.`);
    errors.unshift(...diag);
  }

  if (toImport.length > 0) {
    await db.accounts.bulkPut(toImport);
  }
  // Toujours enregistrer en historique (même 0 import) pour traçabilité
  await db.imports.add({
    orgId, date: Date.now(), user: 'Utilisateur local', fileName: file.name,
    source: 'Excel (v2)', kind: 'COA', count: toImport.length, rejected: errors.length,
    status: toImport.length === 0 ? 'error' : (errors.length === 0 ? 'success' : 'partial'),
    report: JSON.stringify({ updated: updatedCount, errors, sheetName, headers, sampleRow: rows[0], skipStats: { skipCodeAbsent, skipCodeNonNumerique, skipLabelAbsent } }),
  });

  return { imported: toImport.length, updated: updatedCount, errors, sheetName };
}

export async function importBudgetV2(
  file: File, orgId: string, year: number, version: string,
): Promise<{ imported: number; lines: number; errors: string[]; sheetName: string }> {
  console.log('🟡 [importBudgetV2] Start, file:', file.name, 'year:', year, 'version:', version);
  const { headers, rows, sheetName } = await readExcelBulletproof(file);
  if (rows.length === 0) {
    return { imported: 0, lines: 0, errors: ['Aucune donnée trouvée dans le fichier'], sheetName };
  }

  const colAccount = headers.find((h) => /^(compte|code|cpte|n.?\s*compte)$/i.test(h.trim())) || headers.find((h) => /compte|code/i.test(h));
  const monthPatterns = [/^janv/i, /^f[ée]vr/i, /^mars/i, /^avri?l/i, /^mai/i, /^juin/i, /^juil/i, /^ao[ûu]t/i, /^sept/i, /^octo/i, /^nove/i, /^d[ée]ce/i];
  const monthCols = monthPatterns.map((p) => headers.find((h) => p.test(h.trim())));
  const colAnnual = headers.find((h) => /annuel|total/i.test(h));

  console.log('🟡 [importBudgetV2] Colonnes:', { colAccount, monthCols, colAnnual });

  if (!colAccount) return { imported: 0, lines: 0, errors: [`Colonne "Compte" introuvable. Headers : ${headers.join(', ')}`], sheetName };

  const perAccount = new Map<string, number[]>();
  const errors: string[] = [];

  for (const r of rows) {
    let code = r[colAccount];
    if (code === undefined || code === null) continue;
    code = String(code).trim();
    if (!code || !/^\d/.test(code)) continue;
    if (/^total/i.test(code) || /^═/.test(code)) continue;

    const monthly: number[] = monthCols.map((c, _i) => {
      if (!c) return 0;
      const v = r[c];
      if (typeof v === 'number') return v;
      return parseAmount(v);
    });
    const hasMonths = monthly.some((v) => v !== 0);
    if (!hasMonths && colAnnual) {
      const ann = typeof r[colAnnual] === 'number' ? r[colAnnual] : parseAmount(r[colAnnual]);
      if (ann !== 0) {
        const part = Math.round(ann / 12);
        for (let i = 0; i < 12; i++) monthly[i] = part;
      }
    }

    if (!perAccount.has(code)) perAccount.set(code, Array(12).fill(0));
    const cur = perAccount.get(code)!;
    for (let m = 0; m < 12; m++) cur[m] += monthly[m];
  }

  console.log('🟡 [importBudgetV2] Comptes trouvés:', perAccount.size);

  let lines = 0;
  await db.transaction('rw', db.budgets, async () => {
    await db.budgets.where('[orgId+year+version]').equals([orgId, year, version]).delete();
    const toInsert: any[] = [];
    for (const [account, arr] of perAccount) {
      let pushed = false;
      for (let m = 0; m < 12; m++) {
        if (arr[m] !== 0) { toInsert.push({ orgId, year, version, account, month: m + 1, amount: arr[m] }); pushed = true; }
      }
      if (!pushed) toInsert.push({ orgId, year, version, account, month: 1, amount: 0 });
    }
    if (toInsert.length) await db.budgets.bulkAdd(toInsert);
    lines = toInsert.length;
  });

  await db.imports.add({
    orgId, date: Date.now(), user: 'Utilisateur local', fileName: file.name,
    source: 'Excel (v2)', kind: 'BUDGET', count: perAccount.size, rejected: errors.length,
    status: errors.length === 0 ? 'success' : 'partial',
    report: JSON.stringify({ lines, version, year, errors }),
  });

  return { imported: perAccount.size, lines, errors, sheetName };
}
// Empêche le tree-shaking si SYSCOHADA_COA est temporairement non utilisé
void SYSCOHADA_COA;

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

    // Détection intelligente de la feuille de DONNÉES (vs instructions / référentiels).
    // Stratégie :
    //   1) Ignorer feuilles nommées "Instructions", "Consignes", "Mode d'emploi",
    //      "Référentiel", "Référence", "Plan SYSCOHADA" (= sheets décoratives)
    //   2) Pour chaque feuille restante : scanner 15 premières lignes, compter
    //      les colonnes matchant des mots-clés
    //   3) Préférer la feuille DONT LE NOM matche fortement (ex: "Plan comptable",
    //      "Grand Livre", "Budget") + qui a un bon score d'en-têtes
    //   4) À défaut, prendre la première feuille (ordre du workbook) avec score ≥ 2
    const dataKeywords = /(^|[\s/_-])(compte|cpte|code|num[ée]ro|date|journal|jrn|d[ée]bit|cr[ée]dit|libell[éeè]|label|intitul|description|classe|type|sysco|tiers|ti[ée]rs|piece|pi[ée]ce|janv|f[ée]vr|mars|avr|mai|juin|juil|ao[ûu]t|sept|octo|nov|d[ée]ce|ann[ée]e|montant|amount|solde)/i;
    // Feuilles à IGNORER (instructions, référentiels, listes auxiliaires)
    const blacklistSheet = /^(instructions?|consignes?|mode\s*d.?emploi|aide|help|r[ée]f[ée]rentiel|r[ée]f[ée]rence|reference|sysco(hada)?|plan\s*sysco|exemples?|samples?|notes?|l[ée]gende|legend|intro|readme|à\s*propos|about)$/i;
    // Feuilles privilégiées (notre template + variantes courantes)
    const dataSheetPreferred = /(plan\s*comptable|comptes|grand\s*livre|gl|grandlivre|budget|balance|écritures?|ecritures?|journal|données|donnees|data)/i;

    type Pick = { sheetName: string; headerRow: number; score: number; rowsCount: number; sheetScore: number; order: number };
    const candidates: Pick[] = [];

    wb.SheetNames.forEach((name, order) => {
      if (blacklistSheet.test(name.trim())) return; // Skip instructions / référentiels
      const candidate = wb.Sheets[name];
      const matrix = XLSX.utils.sheet_to_json<unknown>(candidate, { defval: '', raw: false, header: 1 }) as unknown as string[][];
      if (!matrix || matrix.length === 0) return;

      const scanRows = Math.min(matrix.length, 15);
      let bestRow = 0; let bestScore = 0;
      for (let r = 0; r < scanRows; r++) {
        const row = matrix[r] || [];
        const score = row.filter((h) => h !== undefined && h !== null && String(h).trim() && dataKeywords.test(String(h).trim())).length;
        if (score > bestScore) { bestScore = score; bestRow = r; }
      }
      if (bestScore < 2) return;

      const dataRowsAfter = Math.max(0, matrix.length - bestRow - 1);
      const sheetScore = dataSheetPreferred.test(name.trim()) ? 100 : 0; // gros bonus si nom évocateur
      candidates.push({ sheetName: name, headerRow: bestRow, score: bestScore, rowsCount: dataRowsAfter, sheetScore, order });
    });

    // Tri : nom évocateur d'abord, puis score en-têtes max, puis plus de lignes,
    // puis ordre du workbook (la première feuille gagne en cas d'égalité totale).
    candidates.sort((a, b) =>
      (b.sheetScore - a.sheetScore) ||
      (b.score - a.score) ||
      (b.rowsCount - a.rowsCount) ||
      (a.order - b.order)
    );

    let best = candidates[0];
    if (!best) {
      // Fallback ultime : pas de feuille reconnue → prendre la 1ère feuille non-blacklistée avec le plus de lignes
      let maxRows = 0; let fallbackName = wb.SheetNames[0];
      for (const name of wb.SheetNames) {
        if (blacklistSheet.test(name.trim())) continue;
        const m = XLSX.utils.sheet_to_json<unknown>(wb.Sheets[name], { defval: '', raw: false, header: 1 }) as unknown[];
        if (m.length > maxRows) { maxRows = m.length; fallbackName = name; }
      }
      best = { sheetName: fallbackName, headerRow: 0, score: 0, rowsCount: maxRows, sheetScore: 0, order: 0 };
    }

    console.log('🚀 [parseFile v2.0 BUILD] Feuilles disponibles :', wb.SheetNames);
    console.log('🚀 [parseFile v2.0 BUILD] Candidats analysés :', candidates);
    console.log('🚀 [parseFile v2.0 BUILD] Feuille SÉLECTIONNÉE :', best.sheetName, '(headerRow:', best.headerRow, ', score:', best.score, ')');

    const ws = wb.Sheets[best.sheetName];
    // Si le header est en ligne 1 (cas standard), on utilise sheet_to_json direct.
    // Si le header est plus bas (consignes au-dessus), on doit décaler la plage.
    const opts: XLSX.Sheet2JSONOpts = { defval: '', raw: true };
    if (best.headerRow > 0) {
      // Récupérer la dimension de la feuille et la décaler
      const ref = ws['!ref'];
      if (ref) {
        const range = XLSX.utils.decode_range(ref);
        range.s.r = best.headerRow; // nouveau début = ligne du vrai header
        opts.range = XLSX.utils.encode_range(range);
      }
    }
    const rows = XLSX.utils.sheet_to_json<ParsedRow>(ws, opts);
    const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
    return { headers, rows };
  }
  throw new Error('Format non supporté (utilisez CSV, TXT, XLSX)');
}

// ── Normalisation d'un montant ──────────────────────────────────────────────
function parseAmount(s: any): number {
  if (s === undefined || s === null || s === '') return 0;
  if (typeof s === 'number') return s;
  // Supprimer TOUS les types d'espaces Unicode + tout caractère non-numérique
  // (sauf , . -). Couvre : espace ASCII, NBSP (U+00A0), narrow NBSP (U+202F),
  // figure space (U+2007), thin space (U+2009), em/en spaces, etc.
  const str = String(s)
    .replace(/[\s\u00A0\u1680\u2000-\u200B\u202F\u205F\u3000\uFEFF]/g, '')
    .replace(/[^\d,.\-]/g, '');
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
  /** Années rencontrées dans les écritures, triées par nb d'écritures décroissant */
  yearsDetected: Array<{ year: number; count: number }>;
  /** Année dominante (celle qui a le plus d'écritures) */
  dominantYear?: number;
  /** Nombre d'écritures d'à-nouveaux (RAN) détectées et routées vers la période d'ouverture */
  openingEntries: number;
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

  // Auto-affectation des écritures aux périodes selon leur date
  const MONTH_LABELS = ['', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

  // ── PRÉ-CALCUL HORS TRANSACTION ──────────────────────────────────────────
  // On fait toute la résolution des périodes/exercices AVANT d'ouvrir la
  // transaction Dexie. Les awaits sur des valeurs non-Dexie ou les itérations
  // longues à l'intérieur d'une transaction provoquent "Transaction committed
  // too early".
  const existingPeriodsAll = await db.periods.where('orgId').equals(opts.orgId).toArray();
  const periodIndex = new Map(existingPeriodsAll.map((p) => [`${p.year}-${p.month}`, p.id]));
  const existingFYs = await db.fiscalYears.where('orgId').equals(opts.orgId).toArray();
  const fyIndex = new Map(existingFYs.map((fy) => [fy.year, fy.id]));
  // Pattern de détection des écritures d'à-nouveaux (Report À Nouveau = RAN)
  // STRICT : uniquement code journal exact + libellé sur comptes BILAN (classes 1-5).
  // Les comptes de gestion (classes 6, 7, 8) ne sont JAMAIS reportés à nouveau en
  // SYSCOHADA — ils sont soldés à la clôture. Donc même si journal = "AN", une
  // écriture sur 706/411/etc avec compte de gestion ne peut pas être un RAN.
  // Cette règle évite de router des écritures de janvier (ex: 706100) vers le
  // mois 0 « à-nouveaux » par erreur, ce qui les rendrait invisibles dans le CR.
  const AN_JOURNALS = new Set(['AN', 'A.N', 'A.N.', 'RAN', 'R.A.N', 'R.A.N.', 'ANO', 'OUV', 'OUVERTURE', 'REPORT', 'NOUVEAUX']);
  const isAN = (e: Omit<GLEntry, 'id'>) => {
    // Comptes de gestion : jamais d'à-nouveaux en SYSCOHADA
    const c0 = (e.account || '')[0];
    if (c0 === '6' || c0 === '7' || c0 === '8') return false;
    const jrn = (e.journal || '').toUpperCase().trim();
    if (AN_JOURNALS.has(jrn)) return true;
    // Libellé : uniquement match strict de la séquence « à-nouveau » ou « report à nouveau »
    const lib = (e.label || '').toLowerCase();
    if (/\bà[- ]?nouveau/.test(lib)) return true;
    if (/\ba[- ]nouveau/.test(lib)) return true; // « a-nouveau » sans accent
    if (/report\s+(à|a)\s+nouveau/.test(lib)) return true;
    return false;
  };

  // Périodes et exercices à créer (calcul pur JS).
  // Les écritures d'à-nouveaux (RAN) sont routées vers une période spéciale
  // « mois 0 » de leur exercice, utilisée par computeBalance.includeOpening.
  let anCount = 0;
  const newFYs: typeof existingFYs = [];
  const newPeriods: typeof existingPeriodsAll = [];
  for (const e of entries) {
    const y = parseInt(e.date.substring(0, 4));
    const an = isAN(e);
    if (an) anCount++;
    const m = an ? 0 : parseInt(e.date.substring(5, 7));
    const key = `${y}-${m}`;
    let pId = periodIndex.get(key);
    if (!pId) {
      let fyId = fyIndex.get(y);
      if (!fyId) {
        fyId = `fy-${opts.orgId}-${y}`;
        fyIndex.set(y, fyId);
        newFYs.push({ id: fyId, orgId: opts.orgId, year: y, startDate: `${y}-01-01`, endDate: `${y}-12-31`, closed: false });
      }
      pId = `p-${opts.orgId}-${y}-${m}`;
      periodIndex.set(key, pId);
      const label = m === 0 ? `À-nouveaux ${y}` : `${MONTH_LABELS[m]} ${y}`;
      newPeriods.push({ id: pId, orgId: opts.orgId, fiscalYearId: fyId, year: y, month: m, label, closed: false });
    }
    e.periodId = pId;
  }

  // ⚠ NE PAS auto-créer des entrées dans db.accounts (Plan Comptable) à partir
  // du GL. Le Plan Comptable est un référentiel maître qui doit être importé
  // explicitement via la page Plan Comptable. Les libellés des comptes mouvementés
  // sont disponibles dans les entrées GL (e.label) et utilisés en fallback par
  // les moteurs d'affichage (balance.ts, monthly.ts, budgetActual.ts).

  // ── TRANSACTION : uniquement des opérations Dexie consécutives ───────────
  await db.transaction('rw', [db.gl, db.accounts, db.imports, db.periods, db.fiscalYears], async () => {
    if (newFYs.length > 0) await db.fiscalYears.bulkPut(newFYs);
    if (newPeriods.length > 0) await db.periods.bulkPut(newPeriods);

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
  });

  // Statistique des années présentes dans les écritures
  const yearMap = new Map<number, number>();
  for (const e of entries) {
    const y = parseInt(e.date.substring(0, 4), 10);
    if (!isNaN(y)) yearMap.set(y, (yearMap.get(y) ?? 0) + 1);
  }
  const yearsDetected = Array.from(yearMap.entries())
    .map(([year, count]) => ({ year, count }))
    .sort((a, b) => b.count - a.count);

  return {
    totalRows: rows.length,
    imported: entries.length,
    rejected: errors.length,
    totalDebit, totalCredit, balanced,
    unknownAccounts: [...unknownAccounts],
    errors,
    unbalancedPieces,
    yearsDetected,
    dominantYear: yearsDetected[0]?.year,
    openingEntries: anCount,
  };
}

// ── Import Plan Comptable ──────────────────────────────────────────────────
export type COAImportReport = {
  totalRows: number;
  imported: number;
  updated: number;
  errors: { row: number; reason: string }[];
};

export type COAMapping = {
  code: string;
  label: string;
  class?: string;
  type?: string;
  sysco?: string;
};

/**
 * Import du plan comptable.
 * - Signature historique : (file, orgId) => détection automatique des colonnes
 * - Signature étendue    : (file, orgId, mapping, opts)
 *   Le mapping permet au wizard de fournir les colonnes explicites.
 *   Les opts permettent de tracer l'import dans db.imports (user, source).
 */
export async function importCOA(
  file: File,
  orgId: string,
  mapping?: Partial<COAMapping>,
  opts?: { user?: string; source?: string },
): Promise<COAImportReport> {
  const { rows } = await parseFile(file);
  const errors: COAImportReport['errors'] = [];
  const toImport: Account[] = [];

  // Détection des colonnes (si mapping partiel, on complète avec l'auto-détection)
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  const colCode = mapping?.code
    || headers.find((h) => /^code$/i.test(h.trim()) || /^compte$/i.test(h.trim()));
  const colLabel = mapping?.label
    || headers.find((h) => /^libell[éeè]/i.test(h.trim()) || /^label/i.test(h.trim()) || /^intitul/i.test(h.trim()));
  const colClass = mapping?.class
    || headers.find((h) => /^classe$/i.test(h.trim()));
  const colType = mapping?.type
    || headers.find((h) => /^type$/i.test(h.trim()));
  const colSysco = mapping?.sysco
    || headers.find((h) => /sysco/i.test(h.trim()) || /^compte\s*sysco/i.test(h.trim()));

  if (!colCode) {
    const msg = `Colonne "Code" ou "Compte" introuvable. Colonnes trouvées : ${headers.join(', ')}`;
    console.error('[importCOA]', msg);
    throw new Error(msg);
  }
  if (!colLabel) {
    const msg = `Colonne "Libellé" introuvable. Colonnes trouvées : ${headers.join(', ')}`;
    console.error('[importCOA]', msg);
    throw new Error(msg);
  }

  // DIAGNOSTIC : afficher en console ce que le parser voit
  console.log('[importCOA] Headers détectés :', headers);
  console.log('[importCOA] Colonnes mappées :', { code: colCode, label: colLabel, class: colClass, type: colType, sysco: colSysco });
  console.log('[importCOA] Premières lignes :', rows.slice(0, 3));
  console.log('[importCOA] Total lignes brutes :', rows.length);

  rows.forEach((r, idx) => {
    const code = String(r[colCode!] ?? '').trim();
    if (!code || !/^\d/.test(code)) return; // skip non-account rows
    const label = String(r[colLabel!] ?? '').trim();
    if (!label) { errors.push({ row: idx + 2, reason: `Libellé manquant pour le compte ${code}` }); return; }

    const cls = colClass ? String(r[colClass] ?? '').trim() : classOf(code) ?? 'X';
    const type = colType ? String(r[colType] ?? '').trim() as Account['type'] : (findSyscoAccount(code)?.type ?? 'X');
    const syscoCode = colSysco ? String(r[colSysco] ?? '').trim() : findSyscoAccount(code)?.code;

    toImport.push({ orgId, code, label, class: cls, type, syscoCode });
  });

  console.log('[importCOA] Comptes à importer :', toImport.length);
  if (toImport.length === 0 && rows.length > 0) {
    console.warn('[importCOA] AUCUN compte importé alors que', rows.length, 'lignes lues. Erreurs :', errors);
    alert(`⚠ Aucun compte importé.\nLignes lues : ${rows.length}\nColonne Code : ${colCode}\nColonne Libellé : ${colLabel}\n\nOuvrez la console (F12) pour voir le détail.`);
  }

  let updated = 0;
  if (toImport.length > 0) {
    const existing = new Set((await db.accounts.where('orgId').equals(orgId).toArray()).map((a) => a.code));
    updated = toImport.filter((a) => existing.has(a.code)).length;
    await db.accounts.bulkPut(toImport);
  }

  // Trace l'import dans la table "imports" pour le versionning
  await db.imports.add({
    orgId,
    date: Date.now(),
    user: opts?.user ?? 'Utilisateur local',
    fileName: file.name,
    source: opts?.source ?? 'Excel',
    kind: 'COA',
    count: toImport.length,
    rejected: errors.length,
    status: errors.length === 0 ? 'success' : (toImport.length > 0 ? 'partial' : 'error'),
    report: JSON.stringify({ updated, errors: errors.slice(0, 100) }),
  });

  return {
    totalRows: rows.length,
    imported: toImport.length,
    updated,
    errors,
  };
}

// ── Import Budget ──────────────────────────────────────────────────────────
export type BudgetMapping = {
  account: string;             // colonne code compte (obligatoire)
  months?: Record<string, string>; // { m1: '01', m2: '02', ... } — optionnel
  annual?: string;             // colonne montant annuel (si pas de détail mensuel)
  label?: string;              // colonne libellé (optionnel, ignoré pour l'import)
};

export type BudgetImportReport = {
  totalRows: number;
  imported: number;  // nb de comptes importés
  lines: number;     // nb de lignes budgetaires crées (≈ comptes × 12)
  rejected: number;
  errors: { row: number; reason: string }[];
  version: string;
  year: number;
};

const FRENCH_MONTH_COLS = [
  /^janv/i, /^f[ée]vr/i, /^mars/i, /^avri?l/i, /^mai/i, /^juin/i,
  /^juil/i, /^ao[ûu]t/i, /^sept/i, /^octo/i, /^nove/i, /^d[ée]ce/i,
];

export async function importBudget(
  file: File,
  orgId: string,
  mapping: BudgetMapping,
  opts: { year: number; version: string; user?: string; source?: string },
): Promise<BudgetImportReport> {
  const { rows } = await parseFile(file);
  const errors: BudgetImportReport['errors'] = [];

  // Détermine les colonnes mensuelles : soit via mapping.months fourni par le wizard,
  // soit auto-détection sur les en-têtes.
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  const monthCols: (string | undefined)[] = [];
  if (mapping.months) {
    for (let i = 1; i <= 12; i++) monthCols.push(mapping.months[`m${i}`]);
  } else {
    for (const re of FRENCH_MONTH_COLS) {
      monthCols.push(headers.find((h) => re.test(h.trim())));
    }
  }
  const hasMonthly = monthCols.some((c) => !!c);
  const annualCol = mapping.annual;

  // DIAGNOSTIC console
  console.log('[importBudget] Headers détectés :', headers);
  console.log('[importBudget] Colonne compte :', mapping.account);
  console.log('[importBudget] Colonnes mensuelles :', monthCols);
  console.log('[importBudget] Colonne annuelle :', annualCol);
  console.log('[importBudget] Premières lignes :', rows.slice(0, 3));
  console.log('[importBudget] Total lignes brutes :', rows.length);

  if (!hasMonthly && !annualCol) {
    const msg = `Impossible de localiser les 12 colonnes mensuelles ni une colonne "Montant annuel".\nHeaders trouvés : ${headers.join(', ')}`;
    console.error('[importBudget]', msg);
    throw new Error(msg);
  }
  if (!mapping.account) {
    const msg = `Colonne "Compte" non spécifiée. Headers : ${headers.join(', ')}`;
    console.error('[importBudget]', msg);
    throw new Error(msg);
  }

  // Accumulation par compte (somme si plusieurs lignes par compte)
  const perAccount = new Map<string, number[]>();

  rows.forEach((r) => {
    const code = String(r[mapping.account] ?? '').trim();
    if (!code || !/^\d/.test(code)) return;
    // Skip totaux/séparateurs
    if (/^total/i.test(code) || /^═/.test(code)) return;

    let monthly: number[];
    if (hasMonthly) {
      monthly = monthCols.map((c) => {
        if (!c) return 0;
        return parseAmount(r[c]);
      });
    } else if (annualCol) {
      const annual = parseAmount(r[annualCol]);
      // Répartition linéaire 1/12 — on garde même si annual = 0
      const part = annual === 0 ? 0 : Math.round(annual / 12);
      monthly = Array.from({ length: 12 }, () => part);
    } else {
      monthly = Array(12).fill(0);
    }

    // ⚠ NE PAS skipper les lignes avec montants à 0 — l'utilisateur doit pouvoir
    // les voir et les éditer manuellement après import. La structure du budget
    // (liste des comptes) doit être préservée même si les valeurs sont vides.

    if (!perAccount.has(code)) perAccount.set(code, Array(12).fill(0));
    const current = perAccount.get(code)!;
    for (let m = 0; m < 12; m++) current[m] += monthly[m];
  });

  // Enregistrement : écrase la version cible (semantique "load or replace")
  let lines = 0;
  await db.transaction('rw', db.budgets, async () => {
    await db.budgets
      .where('[orgId+year+version]')
      .equals([orgId, opts.year, opts.version])
      .delete();
    const toInsert: Array<{ orgId: string; year: number; version: string; account: string; month: number; amount: number }> = [];
    for (const [account, arr] of perAccount) {
      for (let m = 0; m < 12; m++) {
        if (arr[m] !== 0) {
          toInsert.push({ orgId, year: opts.year, version: opts.version, account, month: m + 1, amount: arr[m] });
        }
      }
    }
    // Si tous les montants sont à 0, insérer au moins UNE ligne par compte
    // (mois 1, montant 0) pour que loadBudget retrouve les comptes vides
    // et que l'utilisateur puisse les éditer manuellement.
    for (const [account] of perAccount) {
      const hasAny = toInsert.some((t) => t.account === account);
      if (!hasAny) {
        toInsert.push({ orgId, year: opts.year, version: opts.version, account, month: 1, amount: 0 });
      }
    }
    if (toInsert.length) await db.budgets.bulkAdd(toInsert as any);
    lines = toInsert.length;
  });

  // Trace dans db.imports
  await db.imports.add({
    orgId,
    date: Date.now(),
    user: opts.user ?? 'Utilisateur local',
    fileName: file.name,
    source: opts.source ?? 'Excel',
    kind: 'BUDGET',
    count: perAccount.size,
    rejected: errors.length,
    status: errors.length === 0 ? 'success' : (perAccount.size > 0 ? 'partial' : 'error'),
    report: JSON.stringify({ lines, errors: errors.slice(0, 100) }),
    year: opts.year,
    version: opts.version,
  });

  return {
    totalRows: rows.length,
    imported: perAccount.size,
    lines,
    rejected: errors.length,
    errors,
    version: opts.version,
    year: opts.year,
  };
}

// ── Migration des écritures GL existantes vers les bonnes périodes ────────
// Réaffecte chaque écriture à la période correspondant à sa date
export async function migrateGLPeriods(orgId: string): Promise<{ migrated: number; periodsCreated: number }> {
  const MONTH_LABELS = ['', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

  let migrated = 0;
  let periodsCreated = 0;

  await db.transaction('rw', [db.gl, db.periods, db.fiscalYears], async () => {
    const entries = await db.gl.where('orgId').equals(orgId).toArray();
    const periods = await db.periods.where('orgId').equals(orgId).toArray();
    const periodIndex = new Map(periods.map((p) => [`${p.year}-${p.month}`, p.id]));
    const fiscalYears = await db.fiscalYears.where('orgId').equals(orgId).toArray();
    const fyIndex = new Map(fiscalYears.map((fy) => [fy.year, fy.id]));

    const updates: { key: number; changes: { periodId: string } }[] = [];

    // Pré-charger les périodes pour savoir si une écriture est actuellement
    // routée vers le mois 0 (à-nouveaux). On ne touche aux comptes bilan
    // (classes 1-5) QUE si leur periodId n'existe pas. Pour les comptes de
    // gestion (6/7/8), on force la réaffectation sur le mois de la date — ils
    // ne devraient JAMAIS être en mois 0 (à-nouveaux), c'est un bug d'import.
    const periodById = new Map(periods.map((p) => [p.id, p]));

    for (const e of entries) {
      if (!e.date || e.date.length < 7) continue;
      const y = parseInt(e.date.substring(0, 4));
      const m = parseInt(e.date.substring(5, 7));
      if (isNaN(y) || isNaN(m) || m < 1 || m > 12) continue;

      // Skip les écritures bilan déjà routées sur une période valide (préserve les RAN légitimes)
      const c0 = e.account?.[0];
      const isGestion = c0 === '6' || c0 === '7' || c0 === '8';
      const currentPeriod = e.periodId ? periodById.get(e.periodId) : undefined;
      if (!isGestion && currentPeriod && currentPeriod.year === y) continue;

      const key = `${y}-${m}`;
      let pId = periodIndex.get(key);

      if (!pId) {
        // Créer l'exercice si besoin
        let fyId = fyIndex.get(y);
        if (!fyId) {
          fyId = `fy-${orgId}-${y}`;
          await db.fiscalYears.put({ id: fyId, orgId, year: y, startDate: `${y}-01-01`, endDate: `${y}-12-31`, closed: false });
          fyIndex.set(y, fyId);
        }
        pId = `p-${orgId}-${y}-${m}`;
        await db.periods.put({ id: pId, orgId, fiscalYearId: fyId, year: y, month: m, label: `${MONTH_LABELS[m]} ${y}`, closed: false });
        periodIndex.set(key, pId);
        periodsCreated++;
      }

      if (e.periodId !== pId) {
        updates.push({ key: e.id!, changes: { periodId: pId } });
      }
    }

    // Appliquer les mises à jour par lots
    for (const u of updates) {
      await db.gl.update(u.key, u.changes);
    }
    migrated = updates.length;
  });

  return { migrated, periodsCreated };
}

// ── Resynchroniser les libellés de db.accounts depuis les libellés réels du GL ──
// Pour chaque compte, prend le libellé le plus fréquent dans les écritures GL
// (= libellé du plan comptable de l'entreprise) et écrase l'ancien label
// SYSCOHADA générique. À déclencher après import si les libellés affichés
// ne correspondent pas au plan de l'entreprise.
export async function resyncAccountLabels(orgId: string): Promise<{ updated: number }> {
  let updated = 0;
  const entries = await db.gl.where('orgId').equals(orgId).toArray();
  const accounts = await db.accounts.where('orgId').equals(orgId).toArray();

  // Calculer le libellé le plus fréquent par compte
  const freq = new Map<string, Map<string, number>>();
  for (const e of entries) {
    if (!e.label) continue;
    const lbl = e.label.trim();
    if (!lbl) continue;
    let m = freq.get(e.account);
    if (!m) { m = new Map(); freq.set(e.account, m); }
    m.set(lbl, (m.get(lbl) ?? 0) + 1);
  }

  for (const acc of accounts) {
    const m = freq.get(acc.code);
    if (!m) continue;
    let best = ''; let bestN = 0;
    for (const [k, v] of m) if (v > bestN) { best = k; bestN = v; }
    if (best && best !== acc.label) {
      await db.accounts.put({ ...acc, label: best });
      updated++;
    }
  }
  return { updated };
}
