import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot, Send, X } from 'lucide-react';
import { useRatios, useStatements } from '../../hooks/useFinancials';
import { fmtMoney } from '../../lib/format';

export function FloatingAI() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<Array<{ role: 'user' | 'ai'; text: string }>>([
    { role: 'ai', text: "Bonjour, je suis Proph3t. Posez-moi une question sur vos finances." },
  ]);
  const { sig, bilan } = useStatements();
  const ratios = useRatios();
  const navigate = useNavigate();

  const respond = (q: string): string => {
    if (!sig || !bilan) return 'Données en cours de chargement…';
    const low = q.toLowerCase();
    if (low.includes('ca') || low.includes('chiffre')) return `Chiffre d'affaires : ${fmtMoney(sig.ca)}`;
    if (low.includes('résultat') || low.includes('rn')) return `Résultat net : ${fmtMoney(sig.resultat)} (marge ${sig.ca ? ((sig.resultat/sig.ca)*100).toFixed(1) : 0} %)`;
    if (low.includes('ebe')) return `EBE : ${fmtMoney(sig.ebe)} · Taux : ${sig.ca ? ((sig.ebe/sig.ca)*100).toFixed(1) : 0} %`;
    if (low.includes('trésor') || low.includes('cash')) {
      const g = (lines: any[], code: string) => lines.find((l) => l.code === code)?.value ?? 0;
      const tn = g(bilan.actif, '_BT') - g(bilan.passif, 'DV');
      return `Trésorerie nette : ${fmtMoney(tn)}`;
    }
    if (low.includes('ratio') || low.includes('alerte')) {
      const alertes = ratios.filter((r) => r.status !== 'good');
      return alertes.length ? `${alertes.length} ratio(s) hors seuil :\n${alertes.slice(0, 3).map((r) => `• ${r.label} : ${r.value.toFixed(2)} ${r.unit}`).join('\n')}` : '✓ Tous les ratios sont dans les normes.';
    }
    return "Je peux vous aider sur : CA, résultat, EBE, trésorerie, ratios, alertes. Pour plus d'options, ouvrez l'assistant complet.";
  };

  const send = () => {
    if (!input.trim()) return;
    setHistory((h) => [...h, { role: 'user', text: input }, { role: 'ai', text: respond(input) }]);
    setInput('');
  };

  return (
    <>
      {/* Bulle flottante */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-primary-900 dark:bg-primary-100 text-primary-50 dark:text-primary-900 shadow-lg hover:scale-110 transition flex items-center justify-center group"
          title="Assistant Proph3t"
        >
          <Bot className="w-6 h-6 group-hover:rotate-12 transition-transform" />
          <span className="absolute -top-1 -right-1 w-3 h-3 bg-primary-500 rounded-full border-2 border-white" />
        </button>
      )}

      {/* Panneau de chat flottant */}
      {open && (
        <div className="fixed bottom-6 right-6 z-40 w-96 max-w-[calc(100vw-3rem)] h-[480px] bg-white dark:bg-primary-900 border border-primary-200 dark:border-primary-800 rounded-xl shadow-2xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="bg-primary-900 dark:bg-primary-950 text-primary-50 px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-800 flex items-center justify-center">
                <Bot className="w-4 h-4 text-primary-900 dark:text-primary-100" />
              </div>
              <div>
                <p className="text-sm font-bold">Proph3t</p>
                <p className="text-[10px] text-primary-300">Assistant financier local</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => { setOpen(false); navigate('/ai'); }} className="text-[10px] px-2 py-1 rounded hover:bg-primary-800 text-primary-300 hover:text-white">
                Ouvrir ↗
              </button>
              <button onClick={() => setOpen(false)} className="p-1 hover:bg-primary-800 rounded"><X className="w-4 h-4" /></button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {history.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div className={m.role === 'user'
                  ? 'max-w-[85%] bg-primary-900 dark:bg-primary-100 text-primary-50 dark:text-primary-900 rounded-2xl rounded-tr-sm px-3 py-2 text-xs whitespace-pre-line'
                  : 'max-w-[85%] bg-primary-100 dark:bg-primary-800 rounded-2xl rounded-tl-sm px-3 py-2 text-xs whitespace-pre-line'}>
                  {m.text}
                </div>
              </div>
            ))}
          </div>

          {/* Suggestions rapides */}
          <div className="px-3 pb-2 flex gap-1 flex-wrap">
            {['CA', 'Résultat', 'Trésorerie', 'Alertes'].map((s) => (
              <button key={s} onClick={() => { setInput(s); setTimeout(() => { setInput(''); setHistory((h) => [...h, { role: 'user', text: s }, { role: 'ai', text: respond(s) }]); }, 50); }}
                className="text-[10px] px-2 py-0.5 rounded-full bg-primary-100 dark:bg-primary-800 hover:bg-primary-200 dark:hover:bg-primary-700">
                {s}
              </button>
            ))}
          </div>

          {/* Input */}
          <div className="border-t border-primary-200 dark:border-primary-800 p-2 flex gap-1.5">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
              placeholder="Posez une question…"
              className="flex-1 px-3 py-2 text-xs bg-primary-50 dark:bg-primary-950 border border-primary-200 dark:border-primary-800 rounded focus:outline-none focus:border-primary-500"
            />
            <button onClick={send} className="btn-primary !px-3 !py-2"><Send className="w-3.5 h-3.5" /></button>
          </div>
        </div>
      )}
    </>
  );
}
