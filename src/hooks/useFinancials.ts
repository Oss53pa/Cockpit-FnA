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

export function useImportsHistory(orgId: string, kind?: ImportLog['kind'] | ImportLog['kind'][]): ImportLog[] {
  return useLiveQuery(async () => {
    if (!orgId) return [] as ImportLog[];
    const all = await db.imports.where('orgId').equals(orgId).reverse().sortBy('date');
    if (!kind) return all;
    const kinds = Array.isArray(kind) ? new Set(kind) : new Set([kind]);
    return all.filter((i) => kinds.has(i.kind));
  }, [orgId, Array.isArray(kind) ? kind.join(',') : kind], [] as ImportLog[]);
}

/**
 * Résout la sélection d'import courante (store) en un importId concret
 * à passer à computeBalance :
 * - 'latest' → l'id du dernier ImportLog GL pour la société (le plus récent)
 * - 'all'    → 'all' (computeBalance bypass le filtre)
 * - autre    → l'id tel quel
 * Retourne undefined pendant le chargement (évite d'afficher des données
 * obsolètes avant d'avoir la résolution).
 */
export function useResolvedImportId(): string | undefined {
  const currentOrgId = useApp((s) => s.currentOrgId);
  const currentImport = useApp((s) => s.currentImport);
  return useLiveQuery(async () => {
    if (!currentOrgId) return 'all';
    if (currentImport === 'all') return 'all';
    if (currentImport === 'latest') {
      const imports = await db.imports
        .where('orgId').equals(currentOrgId)
        .filter((i) => i.kind === 'GL')
        .reverse().sortBy('date');
      if (!imports.length) return 'all'; // pas d'import : rien à filtrer
      return String(imports[0].id);
    }
    return currentImport; // id spécifique
  }, [currentOrgId, currentImport], undefined);
}

/**
 * Balance cumulée (avec à-nouveaux) — pour Bilan et vues d'état cumulé.
 * includeOpening:true ⇒ inclut la période "mois 0" qui contient les
 * écritures d'ouverture/report à nouveau de l'exercice.
 * Utilise la sélection d'import courante (dernier par défaut) pour éviter
 * le double-comptage si plusieurs imports coexistent.
 */
export function useBalance() {
  const { currentOrgId, currentYear, currentPeriodId, fromMonth, toMonth } = useApp();
  const importId = useResolvedImportId();
  return useLiveQuery(async () => {
    if (!currentOrgId) return [];
    if (importId === undefined) return [];
    const period = currentPeriodId ? await db.periods.get(currentPeriodId) : undefined;
    const uptoMonth = period?.month ?? toMonth;
    return computeBalance({
      orgId: currentOrgId,
      year: currentYear,
      fromMonth,
      uptoMonth,
      includeOpening: true,
      importId,
    });
  }, [currentOrgId, currentYear, currentPeriodId, fromMonth, toMonth, importId], []);
}

/**
 * Balance des MOUVEMENTS de l'exercice (sans à-nouveaux) — indispensable
 * pour le Compte de Résultat et les SIG.
 */
export function useBalanceMovements() {
  const { currentOrgId, currentYear, currentPeriodId, fromMonth, toMonth } = useApp();
  const importId = useResolvedImportId();
  return useLiveQuery(async () => {
    if (!currentOrgId) return [];
    if (importId === undefined) return [];
    const period = currentPeriodId ? await db.periods.get(currentPeriodId) : undefined;
    const uptoMonth = period?.month ?? toMonth;
    return computeBalance({
      orgId: currentOrgId,
      year: currentYear,
      fromMonth,
      uptoMonth,
      includeOpening: false,
      importId,
    });
  }, [currentOrgId, currentYear, currentPeriodId, fromMonth, toMonth, importId], []);
}

export function useStatements() {
  const balance = useBalance();             // avec AN (pour Bilan et solde des classes 1-5)
  const movements = useBalanceMovements();  // sans AN (pour CR/SIG — classes 6,7,8)
  if (!balance || balance.length === 0) {
    return { balance: [], movements: [], bilan: null, cr: [], sig: null };
  }
  // Bilan : soldes classes 1-5 depuis la balance cumulée (avec AN),
  // mais résultat de l'exercice calculé sur les mouvements (sans AN).
  const bilan = computeBilan(balance, movements);
  // Pour SIG, on utilise les mouvements de l'année. Si `movements` est vide
  // (cas rare : pas de périodes 1-12 encore créées), on retombe sur `balance`.
  const src = movements.length > 0 ? movements : balance;
  const { sig, cr } = computeSIG(src);
  return { balance, movements, bilan, cr, sig };
}

export function useRatios() {
  const balance = useBalance();
  const customTargets = useSettings((s) => s.ratioTargets);
  const fromMonth = useApp((s) => s.fromMonth);
  const toMonth = useApp((s) => s.toMonth);
  const currentYear = useApp((s) => s.currentYear);
  const currentOrgId = useApp((s) => s.currentOrgId);

  // ── Detection des mois actifs (avec activité CA réelle) ──
  // Bug fix: si l'utilisateur sélectionne YTD (jan-déc) mais que la data du GL
  // ne couvre que Q1, periodDays était 365 → DSO et DPO sont multipliés par
  // ~4. Solution: détecter les mois avec mouvements 70-75 (produits) et limiter
  // periodDays aux mois actifs.
  const activeMonths = useLiveQuery(
    async () => {
      if (!currentOrgId) return null;
      const periods = await db.periods.where('orgId').equals(currentOrgId).toArray();
      const yearPeriods = periods.filter((p) => p.year === currentYear && p.month >= fromMonth && p.month <= toMonth);
      const periodIds = new Set(yearPeriods.map((p) => p.id));
      const entries = await db.gl
        .where('orgId').equals(currentOrgId)
        .filter((e) => periodIds.has(e.periodId) && /^7[0-5]/.test(e.account))
        .toArray();
      const months = new Set<number>();
      for (const e of entries) {
        const period = yearPeriods.find((p) => p.id === e.periodId);
        if (period) months.add(period.month);
      }
      return months;
    },
    [currentOrgId, currentYear, fromMonth, toMonth],
  );

  if (!balance || balance.length === 0) return [];

  // Calcul du periodDays effectif :
  //  - Si on a la liste des mois actifs (CA détecté), on borne aux mois avec activité réelle
  //  - Sinon fallback sur la sélection utilisateur (fromMonth/toMonth)
  let periodDays = 0;
  if (activeMonths && activeMonths.size > 0) {
    // Mois actifs détectés : utiliser EXACTEMENT ceux-là
    for (const m of activeMonths) {
      periodDays += new Date(currentYear, m, 0).getDate();
    }
  } else {
    // Fallback : période sélectionnée
    for (let m = fromMonth; m <= toMonth; m++) {
      periodDays += new Date(currentYear, m, 0).getDate();
    }
  }
  if (periodDays <= 0) periodDays = 360;

  return computeRatios(balance, customTargets, { periodDays });
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
  const { currentOrgId, currentYear, fromMonth, toMonth } = useApp();
  return useLiveQuery(
    () => (currentOrgId ? computeBudgetActual(currentOrgId, currentYear, version, { fromMonth, toMonth }) : Promise.resolve([] as BudgetActualRow[])),
    [currentOrgId, currentYear, version, fromMonth, toMonth], [] as BudgetActualRow[],
  );
}

// KPIs mensuels sur l'année (pour graphiques)
// (P1-9) Propage fromMonth/toMonth pour respecter la période sélectionnée
// par l'utilisateur. Avant : tous les mois étaient retournés même quand le
// header avait une plage restreinte → graphiques incohérents avec les KPI.
export function useMonthlyCA() {
  const { currentOrgId, currentYear, fromMonth, toMonth } = useApp();
  return useLiveQuery(async () => {
    if (!currentOrgId) return [];
    const periods = await db.periods.where('orgId').equals(currentOrgId).toArray();
    const thisYear = periods
      .filter((p) => p.year === currentYear && p.month >= fromMonth && p.month <= toMonth)
      .sort((a, b) => a.month - b.month);
    const result: { mois: string; month: number; realise: number }[] = [];
    for (const p of thisYear) {
      const entries = await db.gl.where('periodId').equals(p.id).toArray();
      const ca = entries
        .filter((e) => e.account.startsWith('70') || e.account.startsWith('71') || e.account.startsWith('72') || e.account.startsWith('73'))
        .reduce((s, e) => s + (e.credit - e.debit), 0);
      result.push({ mois: p.label.substring(0, 3), month: p.month, realise: ca });
    }
    return result;
  }, [currentOrgId, currentYear, fromMonth, toMonth], []);
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
