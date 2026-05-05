// Moteur analytique pour dashboards spécialisés
//
// Source de données : Supabase via dataProvider (obligatoire).
import { dataProvider } from '../db/provider';
import { findSyscoAccount } from '../syscohada/coa';

// Classification SYSCOHADA des sous-classes 8 (HAO & Impôts)
// — 81, 83, 85, 87, 89 : charges (solde débiteur)
// — 82, 84, 86, 88     : produits (solde créditeur)
const CHARGE_CLASS8 = new Set(['81', '83', '85', '87', '89']);
const PRODUIT_CLASS8 = new Set(['82', '84', '86', '88']);

function isChargeAccount(account: string): boolean {
  const c0 = account[0];
  if (c0 === '6') return true;
  if (c0 === '7') return false;
  if (c0 === '8') return CHARGE_CLASS8.has(account.substring(0, 2));
  return false;
}
function isProduitAccount(account: string): boolean {
  const c0 = account[0];
  if (c0 === '7') return true;
  if (c0 === '6') return false;
  if (c0 === '8') return PRODUIT_CLASS8.has(account.substring(0, 2));
  return false;
}

// ─── Évolution mensuelle par préfixe ────────────────────────────────────────
export async function monthlyByPrefix(orgId: string, year: number, prefixes: string[]) {
  const MONTHS = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
  // Fetch périodes + GL une seule fois, filtre en mémoire (évite N appels réseau).
  const [periods, allEntries] = await Promise.all([
    dataProvider.getPeriods(orgId),
    dataProvider.getGLEntries({ orgId }),
  ]);
  const thisYear = periods.filter((p) => p.year === year && p.month >= 1).sort((a, b) => a.month - b.month);
  const monthByPeriodId = new Map(thisYear.map((p) => [p.id, p.month] as const));
  const values: number[] = Array(12).fill(0);
  for (const e of allEntries) {
    const month = monthByPeriodId.get(e.periodId);
    if (month === undefined) continue;
    if (!prefixes.some((pfx) => e.account.startsWith(pfx))) continue;
    if (isChargeAccount(e.account)) {
      values[month - 1] += (e.debit - e.credit);
    } else if (isProduitAccount(e.account)) {
      values[month - 1] += (e.credit - e.debit);
    } else {
      values[month - 1] += (e.debit - e.credit);
    }
  }
  return { labels: MONTHS, values };
}

// ─── Top N par racine ────────────────────────────────────────────────────────
export async function topAccountsByPrefix(orgId: string, year: number, prefixes: string[], limit = 10) {
  const [periods, entries] = await Promise.all([
    dataProvider.getPeriods(orgId),
    dataProvider.getGLEntries({ orgId }),
  ]);
  const ids = new Set(periods.filter((p) => p.year === year && p.month >= 1).map((p) => p.id));
  const map = new Map<string, number>();
  for (const e of entries) {
    if (!ids.has(e.periodId)) continue;
    if (!prefixes.some((p) => e.account.startsWith(p))) continue;
    let v: number;
    if (isChargeAccount(e.account)) v = e.debit - e.credit;
    else if (isProduitAccount(e.account)) v = e.credit - e.debit;
    else v = e.debit - e.credit;
    map.set(e.account, (map.get(e.account) ?? 0) + v);
  }
  return Array.from(map, ([code, value]) => ({
    code,
    label: findSyscoAccount(code)?.label ?? 'Compte',
    value,
  })).sort((a, b) => Math.abs(b.value) - Math.abs(a.value)).slice(0, limit);
}

// ─── Balance âgée (clients ou fournisseurs) — algo FIFO correct ─────────────
// Principe : on lettre les règlements FIFO sur les factures les plus anciennes.
// Ce qui RESTE non lettré est ventilé dans les buckets selon l'âge de la facture.
// Sans ça, un règlement récent pour une vieille facture créerait des montants
// négatifs dans 0-30j et un solde nul globalement alors qu'il y a en réalité
// des créances ouvertes ailleurs → bug "0-30j à 0 mais % non zéro".
export type AgedTier = { tier: string; label: string; total: number; buckets: number[] };
const BUCKETS = ['Non échu', '0-30j', '31-60j', '61-90j', '> 90j'];

// Délai de paiement standard (en jours) appliqué par défaut aux factures
// quand le GL ne porte pas de date d'échéance distincte de la date d'émission.
// 30 j est la norme commerciale OHADA (clients / fournisseurs).
const DEFAULT_PAYMENT_TERM_DAYS = 30;

function bucketFromDays(daysSinceInvoice: number, paymentTermDays = DEFAULT_PAYMENT_TERM_DAYS): number {
  // Décale l'âge depuis la date d'émission vers l'âge depuis l'échéance :
  //   facture émise il y a 10 j (échéance dans 20 j)  → overdue = -20 → Non échu
  //   facture émise il y a 45 j (échue depuis 15 j)   → overdue =  15 → 0-30j
  //   facture émise il y a 95 j (échue depuis 65 j)   → overdue =  65 → 61-90j
  const overdue = daysSinceInvoice - paymentTermDays;
  if (overdue < 0) return 0;       // pas encore échue
  if (overdue <= 30) return 1;
  if (overdue <= 60) return 2;
  if (overdue <= 90) return 3;
  return 4;
}

/**
 * Calcule la balance âgée des tiers à la date `opts.analysisDate` (par défaut :
 * fin de l'année si année passée, sinon today). Si la fonction est appelée avec
 * `entriesPreloaded`, elle évite de re-fetcher (utile pour `agedBalanceMonthly`
 * qui calcule 12 snapshots).
 */
export async function agedBalance(
  orgId: string,
  year: number,
  kind: 'client' | 'fournisseur',
  importId?: string,
  opts?: {
    analysisDate?: Date;
    entriesPreloaded?: { periods: any[]; entries: any[]; accounts: any[] };
  },
): Promise<{ buckets: string[]; rows: AgedTier[] }> {
  // BUG FIX (audit) : élargir les comptes capturés pour ne plus rater des créances
  // ou dettes auxiliaires.
  //   Clients (actif) :
  //     411 = clients ordinaires
  //     412 = clients du groupe / partenaires
  //     413 = clients - effets à recevoir
  //     414 = créances sur cessions (Immobilisations / titres)
  //     416 = clients douteux ou litigieux
  //     418 = clients - factures à établir
  //     EXCLU : 419 (clients créditeurs - avances reçues, qui sont au passif)
  //   Fournisseurs (passif) :
  //     401 = fournisseurs ordinaires
  //     402 = fournisseurs effets à payer
  //     408 = fournisseurs factures non parvenues
  //     EXCLU : 409 (fournisseurs débiteurs - avances versées, qui sont à l'actif)
  const matchAccount = (account: string): boolean => {
    if (kind === 'client') {
      // 411-418 SAUF 419
      return /^41[1-8]/.test(account);
    }
    // 401-408 SAUF 409
    return /^40[1-8]/.test(account);
  };
  // Côté client : débits = factures (créances), crédits = encaissements (lettrés)
  // Côté fournisseur : crédits = factures (dettes),  débits   = paiements   (lettrés)
  //
  // BUG FIX : la version précédente filtrait par année et utilisait `today` comme
  // date d'analyse. Conséquences :
  //   1. Les paiements N+1 sur factures N étaient ignorés → créances surestimées.
  //   2. Pour une année passée, today rendait toutes les factures > 90j.
  //   3. Les RAN (créances reportées de N-1) datés du 1er jan étaient comptés
  //      comme des factures émises ce jour-là, faussant complètement l'âge.
  // Solution :
  //   - Date d'analyse = fin de l'année demandée (ou today si année courante).
  //   - On prend TOUTES les écritures (toute année) ≤ date d'analyse pour le FIFO.
  //   - Les RAN (mois 0 ou journal AN/RAN) sont AGRÉGÉS en un solde d'ouverture,
  //     pas en factures datées du 1er jan. On affecte le solde RAN au bucket "Non
  //     échu" si positif (= créance/dette reportée sans âge connu) faute d'info.
  const todayReal = new Date();
  const isCurrentYear = todayReal.getFullYear() === year;
  const analysisDate = opts?.analysisDate ?? (isCurrentYear ? todayReal : new Date(`${year}-12-31`));
  const cutoff = analysisDate.toISOString().substring(0, 10);

  // Permet de réutiliser les données déjà chargées (cas agedBalanceMonthly).
  const { periods, entries, accounts } = opts?.entriesPreloaded
    ?? await Promise.all([
      dataProvider.getPeriods(orgId),
      dataProvider.getGLEntries({ orgId }),
      dataProvider.getAccounts(orgId),
    ]).then(([periods, entries, accounts]) => ({ periods, entries, accounts }));
  const accountLabels = new Map(accounts.map((a) => [a.code, a.label] as const));
  const ranPeriodIds = new Set(
    periods.filter((p) => p.year === year && p.month === 0).map((p) => p.id),
  );
  const isRanEntry = (e: { periodId: string; journal?: string }) => {
    if (ranPeriodIds.has(e.periodId)) return true;
    const j = (e.journal || '').toUpperCase().trim();
    return ['AN', 'RAN', 'A.N', 'A.N.', 'R.A.N', 'R.A.N.'].includes(j);
  };

  type Mvt = { date: string; amount: number; isInvoice: boolean; account: string; label: string };
  const perTiers = new Map<string, { mvts: Mvt[]; openingNet: number }>();

  for (const e of entries) {
    if (!matchAccount(e.account)) continue;
    if (importId && importId !== 'all' && e.importId !== importId) continue;
    if (e.date > cutoff) continue; // ignore le futur par rapport à la date d'analyse
    const tier = e.tiers || e.account;
    const label = accountLabels.get(e.account) ?? e.label ?? '—';
    const cur = perTiers.get(tier) ?? { mvts: [] as Mvt[], openingNet: 0 };

    if (isRanEntry(e)) {
      // RAN : ne pas dater au 1er jan. Cumuler le solde d'ouverture et l'imputer
      // dans le bucket "Non échu" (faute d'info sur l'ancienneté réelle).
      // Côté client : RAN débit = créance reportée, RAN crédit = avoir reporté.
      const sign = kind === 'client' ? (e.debit - e.credit) : (e.credit - e.debit);
      cur.openingNet += sign;
    } else if (kind === 'client') {
      if (e.debit > 0) cur.mvts.push({ date: e.date, amount: e.debit, isInvoice: true, account: e.account, label });
      if (e.credit > 0) cur.mvts.push({ date: e.date, amount: e.credit, isInvoice: false, account: e.account, label });
    } else {
      if (e.credit > 0) cur.mvts.push({ date: e.date, amount: e.credit, isInvoice: true, account: e.account, label });
      if (e.debit > 0) cur.mvts.push({ date: e.date, amount: e.debit, isInvoice: false, account: e.account, label });
    }
    perTiers.set(tier, cur);
  }

  const rows: AgedTier[] = [];
  for (const [tier, { mvts: movements, openingNet }] of perTiers) {
    movements.sort((a, b) => a.date.localeCompare(b.date));
    // Le solde d'ouverture (RAN) est traité comme une "facture virtuelle"
    // en tête de FIFO : si openingNet > 0, c'est une créance/dette reportée à imputer
    // en priorité (les paiements ultérieurs s'y appliquent en premier).
    const openInvoices: Array<{ date: string; open: number; isOpening?: boolean }> = [];
    if (openingNet > 0) {
      openInvoices.push({ date: `${year}-01-01`, open: openingNet, isOpening: true });
    }
    for (const m of movements.filter((m) => m.isInvoice)) {
      openInvoices.push({ date: m.date, open: m.amount });
    }
    let totalPayments = movements.filter((m) => !m.isInvoice).reduce((s, m) => s + m.amount, 0);
    // Si openingNet < 0 (avoir reporté), c'est un crédit en faveur du tier
    if (openingNet < 0) totalPayments += -openingNet;

    // Imputation FIFO : règlements appliqués aux factures les plus anciennes
    for (const inv of openInvoices) {
      if (totalPayments <= 0) break;
      const applied = Math.min(inv.open, totalPayments);
      inv.open -= applied;
      totalPayments -= applied;
    }
    const surplus = totalPayments > 0 ? -totalPayments : 0;

    const buckets = [0, 0, 0, 0, 0];
    let total = surplus;
    buckets[0] += surplus;

    for (const inv of openInvoices) {
      if (inv.open < 0.01) continue;
      let idx: number;
      if (inv.isOpening) {
        // Solde d'ouverture (RAN) : âge inconnu → bucket "Non échu" par défaut
        idx = 0;
      } else {
        const d = new Date(inv.date);
        const days = Math.floor((analysisDate.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
        idx = bucketFromDays(days);
      }
      buckets[idx] += inv.open;
      total += inv.open;
    }

    if (Math.abs(total) < 1) continue;
    const label = movements[0]?.label ?? '—';
    rows.push({ tier, label, total, buckets });
  }
  rows.sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
  return { buckets: BUCKETS, rows };
}

/**
 * Calcule l'aged balance pour CHACUN des 12 mois de l'année — snapshot à la fin
 * de chaque mois. Permet de tracer une évolution historique fiable des créances
 * ou dettes échues, plutôt qu'une heuristique fictive (ex: 30% du total).
 *
 * Performance : charge `periods + entries + accounts` UNE SEULE FOIS et réutilise
 * pour 12 snapshots (au lieu de 12 × 3 = 36 round-trips réseau).
 *
 * Retourne un tableau de 12 éléments. Chaque mois contient : total, échus
 * (buckets 0-30j + 31-60j + 61-90j + >90j), et la répartition complète.
 */
export async function agedBalanceMonthly(
  orgId: string,
  year: number,
  kind: 'client' | 'fournisseur',
): Promise<Array<{ month: number; total: number; nonEchu: number; echusJusqu30: number; echus3160: number; echus6190: number; echusPlus90: number }>> {
  const [periods, entries, accounts] = await Promise.all([
    dataProvider.getPeriods(orgId),
    dataProvider.getGLEntries({ orgId }),
    dataProvider.getAccounts(orgId),
  ]);
  const todayReal = new Date();
  const isCurrentYear = todayReal.getFullYear() === year;
  const result: Array<{ month: number; total: number; nonEchu: number; echusJusqu30: number; echus3160: number; echus6190: number; echusPlus90: number }> = [];

  for (let m = 1; m <= 12; m++) {
    // Date d'analyse = dernier jour du mois m. Pour l'année courante, on
    // s'arrête à today (pas dans le futur).
    const lastDayOfMonth = new Date(year, m, 0); // jour 0 du mois m+1 = dernier jour de m
    const analysisDate = isCurrentYear && lastDayOfMonth > todayReal ? todayReal : lastDayOfMonth;

    const snapshot = await agedBalance(orgId, year, kind, undefined, {
      analysisDate,
      entriesPreloaded: { periods, entries, accounts },
    });
    const total = snapshot.rows.reduce((s, r) => s + r.total, 0);
    const sumBucket = (idx: number) => snapshot.rows.reduce((s, r) => s + (r.buckets[idx] ?? 0), 0);
    result.push({
      month: m,
      total,
      nonEchu:        sumBucket(0),
      echusJusqu30:   sumBucket(1),
      echus3160:      sumBucket(2),
      echus6190:      sumBucket(3),
      echusPlus90:    sumBucket(4),
    });
  }

  return result;
}

// ─── Évolution trésorerie ──────────────────────────────────────────────────
export async function tresorerieMonthly(orgId: string, year: number) {
  const MONTHS = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
  const [periods, entries] = await Promise.all([
    dataProvider.getPeriods(orgId),
    dataProvider.getGLEntries({ orgId }),
  ]);

  const cumul: number[] = Array(12).fill(0);
  const enc: number[] = Array(12).fill(0);
  const dec: number[] = Array(12).fill(0);
  let opening = 0;

  // Récup ouverture (mois 0)
  const openPeriod = periods.find((p) => p.year === year && p.month === 0);
  if (openPeriod) {
    for (const e of entries) {
      if (e.periodId !== openPeriod.id) continue;
      if (!['5'].some((p) => e.account.startsWith(p))) continue;
      if (e.account.startsWith('56')) opening -= (e.credit - e.debit);
      else opening += (e.debit - e.credit);
    }
  }

  let running = opening;
  for (let m = 1; m <= 12; m++) {
    const p = periods.find((x) => x.year === year && x.month === m);
    if (!p) continue;
    let encMois = 0, decMois = 0;
    for (const e of entries) {
      if (e.periodId !== p.id) continue;
      if (!['5'].some((px) => e.account.startsWith(px))) continue;
      // BUG FIX (audit) : pour 56 (concours bancaires/découverts), un CRÉDIT
      // = nouveau découvert = entrée de cash → encaissement positif.
      // Un DÉBIT = remboursement du découvert = sortie de cash → décaissement.
      // L'ancienne formule retranchait les flux au lieu de les reclasser.
      if (e.account.startsWith('56')) {
        encMois += e.credit;     // nouveau découvert = encaissement
        decMois += e.debit;      // remboursement découvert = décaissement
      } else {
        encMois += e.debit;       // banque débit = encaissement
        decMois += e.credit;      // banque crédit = décaissement
      }
    }
    enc[m - 1] = encMois;
    dec[m - 1] = decMois;
    // Running cumulé : crédit 56 augmente le passif (n'augmente PAS la trésorerie nette)
    // Pour le cumul net trésorerie : net = (banques actives D-C) - (découverts C-D)
    let netMois = 0;
    for (const e of entries) {
      if (e.periodId !== p.id) continue;
      if (!['5'].some((px) => e.account.startsWith(px))) continue;
      if (e.account.startsWith('56')) netMois -= (e.credit - e.debit);
      else netMois += (e.debit - e.credit);
    }
    running += netMois;
    cumul[m - 1] = running;
  }
  return { labels: MONTHS, cumul, encaissements: enc, decaissements: dec, opening };
}

// ─── Immobilisations ────────────────────────────────────────────────────────
export async function immobilisationsDetail(orgId: string, year: number) {
  const [entries, periods] = await Promise.all([
    dataProvider.getGLEntries({ orgId }),
    dataProvider.getPeriods(orgId),
  ]);
  const ids = new Set(periods.filter((p) => p.year === year).map((p) => p.id));

  // BUG FIX (audit) : '24' captait aussi '245' (double comptage). Filtre exclusif :
  // chaque catégorie a un prédicat qui exclut les sous-catégories plus précises.
  // De plus, pour 26/27 (immobilisations financières), SYSCOHADA utilise des
  // PROVISIONS (296/297) plutôt que des amortissements (286/287). On lit donc
  // soit l'amortissement officiel (281, 282-285, 2845), soit la provision (29x).
  const cats = [
    { code: '21', label: 'Incorporelles', match: (a: string) => a.startsWith('21'), amortPrefix: '281' },
    { code: '22', label: 'Terrains',      match: (a: string) => a.startsWith('22'), amortPrefix: '282' },
    { code: '23', label: 'Bâtiments',     match: (a: string) => a.startsWith('23'), amortPrefix: '283' },
    { code: '24', label: 'Matériel',      match: (a: string) => a.startsWith('24') && !a.startsWith('245'), amortPrefix: '284' },
    { code: '245', label: 'Matériel transport', match: (a: string) => a.startsWith('245'), amortPrefix: '2845' },
    // Pour 26/27, on capte 28x (amorts) ET 29x (provisions immo financières).
    { code: '26', label: 'Participations', match: (a: string) => a.startsWith('26'), amortPrefix: '296' },
    { code: '27', label: 'Autres financières', match: (a: string) => a.startsWith('27'), amortPrefix: '297' },
  ];
  const data: Array<{ label: string; brute: number; amort: number; vnc: number }> = [];
  for (const c of cats) {
    let brute = 0, amort = 0;
    for (const e of entries) {
      if (!ids.has(e.periodId)) continue;
      if (c.match(e.account)) brute += (e.debit - e.credit);
      if (e.account.startsWith(c.amortPrefix)) amort += (e.credit - e.debit);
    }
    const bruteClamp = Math.max(brute, 0);
    const amortClamp = Math.max(amort, 0);
    // BUG FIX (audit) : VNC = brute clampée − amort clampée (cohérent avec affichage).
    data.push({ label: c.label, brute: bruteClamp, amort: amortClamp, vnc: bruteClamp - amortClamp });
  }
  return data;
}

// ─── Masse salariale mensuelle ──────────────────────────────────────────────
export async function masseSalariale(orgId: string, year: number) {
  const { labels, values } = await monthlyByPrefix(orgId, year, ['66']);
  return { labels, values };
}

// ─── Fiscalité ──────────────────────────────────────────────────────────────
export async function fiscalite(orgId: string, year: number) {
  const [periods, entries] = await Promise.all([
    dataProvider.getPeriods(orgId),
    dataProvider.getGLEntries({ orgId }),
  ]);
  const ids = new Set(periods.filter((p) => p.year === year && p.month >= 1).map((p) => p.id));
  let tvaCol = 0, tvaDed = 0, tvaAPayer = 0, is = 0, taxes = 0;
  for (const e of entries) {
    if (!ids.has(e.periodId)) continue;
    if (e.account.startsWith('443')) tvaCol += (e.credit - e.debit);
    if (e.account.startsWith('445')) tvaDed += (e.debit - e.credit);
    if (e.account.startsWith('441')) is += (e.credit - e.debit);
    // BUG FIX (audit) : "Impôts et taxes" = compte 64 SAUF 641-643 qui sont des
    // charges de personnel (cotisations sociales employeur). SYSCOHADA art. 38.
    // Codes inclus : 645, 646, 647, 648 (impôts directs/indirects). 649 = autres.
    if (e.account.startsWith('64')
        && !e.account.startsWith('641')
        && !e.account.startsWith('642')
        && !e.account.startsWith('643')) {
      taxes += (e.debit - e.credit);
    }
  }
  tvaAPayer = tvaCol - tvaDed;
  return { tvaCollectee: tvaCol, tvaDeductible: tvaDed, tvaAPayer, is, taxes };
}
