// Moteur de comptabilité analytique multi-axes — mapping, affectation, calculs
import { db, AnalyticAxis, AnalyticCode, AnalyticRule, AnalyticAssignment, GLEntry } from '../db/schema';

// ── CRUD Axes ──────────────────────────────────────────────────────────────
export async function getAxes(orgId: string): Promise<AnalyticAxis[]> {
  return db.analyticAxes.where('orgId').equals(orgId).sortBy('number');
}

export async function saveAxis(axis: AnalyticAxis): Promise<void> {
  await db.analyticAxes.put(axis);
}

export async function deleteAxis(id: string): Promise<void> {
  const codes = await db.analyticCodes.where('axisId').equals(id).toArray();
  const codeIds = new Set(codes.map((c) => c.id));
  await db.transaction('rw', [db.analyticAxes, db.analyticCodes, db.analyticAssignments, db.analyticRules], async () => {
    await db.analyticAssignments.filter((a) => codeIds.has(a.codeId)).delete();
    await db.analyticRules.filter((r) => codeIds.has(r.analyticCodeId)).delete();
    await db.analyticCodes.where('axisId').equals(id).delete();
    await db.analyticAxes.delete(id);
  });
}

// ── CRUD Codes ─────────────────────────────────────────────────────────────
export async function getCodes(orgId: string, axisId?: string): Promise<AnalyticCode[]> {
  let codes: AnalyticCode[];
  if (axisId) {
    codes = await db.analyticCodes.where({ orgId, axisId }).toArray();
  } else {
    codes = await db.analyticCodes.where('orgId').equals(orgId).toArray();
  }
  return codes.sort((a, b) => a.order - b.order || a.code.localeCompare(b.code));
}

export async function saveCode(code: AnalyticCode): Promise<void> {
  await db.analyticCodes.put(code);
}

export async function saveCodes(codes: AnalyticCode[]): Promise<void> {
  await db.analyticCodes.bulkPut(codes);
}

export async function deleteCode(id: string): Promise<void> {
  await db.transaction('rw', [db.analyticCodes, db.analyticAssignments], async () => {
    // Détacher les enfants
    await db.analyticCodes.where('parentId').equals(id).modify({ parentId: undefined });
    await db.analyticAssignments.where('codeId').equals(id).delete();
    await db.analyticCodes.delete(id);
  });
}

// ── CRUD Règles ────────────────────────────────────────────────────────────
export async function getRules(orgId: string): Promise<AnalyticRule[]> {
  return (await db.analyticRules.where('orgId').equals(orgId).toArray())
    .sort((a, b) => a.priority - b.priority);
}

export async function saveRule(rule: AnalyticRule): Promise<void> {
  await db.analyticRules.put(rule);
}

export async function deleteRule(id: string): Promise<void> {
  await db.analyticRules.delete(id);
}

export async function reorderRules(_orgId: string, orderedIds: string[]): Promise<void> {
  await db.transaction('rw', db.analyticRules, async () => {
    for (let i = 0; i < orderedIds.length; i++) {
      await db.analyticRules.update(orderedIds[i], { priority: i + 1 });
    }
  });
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
  const existing = await db.analyticAssignments.where('orgId').equals(orgId).toArray();
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

/** Applique les règles actives sur toutes les lignes non affectées */
export async function applyRules(orgId: string, year?: number): Promise<MappingReport> {
  const rules = (await getRules(orgId)).filter((r) => r.active);
  const entries = await loadEntries(orgId, year);
  const existing = await db.analyticAssignments.where('orgId').equals(orgId).toArray();
  const assignedSet = new Set(existing.map((a) => `${a.glEntryId}-${a.axisNumber}`));

  const newAssignments: AnalyticAssignment[] = [];
  const byRule = new Map<string, { name: string; count: number }>();
  const byMethod: Record<string, number> = {};

  for (const e of entries) {
    for (const rule of rules) {
      const key = `${e.id!}-${rule.targetAxis}`;
      if (assignedSet.has(key)) continue;
      if (evaluateCondition(e, rule)) {
        assignedSet.add(key);
        newAssignments.push({
          orgId, glEntryId: e.id!, axisNumber: rule.targetAxis,
          codeId: rule.analyticCodeId,
          method: conditionTypeToMethod(rule.conditionType),
          ruleId: rule.id, assignedAt: Date.now(),
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
    await db.analyticAssignments.bulkAdd(newAssignments);
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

/** Affectation manuelle d'une ou plusieurs lignes */
export async function assignManual(
  orgId: string, glEntryIds: number[], axisNumber: number, codeId: string,
): Promise<number> {
  const existing = await db.analyticAssignments.where('orgId').equals(orgId).toArray();
  const assignedSet = new Set(existing.map((a) => `${a.glEntryId}-${a.axisNumber}`));
  const toAdd: AnalyticAssignment[] = [];

  for (const id of glEntryIds) {
    const key = `${id}-${axisNumber}`;
    if (assignedSet.has(key)) {
      // Mettre à jour l'affectation existante
      const ex = existing.find((a) => a.glEntryId === id && a.axisNumber === axisNumber);
      if (ex?.id) await db.analyticAssignments.update(ex.id, { codeId, method: 'manual', assignedAt: Date.now(), ruleId: undefined });
    } else {
      toAdd.push({ orgId, glEntryId: id, axisNumber, codeId, method: 'manual', assignedAt: Date.now() });
    }
  }
  if (toAdd.length > 0) await db.analyticAssignments.bulkAdd(toAdd);
  return glEntryIds.length;
}

/** Supprimer toutes les affectations auto (garder les manuelles) */
export async function clearAutoAssignments(orgId: string): Promise<number> {
  const toDelete = await db.analyticAssignments.where('orgId').equals(orgId).filter((a) => a.method !== 'manual').toArray();
  await db.analyticAssignments.bulkDelete(toDelete.map((a) => a.id!));
  return toDelete.length;
}

// ── Requêtes analytiques ───────────────────────────────────────────────────
async function loadEntries(orgId: string, year?: number): Promise<GLEntry[]> {
  if (!year) return db.gl.where('orgId').equals(orgId).toArray();
  const periods = await db.periods.where('orgId').equals(orgId).toArray();
  const pIds = new Set(periods.filter((p) => p.year === year && p.month >= 1).map((p) => p.id));
  const all = await db.gl.where('orgId').equals(orgId).toArray();
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
  const entries = await loadEntries(orgId, year);
  const assignments = await db.analyticAssignments.where('orgId').equals(orgId).toArray();
  const codes = await db.analyticCodes.where('orgId').equals(orgId).toArray();
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

  // Budgets
  const budgets = await db.analyticBudgets.where('orgId').equals(orgId).toArray();
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
  const periods = await db.periods.where('orgId').equals(orgId).toArray();
  const periodMonth = new Map(periods.filter((p) => p.year === year && p.month >= 1).map((p) => [p.id, p.month]));
  const entries = await db.gl.where('orgId').equals(orgId).toArray();
  const assignments = await db.analyticAssignments.where('orgId').equals(orgId).toArray();
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
  const entries = await loadEntries(orgId, year);
  const assignments = await db.analyticAssignments.where('orgId').equals(orgId).toArray();
  const assigned = new Set(assignments.filter((a) => a.axisNumber === axisNumber).map((a) => a.glEntryId));
  return entries.filter((e) => !assigned.has(e.id!)).slice(0, limit);
}

/** Stats de couverture */
export async function getCoverageStats(orgId: string, year?: number): Promise<{
  total: number; assigned: number; unassigned: number; rate: number; byAxis: { axis: number; name: string; assigned: number; rate: number }[];
}> {
  const entries = await loadEntries(orgId, year);
  const assignments = await db.analyticAssignments.where('orgId').equals(orgId).toArray();
  const axes = await getAxes(orgId);
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
