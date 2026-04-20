// Bandeau persistant affiché en haut des pages applicatives quand le mode
// démo est actif. Permet de sortir du mode démo proprement.
import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Sparkles, X, LogOut, RotateCcw } from 'lucide-react';
import { useDemoMode, setDemoMode, resetTour, DEMO_ORG_ID } from '../../lib/demoMode';
import { unloadDemoData } from '../../engine/demoSeed';
import { useApp } from '../../store/app';

export function DemoBanner() {
  const { isDemo } = useDemoMode();
  const navigate = useNavigate();
  const loc = useLocation();
  const setCurrentOrg = useApp((s) => s.setCurrentOrg);
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(false);

  if (!isDemo || hidden) return null;

  const exitDemo = async () => {
    if (!confirm('Quitter le mode démo et supprimer les données fictives ?')) return;
    setBusy(true);
    try {
      await unloadDemoData();
      setDemoMode(false);
      resetTour();
      // Switch sur une org neutre (ou sa-001 si elle existe)
      setCurrentOrg('sa-001');
      navigate('/');
    } finally {
      setBusy(false);
    }
  };

  const restartTour = () => {
    resetTour();
    navigate('/demo');
  };

  return (
    <div
      style={{ background: 'linear-gradient(90deg, #B8954A 0%, #D4B870 100%)' }}
      className="sticky top-0 z-30 text-white text-xs font-medium shadow-md">
      <div className="px-3 sm:px-4 py-1.5 flex items-center gap-3 flex-wrap">
        <span className="inline-flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5" />
          <strong className="font-bold">Mode démonstration actif</strong>
          <span className="hidden sm:inline opacity-80">— DEMO INDUSTRIES SA · données fictives</span>
        </span>
        <span className="opacity-50 hidden md:inline">·</span>
        <span className="hidden md:inline opacity-80">Org : {DEMO_ORG_ID}</span>
        <span className="opacity-50 hidden md:inline">·</span>
        <span className="hidden md:inline opacity-80">{loc.pathname}</span>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={restartTour}
            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-white/15 hover:bg-white/25 transition">
            <RotateCcw className="w-3 h-3" /> Recommencer la visite
          </button>
          <button onClick={exitDemo} disabled={busy}
            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-white/15 hover:bg-white/25 transition disabled:opacity-50">
            <LogOut className="w-3 h-3" /> {busy ? 'Sortie…' : 'Quitter la démo'}
          </button>
          <button onClick={() => setHidden(true)} title="Masquer le bandeau"
            className="p-1 rounded hover:bg-white/20 transition">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
