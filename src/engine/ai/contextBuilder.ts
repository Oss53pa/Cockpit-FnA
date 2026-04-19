/**
 * Context Builder — injecte les données financières pertinentes dans le prompt.
 * RAG léger : sélectionne les données selon la question posée.
 */

interface SIG {
  ca: number; margeBrute: number; valeurAjoutee: number;
  ebe: number; re: number; rf: number; rhao: number;
  resultat: number; impot: number;
}

interface BilanSummary {
  totalActif: number; totalPassif: number;
  capitauxPropres: number; dettes: number;
  immobilisations: number; actifCirculant: number;
  tresorerie: number;
}

interface Ratio {
  code: string; label: string; value: number; unit: string;
  target: number; status: string; family: string; formula: string;
}

interface BudgetLine {
  account: string; label?: string;
  budget: number; actual: number;
  ecart: number; ecartPct: number;
}

export interface FinancialContext {
  sig?: SIG;
  bilan?: BilanSummary;
  ratios?: Ratio[];
  budgetLines?: BudgetLine[];
  orgName?: string;
  year?: number;
  period?: string;
}

/** Détecte les sujets mentionnés dans la question */
function detectTopics(question: string): Set<string> {
  const q = question.toLowerCase();
  const topics = new Set<string>();

  if (/rentab|marge|résultat|bénéfice|perte|sig|ebe|valeur ajout/.test(q)) topics.add('sig');
  if (/bilan|actif|passif|capitaux|immo|fonds propre|structure/.test(q)) topics.add('bilan');
  if (/ratio|liquidit|solvab|endette|couverture|rotation/.test(q)) topics.add('ratios');
  if (/budget|écart|réalis|prév|variance/.test(q)) topics.add('budget');
  if (/tréso|cash|banque|caisse|liquid/.test(q)) { topics.add('bilan'); topics.add('ratios'); }
  if (/alerte|risque|anomal|problème|attention/.test(q)) { topics.add('ratios'); topics.add('sig'); }
  if (/synth|résumé|situation|global|complet/.test(q)) { topics.add('sig'); topics.add('bilan'); topics.add('ratios'); }

  // Si aucun sujet détecté, inclure SIG + ratios en alerte
  if (topics.size === 0) { topics.add('sig'); topics.add('ratios'); }

  return topics;
}

function fmtAmount(n: number): string {
  if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(1)} Md XOF`;
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(1)} M XOF`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(0)} K XOF`;
  return `${n.toFixed(0)} XOF`;
}

function formatSIG(sig: SIG): string {
  return `## Soldes Intermédiaires de Gestion (SIG)
- Chiffre d'affaires : ${fmtAmount(sig.ca)}
- Marge brute : ${fmtAmount(sig.margeBrute)} (${sig.ca ? ((sig.margeBrute / sig.ca) * 100).toFixed(1) : 0} %)
- Valeur ajoutée : ${fmtAmount(sig.valeurAjoutee)}
- EBE : ${fmtAmount(sig.ebe)} (${sig.ca ? ((sig.ebe / sig.ca) * 100).toFixed(1) : 0} %)
- Résultat d'exploitation : ${fmtAmount(sig.re)}
- Résultat financier : ${fmtAmount(sig.rf)}
- Résultat HAO : ${fmtAmount(sig.rhao)}
- Impôt : ${fmtAmount(sig.impot)}
- **Résultat net : ${fmtAmount(sig.resultat)}** (${sig.ca ? ((sig.resultat / sig.ca) * 100).toFixed(1) : 0} %)`;
}

function formatBilan(bilan: BilanSummary): string {
  return `## Bilan résumé
ACTIF :
- Immobilisations : ${fmtAmount(bilan.immobilisations)}
- Actif circulant : ${fmtAmount(bilan.actifCirculant)}
- Trésorerie actif : ${fmtAmount(bilan.tresorerie)}
- **Total actif : ${fmtAmount(bilan.totalActif)}**

PASSIF :
- Capitaux propres : ${fmtAmount(bilan.capitauxPropres)}
- Dettes : ${fmtAmount(bilan.dettes)}
- **Total passif : ${fmtAmount(bilan.totalPassif)}**`;
}

function formatRatios(ratios: Ratio[], alertsOnly = false): string {
  const list = alertsOnly ? ratios.filter(r => r.status !== 'good') : ratios;
  if (!list.length) return '## Ratios\nTous les ratios sont conformes.';

  const header = alertsOnly ? '## Ratios en alerte' : '## Ratios financiers';
  const lines = list.map(r => {
    const statusIcon = r.status === 'good' ? 'OK' : r.status === 'warn' ? 'VIGILANCE' : 'ALERTE';
    const valStr = r.unit === '%' ? `${r.value.toFixed(1)} %` : r.unit === 'j' ? `${Math.round(r.value)} j` : r.value.toFixed(2);
    const tgtStr = r.unit === '%' ? `${r.target} %` : r.unit === 'j' ? `${r.target} j` : `${r.target}`;
    return `- [${statusIcon}] ${r.label} : ${valStr} (cible : ${tgtStr}) — ${r.formula}`;
  });
  return `${header}\n${lines.join('\n')}`;
}

function formatBudget(lines: BudgetLine[]): string {
  if (!lines.length) return '';
  const significant = lines
    .filter(l => Math.abs(l.ecartPct) > 10)
    .sort((a, b) => Math.abs(b.ecart) - Math.abs(a.ecart))
    .slice(0, 15);

  if (!significant.length) return '## Budget vs Réalisé\nPas d\'écart significatif (> 10 %).';

  const header = '## Écarts budget vs réalisé (> 10 %)';
  const rows = significant.map(l =>
    `- ${l.account} ${l.label ?? ''} : Budget ${fmtAmount(l.budget)} / Réalisé ${fmtAmount(l.actual)} → Écart ${l.ecart >= 0 ? '+' : ''}${fmtAmount(l.ecart)} (${l.ecartPct >= 0 ? '+' : ''}${l.ecartPct.toFixed(1)} %)`
  );
  return `${header}\n${rows.join('\n')}`;
}

/**
 * Construit le contexte financier à injecter dans le prompt.
 * Sélectionne les données pertinentes selon la question posée.
 * Limite à ~3000 tokens pour rester dans la fenêtre du modèle 8B.
 */
export function buildContext(question: string, data: FinancialContext): string {
  const topics = detectTopics(question);
  const sections: string[] = [];

  // En-tête
  if (data.orgName || data.year) {
    sections.push(`# Contexte : ${data.orgName ?? 'Société'} — ${data.period ?? `Exercice ${data.year ?? ''}`}`);
  }

  // SIG
  if (topics.has('sig') && data.sig) {
    sections.push(formatSIG(data.sig));
  }

  // Bilan
  if (topics.has('bilan') && data.bilan) {
    sections.push(formatBilan(data.bilan));
  }

  // Ratios
  if (topics.has('ratios') && data.ratios?.length) {
    // Si c'est le seul sujet, tout afficher ; sinon alertes only
    const alertsOnly = topics.size > 1;
    sections.push(formatRatios(data.ratios, alertsOnly));
  }

  // Budget
  if (topics.has('budget') && data.budgetLines?.length) {
    sections.push(formatBudget(data.budgetLines));
  }

  return sections.join('\n\n');
}

/**
 * Construit un résumé minimal pour le mode compact (FloatingAI).
 */
export function buildCompactContext(data: FinancialContext): string {
  const parts: string[] = [];
  if (data.sig) {
    parts.push(`CA: ${fmtAmount(data.sig.ca)}, EBE: ${fmtAmount(data.sig.ebe)}, Résultat: ${fmtAmount(data.sig.resultat)}`);
  }
  if (data.bilan) {
    parts.push(`Actif: ${fmtAmount(data.bilan.totalActif)}, Tréso: ${fmtAmount(data.bilan.tresorerie)}, Capitaux: ${fmtAmount(data.bilan.capitauxPropres)}`);
  }
  if (data.ratios) {
    const alerts = data.ratios.filter(r => r.status !== 'good');
    if (alerts.length) parts.push(`${alerts.length} ratio(s) en alerte`);
    else parts.push('Tous ratios OK');
  }
  return parts.join(' | ');
}
