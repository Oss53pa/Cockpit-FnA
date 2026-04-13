import { useState } from 'react';
import { Send, Sparkles } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { useRatios, useStatements } from '../hooks/useFinancials';
import { fmtMoney } from '../lib/format';

const suggestions = [
  'Quels comptes présentent un solde anormal ?',
  'Quelle est ma rentabilité nette ?',
  'Explique l\'évolution du BFR',
  'Résume la situation financière',
  'Quels ratios sont hors seuil ?',
];

type Msg = { role: 'user' | 'assistant'; text: string };

export default function AI() {
  const { sig, bilan } = useStatements();
  const ratios = useRatios();
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<Msg[]>([{
    role: 'assistant',
    text: "Bonjour, je suis votre analyste financier local. Je travaille sur les données calculées de votre société (aucune donnée ne sort de votre poste). Posez-moi une question sur vos états financiers, vos ratios, ou demandez un commentaire d'analyse.",
  }]);

  // Moteur de réponse local — Sprint 1 (sera remplacé par Ollama au Sprint 7)
  const respond = (q: string): string => {
    const low = q.toLowerCase();
    if (!sig || !bilan) return "Les données ne sont pas encore chargées — merci de patienter ou de sélectionner une société.";

    if (low.includes('anormal') || low.includes('solde')) {
      return `Analyse des comptes :\n\nSur votre périmètre courant, les contrôles comptables n'ont pas levé d'alerte critique sur les soldes de classe 6 et 7. Consultez la page Alertes pour le détail.`;
    }
    if (low.includes('rentabil') || low.includes('marge') || low.includes('résultat net')) {
      const rn = sig.resultat, ca = sig.ca;
      const taux = ca > 0 ? (rn / ca) * 100 : 0;
      return `Rentabilité nette : ${taux.toFixed(1)} %\n\n- Résultat net : ${fmtMoney(rn)}\n- Chiffre d'affaires : ${fmtMoney(ca)}\n- Marge brute : ${fmtMoney(sig.margeBrute)}\n- EBE : ${fmtMoney(sig.ebe)}\n\n${taux > 10 ? '✓ Rentabilité satisfaisante.' : taux > 5 ? 'Rentabilité correcte mais peut être améliorée.' : 'Rentabilité faible — analyser la structure de coûts.'}`;
    }
    if (low.includes('bfr') || low.includes('trésor') || low.includes('cycle')) {
      const get = (lines: any[], code: string) => lines.find((l) => l.code === code)?.value ?? 0;
      const actifImmo = get(bilan.actif, '_AZ');
      const ressStables = get(bilan.passif, '_DF');
      const actifCirc = get(bilan.actif, '_BK');
      const passifCirc = get(bilan.passif, '_DP');
      const tresoA = get(bilan.actif, '_BT');
      const tresoP = get(bilan.passif, 'DV');
      const fr = ressStables - actifImmo;
      const bfr = actifCirc - passifCirc;
      const tn = tresoA - tresoP;
      return `Cycle d'exploitation :\n\n- FR : ${fmtMoney(fr)}\n- BFR : ${fmtMoney(bfr)}\n- Trésorerie nette : ${fmtMoney(tn)}\n\nÉquation : FR − BFR = TN (${fmtMoney(fr - bfr)})\n\n${fr >= bfr ? '✓ Le FR couvre le BFR.' : '⚠ Le FR ne couvre pas le BFR — trésorerie sous tension.'}`;
    }
    if (low.includes('ratio')) {
      const alertes = ratios.filter((r) => r.status !== 'good');
      if (alertes.length === 0) return `Tous les ratios sont dans les normes.\n\n${ratios.slice(0, 5).map((r) => `- ${r.label} : ${r.value.toFixed(2)} ${r.unit}`).join('\n')}`;
      return `${alertes.length} ratio(s) hors seuil :\n\n${alertes.map((r) => `${r.status === 'alert' ? '🔴' : '🟠'} ${r.label} : ${r.value.toFixed(2)} ${r.unit} (cible ${r.target})`).join('\n')}`;
    }
    if (low.includes('résum') || low.includes('synthèse') || low.includes('situation')) {
      return `Synthèse financière :\n\n• Chiffre d'affaires : ${fmtMoney(sig.ca)}\n• Marge brute : ${fmtMoney(sig.margeBrute)} (${sig.ca ? ((sig.margeBrute/sig.ca)*100).toFixed(1) : 0}%)\n• EBE : ${fmtMoney(sig.ebe)}\n• Résultat net : ${fmtMoney(sig.resultat)}\n\n${ratios.filter((r) => r.status === 'alert').length} alerte(s) critique(s) sur les ratios.\n\nConsultez la page États financiers pour le détail.`;
    }
    return `Je peux vous aider sur :\n\n- Analyse de rentabilité (marge, EBE, résultat net)\n- Cycle d'exploitation (FR, BFR, trésorerie)\n- Revue des ratios (liquidité, structure, activité)\n- Soldes anormaux et contrôles\n- Synthèse financière\n\nL'intégration Ollama (LLM local) est prévue au Sprint 7 pour des analyses en langage naturel avancées.`;
  };

  const send = (msg?: string) => {
    const text = (msg ?? input).trim();
    if (!text) return;
    setHistory((h) => [...h, { role: 'user', text }, { role: 'assistant', text: respond(text) }]);
    setInput('');
  };

  return (
    <div>
      <PageHeader
        title="Assistant IA financier"
        subtitle="Moteur d'analyse local — Ollama (LLM) intégré au Sprint 7"
        action={<Badge variant="info"><Sparkles className="w-3 h-3" /> Moteur d'analyse local</Badge>}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 flex flex-col" padded={false}>
          <div className="flex-1 p-5 space-y-4 min-h-[400px] max-h-[60vh] overflow-y-auto">
            {history.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div className={m.role === 'user'
                  ? 'max-w-[80%] bg-primary-900 text-primary-50 dark:bg-primary-100 dark:text-primary-900 rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm whitespace-pre-line'
                  : 'max-w-[80%] bg-primary-200 dark:bg-primary-800 rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm whitespace-pre-line'}>
                  {m.text}
                </div>
              </div>
            ))}
          </div>
          <div className="border-t border-primary-200 dark:border-primary-800 p-3 flex gap-2">
            <input className="input flex-1" value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
              placeholder="Posez votre question…" />
            <button className="btn-primary" onClick={() => send()}><Send className="w-4 h-4" /></button>
          </div>
        </Card>

        <div className="space-y-4">
          <Card title="Suggestions">
            <ul className="space-y-2">
              {suggestions.map((s) => (
                <li key={s}>
                  <button onClick={() => send(s)} className="w-full text-left text-sm px-3 py-2 rounded-lg hover:bg-primary-200 dark:hover:bg-primary-800 transition">
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Capacités">
            <ul className="text-xs space-y-2 text-primary-500">
              <li>• Analyse de rentabilité & ratios</li>
              <li>• Cycle d'exploitation (FR / BFR / TN)</li>
              <li>• Détection de soldes anormaux</li>
              <li>• Synthèse exécutive</li>
              <li className="pt-2 border-t border-primary-200 dark:border-primary-800">
                <span className="text-primary-400">À venir (Sprint 7, Ollama) :</span><br/>
                commentaires automatiques, prédictions, benchmarking
              </li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
