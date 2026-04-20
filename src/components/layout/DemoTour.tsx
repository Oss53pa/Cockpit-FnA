// Visite guidée flottante — accompagne l'utilisateur de page en page
// pendant le mode démo. Persistant, repositionnable, escapable.
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, Check, X, GripVertical, Sparkles,
  Home, BookOpen, FileSpreadsheet, LayoutDashboard, FileText, Bot, Bell,
  Calculator, Wallet,
} from 'lucide-react';
import { useDemoMode, setTourStep, markTourDone } from '../../lib/demoMode';

type TourStep = {
  path: string;
  icon: any;
  title: string;
  body: string;
  hint?: string;
};

const STEPS: TourStep[] = [
  { path: '/home', icon: Home, title: '1. Accueil', body: 'Vue de cockpit avec les 4 KPIs clés : CA, Résultat net, EBE, Marge. Cliquez sur un chiffre pour zoomer dessus.', hint: 'Astuce : la trésorerie nette s\'affiche sous les KPIs.' },
  { path: '/grand-livre', icon: BookOpen, title: '2. Grand Livre', body: 'Visualisez les ~2 500 écritures démo : ventes TVA 18 %, achats, salaires, OD, paiements. Filtrez par journal, compte, date.', hint: 'Le bouton "Audit GL" lance 16 contrôles automatiques.' },
  { path: '/states', icon: FileSpreadsheet, title: '3. États financiers', body: 'Bilan, Compte de Résultat, TFT, Annexes — 100 % SYSCOHADA révisé. Toggle Entier ↔ Abrégé en haut à droite.', hint: 'Export Excel disponible.' },
  { path: '/dashboard/home', icon: LayoutDashboard, title: '4. Dashboards', body: 'Synthèse exécutive multi-graphiques : évolution CA, structure charges, position trésorerie, top tiers.', hint: '45+ dashboards disponibles dans le Catalogue.' },
  { path: '/ratios', icon: Calculator, title: '5. Ratios financiers', body: 'Liquidité, solvabilité, rentabilité, BFR, autonomie financière — comparés aux normes sectorielles SYSCOHADA.', hint: 'Statut visuel : bon / acceptable / critique.' },
  { path: '/budget', icon: Wallet, title: '6. Budget vs Réalisé', body: 'Budget V1 chargé pour 15 comptes clés. Comparaison mensuelle réalisé / budget / écart en % et en valeur absolue.' },
  { path: '/alerts', icon: Bell, title: '7. Alertes', body: '6 points d\'attention pré-détectés : créances clients, écart budget, TVA à reverser, trésorerie tendue, etc.', hint: 'Chaque alerte peut être assignée et suivie.' },
  { path: '/actions', icon: FileText, title: '8. Plan d\'action', body: '5 plans d\'action liés aux alertes : recouvrement, ligne crédit, TVA, forecast V2, audit annuel.', hint: 'Suivez la progression % et les responsables.' },
  { path: '/reports', icon: FileText, title: '9. Reporting', body: 'Rapport mensuel pré-rédigé en mode brouillon. 23 sections personnalisables, signatures, PDF WYSIWYG.' },
  { path: '/ai', icon: Bot, title: '10. Proph3t IA', body: 'Assistant SYSCOHADA avec mémoire pré-chargée : observations, snapshots, conversation initiale.', hint: 'Posez n\'importe quelle question comptable.' },
];

const ACCENT = '#B8954A';        // dorée mate Atlas Studio
const ACCENT_LIGHT = '#D4B870';  // dorée mate claire

export function DemoTour() {
  const { isDemo, tourStep, tourDone } = useDemoMode();
  const navigate = useNavigate();
  const loc = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number }>(() => {
    try {
      const s = localStorage.getItem('demo-tour-pos');
      if (s) return JSON.parse(s);
    } catch { /* */ }
    return { x: window.innerWidth - 380, y: window.innerHeight - 320 };
  });
  const dragRef = useRef<{ startX: number; startY: number; startPos: { x: number; y: number } } | null>(null);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragRef.current) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      const next = {
        x: Math.max(8, Math.min(window.innerWidth - 360, dragRef.current.startPos.x + dx)),
        y: Math.max(8, Math.min(window.innerHeight - 100, dragRef.current.startPos.y + dy)),
      };
      setPos(next);
    }
    function onUp() {
      if (dragRef.current) {
        try { localStorage.setItem('demo-tour-pos', JSON.stringify(pos)); } catch { /* */ }
      }
      dragRef.current = null;
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [pos]);

  if (!isDemo || tourDone) return null;
  // Ne pas afficher sur la page de démo elle-même
  if (loc.pathname === '/demo' || loc.pathname === '/') return null;

  const step = Math.max(0, Math.min(STEPS.length - 1, tourStep));
  const current = STEPS[step];
  const Icon = current.icon;

  const goNext = () => {
    if (step >= STEPS.length - 1) {
      markTourDone();
      return;
    }
    const next = step + 1;
    setTourStep(next);
    navigate(STEPS[next].path);
  };
  const goPrev = () => {
    if (step <= 0) return;
    const prev = step - 1;
    setTourStep(prev);
    navigate(STEPS[prev].path);
  };
  const close = () => markTourDone();

  const startDrag = (e: React.MouseEvent) => {
    dragRef.current = { startX: e.clientX, startY: e.clientY, startPos: pos };
  };

  if (collapsed) {
    return (
      <button onClick={() => setCollapsed(false)}
        style={{ left: pos.x, top: pos.y, background: ACCENT }}
        className="fixed z-50 flex items-center gap-2 px-3 py-2 rounded-full text-white text-xs font-bold shadow-2xl hover:scale-105 transition">
        <Sparkles className="w-3.5 h-3.5" />
        Visite guidée ({step + 1}/{STEPS.length})
      </button>
    );
  }

  return (
    <div
      style={{ left: pos.x, top: pos.y, width: 340 }}
      className="fixed z-50 bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
      {/* Header draggable */}
      <div onMouseDown={startDrag}
        style={{ background: `linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT_LIGHT} 100%)` }}
        className="flex items-center gap-2 px-3 py-2 text-white cursor-move select-none">
        <GripVertical className="w-3.5 h-3.5 opacity-70" />
        <Sparkles className="w-3.5 h-3.5" />
        <span className="text-xs font-bold flex-1">Visite guidée · {step + 1}/{STEPS.length}</span>
        <button onClick={() => setCollapsed(true)} title="Réduire" className="p-1 hover:bg-white/20 rounded">
          <span className="block w-3 h-0.5 bg-white" />
        </button>
        <button onClick={close} title="Fermer la visite" className="p-1 hover:bg-white/20 rounded">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Body */}
      <div className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${ACCENT}1a` }}>
            <Icon className="w-4 h-4" style={{ color: ACCENT }} />
          </div>
          <h3 className="text-sm font-bold text-zinc-900 dark:text-white">{current.title}</h3>
        </div>
        <p className="text-[12.5px] text-zinc-700 dark:text-zinc-300 leading-relaxed mb-2">{current.body}</p>
        {current.hint && (
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 italic border-l-2 pl-2 py-0.5"
            style={{ borderColor: ACCENT }}>
            💡 {current.hint}
          </p>
        )}
      </div>

      {/* Progress bar */}
      <div className="px-4 pb-2">
        <div className="h-1 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
          <div className="h-full transition-all" style={{ width: `${((step + 1) / STEPS.length) * 100}%`, background: ACCENT }} />
        </div>
      </div>

      {/* Footer nav */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60">
        <button onClick={goPrev} disabled={step === 0}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed transition">
          <ArrowLeft className="w-3.5 h-3.5" /> Précédent
        </button>
        <div className="flex-1 text-[10px] text-center text-zinc-400">
          {loc.pathname === current.path ? '✓ Vous êtes ici' : `Aller à ${current.path}`}
        </div>
        <button onClick={() => navigate(current.path)}
          className="px-2 py-1.5 rounded-lg text-[11px] font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition">
          Ouvrir
        </button>
        <button onClick={goNext}
          style={{ background: ACCENT }}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-white hover:opacity-90 transition">
          {step === STEPS.length - 1 ? <>Terminer <Check className="w-3.5 h-3.5" /></> : <>Suivant <ArrowRight className="w-3.5 h-3.5" /></>}
        </button>
      </div>
    </div>
  );
}
