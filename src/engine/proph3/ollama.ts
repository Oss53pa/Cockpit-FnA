// Connecteur LLM Ollama pour Proph3 — 100% local
export interface OllamaMessage { role: 'system' | 'user' | 'assistant'; content: string; }
export interface OllamaResponse { content: string; model: string; tokensUsed: number; latencyMs: number; }
export interface OllamaStatus { available: boolean; model: string | null; models: string[]; }

const BASE = 'http://localhost:11434', MODEL = 'mistral';

export async function checkOllamaStatus(): Promise<OllamaStatus> {
  try {
    const r = await fetch(`${BASE}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!r.ok) return { available: false, model: null, models: [] };
    const d = await r.json(); const models = (d.models ?? []).map((m: { name: string }) => m.name);
    return { available: true, model: models.some((m: string) => m.startsWith(MODEL)) ? MODEL : models[0] ?? null, models };
  } catch { return { available: false, model: null, models: [] }; }
}

export async function chatWithOllama(messages: OllamaMessage[], model?: string): Promise<OllamaResponse> {
  const start = Date.now(), m = model ?? MODEL;
  const r = await fetch(`${BASE}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: m, stream: false, options: { temperature: 0.1 }, messages }), signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error(`Ollama ${r.status}: ${await r.text()}`);
  const d = await r.json();
  return { content: d.message?.content ?? '', model: m, tokensUsed: d.eval_count ?? 0, latencyMs: Date.now() - start };
}

export function buildSystemPrompt(ctx: { companyName?: string; country?: string; currency?: string; year?: number; sigSummary?: string; ratiosSummary?: string; scoreSummary?: string; }): string {
  return `Tu es PROPH3, expert-comptable IA spécialisé SYSCOHADA révisé 2017 (17 pays OHADA).
Société : ${ctx.companyName ?? '—'} | Pays : ${ctx.country ?? "Côte d'Ivoire"} | Devise : ${ctx.currency ?? 'XOF'} | Exercice : ${ctx.year ?? new Date().getFullYear()}
${ctx.sigSummary ? `\nSIG : ${ctx.sigSummary}` : ''}${ctx.ratiosSummary ? `\nRatios : ${ctx.ratiosSummary}` : ''}${ctx.scoreSummary ? `\nScore : ${ctx.scoreSummary}` : ''}
Règles : citer les articles AUDCIF, utiliser les vrais chiffres, répondre en français, être concis.`;
}
