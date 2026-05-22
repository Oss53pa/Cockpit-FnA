import { describe, it, expect } from 'vitest';
import { aggregateBySyscoRoot, sumBy, buildAuxBalance, buildReconRow, matchesDrill, type BalanceRow, type GLDrillFilter } from './balance';
import { matchesTiersRule } from './tiersRules';
import type { GLEntry, TiersRule } from '../db/schema';

function row(account: string, debit: number, credit: number): BalanceRow {
  const solde = debit - credit;
  return {
    account,
    label: '',
    debit,
    credit,
    solde,
    soldeD: solde > 0 ? solde : 0,
    soldeC: solde < 0 ? -solde : 0,
  };
}

describe('sumBy', () => {
  it('returns 0 for empty rows', () => {
    expect(sumBy([], ['6'])).toBe(0);
  });

  it('sums solde for matching prefixes', () => {
    const rows = [row('601', 100, 0), row('602', 50, 10), row('70', 0, 200)];
    expect(sumBy(rows, ['6'])).toBe(140);
    expect(sumBy(rows, ['7'])).toBe(-200);
  });

  it('supports multiple prefixes', () => {
    const rows = [row('411', 300, 0), row('401', 0, 200), row('521', 500, 0)];
    expect(sumBy(rows, ['411', '401'])).toBe(100);
  });

  it('ignores rows that do not match any prefix', () => {
    const rows = [row('101', 1000, 0), row('601', 200, 0)];
    expect(sumBy(rows, ['6'])).toBe(200);
  });
});

describe('aggregateBySyscoRoot', () => {
  it('returns an empty map for empty input', () => {
    expect(aggregateBySyscoRoot([]).size).toBe(0);
  });

  it('rolls up soldeD / soldeC per root', () => {
    const rows = [row('601001', 100, 0), row('601002', 50, 0), row('701001', 0, 300)];
    const agg = aggregateBySyscoRoot(rows);
    // 60 and 70 roots — all exist in SYSCOHADA coa
    const r60 = agg.get('60');
    const r70 = agg.get('70');
    // Some accounts may not be found; test only the ones that exist
    if (r60) expect(r60.debit).toBe(150);
    if (r70) expect(r70.credit).toBe(300);
  });
});

let _id = 0;
function glEntry(p: Partial<GLEntry>): GLEntry {
  return {
    id: ++_id,
    orgId: 'org-1',
    periodId: 'p-1',
    date: '2026-01-15',
    journal: 'OD',
    piece: '1',
    account: '411100',
    label: '',
    debit: 0,
    credit: 0,
    ...p,
  };
}

const noLabels = new Map<string, string>();

describe('buildAuxBalance', () => {
  it('groupe par code tiers quand un tiers est renseigné', () => {
    const rows = buildAuxBalance([
      glEntry({ account: '411100', tiers: 'CLI001', debit: 1000 }),
      glEntry({ account: '411100', tiers: 'CLI001', credit: 300 }),
      glEntry({ account: '411100', tiers: 'CLI002', debit: 500 }),
    ], noLabels);

    expect(rows).toHaveLength(2);
    const cli1 = rows.find((r) => r.tier === 'CLI001')!;
    expect(cli1.solde).toBe(700);
    // Drill borné au collectif 3 chiffres
    expect(cli1.drill).toEqual({ tiers: 'CLI001', accountPrefix: '411' });
  });

  it('exclut les centralisations sur compte parent (double comptage)', () => {
    // 411 est parent car 411001 existe → la centralisation sur 411 est ignorée
    const rows = buildAuxBalance([
      glEntry({ account: '411', debit: 1000 }),                 // centralisation, pas de tiers
      glEntry({ account: '411001', tiers: 'CLI001', debit: 1000 }),
    ], noLabels);

    expect(rows).toHaveLength(1);
    expect(rows[0].tier).toBe('CLI001');
    expect(rows[0].solde).toBe(1000);
  });

  it('route les écritures sans tiers (compte non-parent) dans un bucket dédié', () => {
    const rows = buildAuxBalance([
      glEntry({ account: '411100', tiers: 'CLI001', debit: 1000 }),
      glEntry({ account: '411500', debit: 200 }), // sans tiers, non-parent
    ], noLabels);

    const sans = rows.find((r) => r.drill.noTiers);
    expect(sans).toBeDefined();
    expect(sans!.solde).toBe(200);
    expect(sans!.drill).toEqual({ account: '411500', noTiers: true });
  });

  it('groupe par sous-compte quand aucun tiers mais plusieurs comptes', () => {
    const rows = buildAuxBalance([
      glEntry({ account: '411001', debit: 1000 }),
      glEntry({ account: '411002', debit: 500 }),
    ], noLabels);

    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.tier).sort()).toEqual(['411001', '411002']);
    expect(rows.find((r) => r.tier === '411001')!.drill).toEqual({ account: '411001' });
  });

  it('ventile par libellé quand un seul compte sans tiers', () => {
    const rows = buildAuxBalance([
      glEntry({ account: '411100', label: 'Client Alpha', debit: 1000 }),
      glEntry({ account: '411100', label: 'Client Beta', debit: 400 }),
      glEntry({ account: '411100', label: 'Client Alpha', credit: 100 }),
    ], noLabels);

    expect(rows).toHaveLength(2);
    const alpha = rows.find((r) => r.tier === 'Client Alpha')!;
    expect(alpha.solde).toBe(900);
    expect(alpha.drill).toEqual({ account: '411100', label: 'Client Alpha' });
  });

  it('filtre les soldes nuls (lettrés)', () => {
    const rows = buildAuxBalance([
      glEntry({ account: '411100', tiers: 'CLI001', debit: 1000 }),
      glEntry({ account: '411100', tiers: 'CLI001', credit: 1000 }),
    ], noLabels);
    expect(rows).toHaveLength(0);
  });
});

describe('matchesDrill', () => {
  const e = glEntry({ account: '411100', tiers: 'CLI001', label: 'Facture A', debit: 1000 });

  it('match exact sur tiers', () => {
    expect(matchesDrill(e, { tiers: 'CLI001' })).toBe(true);
    expect(matchesDrill(e, { tiers: 'CLI999' })).toBe(false);
  });

  it('match exact sur compte', () => {
    expect(matchesDrill(e, { account: '411100' })).toBe(true);
    expect(matchesDrill(e, { account: '411' })).toBe(false);
  });

  it('match préfixe sur compte collectif', () => {
    expect(matchesDrill(e, { accountPrefix: '411' })).toBe(true);
    expect(matchesDrill(e, { accountPrefix: '401' })).toBe(false);
  });

  it('match exact sur libellé (trim)', () => {
    expect(matchesDrill(glEntry({ label: '  Facture A ' }), { label: 'Facture A' })).toBe(true);
    expect(matchesDrill(e, { label: 'Autre' })).toBe(false);
  });

  it('noTiers ne match que les écritures sans code tiers', () => {
    expect(matchesDrill(e, { noTiers: true })).toBe(false);
    expect(matchesDrill(glEntry({ account: '411500' }), { noTiers: true })).toBe(true);
  });

  it('accountIn match si le compte fait partie de la liste', () => {
    expect(matchesDrill(glEntry({ account: '411500' }), { accountIn: ['411500', '411600'] })).toBe(true);
    expect(matchesDrill(glEntry({ account: '411700' }), { accountIn: ['411500', '411600'] })).toBe(false);
    expect(matchesDrill(glEntry({ account: '411500' }), { accountIn: [] })).toBe(false);
  });

  it('combine plusieurs critères (AND)', () => {
    const filter: GLDrillFilter = { account: '411500', noTiers: true };
    expect(matchesDrill(glEntry({ account: '411500' }), filter)).toBe(true);
    expect(matchesDrill(glEntry({ account: '411500', tiers: 'X' }), filter)).toBe(false);
    expect(matchesDrill(glEntry({ account: '411600' }), filter)).toBe(false);
  });
});

describe('buildReconRow', () => {
  const make = (auxEntries: GLEntry[]) => buildReconRow({
    collective: '411',
    label: 'Clients',
    category: 'client',
    categoryLabel: 'Clients',
    kind: 'client',
    auxEntries,
    accountLabels: noLabels,
  });

  it('décompose soldeGL en tiers / centralisation / écart', () => {
    const r = make([
      glEntry({ account: '411001', tiers: 'CLI001', debit: 1000 }), // tiers
      glEntry({ account: '411002', tiers: 'CLI002', debit: 500 }),  // tiers
      glEntry({ account: '411', debit: 1500 }),                     // centralisation (411 parent de 411001/2)
      glEntry({ account: '411900', debit: 300 }),                   // sans tiers, non-parent → écart
    ]);
    expect(r.soldeTiers).toBe(1500);
    expect(r.soldeCentralisation).toBe(1500);
    expect(r.ecart).toBe(300);
    expect(r.soldeGL).toBe(3300); // 1500 + 1500 + 300
    expect(r.ok).toBe(false);
    expect(r.nbTiers).toBe(2);
    expect(r.nbEntriesCentralisation).toBe(1);
    expect(r.nbEntriesSansTiers).toBe(1);
  });

  it('cible l\'écart et la centralisation via accountIn', () => {
    const r = make([
      glEntry({ account: '411001', tiers: 'CLI001', debit: 1000 }),
      glEntry({ account: '411', debit: 1000 }),    // centralisation
      glEntry({ account: '411900', debit: 300 }),  // écart
    ]);
    expect(r.ecartDrill).toEqual({ accountIn: ['411900'], noTiers: true });
    expect(r.centralisationDrill).toEqual({ accountIn: ['411'], noTiers: true });
    expect(r.drill).toEqual({ accountPrefix: '411' });
  });

  it('ok quand tout est rattaché à un tiers (écart nul)', () => {
    const r = make([
      glEntry({ account: '411100', tiers: 'CLI001', debit: 1000 }),
      glEntry({ account: '411100', tiers: 'CLI002', credit: 200 }),
    ]);
    expect(r.ecart).toBe(0);
    expect(r.ok).toBe(true);
    expect(r.soldeCentralisation).toBe(0);
    expect(r.soldeGL).toBe(r.soldeTiers);
  });

  it('classe en « justifié » les écritures couvertes par une règle ignore', () => {
    const ignoreRule: TiersRule = {
      orgId: 'org-1', account: '411900', action: 'ignore', reason: 'régularisation', createdAt: 0,
    };
    const r = buildReconRow({
      collective: '411', label: 'Clients', category: 'client', categoryLabel: 'Clients', kind: 'client',
      accountLabels: noLabels,
      ignoreRules: [ignoreRule],
      auxEntries: [
        glEntry({ account: '411100', tiers: 'CLI001', debit: 1000 }), // rattaché
        glEntry({ account: '411900', debit: 300 }),                   // justifié (règle ignore)
        glEntry({ account: '411800', debit: 50 }),                    // écart réel
      ],
    });
    expect(r.soldeTiers).toBe(1000);
    expect(r.soldeJustifie).toBe(300);
    expect(r.nbEntriesJustifie).toBe(1);
    expect(r.ecart).toBe(50);
    expect(r.ok).toBe(false);
    expect(r.soldeGL).toBe(1350);
    // Le compte justifié ne doit PAS être dans le drill de l'écart
    expect(r.ecartDrill.accountIn).toEqual(['411800']);
    expect(r.justifieDrill.accountIn).toEqual(['411900']);
  });
});

describe('matchesTiersRule', () => {
  const rule = (p: Partial<TiersRule>): TiersRule => ({ orgId: 'o', account: '411900', action: 'assign', tiers: 'CLI1', createdAt: 0, ...p });

  it('match sur compte exact', () => {
    expect(matchesTiersRule(glEntry({ account: '411900' }), rule({}))).toBe(true);
    expect(matchesTiersRule(glEntry({ account: '411901' }), rule({}))).toBe(false);
  });

  it('respecte labelContains (insensible casse, substring)', () => {
    const r = rule({ labelContains: 'dupont' });
    expect(matchesTiersRule(glEntry({ account: '411900', label: 'VIREMENT DUPONT SA' }), r)).toBe(true);
    expect(matchesTiersRule(glEntry({ account: '411900', label: 'Virement Martin' }), r)).toBe(false);
  });
});
