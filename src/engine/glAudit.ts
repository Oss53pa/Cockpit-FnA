// Audit complet du Grand Livre — détecte 15+ catégories d'anomalies
// comptables et de qualité des données. Conforme aux contrôles SYSCOHADA
// et aux meilleures pratiques d'audit comptable.
//
// Source de données : Supabase via dataProvider (obligatoire).
import type { GLEntry } from '../db/schema';
import { dataProvider } from '../db/provider';

export type Severity = 'critical' | 'major' | 'minor' | 'info';

export interface AuditFinding {
  id: string;
  category: string;
  severity: Severity;
  title: string;
  description: string;
  count: number;
  total?: number;          // montant total impacté en XOF
  examples?: Array<{ id?: number; date?: string; account?: string; label?: string; amount?: number; piece?: string }>;
  recommendation: string;
}

export interface AuditReport {
  orgId: string;
  generatedAt: number;
  totalEntries: number;
  totalDebit: number;
  totalCredit: number;
  delta: number;
  scoreGlobal: number;       // 0-100
  findings: AuditFinding[];
  byseverity: { critical: number; major: number; minor: number; info: number };
}

const fmt = (n: number) => Math.round(n).toLocaleString('fr-FR');

/**
 * Audit du Grand Livre — détection d'anomalies comptables.
 *
 * @param orgId      Organisation à auditer
 * @param year       Année à auditer (optionnel — si absent, toutes années)
 * @param thresholds Seuils paramétrables par tenant (P2-5) :
 *   - amountAnomaly : montant minimal pour considérer une anomalie classe 6/7
 *     (défaut : 1000 XOF — adapté UEMOA, à augmenter pour grandes entreprises
 *     ou devises plus fortes comme EUR/USD)
 */
export async function auditGL(
  orgId: string,
  year?: number,
  thresholds?: { amountAnomaly?: number },
): Promise<AuditReport> {
  const minAmount = thresholds?.amountAnomaly ?? 1000;
  const [entries, periods, accounts] = await Promise.all([
    dataProvider.getGLEntries({ orgId }),
    dataProvider.getPeriods(orgId),
    dataProvider.getAccounts(orgId),
  ]);
  const accountByCode = new Map(accounts.map((a) => [a.code, a] as const));
  const periodById = new Map(periods.map((p) => [p.id, p] as const));

  const filtered = year ? entries.filter((e) => {
    const p = periodById.get(e.periodId);
    return p?.year === year;
  }) : entries;

  const findings: AuditFinding[] = [];
  const totalDebit = filtered.reduce((s, e) => s + e.debit, 0);
  const totalCredit = filtered.reduce((s, e) => s + e.credit, 0);
  const delta = totalDebit - totalCredit;

  // ─── 1. BALANCE GLOBALE ÉQUILIBRÉE ───
  if (Math.abs(delta) > 1) {
    findings.push({
      id: 'bal_global', category: 'Intégrité', severity: 'critical',
      title: 'Balance générale déséquilibrée',
      description: `Total Débit (${fmt(totalDebit)}) ≠ Total Crédit (${fmt(totalCredit)}). Écart : ${fmt(delta)} XOF.`,
      count: 1, total: Math.abs(delta),
      recommendation: 'Identifier les écritures déséquilibrées (par pièce ou par période) et corriger à la source.',
    });
  }

  // ─── 2. PIÈCES DÉSÉQUILIBRÉES ───
  const piecesByKey = new Map<string, GLEntry[]>();
  for (const e of filtered) {
    const key = `${e.journal || '?'}-${e.piece || '?'}-${e.date || '?'}`;
    const arr = piecesByKey.get(key) ?? [];
    arr.push(e); piecesByKey.set(key, arr);
  }
  const unbalancedPieces: { key: string; entries: GLEntry[]; gap: number }[] = [];
  for (const [key, ents] of piecesByKey) {
    const d = ents.reduce((s, e) => s + e.debit, 0);
    const c = ents.reduce((s, e) => s + e.credit, 0);
    const gap = d - c;
    if (Math.abs(gap) > 1 && ents.length > 1) {
      unbalancedPieces.push({ key, entries: ents, gap });
    }
  }
  if (unbalancedPieces.length > 0) {
    const totGap = unbalancedPieces.reduce((s, p) => s + Math.abs(p.gap), 0);
    findings.push({
      id: 'pieces_balance', category: 'Intégrité', severity: 'critical',
      title: `${unbalancedPieces.length} pièce(s) déséquilibrée(s)`,
      description: `Pièces dont D ≠ C. Total des écarts : ${fmt(totGap)} XOF.`,
      count: unbalancedPieces.length, total: totGap,
      examples: unbalancedPieces.slice(0, 5).map((p) => ({
        date: p.entries[0]?.date,
        account: p.entries[0]?.account,
        piece: p.entries[0]?.piece,
        amount: p.gap,
        label: `${p.entries.length} lignes, écart ${fmt(p.gap)}`,
      })),
      recommendation: 'Vérifier ces pièces dans le logiciel source : ligne manquante, montant erroné, ou pièce mal numérotée.',
    });
  }

  // ─── 3. ÉCRITURES SANS LIBELLÉ ───
  const noLabel = filtered.filter((e) => !e.label || e.label.trim() === '' || e.label === '—');
  if (noLabel.length > 0) {
    findings.push({
      id: 'no_label', category: 'Qualité', severity: 'minor',
      title: `${noLabel.length} écriture(s) sans libellé`,
      description: 'Le libellé est essentiel pour la traçabilité et l\'audit.',
      count: noLabel.length,
      examples: noLabel.slice(0, 5).map((e) => ({ id: e.id, date: e.date, account: e.account, piece: e.piece })),
      recommendation: 'Ajouter un libellé descriptif à chaque écriture dans le logiciel comptable source.',
    });
  }

  // ─── 4. ÉCRITURES SANS PIÈCE ───
  const noPiece = filtered.filter((e) => !e.piece || e.piece.trim() === '');
  if (noPiece.length > 0) {
    findings.push({
      id: 'no_piece', category: 'Qualité', severity: 'minor',
      title: `${noPiece.length} écriture(s) sans n° de pièce`,
      description: 'L\'absence de n° de pièce empêche le rapprochement avec la facturation.',
      count: noPiece.length,
      examples: noPiece.slice(0, 5).map((e) => ({ id: e.id, date: e.date, account: e.account, label: e.label })),
      recommendation: 'Numéroter systématiquement chaque pièce comptable.',
    });
  }

  // ─── 5. ÉCRITURES SANS JOURNAL ───
  const noJournal = filtered.filter((e) => !e.journal || e.journal.trim() === '');
  if (noJournal.length > 0) {
    findings.push({
      id: 'no_journal', category: 'Qualité', severity: 'minor',
      title: `${noJournal.length} écriture(s) sans code journal`,
      description: 'Le code journal (VT, AC, BQ, OD…) classifie l\'origine de l\'écriture.',
      count: noJournal.length,
      examples: noJournal.slice(0, 5).map((e) => ({ id: e.id, date: e.date, account: e.account })),
      recommendation: 'Affecter chaque écriture à un journal SYSCOHADA standard (VT, AC, BQ, CA, OD, AN, PAIE).',
    });
  }

  // ─── 6. DOUBLONS POTENTIELS ───
  // (P2-6) Clé enrichie avec journal + piece pour réduire les faux positifs.
  // Avant : 2 écritures identiques dans 2 journaux différents (ex: VT et AC)
  // étaient marquées doublons à tort. Maintenant on inclut journal + piece :
  // 2 écritures vraiment identiques sont rares (sauf erreur de saisie réelle).
  const dupKey = (e: GLEntry) =>
    `${e.date}|${e.account}|${e.debit}|${e.credit}|${(e.journal || '').trim()}|${(e.piece || '').trim()}|${(e.label || '').trim()}`;
  const groups = new Map<string, GLEntry[]>();
  for (const e of filtered) {
    const k = dupKey(e);
    const arr = groups.get(k) ?? [];
    arr.push(e); groups.set(k, arr);
  }
  const dups = Array.from(groups.values()).filter((g) => g.length > 1);
  if (dups.length > 0) {
    findings.push({
      id: 'dup', category: 'Intégrité', severity: 'major',
      title: `${dups.length} groupe(s) d'écritures potentiellement dupliquées`,
      description: 'Mêmes date + compte + montants + libellé. À vérifier (peut être légitime ou erreur d\'import).',
      count: dups.reduce((s, g) => s + g.length, 0),
      examples: dups.slice(0, 5).map((g) => ({ date: g[0].date, account: g[0].account, label: g[0].label, amount: g[0].debit + g[0].credit })),
      recommendation: 'Vérifier chaque groupe : si vraiment doublon, supprimer dans le source puis réimporter.',
    });
  }

  // ─── 7. DATES FUTURES ───
  const today = new Date().toISOString().substring(0, 10);
  const futures = filtered.filter((e) => e.date > today);
  if (futures.length > 0) {
    findings.push({
      id: 'future_dates', category: 'Intégrité', severity: 'major',
      title: `${futures.length} écriture(s) avec date future`,
      description: `Écritures datées après aujourd'hui (${today}). Anomalie pour la comptabilité d'engagement.`,
      count: futures.length,
      examples: futures.slice(0, 5).map((e) => ({ id: e.id, date: e.date, account: e.account, label: e.label })),
      recommendation: 'Vérifier les dates dans le source. Sauf cas particulier (factures à venir), corriger.',
    });
  }

  // Comptes "contra" à sens normalement inversé — exclus des contrôles de sens.
  // Contre-charges classe 6 (solde/crédit normal) : 603 (var. stocks), 609
  // (RRR obtenus achats), 619/629 (RRR obtenus services), 639.
  const isContraCharge = (a?: string) => !!a && (a.startsWith('603') || a.startsWith('609') || a.startsWith('619') || a.startsWith('629') || a.startsWith('639'));
  // Contre-produits classe 7 (solde/débit normal) : 709 (RRR accordés) et
  // ventilations 70x9 (7019, 7029…706900, 7079). Ce ne sont PAS des erreurs.
  const isContraProduit = (a?: string) => !!a && (a.startsWith('709') || /^70[1-7]9/.test(a));

  // ─── 8. CLASSE 6 EN CRÉDIT ANORMAL ───
  const c6Cred = filtered.filter((e) => e.account?.startsWith('6') && !isContraCharge(e.account) && e.credit > minAmount && e.debit === 0);
  if (c6Cred.length > 0) {
    const total = c6Cred.reduce((s, e) => s + e.credit, 0);
    findings.push({
      id: 'c6_credit', category: 'Cohérence', severity: 'major',
      title: `${c6Cred.length} écriture(s) classe 6 en crédit anormal`,
      description: `Les charges (classe 6) doivent être au débit. Total des crédits anormaux : ${fmt(total)} XOF.`,
      count: c6Cred.length, total,
      examples: c6Cred.slice(0, 5).map((e) => ({ id: e.id, date: e.date, account: e.account, label: e.label, amount: e.credit })),
      recommendation: 'Vérifier : peut être une annulation/avoir légitime (OD), ou erreur de saisie. Re-classer si nécessaire.',
    });
  }

  // ─── 9. CLASSE 7 EN DÉBIT ANORMAL ───
  const c7Deb = filtered.filter((e) => e.account?.startsWith('7') && !isContraProduit(e.account) && e.debit > minAmount && e.credit === 0);
  if (c7Deb.length > 0) {
    const total = c7Deb.reduce((s, e) => s + e.debit, 0);
    findings.push({
      id: 'c7_debit', category: 'Cohérence', severity: 'major',
      title: `${c7Deb.length} écriture(s) classe 7 en débit anormal`,
      description: `Les produits (classe 7) doivent être au crédit. Total des débits anormaux : ${fmt(total)} XOF.`,
      count: c7Deb.length, total,
      examples: c7Deb.slice(0, 5).map((e) => ({ id: e.id, date: e.date, account: e.account, label: e.label, amount: e.debit })),
      recommendation: 'Vérifier : peut être un avoir légitime, ou erreur. Examiner et reclasser si nécessaire.',
    });
  }

  // ─── 10. COMPTES NON MAPPÉS SYSCOHADA ───
  const codesUtilises = new Set(filtered.map((e) => e.account));
  const nonMappes = Array.from(codesUtilises).filter((code) => {
    const acc = accountByCode.get(code);
    return !acc || !acc.syscoCode;
  });
  if (nonMappes.length > 0) {
    findings.push({
      id: 'non_mapped', category: 'Conformité', severity: 'major',
      title: `${nonMappes.length} compte(s) non mappé(s) au plan SYSCOHADA`,
      description: 'Ces comptes ne sont pas reliés à un compte de référence SYSCOHADA, ce qui empêche les états officiels.',
      count: nonMappes.length,
      examples: nonMappes.slice(0, 8).map((code) => ({ account: code, label: accountByCode.get(code)?.label })),
      recommendation: 'Compléter le Plan Comptable de l\'entreprise (page Plan comptable → Modifier compte → renseigner le mapping SYSCOHADA).',
    });
  }

  // ─── 11. MONTANTS RONDS SUSPECTS ───
  const montantsRonds = filtered.filter((e) => {
    const m = Math.max(e.debit, e.credit);
    return m >= 100000 && m % 100000 === 0;
  });
  if (montantsRonds.length > 20) {
    findings.push({
      id: 'round', category: 'Risque audit', severity: 'info',
      title: `${montantsRonds.length} écriture(s) avec montant très rond (multiple de 100 000)`,
      description: 'Les montants trop ronds peuvent indiquer des estimations, OD non justifiées, ou écritures forcées.',
      count: montantsRonds.length,
      examples: montantsRonds.slice(0, 5).map((e) => ({ id: e.id, date: e.date, account: e.account, label: e.label, amount: Math.max(e.debit, e.credit) })),
      recommendation: 'Vérifier que ces montants reposent sur des justificatifs réels (factures, contrats), pas des estimations.',
    });
  }

  // ─── 12. OUTLIERS STATISTIQUES (montants > 3 écarts-types) ───
  const amounts = filtered.map((e) => Math.max(e.debit, e.credit)).filter((a) => a > 0);
  if (amounts.length > 30) {
    const mean = amounts.reduce((s, a) => s + a, 0) / amounts.length;
    const variance = amounts.reduce((s, a) => s + (a - mean) ** 2, 0) / amounts.length;
    const stdev = Math.sqrt(variance);
    const seuil = mean + 3 * stdev;
    const outliers = filtered.filter((e) => Math.max(e.debit, e.credit) > seuil);
    if (outliers.length > 0 && outliers.length < 50) {
      findings.push({
        id: 'outliers', category: 'Risque audit', severity: 'info',
        title: `${outliers.length} écriture(s) à montant exceptionnel`,
        description: `Montants > moyenne + 3 écarts-types (seuil ${fmt(seuil)} XOF). Statistiquement atypiques.`,
        count: outliers.length,
        examples: outliers.slice(0, 5).map((e) => ({ id: e.id, date: e.date, account: e.account, label: e.label, amount: Math.max(e.debit, e.credit) })),
        recommendation: 'Vérifier la justification de ces écritures : opérations exceptionnelles, contrats majeurs, ou erreurs de saisie ?',
      });
    }
  }

  // ─── 13. TVA — sens normal (443 créditeur, 445 débiteur) ───
  const tva443Deb = filtered.filter((e) => e.account?.startsWith('443') && e.debit > 100 && e.credit === 0);
  const tva445Cred = filtered.filter((e) => e.account?.startsWith('445') && e.credit > 100 && e.debit === 0);
  if (tva443Deb.length + tva445Cred.length > 0) {
    findings.push({
      id: 'tva_sens', category: 'Cohérence', severity: 'minor',
      title: `${tva443Deb.length + tva445Cred.length} écriture(s) TVA en sens anormal`,
      description: `443 (TVA collectée) au débit : ${tva443Deb.length} ; 445 (TVA déductible) au crédit : ${tva445Cred.length}.`,
      count: tva443Deb.length + tva445Cred.length,
      examples: [...tva443Deb, ...tva445Cred].slice(0, 5).map((e) => ({ id: e.id, date: e.date, account: e.account, amount: e.debit + e.credit, label: e.label })),
      recommendation: 'Peut être une régularisation TVA (OD) légitime. Sinon, vérifier le sens de saisie.',
    });
  }

  // ─── 14. ÉCRITURES TROP ANCIENNES (avant ouverture exercice) ───
  const fiscalYears = await dataProvider.getFiscalYears(orgId);
  const minYear = fiscalYears.length > 0 ? Math.min(...fiscalYears.map((fy) => fy.year)) : 0;
  const tooOld = filtered.filter((e) => {
    const y = parseInt(e.date.substring(0, 4));
    return y < minYear - 1 && y > 0;
  });
  if (tooOld.length > 0) {
    findings.push({
      id: 'too_old', category: 'Cohérence', severity: 'info',
      title: `${tooOld.length} écriture(s) antérieure(s) aux exercices définis`,
      description: `Année minimum définie : ${minYear}. Ces écritures sont plus anciennes.`,
      count: tooOld.length,
      examples: tooOld.slice(0, 5).map((e) => ({ id: e.id, date: e.date, account: e.account, label: e.label })),
      recommendation: 'Définir un exercice fiscal couvrant ces écritures, ou les exclure si erreur de date.',
    });
  }

  // ─── 15. COMPTES SANS MOUVEMENT (comptes auxiliaires "morts") ───
  const allCodes = new Set(accounts.map((a) => a.code));
  const usedCodes = new Set(filtered.map((e) => e.account));
  const dormantCodes = Array.from(allCodes).filter((c) => !usedCodes.has(c));
  if (dormantCodes.length > 0) {
    findings.push({
      id: 'dormant', category: 'Qualité', severity: 'info',
      title: `${dormantCodes.length} compte(s) du PC sans aucun mouvement`,
      description: 'Comptes définis dans le Plan Comptable mais jamais utilisés dans le GL.',
      count: dormantCodes.length,
      examples: dormantCodes.slice(0, 8).map((c) => ({ account: c, label: accountByCode.get(c)?.label })),
      recommendation: 'Si ces comptes ne sont plus utilisés, les supprimer du PC pour alléger le référentiel.',
    });
  }

  // ─── 16. SOLDES CLIENTS CRÉDITEURS / FOURNISSEURS DÉBITEURS (anormal) ───
  const balPerAccount = new Map<string, number>();
  for (const e of filtered) {
    const cur = balPerAccount.get(e.account) ?? 0;
    balPerAccount.set(e.account, cur + e.debit - e.credit);
  }
  const clientsCred = Array.from(balPerAccount.entries()).filter(([a, b]) => a.startsWith('411') && b < -1000);
  const fournisDeb = Array.from(balPerAccount.entries()).filter(([a, b]) => a.startsWith('401') && b > 1000);
  if (clientsCred.length > 0) {
    findings.push({
      id: 'client_cred', category: 'Cohérence', severity: 'minor',
      title: `${clientsCred.length} compte(s) client en solde créditeur`,
      description: 'Un client avec solde créditeur indique : avance reçue, trop-perçu, ou erreur. Doit être reclassé en 419 (clients créditeurs).',
      count: clientsCred.length,
      examples: clientsCred.slice(0, 5).map(([a, b]) => ({ account: a, amount: Math.abs(b), label: accountByCode.get(a)?.label })),
      recommendation: 'Reclasser en compte 419 « Clients créditeurs (avances reçues) » ou justifier l\'anomalie.',
    });
  }
  if (fournisDeb.length > 0) {
    findings.push({
      id: 'fr_deb', category: 'Cohérence', severity: 'minor',
      title: `${fournisDeb.length} compte(s) fournisseur en solde débiteur`,
      description: 'Un fournisseur en solde débiteur indique : avance versée, ou trop-payé. Doit être reclassé en 409 (fournisseurs débiteurs).',
      count: fournisDeb.length,
      examples: fournisDeb.slice(0, 5).map(([a, b]) => ({ account: a, amount: b, label: accountByCode.get(a)?.label })),
      recommendation: 'Reclasser en compte 409 « Fournisseurs débiteurs (avances, RRR à obtenir) » ou justifier.',
    });
  }

  // ─── 17. LOI DE BENFORD (détection de montants fabriqués / manipulés) ───
  // Le 1er chiffre significatif des montants « naturels » suit P(d)=log10(1+1/d).
  // Un écart marqué (MAD > 0,015 — seuil de non-conformité de Nigrini) signale
  // des montants forcés, des estimations en masse ou une possible fraude.
  {
    const firstDigit = (n: number): number => {
      let x = Math.abs(n);
      if (!isFinite(x) || x < 1) return 0;
      while (x >= 10) x = Math.floor(x / 10);
      return Math.floor(x);
    };
    const counts = new Array(10).fill(0);
    let nB = 0;
    for (const e of filtered) {
      const d = firstDigit(Math.max(e.debit, e.credit));
      if (d >= 1) { counts[d]++; nB++; }
    }
    if (nB >= 300) {
      const expected = (d: number) => Math.log10(1 + 1 / d);
      let mad = 0;
      for (let d = 1; d <= 9; d++) mad += Math.abs(counts[d] / nB - expected(d));
      mad /= 9;
      if (mad > 0.015) {
        const ecarts = [];
        for (let d = 1; d <= 9; d++) ecarts.push({ d, obs: counts[d] / nB, exp: expected(d) });
        ecarts.sort((a, b) => (b.obs - b.exp) - (a.obs - a.exp));
        const top = ecarts.slice(0, 3).map((x) => `chiffre ${x.d} : ${(x.obs * 100).toFixed(1)}% (attendu ${(x.exp * 100).toFixed(1)}%)`).join(' · ');
        findings.push({
          id: 'benford', category: 'Risque audit', severity: mad > 0.025 ? 'major' : 'minor',
          title: `Loi de Benford : distribution des montants anormale (MAD ${mad.toFixed(4)})`,
          description: `Le 1er chiffre des ${nB} montants s'écarte de la loi de Benford (seuil de non-conformité 0,015). Sur-représentation : ${top}.`,
          count: nB,
          recommendation: 'Analyser les écritures des chiffres sur-représentés : montants estimés/forcés en masse, seuils de validation contournés, ou anomalies de saisie.',
        });
      }
    }
  }

  // ─── 18. RUPTURES DE SÉQUENCE DE N° DE PIÈCE (pièces manquantes) ───
  // Dans un journal à numérotation continue, un « trou » (101,102,104 → 103
  // manquante) peut signaler une écriture supprimée ou non importée.
  // ON EXCLUT les journaux d'à-nouveaux / reports : leurs pièces sont numérotées
  // PAR COMPTE (pas en séquence continue) et sont MONO-FACE (un seul sens), ce qui
  // générerait des faux positifs (cas réel : journal RAN d'un import de balance
  // d'ouverture). Détection double, agnostique à l'ERP :
  //   1) code journal usuel d'à-nouveaux (AN, RAN, REPORT, REPRISE, OUV…) ;
  //   2) heuristique : > 50 % des pièces du journal sont mono-face.
  {
    const OPENING_JRN = /^(a[-\s]?n|ran|ano|report|repri|ouv|bilan)/i;
    // Faces observées par pièce (journal|piece) pour le ratio mono-face.
    const pieceSides = new Map<string, { d: boolean; c: boolean }>();
    for (const e of filtered) {
      const jrn = (e.journal || '').trim();
      if (!jrn) continue;
      const k = `${jrn}|${(e.piece || '').trim()}`;
      const s = pieceSides.get(k) ?? { d: false, c: false };
      if ((e.debit || 0) > 0) s.d = true;
      if ((e.credit || 0) > 0) s.c = true;
      pieceSides.set(k, s);
    }
    const monoStat = new Map<string, { mono: number; total: number }>();
    for (const [k, s] of pieceSides) {
      const jrn = k.slice(0, k.indexOf('|'));
      const st = monoStat.get(jrn) ?? { mono: 0, total: 0 };
      st.total++;
      if (s.d !== s.c) st.mono++; // exactement une seule face
      monoStat.set(jrn, st);
    }
    const isOpeningJournal = (jrn: string) => {
      if (OPENING_JRN.test(jrn)) return true;
      const st = monoStat.get(jrn);
      return !!st && st.total >= 20 && st.mono / st.total > 0.5;
    };

    const byJournal = new Map<string, Set<number>>();
    for (const e of filtered) {
      const jrn = (e.journal || '').trim();
      const m = (e.piece || '').match(/(\d{1,10})/);
      if (!jrn || !m || isOpeningJournal(jrn)) continue;
      const num = parseInt(m[1], 10);
      if (!Number.isFinite(num)) continue;
      let s = byJournal.get(jrn); if (!s) { s = new Set(); byJournal.set(jrn, s); }
      s.add(num);
    }
    const gapsFound: Array<{ journal: string; missing: number[] }> = [];
    for (const [jrn, set] of byJournal) {
      if (set.size < 20) continue;
      const arr = Array.from(set).sort((a, b) => a - b);
      const span = arr[arr.length - 1] - arr[0] + 1;
      // Séquence dense (>70% de couverture, plage raisonnable) = numérotation continue.
      if (span <= 0 || span > 100000 || set.size / span < 0.7) continue;
      const missing: number[] = [];
      for (let k = arr[0]; k <= arr[arr.length - 1] && missing.length < 200; k++) if (!set.has(k)) missing.push(k);
      if (missing.length > 0) gapsFound.push({ journal: jrn, missing });
    }
    const totalMissing = gapsFound.reduce((s, g) => s + g.missing.length, 0);
    if (totalMissing > 0) {
      findings.push({
        id: 'piece_gaps', category: 'Intégrité', severity: 'major',
        title: `${totalMissing} n° de pièce manquant(s) dans des journaux séquentiels`,
        description: `Ruptures de séquence dans ${gapsFound.length} journal(aux) à numérotation continue. Une pièce manquante = écriture supprimée ou export GL incomplet.`,
        count: totalMissing,
        examples: gapsFound.slice(0, 5).map((g) => ({ account: g.journal, label: `manquants : ${g.missing.slice(0, 10).join(', ')}${g.missing.length > 10 ? '…' : ''}` })),
        recommendation: 'Vérifier dans le logiciel source si ces pièces existent (annulées, en attente) ou si l\'export du Grand Livre est incomplet.',
      });
    }
  }

  // ─── 19. MONTANTS ATYPIQUES PAR COMPTE (erreur de saisie « zéro en trop ») ───
  // Un montant très éloigné de l'usage habituel de SON PROPRE compte (et non
  // globalement) trahit souvent une erreur de saisie (chiffre en trop).
  {
    const byAcc = new Map<string, number[]>();
    for (const e of filtered) {
      const amt = Math.max(e.debit, e.credit);
      if (amt <= 0) continue;
      let a = byAcc.get(e.account); if (!a) { a = []; byAcc.set(e.account, a); }
      a.push(amt);
    }
    const outliersAcc: Array<{ account: string; amount: number; median: number }> = [];
    for (const [acc, amts] of byAcc) {
      if (amts.length < 15) continue;
      const sorted = [...amts].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      if (median <= 0) continue;
      for (const amt of amts) if (amt > median * 30 && amt > 1_000_000) outliersAcc.push({ account: acc, amount: amt, median });
    }
    if (outliersAcc.length > 0) {
      outliersAcc.sort((a, b) => b.amount - a.amount);
      findings.push({
        id: 'account_outliers', category: 'Risque audit', severity: 'minor',
        title: `${outliersAcc.length} montant(s) atypique(s) pour leur compte`,
        description: 'Montants > 30× la médiane habituelle de leur propre compte — signe fréquent d\'un chiffre en trop à la saisie.',
        count: outliersAcc.length,
        examples: outliersAcc.slice(0, 5).map((o) => ({ account: o.account, amount: o.amount, label: `médiane du compte ≈ ${fmt(o.median)}` })),
        recommendation: 'Comparer chaque montant à sa pièce justificative — vérifier l\'absence d\'un zéro (ou plus) en trop.',
      });
    }
  }

  // ─── 20. COHÉRENCE DU TAUX DE TVA IMPLICITE ───
  {
    const net = (pred: (a: string) => boolean, dir: 'DC' | 'CD') => filtered
      .filter((e) => e.account && pred(e.account))
      .reduce((s, e) => s + (dir === 'DC' ? e.debit - e.credit : e.credit - e.debit), 0);
    const caTva = net((a) => /^7[0-5]/.test(a), 'CD');
    const tvaCollectee = net((a) => a.startsWith('443'), 'CD');
    const achatsTva = net((a) => a.startsWith('60') && !a.startsWith('603'), 'DC');
    const tvaDeductible = net((a) => a.startsWith('445'), 'DC');
    const problems: string[] = [];
    if (caTva > 0 && tvaCollectee > 0) {
      const taux = tvaCollectee / caTva;
      if (taux < 0.05 || taux > 0.30) problems.push(`TVA collectée (443) ⇒ taux implicite ${(taux * 100).toFixed(1)}% sur le CA (hors plage 5-30%)`);
    }
    if (achatsTva > 0 && tvaDeductible > 0) {
      const taux = tvaDeductible / achatsTva;
      if (taux < 0.05 || taux > 0.30) problems.push(`TVA déductible (445) ⇒ taux implicite ${(taux * 100).toFixed(1)}% sur les achats (hors plage 5-30%)`);
    }
    if (problems.length > 0) {
      findings.push({
        id: 'tva_taux', category: 'Cohérence', severity: 'minor',
        title: 'Taux de TVA implicite hors plage',
        description: problems.join(' ; ') + '.',
        count: problems.length,
        recommendation: 'Rapprocher la TVA comptabilisée des déclarations : base imposable erronée, opérations exonérées, ou écritures parasites sur 443/445.',
      });
    }
  }

  // ─── 21. COMPTES COLLECTIFS DE TIERS MOUVEMENTÉS EN DIRECT ───
  // Écritures sans code tiers sur un compte collectif (ex: 411) ALORS QUE des
  // sous-comptes auxiliaires (411xxx) existent → double comptage / balance
  // auxiliaire faussée.
  {
    const codes4 = Array.from(new Set(filtered.filter((e) => e.account?.[0] === '4').map((e) => e.account)));
    const collectifs: Array<{ collectif: string; nbSousComptes: number; montant: number }> = [];
    for (const c of codes4) {
      const enfants = codes4.filter((o) => o !== c && o.startsWith(c) && o.length > c.length);
      if (enfants.length === 0) continue;
      const direct = filtered.filter((e) => e.account === c && !e.tiers);
      const montant = direct.reduce((s, e) => s + Math.abs(e.debit - e.credit), 0);
      if (direct.length > 0 && montant > 1000) collectifs.push({ collectif: c, nbSousComptes: enfants.length, montant });
    }
    if (collectifs.length > 0) {
      collectifs.sort((a, b) => b.montant - a.montant);
      findings.push({
        id: 'collectif_direct', category: 'Cohérence', severity: 'minor',
        title: `${collectifs.length} compte(s) collectif(s) mouvementé(s) en direct`,
        description: 'Des écritures sans code tiers sont passées sur un compte collectif alors que des sous-comptes auxiliaires existent — risque de double comptage / balance auxiliaire faussée.',
        count: collectifs.length,
        examples: collectifs.slice(0, 5).map((x) => ({ account: x.collectif, amount: x.montant, label: `${x.nbSousComptes} sous-compte(s)` })),
        recommendation: 'Ventiler ces écritures sur les sous-comptes tiers, ou justifier la centralisation (cf. Rapprochement tiers).',
      });
    }
  }

  // ─── 22. CONTINUITÉ D'EXERCICE : à-nouveaux N ≠ clôture N-1 (cut-off) ───
  // Principe d'intangibilité du bilan d'ouverture : les à-nouveaux de N doivent
  // reprendre EXACTEMENT les soldes de clôture de N-1. Comptes de résultat/report
  // (11/12/13) exclus car légitimement modifiés par l'affectation du résultat.
  if (year) {
    const closN1 = new Map<string, number>();
    const openN = new Map<string, number>();
    let hasN1 = false, hasOpenN = false;
    for (const e of entries) {
      const p = periodById.get(e.periodId);
      if (!p) continue;
      if (p.year === year - 1) { hasN1 = true; closN1.set(e.account, (closN1.get(e.account) ?? 0) + e.debit - e.credit); }
      if (p.year === year && p.month === 0) { hasOpenN = true; openN.set(e.account, (openN.get(e.account) ?? 0) + e.debit - e.credit); }
    }
    if (hasN1 && hasOpenN) {
      const isBilanStable = (a: string) => /^[1-5]/.test(a) && !/^1[123]/.test(a);
      const accts = new Set<string>();
      for (const a of closN1.keys()) if (isBilanStable(a)) accts.add(a);
      for (const a of openN.keys()) if (isBilanStable(a)) accts.add(a);
      const ecarts: Array<{ account: string; c: number; o: number; gap: number }> = [];
      for (const a of accts) {
        const c = closN1.get(a) ?? 0; const o = openN.get(a) ?? 0; const gap = o - c;
        if (Math.abs(gap) > 1) ecarts.push({ account: a, c, o, gap });
      }
      if (ecarts.length > 0) {
        ecarts.sort((x, y2) => Math.abs(y2.gap) - Math.abs(x.gap));
        const totalGap = ecarts.reduce((s, e) => s + Math.abs(e.gap), 0);
        findings.push({
          id: 'continuity', category: 'Intégrité', severity: 'critical',
          title: `${ecarts.length} compte(s) : à-nouveaux ${year} ≠ clôture ${year - 1}`,
          description: `Rupture d'intangibilité du bilan d'ouverture : les soldes d'ouverture ${year} ne reprennent pas les soldes de clôture ${year - 1}. Écart cumulé : ${fmt(totalGap)} XOF (comptes de résultat/report exclus).`,
          count: ecarts.length, total: totalGap,
          examples: ecarts.slice(0, 8).map((e) => ({ account: e.account, amount: e.gap, label: `clôture ${fmt(e.c)} → ouverture ${fmt(e.o)}` })),
          recommendation: `Ré-importer les à-nouveaux ${year} depuis la balance de clôture ${year - 1} (le bilan d'ouverture doit être identique au bilan de clôture précédent).`,
        });
      }
    }
  }

  // ─── SCORE GLOBAL ───
  const weights = { critical: 25, major: 10, minor: 3, info: 1 };
  const totalWeight = findings.reduce((s, f) => s + weights[f.severity], 0);
  const scoreGlobal = Math.max(0, Math.min(100, 100 - totalWeight));

  const byseverity = {
    critical: findings.filter((f) => f.severity === 'critical').length,
    major: findings.filter((f) => f.severity === 'major').length,
    minor: findings.filter((f) => f.severity === 'minor').length,
    info: findings.filter((f) => f.severity === 'info').length,
  };

  return {
    orgId,
    generatedAt: Date.now(),
    totalEntries: filtered.length,
    totalDebit,
    totalCredit,
    delta,
    scoreGlobal,
    findings: findings.sort((a, b) => weights[b.severity] - weights[a.severity]),
    byseverity,
  };
}
