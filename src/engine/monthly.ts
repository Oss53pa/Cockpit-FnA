// Calculs mensuels — CR et Bilan sur 12 mois
import { db } from '../db/schema';
import { computeBalance } from './balance';
import { computeBilan, Line } from './statements';
import { CR_FLOW, CRSection, getSectionDefs, INTERMEDIATE_LABELS, loadLabels } from './budgetActual';
import { findSyscoAccount } from '../syscohada/coa';

export type MonthlyLine = {
  code: string;
  label: string;
  total?: boolean;
  grand?: boolean;
  intermediate?: boolean;   // ligne de résultat intermédiaire (calculée)
  isCharge?: boolean;
  indent?: number;
  accountCodes?: string;
  values: number[];         // 12 valeurs mensuelles RÉALISÉ (non cumulées)
  budgets?: number[];       // 12 valeurs mensuelles BUDGET (dernière version)
  previousYear?: number[];  // 12 valeurs mensuelles N-1 (réalisé année précédente)
  ytd: number;
  ytdBudget?: number;
  ytdPreviousYear?: number;
};

export type MonthlySerie = {
  months: string[];
  lines: MonthlyLine[];
};

// Compte de résultat mensuel — nomenclature 12 points (opérationnelle)
// Produits expl / Charges expl / Résultat expl / Produits fin / Charges fin /
// Résultat fin / Résultat courant / Produits except / Charges except /
// Résultat except / Impôts / Résultat net
export async function computeMonthlyCR(orgId: string, year: number): Promise<MonthlySerie> {
  const MONTHS = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
  const sectionDefs = getSectionDefs(orgId);
  const labels = loadLabels(orgId);

  // 1) Pour chaque mois, balance + map compte → (débit, crédit) sur CE mois uniquement
  const periods = await db.periods.where('orgId').equals(orgId).toArray();
  const monthPeriod = (m: number) => periods.find((p) => p.year === year && p.month === m);
  const allEntries = await db.gl.where('orgId').equals(orgId).toArray();
  // Plan comptable propre à l'entreprise — priorité :
  // 1) db.accounts (si Plan Comptable importé explicitement)
  // 2) libellé le plus fréquent dans les écritures GL (e.label)
  // 3) libellé SYSCOHADA générique (fallback)
  const orgAccounts = await db.accounts.where('orgId').equals(orgId).toArray();
  const orgLabelByCode = new Map(orgAccounts.map((a) => [a.code, a.label] as const));
  // Calcul du libellé GL le plus fréquent par compte
  const glLabelFreq = new Map<string, Map<string, number>>();
  for (const e of allEntries) {
    if (!e.label) continue;
    const lbl = e.label.trim();
    if (!lbl) continue;
    let m = glLabelFreq.get(e.account);
    if (!m) { m = new Map(); glLabelFreq.set(e.account, m); }
    m.set(lbl, (m.get(lbl) ?? 0) + 1);
  }
  const glLabelByCode = new Map<string, string>();
  for (const [code, m] of glLabelFreq) {
    let best = ''; let bestN = 0;
    for (const [k, v] of m) if (v > bestN) { best = k; bestN = v; }
    if (best) glLabelByCode.set(code, best);
  }
  const resolveLabel = (account: string): string => {
    return orgLabelByCode.get(account)
      ?? glLabelByCode.get(account)
      ?? findSyscoAccount(account)?.label
      ?? account;
  };

  // Map mois → map compte → net (produit: crédit-débit ; charge: débit-crédit)
  const netByMonthAccount = Array.from({ length: 12 }, () => new Map<string, number>());
  for (let m = 0; m < 12; m++) {
    const period = monthPeriod(m + 1);
    if (!period) continue;
    const entries = allEntries.filter((e) => e.periodId === period.id);
    for (const e of entries) {
      const c = e.account[0];
      if (c !== '6' && c !== '7' && c !== '8') continue;
      const isCharge = c === '6' || e.account.startsWith('81') || e.account.startsWith('83') || e.account.startsWith('85') || e.account.startsWith('87') || e.account.startsWith('89');
      const net = isCharge ? (e.debit - e.credit) : (e.credit - e.debit);
      const map = netByMonthAccount[m];
      map.set(e.account, (map.get(e.account) ?? 0) + net);
    }
  }

  // ── Budget mensuel par compte (dernière version) ──
  const budgetByMonthAccount = Array.from({ length: 12 }, () => new Map<string, number>());
  const allBudgets = await db.budgets.where('[orgId+year+version]').between([orgId, year, ''], [orgId, year, '\uffff']).toArray();
  const versions = Array.from(new Set(allBudgets.map((b) => b.version))).sort();
  const lastVersion = versions[versions.length - 1];
  if (lastVersion) {
    const lines = allBudgets.filter((b) => b.version === lastVersion);
    for (const l of lines) {
      if (l.month < 1 || l.month > 12) continue;
      const map = budgetByMonthAccount[l.month - 1];
      map.set(l.account, (map.get(l.account) ?? 0) + l.amount);
    }
  }

  // ── Réalisé N-1 par mois (mêmes périodes, année year-1) ──
  const n1ByMonthAccount = Array.from({ length: 12 }, () => new Map<string, number>());
  const periodsN1 = periods.filter((p) => p.year === year - 1 && p.month >= 1 && p.month <= 12);
  if (periodsN1.length > 0) {
    const periodMapN1 = new Map(periodsN1.map((p) => [p.id, p.month] as const));
    const periodIdsN1 = new Set(periodsN1.map((p) => p.id));
    for (const e of allEntries) {
      if (!periodIdsN1.has(e.periodId)) continue;
      const c = e.account[0];
      if (c !== '6' && c !== '7' && c !== '8') continue;
      const isCharge = c === '6' || e.account.startsWith('81') || e.account.startsWith('83') || e.account.startsWith('85') || e.account.startsWith('87') || e.account.startsWith('89');
      const net = isCharge ? (e.debit - e.credit) : (e.credit - e.debit);
      const m = periodMapN1.get(e.periodId);
      if (m === undefined) continue;
      const map = n1ByMonthAccount[m - 1];
      map.set(e.account, (map.get(e.account) ?? 0) + net);
    }
  }

  // 2) Collecter tous les comptes mouvementés par section
  const accountsBySection = new Map<CRSection, Set<string>>();
  for (const sec of Object.keys(sectionDefs) as CRSection[]) {
    accountsBySection.set(sec, new Set());
  }
  for (let m = 0; m < 12; m++) {
    for (const account of netByMonthAccount[m].keys()) {
      for (const [key, def] of Object.entries(sectionDefs)) {
        if (def.prefixes.some((p) => account.startsWith(p))) {
          accountsBySection.get(key as CRSection)!.add(account);
          break;
        }
      }
    }
  }

  // 3) Construire la structure lignes suivant CR_FLOW
  const lines: MonthlyLine[] = [];

  // Helpers
  const sectionTotal = (sec: CRSection, m: number) => {
    const def = sectionDefs[sec];
    let total = 0;
    for (const [account, net] of netByMonthAccount[m]) {
      if (def.prefixes.some((p) => account.startsWith(p))) total += net;
    }
    return total;
  };
  // Roll-up budget : le budget peut être saisi sur un code court (ex: 60, 622)
  // alors que le réalisé tombe sur un sous-compte détaillé (ex: 605118, 622100).
  // On pré-distribue le budget parent vers ses enfants proportionnellement au réalisé.
  const budgetResolved = Array.from({ length: 12 }, () => new Map<string, number>());
  // Collecter tous les comptes réalisés
  const allRealAccounts = new Set<string>();
  for (let m = 0; m < 12; m++) for (const k of netByMonthAccount[m].keys()) allRealAccounts.add(k);
  // Pour chaque mois, résoudre les budgets
  for (let m = 0; m < 12; m++) {
    const bMap = budgetByMonthAccount[m];
    const rMap = netByMonthAccount[m];
    const resolved = budgetResolved[m];
    // Copier d'abord les budgets exact-match
    for (const [code, amt] of bMap) {
      if (rMap.has(code)) {
        resolved.set(code, (resolved.get(code) ?? 0) + amt);
      }
    }
    // Puis distribuer les budgets parents vers les enfants
    for (const [budCode, budAmt] of bMap) {
      if (rMap.has(budCode)) continue; // déjà traité en exact
      // Chercher les sous-comptes réalisés qui commencent par ce code budget
      const children: string[] = [];
      let totalChildReal = 0;
      for (const realCode of allRealAccounts) {
        if (realCode.startsWith(budCode) && realCode.length > budCode.length) {
          children.push(realCode);
          totalChildReal += Math.abs(rMap.get(realCode) ?? 0);
        }
      }
      if (children.length === 0) {
        // Pas d'enfants : garder le budget sur le code parent tel quel
        resolved.set(budCode, (resolved.get(budCode) ?? 0) + budAmt);
      } else {
        // Distribuer proportionnellement au réalisé (ou uniformément si réalisé = 0)
        for (const child of children) {
          const childReal = Math.abs(rMap.get(child) ?? 0);
          const share = totalChildReal > 0 ? (childReal / totalChildReal) * budAmt : budAmt / children.length;
          resolved.set(child, (resolved.get(child) ?? 0) + share);
        }
      }
    }
  }

  const accountValues = (account: string) => {
    const values = Array.from({ length: 12 }, (_, m) => netByMonthAccount[m].get(account) ?? 0);
    const budgets = Array.from({ length: 12 }, (_, m) => budgetResolved[m].get(account) ?? 0);
    const previousYear = Array.from({ length: 12 }, (_, m) => n1ByMonthAccount[m].get(account) ?? 0);
    return {
      values, budgets, previousYear,
      ytd: values.reduce((s, v) => s + v, 0),
      ytdBudget: budgets.reduce((s, v) => s + v, 0),
      ytdPreviousYear: previousYear.reduce((s, v) => s + v, 0),
    };
  };

  // Pour calculer les intermédiaires par mois
  const totalMatrix: Record<CRSection, number[]> = {} as any;
  for (const sec of Object.keys(sectionDefs) as CRSection[]) {
    totalMatrix[sec] = Array.from({ length: 12 }, (_, m) => sectionTotal(sec, m));
  }

  const interValues = (key: string): number[] => {
    const pe = totalMatrix.produits_expl;
    const ce = totalMatrix.charges_expl;
    const pf = totalMatrix.produits_fin;
    const cf = totalMatrix.charges_fin;
    const ph = totalMatrix.produits_hao;
    const ch = totalMatrix.charges_hao;
    const imp = totalMatrix.impots;
    switch (key) {
      case 'res_expl':    return pe.map((v, i) => v - ce[i]);
      case 'res_fin':     return pf.map((v, i) => v - cf[i]);
      case 'res_courant': return pe.map((v, i) => v - ce[i] + pf[i] - cf[i]);
      case 'res_except':  return ph.map((v, i) => v - ch[i]);
      case 'res_net':     return pe.map((v, i) => v - ce[i] + pf[i] - cf[i] + ph[i] - ch[i] - imp[i]);
      default: return Array(12).fill(0);
    }
  };

  for (const item of CR_FLOW) {
    if (item.kind === 'section') {
      const sec = item.key;
      const def = sectionDefs[sec];
      const label = labels[sec];
      const accounts = Array.from(accountsBySection.get(sec) ?? []).sort();

      // Lignes de détail (un compte par ligne)
      for (const account of accounts) {
        const { values, budgets, previousYear, ytd, ytdBudget, ytdPreviousYear } = accountValues(account);
        if (Math.abs(ytd) < 0.01 && Math.abs(ytdBudget) < 0.01 && Math.abs(ytdPreviousYear) < 0.01) continue;
        lines.push({
          code: account,
          label: resolveLabel(account),
          indent: 1,
          isCharge: def.isCharge,
          accountCodes: account,
          values, budgets, previousYear,
          ytd, ytdBudget, ytdPreviousYear,
        });
      }

      // Total de section
      const totals = totalMatrix[sec];
      lines.push({
        code: `_${sec.toUpperCase()}`,
        label: `${def.isCharge ? '− ' : '+ '}${label}`,
        total: true,
        isCharge: def.isCharge,
        accountCodes: def.prefixes.join(', '),
        values: totals,
        ytd: totals.reduce((s, v) => s + v, 0),
      });
    } else {
      // Ligne intermédiaire calculée
      const values = interValues(item.key);
      const isNet = item.key === 'res_net';
      lines.push({
        code: `_${item.key.toUpperCase()}`,
        label: `= ${INTERMEDIATE_LABELS[item.key]}`,
        total: true,
        grand: isNet,
        intermediate: true,
        values,
        ytd: values.reduce((s, v) => s + v, 0),
      });
    }
  }

  return { months: MONTHS, lines };
}

// Bilan mensuel — à la fin de chaque mois (cumul depuis à-nouveaux)
export async function computeMonthlyBilan(orgId: string, year: number) {
  const MONTHS = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
  const snapshots: { actif: Line[]; passif: Line[] }[] = [];
  for (let m = 1; m <= 12; m++) {
    const rows = await computeBalance({ orgId, year, uptoMonth: m, includeOpening: true });
    snapshots.push(computeBilan(rows));
  }
  const templateA = snapshots[0]?.actif ?? [];
  const templateP = snapshots[0]?.passif ?? [];
  const actif = templateA.map((t, idx) => ({
    ...t, values: snapshots.map((s) => s.actif[idx]?.value ?? 0),
    ytd: snapshots[11]?.actif[idx]?.value ?? 0,
  }));
  const passif = templateP.map((t, idx) => ({
    ...t, values: snapshots.map((s) => s.passif[idx]?.value ?? 0),
    ytd: snapshots[11]?.passif[idx]?.value ?? 0,
  }));
  return { months: MONTHS, actif, passif };
}
