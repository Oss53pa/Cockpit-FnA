// Hooks qui calculent balance / états / ratios à la volée depuis Supabase.
//
// Source de données : Supabase via dataProvider (obligatoire).
// Pour la réactivité : les composants qui modifient les données doivent appeler
// `invalidateCloudData('imports')`, `'budgets'`, etc. après leur écriture.
//
// MODE DÉMO : si `localStorage['demo-mode']==='1'` ET `currentOrgId` commence
// par `demo-org`, les hooks renvoient les fixtures hardcodées de demoFixtures.ts
// (pas de fetch dataProvider). Permet la démo sans authentification ni Supabase.
import { useCloudData } from './useCloudData';
import type { ImportLog, Organization, Period } from '../db/schema';
import { dataProvider } from '../db/provider';
import { computeBalance } from '../engine/balance';
import { computeBilan, computeSIG } from '../engine/statements';
import { computeRatios } from '../engine/ratios';
import { computeMonthlyBilan, computeMonthlyCR } from '../engine/monthly';
import { computeCapitalVariation, computeMonthlyTFT, computeTAFIRE, computeTFT } from '../engine/flows';
import { computeBudgetActual, BudgetActualRow } from '../engine/budgetActual';
import { useApp } from '../store/app';
import { useSettings } from '../store/settings';
import {
  isDemoActive,
  DEMO_ORG, DEMO_BALANCE, DEMO_SIG, DEMO_CR, DEMO_BILAN,
  DEMO_RATIOS, DEMO_MONTHLY_CA, DEMO_PERIODS, DEMO_IMPORTS,
} from '../engine/demoFixtures';

export function useOrganizations(): Organization[] {
  const orgId = useApp((s) => s.currentOrgId);
  const { data } = useCloudData<Organization[]>(
    () => dataProvider.getOrganizations(),
    [],
    { initial: [] as Organization[], tag: 'organizations' },
  );
  // Mode démo : injecter l'org démo si pas déjà présente
  if (isDemoActive(orgId)) {
    const realOrgId = orgId || DEMO_ORG.id;
    const demoOrg: Organization = { ...DEMO_ORG, id: realOrgId };
    const exists = data.some((o) => o.id === realOrgId);
    return exists ? data : [demoOrg, ...data];
  }
  return data;
}

export function usePeriods(orgId: string | undefined): Period[] {
  const { data } = useCloudData<Period[]>(
    () => orgId ? dataProvider.getPeriods(orgId) : Promise.resolve([] as Period[]),
    [orgId],
    { initial: [] as Period[], tag: 'periods' },
  );
  if (isDemoActive(orgId) && data.length === 0) {
    return DEMO_PERIODS.map((p) => ({ ...p, orgId: orgId || p.orgId })) as Period[];
  }
  return data;
}

export function useCurrentOrg() {
  const orgId = useApp((s) => s.currentOrgId);
  const orgs = useOrganizations();
  return orgs?.find((o) => o.id === orgId);
}

export function useImportsHistory(orgId: string, kind?: ImportLog['kind'] | ImportLog['kind'][]): ImportLog[] {
  const kindKey = Array.isArray(kind) ? kind.join(',') : kind;
  const { data } = useCloudData<ImportLog[]>(
    async () => {
      if (!orgId) return [] as ImportLog[];
      if (isDemoActive(orgId)) {
        const all = DEMO_IMPORTS.map((i) => ({ ...i, orgId })) as unknown as ImportLog[];
        if (!kind) return all;
        const kinds = Array.isArray(kind) ? new Set(kind) : new Set([kind]);
        return all.filter((i) => kinds.has(i.kind));
      }
      const all = await dataProvider.getImports(orgId);
      if (!kind) return all;
      const kinds = Array.isArray(kind) ? new Set(kind) : new Set([kind]);
      return all.filter((i) => kinds.has(i.kind));
    },
    [orgId, kindKey],
    { initial: [] as ImportLog[], tag: 'imports' },
  );
  return data;
}

/**
 * Résout la sélection d'import courante (store) en un importId concret
 * à passer à computeBalance.
 */
export function useResolvedImportId(): string | undefined {
  const currentOrgId = useApp((s) => s.currentOrgId);
  const currentImport = useApp((s) => s.currentImport);
  const { data } = useCloudData<string | undefined>(
    async () => {
      if (!currentOrgId) return 'all';
      if (currentImport === 'all') return 'all';
      if (currentImport === 'latest') {
        const imports = await dataProvider.getImports(currentOrgId);
        const glImports = imports.filter((i) => i.kind === 'GL');
        if (!glImports.length) return 'all';
        return String(glImports[0].id); // getImports retourne en ordre desc
      }
      return currentImport;
    },
    [currentOrgId, currentImport],
    { initial: undefined, tag: 'imports' },
  );
  return data;
}

/**
 * Balance cumulée (avec à-nouveaux) — pour Bilan et vues d'état cumulé.
 */
export function useBalance() {
  const { currentOrgId, currentYear, currentPeriodId, fromMonth, toMonth } = useApp();
  const importId = useResolvedImportId();
  const { data } = useCloudData(
    async () => {
      if (!currentOrgId) return [];
      if (importId === undefined) return [];
      const periods = currentPeriodId ? await dataProvider.getPeriods(currentOrgId) : [];
      const period = periods.find((p) => p.id === currentPeriodId);
      const uptoMonth = period?.month ?? toMonth;
      return computeBalance({
        orgId: currentOrgId,
        year: currentYear,
        fromMonth,
        uptoMonth,
        includeOpening: true,
        importId,
      });
    },
    [currentOrgId, currentYear, currentPeriodId, fromMonth, toMonth, importId],
    { initial: [], tag: ['gl', 'periods'] },
  );
  if (isDemoActive(currentOrgId) && (!data || data.length === 0)) return DEMO_BALANCE;
  return data;
}

/**
 * Balance des MOUVEMENTS de l'exercice (sans à-nouveaux) — pour CR et SIG.
 */
export function useBalanceMovements() {
  const { currentOrgId, currentYear, currentPeriodId, fromMonth, toMonth } = useApp();
  const importId = useResolvedImportId();
  const { data } = useCloudData(
    async () => {
      if (!currentOrgId) return [];
      if (importId === undefined) return [];
      const periods = currentPeriodId ? await dataProvider.getPeriods(currentOrgId) : [];
      const period = periods.find((p) => p.id === currentPeriodId);
      const uptoMonth = period?.month ?? toMonth;
      return computeBalance({
        orgId: currentOrgId,
        year: currentYear,
        fromMonth,
        uptoMonth,
        includeOpening: false,
        importId,
      });
    },
    [currentOrgId, currentYear, currentPeriodId, fromMonth, toMonth, importId],
    { initial: [], tag: ['gl', 'periods'] },
  );
  if (isDemoActive(currentOrgId) && (!data || data.length === 0)) {
    // En démo, utiliser uniquement les comptes de gestion (6/7) pour les mouvements
    return DEMO_BALANCE.filter((b) => b.account.startsWith('6') || b.account.startsWith('7'));
  }
  return data;
}

export function useStatements() {
  const orgId = useApp((s) => s.currentOrgId);
  const balance = useBalance();
  const movements = useBalanceMovements();

  // Démo : retourner directement les fixtures pré-calculées
  if (isDemoActive(orgId)) {
    return {
      balance: DEMO_BALANCE,
      movements: DEMO_BALANCE.filter((b) => b.account.startsWith('6') || b.account.startsWith('7')),
      bilan: DEMO_BILAN,
      cr: DEMO_CR,
      sig: DEMO_SIG,
      unclassifiedAccounts: [],
    };
  }

  if (!balance || balance.length === 0) {
    return { balance: [], movements: [], bilan: null, cr: [], sig: null, unclassifiedAccounts: [] };
  }
  const bilan = computeBilan(balance, movements);
  const src = movements.length > 0 ? movements : balance;
  const { sig, cr } = computeSIG(src);
  return { balance, movements, bilan, cr, sig, unclassifiedAccounts: bilan.unclassifiedAccounts };
}

export function useRatios() {
  const balance = useBalance();
  const customTargets = useSettings((s) => s.ratioTargets);
  const fromMonth = useApp((s) => s.fromMonth);
  const toMonth = useApp((s) => s.toMonth);
  const currentYear = useApp((s) => s.currentYear);
  const currentOrgId = useApp((s) => s.currentOrgId);

  // Detection des mois actifs (avec activité CA réelle).
  const { data: activeMonths } = useCloudData<Set<number> | null>(
    async () => {
      if (!currentOrgId) return null;
      const [periods, entries] = await Promise.all([
        dataProvider.getPeriods(currentOrgId),
        dataProvider.getGLEntries({ orgId: currentOrgId }),
      ]);
      const yearPeriods = periods.filter((p) => p.year === currentYear && p.month >= fromMonth && p.month <= toMonth);
      const periodIds = new Set(yearPeriods.map((p) => p.id));
      const months = new Set<number>();
      for (const e of entries) {
        if (!periodIds.has(e.periodId)) continue;
        if (!/^7[0-5]/.test(e.account)) continue;
        const period = yearPeriods.find((p) => p.id === e.periodId);
        if (period) months.add(period.month);
      }
      return months;
    },
    [currentOrgId, currentYear, fromMonth, toMonth],
    { initial: null, tag: 'gl' },
  );

  if (isDemoActive(currentOrgId)) return DEMO_RATIOS;

  if (!balance || balance.length === 0) return [];

  let periodDays = 0;
  if (activeMonths && activeMonths.size > 0) {
    for (const m of activeMonths) {
      periodDays += new Date(currentYear, m, 0).getDate();
    }
  } else {
    for (let m = fromMonth; m <= toMonth; m++) {
      periodDays += new Date(currentYear, m, 0).getDate();
    }
  }
  if (periodDays <= 0) periodDays = 360;

  return computeRatios(balance, customTargets, { periodDays });
}

export function useMonthlyCR() {
  const { currentOrgId, currentYear } = useApp();
  const { data } = useCloudData(
    () => currentOrgId ? computeMonthlyCR(currentOrgId, currentYear) : Promise.resolve({ months: [], lines: [] }),
    [currentOrgId, currentYear],
    { initial: { months: [], lines: [] }, tag: ['gl', 'budgets'] },
  );
  return data;
}

export function useMonthlyBilan() {
  const { currentOrgId, currentYear } = useApp();
  const { data } = useCloudData(
    () => currentOrgId ? computeMonthlyBilan(currentOrgId, currentYear) : Promise.resolve({ months: [], actif: [], passif: [] }),
    [currentOrgId, currentYear],
    { initial: { months: [], actif: [], passif: [] }, tag: 'gl' },
  );
  return data;
}

export function useTFT() {
  const { currentOrgId, currentYear } = useApp();
  const { data } = useCloudData(
    () => currentOrgId ? computeTFT(currentOrgId, currentYear) : Promise.resolve(null),
    [currentOrgId, currentYear],
    { initial: null, tag: 'gl' },
  );
  return data;
}

export function useMonthlyTFT() {
  const { currentOrgId, currentYear } = useApp();
  const { data } = useCloudData(
    () => currentOrgId ? computeMonthlyTFT(currentOrgId, currentYear) : Promise.resolve({ months: [], lines: [] }),
    [currentOrgId, currentYear],
    { initial: { months: [], lines: [] }, tag: 'gl' },
  );
  return data;
}

export function useTAFIRE() {
  const { currentOrgId, currentYear } = useApp();
  const { data } = useCloudData(
    () => currentOrgId ? computeTAFIRE(currentOrgId, currentYear) : Promise.resolve(null),
    [currentOrgId, currentYear],
    { initial: null, tag: 'gl' },
  );
  return data;
}

/**
 * Bilan de l'exercice N-1 (clôture au 31/12/N-1) — utilisé pour calculer ROE/ROA
 * avec des capitaux propres et un actif d'OUVERTURE exacts (norme IFRS).
 * Si l'utilisateur n'a pas encore importé d'exercice N-1, retourne null —
 * les composants doivent alors retomber sur la proxy (clôture N − résultat N).
 */
export function useBilanN1() {
  const { currentOrgId, currentYear } = useApp();
  const { data } = useCloudData(
    async () => {
      if (!currentOrgId) return null;
      // Vérifie l'existence d'écritures sur N-1 avant de calculer (évite un
      // computeBalance vide qui ferait perdre du temps réseau).
      const periods = await dataProvider.getPeriods(currentOrgId);
      const hasN1 = periods.some((p) => p.year === currentYear - 1);
      if (!hasN1) return null;
      const { computeBalance } = await import('../engine/balance');
      const { computeBilan } = await import('../engine/statements');
      // Bilan N-1 = balance cumulée à fin déc N-1 (incl. à-nouveaux + mouvements).
      const balanceN1 = await computeBalance({
        orgId: currentOrgId,
        year: currentYear - 1,
        uptoMonth: 12,
        includeOpening: true,
      });
      if (balanceN1.length === 0) return null;
      // Mouvements N-1 (sans à-nouveaux) pour le résultat de l'exercice N-1.
      const movementsN1 = await computeBalance({
        orgId: currentOrgId,
        year: currentYear - 1,
        uptoMonth: 12,
        includeOpening: false,
      });
      return computeBilan(balanceN1, movementsN1);
    },
    [currentOrgId, currentYear],
    { initial: null, tag: 'gl' },
  );
  return data;
}

export function useCapitalVariation() {
  const { currentOrgId, currentYear } = useApp();
  const { data } = useCloudData(
    () => currentOrgId ? computeCapitalVariation(currentOrgId, currentYear) : Promise.resolve([]),
    [currentOrgId, currentYear],
    { initial: [], tag: 'gl' },
  );
  return data;
}

export function useBudgetActual(version?: string): BudgetActualRow[] {
  const { currentOrgId, currentYear, fromMonth, toMonth } = useApp();
  const { data } = useCloudData(
    () => currentOrgId ? computeBudgetActual(currentOrgId, currentYear, version, { fromMonth, toMonth }) : Promise.resolve([] as BudgetActualRow[]),
    [currentOrgId, currentYear, version, fromMonth, toMonth],
    { initial: [] as BudgetActualRow[], tag: ['gl', 'budgets'] },
  );
  return data;
}

// KPIs mensuels sur l'année (pour graphiques) — Réalisé + Budget + N-1.
export function useMonthlyCA() {
  const { currentOrgId, currentYear, fromMonth, toMonth } = useApp();
  const { data } = useCloudData(
    async () => {
      if (!currentOrgId) return [];
      const [periods, allBudgets, allEntries] = await Promise.all([
        dataProvider.getPeriods(currentOrgId),
        dataProvider.getAllBudgets(currentOrgId),
        dataProvider.getGLEntries({ orgId: currentOrgId }),
      ]);
      const thisYear = periods
        .filter((p) => p.year === currentYear && p.month >= fromMonth && p.month <= toMonth)
        .sort((a, b) => a.month - b.month);

      // Budget CA classes 70-73 par mois (toutes versions confondues)
      const budgetByMonth = new Map<number, number>();
      for (const b of allBudgets) {
        if (b.year !== currentYear) continue;
        if (!/^7[0-3]/.test(b.account)) continue;
        const m = b.month ?? 0;
        budgetByMonth.set(m, (budgetByMonth.get(m) ?? 0) + Number(b.amount));
      }

      // CA N-1
      const prevPeriods = periods.filter((p) => p.year === currentYear - 1 && p.month >= fromMonth && p.month <= toMonth);
      const prevPeriodIds = new Set(prevPeriods.map((p) => p.id));
      const n1ByMonth = new Map<number, number>();
      for (const e of allEntries) {
        if (!prevPeriodIds.has(e.periodId)) continue;
        if (!/^7[0-3]/.test(e.account)) continue;
        const period = prevPeriods.find((p) => p.id === e.periodId);
        if (period) n1ByMonth.set(period.month, (n1ByMonth.get(period.month) ?? 0) + (e.credit - e.debit));
      }

      // Réalisé année courante
      const result: { mois: string; month: number; realise: number; budget: number; n1: number }[] = [];
      for (const p of thisYear) {
        const ca = allEntries
          .filter((e) => e.periodId === p.id && /^7[0-3]/.test(e.account))
          .reduce((s, e) => s + (e.credit - e.debit), 0);
        result.push({
          mois: p.label.substring(0, 3),
          month: p.month,
          realise: ca,
          budget: budgetByMonth.get(p.month) ?? 0,
          n1: n1ByMonth.get(p.month) ?? 0,
        });
      }
      return result;
    },
    [currentOrgId, currentYear, fromMonth, toMonth],
    { initial: [], tag: ['gl', 'budgets'] },
  );
  if (isDemoActive(currentOrgId) && (!data || data.length === 0)) {
    return DEMO_MONTHLY_CA.map((m) => ({
      mois: m.label,
      month: m.month,
      realise: m.value,
      budget: Math.round(m.value * 1.05),
      n1: Math.round(m.value * 0.88),
    }));
  }
  return data;
}

export function useBudgetActualMonthly(version?: string) {
  const { currentOrgId, currentYear } = useApp();
  const { data } = useCloudData(
    async () => {
      if (!currentOrgId) return null;
      const { computeBudgetActualMonthly } = await import('../engine/budgetActual');
      return computeBudgetActualMonthly(currentOrgId, currentYear, version);
    },
    [currentOrgId, currentYear, version],
    { initial: null, tag: ['gl', 'budgets'] },
  );
  return data;
}
