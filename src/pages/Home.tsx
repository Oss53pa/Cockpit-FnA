import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle, Bot, ExternalLink, LayoutDashboard, FileSpreadsheet, FileText,
  Upload, Wallet, LogIn, ArrowUpRight, ArrowDownRight, Calendar, Building2, Sparkles, Target,
} from 'lucide-react';
import { useBalance, useCurrentOrg, useRatios, useStatements, useMonthlyCA } from '../hooks/useFinancials';
import { useApp } from '../store/app';
import { fmtMoney, fmtPct } from '../lib/format';

/**
 * Home — page d'accueil après connexion. Design éditorial ultra-premium.
 *
 * Pattern : header status compact en haut · 4 métriques hero éditoriales au
 * centre · 6 quick-links en cartes en bas · footer minimal.
 */
export default function Home() {
  const { sig, bilan } = useStatements();
  const ratios = useRatios();
  const balance = useBalance();
  const monthly = useMonthlyCA();
  const org = useCurrentOrg();
  const { currentYear } = useApp();
  const navigate = useNavigate();

  const get = (lines: any[], code: string) => lines?.find((l: any) => l.code === code)?.value ?? 0;
  const ca = sig?.ca ?? 0;
  const rn = sig?.resultat ?? 0;
  const ebe = sig?.ebe ?? 0;
  const treso = bilan ? get(bilan.actif, '_BT') - get(bilan.passif, 'DV') : 0;
  const margePct = ca ? (rn / ca) * 100 : 0;
  const tauxEbe = ca ? (ebe / ca) * 100 : 0;

  const alertCount = ratios.filter((r) => r.status !== 'good').length;

  const moisActuel = new Date().toLocaleDateString('fr-FR', { month: 'long' });
  const monthIdx = new Date().getMonth();
  const ytdProgress = ((monthIdx + 1) / 12) * 100;

  // Trends pour sparklines
  const caTrend = monthly.map((m) => m.realise);

  const navItems = [
    { icon: LayoutDashboard, label: 'Catalogue de dashboards', desc: '30+ vues SYSCOHADA prêtes', to: '/dashboards', tone: 'orange' },
    { icon: FileSpreadsheet, label: 'États financiers', desc: 'Bilan · CR · TAFIRE · Notes', to: '/states', tone: 'blue' },
    { icon: Wallet, label: 'Budget & Variance', desc: 'Pilotage budgétaire', to: '/budget', tone: 'green' },
    { icon: FileText, label: 'Reporting', desc: '13 modèles personnalisables', to: '/reports', tone: 'violet' },
    { icon: AlertTriangle, label: 'Alertes', desc: alertCount > 0 ? `${alertCount} en cours` : 'Aucune alerte active', to: '/alerts', tone: 'amber' },
    { icon: Upload, label: 'Imports', desc: 'GL · Balance · Tiers · COA', to: '/imports', tone: 'neutral' },
  ];

  return (
    <div className="min-h-screen bg-bgpage relative overflow-hidden animate-fade-in">
      {/* Lueurs de fond décoratives — premium signature */}
      <div aria-hidden className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgb(218 77 40 / 0.05) 0%, transparent 60%)' }} />
      <div aria-hidden className="absolute -bottom-40 -right-40 w-[700px] h-[700px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgb(218 77 40 / 0.04) 0%, transparent 60%)' }} />

      <div className="relative max-w-7xl mx-auto px-6 lg:px-10 py-6 lg:py-8 min-h-screen flex flex-col">
        {/* TOP BAR */}
        <div className="flex items-center justify-between gap-4 mb-12">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary-900 flex items-center justify-center shrink-0">
              <span className="text-primary-50 font-display text-lg leading-none">C</span>
            </div>
            <div>
              <p className="text-xs font-semibold text-primary-900 dark:text-primary-50 leading-tight">
                {org?.name ?? 'Cockpit FnA'}
              </p>
              <p className="text-[10px] text-primary-500 leading-tight">{org?.sector ?? 'SYSCOHADA · Pilotage financier'}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Pill : exercice */}
            <div className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full
                          bg-surface border border-primary-200/60 text-[11px] text-primary-600">
              <Calendar className="w-3 h-3" />
              <span>Exercice</span>
              <span className="font-semibold text-primary-900 dark:text-primary-50 num">{currentYear}</span>
            </div>

            {/* Alertes (si présentes) */}
            {alertCount > 0 && (
              <Link to="/alerts" className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full
                                          bg-error/10 text-error border border-error/20 text-[11px] font-semibold hover:bg-error/15 transition-colors">
                <AlertTriangle className="w-3 h-3" />
                {alertCount} alerte{alertCount > 1 ? 's' : ''}
              </Link>
            )}

            {/* Proph3t */}
            <Link to="/ai" className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full
                                      hover:bg-primary-100 transition-colors text-[11px] text-primary-600 hover:text-primary-900">
              <Bot className="w-3 h-3" />
              <span>Proph<span className="text-accent font-semibold">3</span>t</span>
            </Link>

            <div className="w-px h-5 bg-primary-200 dark:bg-primary-800 mx-1" />

            <Link to="/" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full
                                  border border-primary-200 hover:border-primary-300 text-[11px] font-medium text-primary-700 hover:text-primary-900 transition">
              <ExternalLink className="w-3 h-3" /> Découvrir
            </Link>
            <Link to="/login" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full
                                       border border-primary-200 hover:border-primary-300 text-[11px] font-medium text-primary-700 hover:text-primary-900 transition">
              <LogIn className="w-3 h-3" /> Se connecter
            </Link>
            <Link to="/dashboard/home" className="btn-primary !py-1.5 !px-4 !text-xs">
              Dashboard <ArrowUpRight className="w-3 h-3" />
            </Link>
          </div>
        </div>

        {/* CENTRE — Hero éditorial */}
        <div className="flex-1 flex flex-col justify-center max-w-6xl mx-auto w-full">
          {/* Greeting éditorial */}
          <div className="mb-12 lg:mb-16">
            <div className="flex items-center gap-2 mb-4">
              <span className="dot dot-success dot-pulse" />
              <span className="text-[10px] uppercase tracking-[0.18em] font-semibold text-primary-500">
                Bienvenue · {moisActuel} {currentYear}
              </span>
            </div>
            <h1 className="font-display text-6xl md:text-7xl lg:text-8xl leading-[0.95] text-primary-900 dark:text-primary-50 mb-3">
              Cockpit<span className="text-accent">.</span>
            </h1>
            <p className="text-sm md:text-base text-primary-500 dark:text-primary-400 max-w-xl leading-relaxed">
              Pilotage financier <span className="font-semibold text-primary-800 dark:text-primary-200">SYSCOHADA révisé 2017</span>.
              Bilan, compte de résultat, ratios et trésorerie en temps réel.
            </p>
          </div>

          {/* 4 métriques hero — cards éditoriales */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-primary-200/60 dark:bg-primary-800/60 rounded-2xl overflow-hidden border border-primary-200/60 dark:border-primary-800/60">
            <HeroMetric
              label="Chiffre d'affaires"
              value={fmtMoney(ca)}
              hint={`${fmtPct(margePct, 1)} marge nette`}
              trend={caTrend}
              tone="orange"
              onClick={() => navigate('/states')}
            />
            <HeroMetric
              label="Résultat net"
              value={fmtMoney(rn)}
              hint={`${rn >= 0 ? 'Bénéfice' : 'Perte'} de l'exercice`}
              tone={rn >= 0 ? 'green' : 'red'}
              indicator={rn >= 0 ? 'up' : 'down'}
              onClick={() => navigate('/states')}
            />
            <HeroMetric
              label="EBE"
              value={fmtMoney(ebe)}
              hint={`${tauxEbe.toFixed(1)} % du CA`}
              tone="amber"
              onClick={() => navigate('/states')}
            />
            <HeroMetric
              label="Trésorerie nette"
              value={fmtMoney(treso)}
              hint={treso >= 0 ? 'Position positive' : 'Découvert'}
              tone={treso >= 0 ? 'blue' : 'red'}
              indicator={treso >= 0 ? 'up' : 'down'}
              onClick={() => navigate('/dashboard/home')}
            />
          </div>

          {/* Ligne progression annuelle + Proph3t teaser */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mt-6">
            <div className="lg:col-span-2 card p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.10em] font-semibold text-primary-500 mb-0.5">Avancement de l'exercice</p>
                  <p className="text-sm font-semibold text-primary-900 dark:text-primary-50">{moisActuel} {currentYear}</p>
                </div>
                <span className="text-[11px] num font-semibold text-primary-700 dark:text-primary-300">
                  {ytdProgress.toFixed(0)} % YTD
                </span>
              </div>
              <div className="relative h-1.5 rounded-full bg-primary-100 dark:bg-primary-800 overflow-hidden">
                <div className="absolute left-0 top-0 bottom-0 rounded-full transition-all duration-700"
                  style={{
                    width: `${ytdProgress}%`,
                    background: 'linear-gradient(90deg, rgb(var(--accent)) 0%, rgb(218 77 40 / 0.7) 100%)',
                  }} />
              </div>
              <p className="text-[11px] text-primary-500 mt-2 leading-relaxed">
                Reste {12 - monthIdx - 1} mois avant clôture · Trésorerie : <span className="num font-medium text-primary-700 dark:text-primary-300">{fmtMoney(treso)}</span>
              </p>
            </div>

            <Link to="/ai" className="card-hover p-5 flex items-start gap-3 group">
              <div className="w-9 h-9 rounded-xl bg-accent/10 text-accent flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-primary-900 dark:text-primary-50 group-hover:text-accent transition-colors">
                  Proph3t · Assistant IA
                </p>
                <p className="text-[11px] text-primary-500 leading-relaxed mt-0.5">
                  Analyse, commente et anticipe votre activité.
                </p>
              </div>
              <ArrowUpRight className="w-4 h-4 text-primary-400 group-hover:text-accent group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all shrink-0" />
            </Link>
          </div>
        </div>

        {/* QUICK ACCESS — 6 cards */}
        <div className="mt-12 lg:mt-16">
          <p className="section-eyebrow mb-3">Accès rapide</p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {navItems.map((it) => (
              <Link key={it.to} to={it.to} className="card-hover p-4 group">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${TONE_BG[it.tone]}`}>
                  <it.icon className={`w-4 h-4 ${TONE_TEXT[it.tone]}`} strokeWidth={2} />
                </div>
                <p className="text-sm font-semibold text-primary-900 dark:text-primary-50 leading-tight mb-0.5 group-hover:text-accent transition-colors">
                  {it.label}
                </p>
                <p className="text-[11px] text-primary-500 leading-relaxed">{it.desc}</p>
              </Link>
            ))}
          </div>
        </div>

        {/* FOOTER */}
        <div className="text-center text-[10px] text-primary-400 mt-10 space-y-0.5">
          <p>CockPit F&amp;A · SYSCOHADA révisé 2017 · © {currentYear}</p>
          <p>
            Une application <a href="https://atlas-studio.app" target="_blank" rel="noopener noreferrer" className="font-semibold text-primary-500 hover:text-accent transition-colors">Atlas Studio</a>
          </p>
        </div>
      </div>
    </div>
  );
}

const TONE_BG: Record<string, string> = {
  orange:  'bg-orange-100/70',
  red:     'bg-red-100/70',
  amber:   'bg-amber-100/70',
  green:   'bg-emerald-100/70',
  blue:    'bg-blue-100/70',
  violet:  'bg-violet-100/70',
  neutral: 'bg-primary-100',
};
const TONE_TEXT: Record<string, string> = {
  orange:  'text-orange-600',
  red:     'text-red-600',
  amber:   'text-amber-600',
  green:   'text-emerald-600',
  blue:    'text-blue-600',
  violet:  'text-violet-600',
  neutral: 'text-primary-700',
};

const TONE_BORDER: Record<string, string> = {
  orange:  'before:bg-orange-500',
  red:     'before:bg-red-500',
  amber:   'before:bg-amber-500',
  green:   'before:bg-emerald-500',
  blue:    'before:bg-blue-500',
  violet:  'before:bg-violet-500',
  neutral: 'before:bg-primary-400',
};

/**
 * HeroMetric — métrique éditoriale grande taille avec sparkline ou flèche directionnelle.
 * Dans une grid avec gap-px sur fond primary-200, donne l'effet "table sans bordure".
 */
function HeroMetric({ label, value, hint, trend, tone, indicator, onClick }: {
  label: string;
  value: string;
  hint: string;
  trend?: number[];
  tone: string;
  indicator?: 'up' | 'down';
  onClick?: () => void;
}) {
  const sparkColor = tone === 'orange' ? '#EA580C' : tone === 'red' ? '#DC2626' : tone === 'amber' ? '#D97706' : tone === 'green' ? '#059669' : tone === 'blue' ? '#2563EB' : '#82807A';

  return (
    <button
      onClick={onClick}
      className="bg-surface dark:bg-primary-900 px-5 py-6 text-left
                 hover:bg-primary-50 dark:hover:bg-primary-800/50
                 transition-colors duration-150 group relative overflow-hidden"
    >
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] uppercase tracking-[0.10em] font-semibold text-primary-500">{label}</p>
        {indicator && (
          <span className={indicator === 'up' ? 'text-success' : 'text-error'}>
            {indicator === 'up' ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
          </span>
        )}
      </div>
      <p className="kpi-value text-[28px] md:text-[32px] text-primary-900 dark:text-primary-50 leading-[1.1] mb-1.5">
        {value}
      </p>
      <p className="text-[11px] text-primary-500 leading-tight">{hint}</p>

      {/* Sparkline en bas (subtle) */}
      {trend && trend.length > 1 && (
        <div className="absolute bottom-0 left-0 right-0 h-12 opacity-50 group-hover:opacity-90 transition-opacity pointer-events-none">
          <SparkPath data={trend} color={sparkColor} />
        </div>
      )}
    </button>
  );
}

function SparkPath({ data, color }: { data: number[]; color: string }) {
  if (!data || data.length < 2) return null;
  const w = 200;
  const h = 48;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = w / (data.length - 1);
  const id = `home-spark-${color.replace('#', '')}`;
  const points = data.map((v, i) => ({ x: i * stepX, y: h - 4 - ((v - min) / range) * (h - 8) }));
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const p0 = points[i - 1];
    const p1 = points[i];
    path += ` C ${p0.x + stepX * 0.4} ${p0.y}, ${p1.x - stepX * 0.4} ${p1.y}, ${p1.x} ${p1.y}`;
  }
  const fillPath = `${path} L ${w} ${h} L 0 ${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-full">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={fillPath} fill={`url(#${id})`} />
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
