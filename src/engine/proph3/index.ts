// Orchestrateur Proph3 — Intelligence financière complète
import { computeBalance } from '../balance';
import { computeBilan, computeSIG, type SIG, type Line } from '../statements';
import { computeRatios, type Ratio } from '../ratios';
import { computeFinancialScore, type FinancialScore } from './scoring';
import { detectAnomalies, type AnomalyReport } from './anomalies';
import { forecastTresorerie, type TresoForecast } from './predictions';
import { generateCommentary, type FullCommentary } from './commentator';
import { checkOllamaStatus, chatWithOllama, buildSystemPrompt, type OllamaStatus } from './ollama';
import { searchKnowledge } from '../../syscohada/knowledge';
import { fmtMoney } from '../../lib/format';

export interface Proph3Analysis { score: FinancialScore; anomalies: AnomalyReport; predictions: TresoForecast; commentary: FullCommentary; sig: SIG; ratios: Ratio[]; bilanActif: Line[]; bilanPassif: Line[]; }
export type { FinancialScore, AnomalyReport, TresoForecast, FullCommentary, OllamaStatus };

export async function analyzeFinancials(orgId: string, year: number): Promise<Proph3Analysis> {
  const balance = await computeBalance({ orgId, year, includeOpening: true });
  const { actif: bilanActif, passif: bilanPassif } = computeBilan(balance);
  const { sig } = computeSIG(balance);
  const ratios = computeRatios(balance);
  const score = computeFinancialScore(ratios, sig, bilanActif, bilanPassif);
  const anomalies = await detectAnomalies(orgId, year, balance);
  const predictions = await forecastTresorerie(orgId, year);
  const commentary = generateCommentary(sig, bilanActif, bilanPassif, ratios, score, anomalies);
  return { score, anomalies, predictions, commentary, sig, ratios, bilanActif, bilanPassif };
}

export async function askProph3(question: string, analysis: Proph3Analysis | null, companyName?: string, country?: string, currency?: string): Promise<string> {
  const chunks = searchKnowledge(question, 3);
  const kCtx = chunks.map((c) => `### ${c.title}\n${c.content}`).join('\n\n');
  const local = genLocal(question, analysis, kCtx);

  try {
    const st = await checkOllamaStatus();
    if (st.available && st.model) {
      const sp = buildSystemPrompt({ companyName, country, currency, year: new Date().getFullYear(),
        sigSummary: analysis ? `CA ${fmtMoney(analysis.sig.ca)} | RN ${fmtMoney(analysis.sig.resultat)} | EBE ${fmtMoney(analysis.sig.ebe)}` : undefined,
        ratiosSummary: analysis ? analysis.ratios.slice(0, 5).map((r) => `${r.label}: ${r.value.toFixed(2)} ${r.unit}`).join(' | ') : undefined,
        scoreSummary: analysis ? `${analysis.score.global}/100 (${analysis.score.label})` : undefined });
      return (await chatWithOllama([{ role: 'system', content: sp + (kCtx ? `\n\n${kCtx}` : '') }, { role: 'user', content: question }], st.model)).content;
    }
  } catch { /* fallback */ }
  return local;
}

function genLocal(q: string, a: Proph3Analysis | null, kCtx: string): string {
  if (!a) return 'Données non chargées. Sélectionnez une société et importez des données.';
  const low = q.toLowerCase();
  if (low.includes('score') || low.includes('santé')) return `${a.commentary.synthese}\n\n${a.score.families.map((f) => `- ${f.family} : ${f.score}/100`).join('\n')}${a.score.recommendations.length ? '\n\nRecommandations :\n' + a.score.recommendations.map((r) => `- ${r}`).join('\n') : ''}`;
  if (low.includes('anomali') || low.includes('erreur') || low.includes('contrôle')) return a.anomalies.anomalies.length === 0 ? 'Aucune anomalie détectée.' : `${a.anomalies.anomalies.length} anomalie(s) :\n\n${a.anomalies.anomalies.slice(0, 5).map((x) => `${x.severity === 'high' ? '!!' : '-'} ${x.title}\n  ${x.description}`).join('\n\n')}`;
  if (low.includes('prévi') || low.includes('trésor') || low.includes('cash')) return `Prévision trésorerie ${a.predictions.horizon}j :\n- Solde actuel : ${fmtMoney(a.predictions.soldeActuel)}\n- Flux moyen : ${fmtMoney(a.predictions.fluxMoyenMensuel)}/mois\n- Solde prévu : ${fmtMoney(a.predictions.soldePrevu)}\n${a.predictions.risqueRupture ? '\nALERTE : Risque de rupture !' : ''}`;
  if (low.includes('rentabil') || low.includes('marge')) return a.commentary.sections.filter((s) => s.section === 'sig').map((s) => `**${s.title}** : ${s.text}`).join('\n\n');
  if (low.includes('bfr') || low.includes('fonds de roulement')) return a.commentary.sections.filter((s) => s.section === 'bilan').map((s) => `**${s.title}** : ${s.text}`).join('\n\n');
  if (low.includes('ratio')) { const al = a.ratios.filter((r) => r.status !== 'good'); return al.length ? `${al.length} ratio(s) hors seuil :\n${al.map((r) => `- ${r.label} : ${r.value.toFixed(2)} ${r.unit} (cible ${r.target})`).join('\n')}` : 'Tous les ratios sont dans les normes.'; }
  if (low.includes('résum') || low.includes('synthèse')) return `${a.commentary.synthese}\n\n${a.commentary.sections.slice(0, 4).map((s) => `**${s.title}** : ${s.text.split('\n')[0]}`).join('\n\n')}`;
  if (kCtx) return kCtx;
  return 'Je peux analyser : score de santé, anomalies, prévisions trésorerie, rentabilité, BFR, ratios, questions SYSCOHADA.';
}

export { checkOllamaStatus } from './ollama';
