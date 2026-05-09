/**
 * analyticDashboards.ts — helpers de calcul partagés par les dashboards
 * analytiques D03 / D04 / D05 / D06 / D09.
 *
 * Toutes les fonctions partent du dataProvider (compatible démo via DemoProvider)
 * et reposent sur :
 *   - GLEntry (écritures)
 *   - AnalyticAssignment (affectations multi-axes)
 *   - AnalyticCode (référentiel)
 *   - inferBranch (sémantique WBS)
 *
 * Pas de cache : chaque dashboard fait son propre fetch (volume raisonnable
 * pour une PME, < 50k lignes). À refactorer en vues matérialisées Supabase
 * une fois la volumétrie dépasse le seuil (cf. Phase 2).
 */
import { dataProvider } from '../db/provider';
import type { GLEntry, AnalyticAssignment, AnalyticCode, AnalyticBranch } from '../db/schema';
import { inferBranch } from './analyticBranch';

export interface AnalyticContext {
  entries: GLEntry[];
  assignments: AnalyticAssignment[];
  codes: AnalyticCode[];
  codeById: Map<string, AnalyticCode>;
  assignmentsByEntry: Map<number, AnalyticAssignment[]>;
}

/**
 * Charge le contexte analytique pour une org / un exercice.
 * Renvoie les entries du year + tous les assignments + tous les codes.
 */
export async function loadAnalyticContext(orgId: string, year: number): Promise<AnalyticContext> {
  const [periods, allEntries, assignments, codes] = await Promise.all([
    dataProvider.getPeriods(orgId),
    dataProvider.getGLEntries({ orgId }),
    dataProvider.getAnalyticAssignments(orgId),
    dataProvider.getAnalyticCodes(orgId),
  ]);
  const yearPeriodIds = new Set(periods.filter((p) => p.year === year && p.month >= 1).map((p) => p.id));
  const entries = allEntries.filter((e) => yearPeriodIds.has(e.periodId));

  const codeById = new Map<string, AnalyticCode>(codes.map((c) => [c.id, c]));
  const assignmentsByEntry = new Map<number, AnalyticAssignment[]>();
  for (const a of assignments) {
    if (!a.glEntryId) continue;
    const arr = assignmentsByEntry.get(a.glEntryId) ?? [];
    arr.push(a);
    assignmentsByEntry.set(a.glEntryId, arr);
  }
  return { entries, assignments, codes, codeById, assignmentsByEntry };
}

/**
 * Pour chaque entry : retourne (branch, signedAmount, codeByAxis).
 * signedAmount > 0 (positif) — direction selon la branche
 *   - revenue : credit - debit (produit)
 *   - autres  : debit - credit (charge)
 */
export interface AnalyticEntryView {
  entry: GLEntry;
  branch: AnalyticBranch | undefined;
  amount: number;
  codeByAxis: Map<number, AnalyticCode>;
  month: number;
}

export function viewEntries(ctx: AnalyticContext, periods?: { id: string; month: number }[]): AnalyticEntryView[] {
  const monthByPeriod = new Map<string, number>();
  if (periods) for (const p of periods) monthByPeriod.set(p.id, p.month);
  const out: AnalyticEntryView[] = [];
  for (const entry of ctx.entries) {
    const ass = ctx.assignmentsByEntry.get(entry.id ?? -1) ?? [];
    const branch = inferBranch(entry, { assignments: ass });
    if (!branch) continue;
    const amount = branch === 'revenue'
      ? (entry.credit - entry.debit)
      : (entry.debit - entry.credit);
    if (Math.abs(amount) < 0.005) continue;
    const codeByAxis = new Map<number, AnalyticCode>();
    for (const a of ass) {
      const c = ctx.codeById.get(a.codeId);
      if (c) codeByAxis.set(a.axisNumber, c);
    }
    out.push({
      entry, branch, amount, codeByAxis,
      month: monthByPeriod.get(entry.periodId) ?? (parseInt(entry.date.substring(5, 7), 10) || 0),
    });
  }
  return out;
}

/**
 * Cumul par code sur un axe donné, filtré par branche optionnelle.
 */
export function aggregateByAxisCode(
  views: AnalyticEntryView[],
  axisNumber: number,
  branchFilter?: AnalyticBranch | AnalyticBranch[],
): Map<string, { code: string; label: string; amount: number; lines: number; monthly: number[] }> {
  const branches = branchFilter ? (Array.isArray(branchFilter) ? branchFilter : [branchFilter]) : null;
  const out = new Map<string, { code: string; label: string; amount: number; lines: number; monthly: number[] }>();
  for (const v of views) {
    if (branches && (!v.branch || !branches.includes(v.branch))) continue;
    const code = v.codeByAxis.get(axisNumber);
    if (!code) continue;
    let row = out.get(code.id);
    if (!row) {
      row = { code: code.code, label: code.shortLabel, amount: 0, lines: 0, monthly: Array(13).fill(0) };
      out.set(code.id, row);
    }
    row.amount += v.amount;
    row.lines += 1;
    if (v.month >= 1 && v.month <= 12) row.monthly[v.month] += v.amount;
  }
  return out;
}

/**
 * Stats de couverture analytique pour un dashboard de qualité (D09).
 * Retourne :
 *   - total / assigned / coverageRate (par défaut sur classes 6/7)
 *   - byJournal : taux par journal
 *   - byAccountClass : taux par classe comptable (1..8)
 *   - byMonth : taux par mois
 *   - unassigned : list des écritures non affectées (top 50)
 */
export function computeCoverageBreakdown(ctx: AnalyticContext, periods: { id: string; month: number; label: string }[]): {
  total: number;
  assigned: number;
  coverageRate: number;
  byJournal: { journal: string; total: number; assigned: number; rate: number }[];
  byClass: { class: string; total: number; assigned: number; rate: number }[];
  byMonth: { month: number; label: string; rate: number; total: number; assigned: number }[];
  unassigned: GLEntry[];
} {
  const monthByPeriod = new Map<string, { month: number; label: string }>();
  for (const p of periods) monthByPeriod.set(p.id, { month: p.month, label: p.label });

  const eligible = ctx.entries.filter((e) =>
    e.account.startsWith('6') || e.account.startsWith('7'),
  );
  const assignedSet = new Set(
    ctx.assignments.filter((a) => a.glEntryId !== undefined).map((a) => a.glEntryId!),
  );

  const byJournal = new Map<string, { total: number; assigned: number }>();
  const byClass = new Map<string, { total: number; assigned: number }>();
  const byMonth = new Map<number, { label: string; total: number; assigned: number }>();
  const unassigned: GLEntry[] = [];

  let total = 0;
  let assigned = 0;
  for (const e of eligible) {
    total++;
    const isAssigned = e.id !== undefined && assignedSet.has(e.id);
    if (isAssigned) assigned++;
    else unassigned.push(e);

    const j = byJournal.get(e.journal) ?? { total: 0, assigned: 0 };
    j.total++; if (isAssigned) j.assigned++;
    byJournal.set(e.journal, j);

    const cls = e.account[0];
    const c = byClass.get(cls) ?? { total: 0, assigned: 0 };
    c.total++; if (isAssigned) c.assigned++;
    byClass.set(cls, c);

    const m = monthByPeriod.get(e.periodId);
    if (m) {
      const mo = byMonth.get(m.month) ?? { label: m.label, total: 0, assigned: 0 };
      mo.total++; if (isAssigned) mo.assigned++;
      byMonth.set(m.month, mo);
    }
  }

  return {
    total, assigned,
    coverageRate: total > 0 ? Math.round((assigned / total) * 100) : 0,
    byJournal: Array.from(byJournal.entries())
      .map(([journal, v]) => ({ journal, ...v, rate: v.total > 0 ? Math.round((v.assigned / v.total) * 100) : 0 }))
      .sort((a, b) => b.total - a.total),
    byClass: Array.from(byClass.entries())
      .map(([cls, v]) => ({ class: cls, ...v, rate: v.total > 0 ? Math.round((v.assigned / v.total) * 100) : 0 }))
      .sort((a, b) => a.class.localeCompare(b.class)),
    byMonth: Array.from(byMonth.entries())
      .map(([month, v]) => ({ month, label: v.label, total: v.total, assigned: v.assigned, rate: v.total > 0 ? Math.round((v.assigned / v.total) * 100) : 0 }))
      .sort((a, b) => a.month - b.month),
    unassigned: unassigned.slice(0, 50),
  };
}
