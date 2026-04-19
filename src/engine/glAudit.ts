// Audit complet du Grand Livre — détecte 15+ catégories d'anomalies
// comptables et de qualité des données. Conforme aux contrôles SYSCOHADA
// et aux meilleures pratiques d'audit comptable.
import { db, GLEntry } from '../db/schema';

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

export async function auditGL(orgId: string, year?: number): Promise<AuditReport> {
  const entries = await db.gl.where('orgId').equals(orgId).toArray();
  const periods = await db.periods.where('orgId').equals(orgId).toArray();
  const accounts = await db.accounts.where('orgId').equals(orgId).toArray();
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
  const dupKey = (e: GLEntry) => `${e.date}|${e.account}|${e.debit}|${e.credit}|${(e.label || '').trim()}`;
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

  // ─── 8. CLASSE 6 EN CRÉDIT ANORMAL ───
  const c6Cred = filtered.filter((e) => e.account?.startsWith('6') && e.credit > 1000 && e.debit === 0);
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
  const c7Deb = filtered.filter((e) => e.account?.startsWith('7') && e.debit > 1000 && e.credit === 0);
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
  const fiscalYears = await db.fiscalYears.where('orgId').equals(orgId).toArray();
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
