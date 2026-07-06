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

export type IfrsLine = { code: string; fr: string; en: string; value: number; total?: boolean; indent?: number; ref?: string };
export type IfrsLineC = IfrsLine & { prior: number };
export type IfrsNote = { id: string; ref: string; titleFr: string; titleEn: string; bodyFr: string; bodyEn: string };

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

// ═══════════════════════════════════════════════════════════════════════════
// LIASSE IFRS COMPARATIVE (niveau « GT Example Financial Statements »)
// Jeu complet : P&L · OCI · SoFP · Variation des CP · Flux (indirect), en
// comparatif N / N-1, avec références IAS/IFRS et notes.
// ═══════════════════════════════════════════════════════════════════════════

// Références normatives par code de ligne (extraites du référentiel IAS 1 / IFRS).
const REFS: Record<string, string> = {
  PL1: 'IAS 1.82(a)', PL4: 'IAS 1.85', PL6: 'IAS 1.85', PL7: 'IAS 1.82(d)', PL8: 'IAS 1.81A(a)',
  NCA1: 'IAS 1.54(c)', NCA2: 'IAS 1.54(a)', NCA3: 'IAS 1.54(e)', NCA4: 'IFRS 16.47', NCA5: 'IAS 1.54(o)',
  CA1: 'IAS 1.54(g)', CA2: 'IAS 1.54(h)', CA4: 'IAS 1.54(i)',
  EQ1: 'IAS 1.78(e)', EQ2: 'IAS 1.78(e)', EQ4: 'IAS 1.54(r)',
  NCL1: 'IAS 1.54(m)', NCL3: 'IAS 20.24', NCL4: 'IAS 1.54(o)', NCL5: 'IFRS 16.47(b)', NCL6: 'IAS 1.55', NCL7: 'IAS 1.54(o)',
  CL1: 'IAS 1.54(k)', CL2: 'IAS 1.54(l)', CL4: 'IAS 1.54(m)',
};

export type IfrsReport = {
  yearN: number; yearN1: number; taxRate: number;
  hasPrior: boolean;
  adjustments: IfrsAdjustment[];
  pnl: IfrsLineC[];
  oci: IfrsLineC[];
  sofpNCA: IfrsLineC[]; sofpCA: IfrsLineC[]; sofpEquity: IfrsLineC[]; sofpNCL: IfrsLineC[]; sofpCL: IfrsLineC[];
  totalAssetsN: number; totalAssetsN1: number; totalELN: number; totalELN1: number;
  cashflow: IfrsLineC[];
  sce: { components: string[]; rows: { label: string; values: number[] }[] };
  reconEquity: IfrsLineC[]; reconResult: IfrsLineC[];
  notes: IfrsNote[];
  equityIfrsN: number; resultIfrsN: number;
};

function zip(nLines: IfrsLine[], pLines: IfrsLine[]): IfrsLineC[] {
  const p = new Map(pLines.map((l) => [l.code, l.value]));
  return nLines.map((l) => ({ ...l, prior: n(p.get(l.code) ?? 0), ref: l.ref ?? REFS[l.code] }));
}

// Agrégats nécessaires au tableau de flux (méthode indirecte).
function snap(balance: BalanceRow[]) {
  const { sig } = computeSIG(balance);
  const bilan = computeBilan(balance);
  const g = (lines: { code: string; value: number }[], code: string) => n(lines.find((l) => l.code === code)?.value ?? 0);
  const netD = (re: RegExp) => balance.filter((r) => re.test(r.account)).reduce((s, r) => s + (r.soldeD - r.soldeC), 0);
  const netC = (re: RegExp) => balance.filter((r) => re.test(r.account)).reduce((s, r) => s + (r.soldeC - r.soldeD), 0);
  return {
    stocks: g(bilan.actif, 'BB'),
    creances: g(bilan.actif, 'BH') + g(bilan.actif, 'BI'),
    dettesExpl: g(bilan.passif, 'DJ') + g(bilan.passif, 'DK') + g(bilan.passif, 'DM'),
    immoNet: g(bilan.actif, 'AE') + g(bilan.actif, 'AF') + g(bilan.actif, 'AG'),
    borrowings: g(bilan.passif, 'DA'),
    capital: g(bilan.passif, 'CA') + n(netC(/^105/)),
    cash: g(bilan.actif, 'BQ'),
    amort: Math.max(0, netD(/^68/)),
    dividendes: Math.max(0, netD(/^465/)),
    pbt: n(sig.resultat) + n(sig.impot),
    impot: n(sig.impot),
    resultat: n(sig.resultat),
  };
}

export function computeIfrsReport(
  balanceN: BalanceRow[],
  balanceN1: BalanceRow[] | null,
  yearN: number,
  opts?: { taxRate?: number; manual?: IfrsManualInputs },
): IfrsReport {
  const cN = computeIfrsConversion(balanceN, opts);
  const hasPrior = !!(balanceN1 && balanceN1.length);
  const cP = hasPrior ? computeIfrsConversion(balanceN1!, opts) : cN;

  const pnl = zip(cN.pnl, hasPrior ? cP.pnl : cN.pnl.map((l) => ({ ...l, value: 0 })));
  const sofpNCA = zip(cN.sofp.nonCurrentAssets, hasPrior ? cP.sofp.nonCurrentAssets : cN.sofp.nonCurrentAssets.map((l) => ({ ...l, value: 0 })));
  const sofpCA = zip(cN.sofp.currentAssets, hasPrior ? cP.sofp.currentAssets : cN.sofp.currentAssets.map((l) => ({ ...l, value: 0 })));
  const sofpEquity = zip(cN.sofp.equity, hasPrior ? cP.sofp.equity : cN.sofp.equity.map((l) => ({ ...l, value: 0 })));
  const sofpNCL = zip(cN.sofp.nonCurrentLiabilities, hasPrior ? cP.sofp.nonCurrentLiabilities : cN.sofp.nonCurrentLiabilities.map((l) => ({ ...l, value: 0 })));
  const sofpCL = zip(cN.sofp.currentLiabilities, hasPrior ? cP.sofp.currentLiabilities : cN.sofp.currentLiabilities.map((l) => ({ ...l, value: 0 })));

  // ── OCI (autres éléments du résultat global) ──────────────────────────
  const ociItem = (code: string, fr: string, en: string, v: number, vp: number, indent = 1, total = false): IfrsLineC => ({ code, fr, en, value: v, prior: vp, indent, total });
  const oci: IfrsLineC[] = [
    ociItem('OCI0', "Résultat net de l'exercice", 'Profit for the year', cN.resultIfrs, hasPrior ? cP.resultIfrs : 0, 0, true),
    ociItem('OCIh1', 'Éléments non reclassés en résultat', 'Items not reclassified to P&L', 0, 0, 0),
    ociItem('OCI1', 'Réévaluation des immobilisations (IAS 16)', 'Revaluation of PP&E (IAS 16)', 0, 0),
    ociItem('OCI2', 'Réévaluation du passif net (IAS 19)', 'Remeasurement of net defined benefit (IAS 19)', 0, 0),
    ociItem('OCIh2', 'Éléments reclassables en résultat', 'Items that may be reclassified to P&L', 0, 0, 0),
    ociItem('OCI3', 'Écarts de conversion des activités étrangères (IAS 21)', 'FX on foreign operations (IAS 21)', 0, 0),
    ociItem('OCI_T', "Autres éléments du résultat global, nets d'impôt", 'Other comprehensive income, net of tax', 0, 0, 0, true),
    ociItem('OCI_TC', 'Résultat global total', 'Total comprehensive income', cN.resultIfrs, hasPrior ? cP.resultIfrs : 0, 0, true),
  ];

  // ── Tableau de flux de trésorerie (méthode indirecte) ─────────────────
  const sN = snap(balanceN);
  const sP = hasPrior ? snap(balanceN1!) : null;
  const dWC = sP ? {
    stocks: -(sN.stocks - sP.stocks), creances: -(sN.creances - sP.creances), dettes: (sN.dettesExpl - sP.dettesExpl),
    immo: -((sN.immoNet - sP.immoNet) + sN.amort), borrow: (sN.borrowings - sP.borrowings), cap: (sN.capital - sP.capital),
  } : { stocks: 0, creances: 0, dettes: 0, immo: -sN.amort, borrow: 0, cap: 0 };
  const netOp = sN.pbt + sN.amort + dWC.stocks + dWC.creances + dWC.dettes - sN.impot;
  const netInv = dWC.immo;
  const netFin = dWC.borrow + dWC.cap - sN.dividendes;
  const netChange = netOp + netInv + netFin;
  const cf = (code: string, fr: string, en: string, v: number, indent = 1, total = false, ref?: string): IfrsLineC => ({ code, fr, en, value: v, prior: 0, indent, total, ref });
  const cashflow: IfrsLineC[] = [
    cf('CF_OPh', 'FLUX DE TRÉSORERIE OPÉRATIONNELS', 'OPERATING ACTIVITIES', 0, 0, false, 'IAS 7.10'),
    cf('CF1', 'Résultat avant impôt', 'Profit before tax', sN.pbt),
    cf('CF2', 'Dotations aux amortissements & provisions', 'Non-cash adjustments (D&A)', sN.amort, 1, false, 'IAS 7.20'),
    cf('CF3', 'Variation des stocks', 'Change in inventories', dWC.stocks),
    cf('CF4', 'Variation des créances', 'Change in receivables', dWC.creances),
    cf('CF5', "Variation des dettes d'exploitation", 'Change in payables', dWC.dettes),
    cf('CF6', 'Impôt payé', 'Taxes paid', -sN.impot, 1, false, 'IAS 7.35'),
    cf('CF_OP', "Flux net des activités opérationnelles", 'Net cash from operating activities', netOp, 0, true),
    cf('CF_INVh', "FLUX DE TRÉSORERIE D'INVESTISSEMENT", 'INVESTING ACTIVITIES', 0, 0, false, 'IAS 7.10'),
    cf('CF7', "Acquisitions d'immobilisations (net)", 'Purchase of non-current assets (net)', dWC.immo, 1, false, 'IAS 7.16'),
    cf('CF_INV', "Flux net des activités d'investissement", 'Net cash used in investing activities', netInv, 0, true),
    cf('CF_FINh', 'FLUX DE TRÉSORERIE DE FINANCEMENT', 'FINANCING ACTIVITIES', 0, 0, false, 'IAS 7.10'),
    cf('CF8', 'Variation des emprunts', 'Change in borrowings', dWC.borrow, 1, false, 'IAS 7.17'),
    cf('CF9', 'Variation du capital', 'Change in share capital', dWC.cap),
    cf('CF10', 'Dividendes versés', 'Dividends paid', -sN.dividendes),
    cf('CF_FIN', 'Flux net des activités de financement', 'Net cash from financing activities', netFin, 0, true),
    cf('CF_NET', 'Variation nette de trésorerie', 'Net change in cash', netChange, 0, true, 'IAS 7.45'),
    cf('CF_OPEN', "Trésorerie à l'ouverture", 'Cash at beginning of year', sP ? sP.cash : 0),
    cf('CF_CLOSE', 'Trésorerie à la clôture', 'Cash at end of year', (sP ? sP.cash : 0) + netChange, 0, true),
  ];

  // ── Variation des capitaux propres (SCE) ──────────────────────────────
  const eqN = cN.equityIfrs, eqP = hasPrior ? cP.equityIfrs : 0;
  const other = eqN - eqP - cN.resultIfrs; // mouvements avec les actionnaires (solde)
  const sce = {
    components: ['Capital', 'Réserves', 'Résultat', 'Total'],
    rows: [
      { label: hasPrior ? `Solde au 1er janvier ${yearN}` : 'Solde à l\'ouverture', values: [zipVal(sofpEquity, 'EQ1', 'prior'), zipVal(sofpEquity, 'EQ2', 'prior') + zipVal(sofpEquity, 'EQ3', 'prior'), 0, eqP] },
      { label: "Résultat de l'exercice", values: [0, 0, cN.resultIfrs, cN.resultIfrs] },
      { label: 'Opérations avec les actionnaires', values: [0, other, 0, other] },
      { label: `Solde au 31 décembre ${yearN}`, values: [zipVal(sofpEquity, 'EQ1', 'value'), zipVal(sofpEquity, 'EQ2', 'value') + zipVal(sofpEquity, 'EQ3', 'value'), cN.resultIfrs, eqN] },
    ],
  };

  const reconEquity = zip(cN.reconEquity, hasPrior ? cP.reconEquity : cN.reconEquity.map((l) => ({ ...l, value: 0 })));
  const reconResult = zip(cN.reconResult, hasPrior ? cP.reconResult : cN.reconResult.map((l) => ({ ...l, value: 0 })));

  const notes = buildNotes(cN, yearN);

  return {
    yearN, yearN1: yearN - 1, taxRate: cN.taxRate, hasPrior,
    adjustments: cN.adjustments,
    pnl, oci, sofpNCA, sofpCA, sofpEquity, sofpNCL, sofpCL,
    totalAssetsN: cN.sofp.totalAssets, totalAssetsN1: hasPrior ? cP.sofp.totalAssets : 0,
    totalELN: cN.sofp.totalEquityAndLiabilities, totalELN1: hasPrior ? cP.sofp.totalEquityAndLiabilities : 0,
    cashflow, sce, reconEquity, reconResult, notes,
    equityIfrsN: cN.equityIfrs, resultIfrsN: cN.resultIfrs,
  };
}

function zipVal(lines: IfrsLineC[], code: string, field: 'value' | 'prior'): number {
  const l = lines.find((x) => x.code === code);
  return l ? n(l[field]) : 0;
}

function buildNotes(c: IfrsConversion, year: number): IfrsNote[] {
  const notes: IfrsNote[] = [
    {
      id: '1', ref: 'IAS 1.16 · IAS 1.117',
      titleFr: 'Base de préparation', titleEn: 'Basis of preparation',
      bodyFr: `Ces états financiers convertissent la comptabilité SYSCOHADA révisé (AUDCIF) de l'exercice ${year} vers un référentiel IFRS. La conversion applique un reclassement de présentation (IAS 1 : distinction courant/non courant, suppression du HAO) et des retraitements de fond. Les montants sont exprimés dans la devise de tenue de comptabilité.`,
      bodyEn: `These financial statements convert the ${year} revised SYSCOHADA (AUDCIF) accounts to an IFRS basis. The conversion applies IAS 1 presentation reclassification (current/non-current split, removal of extraordinary items) and substantive adjustments. Amounts are expressed in the reporting currency.`,
    },
    {
      id: '2', ref: 'IAS 8',
      titleFr: 'Principales méthodes comptables', titleEn: 'Material accounting policies',
      bodyFr: `Immobilisations au coût amorti (IAS 16 / IAS 38) ; contrats de location capitalisés en droit d'usage et dette (IFRS 16) ; instruments financiers évalués selon IFRS 9 (dépréciation en pertes attendues) ; impôts différés sur différences temporelles (IAS 12) ; avantages du personnel selon IAS 19.`,
      bodyEn: `Non-current assets at amortised cost (IAS 16 / IAS 38); leases capitalised as right-of-use assets and liabilities (IFRS 16); financial instruments measured under IFRS 9 (expected credit loss); deferred tax on temporary differences (IAS 12); employee benefits under IAS 19.`,
    },
    {
      id: '3', ref: 'IFRS 1',
      titleFr: 'Retraitements de conversion', titleEn: 'Conversion adjustments',
      bodyFr: `Les retraitements appliqués (impact sur les capitaux propres) sont : ${c.adjustments.filter((a) => a.impactEquity !== 0).map((a) => `${a.norme} (${Math.round(a.impactEquity).toLocaleString('fr-FR')})`).join(' ; ') || 'aucun'}. Le détail figure dans le pont de réconciliation.`,
      bodyEn: `The applied adjustments (equity impact) are: ${c.adjustments.filter((a) => a.impactEquity !== 0).map((a) => `${a.norme} (${Math.round(a.impactEquity).toLocaleString('en-US')})`).join('; ') || 'none'}. Details are in the reconciliation bridge.`,
    },
    {
      id: '4', ref: 'IAS 12',
      titleFr: 'Impôts différés', titleEn: 'Deferred tax',
      bodyFr: `Les impôts différés sont calculés au taux de ${(c.taxRate * 100).toFixed(0)} % sur les différences temporelles et les provisions réglementées non reconnues en IFRS.`,
      bodyEn: `Deferred tax is measured at ${(c.taxRate * 100).toFixed(0)}% on temporary differences and on regulated provisions not recognised under IFRS.`,
    },
    {
      id: '5', ref: 'IAS 10 · IAS 1.138',
      titleFr: "Événements postérieurs & autorisation", titleEn: 'Events after reporting date & authorisation',
      bodyFr: `Aucun événement postérieur significatif retenu. Conversion indicative de gestion — un reporting IFRS audité requiert la validation des retraitements et le complément des postes hors périmètre par un cabinet.`,
      bodyEn: `No material subsequent events noted. Indicative management conversion — audited IFRS reporting requires validation of adjustments and completion of out-of-scope items by an audit firm.`,
    },
  ];
  return notes;
}
