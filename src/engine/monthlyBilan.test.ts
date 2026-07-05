import { describe, it, expect, vi } from 'vitest';

// Reproduit le bug du Bilan mensuel : la ligne « Écart de balance » que
// computeBilan ajoute conditionnellement bascule de l'ACTIF (_EC) vers le
// PASSIF (_ECP) selon le sens du déséquilibre. L'ancien computeMonthlyBilan
// mappait les lignes PAR INDEX depuis janvier → dès qu'un mois basculait de
// côté, le TOTAL GÉNÉRAL tombait sur une case vide et la ligne d'écart affichait
// le total. Ce test verrouille le mapping PAR CODE.

const PERIODS = [
  { id: 'p0', orgId: 'o', fiscalYearId: 'fy', year: 2024, month: 0, label: 'AN', closed: false },
  ...Array.from({ length: 12 }, (_, i) => ({
    id: `p${i + 1}`, orgId: 'o', fiscalYearId: 'fy', year: 2024, month: i + 1, label: `M${i + 1}`, closed: false,
  })),
];

const e = (periodId: string, account: string, debit: number, credit: number) => ({
  id: Math.floor(Math.random() * 1e9), orgId: 'o', periodId, date: '2024-01-15',
  journal: 'OD', piece: '1', account, label: 'x', debit, credit,
});

// À-nouveaux DÉSÉQUILIBRÉS (cas réel : RAN exporté par l'ERP) :
//   capital 1000 (passif) vs banque 900 (actif) → Passif > Actif → écart ACTIF.
// Au mois 3 : banque +300, fournisseur +100 → Actif (1200) > Passif (1100)
//   → l'écart BASCULE côté PASSIF. C'est ce basculement qui cassait l'affichage.
const ENTRIES = [
  e('p0', '101', 0, 1000),
  e('p0', '521', 900, 0),
  e('p3', '521', 300, 0),
  e('p3', '401', 0, 100),
];

vi.mock('./balance', async (orig) => orig()); // garde le vrai computeBalance
vi.mock('../db/provider', () => ({
  dataProvider: {
    getPeriods: vi.fn(async () => PERIODS),
    getGLEntries: vi.fn(async () => ENTRIES),
    getAccounts: vi.fn(async () => []),
  },
}));

describe('computeMonthlyBilan — écart de balance qui bascule actif↔passif', () => {
  it('le TOTAL GÉNÉRAL PASSIF est renseigné pour les 12 mois (pas de case vide)', async () => {
    const { computeMonthlyBilan } = await import('./monthly');
    const res = await computeMonthlyBilan('o', 2024);

    const totalPassif = res.passif.find((l) => l.code === '_DZ');
    expect(totalPassif).toBeDefined();
    // Aucune valeur ne doit être 0/undefined alors que le bilan a des données.
    for (const v of totalPassif!.values) expect(v).toBeGreaterThan(0);

    // Mois 1-2 : Passif (1000) > Actif (900) → total général passif = 1000.
    expect(totalPassif!.values[0]).toBe(1000);
    expect(totalPassif!.values[1]).toBe(1000);
    // Mois 3-12 : Actif (1200) > Passif (1100) → total général = 1200 (équilibré).
    expect(totalPassif!.values[2]).toBe(1200);
    expect(totalPassif!.values[11]).toBe(1200);
  });

  it("la ligne d'écart n'affiche PAS le total général (bug d'index)", async () => {
    const { computeMonthlyBilan } = await import('./monthly');
    const res = await computeMonthlyBilan('o', 2024);
    const ecartP = res.passif.find((l) => l.code === '_ECP');
    if (ecartP) {
      // L'écart du passif = 100 aux mois où Actif > Passif (3-12), 0 sinon.
      expect(ecartP.values[0]).toBe(0);
      expect(ecartP.values[2]).toBe(100);
      // Surtout : l'écart ne doit JAMAIS valoir le total général (13,5 Md dans le
      // bug d'origine ; ici il resterait borné à 100).
      for (const v of ecartP.values) expect(v).toBeLessThan(1000);
    }
  });
});
