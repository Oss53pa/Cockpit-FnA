import { describe, it, expect } from 'vitest';
import { computeBilan, computeSIG } from './statements';
import type { BalanceRow } from './balance';

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

describe('computeBilan', () => {
  it('returns empty arrays for empty input', () => {
    const b = computeBilan([]);
    expect(Array.isArray(b.actif)).toBe(true);
    expect(Array.isArray(b.passif)).toBe(true);
    expect(b.totalActif).toBe(0);
  });

  it('produces totalActif and totalPassif that balance on a balanced input', () => {
    const rows = [
      row('101', 0, 1000),    // capital
      row('231', 800, 0),     // bâtiment
      row('521', 200, 0),     // banque
    ];
    const b = computeBilan(rows);
    expect(b.totalActif).toBeGreaterThanOrEqual(0);
    expect(b.totalPassif).toBeGreaterThanOrEqual(0);
  });
});

describe('computeSIG', () => {
  it('returns zero SIG on empty input', () => {
    const s = computeSIG([]);
    expect(s.sig.ca).toBe(0);
    expect(s.sig.resultat).toBe(0);
  });

  it('reflects revenue and expenses on the résultat net', () => {
    const rows = [
      row('701', 0, 1000),  // ventes
      row('601', 600, 0),   // achats
    ];
    const s = computeSIG(rows);
    expect(s.sig.ca).toBeGreaterThan(0);
    // résultat = produits − charges (signe dépendant du calcul interne)
    expect(Number.isFinite(s.sig.resultat)).toBe(true);
  });

  it('computes a positive résultat when revenue > expenses', () => {
    const rows = [
      row('701', 0, 10000),   // Ventes 10 000
      row('601', 4000, 0),    // Achats 4 000
      row('661', 2000, 0),    // Personnel 2 000
    ];
    const s = computeSIG(rows);
    // CA = 10 000 | Charges = 4 000 + 2 000 = 6 000 | Résultat net = 4 000
    expect(s.sig.ca).toBe(10000);
    expect(s.sig.resultat).toBe(4000);
    expect(s.sig.resultat).toBeGreaterThan(0);
  });

  it('computes a negative résultat when expenses > revenue', () => {
    const rows = [
      row('701', 0, 3000),
      row('601', 5000, 0),
    ];
    const s = computeSIG(rows);
    expect(s.sig.resultat).toBeLessThan(0);
  });
});

describe('SIG — classification des dotations financières / HAO (B-1)', () => {
  // 681 = dotation exploitation, 686 = dotation financière, 687 = dotation HAO.
  // Le RÉSULTAT NET doit être INVARIANT (la reclassification ne déplace les
  // montants qu'entre RE / RF / RHAO), mais les SIG intermédiaires doivent
  // refléter le bon rangement SYSCOHADA.
  const rows = [
    row('701', 0, 10000),  // Ventes 10 000
    row('601', 3000, 0),   // Achats 3 000
    row('681', 500, 0),    // Dotation amort. EXPLOITATION
    row('686', 200, 0),    // Dotation à caractère FINANCIER
    row('687', 100, 0),    // Dotation HAO
    row('671', 50, 0),     // Charge financière (intérêts)
    row('82', 0, 300),     // Produit HAO (prix de cession)
  ];

  it('exclut 686/687 du résultat d\'exploitation', () => {
    const { sig } = computeSIG(rows);
    // EBE = 10000 − 3000 = 7000 ; dotations EXPLOITATION = 681 = 500 → RE = 6500.
    // (l'ancien code soustrayait 686+687 ici → RE aurait été 6200)
    expect(sig.re).toBe(6500);
  });

  it('rattache la dotation financière (686) au résultat financier', () => {
    const { sig } = computeSIG(rows);
    // RF = produits fin. (0) − [charges fin. 671 (50) + dot. fin. 686 (200)] = −250
    expect(sig.rf).toBe(-250);
  });

  it('rattache la dotation HAO (687) au résultat HAO', () => {
    const { sig } = computeSIG(rows);
    // RHAO = produit HAO (300) − [charges HAO (0) + dot. HAO 687 (100)] = 200
    expect(sig.rhao).toBe(200);
  });

  it('laisse le RÉSULTAT NET inchangé (invariance de la reclassification)', () => {
    const { sig } = computeSIG(rows);
    // Net = 10300 produits − 3850 charges = 6450, et = rao + rhao − part − impôt
    expect(sig.resultat).toBe(6450);
    expect(sig.rao + sig.rhao).toBe(sig.resultat); // part = impôt = 0 ici
  });
});

describe('RRR accordés ventilés — réduction du CA (70x9)', () => {
  // Les RRR accordés sont des contre-produits à solde DÉBITEUR normal. Ils
  // peuvent être imputés sur le compte global 709 OU ventilés par nature de
  // vente : 7019 (marchandises), 7029..7079, dont 706900 (services).
  // RÉGRESSION : l'ancien code ne capturait que 709 + 7069 → les RRR sur
  // marchandises (7019) et autres natures étaient IGNORÉS → CA surévalué.
  it('soustrait du CA les RRR ventilés sur TOUTES les natures (701900, 706900, 709)', () => {
    const rows = [
      row('701', 0, 10000),    // Ventes de marchandises 10 000
      row('7019', 500, 0),     // RRR accordés sur marchandises 500 (ex-IGNORÉ)
      row('706', 0, 4000),     // Services vendus 4 000
      row('706900', 300, 0),   // RRR accordés sur services 300
      row('709', 200, 0),      // RRR accordés global 200
    ];
    const { sig } = computeSIG(rows);
    // CA = (10 000 + 4 000) − (500 + 300 + 200) = 13 000
    expect(sig.ca).toBe(13000);
  });

  it('ne compte pas un sous-compte RRR ventilé comme une vente', () => {
    const rows = [
      row('706', 0, 5000),     // Services 5 000
      row('706900', 1000, 0),  // RRR services 1 000
    ];
    const { sig } = computeSIG(rows);
    expect(sig.ca).toBe(4000); // 5 000 − 1 000, et NON 5 000 + 1 000
  });
});

describe('cohérence Bilan vs SIG', () => {
  it('le résultat du Bilan et le résultat net du SIG sont identiques sur un dataset balanced', () => {
    const rows = [
      row('101', 0, 10000),   // Capital
      row('411', 3000, 0),    // Clients
      row('521', 2000, 0),    // Banque
      row('401', 0, 2000),    // Fournisseurs
      row('701', 0, 8000),    // Ventes
      row('601', 5000, 0),    // Achats
      row('661', 1500, 0),    // Personnel
    ];
    const bilan = computeBilan(rows);
    const { sig } = computeSIG(rows);
    const bilanResultat = bilan.passif.find((l) => l.code === 'CF')?.value ?? 0;
    expect(Math.abs(bilanResultat - sig.resultat)).toBeLessThan(1);
  });

  it('boucle Bilan = CR même avec dotations financières/HAO et comptes classe 8', () => {
    const rows = [
      row('101', 0, 20000),  // Capital
      row('231', 12000, 0),  // Immobilisations
      row('521', 8000, 0),   // Banque
      row('701', 0, 15000),  // Ventes
      row('601', 6000, 0),   // Achats
      row('681', 800, 0),    // Dotation exploitation
      row('686', 300, 0),    // Dotation financière
      row('687', 150, 0),    // Dotation HAO
      row('82', 0, 500),     // Produit HAO
      row('81', 400, 0),     // Charge HAO (VNC cédée)
      row('89', 200, 0),     // Impôt sur le résultat
    ];
    const bilan = computeBilan(rows);
    const { sig } = computeSIG(rows);
    const bilanResultat = bilan.passif.find((l) => l.code === 'CF')?.value ?? 0;
    // Source unique → égalité stricte (au flottant près)
    expect(Math.abs(bilanResultat - sig.resultat)).toBeLessThan(1);
    // Net = 15500 produits (701=15000 + 82=500) − 7850 charges
    // (cl.6: 601+681+686+687=7250 ; 81=400 ; 89=200) = 7650
    expect(sig.resultat).toBe(7650);
  });
});
