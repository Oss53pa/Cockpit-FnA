/**
 * Ollama client — LLM local pour analyse financière confidentielle.
 * Aucune donnée ne quitte le poste de l'utilisateur.
 */

import { safeLocalStorage } from './safeStorage';

const DEFAULT_URL = 'http://localhost:11434';

function getBaseUrl(): string {
  return safeLocalStorage.getItem('ollama-url') || import.meta.env.VITE_OLLAMA_URL || DEFAULT_URL;
}

export interface OllamaModel {
  name: string;
  size: number;
  modified_at: string;
}

export interface OllamaStatus {
  available: boolean;
  models: OllamaModel[];
  selectedModel: string | null;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// Cache du dernier statut OK pour éviter le flapping (cf. aiClient.ts).
let lastOllamaStatus: OllamaStatus | null = null;

/** Vérifie si Ollama est disponible et liste les modèles installés */
export async function checkOllama(): Promise<OllamaStatus> {
  try {
    // Timeout 10s — supporte les cold starts d'Ollama.
    const res = await fetch(`${getBaseUrl()}/api/tags`, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) {
      // Si on avait un statut OK avant, on garde l'affichage stable
      if (lastOllamaStatus?.available) return lastOllamaStatus;
      return { available: false, models: [], selectedModel: null };
    }
    const data = await res.json();
    const models = (data.models ?? []).map((m: any) => ({
      name: m.name,
      size: m.size,
      modified_at: m.modified_at,
    }));
    const selected = safeLocalStorage.getItem('ollama-model') || models[0]?.name || null;
    const status: OllamaStatus = { available: true, models, selectedModel: selected };
    lastOllamaStatus = status;
    return status;
  } catch {
    // Tolérance échec transitoire si on était connecté juste avant
    if (lastOllamaStatus?.available) return lastOllamaStatus;
    return { available: false, models: [], selectedModel: null };
  }
}

/** Chat streaming — retourne un AsyncGenerator de tokens */
export async function* chat(
  model: string,
  messages: ChatMessage[],
  options?: { temperature?: number; maxTokens?: number }
): AsyncGenerator<string> {
  const res = await fetch(`${getBaseUrl()}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      options: {
        temperature: options?.temperature ?? 0.3,
        num_predict: options?.maxTokens ?? 1024,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Ollama error: ${err}`);
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split('\n').filter(Boolean);

    for (const line of lines) {
      try {
        const json = JSON.parse(line);
        if (json.message?.content) {
          yield json.message.content;
        }
      } catch {
        // skip malformed JSON chunks
      }
    }
  }
}

/** Chat non-streaming — retourne la réponse complète */
export async function chatComplete(
  model: string,
  messages: ChatMessage[],
  options?: { temperature?: number; maxTokens?: number }
): Promise<string> {
  const res = await fetch(`${getBaseUrl()}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      options: {
        temperature: options?.temperature ?? 0.3,
        num_predict: options?.maxTokens ?? 1024,
      },
    }),
  });

  if (!res.ok) throw new Error(`Ollama error: ${await res.text()}`);
  const data = await res.json();
  return data.message?.content ?? '';
}

/** Sauvegarde les préférences Ollama */
export function saveOllamaConfig(config: { url?: string; model?: string; temperature?: number }) {
  if (config.url) safeLocalStorage.setItem('ollama-url', config.url);
  if (config.model) safeLocalStorage.setItem('ollama-model', config.model);
  if (config.temperature !== undefined) safeLocalStorage.setItem('ollama-temperature', String(config.temperature));
}

export function getOllamaConfig() {
  return {
    url: safeLocalStorage.getItem('ollama-url') || DEFAULT_URL,
    model: safeLocalStorage.getItem('ollama-model') || '',
    temperature: parseFloat(safeLocalStorage.getItem('ollama-temperature') || '0.3'),
  };
}
