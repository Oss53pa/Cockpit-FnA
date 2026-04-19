import { useState } from 'react';
import { Bot, Loader2, Check, X } from 'lucide-react';
import { useOllama } from '../../hooks/useOllama';
import type { FinancialContext } from '../../engine/ai/contextBuilder';

interface Props {
  sectionTitle: string;
  context: FinancialContext;
  onAccept: (comment: string) => void;
  tone?: 'technique' | 'direction' | 'conseil';
}

const tonePrompts: Record<string, string> = {
  technique: 'Utilise un ton technique destiné au contrôleur de gestion.',
  direction: "Utilise un ton synthétique et stratégique destiné à la Direction Générale.",
  conseil: "Utilise un ton formel et mesuré destiné au Conseil d'Administration.",
};

/**
 * Bouton "Générer le commentaire IA" pour les sections de rapport.
 * Utilise Ollama pour générer, l'utilisateur peut accepter ou rejeter.
 */
export function AICommentButton({ sectionTitle, context, onAccept, tone = 'direction' }: Props) {
  const { status, sendMessage, streaming, streamedText, cancelStream } = useOllama();
  const [generated, setGenerated] = useState('');
  const [showPreview, setShowPreview] = useState(false);

  if (!status.available) return null;

  const generate = async () => {
    setShowPreview(true);
    setGenerated('');
    try {
      const prompt = `Rédige un commentaire pour la section "${sectionTitle}" du rapport financier. ${tonePrompts[tone]}`;
      const result = await sendMessage(prompt, context, 'report');
      setGenerated(result);
    } catch {
      setGenerated("Erreur lors de la génération. Veuillez réessayer.");
    }
  };

  if (!showPreview) {
    return (
      <button onClick={generate} className="btn-ghost text-xs gap-1" title="Générer un commentaire avec l'IA">
        <Bot className="w-3.5 h-3.5" /> Commenter (IA)
      </button>
    );
  }

  return (
    <div className="mt-3 p-3 bg-primary-50 dark:bg-primary-900/50 rounded-lg border border-primary-200 dark:border-primary-800">
      <div className="flex items-center gap-2 mb-2">
        <Bot className="w-3.5 h-3.5 text-primary-500" />
        <span className="text-xs font-medium text-primary-500">Commentaire IA</span>
        {streaming && <Loader2 className="w-3 h-3 animate-spin text-primary-400" />}
      </div>

      <div className="text-sm text-primary-700 dark:text-primary-300 whitespace-pre-line min-h-[60px]">
        {streaming ? streamedText : generated}
      </div>

      <div className="flex justify-end gap-2 mt-3">
        {streaming ? (
          <button onClick={cancelStream} className="btn-ghost text-xs"><X className="w-3 h-3" /> Annuler</button>
        ) : (
          <>
            <button onClick={() => setShowPreview(false)} className="btn-ghost text-xs"><X className="w-3 h-3" /> Rejeter</button>
            <button onClick={() => { onAccept(generated); setShowPreview(false); }} className="btn-primary text-xs">
              <Check className="w-3 h-3" /> Accepter
            </button>
            <button onClick={generate} className="btn-outline text-xs">
              <Bot className="w-3 h-3" /> Régénérer
            </button>
          </>
        )}
      </div>
    </div>
  );
}
