import { describe, it, expect, vi } from 'vitest';

// Vérifie les nouveaux contrôles d'audit (audit 360+) : continuité d'exercice,
// ruptures de séquence de pièces, montants atypiques par compte.

const PERIODS = [
  { id: 'p23_1', orgId: 'o', fiscalYearId: 'fy23', year: 2023, month: 1, label: 'M', closed: false },
  { id: 'p24_0', orgId: 'o', fiscalYearId: 'fy24', year: 2024, month: 0, label: 'AN24', closed: false },
  { id: 'p24_1', orgId: 'o', fiscalYearId: 'fy24', year: 2024, month: 1, label: 'M', closed: false },
];

let idc = 1;
const E = (periodId: string, journal: string, piece: string, account: string, debit: number, credit: number) => ({
  id: idc++, orgId: 'o', periodId, date: '2024-01-15', journal, piece, account, label: 'x', debit, credit,
});

const ENTRIES = [
  // Continuité : clôture 2023 (521 = +1000, 101 = −1000) vs à-nouveaux 2024 (521 = +800, 101 = −800).
  E('p23_1', 'OD', 'C1', '521', 1000, 0), E('p23_1', 'OD', 'C1', '101', 0, 1000),
  E('p24_0', 'RAN', 'A1', '521', 800, 0), E('p24_0', 'RAN', 'A1', '101', 0, 800),
  // Ruptures de séquence : journal VT, pièces 1..25 SAUF 13.
  ...Array.from({ length: 25 }, (_, i) => i + 1).filter((n) => n !== 13).flatMap((n) => [
    E('p24_1', 'VT', String(n), '411100', 100, 0),
    E('p24_1', 'VT', String(n), '701000', 0, 100),
  ]),
  // Montant atypique par compte : 601000 = quinze fois 1000 + une fois 50 000 000.
  ...Array.from({ length: 15 }, () => [
    E('p24_1', 'ACHAT', 'X', '601000', 1000, 0), E('p24_1', 'ACHAT', 'X', '401000', 0, 1000),
  ]).flat(),
  E('p24_1', 'ACHAT', 'BIG', '601000', 50_000_000, 0), E('p24_1', 'ACHAT', 'BIG', '401000', 0, 50_000_000),
];

vi.mock('../db/provider', () => ({
  dataProvider: {
    getGLEntries: vi.fn(async () => ENTRIES),
    getPeriods: vi.fn(async () => PERIODS),
    getAccounts: vi.fn(async () => []),
    getFiscalYears: vi.fn(async () => [
      { id: 'fy23', orgId: 'o', year: 2023, startDate: '2023-01-01', endDate: '2023-12-31', closed: false },
      { id: 'fy24', orgId: 'o', year: 2024, startDate: '2024-01-01', endDate: '2024-12-31', closed: false },
    ]),
  },
}));

describe('auditGL — contrôles avancés', () => {
  it('détecte la rupture de continuité d\'exercice (à-nouveaux N ≠ clôture N-1)', async () => {
    const { auditGL } = await import('./glAudit');
    const report = await auditGL('o', 2024);
    const cont = report.findings.find((f) => f.id === 'continuity');
    expect(cont).toBeDefined();
    expect(cont!.severity).toBe('critical');
    // Deux comptes en écart : 521 (−200) et 101 (+200).
    expect(cont!.count).toBe(2);
    expect(cont!.total).toBe(400); // |−200| + |+200|
  });

  it('détecte les ruptures de séquence de n° de pièce (pièce 13 manquante)', async () => {
    const { auditGL } = await import('./glAudit');
    const report = await auditGL('o', 2024);
    const pg = report.findings.find((f) => f.id === 'piece_gaps');
    expect(pg).toBeDefined();
    expect(pg!.count).toBe(1); // une seule pièce manquante (13)
  });

  it('détecte un montant atypique pour son compte (zéro en trop)', async () => {
    const { auditGL } = await import('./glAudit');
    const report = await auditGL('o', 2024);
    const ao = report.findings.find((f) => f.id === 'account_outliers');
    expect(ao).toBeDefined();
    // 601000 et 401000 portent tous deux le 50 M atypique.
    expect(ao!.count).toBeGreaterThanOrEqual(1);
  });
});
