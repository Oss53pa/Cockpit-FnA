import { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, Bot, WifiOff, StopCircle, RefreshCw, Settings2 } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { StreamingText } from '../components/ui/StreamingText';
import { useRatios, useStatements } from '../hooks/useFinancials';
import { useOllama } from '../hooks/useOllama';
import { useApp } from '../store/app';
import { fmtMoney } from '../lib/format';
import { saveOllamaConfig, getOllamaConfig } from '../lib/ollama';
import type { FinancialContext } from '../engine/ai/contextBuilder';

const suggestions = [
  'Quels comptes présentent un solde anormal ?',
  'Quelle est ma rentabilité nette ?',
  "Explique l'évolution du BFR",
  'Résume la situation financière',
  'Quels ratios sont hors seuil ?',
  'Identifie les risques financiers',
  'Rédige un commentaire pour le rapport',
];

type Msg = { role: 'user' | 'assistant'; text: string; streaming?: boolean };

export default function AI() {
  const { sig, bilan } = useStatements();
  const ratios = useRatios();
  const orgId = useApp(s => s.currentOrgId);
  const year = useApp(s => s.currentYear);
  const { status, streaming, streamedText, sendMessage, cancelStream, refreshStatus } = useOllama();

  const [input, setInput] = useState('');
  const [history, setHistory] = useState<Msg[]>([{
    role: 'assistant',
    text: "Bonjour, je suis votre analyste financier. Je travaille sur les données de votre société en toute confidentialité (aucune donnée ne sort de votre poste). Posez-moi une question sur vos états financiers, ratios ou demandez un commentaire d'analyse.",
  }]);
  const [showConfig, setShowConfig] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [history, streamedText]);

  // Build financial context for the LLM
  const buildFinContext = (): FinancialContext => {
    const bilanSummary = bilan ? {
      totalActif: bilan.actif.find((l: any) => l.code === '_BT')?.value ?? 0,
      totalPassif: bilan.passif.find((l: any) => l.code === '_DV')?.value ?? 0,
      capitauxPropres: bilan.passif.find((l: any) => l.code === '_DF')?.value ?? 0,
      dettes: bilan.passif.find((l: any) => l.code === '_DP')?.value ?? 0,
      immobilisations: bilan.actif.find((l: any) => l.code === '_AZ')?.value ?? 0,
      actifCirculant: bilan.actif.find((l: any) => l.code === '_BK')?.value ?? 0,
      tresorerie: bilan.actif.find((l: any) => l.code === '_BT')?.value ?? 0,
    } : undefined;

    return { sig: sig ?? undefined, bilan: bilanSummary, ratios, orgName: orgId, year };
  };

  // ── Fallback heuristique (quand Ollama n'est pas disponible) ──
  const respondLocal = (q: string): string => {
    const low = q.toLowerCase();
    if (!sig || !bilan) return "Les données ne sont pas encore chargées.";

    if (low.includes('anormal') || low.includes('solde')) {
      return `Analyse des comptes :\n\nSur votre périmètre courant, les contrôles comptables n'ont pas levé d'alerte critique. Consultez la page Alertes pour le détail.`;
    }
    if (low.includes('rentabil') || low.includes('marge') || low.includes('résultat net')) {
      const rn = sig.resultat, ca = sig.ca;
      const taux = ca > 0 ? (rn / ca) * 100 : 0;
      return `Rentabilité nette : ${taux.toFixed(1)} %\n\n- Résultat net : ${fmtMoney(rn)}\n- CA : ${fmtMoney(ca)}\n- Marge brute : ${fmtMoney(sig.margeBrute)}\n- EBE : ${fmtMoney(sig.ebe)}\n\n${taux > 10 ? 'Rentabilité satisfaisante.' : taux > 5 ? 'Rentabilité correcte mais améliorable.' : 'Rentabilité faible — analyser la structure de coûts.'}`;
    }
    if (low.includes('bfr') || low.includes('trésor') || low.includes('cycle')) {
      const get = (lines: any[], code: string) => lines.find((l: any) => l.code === code)?.value ?? 0;
      const fr = get(bilan.passif, '_DF') - get(bilan.actif, '_AZ');
      const bfrVal = get(bilan.actif, '_BK') - get(bilan.passif, '_DP');
      const tn = fr - bfrVal;
      return `Cycle d'exploitation :\n\n- FR : ${fmtMoney(fr)}\n- BFR : ${fmtMoney(bfrVal)}\n- Trésorerie nette : ${fmtMoney(tn)}\n\n${fr >= bfrVal ? 'Le FR couvre le BFR.' : 'Le FR ne couvre pas le BFR — trésorerie sous tension.'}`;
    }
    if (low.includes('ratio')) {
      const alertes = ratios.filter((r) => r.status !== 'good');
      if (!alertes.length) return `Tous les ratios sont conformes.\n\n${ratios.slice(0, 5).map((r) => `- ${r.label} : ${r.value.toFixed(2)} ${r.unit}`).join('\n')}`;
      return `${alertes.length} ratio(s) hors seuil :\n\n${alertes.map((r) => `${r.status === 'alert' ? '!!' : '--'} ${r.label} : ${r.value.toFixed(2)} ${r.unit} (cible ${r.target})`).join('\n')}`;
    }
    if (low.includes('résum') || low.includes('synthèse') || low.includes('situation')) {
      return `Synthèse financière :\n\n- CA : ${fmtMoney(sig.ca)}\n- Marge brute : ${fmtMoney(sig.margeBrute)} (${sig.ca ? ((sig.margeBrute / sig.ca) * 100).toFixed(1) : 0}%)\n- EBE : ${fmtMoney(sig.ebe)}\n- Résultat net : ${fmtMoney(sig.resultat)}\n\n${ratios.filter((r) => r.status === 'alert').length} alerte(s) critique(s).`;
    }
    return `Je peux vous aider sur :\n\n- Analyse de rentabilité\n- Cycle d'exploitation (FR, BFR, TN)\n- Revue des ratios\n- Soldes anormaux\n- Synthèse financière\n\nPour des analyses plus poussées, installez Ollama avec un modèle compatible (Llama 3, Mistral, Phi).`;
  };

  // ── Send ──────────────────────────────────────────────────────
  const send = async (msg?: string) => {
    const text = (msg ?? input).trim();
    if (!text || streaming) return;
    setInput('');

    setHistory(h => [...h, { role: 'user', text }]);

    if (status.available && status.selectedModel) {
      // Ollama streaming
      setHistory(h => [...h, { role: 'assistant', text: '', streaming: true }]);
      try {
        const response = await sendMessage(text, buildFinContext(), 'full');
        setHistory(h => {
          const copy = [...h];
          copy[copy.length - 1] = { role: 'assistant', text: response };
          return copy;
        });
      } catch (err: any) {
        setHistory(h => {
          const copy = [...h];
          copy[copy.length - 1] = { role: 'assistant', text: `Erreur Ollama : ${err.message}\n\nFallback local :\n${respondLocal(text)}` };
          return copy;
        });
      }
    } else {
      // Fallback heuristique
      setHistory(h => [...h, { role: 'assistant', text: respondLocal(text) }]);
    }
  };

  return (
    <div>
      <PageHeader
        title="Assistant IA financier"
        subtitle={status.available ? `Ollama — ${status.selectedModel}` : 'Moteur local (Ollama non détecté)'}
        action={
          <div className="flex items-center gap-2">
            {status.available ? (
              <Badge variant="success" showIcon>{status.selectedModel?.split(':')[0]}</Badge>
            ) : (
              <Badge variant="warning" showIcon>Mode local</Badge>
            )}
            <button onClick={() => setShowConfig(!showConfig)} className="btn-ghost p-1.5">
              <Settings2 className="w-4 h-4" />
            </button>
          </div>
        }
      />

      {/* Config panel */}
      {showConfig && <OllamaConfig status={status} onClose={() => setShowConfig(false)} onRefresh={refreshStatus} />}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 flex flex-col" padded={false}>
          <div className="flex-1 p-5 space-y-4 min-h-[400px] max-h-[60vh] overflow-y-auto">
            {history.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div className={m.role === 'user'
                  ? 'max-w-[80%] bg-primary-900 text-primary-50 dark:bg-primary-100 dark:text-primary-900 rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm whitespace-pre-line'
                  : 'max-w-[80%] bg-primary-200 dark:bg-primary-800 rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm'}>
                  {m.streaming ? (
                    <StreamingText text={streamedText} streaming={streaming} />
                  ) : (
                    <span className="whitespace-pre-line">{m.text}</span>
                  )}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          <div className="border-t border-primary-200 dark:border-primary-800 p-3 flex gap-2">
            <input className="input flex-1" value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
              placeholder={streaming ? 'Génération en cours...' : 'Posez votre question…'}
              disabled={streaming} />
            {streaming ? (
              <button className="btn-outline" onClick={cancelStream}><StopCircle className="w-4 h-4" /></button>
            ) : (
              <button className="btn-primary" onClick={() => send()}><Send className="w-4 h-4" /></button>
            )}
          </div>
        </Card>

        <div className="space-y-4">
          <Card title="Suggestions">
            <ul className="space-y-2">
              {suggestions.map((s) => (
                <li key={s}>
                  <button onClick={() => send(s)} disabled={streaming}
                    className="w-full text-left text-sm px-3 py-2 rounded-lg hover:bg-primary-200 dark:hover:bg-primary-800 transition disabled:opacity-50">
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Statut IA">
            <div className="text-xs space-y-2 text-primary-500">
              <div className="flex items-center gap-2">
                {status.available ? (
                  <><Bot className="w-4 h-4 text-success" /> <span className="text-success font-medium">Ollama connecté</span></>
                ) : (
                  <><WifiOff className="w-4 h-4 text-warning" /> <span className="text-warning font-medium">Ollama non détecté</span></>
                )}
              </div>
              {status.available && (
                <>
                  <p>Modèle : <span className="font-medium text-primary-700 dark:text-primary-300">{status.selectedModel}</span></p>
                  <p>{status.models.length} modèle(s) installé(s)</p>
                </>
              )}
              {!status.available && (
                <div className="pt-2 space-y-1">
                  <p className="font-medium">Pour activer l'IA :</p>
                  <p>1. Installer Ollama</p>
                  <p>2. <code className="bg-primary-200 dark:bg-primary-800 px-1 rounded">ollama pull llama3.1</code></p>
                  <p>3. Relancer cette page</p>
                </div>
              )}
              <button onClick={refreshStatus} className="btn-ghost text-xs mt-2 w-full">
                <RefreshCw className="w-3 h-3" /> Vérifier la connexion
              </button>
            </div>
          </Card>

          <Card title="Confidentialité">
            <p className="text-xs text-primary-500 leading-relaxed">
              Toutes les analyses sont effectuées <strong>localement</strong> sur votre poste.
              Aucune donnée financière n'est transmise à un serveur externe.
              {status.available ? ' Ollama tourne en local sur votre machine.' : ' Le moteur heuristique intégré est utilisé.'}
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ── Ollama Config Panel ─────────────────────────────────────────────
function OllamaConfig({ status, onClose, onRefresh }: { status: any; onClose: () => void; onRefresh: () => void }) {
  const config = getOllamaConfig();
  const [url, setUrl] = useState(config.url);
  const [model, setModel] = useState(config.model);
  const [temp, setTemp] = useState(config.temperature);

  const save = () => {
    saveOllamaConfig({ url, model, temperature: temp });
    onRefresh();
    onClose();
  };

  return (
    <Card className="mb-6">
      <div className="p-4">
        <h3 className="text-sm font-semibold mb-4">Configuration Ollama</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="text-xs font-medium text-primary-500 mb-1 block">URL Ollama</label>
            <input className="input" value={url} onChange={e => setUrl(e.target.value)} placeholder="http://localhost:11434" />
          </div>
          <div>
            <label className="text-xs font-medium text-primary-500 mb-1 block">Modèle</label>
            {status.models.length > 0 ? (
              <select className="input" value={model} onChange={e => setModel(e.target.value)}>
                {status.models.map((m: any) => (
                  <option key={m.name} value={m.name}>{m.name} ({(m.size / 1e9).toFixed(1)} GB)</option>
                ))}
              </select>
            ) : (
              <input className="input" value={model} onChange={e => setModel(e.target.value)} placeholder="llama3.1" />
            )}
          </div>
          <div>
            <label className="text-xs font-medium text-primary-500 mb-1 block">Température ({temp})</label>
            <input type="range" min="0" max="1" step="0.1" value={temp} onChange={e => setTemp(parseFloat(e.target.value))}
              className="w-full mt-2" />
            <div className="flex justify-between text-[10px] text-primary-400">
              <span>Factuel</span><span>Créatif</span>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button className="btn-ghost" onClick={onClose}>Annuler</button>
          <button className="btn-primary" onClick={save}>Enregistrer</button>
        </div>
      </div>
    </Card>
  );
}
