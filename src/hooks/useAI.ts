/**
 * Hook AI unifié — remplace useOllama. Supporte Ollama + Cloud (OpenAI-compat).
 * Configurable dans Settings → IA. Production-ready.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { detectStatus, chatStream, type AIStatus, type ChatMessage, loadConfig } from '../lib/aiClient';
import { SYSTEM_PROMPT, COMPACT_PROMPT, REPORT_COMMENT_PROMPT, ALERT_ANALYSIS_PROMPT } from '../engine/ai/systemPrompt';
import { buildContext, buildCompactContext, type FinancialContext } from '../engine/ai/contextBuilder';

export type AIChatMode = 'full' | 'compact' | 'report' | 'alert';

interface UseAIReturn {
  status: AIStatus;
  loading: boolean;
  streaming: boolean;
  streamedText: string;
  sendMessage: (question: string, context: FinancialContext, mode?: AIChatMode) => Promise<string>;
  cancelStream: () => void;
  refreshStatus: () => Promise<void>;
}

export function useAI(): UseAIReturn {
  const [status, setStatus] = useState<AIStatus>({ available: false, provider: 'none', models: [], selectedModel: null });
  const [loading, setLoading] = useState(true);
  const [streaming, setStreaming] = useState(false);
  const [streamedText, setStreamedText] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const refreshStatus = useCallback(async () => {
    setLoading(true);
    const s = await detectStatus();
    setStatus(s);
    setLoading(false);
  }, []);

  useEffect(() => { refreshStatus(); }, [refreshStatus]);

  const cancelStream = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
  }, []);

  const sendMessage = useCallback(async (
    question: string,
    context: FinancialContext,
    mode: AIChatMode = 'full',
  ): Promise<string> => {
    if (!status.available) throw new Error(status.errorMessage ?? 'IA non disponible');

    const cfg = loadConfig();
    const systemPrompt = mode === 'compact' ? COMPACT_PROMPT
      : mode === 'report' ? REPORT_COMMENT_PROMPT
      : mode === 'alert' ? ALERT_ANALYSIS_PROMPT
      : SYSTEM_PROMPT;

    const contextStr = mode === 'compact' ? buildCompactContext(context) : buildContext(question, context);

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `${contextStr}\n\n---\n\nQuestion : ${question}` },
    ];

    abortRef.current = new AbortController();
    setStreaming(true);
    setStreamedText('');
    let fullText = '';
    try {
      for await (const token of chatStream(messages, {
        temperature: cfg.temperature,
        maxTokens: mode === 'compact' ? 200 : mode === 'report' ? 500 : 1024,
        signal: abortRef.current.signal,
      })) {
        fullText += token;
        setStreamedText(fullText);
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') return fullText;
      throw e;
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
    return fullText;
  }, [status]);

  return { status, loading, streaming, streamedText, sendMessage, cancelStream, refreshStatus };
}
