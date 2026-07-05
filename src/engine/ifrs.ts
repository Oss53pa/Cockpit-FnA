// Conversion SYSCOHADA révisé (AUDCIF) → IFRS
// -------------------------------------------------------------------------
// La révision 2017 de l'AUDCIF a convergé vers les IFRS : la conversion se
// limite donc à (1) un reclassement de présentation (IAS 1, current/non-current,
// suppression du HAO) et (2) quelques retraitements de fond AUTO-DÉTECTABLES
// depuis la balance. Les retraitements nécessitant des inputs externes
// (IFRS 16 leases, IAS 19 retraites, IAS 12 complet, IFRS 9 ECL) sont hors v1.
//
// Chaque retraitement est ÉQUILIBRÉ (un impact capitaux propres a une
// contrepartie actif ou passif) pour que le SoFP IFRS reste équilibré.
import type { BalanceRow } from './balance';
import { computeBilan, computeSIG } from './statements';

export const IFRS_TAX_RATE = 0.27; // taux IS moyen UEMOA (paramétrable)

export type IfrsAdjustment = {
  id: string;
  norme: string;
  fr: string;
  en: string;
  montant: number;        // montant brut du poste concerné
  impactResult: number;   // effet sur le résultat de l'exercice
  impactEquity: number;   // effet net sur les capitaux propres
  type: 'retraitement' | 'reclassement';
  detail: string;
};

export type IfrsLine = { code: string; fr: string; en: string; value: number; total?: boolean; indent?: number };

export type IfrsConversion = {
  taxRate: number;
  adjustments: IfrsAdjustment[];
  sofp: {
    nonCurrentAssets: IfrsLine[];
    currentAssets: IfrsLine[];
    equity: IfrsLine[];
    nonCurrentLiabilities: IfrsLine[];
    currentLiabilities: IfrsLine[];
    totalAssets: number;
    totalEquityAndLiabilities: number;
  };
  pnl: IfrsLine[];
  reconEquity: IfrsLine[];
  reconResult: IfrsLine[];
  equitySysco: number;
  equityIfrs: number;
  resultSysco: number;
  resultIfrs: number;
};

const n = (v: number) => (Number.isFinite(v) ? v : 0);

export function computeIfrsConversion(balance: BalanceRow[], taxRate = IFRS_TAX_RATE): IfrsConversion {
  const { sig } = computeSIG(balance);
  const bilan = computeBilan(balance);
  const g = (lines: { code: string; value: number }[], code: string) => n(lines.find((l) => l.code === code)?.value ?? 0);
  const soldeD = (...p: string[]) => balance.filter((r) => p.some((x) => r.account.startsWith(x))).reduce((s, r) => s + r.soldeD, 0);
  const soldeC = (...p: string[]) => balance.filter((r) => p.some((x) => r.account.startsWith(x))).reduce((s, r) => s + r.soldeC, 0);

  // Postes source SYSCOHADA
  const fraisEtab = g(bilan.actif, 'AD');        // compte 20 — charges immobilisées (VNC)
  const ecartPassif = n(soldeC('479'));          // écart de conversion passif = gain de change latent
  const subvInv = n(soldeC('14'));               // subventions d'investissement
  const provRegl = n(soldeC('15'));              // provisions réglementées / amort. dérogatoires
  const dtl = provRegl * taxRate;                // impôt différé passif reconnu
  const haoCharges = n(soldeD('81', '83', '85', '87'));
  const haoProduits = n(soldeC('82', '84', '86', '88'));
  const netHAO = haoProduits - haoCharges;

  const adjustments: IfrsAdjustment[] = [
    {
      id: 'R1', norme: 'IAS 38', type: 'retraitement', montant: fraisEtab,
      fr: "Frais d'établissement / charges immobilisées",
      en: 'Capitalised establishment & set-up costs',
      impactResult: 0, impactEquity: -fraisEtab,
      detail: "Non capitalisables : sortis de l'actif, imputés aux réserves (VNC du compte 20).",
    },
    {
      id: 'R2', norme: 'IAS 21', type: 'retraitement', montant: ecartPassif,
      fr: 'Gains de change latents (écart de conversion passif)',
      en: 'Unrealised foreign-exchange gains',
      impactResult: ecartPassif, impactEquity: ecartPassif,
      detail: 'Reconnus en résultat (SYSCOHADA les diffère par prudence) — reclassés du passif circulant.',
    },
    {
      id: 'R3', norme: 'IAS 20', type: 'retraitement', montant: subvInv,
      fr: "Subventions d'investissement",
      en: 'Government grants related to assets',
      impactResult: 0, impactEquity: -subvInv,
      detail: 'Reclassées des capitaux propres vers les produits différés (passif non courant).',
    },
    {
      id: 'R4', norme: 'IAS 12', type: 'retraitement', montant: provRegl,
      fr: 'Impôt différé sur provisions réglementées',
      en: 'Deferred tax on regulated (tax-driven) provisions',
      impactResult: 0, impactEquity: -dtl,
      detail: `Provisions réglementées non assimilées à des capitaux propres : impôt différé passif à ${(taxRate * 100).toFixed(0)} %.`,
    },
    {
      id: 'R5', norme: 'IAS 1', type: 'reclassement', montant: netHAO,
      fr: 'Réintégration du HAO en résultat ordinaire',
      en: 'Reclassification of extraordinary items into ordinary result',
      impactResult: 0, impactEquity: 0,
      detail: 'IFRS interdit les éléments extraordinaires — le HAO est fusionné dans le résultat ordinaire (présentation).',
    },
  ];

  const resultSysco = n(sig.resultat);
  const resultIfrs = resultSysco + adjustments.reduce((s, a) => s + a.impactResult, 0);
  const equitySysco = g(bilan.passif, '_CP');
  const equityIfrs = equitySysco + adjustments.reduce((s, a) => s + a.impactEquity, 0);

  // ── SoFP IFRS (IAS 1 — current / non-current) ─────────────────────────
  const ae = g(bilan.actif, 'AE'), af = g(bilan.actif, 'AF'), ag = g(bilan.actif, 'AG');
  const bb = g(bilan.actif, 'BB'), bh = g(bilan.actif, 'BH'), bi = g(bilan.actif, 'BI'), ba = g(bilan.actif, 'BA'), bq = g(bilan.actif, 'BQ');
  const dj = g(bilan.passif, 'DJ'), dk = g(bilan.passif, 'DK'), dm = g(bilan.passif, 'DM'), dv = g(bilan.passif, 'DV');
  const da = g(bilan.passif, 'DA'), dp = g(bilan.passif, 'DP');

  const nonCurrentAssets: IfrsLine[] = [
    { code: 'NCA1', fr: 'Immobilisations incorporelles', en: 'Intangible assets', value: ae, indent: 1 },
    { code: 'NCA2', fr: 'Immobilisations corporelles', en: 'Property, plant & equipment', value: af, indent: 1 },
    { code: 'NCA3', fr: 'Actifs financiers', en: 'Financial assets', value: ag, indent: 1 },
    { code: 'NCA_T', fr: 'Total actifs non courants', en: 'Total non-current assets', value: ae + af + ag, total: true },
  ];
  const currentAssets: IfrsLine[] = [
    { code: 'CA1', fr: 'Stocks', en: 'Inventories', value: bb, indent: 1 },
    { code: 'CA2', fr: 'Clients', en: 'Trade receivables', value: bh, indent: 1 },
    { code: 'CA3', fr: 'Autres créances', en: 'Other receivables', value: bi + ba, indent: 1 },
    { code: 'CA4', fr: 'Trésorerie et équivalents', en: 'Cash & cash equivalents', value: bq, indent: 1 },
    { code: 'CA_T', fr: 'Total actifs courants', en: 'Total current assets', value: bb + bh + bi + ba + bq, total: true },
  ];
  const totalAssets = (ae + af + ag) + (bb + bh + bi + ba + bq);

  const equity: IfrsLine[] = [
    { code: 'EQ1', fr: 'Capital social', en: 'Share capital', value: g(bilan.passif, 'CA'), indent: 1 },
    { code: 'EQ2', fr: 'Primes et réserves', en: 'Share premium & reserves', value: g(bilan.passif, 'CD'), indent: 1 },
    { code: 'EQ3', fr: 'Retraitements IFRS (réserves)', en: 'IFRS adjustments (retained earnings)', value: -fraisEtab - subvInv - dtl, indent: 1 },
    { code: 'EQ4', fr: "Résultat net IFRS de l'exercice", en: 'Profit for the year (IFRS)', value: resultIfrs, indent: 1 },
    { code: 'EQ_T', fr: 'Total capitaux propres', en: 'Total equity', value: equityIfrs, total: true },
  ];
  const nonCurrentLiabilities: IfrsLine[] = [
    { code: 'NCL1', fr: 'Emprunts et dettes financières', en: 'Borrowings', value: da, indent: 1 },
    { code: 'NCL2', fr: 'Provisions', en: 'Provisions', value: dp, indent: 1 },
    { code: 'NCL3', fr: 'Produits différés (subventions)', en: 'Deferred income (grants)', value: subvInv, indent: 1 },
    { code: 'NCL4', fr: 'Impôts différés passifs', en: 'Deferred tax liabilities', value: dtl, indent: 1 },
    { code: 'NCL_T', fr: 'Total passifs non courants', en: 'Total non-current liabilities', value: da + dp + subvInv + dtl, total: true },
  ];
  const otherPayables = dm - ecartPassif; // 479 reclassé en capitaux propres (IAS 21)
  const currentLiabilities: IfrsLine[] = [
    { code: 'CL1', fr: 'Fournisseurs', en: 'Trade payables', value: dj, indent: 1 },
    { code: 'CL2', fr: 'Dettes fiscales et sociales', en: 'Tax & social liabilities', value: dk, indent: 1 },
    { code: 'CL3', fr: 'Autres dettes', en: 'Other payables', value: otherPayables, indent: 1 },
    { code: 'CL4', fr: 'Découverts bancaires', en: 'Bank overdrafts', value: dv, indent: 1 },
    { code: 'CL_T', fr: 'Total passifs courants', en: 'Total current liabilities', value: dj + dk + otherPayables + dv, total: true },
  ];
  const totalEquityAndLiabilities = equityIfrs + (da + dp + subvInv + dtl) + (dj + dk + otherPayables + dv);

  // ── Compte de résultat IFRS (par nature, HAO fusionné) ────────────────
  const pnl: IfrsLine[] = [
    { code: 'PL1', fr: "Chiffre d'affaires", en: 'Revenue', value: n(sig.ca), indent: 1 },
    { code: 'PL2', fr: 'Marge brute', en: 'Gross profit', value: n(sig.margeBrute), indent: 1 },
    { code: 'PL3', fr: "Excédent brut d'exploitation (EBITDA)", en: 'EBITDA', value: n(sig.ebe), indent: 1 },
    { code: 'PL4', fr: "Résultat opérationnel (EBIT)", en: 'Operating profit (EBIT)', value: n(sig.re) + netHAO, total: true, indent: 0 },
    { code: 'PL5', fr: 'Résultat financier', en: 'Net finance result', value: n(sig.rf), indent: 1 },
    { code: 'PL5b', fr: 'Gains de change latents (IAS 21)', en: 'Unrealised FX gains (IAS 21)', value: ecartPassif, indent: 1 },
    { code: 'PL6', fr: 'Résultat avant impôt', en: 'Profit before tax', value: n(sig.re) + netHAO + n(sig.rf) + ecartPassif, total: true },
    { code: 'PL7', fr: 'Impôt sur le résultat', en: 'Income tax expense', value: -n(sig.impot), indent: 1 },
    { code: 'PL8', fr: "Résultat net IFRS de l'exercice", en: 'Profit for the year (IFRS)', value: resultIfrs, total: true },
  ];

  // ── Ponts de réconciliation (type IFRS 1) ─────────────────────────────
  const reconResult: IfrsLine[] = [
    { code: 'RR0', fr: 'Résultat net SYSCOHADA', en: 'Profit under SYSCOHADA', value: resultSysco, total: true },
    ...adjustments.filter((a) => a.impactResult !== 0).map((a) => ({ code: a.id, fr: `${a.norme} — ${a.fr}`, en: `${a.norme} — ${a.en}`, value: a.impactResult, indent: 1 })),
    { code: 'RR_T', fr: 'Résultat net IFRS', en: 'Profit under IFRS', value: resultIfrs, total: true },
  ];
  const reconEquity: IfrsLine[] = [
    { code: 'RE0', fr: 'Capitaux propres SYSCOHADA', en: 'Equity under SYSCOHADA', value: equitySysco, total: true },
    ...adjustments.filter((a) => a.impactEquity !== 0).map((a) => ({ code: a.id, fr: `${a.norme} — ${a.fr}`, en: `${a.norme} — ${a.en}`, value: a.impactEquity, indent: 1 })),
    { code: 'RE_T', fr: 'Capitaux propres IFRS (Equity)', en: 'Equity under IFRS', value: equityIfrs, total: true },
  ];

  return {
    taxRate, adjustments,
    sofp: { nonCurrentAssets, currentAssets, equity, nonCurrentLiabilities, currentLiabilities, totalAssets, totalEquityAndLiabilities },
    pnl, reconEquity, reconResult,
    equitySysco, equityIfrs, resultSysco, resultIfrs,
  };
}
