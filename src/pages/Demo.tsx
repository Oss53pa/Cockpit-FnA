// Page DEMO — porte d'entrée vers l'application en mode démonstration
// Charge un jeu de données SYSCOHADA réaliste (DEMO INDUSTRIES SA),
// bascule l'org courante sur 'demo-org' et propose un parcours guidé.
import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Sparkles, Database, ArrowRight, Check, AlertCircle, Loader2, RefreshCw,
  LayoutDashboard, FileSpreadsheet, BookOpen, FileText, Bot, ShieldCheck, ExternalLink, Home,
} from 'lucide-react';
import { loadDemoData, DEMO_ORG_ID_EXPORT, unloadDemoData } from '../engine/demoSeed';
import { useApp } from '../store/app';
import { setDemoMode, setTourStep, resetTour } from '../lib/demoMode';

type Step =
  | { id: 'home'; icon: any; label: 'Accueil'; to: '/home'; desc: string }
  | { id: 'gl'; icon: any; label: 'Grand Livre'; to: '/grand-livre'; desc: string }
  | { id: 'states'; icon: any; label: 'États financiers'; to: '/states'; desc: string }
  | { id: 'dashboards'; icon: any; label: 'Dashboards'; to: '/dashboard/home'; desc: string }
  | { id: 'reports'; icon: any; label: 'Reporting'; to: '/reports'; desc: string }
  | { id: 'ai'; icon: any; label: 'Proph3t IA'; to: '/ai'; desc: string };

const TOUR_STEPS: Step[] = [
  { id: 'home', icon: Home, label: 'Accueil', to: '/home', desc: 'Vue synthétique avec les 4 KPIs clés (CA, Résultat net, EBE, Marge).' },
  { id: 'gl', icon: BookOpen, label: 'Grand Livre', to: '/grand-livre', desc: '~2 500 écritures réalistes : ventes, achats, salaires, paiements, OD.' },
  { id: 'states', icon: FileSpreadsheet, label: 'États financiers', to: '/states', desc: 'Bilan, Compte de Résultat, TFT, Annexes — 100 % SYSCOHADA révisé.' },
  { id: 'dashboards', icon: LayoutDashboard, label: 'Dashboards', to: '/dashboard/home', desc: '45+ tableaux de bord : Pareto, Waterfall, BFR, Cash forecast, Du Pont…' },
  { id: 'reports', icon: FileText, label: 'Reporting', to: '/reports', desc: 'Rapports 23 sections personnalisables, export PDF WYSIWYG.' },
  { id: 'ai', icon: Bot, label: 'Proph3t IA', to: '/ai', desc: 'Assistant SYSCOHADA + commentaires automatiques + prédictions.' },
];

type Status = 'idle' | 'loading' | 'success' | 'error';

export default function Demo() {
  const navigate = useNavigate();
  const setCurrentOrg = useApp((s) => s.setCurrentOrg);
  const setCurrentYear = useApp((s) => s.setCurrentYear);
  const theme = useApp((s) => s.theme);
  const [status, setStatus] = useState<Status>('idle');
  const [stats, setStats] = useState<{ accounts: number; entries: number; ca: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Force light bg on this page
  useEffect(() => {
    document.body.style.background = theme === 'dark' ? '#1F1F23' : '#fafafa';
    return () => { document.body.style.background = ''; };
  }, [theme]);

  const launchDemo = async () => {
    setStatus('loading');
    setError(null);
    try {
      const result = await loadDemoData();
      setStats(result);
      setCurrentOrg(DEMO_ORG_ID_EXPORT);
      setCurrentYear(new Date().getFullYear());
      // Active le mode démo + reset du parcours
      setDemoMode(true);
      resetTour();
      setStatus('success');
    } catch (e: any) {
      console.error(e);
      setError(e?.message || 'Erreur inconnue lors du chargement de la démo.');
      setStatus('error');
    }
  };

  const reset = async () => {
    await unloadDemoData();
    setDemoMode(false);
    resetTour();
    setStats(null);
    setStatus('idle');
  };

  const startGuidedTour = () => {
    setTourStep(0);
    navigate('/home');
  };

  const isDark = theme === 'dark';
  const bg = isDark ? 'bg-[#1F1F23]' : 'bg-[#fafafa]';
  const card = isDark ? 'bg-white/5 border-white/10' : 'bg-white border-zinc-200';
  const text = isDark ? 'text-white' : 'text-zinc-900';
  const subtle = isDark ? 'text-zinc-400' : 'text-zinc-600';
  const accent = isDark ? '#D4B870' : '#B8954A';

  return (
    <div className={`min-h-screen ${bg} ${text} px-4 sm:px-6 py-8`}>
      <div className="max-w-5xl mx-auto">
        {/* HEADER */}
        <div className="flex items-center justify-between mb-10">
          <Link to="/" className={`text-xs ${subtle} hover:opacity-80 transition inline-flex items-center gap-1.5`}>
            <ExternalLink className="w-3 h-3" /> Retour à la présentation
          </Link>
          <div className="text-xs font-mono opacity-60">DEMO · CockPit F&amp;A</div>
        </div>

        {/* TITRE */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold mb-5"
            style={{ background: `${accent}22`, color: accent }}>
            <Sparkles className="w-3.5 h-3.5" /> Mode démonstration
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
            Découvrez Cockpit avec une <span style={{ color: accent }}>entreprise fictive</span>
          </h1>
          <p className={`text-base sm:text-lg ${subtle} max-w-2xl mx-auto`}>
            DEMO INDUSTRIES SA — Une PME industrielle ivoirienne avec 12 mois de comptabilité
            SYSCOHADA réaliste : ventes, achats, salaires, immobilisations, emprunts.
          </p>
        </div>

        {/* CARTE PRINCIPALE */}
        {status === 'idle' && (
          <div className={`${card} border rounded-2xl p-8 sm:p-10 text-center`}>
            <Database className="w-12 h-12 mx-auto mb-4" style={{ color: accent }} />
            <h2 className="text-xl font-bold mb-2">Charger les données de démonstration</h2>
            <p className={`text-sm ${subtle} mb-6 max-w-lg mx-auto`}>
              ~40 comptes du plan SYSCOHADA, ~2 500 écritures réparties sur 12 périodes,
              un budget annuel V1, et tous les états calculés automatiquement. Aucune donnée ne quitte votre navigateur.
            </p>
            <button onClick={launchDemo}
              className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl text-sm font-bold text-white shadow-lg hover:opacity-90 transition"
              style={{ background: accent }}>
              <Sparkles className="w-4 h-4" /> Lancer la démo
              <ArrowRight className="w-4 h-4" />
            </button>
            <p className={`text-[11px] ${subtle} mt-4`}>
              ⚠ La démo écrase l'organisation existante <code>demo-org</code> (mais ne touche pas à vos autres orgs).
            </p>
          </div>
        )}

        {status === 'loading' && (
          <div className={`${card} border rounded-2xl p-12 text-center`}>
            <Loader2 className="w-10 h-10 mx-auto mb-4 animate-spin" style={{ color: accent }} />
            <p className="font-semibold">Génération des données en cours…</p>
            <p className={`text-xs ${subtle} mt-2`}>Création des comptes, écritures, périodes, budget…</p>
          </div>
        )}

        {status === 'error' && (
          <div className={`${card} border rounded-2xl p-8 text-center border-red-500/40`}>
            <AlertCircle className="w-10 h-10 mx-auto mb-4 text-red-500" />
            <p className="font-semibold mb-2">Erreur lors du chargement</p>
            <p className={`text-xs ${subtle} mb-4`}>{error}</p>
            <button onClick={launchDemo}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold border border-current">
              <RefreshCw className="w-4 h-4" /> Réessayer
            </button>
          </div>
        )}

        {status === 'success' && stats && (
          <>
            {/* RÉCAP CHARGEMENT */}
            <div className={`${card} border rounded-2xl p-6 sm:p-8 mb-8`}>
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-full flex items-center justify-center"
                  style={{ background: `${accent}22`, color: accent }}>
                  <Check className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-bold">Démo chargée avec succès</p>
                  <p className={`text-xs ${subtle}`}>Société active : DEMO INDUSTRIES SA · Exercice {new Date().getFullYear()}</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <Stat value={stats.accounts.toString()} label="Comptes" accent={accent} subtle={subtle} />
                <Stat value={stats.entries.toLocaleString('fr-FR')} label="Écritures" accent={accent} subtle={subtle} />
                <Stat value={`${(stats.ca / 1_000_000).toFixed(0)} M`} label="CA budgété (FCFA)" accent={accent} subtle={subtle} />
              </div>
            </div>

            {/* PARCOURS GUIDÉ */}
            <div className="mb-6">
              <h3 className="text-lg font-bold mb-1">Parcours guidé</h3>
              <p className={`text-xs ${subtle}`}>Cliquez sur une étape pour explorer la fonctionnalité correspondante.</p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-10">
              {TOUR_STEPS.map((step, idx) => (
                <button key={step.id} onClick={() => navigate(step.to)}
                  className={`${card} border rounded-xl p-4 text-left hover:scale-[1.02] hover:shadow-lg transition group`}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] font-mono opacity-50">0{idx + 1}</span>
                    <step.icon className="w-4 h-4" style={{ color: accent }} />
                    <span className="text-sm font-semibold">{step.label}</span>
                    <ArrowRight className="w-3.5 h-3.5 ml-auto opacity-0 group-hover:opacity-100 transition" />
                  </div>
                  <p className={`text-xs ${subtle} leading-relaxed`}>{step.desc}</p>
                </button>
              ))}
            </div>

            {/* CTAs */}
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button onClick={startGuidedTour}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold text-white shadow-lg hover:opacity-90 transition"
                style={{ background: accent }}>
                <Sparkles className="w-4 h-4" /> Démarrer la visite guidée (10 étapes)
                <ArrowRight className="w-4 h-4" />
              </button>
              <button onClick={() => navigate('/home')}
                className={`inline-flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold border ${isDark ? 'border-white/20 hover:bg-white/5' : 'border-zinc-300 hover:bg-zinc-100'} transition`}>
                <ShieldCheck className="w-4 h-4" /> Entrer librement dans l'application
              </button>
              <button onClick={reset}
                className={`inline-flex items-center gap-2 px-4 py-3 rounded-xl text-xs font-medium ${isDark ? 'text-zinc-400 hover:text-white' : 'text-zinc-500 hover:text-zinc-900'} transition`}>
                <RefreshCw className="w-3.5 h-3.5" /> Recharger / quitter
              </button>
            </div>
          </>
        )}

        {/* FOOTER NOTE */}
        <p className={`text-center text-[11px] ${subtle} mt-12`}>
          Données 100 % fictives · Aucun envoi serveur · Stockage local IndexedDB
        </p>
      </div>
    </div>
  );
}

function Stat({ value, label, accent, subtle }: { value: string; label: string; accent: string; subtle: string }) {
  return (
    <div className="text-center">
      <p className="text-2xl sm:text-3xl font-bold num" style={{ color: accent }}>{value}</p>
      <p className={`text-[11px] uppercase tracking-wider mt-1 ${subtle}`}>{label}</p>
    </div>
  );
}
