import { useEffect, useState } from 'react';
import { Bot, Wifi, WifiOff } from 'lucide-react';
import { checkOllama, type OllamaStatus as Status } from '../../lib/ollama';

/** Petit indicateur de statut Ollama pour le Header ou la sidebar */
export function OllamaStatusBadge() {
  const [status, setStatus] = useState<Status>({ available: false, models: [], selectedModel: null });

  useEffect(() => {
    checkOllama().then(setStatus);
    const interval = setInterval(() => checkOllama().then(setStatus), 60_000);
    return () => clearInterval(interval);
  }, []);

  if (!status.available) {
    return (
      <div className="flex items-center gap-1.5 text-[10px] text-primary-400" title="Ollama non détecté">
        <WifiOff className="w-3 h-3" />
        <span>IA hors ligne</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 text-[10px] text-success" title={`Modèle : ${status.selectedModel}`}>
      <Bot className="w-3 h-3" />
      <Wifi className="w-3 h-3" />
      <span>{status.selectedModel?.split(':')[0] ?? 'IA'}</span>
    </div>
  );
}
