// Conversion SYSCOHADA révisé (AUDCIF) → IFRS
// -------------------------------------------------------------------------
// La révision 2017 de l'AUDCIF a convergé vers les IFRS : la conversion combine
//   (1) un reclassement de présentation (IAS 1 : current/non-current, HAO),
//   (2) des retraitements AUTO-DÉTECTÉS depuis la balance (IAS 38/21/20/12),
//   (3) des retraitements MANUELS (IFRS 16 / IAS 19 / IAS 12 complet / IFRS 9)
//       alimentés par des inputs externes fournis par l'utilisateur.
//
// Chaque retraitement est ÉQUILIBRÉ : impactEquity = ΔActif − ΔPassif, ce qui
// garantit que le SoFP IFRS reste équilibré (vérifié par ifrs.test.ts).
import type { BalanceRow } from './balance';
import { computeBilan, computeSIG } from './statements';

export const IFRS_TAX_RATE = 0.27; // taux IS moyen UEMOA (paramétrable)

export type IfrsManualInputs = {
  ifrs16: { annualPayment: number; termYears: number; rate: number }; // contrats de location
  ias19: { obligation: number; alreadyProvided: number };            // engagements de retraite (IDR)
  ias12: { temporaryDifferences: number };                           // diff. temporelles nettes (imposables +)
  ifrs9: { eclRate: number };                                        // taux de perte attendue (% créances)
};

export const DEFAULT_MANUAL: IfrsManualInputs = {
  ifrs16: { annualPayment: 0, termYears: 0, rate: 0.08 },
  ias19: { obligation: 0, alreadyProvided: 0 },
  ias12: { temporaryDifferences: 0 },
  ifrs9: { eclRate: 0 },
};

export type IfrsAdjustment = {
  id: string;
  norme: string;
  fr: string;
  en: string;
  montant: number;
  impactResult: number;
  impactEquity: number;
  dAssetNC: number; dAssetC: number; dLiabNC: number; dLiabC: number;
  type: 'retraitement' | 'reclassement' | 'manuel';
  detail: string;
};

export type IfrsLine = { code: string; fr: string; en: string; value: number; total?: boolean; indent?: number };

export type IfrsConversion = {
  taxRate: number;
  adjustments: IfrsAdjustment[];
  sofp: {
    nonCurrentAssets: IfrsLine[]; currentAssets: IfrsLine[]; equity: IfrsLine[];
    nonCurrentLiabilities: IfrsLine[]; currentLiabilities: IfrsLine[];
    totalAssets: number; totalEquityAndLiabilities: number;
  };
  pnl: IfrsLine[];
  reconEquity: IfrsLine[];
  reconResult: IfrsLine[];
  equitySysco: number; equityIfrs: number; resultSysco: number; resultIfrs: number;
};

const n = (v: number) => (Number.isFinite(v) ? v : 0);
const sum = (lines: IfrsLine[]) => lines.filter((l) => !l.total).reduce((s, l) => s + n(l.value), 0);

export function computeIfrsConversion(
  balance: BalanceRow[],
  opts?: { taxRate?: number; manual?: IfrsManualInputs },
): IfrsConversion {
  const taxRate = opts?.taxRate ?? IFRS_TAX_RATE;
  const manual = opts?.manual ?? DEFAULT_MANUAL;
  const { sig } = computeSIG(balance);
  const bilan = computeBilan(balance);
  const g = (lines: { code: string; value: number }[], code: string) => n(lines.find((l) => l.code === code)?.value ?? 0);
  const soldeD = (...p: string[]) => balance.filter((r) => p.some((x) => r.account.startsWith(x))).reduce((s, r) => s + r.soldeD, 0);
  const soldeC = (...p: string[]) => balance.filter((r) => p.some((x) => r.account.startsWith(x))).reduce((s, r) => s + r.soldeC, 0);

  // ── Postes SYSCOHADA ──────────────────────────────────────────────────
  const fraisEtab = g(bilan.actif, 'AD');
  const ecartPassif = n(soldeC('479'));
  const subvInv = n(soldeC('14'));
  const provRegl = n(soldeC('15'));
  const dtlRegl = provRegl * taxRate;
  const haoCharges = n(soldeD('81', '83', '85', '87'));
  const haoProduits = n(soldeC('82', '84', '86', '88'));
  const netHAO = haoProduits - haoCharges;
  const tradeReceivables = g(bilan.actif, 'BH');

  const A = (a: Omit<IfrsAdjustment, 'dAssetNC' | 'dAssetC' | 'dLiabNC' | 'dLiabC'> & Partial<Pick<IfrsAdjustment, 'dAssetNC' | 'dAssetC' | 'dLiabNC' | 'dLiabC'>>): IfrsAdjustment => ({
    dAssetNC: 0, dAssetC: 0, dLiabNC: 0, dLiabC: 0, ...a,
  });

  const adjustments: IfrsAdjustment[] = [
    A({ id: 'R1', norme: 'IAS 38', type: 'retraitement', montant: fraisEtab, fr: "Frais d'établissement / charges immobilisées", en: 'Capitalised establishment & set-up costs', impactResult: 0, impactEquity: -fraisEtab, dAssetNC: -fraisEtab, detail: "Non capitalisables : sortis de l'actif, imputés aux réserves (VNC du compte 20)." }),
    A({ id: 'R2', norme: 'IAS 21', type: 'retraitement', montant: ecartPassif, fr: 'Gains de change latents (écart de conversion passif)', en: 'Unrealised foreign-exchange gains', impactResult: ecartPassif, impactEquity: ecartPassif, dLiabC: -ecartPassif, detail: 'Reconnus en résultat (SYSCOHADA les diffère par prudence) — reclassés du passif circulant.' }),
    A({ id: 'R3', norme: 'IAS 20', type: 'retraitement', montant: subvInv, fr: "Subventions d'investissement", en: 'Government grants related to assets', impactResult: 0, impactEquity: -subvInv, dLiabNC: subvInv, detail: 'Reclassées des capitaux propres vers les produits différés (passif non courant).' }),
    A({ id: 'R4', norme: 'IAS 12', type: 'retraitement', montant: provRegl, fr: 'Impôt différé sur provisions réglementées', en: 'Deferred tax on regulated provisions', impactResult: 0, impactEquity: -dtlRegl, dLiabNC: dtlRegl, detail: `Provisions réglementées non assimilées à des capitaux propres : impôt différé passif à ${(taxRate * 100).toFixed(0)} %.` }),
    A({ id: 'R5', norme: 'IAS 1', type: 'reclassement', montant: netHAO, fr: 'Réintégration du HAO en résultat ordinaire', en: 'Reclassification of extraordinary items', impactResult: 0, impactEquity: 0, detail: 'IFRS interdit les éléments extraordinaires — le HAO est fusionné dans le résultat ordinaire (présentation).' }),
  ];

  // ── Retraitements MANUELS (inputs externes) ───────────────────────────
  // IFRS 16 — location : dette = valeur actualisée des loyers ; ROU ≈ dette.
  const { annualPayment, termYears, rate } = manual.ifrs16;
  const leaseLiab = annualPayment > 0 && termYears > 0
    ? (rate > 0 ? annualPayment * (1 - Math.pow(1 + rate, -termYears)) / rate : annualPayment * termYears)
    : 0;
  if (leaseLiab > 0) {
    adjustments.push(A({ id: 'R6', norme: 'IFRS 16', type: 'manuel', montant: leaseLiab, fr: "Contrats de location (droit d'usage & dette)", en: 'Leases (right-of-use asset & liability)', impactResult: 0, impactEquity: 0, dAssetNC: leaseLiab, dLiabNC: leaseLiab, detail: `Loyers ${annualPayment.toLocaleString('fr-FR')} × ${termYears} ans actualisés à ${(rate * 100).toFixed(1)} % → droit d'usage + dette de location.` }));
  }
  // IAS 19 — retraite : provision complémentaire = obligation − déjà provisionné.
  const ias19Add = Math.max(0, n(manual.ias19.obligation) - n(manual.ias19.alreadyProvided));
  if (ias19Add > 0) {
    adjustments.push(A({ id: 'R7', norme: 'IAS 19', type: 'manuel', montant: ias19Add, fr: 'Engagements de retraite (IDR)', en: 'Employee benefits (retirement)', impactResult: 0, impactEquity: -ias19Add, dLiabNC: ias19Add, detail: 'Provision actuarielle complémentaire par rapport au montant déjà comptabilisé.' }));
  }
  // IAS 12 complet — impôt différé sur différences temporelles (imposables → DTL).
  const dtNet = n(manual.ias12.temporaryDifferences) * taxRate;
  if (Math.abs(dtNet) > 0.5) {
    const isLiab = dtNet > 0;
    adjustments.push(A({ id: 'R8', norme: 'IAS 12', type: 'manuel', montant: Math.abs(dtNet), fr: `Impôts différés sur différences temporelles (${isLiab ? 'passif' : 'actif'})`, en: `Deferred tax on temporary differences (${isLiab ? 'liability' : 'asset'})`, impactResult: 0, impactEquity: isLiab ? -dtNet : -dtNet, dLiabNC: isLiab ? dtNet : 0, dAssetNC: isLiab ? 0 : -dtNet, detail: `Différences temporelles nettes × ${(taxRate * 100).toFixed(0)} %.` }));
  }
  // IFRS 9 — ECL : dépréciation attendue complémentaire sur les créances clients.
  const ecl = Math.max(0, tradeReceivables * n(manual.ifrs9.eclRate));
  if (ecl > 0) {
    adjustments.push(A({ id: 'R9', norme: 'IFRS 9', type: 'manuel', montant: ecl, fr: 'Dépréciation attendue des créances (ECL)', en: 'Expected credit loss on receivables', impactResult: 0, impactEquity: -ecl, dAssetC: -ecl, detail: `${(manual.ifrs9.eclRate * 100).toFixed(1)} % des créances clients (perte de crédit attendue).` }));
  }

  const resultSysco = n(sig.resultat);
  const resultIfrs = resultSysco + adjustments.reduce((s, a) => s + a.impactResult, 0);
  const equitySysco = g(bilan.passif, '_CP');
  const equityIfrs = equitySysco + adjustments.reduce((s, a) => s + a.impactEquity, 0);
  const totalReserveAdj = adjustments.reduce((s, a) => s + a.impactEquity - a.impactResult, 0);

  // ── SoFP IFRS (IAS 1) ─────────────────────────────────────────────────
  const ae = g(bilan.actif, 'AE'), af = g(bilan.actif, 'AF'), ag = g(bilan.actif, 'AG');
  const bb = g(bilan.actif, 'BB'), bh = g(bilan.actif, 'BH'), bi = g(bilan.actif, 'BI'), ba = g(bilan.actif, 'BA'), bq = g(bilan.actif, 'BQ');
  const dj = g(bilan.passif, 'DJ'), dk = g(bilan.passif, 'DK'), dm = g(bilan.passif, 'DM'), dv = g(bilan.passif, 'DV');
  const da = g(bilan.passif, 'DA'), dp = g(bilan.passif, 'DP');
  const dta = adjustments.filter((a) => a.dAssetNC > 0 && a.id === 'R8').reduce((s, a) => s + a.dAssetNC, 0);

  const nonCurrentAssets: IfrsLine[] = [
    { code: 'NCA1', fr: 'Immobilisations incorporelles', en: 'Intangible assets', value: ae, indent: 1 },
    { code: 'NCA2', fr: 'Immobilisations corporelles', en: 'Property, plant & equipment', value: af, indent: 1 },
    { code: 'NCA3', fr: 'Actifs financiers', en: 'Financial assets', value: ag, indent: 1 },
    ...(leaseLiab > 0 ? [{ code: 'NCA4', fr: "Droit d'usage (IFRS 16)", en: 'Right-of-use asset (IFRS 16)', value: leaseLiab, indent: 1 }] : []),
    ...(dta > 0 ? [{ code: 'NCA5', fr: 'Impôts différés actifs', en: 'Deferred tax assets', value: dta, indent: 1 }] : []),
  ];
  nonCurrentAssets.push({ code: 'NCA_T', fr: 'Total actifs non courants', en: 'Total non-current assets', value: sum(nonCurrentAssets), total: true });

  const currentAssets: IfrsLine[] = [
    { code: 'CA1', fr: 'Stocks', en: 'Inventories', value: bb, indent: 1 },
    { code: 'CA2', fr: 'Clients', en: 'Trade receivables', value: bh, indent: 1 },
    ...(ecl > 0 ? [{ code: 'CA2b', fr: 'Dépréciation attendue (IFRS 9)', en: 'Expected credit loss (IFRS 9)', value: -ecl, indent: 1 }] : []),
    { code: 'CA3', fr: 'Autres créances', en: 'Other receivables', value: bi + ba, indent: 1 },
    { code: 'CA4', fr: 'Trésorerie et équivalents', en: 'Cash & cash equivalents', value: bq, indent: 1 },
  ];
  currentAssets.push({ code: 'CA_T', fr: 'Total actifs courants', en: 'Total current assets', value: sum(currentAssets), total: true });

  const equity: IfrsLine[] = [
    { code: 'EQ1', fr: 'Capital social', en: 'Share capital', value: g(bilan.passif, 'CA'), indent: 1 },
    { code: 'EQ2', fr: 'Réserves (SYSCOHADA)', en: 'Reserves (SYSCOHADA)', value: g(bilan.passif, 'CD') + subvInv + provRegl, indent: 1 },
    { code: 'EQ3', fr: 'Retraitements IFRS', en: 'IFRS adjustments', value: totalReserveAdj, indent: 1 },
    { code: 'EQ4', fr: "Résultat net IFRS de l'exercice", en: 'Profit for the year (IFRS)', value: resultIfrs, indent: 1 },
    { code: 'EQ_T', fr: 'Total capitaux propres', en: 'Total equity', value: equityIfrs, total: true },
  ];

  const nonCurrentLiabilities: IfrsLine[] = [
    { code: 'NCL1', fr: 'Emprunts et dettes financières', en: 'Borrowings', value: da, indent: 1 },
    { code: 'NCL2', fr: 'Provisions', en: 'Provisions', value: dp, indent: 1 },
    ...(subvInv > 0 ? [{ code: 'NCL3', fr: 'Produits différés (subventions)', en: 'Deferred income (grants)', value: subvInv, indent: 1 }] : []),
    ...(dtlRegl > 0 ? [{ code: 'NCL4', fr: 'Impôts différés (prov. réglementées)', en: 'Deferred tax (regulated provisions)', value: dtlRegl, indent: 1 }] : []),
    ...(leaseLiab > 0 ? [{ code: 'NCL5', fr: 'Dette de location (IFRS 16)', en: 'Lease liability (IFRS 16)', value: leaseLiab, indent: 1 }] : []),
    ...(ias19Add > 0 ? [{ code: 'NCL6', fr: 'Provision retraite (IAS 19)', en: 'Retirement provision (IAS 19)', value: ias19Add, indent: 1 }] : []),
    ...(dtNet > 0 ? [{ code: 'NCL7', fr: 'Impôts différés (IAS 12)', en: 'Deferred tax (IAS 12)', value: dtNet, indent: 1 }] : []),
  ];
  nonCurrentLiabilities.push({ code: 'NCL_T', fr: 'Total passifs non courants', en: 'Total non-current liabilities', value: sum(nonCurrentLiabilities), total: true });

  const otherPayables = dm - ecartPassif;
  const currentLiabilities: IfrsLine[] = [
    { code: 'CL1', fr: 'Fournisseurs', en: 'Trade payables', value: dj, indent: 1 },
    { code: 'CL2', fr: 'Dettes fiscales et sociales', en: 'Tax & social liabilities', value: dk, indent: 1 },
    { code: 'CL3', fr: 'Autres dettes', en: 'Other payables', value: otherPayables, indent: 1 },
    { code: 'CL4', fr: 'Découverts bancaires', en: 'Bank overdrafts', value: dv, indent: 1 },
  ];
  currentLiabilities.push({ code: 'CL_T', fr: 'Total passifs courants', en: 'Total current liabilities', value: sum(currentLiabilities), total: true });

  // Écart de balance : le bilan SYSCOHADA sous-jacent peut être déséquilibré
  // (pièces GL / à-nouveaux non équilibrés). On ajoute une ligne d'écart visible
  // du côté déficitaire pour que le SoFP IFRS reste présenté équilibré (et signale
  // l'anomalie source plutôt que de la masquer).
  const residual = (equityIfrs + sum(nonCurrentLiabilities) + sum(currentLiabilities)) - (sum(nonCurrentAssets) + sum(currentAssets));
  if (Math.abs(residual) > 1) {
    const line: IfrsLine = { code: 'EC', fr: '⚠ Écart de balance (données source)', en: '⚠ Balance mismatch (source data)', value: Math.abs(residual), indent: 1 };
    const target = residual > 0 ? currentAssets : currentLiabilities;
    target.splice(target.length - 1, 0, line);                       // avant la ligne de total
    target[target.length - 1] = { ...target[target.length - 1], value: sum(target) };
  }

  const totalAssets = sum(nonCurrentAssets) + sum(currentAssets);
  const totalEquityAndLiabilities = equityIfrs + sum(nonCurrentLiabilities) + sum(currentLiabilities);

  // ── Compte de résultat IFRS ───────────────────────────────────────────
  const pnl: IfrsLine[] = [
    { code: 'PL1', fr: "Chiffre d'affaires", en: 'Revenue', value: n(sig.ca), indent: 1 },
    { code: 'PL2', fr: 'Marge brute', en: 'Gross profit', value: n(sig.margeBrute), indent: 1 },
    { code: 'PL3', fr: "Excédent brut d'exploitation (EBITDA)", en: 'EBITDA', value: n(sig.ebe), indent: 1 },
    { code: 'PL4', fr: 'Résultat opérationnel (EBIT)', en: 'Operating profit (EBIT)', value: n(sig.re) + netHAO, total: true },
    { code: 'PL5', fr: 'Résultat financier', en: 'Net finance result', value: n(sig.rf), indent: 1 },
    { code: 'PL5b', fr: 'Gains de change latents (IAS 21)', en: 'Unrealised FX gains (IAS 21)', value: ecartPassif, indent: 1 },
    { code: 'PL6', fr: 'Résultat avant impôt', en: 'Profit before tax', value: n(sig.re) + netHAO + n(sig.rf) + ecartPassif, total: true },
    { code: 'PL7', fr: 'Impôt sur le résultat', en: 'Income tax expense', value: -n(sig.impot), indent: 1 },
    { code: 'PL8', fr: "Résultat net IFRS de l'exercice", en: 'Profit for the year (IFRS)', value: resultIfrs, total: true },
  ];

  // ── Ponts de réconciliation (IFRS 1) ──────────────────────────────────
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
