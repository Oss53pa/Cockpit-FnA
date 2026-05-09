// Moteur de comptabilité analytique multi-axes — mapping, affectation, calculs
//
// Source de données : Supabase via dataProvider (obligatoire).
import type { AnalyticAxis, AnalyticCode, AnalyticRule, AnalyticAssignment, GLEntry, AnalyticBranch } from '../db/schema';
import { dataProvider } from '../db/provider';
import { inferBranch, isCodeCompatibleWithBranch } from './analyticBranch';

const uid = () => crypto.randomUUID();

// ── CRUD Axes ──────────────────────────────────────────────────────────────
export async function getAxes(orgId: string): Promise<AnalyticAxis[]> {
  const axes = await dataProvider.getAnalyticAxes(orgId);
  return [...axes].sort((a, b) => a.number - b.number);
}

export async function saveAxis(axis: AnalyticAxis): Promise<void> {
  await dataProvider.upsertAnalyticAxis(axis);
}

export async function deleteAxis(id: string): Promise<void> {
  // Cascade gérée par le DAL (codes + assignments + rules)
  await dataProvider.deleteAnalyticAxis(id);
}

// ── CRUD Codes ─────────────────────────────────────────────────────────────
export async function getCodes(orgId: string, axisId?: string): Promise<AnalyticCode[]> {
  const codes = await dataProvider.getAnalyticCodes(orgId, axisId);
  return [...codes].sort((a, b) => a.order - b.order || a.code.localeCompare(b.code));
}

export async function saveCode(code: AnalyticCode): Promise<void> {
  await dataProvider.upsertAnalyticCode(code);
}

export async function saveCodes(codes: AnalyticCode[]): Promise<void> {
  await dataProvider.bulkUpsertAnalyticCodes(codes);
}

export async function deleteCode(id: string): Promise<void> {
  await dataProvider.detachAnalyticChildren(id);
  await dataProvider.deleteAnalyticCode(id);
}

// ── CRUD Règles ────────────────────────────────────────────────────────────
export async function getRules(orgId: string): Promise<AnalyticRule[]> {
  const rules = await dataProvider.getAnalyticRules(orgId);
  return [...rules].sort((a, b) => a.priority - b.priority);
}

export async function saveRule(rule: AnalyticRule): Promise<void> {
  await dataProvider.upsertAnalyticRule(rule);
}

export async function deleteRule(id: string): Promise<void> {
  await dataProvider.deleteAnalyticRule(id);
}

export async function reorderRules(_orgId: string, orderedIds: string[]): Promise<void> {
  for (let i = 0; i < orderedIds.length; i++) {
    await dataProvider.updateAnalyticRulePriority(orderedIds[i], i + 1);
  }
}

// ── Moteur de mapping ──────────────────────────────────────────────────────
export type MappingReport = {
  totalLines: number;
  matched: number;
  unmatched: number;
  coverageRate: number;
  byRule: { ruleId: string; ruleName: string; count: number }[];
  byMethod: Record<string, number>;
};

function evaluateCondition(entry: GLEntry, rule: AnalyticRule): boolean {
  switch (rule.conditionType) {
    case 'direct_code':
      return (entry.analyticalSection ?? '').toLowerCase().startsWith(rule.conditionValue.toLowerCase());
    case 'label_contains':
      return entry.label.toLowerCase().includes(rule.conditionValue.toLowerCase());
    case 'account_range': {
      const [min, max] = rule.conditionValue.split('-');
      return entry.account >= min && entry.account <= (max ?? min);
    }
    case 'journal_eq':
      return entry.journal.toLowerCase() === rule.conditionValue.toLowerCase();
    case 'amount_between': {
      const [minA, maxA] = rule.conditionValue.split('-').map(Number);
      const amount = Math.max(entry.debit, entry.credit);
      return amount >= minA && amount <= maxA;
    }
    default:
      return false;
  }
}

function conditionTypeToMethod(ct: string): AnalyticAssignment['method'] {
  const map: Record<string, AnalyticAssignment['method']> = {
    direct_code: 'direct', label_contains: 'label', account_range: 'account',
    journal_eq: 'journal', amount_between: 'amount',
  };
  return map[ct] ?? 'manual';
}

/** Simule l'application des règles sans écrire en BDD */
export async function simulateRules(orgId: string, year?: number): Promise<MappingReport> {
  const rules = (await getRules(orgId)).filter((r) => r.active);
  const entries = await loadEntries(orgId, year);
  const existing = await dataProvider.getAnalyticAssignments(orgId);
  const assignedSet = new Set(existing.map((a) => `${a.glEntryId}-${a.axisNumber}`));

  const byRule = new Map<string, { name: string; count: number }>();
  const byMethod: Record<string, number> = {};
  let matched = 0;

  for (const e of entries) {
    for (const rule of rules) {
      const key = `${e.id!}-${rule.targetAxis}`;
      if (assignedSet.has(key)) continue;
      if (evaluateCondition(e, rule)) {
        matched++;
        assignedSet.add(key);
        const cur = byRule.get(rule.id) ?? { name: rule.name, count: 0 };
        cur.count++;
        byRule.set(rule.id, cur);
        const method = conditionTypeToMethod(rule.conditionType);
        byMethod[method] = (byMethod[method] ?? 0) + 1;
        break;
      }
    }
  }

  return {
    totalLines: entries.length,
    matched,
    unmatched: entries.length - matched - existing.length,
    coverageRate: entries.length > 0 ? Math.round(((matched + existing.length) / entries.length) * 100) : 0,
    byRule: [...byRule.entries()].map(([ruleId, v]) => ({ ruleId, ruleName: v.name, count: v.count }))
      .sort((a, b) => b.count - a.count),
    byMethod,
  };
}

/** Applique les règles actives sur toutes les lignes non affectées (validation de branche WBS) */
export async function applyRules(orgId: string, year?: number): Promise<MappingReport> {
  const rules = (await getRules(orgId)).filter((r) => r.active);
  const entries = await loadEntries(orgId, year);
  const existing = await dataProvider.getAnalyticAssignments(orgId);
  const assignedSet = new Set(existing.map((a) => `${a.glEntryId}-${a.axisNumber}`));

  // Codes pour valider la branche
  const codes = await dataProvider.getAnalyticCodes(orgId);
  const codesById = new Map<string, AnalyticCode>(codes.map((c) => [c.id, c]));

  const newAssignments: AnalyticAssignment[] = [];
  const byRule = new Map<string, { name: string; count: number }>();
  const byMethod: Record<string, number> = {};

  for (const e of entries) {
    const lineAssignments = existing.filter((a) => a.glEntryId === e.id);
    const lineBranch = inferBranch(e, { assignments: lineAssignments });
    for (const rule of rules) {
      const key = `${e.id!}-${rule.targetAxis}`;
      if (assignedSet.has(key)) continue;
      if (evaluateCondition(e, rule)) {
        // Validation branche : skip si le code de la règle est typé et incompatible
        const ruleCode = codesById.get(rule.analyticCodeId);
        if (ruleCode?.branch && !isCodeCompatibleWithBranch(ruleCode.branch, lineBranch)) {
          continue; // pas un match valide pour cette ligne, on tente la règle suivante
        }
        assignedSet.add(key);
        newAssignments.push({
          orgId, glEntryId: e.id!, axisNumber: rule.targetAxis,
          codeId: rule.analyticCodeId,
          method: conditionTypeToMethod(rule.conditionType),
          ruleId: rule.id, assignedAt: Date.now(),
          branch: lineBranch,
        });
        const cur = byRule.get(rule.id) ?? { name: rule.name, count: 0 };
        cur.count++;
        byRule.set(rule.id, cur);
        const method = conditionTypeToMethod(rule.conditionType);
        byMethod[method] = (byMethod[method] ?? 0) + 1;
        break;
      }
    }
  }

  if (newAssignments.length > 0) {
    await dataProvider.bulkInsertAnalyticAssignments(newAssignments);
  }

  return {
    totalLines: entries.length,
    matched: newAssignments.length,
    unmatched: entries.length - newAssignments.length - existing.length,
    coverageRate: entries.length > 0 ? Math.round(((newAssignments.length + existing.length) / entries.length) * 100) : 0,
    byRule: [...byRule.entries()].map(([ruleId, v]) => ({ ruleId, ruleName: v.name, count: v.count }))
      .sort((a, b) => b.count - a.count),
    byMethod,
  };
}

/** Affectation manuelle d'une ou plusieurs lignes (avec validation de branche WBS) */
export async function assignManual(
  orgId: string, glEntryIds: number[], axisNumber: number, codeId: string,
): Promise<{ assigned: number; rejected: number; rejectedReasons: string[] }> {
  const existing = await dataProvider.getAnalyticAssignments(orgId);
  const assignedSet = new Set(existing.map((a) => `${a.glEntryId}-${a.axisNumber}`));

  // Récupère les codes pour valider la branche
  const codes = await dataProvider.getAnalyticCodes(orgId);
  const targetCode = codes.find((c) => c.id === codeId);

  // Récupère les lignes GL pour calculer la branche de chacune
  const allEntries = await dataProvider.getGLEntries({ orgId });
  const entriesById = new Map<number, GLEntry>(
    allEntries.filter((e) => e.id !== undefined).map((e) => [e.id!, e]),
  );

  const toAdd: AnalyticAssignment[] = [];
  const rejectedReasons: string[] = [];
  let rejected = 0;

  for (const id of glEntryIds) {
    const entry = entriesById.get(id);
    if (!entry) continue;

    // Détermine la branche de la ligne (en tenant compte des affectations existantes)
    const lineAssignments = existing.filter((a) => a.glEntryId === id);
    const lineBranch = inferBranch(entry, { assignments: lineAssignments });

    // Validation : le code peut-il s'appliquer sur cette branche ?
    if (targetCode?.branch && !isCodeCompatibleWithBranch(targetCode.branch, lineBranch)) {
      rejected++;
      rejectedReasons.push(
        `Ligne #${id} (${entry.account}, branche=${lineBranch ?? '—'}) : code "${targetCode.code}" réservé à "${targetCode.branch}".`,
      );
      continue;
    }

    const key = `${id}-${axisNumber}`;
    if (assignedSet.has(key)) {
      const ex = existing.find((a) => a.glEntryId === id && a.axisNumber === axisNumber);
      if (ex?.id) {
        await dataProvider.updateAnalyticAssignment(ex.id, {
          codeId, method: 'manual', assignedAt: Date.now(), ruleId: undefined, branch: lineBranch,
        });
      }
    } else {
      toAdd.push({
        orgId, glEntryId: id, axisNumber, codeId,
        method: 'manual', assignedAt: Date.now(), branch: lineBranch,
      });
    }
  }
  if (toAdd.length > 0) await dataProvider.bulkInsertAnalyticAssignments(toAdd);
  return { assigned: glEntryIds.length - rejected, rejected, rejectedReasons };
}

// ── Import codes analytiques (CSV/Excel) ────────────────────────────────────
export type AnalyticCodeImportRow = {
  axe: number;
  code: string;
  shortLabel: string;
  longLabel?: string;
  parent?: string;
  branch?: AnalyticBranch;
  active?: boolean;
};

export type AnalyticCodeImportReport = {
  total: number;
  inserted: number;
  updated: number;
  rejected: number;
  errors: { row: number; reason: string }[];
};

/**
 * Importe en bulk des codes analytiques.
 *
 * - Mappe les rows brutes (depuis Excel/CSV) vers AnalyticCode.
 * - Résout l'axe via le numéro (1-5) en cherchant l'axisId correspondant.
 * - Résout le code parent en deuxième passe (après que tous les codes existent).
 * - Validation : axe inconnu, code vide, branche invalide → rejet.
 *
 * Idempotent : un code (axisId + code) déjà existant est mis à jour, pas dupliqué.
 */
export async function importAnalyticCodes(
  orgId: string,
  rows: AnalyticCodeImportRow[],
): Promise<AnalyticCodeImportReport> {
  const report: AnalyticCodeImportReport = {
    total: rows.length, inserted: 0, updated: 0, rejected: 0, errors: [],
  };

  const axes = await dataProvider.getAnalyticAxes(orgId);
  const axisByNumber = new Map<number, AnalyticAxis>(axes.map((a) => [a.number, a]));

  const existing = await dataProvider.getAnalyticCodes(orgId);
  const existingByAxisAndCode = new Map<string, AnalyticCode>();
  for (const c of existing) {
    existingByAxisAndCode.set(`${c.axisId}|${c.code.toUpperCase()}`, c);
  }

  // Passe 1 : insère / met à jour les codes (sans parentId)
  // Aligne `rowsAccepted[i]` avec `toUpsert[i]` pour la résolution parent en passe 2.
  const toUpsert: AnalyticCode[] = [];
  const rowsAccepted: AnalyticCodeImportRow[] = [];
  const codeRefByCode = new Map<string, string>(); // code (UPPER) → id
  for (const c of existing) codeRefByCode.set(c.code.toUpperCase(), c.id);

  rows.forEach((row, idx) => {
    const lineNum = idx + 2; // +2 car header = ligne 1
    if (!row.code || !row.code.trim()) {
      report.rejected++;
      report.errors.push({ row: lineNum, reason: 'Code vide' });
      return;
    }
    const axis = axisByNumber.get(row.axe);
    if (!axis) {
      report.rejected++;
      report.errors.push({ row: lineNum, reason: `Axe ${row.axe} inconnu — créez l'axe avant l'import` });
      return;
    }
    if (row.branch && !['revenue', 'project_cost', 'overhead'].includes(row.branch)) {
      report.rejected++;
      report.errors.push({ row: lineNum, reason: `Branche invalide "${row.branch}"` });
      return;
    }

    const codeUpper = row.code.toUpperCase().trim();
    const existingCode = existingByAxisAndCode.get(`${axis.id}|${codeUpper}`);

    const newCode: AnalyticCode = {
      id: existingCode?.id ?? uid(),
      orgId,
      axisId: axis.id,
      code: row.code.trim(),
      shortLabel: row.shortLabel?.trim() || row.code.trim(),
      longLabel: row.longLabel?.trim() ?? '',
      parentId: undefined,
      active: row.active ?? true,
      order: existingCode?.order ?? toUpsert.length,
      branch: row.branch,
    };
    toUpsert.push(newCode);
    rowsAccepted.push(row);
    codeRefByCode.set(codeUpper, newCode.id);
    if (existingCode) report.updated++;
    else report.inserted++;
  });

  // Passe 2 : résout les parentId
  for (let i = 0; i < toUpsert.length; i++) {
    const row = rowsAccepted[i];
    if (row.parent && row.parent.trim()) {
      const parentId = codeRefByCode.get(row.parent.toUpperCase().trim());
      if (parentId && parentId !== toUpsert[i].id) {
        toUpsert[i].parentId = parentId;
      }
    }
  }

  if (toUpsert.length > 0) {
    await dataProvider.bulkUpsertAnalyticCodes(toUpsert);
  }

  return report;
}

/** Supprimer toutes les affectations auto (garder les manuelles) */
export async function clearAutoAssignments(orgId: string): Promise<number> {
  const all = await dataProvider.getAnalyticAssignments(orgId);
  const auto = all.filter((a) => a.method !== 'manual');
  await dataProvider.deleteAnalyticAssignmentsByOrgFilter(orgId, (a) => a.method !== 'manual');
  return auto.length;
}

// ── Requêtes analytiques ───────────────────────────────────────────────────
async function loadEntries(orgId: string, year?: number): Promise<GLEntry[]> {
  if (!year) return dataProvider.getGLEntries({ orgId });
  const [periods, all] = await Promise.all([
    dataProvider.getPeriods(orgId),
    dataProvider.getGLEntries({ orgId }),
  ]);
  const pIds = new Set(periods.filter((p) => p.year === year && p.month >= 1).map((p) => p.id));
  return all.filter((e) => pIds.has(e.periodId));
}

export type AnalyticDashRow = {
  codeId: string;
  code: string;
  label: string;
  axisNumber: number;
  charges: number;
  produits: number;
  resultat: number;
  budget: number;
  ecart: number;
  pctTotal: number;
};

/** Dashboard analytique par axe */
export async function computeAnalyticDashboard(
  orgId: string, year: number, axisNumber: number,
): Promise<AnalyticDashRow[]> {
  const [entries, assignments, codes, budgets] = await Promise.all([
    loadEntries(orgId, year),
    dataProvider.getAnalyticAssignments(orgId),
    dataProvider.getAnalyticCodes(orgId),
    dataProvider.getAnalyticBudgets(orgId),
  ]);
  const codeMap = new Map(codes.map((c) => [c.id, c]));

  // Index assignments par glEntryId pour l'axe demandé
  const assignMap = new Map<number, string>(); // glEntryId → codeId
  for (const a of assignments) {
    if (a.axisNumber === axisNumber) assignMap.set(a.glEntryId, a.codeId);
  }

  // Agréger par code
  const agg = new Map<string, { charges: number; produits: number }>();
  for (const e of entries) {
    const codeId = assignMap.get(e.id!) ?? '__unassigned__';
    const cur = agg.get(codeId) ?? { charges: 0, produits: 0 };
    const c = e.account[0];
    if (c === '6' || ['81', '83', '85', '87', '89'].some((p) => e.account.startsWith(p))) cur.charges += e.debit - e.credit;
    if (c === '7' || ['82', '84', '86', '88'].some((p) => e.account.startsWith(p))) cur.produits += e.credit - e.debit;
    agg.set(codeId, cur);
  }

  // Budgets pour l'année
  const budgetMap = new Map<string, number>();
  for (const b of budgets) {
    if (b.period.startsWith(String(year))) {
      budgetMap.set(b.codeId, (budgetMap.get(b.codeId) ?? 0) + b.amount);
    }
  }

  const totalCharges = [...agg.values()].reduce((s, v) => s + v.charges, 0) || 1;

  const rows: AnalyticDashRow[] = [];
  for (const [codeId, v] of agg) {
    const code = codeMap.get(codeId);
    const budget = budgetMap.get(codeId) ?? 0;
    rows.push({
      codeId,
      code: code?.code ?? (codeId === '__unassigned__' ? '—' : codeId),
      label: code?.shortLabel ?? (codeId === '__unassigned__' ? 'Non affecté' : 'Code inconnu'),
      axisNumber,
      charges: v.charges,
      produits: v.produits,
      resultat: v.produits - v.charges,
      budget,
      ecart: budget > 0 ? v.charges - budget : 0,
      pctTotal: Math.round((v.charges / totalCharges) * 100),
    });
  }
  return rows.sort((a, b) => b.charges - a.charges);
}

/** Évolution mensuelle par code analytique */
export async function computeAnalyticMonthly(
  orgId: string, year: number, axisNumber: number, codeId: string,
): Promise<{ months: string[]; charges: number[]; produits: number[] }> {
  const MONTHS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
  const [periods, entries, assignments] = await Promise.all([
    dataProvider.getPeriods(orgId),
    dataProvider.getGLEntries({ orgId }),
    dataProvider.getAnalyticAssignments(orgId),
  ]);
  const periodMonth = new Map(periods.filter((p) => p.year === year && p.month >= 1).map((p) => [p.id, p.month]));
  const assignMap = new Map<number, string>();
  for (const a of assignments) {
    if (a.axisNumber === axisNumber) assignMap.set(a.glEntryId, a.codeId);
  }

  const charges = Array(12).fill(0);
  const produits = Array(12).fill(0);

  for (const e of entries) {
    const m = periodMonth.get(e.periodId);
    if (m === undefined) continue;
    const assigned = assignMap.get(e.id!);
    if (codeId === '__unassigned__' ? assigned !== undefined : assigned !== codeId) continue;
    const c = e.account[0];
    if (c === '6') charges[m - 1] += e.debit - e.credit;
    if (c === '7') produits[m - 1] += e.credit - e.debit;
  }
  return { months: MONTHS, charges, produits };
}

/** Lignes GL non affectées pour un axe donné */
export async function getUnmappedLines(
  orgId: string, year: number, axisNumber: number, limit = 200,
): Promise<GLEntry[]> {
  const [entries, assignments] = await Promise.all([
    loadEntries(orgId, year),
    dataProvider.getAnalyticAssignments(orgId),
  ]);
  const assigned = new Set(assignments.filter((a) => a.axisNumber === axisNumber).map((a) => a.glEntryId));
  return entries.filter((e) => !assigned.has(e.id!)).slice(0, limit);
}

/** Stats de couverture */
export async function getCoverageStats(orgId: string, year?: number): Promise<{
  total: number; assigned: number; unassigned: number; rate: number; byAxis: { axis: number; name: string; assigned: number; rate: number }[];
}> {
  const [entries, assignments, axes] = await Promise.all([
    loadEntries(orgId, year),
    dataProvider.getAnalyticAssignments(orgId),
    getAxes(orgId),
  ]);
  const total = entries.length;

  const allAssigned = new Set(assignments.map((a) => a.glEntryId));
  const assigned = [...allAssigned].filter((id) => entries.some((e) => e.id === id)).length;

  const byAxis = axes.filter((a) => a.active).map((ax) => {
    const axAssigned = new Set(assignments.filter((a) => a.axisNumber === ax.number).map((a) => a.glEntryId));
    const count = [...axAssigned].filter((id) => entries.some((e) => e.id === id)).length;
    return { axis: ax.number, name: ax.name, assigned: count, rate: total > 0 ? Math.round((count / total) * 100) : 0 };
  });

  return { total, assigned, unassigned: total - assigned, rate: total > 0 ? Math.round((assigned / total) * 100) : 0, byAxis };
}
