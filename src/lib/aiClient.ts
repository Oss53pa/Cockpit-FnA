/**
 * Client IA unifié — Cockpit FnA
 *
 * Supporte 2 providers :
 *  1. ollama (local)  : LLM sur la machine, données 100% locales
 *  2. openai (cloud)  : API OpenAI-compatible (OpenAI, Mistral La Plateforme,
 *                       Groq, Together, Anthropic via proxy compatible…).
 *                       Fonctionne en production déployée.
 *
 * Configuration via localStorage. Le user choisit son provider dans Settings.
 * En production sans Ollama, le mode 'openai' est requis.
 */

const CFG_KEY = 'ai-config';

export type AIProvider = 'ollama' | 'openai' | 'none';

export interface AIConfig {
  provider: AIProvider;
  // Ollama
  ollamaUrl: string;
  ollamaModel: string;
  // OpenAI-compatible
  openaiBaseUrl: string;        // ex: https://api.openai.com/v1, https://api.mistral.ai/v1, https://api.groq.com/openai/v1
  openaiApiKey: string;
  openaiModel: string;          // ex: gpt-4o-mini, mistral-small-latest, llama-3.3-70b-versatile
  // Commun
  temperature: number;
}

export const DEFAULTS: AIConfig = {
  provider: 'none',
  ollamaUrl: 'http://localhost:11434',
  ollamaModel: '',
  openaiBaseUrl: 'https://api.openai.com/v1',
  openaiApiKey: '',
  openaiModel: 'gpt-4o-mini',
  temperature: 0.3,
};

export const PROVIDER_PRESETS: Array<{
  id: string; name: string; baseUrl: string; suggestedModel: string; signupUrl: string; description: string;
}> = [
  { id: 'openai',   name: 'OpenAI',                 baseUrl: 'https://api.openai.com/v1',           suggestedModel: 'gpt-4o-mini',          signupUrl: 'https://platform.openai.com/api-keys',          description: 'GPT-4o, fiable et précis. Tarif raisonnable, latence faible.' },
  { id: 'mistral',  name: 'Mistral La Plateforme',  baseUrl: 'https://api.mistral.ai/v1',           suggestedModel: 'mistral-small-latest', signupUrl: 'https://console.mistral.ai/api-keys',           description: 'Européen, multilingue, conforme RGPD. Très bon en français.' },
  { id: 'groq',     name: 'Groq',                   baseUrl: 'https://api.groq.com/openai/v1',      suggestedModel: 'llama-3.3-70b-versatile', signupUrl: 'https://console.groq.com/keys',              description: 'Inférence ultra-rapide (>500 tokens/s). Llama 3.3 70B hébergé.' },
  { id: 'together', name: 'Together AI',            baseUrl: 'https://api.together.xyz/v1',         suggestedModel: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo', signupUrl: 'https://api.together.ai/settings/api-keys', description: 'Modèles open-source hébergés (Llama, Qwen, Mixtral).' },
  { id: 'anthropic', name: 'Anthropic Claude (via proxy)', baseUrl: 'https://api.anthropic.com/v1', suggestedModel: 'claude-3-5-sonnet-20241022', signupUrl: 'https://console.anthropic.com/settings/keys', description: 'Claude Sonnet — qualité haut de gamme. Nécessite un proxy OpenAI-compat.' },
];

/** Nettoie une chaîne pour ne garder que les caractères ASCII imprimables.
 *  Supprime les zero-width spaces, BOM, et autres caractères Unicode invisibles
 *  souvent collés par erreur dans les clés API. */
function sanitize(s: string): string {
  return s.replace(/[^\x20-\x7E]/g, '').trim();
}

// Mapping de modèles décommissionnés → leur successeur officiel
// (mis à jour quand un fournisseur retire un modèle pour migrer auto les users)
const DEPRECATED_MODELS: Record<string, string> = {
  // Groq — voir https://console.groq.com/docs/deprecations
  'llama-3.1-70b-versatile': 'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant': 'llama-3.1-8b-instant', // toujours valide
  'mixtral-8x7b-32768': 'llama-3.3-70b-versatile', // décommissionné
  // OpenAI
  'gpt-4-vision-preview': 'gpt-4o',
  'gpt-3.5-turbo-0301': 'gpt-3.5-turbo',
  // Anthropic
  'claude-3-sonnet-20240229': 'claude-3-5-sonnet-20241022',
  'claude-2.1': 'claude-3-5-sonnet-20241022',
};

export function loadConfig(): AIConfig {
  try {
    const raw = localStorage.getItem(CFG_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = { ...DEFAULTS, ...JSON.parse(raw) };
    // Nettoie les champs sensibles (clé API, URLs) pour éviter les erreurs fetch
    if (parsed.openaiApiKey) parsed.openaiApiKey = sanitize(parsed.openaiApiKey);
    if (parsed.openaiBaseUrl) parsed.openaiBaseUrl = sanitize(parsed.openaiBaseUrl);
    if (parsed.ollamaUrl) parsed.ollamaUrl = sanitize(parsed.ollamaUrl);
    // Migration auto : si le modèle est dans la liste des décommissionnés,
    // remplace par le successeur et persiste
    if (parsed.openaiModel && DEPRECATED_MODELS[parsed.openaiModel]) {
      const oldModel = parsed.openaiModel;
      parsed.openaiModel = DEPRECATED_MODELS[oldModel];
      // eslint-disable-next-line no-console
      console.info(`[AI] Migration auto modèle décommissionné : ${oldModel} → ${parsed.openaiModel}`);
      try { localStorage.setItem(CFG_KEY, JSON.stringify(parsed)); } catch { /* ignore */ }
    }
    return parsed;
  } catch { return { ...DEFAULTS }; }
}

export function saveConfig(cfg: Partial<AIConfig>) {
  if (cfg.openaiApiKey) cfg.openaiApiKey = sanitize(cfg.openaiApiKey);
  if (cfg.openaiBaseUrl) cfg.openaiBaseUrl = sanitize(cfg.openaiBaseUrl);
  if (cfg.ollamaUrl) cfg.ollamaUrl = sanitize(cfg.ollamaUrl);
  const merged = { ...loadConfig(), ...cfg };
  localStorage.setItem(CFG_KEY, JSON.stringify(merged));
  return merged;
}

// ─── Types communs ────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AIStatus {
  available: boolean;
  provider: AIProvider;
  models: string[];
  selectedModel: string | null;
  errorMessage?: string;
}

// ─── Détection automatique du provider disponible ────────────────────

export async function detectStatus(cfg: AIConfig = loadConfig()): Promise<AIStatus> {
  if (cfg.provider === 'ollama') {
    return await checkOllamaStatus(cfg);
  }
  if (cfg.provider === 'openai') {
    return await checkOpenAIStatus(cfg);
  }
  return { available: false, provider: 'none', models: [], selectedModel: null, errorMessage: 'Aucun provider IA configuré.' };
}

async function checkOllamaStatus(cfg: AIConfig): Promise<AIStatus> {
  try {
    const res = await fetch(`${cfg.ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return { available: false, provider: 'ollama', models: [], selectedModel: null, errorMessage: `HTTP ${res.status}` };
    const data = await res.json();
    const models = (data.models ?? []).map((m: any) => m.name as string);
    const selected = cfg.ollamaModel || models[0] || null;
    return { available: true, provider: 'ollama', models, selectedModel: selected };
  } catch (e: any) {
    return {
      available: false, provider: 'ollama', models: [], selectedModel: null,
      errorMessage: e?.message?.includes('Failed to fetch')
        ? "Ollama non démarré. Lancez : ollama serve"
        : e?.message ?? 'Erreur réseau',
    };
  }
}

async function checkOpenAIStatus(cfg: AIConfig): Promise<AIStatus> {
  if (!cfg.openaiApiKey) {
    return { available: false, provider: 'openai', models: [], selectedModel: null, errorMessage: 'Clé API manquante. Configurez-la dans Settings → IA.' };
  }
  try {
    // Appel /models pour valider la clé et lister
    const res = await fetch(`${cfg.openaiBaseUrl}/models`, {
      headers: { 'Authorization': `Bearer ${cfg.openaiApiKey}` },
      signal: AbortSignal.timeout(5000),
    });
    if (res.status === 401) {
      return { available: false, provider: 'openai', models: [], selectedModel: null, errorMessage: 'Clé API invalide.' };
    }
    if (!res.ok) {
      // Certains providers ne supportent pas /models (ex: Anthropic) — on tolère
      return { available: true, provider: 'openai', models: cfg.openaiModel ? [cfg.openaiModel] : [], selectedModel: cfg.openaiModel };
    }
    const data = await res.json();
    const models: string[] = (data.data ?? []).map((m: any) => m.id).filter(Boolean);
    const selected = cfg.openaiModel || models[0] || null;
    return { available: true, provider: 'openai', models, selectedModel: selected };
  } catch (e: any) {
    return { available: false, provider: 'openai', models: [], selectedModel: null, errorMessage: e?.message ?? 'Erreur réseau' };
  }
}

// ─── Chat unifié (streaming) ──────────────────────────────────────────

export async function* chatStream(
  messages: ChatMessage[],
  options?: { temperature?: number; maxTokens?: number; signal?: AbortSignal },
): AsyncGenerator<string> {
  const cfg = loadConfig();
  const status = await detectStatus(cfg);
  if (!status.available) throw new Error(status.errorMessage ?? 'IA non disponible');
  if (!status.selectedModel) throw new Error('Aucun modèle sélectionné');

  if (cfg.provider === 'ollama') {
    yield* chatOllamaStream(cfg, status.selectedModel, messages, options);
    return;
  }
  if (cfg.provider === 'openai') {
    yield* chatOpenAIStream(cfg, status.selectedModel, messages, options);
    return;
  }
  throw new Error('Provider IA non supporté');
}

async function* chatOllamaStream(
  cfg: AIConfig, model: string, messages: ChatMessage[],
  options?: { temperature?: number; maxTokens?: number; signal?: AbortSignal },
): AsyncGenerator<string> {
  const res = await fetch(`${cfg.ollamaUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model, messages, stream: true,
      options: { temperature: options?.temperature ?? cfg.temperature, num_predict: options?.maxTokens ?? 1024 },
    }),
    signal: options?.signal,
  });
  if (!res.ok) throw new Error(`Ollama: ${await res.text()}`);
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    for (const line of chunk.split('\n').filter(Boolean)) {
      try {
        const j = JSON.parse(line);
        if (j.message?.content) yield j.message.content;
      } catch { /* skip */ }
    }
  }
}

async function* chatOpenAIStream(
  cfg: AIConfig, model: string, messages: ChatMessage[],
  options?: { temperature?: number; maxTokens?: number; signal?: AbortSignal },
): AsyncGenerator<string> {
  const res = await fetch(`${cfg.openaiBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${cfg.openaiApiKey}`,
    },
    body: JSON.stringify({
      model, messages, stream: true,
      temperature: options?.temperature ?? cfg.temperature,
      max_tokens: options?.maxTokens ?? 1024,
    }),
    signal: options?.signal,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Cloud AI: HTTP ${res.status} — ${err.slice(0, 200)}`);
  }
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ')) continue;
      const payload = trimmed.slice(6);
      if (payload === '[DONE]') return;
      try {
        const j = JSON.parse(payload);
        const delta = j.choices?.[0]?.delta?.content;
        if (delta) yield delta;
      } catch { /* skip */ }
    }
  }
}

// ─── Chat non-streaming (utilitaire simple) ───────────────────────────

export async function chatComplete(
  messages: ChatMessage[],
  options?: { temperature?: number; maxTokens?: number; signal?: AbortSignal },
): Promise<string> {
  let full = '';
  for await (const token of chatStream(messages, options)) full += token;
  return full;
}

// ─── Helpers ──────────────────────────────────────────────────────────

/** Indique si l'IA est utilisable (provider configuré + accessible). */
export async function isAIAvailable(): Promise<boolean> {
  const status = await detectStatus();
  return status.available;
}

/** Auto-détecte un provider disponible (Ollama d'abord, sinon openai si clé). */
export async function autoConfigureProvider(): Promise<AIProvider> {
  const cfg = loadConfig();
  // Si user a déjà choisi, respecte
  if (cfg.provider !== 'none') return cfg.provider;
  // Tente Ollama
  const ollamaStatus = await checkOllamaStatus({ ...cfg, provider: 'ollama' });
  if (ollamaStatus.available) {
    saveConfig({ provider: 'ollama' });
    return 'ollama';
  }
  // Si clé OpenAI déjà configurée, bascule dessus
  if (cfg.openaiApiKey) {
    saveConfig({ provider: 'openai' });
    return 'openai';
  }
  return 'none';
}
