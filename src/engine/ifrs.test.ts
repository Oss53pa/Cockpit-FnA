import { describe, it, expect } from 'vitest';
import { computeIfrsConversion } from './ifrs';
import type { BalanceRow } from './balance';

// Balance SYSCOHADA équilibrée (Σ débit = Σ crédit) contenant les 4 postes
// retraités : frais d'établissement (20), subvention (14), provision réglementée
// (15), écart de conversion passif (479).
const B = (account: string, soldeD: number, soldeC: number): BalanceRow => ({
  account, label: account, debit: soldeD, credit: soldeC, solde: soldeD - soldeC, soldeD, soldeC,
});

const BALANCE: BalanceRow[] = [
  B('101000', 0, 1000), // capital
  B('201000', 100, 0),  // frais d'établissement (charges immobilisées)
  B('211000', 200, 0),  // immo incorporelles
  B('221000', 500, 0),  // immo corporelles
  B('140000', 0, 150),  // subvention d'investissement
  B('151000', 0, 80),   // provision réglementée
  B('479000', 0, 30),   // écart de conversion passif (gain latent)
  B('401000', 0, 200),  // fournisseurs
  B('411000', 100, 0),  // clients (pour l'ECL IFRS 9)
  B('521000', 760, 0),  // banque
  B('701000', 0, 900),  // ventes
  B('601000', 700, 0),  // achats
];

describe('computeIfrsConversion — SYSCOHADA → IFRS', () => {
  it('le SoFP IFRS reste équilibré (actif = capitaux propres + passif)', () => {
    const c = computeIfrsConversion(BALANCE);
    expect(Math.abs(c.sofp.totalAssets - c.sofp.totalEquityAndLiabilities)).toBeLessThan(1);
  });

  it("le pont de réconciliation des capitaux propres tombe juste sur l'equity IFRS", () => {
    const c = computeIfrsConversion(BALANCE);
    const last = c.reconEquity[c.reconEquity.length - 1];
    expect(last.value).toBeCloseTo(c.equityIfrs, 2);
    // Frais d'établissement retirés, subvention reclassée, IDA reconnu, gain de change ajouté.
    const dtl = 80 * c.taxRate;
    expect(c.equityIfrs).toBeCloseTo(c.equitySysco - 100 + 30 - 150 - dtl, 2);
  });

  it('le résultat IFRS = résultat SYSCOHADA + gains de change latents', () => {
    const c = computeIfrsConversion(BALANCE);
    expect(c.resultIfrs).toBeCloseTo(c.resultSysco + 30, 2);
    const last = c.reconResult[c.reconResult.length - 1];
    expect(last.value).toBeCloseTo(c.resultIfrs, 2);
  });

  it('détecte les 5 retraitements/reclassements attendus', () => {
    const c = computeIfrsConversion(BALANCE);
    expect(c.adjustments.map((a) => a.id).sort()).toEqual(['R1', 'R2', 'R3', 'R4', 'R5']);
  });

  it('reste présenté équilibré même si la balance source est déséquilibrée', () => {
    // Balance volontairement déséquilibrée (Σ débit ≠ Σ crédit) : le SoFP IFRS
    // doit rester équilibré via une ligne d'écart explicite.
    const unbalanced = [...BALANCE, B('521000', 50, 0)];
    const c = computeIfrsConversion(unbalanced);
    expect(Math.abs(c.sofp.totalAssets - c.sofp.totalEquityAndLiabilities)).toBeLessThan(1);
    const allLines = [...c.sofp.currentAssets, ...c.sofp.currentLiabilities];
    expect(allLines.some((l) => l.code === 'EC')).toBe(true);
  });

  it('reste équilibré AVEC les retraitements manuels (IFRS 16/19/12/9)', () => {
    const c = computeIfrsConversion(BALANCE, {
      taxRate: 0.30,
      manual: {
        ifrs16: { annualPayment: 50, termYears: 5, rate: 0.08 },
        ias19: { obligation: 40, alreadyProvided: 10 },
        ias12: { temporaryDifferences: 100 },
        ifrs9: { eclRate: 0.05 },
      },
    });
    // Les 4 retraitements manuels sont présents.
    expect(c.adjustments.map((a) => a.id)).toEqual(expect.arrayContaining(['R6', 'R7', 'R8', 'R9']));
    // Le SoFP reste équilibré malgré les ajouts (droit d'usage, provisions, ECL…).
    expect(Math.abs(c.sofp.totalAssets - c.sofp.totalEquityAndLiabilities)).toBeLessThan(1);
    // Le pont des capitaux propres tombe toujours juste.
    expect(c.reconEquity[c.reconEquity.length - 1].value).toBeCloseTo(c.equityIfrs, 2);
    // Le taux d'IS paramétré est bien pris en compte.
    expect(c.taxRate).toBe(0.30);
  });
});
