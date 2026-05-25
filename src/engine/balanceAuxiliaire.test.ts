import { describe, it, expect } from 'vitest';
import { computeBalanceAuxiliaire, computeTiersReconciliation, auxTotals } from './balanceAuxiliaire';
import type { GLTiersEntry } from '../db/schema';
import type { BalanceRow } from './balance';

const e = (account: string, codeTiers: string, debit: number, credit: number, category: GLTiersEntry['category'], labelTiers = ''): Omit<GLTiersEntry, 'id'> => ({
  orgId: 'o', date: '2026-03-15', account, codeTiers, labelTiers, label: labelTiers,
  debit, credit, category, createdAt: 0,
});

describe('computeBalanceAuxiliaire', () => {
  it('groupe par compte collectif + code tiers et calcule le solde', () => {
    const rows = computeBalanceAuxiliaire([
      e('411100', 'CLI001', 1000, 0, 'client', 'A'),
      e('411100', 'CLI001', 500, 200, 'client', 'A'),
      e('411100', 'CLI002', 300, 0, 'client', 'B'),
    ] as GLTiersEntry[]);
    expect(rows).toHaveLength(2);
    const cli001 = rows.find((r) => r.codeTiers === 'CLI001')!;
    expect(cli001.debit).toBe(1500);
    expect(cli001.credit).toBe(200);
    expect(cli001.solde).toBe(1300);
    expect(cli001.count).toBe(2);
  });

  it('exclut les soldes nuls par défaut', () => {
    const rows = computeBalanceAuxiliaire([
      e('411100', 'CLI001', 1000, 1000, 'client'),
      e('411100', 'CLI002', 500, 0, 'client'),
    ] as GLTiersEntry[]);
    expect(rows.map((r) => r.codeTiers)).toEqual(['CLI002']);
  });

  it('filtre par catégorie', () => {
    const rows = computeBalanceAuxiliaire([
      e('411100', 'CLI001', 1000, 0, 'client'),
      e('401100', 'FRN001', 0, 800, 'fournisseur'),
    ] as GLTiersEntry[], { category: 'fournisseur' });
    expect(rows).toHaveLength(1);
    expect(rows[0].codeTiers).toBe('FRN001');
    expect(rows[0].solde).toBe(-800);
  });
});

describe('computeTiersReconciliation', () => {
  it('compare Σ auxiliaire au solde GL du collectif', () => {
    const aux = computeBalanceAuxiliaire([
      e('411100', 'CLI001', 1000, 0, 'client'),
      e('411100', 'CLI002', 500, 0, 'client'),
    ] as GLTiersEntry[]);
    const gl: BalanceRow[] = [
      { account: '411100', label: 'Clients', debit: 1500, credit: 0, solde: 1500, soldeD: 1500, soldeC: 0 },
    ];
    const recon = computeTiersReconciliation(aux, gl);
    expect(recon).toHaveLength(1);
    expect(recon[0].soldeAux).toBe(1500);
    expect(recon[0].soldeGL).toBe(1500);
    expect(recon[0].ecart).toBe(0);
    expect(recon[0].ok).toBe(true);
  });

  it('détecte un écart (détail tiers incomplet)', () => {
    const aux = computeBalanceAuxiliaire([e('411100', 'CLI001', 1000, 0, 'client')] as GLTiersEntry[]);
    const gl: BalanceRow[] = [
      { account: '411100', label: 'Clients', debit: 1500, credit: 0, solde: 1500, soldeD: 1500, soldeC: 0 },
    ];
    const recon = computeTiersReconciliation(aux, gl);
    expect(recon[0].ecart).toBe(500);
    expect(recon[0].ok).toBe(false);
  });
});

describe('auxTotals', () => {
  it('totalise débit/crédit/solde et compte les tiers', () => {
    const aux = computeBalanceAuxiliaire([
      e('411100', 'CLI001', 1000, 0, 'client'),
      e('401100', 'FRN001', 0, 800, 'fournisseur'),
    ] as GLTiersEntry[]);
    const t = auxTotals(aux);
    expect(t.debit).toBe(1000);
    expect(t.credit).toBe(800);
    expect(t.solde).toBe(200);
    expect(t.nbTiers).toBe(2);
  });
});
