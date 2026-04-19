import { useState, useEffect, useCallback, useRef } from 'react';
import { checkOllama, chat, type OllamaStatus, type ChatMessage, getOllamaConfig } from '../lib/ollama';
import { SYSTEM_PROMPT, COMPACT_PROMPT, REPORT_COMMENT_PROMPT, ALERT_ANALYSIS_PROMPT } from '../engine/ai/systemPrompt';
import { buildContext, buildCompactContext, type FinancialContext } from '../engine/ai/contextBuilder';

export type AIChatMode = 'full' | 'compact' | 'report' | 'alert';

interface UseOllamaReturn {
  status: OllamaStatus;
  loading: boolean;
  streaming: boolean;
  streamedText: string;
  sendMessage: (question: string, context: FinancialContext, mode?: AIChatMode) => Promise<string>;
  cancelStream: () => void;
  refreshStatus: () => Promise<void>;
}

export function useOllama(): UseOllamaReturn {
  const [status, setStatus] = useState<OllamaStatus>({ available: false, models: [], selectedModel: null });
  const [loading, setLoading] = useState(true);
  const [streaming, setStreaming] = useState(false);
  const [streamedText, setStreamedText] = useState('');
  const abortRef = useRef(false);

  const refreshStatus = useCallback(async () => {
    setLoading(true);
    const s = await checkOllama();
    setStatus(s);
    setLoading(false);
  }, []);

  useEffect(() => { refreshStatus(); }, [refreshStatus]);

  const cancelStream = useCallback(() => { abortRef.current = true; }, []);

  const sendMessage = useCallback(async (
    question: string,
    context: FinancialContext,
    mode: AIChatMode = 'full'
  ): Promise<string> => {
    if (!status.available || !status.selectedModel) {
      throw new Error('Ollama non disponible');
    }

    const config = getOllamaConfig();
    const systemPrompt = mode === 'compact' ? COMPACT_PROMPT
      : mode === 'report' ? REPORT_COMMENT_PROMPT
      : mode === 'alert' ? ALERT_ANALYSIS_PROMPT
      : SYSTEM_PROMPT;

    const contextStr = mode === 'compact'
      ? buildCompactContext(context)
      : buildContext(question, context);

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `${contextStr}\n\n---\n\nQuestion : ${question}` },
    ];

    setStreaming(true);
    setStreamedText('');
    abortRef.current = false;

    let fullText = '';

    try {
      for await (const token of chat(status.selectedModel, messages, {
        temperature: config.temperature,
        maxTokens: mode === 'compact' ? 200 : mode === 'report' ? 500 : 1024,
      })) {
        if (abortRef.current) break;
        fullText += token;
        setStreamedText(fullText);
      }
    } finally {
      setStreaming(false);
    }

    return fullText;
  }, [status]);

  return { status, loading, streaming, streamedText, sendMessage, cancelStream, refreshStatus };
}
