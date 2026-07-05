// Parser et importeur du Grand Livre (CSV / XLSX)
//
// Source de données : Supabase via dataProvider (obligatoire).
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import type { GLEntry, Account } from '../db/schema';
import { dataProvider } from '../db/provider';
import { findSyscoAccount, classOf, SYSCOHADA_COA } from '../syscohada/coa';
import { hashEntry, type HashableEntry } from '../lib/auditHash';
import { assertPeriodOpen, PeriodLockedError } from '../lib/periodLock';
import { getClassifier } from './accountingSystems';
import { hungarianMaximize } from './hungarian';
import { logGLChanges, type AuditChange } from '../lib/glAuditLog';
import { applyTiersRules } from './tiersRules';
import { categorizeTiersAccount } from './tiersCategory';
import type { GLTiersEntry } from '../db/schema';

/**
 * Debug helper — log uniquement en développement (strip en prod).
 * Vite remplace `import.meta.env.DEV` par `false` au build prod, ce qui
 * permet au tree-shaker d'éliminer ces appels du bundle.
 */
// eslint-disable-next-line no-console
const debug = (...args: unknown[]): void => {
  // eslint-disable-next-line no-console
  if (import.meta.env.DEV) console.log(...args);
};

/**
 * Calcule un hash SHA-256 du contenu binaire d'un fichier.
 * Permet la détection de doublon : si le même fichier est ré-uploadé,
 * le hash est identique et on peut alerter l'utilisateur.
 */
export async function computeFileHash(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const subtle = (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle) || null;
  if (!subtle) {
    // Fallback : fileName + size (faible mais mieux que rien)
    return `nohash:${file.name}:${file.size}`;
  }
  const digest = await subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Détection de doublon : vérifie si un import du même hash existe déjà
 * pour cette org. Retourne l'import existant ou `null`.
 *
 * @param orgId Organisation cible
 * @param fileHash Hash SHA-256 du fichier en cours d'upload
 * @param kind Type d'import (filter pour éviter de confondre GL et TIERS)
 */
export async function findDuplicateImport(
  orgId: string,
  fileHash: string,
  kind?: string,
): Promise<{ id: number; fileName: string; date: number; count: number } | null> {
  try {
    const imports = await dataProvider.getImports(orgId);
    const dup = imports.find((i) =>
      (i as any).fileHash === fileHash && (!kind || i.kind === kind),
    );
    if (!dup) return null;
    return {
      id: dup.id!,
      fileName: dup.fileName,
      date: dup.date,
      count: dup.count,
    };
  } catch {
    return null;
  }
}

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
  debug('🔵 [readExcelBulletproof v3] Toutes les feuilles :', allSheets);
  debug('🔵 [readExcelBulletproof v3] Feuilles candidates :', debugCands);

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
  debug('🔵 Feuille SÉLECTIONNÉE :', best.sheetName, '(headerRow:', best.headerRow, ')');

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

  debug('🔵 Headers extraits :', headerArr);
  debug('🔵 Lignes data :', rows.length, '— premières :', rows.slice(0, 3));
  return { headers: headerArr, rows, sheetName: best.sheetName, debug: { allSheets, candidates: debugCands, selectedSheet: best.sheetName } };
}

// Wrappers simples pour PC et Budget
export async function importCOAv2(file: File, orgId: string): Promise<{ imported: number; updated: number; errors: string[]; sheetName: string }> {
  debug('🟢 [importCOAv2] Start, file:', file.name);
  const { headers, rows, sheetName, debug: dbg } = await readExcelBulletproof(file);
  if (rows.length === 0) {
    // Diagnostic explicite : toutes feuilles + candidates + raisons
    const lines: string[] = [];
    if (dbg.candidates.length === 0) {
      lines.push(`Aucune feuille reconnue dans le classeur.`);
      lines.push(`Feuilles présentes : ${dbg.allSheets.join(' · ') || '(aucune)'}.`);
      lines.push(`Causes possibles : feuille blacklistée (Notes/Aide/...), en-têtes < 2 mots-clés reconnus, ou cellules fusionnées.`);
    } else {
      const top = dbg.candidates[0];
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
      debug(`🟢 [importCOAv2] colCode "${colCode}" vide en data, fallback contenu: "${guessed}"`);
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
        debug(`🟢 [importCOAv2] colLabel "${colLabel}" vide en data, fallback contenu: "${guessed}"`);
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

  debug('🟢 [importCOAv2] Colonnes finales:', { colCode, colLabel, colClass, typeCols, colSysco });

  if (!colCode) return { imported: 0, updated: 0, errors: [`Colonne "Code" introuvable (ni par nom, ni par contenu). Headers : ${headers.join(', ')}`], sheetName };
  if (!colLabel) return { imported: 0, updated: 0, errors: [`Colonne "Libellé" introuvable (ni par nom, ni par contenu). Headers : ${headers.join(', ')}`], sheetName };

  const existing = new Set((await dataProvider.getAccounts(orgId)).map((a) => a.code));
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

  debug('🟢 [importCOAv2] Comptes à importer:', toImport.length, '— skip:', { skipCodeAbsent, skipCodeNonNumerique, skipLabelAbsent });

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
    await dataProvider.bulkUpsertAccounts(toImport);
  }
  // Toujours enregistrer en historique (même 0 import) pour traçabilité
  await dataProvider.addImport({
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
  debug('🟡 [importBudgetV2] Start, file:', file.name, 'year:', year, 'version:', version);
  const { headers, rows, sheetName } = await readExcelBulletproof(file);
  if (rows.length === 0) {
    return { imported: 0, lines: 0, errors: ['Aucune donnée trouvée dans le fichier'], sheetName };
  }

  const colAccount = headers.find((h) => /^(compte|code|cpte|n.?\s*compte)$/i.test(h.trim())) || headers.find((h) => /compte|code/i.test(h));
  const monthPatterns = [/^janv/i, /^f[ée]vr/i, /^mars/i, /^avri?l/i, /^mai/i, /^juin/i, /^juil/i, /^ao[ûu]t/i, /^sept/i, /^octo/i, /^nove/i, /^d[ée]ce/i];
  const monthCols = monthPatterns.map((p) => headers.find((h) => p.test(h.trim())));
  const colAnnual = headers.find((h) => /annuel|total/i.test(h));

  debug('🟡 [importBudgetV2] Colonnes:', { colAccount, monthCols, colAnnual });

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

  debug('🟡 [importBudgetV2] Comptes trouvés:', perAccount.size);

  // Construire les lignes à insérer
  const toInsert: any[] = [];
  for (const [account, arr] of perAccount) {
    let pushed = false;
    for (let m = 0; m < 12; m++) {
      if (arr[m] !== 0) { toInsert.push({ orgId, year, version, account, month: m + 1, amount: arr[m] }); pushed = true; }
    }
    if (!pushed) toInsert.push({ orgId, year, version, account, month: 1, amount: 0 });
  }
  // Supprimer puis ré-insérer (DAL gère le push Supabase nativement)
  await dataProvider.deleteBudgets(orgId, year, version);
  if (toInsert.length) await dataProvider.bulkUpsertBudgets(toInsert);
  const lines = toInsert.length;

  // Détecte les fichiers VIDES (modèle téléchargé sans avoir été rempli) :
  // si TOUS les montants sont à 0, on prévient l'utilisateur.
  const totalAmount = Array.from(perAccount.values()).reduce(
    (s, arr) => s + arr.reduce((a, b) => a + Math.abs(b), 0), 0,
  );
  if (totalAmount === 0 && perAccount.size > 0) {
    errors.push(
      "Aucune valeur trouvée dans le fichier — il semble vide (modèle téléchargé sans modification ?). " +
      "Remplissez les colonnes Janv-Déc avec vos prévisions et ré-importez.",
    );
  }

  await dataProvider.addImport({
    orgId, date: Date.now(), user: 'Utilisateur local', fileName: file.name,
    source: 'Excel (v2)', kind: 'BUDGET',
    year, version, // ← maintenant stockés en top-level (avant : seulement dans report JSON)
    count: perAccount.size, rejected: errors.length,
    status: errors.length === 0 ? 'success' : 'partial',
    report: JSON.stringify({ lines, version, year, totalAmount, errors }),
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
// Accepte le format Cockpit FnA (COMPTE, LIBELLE, DATE, JOURNAL, NUMERO DE SAISIE,
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

    debug('🚀 [parseFile v2.0 BUILD] Feuilles disponibles :', wb.SheetNames);
    debug('🚀 [parseFile v2.0 BUILD] Candidats analysés :', candidates);
    debug('🚀 [parseFile v2.0 BUILD] Feuille SÉLECTIONNÉE :', best.sheetName, '(headerRow:', best.headerRow, ', score:', best.score, ')');

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
    .replace(/[^\d,.-]/g, '');
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
  /** Contrôle d'équilibre des à-nouveaux (RAN) : Σ débit vs Σ crédit du bilan d'ouverture.
   *  delta ≠ 0 ⇒ le bilan d'ouverture ne boucle pas → tout l'exercice est faussé. */
  openingImbalance?: { debit: number; credit: number; delta: number; count: number };
  /** Rapport d'anomalie : ventilation net (débit − crédit) par classe SYSCOHADA,
   *  pour localiser le côté (actif/passif) où manque la contrepartie. */
  imbalanceByClass?: Array<{ classe: string; debit: number; credit: number; net: number }>;
  /** Messages d'anomalie lisibles (équilibre global / à-nouveaux / pièces). */
  anomalies?: string[];
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

  // Charger le plan comptable de l'entreprise (fna_accounts) pour identifier
  // les comptes connus AVANT de vérifier le référentiel SYSCOHADA statique.
  // Cela évite les faux "comptes inconnus" quand l'entreprise a son propre COA.
  const orgAccounts = await dataProvider.getAccounts(opts.orgId);
  const orgAccountSet = new Set(orgAccounts.map((a) => a.code));

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
    // Priorité : plan comptable entreprise → référentiel SYSCOHADA statique
    const knownInOrg = orgAccountSet.has(account);
    const sysco = findSyscoAccount(account);
    if (!knownInOrg && !sysco) unknownAccounts.add(account);

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
  const [existingPeriodsAll, existingFYs] = await Promise.all([
    dataProvider.getPeriods(opts.orgId),
    dataProvider.getFiscalYears(opts.orgId),
  ]);
  const periodIndex = new Map(existingPeriodsAll.map((p) => [`${p.year}-${p.month}`, p.id]));
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
  let anDebit = 0, anCredit = 0;                                  // contrôle équilibre à-nouveaux
  const byClass = new Map<string, { debit: number; credit: number }>(); // rapport d'anomalie
  const newFYs: typeof existingFYs = [];
  const newPeriods: typeof existingPeriodsAll = [];
  for (const e of entries) {
    const y = parseInt(e.date.substring(0, 4));
    const an = isAN(e);
    if (an) {
      anCount++; anDebit += e.debit; anCredit += e.credit;
      // Ventilation net (débit − crédit) par CLASSE SYSCOHADA des À-NOUVEAUX,
      // pour localiser le côté (actif/passif) où manque la contrepartie.
      const cls = e.account[0] || '?';
      const bc = byClass.get(cls) ?? { debit: 0, credit: 0 };
      bc.debit += e.debit; bc.credit += e.credit; byClass.set(cls, bc);
    }
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

  // Pas de transaction au niveau DB : la couche dataProvider ne l'expose pas.
  // L'ordre est : insert FYs/periods → insert imports log → insert GL entries.
  if (newFYs.length > 0) await dataProvider.bulkUpsertFiscalYears(newFYs);
  if (newPeriods.length > 0) await dataProvider.bulkUpsertPeriods(newPeriods);

  // Calculer le hash du fichier pour détecter d'éventuels doublons à l'avenir
  const fileHash = await computeFileHash(file);

  // ── CONTRÔLE D'ÉQUILIBRE À L'IMPORT + RAPPORT D'ANOMALIE ─────────────────────
  //  1) Équilibre GLOBAL : Σ débit = Σ crédit sur tout l'import.
  //  2) Équilibre des À-NOUVEAUX (RAN) : un bilan d'ouverture déséquilibré se
  //     propage à tout l'exercice (c'est la cause n°1 des écarts de balance).
  //  3) Ventilation net (débit − crédit) par CLASSE SYSCOHADA → localise le côté
  //     (actif/passif) où manque la contrepartie.
  const r0 = (n: number) => Math.round(n);
  const fmtX = (n: number) => r0(n).toLocaleString('fr-FR');
  const openingImbalance = { debit: r0(anDebit), credit: r0(anCredit), delta: r0(anDebit - anCredit), count: anCount };
  const imbalanceByClass = Array.from(byClass.entries())
    .map(([classe, v]) => ({ classe, debit: r0(v.debit), credit: r0(v.credit), net: r0(v.debit - v.credit) }))
    .sort((a, b) => a.classe.localeCompare(b.classe));
  const anomalies: string[] = [];
  if (!balanced) {
    anomalies.push(`Grand Livre globalement déséquilibré : écart ${fmtX(totalDebit - totalCredit)} XOF (Σ débit ${fmtX(totalDebit)} ≠ Σ crédit ${fmtX(totalCredit)}).`);
  }
  if (Math.abs(openingImbalance.delta) > 1) {
    anomalies.push(`À-nouveaux (RAN) déséquilibrés : écart ${fmtX(openingImbalance.delta)} XOF sur ${anCount} écriture(s). Le bilan d'ouverture ne boucle pas — vérifiez la balance de clôture N-1 et l'import des soldes d'ouverture.`);
    const off = imbalanceByClass.filter((c) => Math.abs(c.net) > 1).map((c) => `classe ${c.classe} net ${fmtX(c.net)}`).join(' · ');
    if (off) anomalies.push(`Ventilation du déséquilibre par classe : ${off}.`);
  }
  if (unbalancedPieces.length > 0) {
    anomalies.push(`${unbalancedPieces.length} pièce(s) déséquilibrée(s) (Σ débit ≠ Σ crédit sur une même pièce).`);
  }

  const importId = await dataProvider.addImport({
    orgId: opts.orgId,
    date: Date.now(),
    user: opts.user,
    fileName: file.name,
    fileHash,
    source: opts.source,
    kind: 'GL',
    count: entries.length,
    rejected: errors.length,
    // Un import équilibré mais avec anomalie (RAN/pièces) reste « partial » pour
    // que l'utilisateur soit alerté visuellement dans l'historique des imports.
    status: errors.length > 0 ? (entries.length > 0 ? 'partial' : 'error') : (anomalies.length > 0 ? 'partial' : 'success'),
    report: JSON.stringify({ unknown: [...unknownAccounts], errors: errors.slice(0, 100), anomalies, openingImbalance, imbalanceByClass, balanced }),
  });

  if (entries.length > 0) {
    // ── Verrouillage périodes clôturées (P2-12) ──
    // Avant insertion, vérifier qu'aucune écriture ne tombe dans une période fermée.
    const datesUniques = Array.from(new Set(entries.map((e) => e.date)));
    for (const date of datesUniques) {
      try {
        await assertPeriodOpen(date, opts.orgId);
      } catch (err) {
        if (err instanceof PeriodLockedError) {
          errors.push({ row: 0, reason: `Import refusé : ${err.message}` });
          throw err;
        }
        throw err;
      }
    }

    // ── Audit trail SHA-256 (P2-11) ──
    // Récupère le DERNIER hash de la chaîne pour cet orgId, pour chaîner
    // proprement avec l'import en cours. Première écriture de l'orgId : prev = ''.
    const allOrgEntries = await dataProvider.getGLEntries({ orgId: opts.orgId });
    // Trier par id décroissant pour obtenir la dernière écriture insérée
    const lastEntry = allOrgEntries
      .filter((e) => typeof e.id === 'number')
      .sort((a, b) => (b.id ?? 0) - (a.id ?? 0))[0];
    let prevHash = lastEntry?.hash ?? '';

    // Calcule hash + previousHash pour chaque écriture, puis insère.
    const tagged: GLEntry[] = [];
    for (const e of entries) {
      const tempEntry: GLEntry = { ...e, importId: String(importId) };
      const hashable: HashableEntry = {
        id: `${opts.orgId}-${e.date}-${e.account}-${e.piece}-${importId}`,
        date: e.date,
        journal: e.journal,
        piece: e.piece,
        account: e.account,
        label: e.label,
        debit: e.debit,
        credit: e.credit,
        tiers: e.tiers,
      };
      const hash = await hashEntry(hashable, prevHash);
      tagged.push({ ...tempEntry, hash, previousHash: prevHash });
      prevHash = hash;
    }
    await dataProvider.bulkInsertGL(tagged);

    // ── Ré-application des règles de correction tiers mémorisées ──
    // Les corrections d'incohérences (compte → tiers) faites précédemment
    // se ré-appliquent automatiquement aux nouvelles écritures sans tiers,
    // pour ne pas avoir à les refaire à la main. Non bloquant.
    try {
      await applyTiersRules(opts.orgId);
    } catch (err) {
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.warn('[importGL] applyTiersRules a échoué (non bloquant) :', err);
      }
    }
  }

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
    openingImbalance,
    imbalanceByClass,
    anomalies,
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
  debug('[importCOA] Headers détectés :', headers);
  debug('[importCOA] Colonnes mappées :', { code: colCode, label: colLabel, class: colClass, type: colType, sysco: colSysco });
  debug('[importCOA] Premières lignes :', rows.slice(0, 3));
  debug('[importCOA] Total lignes brutes :', rows.length);

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

  debug('[importCOA] Comptes à importer :', toImport.length);
  if (toImport.length === 0 && rows.length > 0) {
    console.warn('[importCOA] AUCUN compte importé alors que', rows.length, 'lignes lues. Erreurs :', errors);
    alert(`⚠ Aucun compte importé.\nLignes lues : ${rows.length}\nColonne Code : ${colCode}\nColonne Libellé : ${colLabel}\n\nOuvrez la console (F12) pour voir le détail.`);
  }

  let updated = 0;
  if (toImport.length > 0) {
    const existing = new Set((await dataProvider.getAccounts(orgId)).map((a) => a.code));
    updated = toImport.filter((a) => existing.has(a.code)).length;
    await dataProvider.bulkUpsertAccounts(toImport);
  }

  // Trace l'import dans la table "imports" pour le versionning
  await dataProvider.addImport({
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
  debug('[importBudget] Headers détectés :', headers);
  debug('[importBudget] Colonne compte :', mapping.account);
  debug('[importBudget] Colonnes mensuelles :', monthCols);
  debug('[importBudget] Colonne annuelle :', annualCol);
  debug('[importBudget] Premières lignes :', rows.slice(0, 3));
  debug('[importBudget] Total lignes brutes :', rows.length);

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
  await dataProvider.deleteBudgets(orgId, opts.year, opts.version);
  if (toInsert.length) await dataProvider.bulkUpsertBudgets(toInsert as any);
  const lines = toInsert.length;

  // Trace dans imports
  await dataProvider.addImport({
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

  const [entries, periods, fiscalYears] = await Promise.all([
    dataProvider.getGLEntries({ orgId }),
    dataProvider.getPeriods(orgId),
    dataProvider.getFiscalYears(orgId),
  ]);
  const periodIndex = new Map(periods.map((p) => [`${p.year}-${p.month}`, p.id]));
  const fyIndex = new Map(fiscalYears.map((fy) => [fy.year, fy.id]));
  const periodById = new Map(periods.map((p) => [p.id, p]));

  const updates: { id: number; changes: { periodId: string } }[] = [];

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
        await dataProvider.upsertFiscalYear({ id: fyId, orgId, year: y, startDate: `${y}-01-01`, endDate: `${y}-12-31`, closed: false });
        fyIndex.set(y, fyId);
      }
      pId = `p-${orgId}-${y}-${m}`;
      await dataProvider.upsertPeriod({ id: pId, orgId, fiscalYearId: fyId, year: y, month: m, label: `${MONTH_LABELS[m]} ${y}`, closed: false });
      periodIndex.set(key, pId);
      periodsCreated++;
    }

    if (e.periodId !== pId && typeof e.id === 'number') {
      updates.push({ id: e.id, changes: { periodId: pId } });
    }
  }

  // Appliquer les mises à jour
  for (const u of updates) {
    await dataProvider.updateGLEntry(u.id, u.changes);
  }
  migrated = updates.length;

  return { migrated, periodsCreated };
}

// ── Resynchroniser les libellés de db.accounts depuis les libellés réels du GL ──
// Pour chaque compte, prend le libellé le plus fréquent dans les écritures GL
// (= libellé du plan comptable de l'entreprise) et écrase l'ancien label
// SYSCOHADA générique. À déclencher après import si les libellés affichés
// ne correspondent pas au plan de l'entreprise.
export async function resyncAccountLabels(orgId: string): Promise<{ updated: number }> {
  let updated = 0;
  const [entries, accounts] = await Promise.all([
    dataProvider.getGLEntries({ orgId }),
    dataProvider.getAccounts(orgId),
  ]);

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
      await dataProvider.bulkUpsertAccounts([{ ...acc, label: best }]);
      updated++;
    }
  }
  return { updated };
}

// ── Import Grand Livre Tiers (Auxiliaire) ─────────────────────────────────
// Enrichit les écritures GL existantes avec le détail client/fournisseur.
// Deux modes :
//   1) ENRICHISSEMENT : rapproche chaque ligne tiers avec une écriture GL
//      existante (date + journal + pièce + compte + montant) et remplit le
//      champ `tiers` sans créer de doublon.
//   2) CRÉATION : si aucun GL n'existe pour ce compte collectif, crée les
//      écritures directement (import standalone).
// Contrôle de cohérence : Σ soldes du tiers par compte collectif ≈ solde GL.

export type TiersMapping = {
  date: string;
  account: string;          // compte général (411, 401)
  codeTiers: string;        // code tiers (CLI001, FRN042)
  labelTiers: string;       // nom du tiers
  debit: string;
  credit: string;
  journal?: string;
  piece?: string;
  label?: string;           // libellé écriture
};

export type TiersImportReport = {
  totalRows: number;
  enriched: number;         // écritures GL existantes enrichies avec le code tiers
  unmatched: number;        // lignes tiers sans correspondance GL — non importées
  skipped: number;          // lignes ignorées (déjà un tiers, ou montant 0)
  errors: { row: number; reason: string }[];
  coherenceCheck: {
    account: string;
    soldeGL: number;
    soldeTiers: number;
    ecart: number;
    ok: boolean;
  }[];
};

const tiersPatterns: Record<keyof TiersMapping, RegExp[]> = {
  date: [/^date/i, /^jour/i, /^dt$/i],
  account: [/^compte\s*g[ée]n/i, /^cpte\s*g/i, /^compte\s*coll/i, /^compte$/i, /^general/i, /^cpte$/i],
  codeTiers: [/^code\s*tiers/i, /^n[°u].*tiers/i, /^tiers$/i, /^code\s*aux/i, /^auxiliaire/i, /^code\s*client/i, /^code\s*fourn/i, /^num.*tiers/i, /^compte\s*aux/i],
  labelTiers: [/^nom\s*tiers/i, /^raison\s*soc/i, /^intitul[ée]\s*tiers/i, /^nom\s*client/i, /^nom\s*fourn/i, /^libell[ée]\s*tiers/i, /^d[ée]sign/i, /^nom$/i],
  debit: [/^d[ée]bit$/i, /^debit$/i, /^db$/i],
  credit: [/^cr[ée]dit$/i, /^credit$/i, /^cr$/i],
  journal: [/^journal$/i, /^jnl/i, /^jrn/i, /journal/i],
  piece: [/pi[èe]ce/i, /^n[°u].*pi/i, /^ref/i, /^num.*doc/i, /^num[ée]ro\s*de\s*saisi/i],
  label: [/^libell[ée]$/i, /^description$/i, /^libelle$/i, /^label/i],
};

export function detectTiersColumns(headers: string[]): Partial<TiersMapping> {
  const mapping: Partial<TiersMapping> = {};
  for (const key of Object.keys(tiersPatterns) as (keyof TiersMapping)[]) {
    const ps = tiersPatterns[key];
    const found = headers.find((h) => ps.some((p) => p.test(h.trim())));
    if (found) mapping[key] = found;
  }
  return mapping;
}

/**
 * Cache optionnel transmis entre fichiers d'un même batch pour éviter de
 * recharger N fois le GL complet depuis Supabase. Le cache est muté en place
 * après chaque enrichissement (set tiers + label sur les entries matched)
 * pour que le fichier suivant voie l'état à jour.
 */
type ImportTiersCache = {
  glEntries: GLEntry[];
  // Plan comptable de l'org (déduit du coaSystem, mis en cache pour
  // éviter un getOrganization par fichier)
  classifier: ReturnType<typeof getClassifier>;
};

export async function importGLTiers(
  file: File,
  mapping: TiersMapping,
  opts: { orgId: string; user: string; source: string },
  cache?: ImportTiersCache,
): Promise<TiersImportReport> {
  const { rows } = await parseFile(file);
  const errors: TiersImportReport['errors'] = [];
  let enriched = 0;
  let unmatched = 0;
  let skipped = 0;

  // 1) Parser les lignes tiers
  type TiersLine = {
    date: string; account: string; codeTiers: string; labelTiers: string;
    debit: number; credit: number; journal: string; piece: string; label: string;
  };
  const tiersLines: TiersLine[] = [];
  const tiersBalanceByAccount = new Map<string, number>();

  rows.forEach((r, idx) => {
    const account = String(r[mapping.account] ?? '').trim();
    const codeTiers = String(r[mapping.codeTiers] ?? '').trim();
    if (!account || !codeTiers) {
      errors.push({ row: idx + 2, reason: `Compte ou code tiers manquant` });
      return;
    }
    const date = parseDate(r[mapping.date]);
    if (!date) { errors.push({ row: idx + 2, reason: 'Date invalide' }); return; }
    const debit = parseAmount(r[mapping.debit]);
    const credit = parseAmount(r[mapping.credit]);
    if (debit === 0 && credit === 0) { skipped++; return; }

    const labelTiers = String(r[mapping.labelTiers] ?? '').trim();
    const journal = mapping.journal ? String(r[mapping.journal] ?? '').trim() : '';
    const piece = mapping.piece ? String(r[mapping.piece] ?? '').trim() : '';
    const label = mapping.label ? String(r[mapping.label] ?? '').trim() : labelTiers;

    tiersLines.push({ date, account, codeTiers, labelTiers, debit, credit, journal, piece, label });
    tiersBalanceByAccount.set(account, (tiersBalanceByAccount.get(account) ?? 0) + debit - credit);
  });

  // 2) Charger le GL et préparer le classifier. Si un cache est fourni
  // (import batch multi-fichiers), on le réutilise pour éviter un re-fetch
  // paginé qui peut prendre 1-5s sur gros volumes.
  let glEntries: GLEntry[];
  let classifier: ReturnType<typeof getClassifier>;
  if (cache) {
    glEntries = cache.glEntries;
    classifier = cache.classifier;
  } else {
    glEntries = await dataProvider.getGLEntries({ orgId: opts.orgId });
    const org = await dataProvider.getOrganization(opts.orgId);
    classifier = getClassifier(org?.coaSystem);
  }

  // Index "large" : clé par date + montants arrondis (tolérance d'arrondi).
  // Toutes les écritures GL qui ont les mêmes date+débit+crédit (à 1 unité près)
  // sont regroupées. Le compte n'est PAS dans la clé : c'est le scoring qui
  // décide quel candidat est le meilleur match.
  const glIndex = new Map<string, GLEntry[]>();
  for (const e of glEntries) {
    const key = `${e.date}|${Math.round(e.debit)}|${Math.round(e.credit)}`;
    const arr = glIndex.get(key) ?? [];
    arr.push(e);
    glIndex.set(key, arr);
  }

  // 3) Rapprocher et enrichir — ALGORITHME SCORÉ + HUNGARIAN
  //
  // PRINCIPE COMPTABLE : le GL Tiers ne CRÉE jamais d'écritures GL. Il enrichit
  // les écritures existantes avec le code tiers. Les lignes sans correspondance
  // robuste sont persistées dans fna_tiers_unmatched pour révision.
  //
  // SCORING (min 50 pour valider) :
  //   - Compte exact            : +100
  //   - Compte startsWith       : +70  (tier='411' vs GL='411100')
  //   - Même classe (classifier): +40  (tier='401' vs GL='408100' en SYSCOHADA)
  //   - Classe différente       : rejet
  //   - Journal match           : +20
  //   - Journal mismatch        : -30
  //   - Pièce match             : +50  (identifiant fort)
  //   - Pièce mismatch          : -40
  //
  // ASSIGNMENT : Hungarian par groupe (date, debit, credit). Le greedy
  // "first-match-wins" est sous-optimal quand plusieurs lignes tiers ont
  // des candidats qui se chevauchent. Hungarian maximise le score TOTAL.
  const MIN_SCORE = 50;
  const scoreCandidate = (tl: TiersLine, c: GLEntry): number => {
    let s = 0;
    if (c.account === tl.account) s += 100;
    // Préfixe symétrique : couvre collectif↔individuel dans les DEUX sens.
    //   - GL collectif "411100" vs tiers préfixe "411"      → c.startsWith(tl)
    //   - GL collectif "411100" vs tiers individuel "411100X" → tl.startsWith(c)
    // Sans la 2e branche, un auxiliaire exporté avec le compte tiers individuel
    // (ex. SAGE "411DUPONT") retombait sur "même classe" (+40 < MIN_SCORE) → rejet.
    else if (c.account.startsWith(tl.account) || tl.account.startsWith(c.account)) s += 70;
    else if (classifier.classRoot(c.account) === classifier.classRoot(tl.account)) s += 40;
    else return -1;
    if (tl.journal && c.journal) {
      if (tl.journal.toUpperCase() === c.journal.toUpperCase()) s += 20;
      else s -= 30;
    }
    if (tl.piece && c.piece) {
      if (tl.piece === c.piece) s += 50;
      else s -= 40;
    }
    return s;
  };

  const toUpdate: GLEntry[] = [];
  const auditChanges: AuditChange[] = [];
  const unmatchedRows: Array<Omit<import('../db/schema').TiersUnmatched, 'id' | 'importId'>> = [];
  const matchedGL = new Set<number>();

  // Regrouper les lignes tiers par même clé (date, debit, credit) pour appliquer
  // Hungarian sur chaque groupe. Hors groupe (lignes uniques), équivalent au greedy.
  const groupsByKey = new Map<string, { idx: number; tl: TiersLine }[]>();
  for (let i = 0; i < tiersLines.length; i++) {
    const tl = tiersLines[i];
    const key = `${tl.date}|${Math.round(tl.debit)}|${Math.round(tl.credit)}`;
    const arr = groupsByKey.get(key) ?? [];
    arr.push({ idx: i, tl });
    groupsByKey.set(key, arr);
  }

  // Process chaque groupe
  const recordUnmatched = (
    idx: number,
    tl: TiersLine,
    reason: 'no_candidate' | 'tiers_conflict' | 'ambiguous',
    candidateIds?: number[],
  ) => {
    unmatchedRows.push({
      orgId: opts.orgId,
      rowIndex: idx + 2,
      date: tl.date,
      account: tl.account,
      codeTiers: tl.codeTiers,
      labelTiers: tl.labelTiers,
      debit: tl.debit,
      credit: tl.credit,
      journal: tl.journal || undefined,
      piece: tl.piece || undefined,
      label: tl.label || undefined,
      reason,
      candidateIds: candidateIds && candidateIds.length > 0 ? candidateIds : undefined,
      createdAt: Date.now(),
    });
    unmatched++;
  };

  const assignMatch = (tl: TiersLine, c: GLEntry) => {
    if (c.tiers === tl.codeTiers) {
      skipped++; // idempotent : même tier déjà assigné
    } else {
      // Audit trail : tracer la modification AVANT de muter
      const oldTiers = c.tiers;
      const oldLabel = c.label;
      const newLabel = (!c.label || c.label === '—') ? (tl.label || tl.labelTiers) : c.label;
      auditChanges.push({
        glEntryId: Number(c.id),
        field: 'tiers',
        oldValue: oldTiers,
        newValue: tl.codeTiers,
        reason: 'tiers_import',
        sourceKind: 'TIERS',
      });
      if (newLabel !== oldLabel) {
        auditChanges.push({
          glEntryId: Number(c.id),
          field: 'label',
          oldValue: oldLabel,
          newValue: newLabel,
          reason: 'tiers_import',
          sourceKind: 'TIERS',
        });
      }
      c.tiers = tl.codeTiers;
      c.label = newLabel;
      toUpdate.push(c);
      matchedGL.add(c.id!);
      enriched++;
    }
  };

  for (const [key, group] of groupsByKey) {
    const candidates = glIndex.get(key) ?? [];

    if (group.length === 1) {
      // Cas mono-ligne : équivalent au greedy, on prend le meilleur scoreur
      const { idx, tl } = group[0];
      const hasConflict = candidates.some((c) =>
        c.tiers && c.tiers !== tl.codeTiers && !matchedGL.has(c.id!)
      );
      let bestScore = MIN_SCORE - 1;
      let topCandidates: GLEntry[] = [];
      for (const c of candidates) {
        if (matchedGL.has(c.id!)) continue;
        if (c.tiers && c.tiers !== tl.codeTiers) continue;
        const sc = scoreCandidate(tl, c);
        if (sc < MIN_SCORE) continue;
        if (sc > bestScore) { bestScore = sc; topCandidates = [c]; }
        else if (sc === bestScore) topCandidates.push(c);
      }
      if (topCandidates.length === 1) {
        assignMatch(tl, topCandidates[0]);
      } else if (topCandidates.length > 1) {
        recordUnmatched(idx, tl, 'ambiguous', topCandidates.map((c) => c.id!).filter(Boolean));
      } else {
        recordUnmatched(idx, tl, hasConflict ? 'tiers_conflict' : 'no_candidate');
      }
      continue;
    }

    // Cas multi-lignes : assignment optimal via Hungarian
    // Filtre les candidats valides (pas déjà matchés, pas en conflit avec aucune ligne)
    const validCandidates = candidates.filter((c) => !matchedGL.has(c.id!));
    if (validCandidates.length === 0) {
      // Toutes les lignes du groupe sont no_candidate
      for (const { idx, tl } of group) recordUnmatched(idx, tl, 'no_candidate');
      continue;
    }

    // Matrice de scores
    const N = group.length;
    const M = validCandidates.length;
    const scores: number[][] = [];
    for (let i = 0; i < N; i++) {
      const row: number[] = [];
      const tl = group[i].tl;
      for (let j = 0; j < M; j++) {
        const c = validCandidates[j];
        // Conflit tiers : score interdit
        if (c.tiers && c.tiers !== tl.codeTiers) {
          row.push(Number.NEGATIVE_INFINITY);
          continue;
        }
        const sc = scoreCandidate(tl, c);
        if (sc < MIN_SCORE) row.push(Number.NEGATIVE_INFINITY);
        else row.push(sc);
      }
      scores.push(row);
    }

    const assignments = hungarianMaximize(scores);

    // Traiter les résultats
    for (let i = 0; i < N; i++) {
      const { idx, tl } = group[i];
      const j = assignments[i];
      if (j === -1 || j === undefined) {
        // Pas d'assignment optimal possible
        const hasConflict = candidates.some((c) =>
          c.tiers && c.tiers !== tl.codeTiers && !matchedGL.has(c.id!)
        );
        recordUnmatched(idx, tl, hasConflict ? 'tiers_conflict' : 'no_candidate');
      } else {
        const c = validCandidates[j];
        // Vérifier que le score était >= MIN (Hungarian peut assigner même si interdit
        // si pas d'autre choix — on protège)
        if (scores[i][j] < MIN_SCORE || !isFinite(scores[i][j])) {
          recordUnmatched(idx, tl, 'no_candidate');
        } else {
          assignMatch(tl, c);
        }
      }
    }
  }

  // 4) Écrire en base — atomique via RPC si disponible, sinon séquentiel.
  //
  // Mode atomique (RPC fna_import_tiers, migration 017) :
  //   - 1 seule transaction Postgres : INSERT import + UPDATE GL + INSERT unmatched
  //   - Rollback automatique en cas d'erreur sur n'importe quelle étape
  //   - Aucun état partiel possible
  //
  // Mode fallback (3 appels séquentiels) :
  //   - Si la RPC n'est pas déployée, en mode démo, ou en mode Electron
  //   - Risque d'état partiel si crash entre les étapes (mais cohérent au prochain run)
  const importStatus: 'success' | 'partial' | 'error' = errors.length === 0 && unmatched === 0
    ? 'success'
    : (enriched > 0 ? 'partial' : 'error');
  const reportJson = JSON.stringify({ errors: errors.slice(0, 50), unmatched });

  // Prépare le payload enrichi pour la RPC (id + tiers + label)
  const enrichedPayload = toUpdate.map((e) => ({
    id: Number(e.id),
    tiers: e.tiers || '',
    label: e.label || '',
  }));

  let importId: number;
  // Calculer le hash UNE fois pour le passer à la RPC ou au fallback.
  // Permet la détection de doublon ultérieure via findDuplicateImport.
  const fileHash = await computeFileHash(file);
  const atomic = dataProvider.importTiersAtomic
    ? await dataProvider.importTiersAtomic({
        orgId: opts.orgId,
        user: opts.user,
        fileName: file.name,
        fileHash,
        source: opts.source,
        count: enriched,
        rejected: errors.length + unmatched,
        status: importStatus,
        report: reportJson,
        enriched: enrichedPayload,
        unmatched: unmatchedRows,
      })
    : null;

  if (atomic) {
    importId = atomic.importId;
  } else {
    // Fallback séquentiel (Demo, Electron, ou RPC pas déployée)
    importId = await dataProvider.addImport({
      orgId: opts.orgId,
      date: Date.now(),
      user: opts.user,
      fileName: file.name,
      fileHash,
      source: opts.source,
      kind: 'TIERS',
      count: enriched,
      rejected: errors.length + unmatched,
      status: importStatus,
      report: reportJson,
    });
    if (toUpdate.length > 0) {
      await dataProvider.bulkUpsertGL(toUpdate);
    }
    if (unmatchedRows.length > 0) {
      const withImport = unmatchedRows.map((r) => ({ ...r, importId: Number(importId) }));
      try {
        await dataProvider.bulkInsertTiersUnmatched(withImport);
      } catch (e) {
        // Non bloquant : table fna_tiers_unmatched peut ne pas exister (migration 016
        // non appliquée). Le compteur unmatched reste exact dans le report.
        // eslint-disable-next-line no-console
        console.warn('[import-tiers] persistance unmatched échouée (non bloquant):', e);
      }
    }
  }

  // 4bis) STOCKER LE GRAND LIVRE TIERS comme livre auxiliaire — TOUTES les lignes,
  // indépendamment du matching avec le GL général. C'est désormais la source des
  // balances auxiliaires (groupées par compte collectif + code tiers), donc elles
  // fonctionnent même quand l'enrichissement du GL échoue (GL centralisé, écart de
  // date/pièce…). L'enrichissement du GL ci-dessus reste un "bonus" best-effort.
  // Non bloquant : si la migration 023 n'est pas appliquée, on continue (le report
  // reste exact). Journalisation : on rattache chaque ligne à sa période.
  if (dataProvider.bulkInsertGLTiers && tiersLines.length > 0) {
    try {
      let periods: Array<{ id: string; year: number; month: number }> = [];
      try { periods = await dataProvider.getPeriods(opts.orgId); } catch { /* périodes optionnelles */ }
      const periodByYM = new Map(periods.map((p) => [`${p.year}-${p.month}`, p.id]));
      const glTiersRows: Omit<GLTiersEntry, 'id'>[] = tiersLines.map((tl) => {
        const y = Number(tl.date.slice(0, 4));
        const m = Number(tl.date.slice(5, 7));
        return {
          orgId: opts.orgId,
          importId: Number(importId),
          periodId: periodByYM.get(`${y}-${m}`),
          date: tl.date,
          account: tl.account,
          codeTiers: tl.codeTiers,
          labelTiers: tl.labelTiers || undefined,
          label: tl.label || tl.labelTiers || undefined,
          debit: tl.debit,
          credit: tl.credit,
          journal: tl.journal || undefined,
          piece: tl.piece || undefined,
          category: categorizeTiersAccount(tl.account),
          createdAt: Date.now(),
        };
      });
      await dataProvider.bulkInsertGLTiers(glTiersRows);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[import-tiers] persistance GL Tiers échouée (non bloquant):', e);
    }
  }

  // Audit log : tracer chaque enrichissement (tiers ajouté, libellé éventuellement
  // mis à jour). Le log est chaîné SHA-256 par org et immuable (RLS append-only).
  // Non bloquant : si la migration 019 n'est pas appliquée, on continue.
  if (auditChanges.length > 0) {
    const withSource = auditChanges.map((a) => ({ ...a, sourceId: Number(importId) }));
    await logGLChanges(opts.orgId, withSource);
  }

  // ── 5) Contrôle de cohérence — DÉSACTIVÉ ───────────────────────────
  //
  // L'ancien contrôle agrégeait les soldes par compte collectif (401, 411…)
  // et les comparait à un solde GL aggrégé par racine de classe SYSCOHADA.
  // Deux problèmes :
  //   1. L'aggrégation par classe (2 premiers chiffres) faisait collisionner
  //      des comptes parents distincts : 410 et 411 ont la même classe "41"
  //      → même soldeGL affiché → faux positif d'écart sur l'un des deux.
  //   2. Sémantiquement, le rapport doit montrer le DÉTAIL par tier individuel
  //      (CLI001, FRN042…), pas une agrégation parent qui masque l'info.
  //
  // Aujourd'hui l'information utile est ailleurs :
  //   - "GL enrichies = N" dans le rapport (combien d'écritures matchées)
  //   - Tableau "Lignes non rapprochées" (chaque ligne tier orpheline avec
  //     son contexte complet pour arbitrage manuel)
  //   - Page Bal. aux. Clients / Fournisseurs (solde par tier individuel)
  //
  // On retourne donc un tableau vide pour ne pas casser l'API publique.
  const coherenceCheck: TiersImportReport['coherenceCheck'] = [];

  // Push vers Supabase en arrière-plan
  import('../db/supabaseSync').then(({ pushOrgToSupabase, pushGLToSupabase }) => {
    pushOrgToSupabase(opts.orgId).catch((e) => console.warn('[Sync] Push tiers org failed:', e));
    pushGLToSupabase(opts.orgId).catch((e) => console.warn('[Sync] Push tiers GL failed:', e));
  }).catch((e) => console.warn('[Sync] Module unavailable:', e));

  return {
    totalRows: rows.length,
    enriched,
    unmatched,
    skipped,
    errors,
    coherenceCheck,
  };
}

/**
 * Import en lot de PLUSIEURS fichiers GL Tiers, agrégés en un seul rapport.
 *
 * Cas d'usage : l'entreprise a un fichier tiers par catégorie (clients.csv,
 * fournisseurs.csv, personnel.csv...). Plutôt que de faire 3 imports séparés
 * (3 logs, 3 contrôles de cohérence indépendants), on agrège tout :
 *
 * - Lignes lues = somme des lignes de tous les fichiers
 * - Enriched / Unmatched / Skipped = sommes cumulées
 * - Erreurs préfixées par le nom du fichier source pour traçabilité
 * - Cohérence : agrégation par compte collectif sur tous les fichiers combinés
 *
 * Chaque fichier conserve son propre ImportLog ; le rapport retourné est la
 * vue consolidée pour l'UI.
 */
export async function importGLTiersBatch(
  files: File[],
  mapping: TiersMapping,
  opts: { orgId: string; user: string; source: string },
  onFileProgress?: (current: number, total: number, fileName: string) => void,
): Promise<TiersImportReport> {
  if (files.length === 0) {
    return { totalRows: 0, enriched: 0, unmatched: 0, skipped: 0, errors: [], coherenceCheck: [] };
  }
  // Mode mono-fichier : passe direct (sans overhead de cache)
  if (files.length === 1) {
    onFileProgress?.(1, 1, files[0].name);
    return importGLTiers(files[0], mapping, opts);
  }

  // Multi-fichiers : on charge le GL UNE SEULE FOIS au début + on le mute en
  // place après chaque enrichissement de fichier. Les fichiers suivants voient
  // ainsi l'état à jour (les écritures déjà enrichies sont reconnaissables par
  // leur `tiers` non null).
  const initialGL = await dataProvider.getGLEntries({ orgId: opts.orgId });
  const org = await dataProvider.getOrganization(opts.orgId);
  const cache: ImportTiersCache = {
    glEntries: initialGL,
    classifier: getClassifier(org?.coaSystem),
  };
  const combined: TiersImportReport = {
    totalRows: 0,
    enriched: 0,
    unmatched: 0,
    skipped: 0,
    errors: [],
    coherenceCheck: [], // toujours vide (cf. note dans importGLTiers)
  };

  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    onFileProgress?.(i + 1, files.length, f.name);
    const r = await importGLTiers(f, mapping, opts, cache);
    combined.totalRows += r.totalRows;
    combined.enriched += r.enriched;
    combined.unmatched += r.unmatched;
    combined.skipped += r.skipped;
    combined.errors.push(...r.errors.map((e) => ({ ...e, reason: `[${f.name}] ${e.reason}` })));
  }

  return combined;
}
