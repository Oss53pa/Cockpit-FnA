// Calculs mensuels — CR et Bilan sur 12 mois
import { db } from '../db/schema';
import { computeBalance } from './balance';
import { computeBilan, computeSIG, Line } from './statements';

export type MonthlySerie = {
  months: string[];            // ['Jan', ..., 'Déc']
  lines: Array<{
    code: string;
    label: string;
    total?: boolean;
    grand?: boolean;
    indent?: number;
    values: number[];          // 12 valeurs mensuelles (non cumulées)
    ytd: number;               // total année
  }>;
};

// Compte de résultat mensuel — valeurs du mois (non cumulées)
export async function computeMonthlyCR(orgId: string, year: number): Promise<MonthlySerie> {
  const MONTHS = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
  const perMonth: Line[][] = [];

  for (let m = 1; m <= 12; m++) {
    // Balance du mois uniquement (sans à-nouveaux, sans cumul)
    const periods = await db.periods.where('orgId').equals(orgId).toArray();
    const period = periods.find((p) => p.year === year && p.month === m);
    if (!period) { perMonth.push([]); continue; }
    const entries = await db.gl.where('periodId').equals(period.id).toArray();

    // Aggrégation locale
    const map = new Map<string, { debit: number; credit: number; label: string }>();
    for (const e of entries) {
      const cur = map.get(e.account) ?? { debit: 0, credit: 0, label: e.label };
      cur.debit += e.debit; cur.credit += e.credit;
      map.set(e.account, cur);
    }
    const rows = Array.from(map, ([code, v]) => {
      const solde = v.debit - v.credit;
      return {
        account: code, label: v.label,
        debit: v.debit, credit: v.credit, solde,
        soldeD: solde > 0 ? solde : 0,
        soldeC: solde < 0 ? -solde : 0,
        class: code[0],
      };
    });
    const { cr } = computeSIG(rows as any);
    perMonth.push(cr);
  }

  // Fusion : même liste de lignes, 12 valeurs
  const template = perMonth.find((m) => m.length > 0) ?? [];
  const lines = template.map((t, idx) => ({
    code: t.code, label: t.label, total: t.total, grand: t.grand, indent: t.indent,
    values: perMonth.map((m) => m[idx]?.value ?? 0),
    ytd: perMonth.reduce((s, m) => s + (m[idx]?.value ?? 0), 0),
  }));

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
