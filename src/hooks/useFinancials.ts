// Hooks qui calculent balance / états / ratios à la volée depuis Dexie
import { useLiveQuery } from 'dexie-react-hooks';
import { db, ImportLog, Organization, Period } from '../db/schema';
import { computeBalance } from '../engine/balance';
import { computeBilan, computeSIG } from '../engine/statements';
import { computeRatios } from '../engine/ratios';
import { computeMonthlyBilan, computeMonthlyCR } from '../engine/monthly';
import { computeCapitalVariation, computeMonthlyTFT, computeTAFIRE, computeTFT } from '../engine/flows';
import { computeBudgetActual, BudgetActualRow } from '../engine/budgetActual';
import { useApp } from '../store/app';
import { useSettings } from '../store/settings';

export function useOrganizations(): Organization[] {
  return useLiveQuery(() => db.organizations.toArray(), [], [] as Organization[]) as Organization[];
}

export function usePeriods(orgId: string | undefined): Period[] {
  return useLiveQuery(
    () => (orgId ? db.periods.where('orgId').equals(orgId).sortBy('month') : Promise.resolve([] as Period[])),
    [orgId], [] as Period[],
  );
}

export function useCurrentOrg() {
  const orgId = useApp((s) => s.currentOrgId);
  const orgs = useOrganizations();
  return orgs?.find((o) => o.id === orgId);
}

export function useImportsHistory(orgId: string): ImportLog[] {
  return useLiveQuery(
    () => db.imports.where('orgId').equals(orgId).reverse().sortBy('date'),
    [orgId], [] as ImportLog[],
  );
}

export function useBalance() {
  const { currentOrgId, currentYear, currentPeriodId } = useApp();
  return useLiveQuery(async () => {
    if (!currentOrgId) return [];
    const period = currentPeriodId ? await db.periods.get(currentPeriodId) : undefined;
    const uptoMonth = period?.month;
    return computeBalance({
      orgId: currentOrgId,
      year: currentYear,
      uptoMonth,
      includeOpening: true,
    });
  }, [currentOrgId, currentYear, currentPeriodId], []);
}

export function useStatements() {
  const balance = useBalance();
  if (!balance || balance.length === 0) {
    return { balance: [], bilan: null, cr: [], sig: null };
  }
  const bilan = computeBilan(balance);
  const { sig, cr } = computeSIG(balance);
  return { balance, bilan, cr, sig };
}

export function useRatios() {
  const balance = useBalance();
  const customTargets = useSettings((s) => s.ratioTargets);
  if (!balance || balance.length === 0) return [];
  return computeRatios(balance, customTargets);
}

export function useMonthlyCR() {
  const { currentOrgId, currentYear } = useApp();
  return useLiveQuery(
    () => (currentOrgId ? computeMonthlyCR(currentOrgId, currentYear) : Promise.resolve({ months: [], lines: [] })),
    [currentOrgId, currentYear], { months: [], lines: [] },
  );
}

export function useMonthlyBilan() {
  const { currentOrgId, currentYear } = useApp();
  return useLiveQuery(
    () => (currentOrgId ? computeMonthlyBilan(currentOrgId, currentYear) : Promise.resolve({ months: [], actif: [], passif: [] })),
    [currentOrgId, currentYear], { months: [], actif: [], passif: [] },
  );
}

export function useTFT() {
  const { currentOrgId, currentYear } = useApp();
  return useLiveQuery(
    () => (currentOrgId ? computeTFT(currentOrgId, currentYear) : Promise.resolve(null)),
    [currentOrgId, currentYear], null,
  );
}

export function useMonthlyTFT() {
  const { currentOrgId, currentYear } = useApp();
  return useLiveQuery(
    () => (currentOrgId ? computeMonthlyTFT(currentOrgId, currentYear) : Promise.resolve({ months: [], lines: [] })),
    [currentOrgId, currentYear], { months: [], lines: [] },
  );
}

export function useTAFIRE() {
  const { currentOrgId, currentYear } = useApp();
  return useLiveQuery(
    () => (currentOrgId ? computeTAFIRE(currentOrgId, currentYear) : Promise.resolve(null)),
    [currentOrgId, currentYear], null,
  );
}

export function useCapitalVariation() {
  const { currentOrgId, currentYear } = useApp();
  return useLiveQuery(
    () => (currentOrgId ? computeCapitalVariation(currentOrgId, currentYear) : Promise.resolve([])),
    [currentOrgId, currentYear], [],
  );
}

export function useBudgetActual(version?: string): BudgetActualRow[] {
  const { currentOrgId, currentYear } = useApp();
  return useLiveQuery(
    () => (currentOrgId ? computeBudgetActual(currentOrgId, currentYear, version) : Promise.resolve([] as BudgetActualRow[])),
    [currentOrgId, currentYear, version], [] as BudgetActualRow[],
  );
}

// KPIs mensuels sur l'année (pour graphiques)
export function useMonthlyCA() {
  const { currentOrgId, currentYear } = useApp();
  return useLiveQuery(async () => {
    if (!currentOrgId) return [];
    const periods = await db.periods.where('orgId').equals(currentOrgId).toArray();
    const thisYear = periods.filter((p) => p.year === currentYear && p.month >= 1 && p.month <= 12).sort((a, b) => a.month - b.month);
    const result: { mois: string; month: number; realise: number }[] = [];
    for (const p of thisYear) {
      const entries = await db.gl.where('periodId').equals(p.id).toArray();
      const ca = entries
        .filter((e) => e.account.startsWith('70') || e.account.startsWith('71') || e.account.startsWith('72') || e.account.startsWith('73'))
        .reduce((s, e) => s + (e.credit - e.debit), 0);
      result.push({ mois: p.label.substring(0, 3), month: p.month, realise: ca });
    }
    return result;
  }, [currentOrgId, currentYear], []);
}

export function useBudgetActualMonthly(version?: string) {
  const { currentOrgId, currentYear } = useApp();
  return useLiveQuery(
    async () => {
      if (!currentOrgId) return null;
      const { computeBudgetActualMonthly } = await import('../engine/budgetActual');
      return computeBudgetActualMonthly(currentOrgId, currentYear, version);
    },
    [currentOrgId, currentYear, version],
    null,
  );
}
