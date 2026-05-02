import { useState } from 'react';
import { Bot, Loader2, ChevronUp } from 'lucide-react';
import { useAI as useOllama } from '../../hooks/useAI';
import { StreamingText } from './StreamingText';
import type { FinancialContext } from '../../engine/ai/contextBuilder';

interface Props {
  alertTitle: string;
  alertDescription: string;
  context: FinancialContext;
  onCreateAction?: (recommendation: string) => void;
}

/**
 * Bouton "Analyser avec l'IA" pour les alertes / points d'attention.
 * Génère un diagnostic + causes + recommandations.
 */
export function AIAlertAnalysis({ alertTitle, alertDescription, context, onCreateAction }: Props) {
  const { status, sendMessage, streaming, streamedText } = useOllama();
  const [analysis, setAnalysis] = useState('');
  const [expanded, setExpanded] = useState(false);

  if (!status.available) return null;

  const analyze = async () => {
    setExpanded(true);
    setAnalysis('');
    try {
      const prompt = `Analyse ce point d'attention :\n\nTitre : ${alertTitle}\nDescription : ${alertDescription}\n\nFournis un diagnostic complet avec causes probables et actions recommandées.`;
      const result = await sendMessage(prompt, context, 'alert');
      setAnalysis(result);
    } catch {
      setAnalysis("Erreur lors de l'analyse.");
    }
  };

  if (!expanded) {
    return (
      <button onClick={analyze} className="btn-ghost text-xs gap-1">
        <Bot className="w-3.5 h-3.5" /> Analyser (IA)
      </button>
    );
  }

  return (
    <div className="mt-3 p-3 bg-primary-50 dark:bg-primary-900/50 rounded-lg border border-primary-200 dark:border-primary-800">
      <button onClick={() => setExpanded(false)} className="flex items-center gap-2 mb-2 text-xs font-medium text-primary-500">
        <Bot className="w-3.5 h-3.5" /> Analyse IA
        {streaming ? <Loader2 className="w-3 h-3 animate-spin" /> : <ChevronUp className="w-3 h-3" />}
      </button>

      <div className="text-sm min-h-[60px]">
        {streaming ? (
          <StreamingText text={streamedText} streaming={streaming} />
        ) : (
          <span className="whitespace-pre-line text-primary-700 dark:text-primary-300">{analysis}</span>
        )}
      </div>

      {!streaming && analysis && onCreateAction && (
        <div className="flex justify-end mt-3">
          <button onClick={() => onCreateAction(analysis)} className="btn-primary text-xs">
            Créer une action
          </button>
        </div>
      )}
    </div>
  );
}
