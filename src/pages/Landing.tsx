// Landing page CockPit F&A — qualité Liass'Pilot / Atlas Studio
// Animations scroll, gradient text, hover effects, sections enrichies, dark mode
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle, ArrowRight, Zap, BarChart3, Shield, Wallet, Brain,
  Building2, Lock, Play, Star, ChevronDown, TrendingUp, Award,
  Sparkles, Sun, Moon, FileSpreadsheet, Database, PieChart,
  Target, ClipboardList, Receipt, Layers, Globe, MousePointerClick,
  Search, FileText, Mail, Phone, ShieldCheck,
} from 'lucide-react';

type Mode = 'dark' | 'light';
const STORAGE_KEY = 'cockpit-landing-theme';
const ATLAS_STUDIO_URL = 'https://atlas-studio.org';

function loadTheme(): Mode {
  try { const v = localStorage.getItem(STORAGE_KEY); return v === 'light' ? 'light' : 'dark'; } catch { return 'dark'; }
}
function saveTheme(m: Mode) { try { localStorage.setItem(STORAGE_KEY, m); } catch { /* ignore */ } }

/* ═══ Hook scroll-triggered animations ═══ */
function useInView(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setInView(true); obs.disconnect(); } }, { threshold });
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, className: inView ? 'in-view' : '' };
}

/* ═══ Compteur animé ═══ */
function AnimatedNumber({ value, suffix = '' }: { value: string; suffix?: string }) {
  const [display, setDisplay] = useState('0');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        const num = parseInt(value.replace(/[^0-9]/g, ''));
        if (isNaN(num)) { setDisplay(value); return; }
        const duration = 1400;
        const start = Date.now();
        const tick = () => {
          const elapsed = Date.now() - start;
          const progress = Math.min(elapsed / duration, 1);
          const eased = 1 - Math.pow(1 - progress, 3);
          setDisplay(Math.floor(num * eased).toLocaleString('fr-FR'));
          if (progress < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        observer.disconnect();
      }
    }, { threshold: 0.3 });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [value]);
  return <div ref={ref} className="font-bold">{display}{suffix}</div>;
}

const formatXOF = (n: number) => n.toLocaleString('fr-FR');

const MODULES = [
  { icon: FileSpreadsheet, label: 'États financiers SYSCOHADA', desc: 'Bilan, CR, SIG, TFT, variation des capitaux propres — générés automatiquement depuis le Grand Livre.' },
  { icon: Wallet, label: 'Budget vs Réalisé', desc: 'Import budget multi-versions, écarts mensuels, comparaison N/N-1, alertes de dérive.' },
  { icon: BarChart3, label: '45+ dashboards', desc: 'Catalogue complet : exécutif, Pareto, BFR, Waterfall, cycles, masse salariale, sectoriels.' },
  { icon: Brain, label: <>IA <span style={{ fontWeight: 800 }}>Proph3t</span></>, desc: 'Auto-commentaires multi-paragraphes, prédictions, mémoire permanente, base SYSCOHADA 24 chunks.' },
  { icon: Search, label: 'Audit du Grand Livre', desc: '16 contrôles : équilibre balance, cohérence sens, doublons, outliers, mapping. Score qualité.' },
  { icon: PieChart, label: 'Analyse Pareto ABC', desc: 'Top 20 % comptes qui font 80 % du CA. Top 15 contributeurs avec classification A/B/C.' },
  { icon: Receipt, label: 'Compliance SYSCOHADA', desc: '10 contrôles automatiques de conformité comptable + recommandations d\'action priorisées.' },
  { icon: Target, label: 'Reporting personnalisable', desc: 'Éditeur drag & drop, 23 sections, 3 styles de couverture, export PDF WYSIWYG.' },
  { icon: ClipboardList, label: 'Plan d\'action & alertes', desc: 'Suivi des points d\'attention, actions correctives, responsables, échéances.' },
  { icon: Database, label: 'Imports & connecteurs API', desc: 'Import Excel/CSV ou connexion API directe : Sage, Cegid, Saari, Perfecto, Odoo, SAP, QuickBooks, Wave.' },
  { icon: Layers, label: 'Comptabilité analytique', desc: 'Multi-axes (centre de coût, projet). P&L par section, règles de mapping automatiques.' },
  { icon: Lock, label: 'Données 100 % locales', desc: 'IndexedDB navigateur, aucune donnée envoyée. Souveraineté totale, RGPD natif.' },
];

const STATS = [
  { value: '23', suffix: '', label: 'sections par rapport' },
  { value: '45', suffix: '+', label: 'dashboards prêts' },
  { value: '17', suffix: '', label: 'pays OHADA' },
  { value: '100', suffix: ' %', label: 'données locales' },
];

const STEPS = [
  { num: '01', title: 'Importez votre GL', desc: 'CSV, XLSX — détection automatique des colonnes et de la feuille pertinente.' },
  { num: '02', title: 'L\'app calcule tout', desc: 'Balance, bilan, CR, SIG, ratios — instantanément depuis le GL.' },
  { num: '03', title: 'Pilotez', desc: '45+ dashboards premium, alertes en temps réel, prédictions Proph3t.' },
  { num: '04', title: 'Générez le rapport', desc: 'Reporting personnalisable, PDF professionnel, journal des versions.' },
];

const TESTIMONIALS = [
  { name: 'Direction Financière', initials: 'DF', role: 'Contrôle de gestion mensuel', text: 'Le pilotage budgétaire est transformé : import du budget, comparaison N/N-1 automatique, identification immédiate des écarts à expliquer.' },
  { name: 'Expert-comptable', initials: 'EC', role: 'Cabinet OHADA', text: 'L\'audit automatique du Grand Livre détecte en quelques secondes ce qui me prendrait une journée. La conformité SYSCOHADA est native.' },
  { name: 'Direction Générale', initials: 'DG', role: 'PME industrielle', text: 'Les 45 dashboards et le commentateur IA Proph3t produisent un rapport mensuel professionnel sans effort. Gain de temps majeur.' },
];

const FAQ = [
  { q: 'CockPit F&A est-il vraiment conforme au SYSCOHADA révisé 2017 ?', a: 'Oui à 100 %. Plan comptable OHADA intégré, états financiers conformes (Bilan, CR par nature, TFT, variation CP), 10 contrôles automatiques de conformité, base de connaissance Proph3t avec 24 chunks référencés AUDCIF.' },
  { q: 'Mes données sortent-elles de mon ordinateur ?', a: 'Non, jamais. Toutes les données restent dans IndexedDB de votre navigateur. Aucune connexion internet requise. Souveraineté totale.' },
  { q: 'Quels logiciels comptables puis-je connecter ?', a: 'Deux modes : (1) Import par fichier CSV/Excel/TXT depuis n\'importe quel logiciel — détection auto des colonnes. (2) Connexion API directe en temps réel pour Sage 100c/X3, Cegid Quadra, Odoo, SAP B1, QuickBooks, Wave. Pour les autres logiciels (SAARI, Perfecto, Sage Coala...), import par fichier suffit. Connecteur sur-mesure possible sur demande.' },
  { q: 'Combien de temps pour produire un rapport mensuel complet ?', a: 'Moins de 5 minutes : importer le GL → cliquer "Auto-commenter avec Proph3t" → "Télécharger PDF". 23 sections incluses (synthèse, P&L, bilan, budget, cycles, trésorerie, RH, ratios, compliance, signatures).' },
  { q: 'Puis-je personnaliser mes rapports ?', a: 'Oui : éditeur drag & drop par blocs, 3 styles de couverture, choix des sections, palette de couleurs, image de fond, logo, signatures. Sauvegarde de modèles réutilisables.' },
  { q: 'Quels modes de paiement acceptez-vous ?', a: 'Sur Atlas Studio : Mobile Money (Orange Money, MTN MoMo, Wave), virement bancaire, carte bancaire (Visa, Mastercard). Facturation en FCFA ou EUR.' },
];

const PRICING_FEATURES = [
  'Import fichier illimité (CSV, XLSX, TXT)',
  'Connecteurs API (Sage, Cegid, Odoo, SAP, QuickBooks…)',
  '23 sections de rapport personnalisable',
  '45+ dashboards prêts à l\'emploi',
  'Audit du Grand Livre (16 contrôles)',
  'Proph3t IA (commentaires + prédictions)',
  'Compliance SYSCOHADA (10 contrôles)',
  'États financiers conformes (Bilan, CR, TFT, SIG)',
  'Comptabilité analytique multi-axes',
  'Mises à jour à vie',
];

function styles(mode: Mode) {
  const d = mode === 'dark';
  const txt = d ? '#ffffff' : '#1a1a1a';
  const sec = d ? 'rgba(255,255,255,0.65)' : '#4a4a4a';
  const ter = d ? 'rgba(255,255,255,0.45)' : '#777777';
  const muted = d ? 'rgba(255,255,255,0.25)' : '#aaaaaa';
  const inv = d ? '#1F1F23' : '#ffffff';
  const accent = d ? '#D4B870' : '#B8954A';
  const accent2 = d ? '#E8D5A0' : '#9C7D3E';
  const chk = d ? '#34d399' : '#16a34a';
  return {
    bg: d ? 'bg-[#1F1F23]' : 'bg-white',
    bgAlt: d ? 'bg-[#16161A]' : 'bg-[#f8f7f4]',
    accentBg: d ? 'bg-[#D4B870]' : 'bg-[#B8954A]',
    accentBgLight: d ? 'bg-[#D4B870]/10' : 'bg-[#B8954A]/8',
    accentBorder: d ? 'border-[#D4B870]/20' : 'border-[#B8954A]/20',
    accentBorderSolid: d ? 'border-[#D4B870]' : 'border-[#B8954A]',
    border: d ? 'border-white/[0.08]' : 'border-[#e8e5de]',
    btnPrimary: d ? 'bg-[#D4B870] hover:bg-[#E8D5A0]' : 'bg-[#B8954A] hover:bg-[#9C7D3E]',
    btnSecondary: d ? 'bg-white/5 border-white/10 hover:bg-white/10' : 'bg-white border-[#e8e5de] hover:bg-gray-50',
    card: d ? 'bg-white/[0.03] border-white/[0.08]' : 'bg-white border-[#e8e5de] shadow-sm',
    cardHover: d ? 'hover:bg-white/[0.06] hover:border-white/[0.16]' : 'hover:border-[#d4d0c8] hover:shadow-md',
    navBg: d ? 'bg-[#1F1F23]/90' : 'bg-white/92',
    s: { color: txt } as React.CSSProperties,
    sSec: { color: sec } as React.CSSProperties,
    sTer: { color: ter } as React.CSSProperties,
    sMuted: { color: muted } as React.CSSProperties,
    sInv: { color: inv } as React.CSSProperties,
    sAccent: { color: accent } as React.CSSProperties,
    sChk: { color: chk } as React.CSSProperties,
    sBtnP: { color: '#ffffff' } as React.CSSProperties,
    txt, sec, ter, muted, inv, accent, accent2, chk,
  };
}

export default function Landing() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>(loadTheme);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const c = styles(mode);

  const toggleMode = () => { const n = mode === 'dark' ? 'light' : 'dark'; setMode(n); saveTheme(n); };
  // "Voir la démo" → ouvre l'app en mode démo (porte d'entrée applicative)
  const goToDemo = () => navigate('/demo');
  // Souscription → Atlas Studio externe
  const goSubscribe = () => window.open(ATLAS_STUDIO_URL, '_blank', 'noopener,noreferrer');
  // Compat (ancien nom utilisé dans certains boutons internes)
  const enterApp = goToDemo;
  void enterApp;

  const stats = useInView();
  const modules = useInView();
  const steps = useInView();
  const demoCta = useInView();
  const testimonials = useInView();
  const plans = useInView();
  const faq = useInView();

  return (
    <div className={`landing-page min-h-screen ${c.bg} transition-colors duration-300`} style={c.s}>
      {/* ════════ NAV ════════ */}
      <nav className={`sticky top-0 ${c.navBg} backdrop-blur-xl border-b ${c.border} z-50 transition-colors duration-300`}>
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="font-display text-2xl font-bold tracking-tight" style={c.s}>
              CockPit <span style={c.sAccent}>F&A</span>
            </div>
            <span style={c.sMuted}>·</span>
            <span className="text-xs uppercase tracking-widest" style={c.sTer}>SYSCOHADA 2017</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm" style={c.sTer}>
            <a href="#modules" className="hover:opacity-80 transition" style={c.sTer}>Fonctionnalités</a>
            <a href="#demo" className="hover:opacity-80 transition" style={c.sTer}>Démo</a>
            <a href="#tarifs" className="hover:opacity-80 transition" style={c.sTer}>Tarifs</a>
            <a href="#faq" className="hover:opacity-80 transition" style={c.sTer}>FAQ</a>
            <a href={ATLAS_STUDIO_URL} target="_blank" rel="noopener noreferrer" className="hover:opacity-80 transition" style={c.sTer}>Atlas Studio</a>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={toggleMode} className={`p-2 rounded-lg ${mode === 'dark' ? 'hover:bg-white/10' : 'hover:bg-gray-100'} transition-colors`} style={c.sTer} title={mode === 'dark' ? 'Mode jour' : 'Mode nuit'}>
              {mode === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button onClick={() => navigate('/login')} className={`px-4 py-2 text-sm font-semibold transition-all flex items-center gap-2 hover:opacity-80`} style={c.sTer}>
              Se connecter
            </button>
            <button onClick={goToDemo} className={`px-4 py-2 ${c.btnSecondary} border rounded-lg text-sm font-semibold transition-all flex items-center gap-2`} style={c.sSec}>
              <Play className="w-3.5 h-3.5" /> Démo
            </button>
            <button onClick={goSubscribe} className={`px-5 py-2.5 ${c.btnPrimary} rounded-lg text-sm font-bold transition-all flex items-center gap-2`} style={c.sBtnP}>
              Souscrire <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </nav>

      {/* ════════ HERO ════════ */}
      <section className="relative pt-24 pb-20 px-6 overflow-hidden">
        {mode === 'dark' && (
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[600px] bg-[#D4B870]/[0.07] rounded-full blur-[120px] anim-glow" />
            <div className="absolute inset-0 opacity-[0.025]" style={{ backgroundImage: 'linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)', backgroundSize: '60px 60px' }} />
          </div>
        )}
        {mode === 'light' && (
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[600px] bg-[#B8954A]/[0.05] rounded-full blur-[120px] anim-glow" />
          </div>
        )}

        <div className="max-w-5xl mx-auto text-center relative">
          <div className={`anim-hero inline-flex items-center gap-2 px-4 py-2 ${c.accentBgLight} border ${c.accentBorder} rounded-full text-xs font-semibold mb-8`} style={c.sAccent}>
            <Sparkles className="w-3.5 h-3.5" /> 100 % conforme SYSCOHADA révisé 2017
          </div>

          <h1 className="anim-hero-delay-1 text-5xl md:text-7xl font-medium leading-[1.05] mb-6 tracking-tight" style={c.s}>
            Votre cockpit financier,
            <br />
            <span className="bg-clip-text text-transparent bg-gradient-to-r" style={{
              backgroundImage: `linear-gradient(90deg, ${c.accent}, ${c.accent2}, ${c.accent})`,
              WebkitBackgroundClip: 'text',
              color: 'transparent',
            }}>
              du Grand Livre au rapport en 5 min.
            </span>
          </h1>

          <p className="anim-hero-delay-2 text-lg md:text-xl max-w-3xl mx-auto mb-10 leading-relaxed font-light" style={c.sSec}>
            Importez votre Grand Livre <strong style={c.s}>par fichier ou via API</strong> (Sage, Cegid, Odoo, SAP, QuickBooks…),
            obtenez instantanément les états financiers SYSCOHADA, 45+ dashboards de pilotage,
            et générez un rapport professionnel commenté par IA. <strong style={c.s}>Données 100 % locales</strong>.
          </p>

          <div className="anim-hero-delay-3 flex items-center justify-center gap-4 flex-wrap mb-6">
            <button onClick={goSubscribe} className={`group px-8 py-4 ${c.btnPrimary} rounded-xl text-sm font-bold transition-all shadow-lg hover:-translate-y-0.5 flex items-center gap-2`} style={c.sBtnP}>
              <Zap className="w-4 h-4" /> Souscrire maintenant
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </button>
            <button onClick={goToDemo} className={`px-8 py-4 ${c.btnSecondary} border rounded-xl text-sm font-semibold transition-all flex items-center gap-2`} style={c.sSec}>
              <Play className="w-4 h-4" style={c.sAccent} /> Voir la démo
            </button>
          </div>

          <p className="anim-hero-delay-3 text-xs mb-14" style={c.sTer}>
            Démo libre · Souscription sur{' '}
            <a href={ATLAS_STUDIO_URL} target="_blank" rel="noopener noreferrer" className="underline hover:opacity-80" style={c.sAccent}>
              Atlas Studio
            </a>{' '}· Mobile Money / Carte bancaire
          </p>

          {/* Avatars + social proof */}
          <div className="anim-hero-delay-3 flex items-center justify-center gap-3 text-sm" style={c.sTer}>
            <div className="flex -space-x-2">
              {['DF', 'EC', 'DG', 'CG'].map((init, i) => (
                <div key={i} className={`w-9 h-9 rounded-full ${c.accentBg} border-2 ${mode === 'dark' ? 'border-[#1F1F23]' : 'border-white'} flex items-center justify-center text-xs font-bold`} style={c.sBtnP}>
                  {init}
                </div>
              ))}
            </div>
            <span>Conçu pour les <strong style={c.s}>professionnels OHADA</strong> exigeants</span>
          </div>
        </div>
      </section>

      {/* ════════ STATS ════════ */}
      <section className={`py-12 px-6 border-y ${c.border} ${c.bgAlt} transition-colors duration-300`}>
        <div ref={stats.ref} className={`max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 anim-stagger ${stats.className}`}>
          {STATS.map((s, i) => (
            <div key={i} className="text-center">
              <div className="text-4xl md:text-5xl font-light" style={c.s}>
                <AnimatedNumber value={s.value} suffix={s.suffix} />
              </div>
              <p className="text-xs mt-2 uppercase tracking-wider font-medium" style={c.sTer}>{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ════════ MODULES ════════ */}
      <section id="modules" className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <div className={`inline-flex items-center gap-2 px-3 py-1.5 ${c.accentBgLight} border ${c.accentBorder} rounded-full text-xs font-semibold mb-5`} style={c.sAccent}>
              <Layers className="w-3.5 h-3.5" /> 12 modules intégrés
            </div>
            <h2 className="text-3xl md:text-5xl font-medium mb-4" style={c.s}>Tout ce dont vous avez besoin.</h2>
            <p className="max-w-xl mx-auto text-lg" style={c.sSec}>Une suite complète pour le pilotage financier OHADA, prête à l'emploi.</p>
          </div>

          <div ref={modules.ref} className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 anim-stagger ${modules.className}`}>
            {MODULES.map((m, i) => (
              <div key={i} className={`group ${c.card} border rounded-2xl p-6 ${c.cardHover} transition-all duration-300 hover:-translate-y-1`}>
                <div className={`w-12 h-12 ${c.accentBgLight} rounded-xl flex items-center justify-center mb-4`}>
                  <m.icon className="w-6 h-6" style={c.sAccent} />
                </div>
                <h3 className="text-sm font-bold mb-2" style={c.s}>{m.label}</h3>
                <p className="text-xs leading-relaxed" style={c.sTer}>{m.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════ STEPS ════════ */}
      <section className={`py-24 px-6 ${c.bgAlt} transition-colors duration-300`}>
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <div className={`inline-flex items-center gap-2 px-3 py-1.5 ${c.accentBgLight} border ${c.accentBorder} rounded-full text-xs font-semibold mb-5`} style={c.sAccent}>
              <TrendingUp className="w-3.5 h-3.5" /> Démarrage rapide
            </div>
            <h2 className="text-3xl md:text-5xl font-medium mb-4" style={c.s}>Opérationnel en 5 minutes</h2>
            <p className="text-lg" style={c.sSec}>De votre Grand Livre au rapport professionnel.</p>
          </div>

          <div ref={steps.ref} className={`grid grid-cols-1 md:grid-cols-4 gap-6 anim-stagger ${steps.className}`}>
            {STEPS.map((step, i) => (
              <div key={i} className="text-center">
                <div className={`w-16 h-16 ${c.accentBgLight} border ${c.accentBorder} rounded-2xl flex items-center justify-center mx-auto mb-5`}>
                  <span className="text-lg font-bold" style={c.sAccent}>{step.num}</span>
                </div>
                <h3 className="text-sm font-bold mb-2" style={c.s}>{step.title}</h3>
                <p className="text-xs leading-relaxed" style={c.sTer}>{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════ DEMO CTA ════════ */}
      <section id="demo" className="py-16 px-6">
        <div className="max-w-5xl mx-auto">
          <div ref={demoCta.ref} className={`anim-scale ${demoCta.className} relative ${mode === 'dark' ? 'bg-gradient-to-br from-white/[0.04] to-white/[0.02] border-white/[0.08]' : 'bg-gradient-to-br from-[#f8f7f4] to-[#f0ede6] border-[#e8e5de]'} border rounded-3xl p-10 md:p-14 overflow-hidden`}>
            <div className="relative flex flex-col md:flex-row items-center gap-10">
              <div className="flex-1">
                <div className={`inline-flex items-center gap-2 px-3 py-1 ${c.accentBgLight} border ${c.accentBorder} rounded-full text-xs font-semibold mb-4`} style={c.sAccent}>
                  <MousePointerClick className="w-3.5 h-3.5" /> Aucune installation requise
                </div>
                <h2 className="text-3xl md:text-4xl font-medium mb-3" style={c.s}>Essayez immédiatement</h2>
                <p className="mb-6 leading-relaxed" style={c.sSec}>
                  L'application fonctionne directement dans votre navigateur. Données stockées localement, jamais envoyées en ligne.
                </p>
                <button onClick={goToDemo} className={`group px-8 py-4 ${c.btnPrimary} rounded-xl text-sm font-bold transition-all shadow-lg inline-flex items-center gap-2`} style={c.sBtnP}>
                  <Play className="w-4 h-4" /> Lancer la démo
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </button>
              </div>

              <div className="flex-shrink-0 grid grid-cols-1 gap-3 w-full md:w-72">
                {[
                  { icon: FileSpreadsheet, title: 'Import du Grand Livre', tag: 'CSV / XLSX' },
                  { icon: BarChart3, title: 'Bilan SYSCOHADA', tag: 'Drill-down' },
                  { icon: Brain, title: 'Auto-commentaire IA', tag: 'Proph3t' },
                  { icon: FileText, title: 'Rapport PDF', tag: 'WYSIWYG' },
                ].map((demo, i) => (
                  <button key={i} onClick={enterApp} className={`group/card flex items-center gap-3 p-3.5 ${c.card} border rounded-xl ${c.cardHover} transition-all text-left`}>
                    <div className={`w-10 h-10 ${c.accentBgLight} rounded-lg flex items-center justify-center shrink-0`}>
                      <demo.icon className="w-5 h-5" style={c.sAccent} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate" style={c.s}>{demo.title}</p>
                      <p className="text-[10px]" style={c.sTer}>{demo.tag}</p>
                    </div>
                    <ArrowRight className="w-4 h-4 opacity-0 group-hover/card:opacity-100 transition-opacity" style={c.sAccent} />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ════════ INTÉGRATIONS API ════════ */}
      <section className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <div className={`inline-flex items-center gap-2 px-3 py-1.5 ${c.accentBgLight} border ${c.accentBorder} rounded-full text-xs font-semibold mb-5`} style={c.sAccent}>
              <Database className="w-3.5 h-3.5" /> Intégrations
            </div>
            <h2 className="text-3xl md:text-5xl font-medium mb-4" style={c.s}>Connecté à votre stack comptable</h2>
            <p className="text-base md:text-lg max-w-2xl mx-auto" style={c.sSec}>
              Import par fichier (CSV / XLSX / TXT) <strong style={c.s}>OU</strong> connexion API directe en temps réel.
              Aucune ressaisie, aucune perte de données.
            </p>
          </div>

          {/* Grid logiciels supportés */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 mb-12">
            {[
              { name: 'Sage 100c / X3', mode: 'API + Fichier', region: 'OHADA · FR' },
              { name: 'Sage Coala', mode: 'Fichier', region: 'OHADA' },
              { name: 'Cegid Quadra', mode: 'API + Fichier', region: 'OHADA · FR' },
              { name: 'SAARI', mode: 'Fichier', region: 'OHADA' },
              { name: 'Perfecto', mode: 'Fichier', region: 'OHADA' },
              { name: 'Odoo', mode: 'API REST', region: 'International' },
              { name: 'SAP B1', mode: 'API', region: 'International' },
              { name: 'QuickBooks', mode: 'API OAuth2', region: 'International' },
              { name: 'Wave', mode: 'API', region: 'International' },
              { name: 'CSV / XLSX universel', mode: 'Fichier', region: 'Tout système' },
            ].map((s, i) => (
              <div key={i} className={`${c.card} border rounded-xl p-4 ${c.cardHover} transition-all`}>
                <p className="font-bold text-sm mb-1" style={c.s}>{s.name}</p>
                <p className="text-[10px] uppercase tracking-wider mb-1" style={c.sAccent}>{s.mode}</p>
                <p className="text-[10px]" style={c.sTer}>{s.region}</p>
              </div>
            ))}
          </div>

          {/* Bandeau bénéfices */}
          <div className={`grid grid-cols-1 md:grid-cols-3 gap-4`}>
            <div className={`${c.card} border rounded-2xl p-5`}>
              <div className={`w-10 h-10 ${c.accentBgLight} rounded-lg flex items-center justify-center mb-3`}>
                <Zap className="w-5 h-5" style={c.sAccent} />
              </div>
              <p className="font-bold text-sm mb-1" style={c.s}>Synchronisation temps réel</p>
              <p className="text-xs" style={c.sSec}>Connexion API directe à votre logiciel source : pas de ressaisie, pas de double comptabilité.</p>
            </div>
            <div className={`${c.card} border rounded-2xl p-5`}>
              <div className={`w-10 h-10 ${c.accentBgLight} rounded-lg flex items-center justify-center mb-3`}>
                <Shield className="w-5 h-5" style={c.sAccent} />
              </div>
              <p className="font-bold text-sm mb-1" style={c.s}>Détection auto des colonnes</p>
              <p className="text-xs" style={c.sSec}>Le parser identifie les colonnes Date, Compte, Débit, Crédit même avec des en-têtes non standards.</p>
            </div>
            <div className={`${c.card} border rounded-2xl p-5`}>
              <div className={`w-10 h-10 ${c.accentBgLight} rounded-lg flex items-center justify-center mb-3`}>
                <Layers className="w-5 h-5" style={c.sAccent} />
              </div>
              <p className="font-bold text-sm mb-1" style={c.s}>Mapping SYSCOHADA auto</p>
              <p className="text-xs" style={c.sSec}>Conversion automatique des plans comptables propriétaires vers SYSCOHADA révisé 2017.</p>
            </div>
          </div>

          <p className="text-center text-xs mt-8" style={c.sTer}>
            Votre logiciel n'est pas listé ?{' '}
            <a href={ATLAS_STUDIO_URL} target="_blank" rel="noopener noreferrer" className="underline hover:opacity-80" style={c.sAccent}>
              Demandez un connecteur sur-mesure →
            </a>
          </p>
        </div>
      </section>

      {/* ════════ TESTIMONIALS ════════ */}
      <section className={`py-24 px-6 ${c.bgAlt} transition-colors duration-300`}>
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <div className={`inline-flex items-center gap-2 px-3 py-1.5 ${c.accentBgLight} border ${c.accentBorder} rounded-full text-xs font-semibold mb-5`} style={c.sAccent}>
              <Star className="w-3.5 h-3.5" /> Conçu pour les pros OHADA
            </div>
            <h2 className="text-3xl md:text-5xl font-medium mb-4" style={c.s}>Pour qui est CockPit F&A ?</h2>
          </div>
          <div ref={testimonials.ref} className={`grid grid-cols-1 md:grid-cols-3 gap-6 anim-stagger ${testimonials.className}`}>
            {TESTIMONIALS.map((tt, i) => (
              <div key={i} className={`${c.card} border rounded-2xl p-7 ${c.cardHover} transition-all`}>
                <div className="flex gap-0.5 mb-5">
                  {[...Array(5)].map((_, j) => <Star key={j} className="w-4 h-4" style={{ color: c.accent, fill: c.accent }} />)}
                </div>
                <p className="text-sm leading-relaxed mb-6 italic" style={c.sSec}>« {tt.text} »</p>
                <div className={`flex items-center gap-3 pt-5 border-t ${c.border}`}>
                  <div className={`w-10 h-10 rounded-full ${c.accentBg} flex items-center justify-center text-xs font-bold`} style={c.sBtnP}>{tt.initials}</div>
                  <div>
                    <p className="text-sm font-bold" style={c.s}>{tt.name}</p>
                    <p className="text-xs" style={c.sTer}>{tt.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════ TARIFS — 2 OFFRES ════════ */}
      <section id="tarifs" className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <div className={`inline-flex items-center gap-2 px-3 py-1.5 ${c.accentBgLight} border ${c.accentBorder} rounded-full text-xs font-semibold mb-5`} style={c.sAccent}>
              <Award className="w-3.5 h-3.5" /> Tarification transparente
            </div>
            <h2 className="text-3xl md:text-5xl font-medium mb-4" style={c.s}>Deux offres. Tout inclus.</h2>
            <p className="text-lg" style={c.sSec}>Pas de versions limitées, pas de modules cachés. Toutes les fonctionnalités, tout de suite.</p>
          </div>

          <div ref={plans.ref} className={`anim-scale ${plans.className} grid grid-cols-1 lg:grid-cols-2 gap-6`}>
            {/* ─── Offre Mono-société ─── */}
            <div className={`relative ${c.card} border rounded-3xl p-8 md:p-10 overflow-hidden flex flex-col`}>
              <div className="mb-6">
                <p className="text-xs uppercase tracking-widest font-semibold mb-2" style={c.sAccent}>Mono-société</p>
                <h3 className="text-2xl font-medium mb-2" style={c.s}>Cockpit Solo</h3>
                <p className="text-sm" style={c.sTer}>Pour une PME / TPE qui pilote une seule entité juridique.</p>
              </div>

              <div className="mb-6">
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-5xl md:text-6xl font-light" style={c.s}>{formatXOF(49000)}</span>
                  <span className="text-base font-semibold" style={c.sSec}>FCFA / mois</span>
                </div>
                <p className="text-xs mb-1" style={c.sTer}>HT · facturation mensuelle ou annuelle</p>
                <p className="text-xs" style={c.sAccent}>≈ 75 € / mois — engagement annuel : <strong>2 mois offerts</strong></p>
              </div>

              <ul className="space-y-2 mb-6 flex-1">
                <li className="flex items-start gap-2 text-sm" style={c.s}>
                  <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" style={c.sChk} />
                  <span><strong>1 société</strong> active</span>
                </li>
                <li className="flex items-start gap-2 text-sm" style={c.s}>
                  <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" style={c.sChk} />
                  <span>Utilisateurs illimités</span>
                </li>
                <li className="flex items-start gap-2 text-sm" style={c.s}>
                  <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" style={c.sChk} />
                  <span>Toutes les fonctionnalités (états, dashboards, IA, reports…)</span>
                </li>
                <li className="flex items-start gap-2 text-sm" style={c.s}>
                  <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" style={c.sChk} />
                  <span>Support email standard</span>
                </li>
              </ul>

              <div className="flex flex-col gap-2">
                <a href={ATLAS_STUDIO_URL} target="_blank" rel="noopener noreferrer" className={`px-5 py-3 ${c.btnSecondary} border rounded-xl text-sm font-semibold transition flex items-center justify-center gap-2`} style={c.sSec}>
                  <Zap className="w-4 h-4" /> Souscrire Solo
                </a>
                <button onClick={goToDemo} className="text-xs font-medium hover:opacity-80 transition flex items-center justify-center gap-1.5 py-1" style={c.sAccent}>
                  <Play className="w-3 h-3" /> Voir la démo
                </button>
              </div>
            </div>

            {/* ─── Offre Multi-société (mise en avant) ─── */}
            <div className={`relative ${c.card} border-2 rounded-3xl p-8 md:p-10 overflow-hidden flex flex-col`} style={{ borderColor: c.accent }}>
              {/* Glow décoratif */}
              <div className="absolute -top-20 -right-20 w-60 h-60 rounded-full opacity-20 blur-3xl" style={{ background: c.accent }} />

              <div className={`absolute top-6 right-6 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${c.accentBg}`} style={c.sBtnP}>
                ★ Recommandé
              </div>

              <div className="mb-6 relative">
                <p className="text-xs uppercase tracking-widest font-semibold mb-2" style={c.sAccent}>Multi-société</p>
                <h3 className="text-2xl font-medium mb-2" style={c.s}>Cockpit Group</h3>
                <p className="text-sm" style={c.sTer}>Pour les groupes, holdings et cabinets d'expertise comptable.</p>
              </div>

              <div className="mb-6 relative">
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-5xl md:text-6xl font-light" style={c.s}>{formatXOF(100000)}</span>
                  <span className="text-base font-semibold" style={c.sSec}>FCFA / mois</span>
                </div>
                <p className="text-xs mb-1" style={c.sTer}>HT · facturation mensuelle ou annuelle</p>
                <p className="text-xs" style={c.sAccent}>≈ 153 € / mois — engagement annuel : <strong>2 mois offerts</strong></p>
              </div>

              <ul className="space-y-2 mb-6 flex-1 relative">
                <li className="flex items-start gap-2 text-sm" style={c.s}>
                  <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" style={c.sChk} />
                  <span><strong>Sociétés illimitées</strong> + consolidation</span>
                </li>
                <li className="flex items-start gap-2 text-sm" style={c.s}>
                  <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" style={c.sChk} />
                  <span>Utilisateurs illimités · multi-rôles</span>
                </li>
                <li className="flex items-start gap-2 text-sm" style={c.s}>
                  <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" style={c.sChk} />
                  <span>Toutes les fonctionnalités Solo</span>
                </li>
                <li className="flex items-start gap-2 text-sm" style={c.s}>
                  <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" style={c.sChk} />
                  <span>Vue groupe · benchmarks inter-sociétés</span>
                </li>
                <li className="flex items-start gap-2 text-sm" style={c.s}>
                  <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" style={c.sChk} />
                  <span>Support prioritaire (réponse &lt; 24 h)</span>
                </li>
              </ul>

              <div className="flex flex-col gap-2 relative">
                <a href={ATLAS_STUDIO_URL} target="_blank" rel="noopener noreferrer" className={`px-5 py-3 ${c.btnPrimary} rounded-xl text-sm font-bold shadow-lg hover:-translate-y-0.5 transition flex items-center justify-center gap-2`} style={c.sBtnP}>
                  <Zap className="w-4 h-4" /> Souscrire Group
                </a>
                <button onClick={goToDemo} className="text-xs font-medium hover:opacity-80 transition flex items-center justify-center gap-1.5 py-1" style={c.sAccent}>
                  <Play className="w-3 h-3" /> Voir la démo
                </button>
              </div>
            </div>
          </div>

          {/* ─── Inclus dans les deux offres ─── */}
          <div className={`mt-8 ${c.card} border rounded-2xl p-6 md:p-8`}>
            <p className="text-sm uppercase tracking-widest font-semibold mb-4" style={c.sAccent}>Inclus dans toutes les offres</p>
            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2.5">
              {PRICING_FEATURES.map((f, i) => (
                <li key={i} className="flex items-start gap-2 text-sm" style={c.s}>
                  <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" style={c.sChk} />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <div className="mt-5 flex items-center gap-3 text-xs flex-wrap" style={c.sTer}>
              <span className="flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5" style={c.sAccent} /> Sans engagement</span>
              <span className="flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5" style={c.sAccent} /> Mobile Money / CB / Virement</span>
              <span className="flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5" style={c.sAccent} /> Données hébergées en zone OHADA</span>
            </div>
          </div>

          <div className="mt-8 text-center">
            <p className="text-sm mb-2" style={c.sSec}>Besoin d'un tarif sur-mesure (cabinet 50+ sociétés, on-premise, marque blanche) ?</p>
            <a href={ATLAS_STUDIO_URL} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold underline hover:opacity-80" style={c.sAccent}>
              Nous contacter sur Atlas Studio →
            </a>
          </div>
        </div>
      </section>

      {/* ════════ FAQ ════════ */}
      <section id="faq" className={`py-24 px-6 ${c.bgAlt} transition-colors duration-300`}>
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-14">
            <div className={`inline-flex items-center gap-2 px-3 py-1.5 ${c.accentBgLight} border ${c.accentBorder} rounded-full text-xs font-semibold mb-5`} style={c.sAccent}>
              <ChevronDown className="w-3.5 h-3.5" /> FAQ
            </div>
            <h2 className="text-3xl md:text-5xl font-medium mb-4" style={c.s}>Questions fréquentes</h2>
            <p className="text-lg" style={c.sSec}>Tout ce que vous devez savoir.</p>
          </div>
          <div ref={faq.ref} className={`space-y-3 anim-stagger ${faq.className}`}>
            {FAQ.map((item, i) => (
              <div key={i} className={`${c.card} border rounded-xl overflow-hidden ${c.cardHover} transition-colors`}>
                <button onClick={() => setOpenFaq(openFaq === i ? null : i)} className="w-full flex items-center justify-between p-5 text-left">
                  <span className="text-sm font-semibold pr-4" style={c.s}>{item.q}</span>
                  <ChevronDown className={`w-5 h-5 shrink-0 transition-transform duration-200 ${openFaq === i ? 'rotate-180' : ''}`} style={openFaq === i ? c.sAccent : c.sTer} />
                </button>
                <div className={`overflow-hidden transition-all duration-300 ${openFaq === i ? 'max-h-60' : 'max-h-0'}`}>
                  <div className="px-5 pb-5">
                    <p className="text-sm leading-relaxed" style={c.sSec}>{item.a}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════ FINAL CTA — DARK ════════ */}
      <section className="py-24 px-6 bg-[#1F1F23] relative overflow-hidden" style={{ color: '#ffffff' }}>
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[500px] bg-[#D4B870]/[0.10] rounded-full blur-[120px]" />
        </div>
        <div className="max-w-3xl mx-auto text-center relative">
          <h2 className="text-4xl md:text-6xl font-medium mb-5" style={{ color: '#ffffff' }}>
            Prêt à transformer
            <br />
            <span className="bg-gradient-to-r from-[#E8D5A0] via-[#D4B870] to-[#E8D5A0] bg-clip-text text-transparent" style={{ color: 'transparent' }}>
              votre pilotage financier ?
            </span>
          </h2>
          <p className="text-lg max-w-lg mx-auto mb-10" style={{ color: 'rgba(255,255,255,0.55)' }}>
            Démarrez en quelques secondes. Aucune installation, aucune donnée envoyée sur internet.
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <a href={ATLAS_STUDIO_URL} target="_blank" rel="noopener noreferrer" className="px-8 py-4 bg-[#D4B870] hover:bg-[#E8D5A0] text-[#1F1F23] rounded-xl text-base font-bold shadow-xl hover:-translate-y-0.5 transition inline-flex items-center gap-2">
              <Zap className="w-5 h-5" /> Souscrire maintenant
              <ArrowRight className="w-5 h-5" />
            </a>
            <button onClick={goToDemo} className="px-8 py-4 bg-white/5 border border-white/10 hover:bg-white/10 text-white rounded-xl text-base font-semibold transition inline-flex items-center gap-2">
              <Play className="w-5 h-5" /> Voir la démo
            </button>
          </div>
        </div>
      </section>

      {/* ════════ FOOTER ════════ */}
      <footer className={`py-12 px-6 border-t ${c.border} ${c.bgAlt}`}>
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
            <div className="md:col-span-2">
              <div className="flex items-center gap-3 mb-4">
                <div className="font-display text-2xl font-bold" style={c.s}>CockPit <span style={c.sAccent}>F&A</span></div>
              </div>
              <p className="text-sm mb-4 max-w-md" style={c.sSec}>
                Le cockpit financier conçu pour les 17 pays de l'espace OHADA.
                Conformité SYSCOHADA révisé 2017, données 100 % locales.
              </p>
              <div className="flex items-center gap-4 text-xs" style={c.sTer}>
                <span className="flex items-center gap-1.5"><Globe className="w-3.5 h-3.5" style={c.sAccent} /> 17 pays OHADA</span>
                <span className="flex items-center gap-1.5"><Shield className="w-3.5 h-3.5" style={c.sAccent} /> Données locales</span>
                <span className="flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5" style={c.sAccent} /> SYSCOHADA</span>
              </div>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider font-semibold mb-3" style={c.sAccent}>Produit</p>
              <ul className="space-y-2 text-sm" style={c.sSec}>
                <li><a href="#modules" className="hover:opacity-80">Fonctionnalités</a></li>
                <li><a href="#demo" className="hover:opacity-80">Démo</a></li>
                <li><a href="#tarifs" className="hover:opacity-80">Tarifs</a></li>
                <li><a href="#faq" className="hover:opacity-80">FAQ</a></li>
              </ul>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider font-semibold mb-3" style={c.sAccent}>Compte</p>
              <ul className="space-y-2 text-sm" style={c.sSec}>
                <li><a href={ATLAS_STUDIO_URL} target="_blank" rel="noopener noreferrer" className="hover:opacity-80">Atlas Studio</a></li>
                <li><a href={ATLAS_STUDIO_URL + '/login'} target="_blank" rel="noopener noreferrer" className="hover:opacity-80">Connexion</a></li>
                <li><a href={ATLAS_STUDIO_URL + '/pricing'} target="_blank" rel="noopener noreferrer" className="hover:opacity-80">Souscription</a></li>
                <li className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> support@atlas-studio.org</li>
                <li className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" /> +225 XX XX XX XX XX</li>
              </ul>
            </div>
          </div>
          <div className={`pt-6 border-t ${c.border} flex flex-col md:flex-row items-center justify-between gap-3 text-xs`} style={c.sTer}>
            <div>© {new Date().getFullYear()} CockPit F&A — Une solution Atlas Studio</div>
            <div className="flex items-center gap-4">
              <a href="#" className="hover:opacity-80">Mentions légales</a>
              <a href="#" className="hover:opacity-80">Confidentialité</a>
              <a href="#" className="hover:opacity-80">CGU</a>
              {/* Accès direct à l'application — temporaire le temps de finaliser la migration Supabase */}
              <button onClick={() => {
                  try { localStorage.setItem('app-bypass', '1'); } catch { /* noop */ }
                  navigate('/home');
                }}
                title="Accès direct à l'application (temporaire)"
                aria-label="Accès direct à l'application"
                className="inline-flex items-center justify-center w-7 h-7 rounded-md transition hover:scale-110"
                style={{ color: c.accent }}>
                <ShieldCheck className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
