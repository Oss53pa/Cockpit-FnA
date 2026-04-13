// Règles de validation comptable SYSCOHADA
import type { BalanceRow } from '../engine/balance';

export type RuleSeverity = 'info' | 'warning' | 'error' | 'critical';
export interface ValidationResult { rule: string; severity: RuleSeverity; message: string; account?: string; value?: number; }

function getSensNormal(code: string): 'D' | 'C' {
  const c = code[0], c2 = code.substring(0, 2);
  if (c === '2' || c === '3' || c === '6') return (c2 === '28' || c2 === '29' || c2 === '39') ? 'C' : 'D';
  if (c === '1' || c === '7') return (code.startsWith('109') || code.startsWith('129')) ? 'D' : 'C';
  if (c === '4') { if (c2 === '41') return 'D'; if (code.startsWith('409') || code.startsWith('445')) return 'D'; return 'C'; }
  if (c === '5') return (c2 === '56' || c2 === '59') ? 'C' : 'D';
  if (c === '8') return ['81','83','85','87','89'].includes(c2) ? 'D' : 'C';
  return 'D';
}

export function checkSoldesAnormaux(rows: BalanceRow[]): ValidationResult[] {
  const r: ValidationResult[] = [];
  for (const row of rows) {
    if (row.debit === 0 && row.credit === 0) continue;
    const sens = getSensNormal(row.account);
    if ((sens === 'D' && row.soldeC > 0 && row.soldeD === 0) || (sens === 'C' && row.soldeD > 0 && row.soldeC === 0))
      r.push({ rule: 'SOLDE_ANORMAL', severity: 'warning', message: `Compte ${row.account} (${row.label}) : solde ${row.soldeD > 0 ? 'débiteur' : 'créditeur'} anormal`, account: row.account, value: row.solde });
  }
  return r;
}

export function checkEquilibreGeneral(rows: BalanceRow[]): ValidationResult[] {
  let d = 0, c = 0;
  for (const r of rows) { d += r.debit; c += r.credit; }
  const e = Math.abs(d - c);
  return e > 1 ? [{ rule: 'EQUILIBRE_GENERAL', severity: 'critical', message: `Déséquilibre : débit ${d.toLocaleString()} vs crédit ${c.toLocaleString()} (écart ${e.toLocaleString()})`, value: e }] : [];
}

export function checkCoherenceResultat(rows: BalanceRow[]): ValidationResult[] {
  let charges = 0, produits = 0;
  for (const r of rows) {
    if (r.account[0] === '6' || ['81','83','85','87','89'].some((p) => r.account.startsWith(p))) charges += r.debit - r.credit;
    if (r.account[0] === '7' || ['82','84','86','88'].some((p) => r.account.startsWith(p))) produits += r.credit - r.debit;
  }
  const res = produits - charges;
  const c12 = rows.find((r) => r.account.startsWith('12') || r.account.startsWith('13'));
  if (c12) { const e = Math.abs(res - (c12.soldeC - c12.soldeD)); if (e > 1) return [{ rule: 'COHERENCE_RESULTAT', severity: 'error', message: `Résultat calculé (${res.toLocaleString()}) vs compte 12/13 (${(c12.soldeC - c12.soldeD).toLocaleString()})`, value: e }]; }
  return [];
}

export function checkEquilibreBilan(rows: BalanceRow[]): ValidationResult[] {
  let actif = 0, passif = 0;
  for (const r of rows) { const c = r.account[0]; if (c >= '1' && c <= '5') { actif += r.soldeD; passif += r.soldeC; } }
  let charges = 0, produits = 0;
  for (const r of rows) { if (r.account[0] === '6' || r.account[0] === '8') charges += r.debit - r.credit; if (r.account[0] === '7') produits += r.credit - r.debit; }
  passif += produits - charges;
  const e = Math.abs(actif - passif);
  return e > 1 ? [{ rule: 'EQUILIBRE_BILAN', severity: 'critical', message: `Bilan déséquilibré : actif ${actif.toLocaleString()} vs passif ${passif.toLocaleString()}`, value: e }] : [];
}

export function runAllChecks(rows: BalanceRow[]): ValidationResult[] {
  return [...checkEquilibreGeneral(rows), ...checkEquilibreBilan(rows), ...checkCoherenceResultat(rows), ...checkSoldesAnormaux(rows)]
    .sort((a, b) => ({ critical: 0, error: 1, warning: 2, info: 3 }[a.severity] - { critical: 0, error: 1, warning: 2, info: 3 }[b.severity]));
}
