import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, Bot, ExternalLink, LayoutDashboard, FileSpreadsheet, FileText, Upload, Wallet, LogIn } from 'lucide-react';
import { useBalance, useCurrentOrg, useRatios, useStatements } from '../hooks/useFinancials';
import { useApp } from '../store/app';
import { fmtMoney } from '../lib/format';

export default function Home() {
  const { sig, bilan } = useStatements();
  const ratios = useRatios();
  const balance = useBalance();
  const org = useCurrentOrg();
  const { currentYear } = useApp();
  const navigate = useNavigate();

  // KPIs clés pour le landing
  const get = (lines: any[], code: string) => lines?.find((l: any) => l.code === code)?.value ?? 0;
  const ca = sig?.ca ?? 0;
  const rn = sig?.resultat ?? 0;
  const ebe = sig?.ebe ?? 0;
  const treso = bilan ? get(bilan.actif, '_BT') - get(bilan.passif, 'DV') : 0;
  const margePct = ca ? (rn / ca) * 100 : 0;

  const alertCount = ratios.filter((r) => r.status !== 'good').length
    + balance.filter((r) => r.account.startsWith('6') && r.soldeC > 1000).length;

  const moisActuel = new Date().toLocaleDateString('fr-FR', { month: 'long' });
  const moisReste = 12 - new Date().getMonth();

  const navItems = [
    { icon: LayoutDashboard, label: 'Catalogue', to: '/dashboards' },
    { icon: FileSpreadsheet, label: 'États financiers', to: '/states' },
    { icon: Upload, label: 'Imports', to: '/imports' },
    { icon: Wallet, label: 'Budget', to: '/budget' },
    { icon: FileText, label: 'Rapports', to: '/reports' },
    { icon: AlertTriangle, label: 'Alertes', to: '/alerts' },
  ];

  return (
    // Layout Twisty : bg-page bleu en BORDURE FINE (p-3) + shell blanc-bleute
    // qui occupe l'ecran. Le bleu n'apparait que comme "frame" autour du shell.
    <div className="min-h-screen p-2 sm:p-3 lg:p-4 bg-bgpage dark:bg-primary-950 animate-fade-in">
      <div className="min-h-[calc(100vh-1rem)] sm:min-h-[calc(100vh-1.5rem)] lg:min-h-[calc(100vh-2rem)] relative px-8 py-8 flex flex-col app-shell">
      {/* TOP BAR */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-primary-900 dark:text-primary-50">
            {org?.name ?? '—'}
          </p>
          <p className="text-[11px] text-primary-400 italic">{org?.sector ?? 'Exercice en cours'}</p>
        </div>
        <div className="flex items-center gap-4">
          {alertCount > 0 && (
            <Link to="/alerts" className="flex items-center gap-1.5 text-xs hover:text-primary-900 dark:hover:text-primary-50 transition">
              <span className="relative inline-flex items-center justify-center">
                <AlertTriangle className="w-3.5 h-3.5" />
              </span>
              <span className="text-error font-semibold num">● {alertCount}</span>
            </Link>
          )}
          <Link to="/ai" className="flex items-center gap-1.5 text-xs hover:text-primary-900 dark:hover:text-primary-50 transition">
            <Bot className="w-3.5 h-3.5 text-primary-500" />
            <span className="italic font-medium">Proph<span className="text-accent">3t</span></span>
          </Link>
          <span className="text-xs text-primary-500">
            Exercice : <span className="font-bold text-primary-900 dark:text-primary-50 num">{currentYear}</span>
          </span>
          {/* Bouton retour vers la Landing (page de présentation produit) */}
          <Link to="/" title="Découvrir le produit"
            className="inline-flex items-center gap-1.5 border border-primary-300 dark:border-primary-700 px-3 py-1.5 rounded-full text-xs font-medium text-primary-700 dark:text-primary-300 hover:bg-primary-100 dark:hover:bg-primary-900 transition">
            <ExternalLink className="w-3 h-3" /> Découvrir
          </Link>
          <Link to="/login" title="Se connecter à votre compte"
            className="inline-flex items-center gap-1.5 border border-primary-300 dark:border-primary-700 px-3 py-1.5 rounded-full text-xs font-medium text-primary-700 dark:text-primary-300 hover:bg-primary-100 dark:hover:bg-primary-900 transition">
            <LogIn className="w-3 h-3" /> Se connecter
          </Link>
          <Link to="/dashboard/home"
            className="inline-flex items-center gap-2 bg-primary-900 dark:bg-primary-100 text-primary-50 dark:text-primary-900 px-4 py-1.5 rounded-full text-xs font-semibold hover:opacity-90 transition">
            Dashboard →
          </Link>
        </div>
      </div>

      {/* CENTRE — Logo + chiffres */}
      <div className="flex-1 flex flex-col items-center justify-center">
        <h1 className="font-display text-7xl md:text-8xl leading-none text-primary-900 dark:text-primary-50">
          Cockpit
        </h1>
        <p className="text-sm text-primary-400 mt-2 tracking-wide">Finance &amp; Accounting</p>

        {/* 4 chiffres clés */}
        <div className="flex items-center gap-10 md:gap-16 mt-16">
          <Metric value={fmtMoney(ca)} label="Chiffre d'affaires" onClick={() => navigate('/states')} />
          <div className="w-px h-14 bg-primary-200 dark:bg-primary-800" />
          <Metric value={fmtMoney(rn)} label="Résultat net" onClick={() => navigate('/states')} />
          <div className="w-px h-14 bg-primary-200 dark:bg-primary-800" />
          <Metric value={fmtMoney(ebe)} label="EBE" onClick={() => navigate('/states')} />
          <div className="w-px h-14 bg-primary-200 dark:bg-primary-800" />
          <Metric value={`${margePct.toFixed(2)} %`} label="Marge nette" onClick={() => navigate('/ratios')} />
        </div>

        <div className="flex items-center gap-4 mt-4 text-[11px] text-primary-400">
          <span>Trésorerie nette : <span className="num font-semibold text-primary-700 dark:text-primary-300">{fmtMoney(treso)}</span></span>
          <span>·</span>
          <span>Mois en cours : <span className="font-semibold text-primary-700 dark:text-primary-300">{moisActuel}</span> (reste {moisReste} mois)</span>
        </div>
      </div>

      {/* NAVIGATION BOTTOM */}
      <div className="flex flex-wrap items-center justify-center gap-3 mt-8">
        {navItems.map((it) => (
          <Link key={it.to} to={it.to}
            className="inline-flex items-center gap-2 px-4 py-1.5 border border-primary-300 dark:border-primary-700 rounded-full text-xs text-primary-600 dark:text-primary-400 hover:border-primary-900 dark:hover:border-primary-100 hover:text-primary-900 dark:hover:text-primary-50 transition bg-white dark:bg-primary-900">
            <it.icon className="w-3.5 h-3.5" />
            {it.label}
          </Link>
        ))}
      </div>

      {/* FOOTER */}
      <div className="text-center text-[10px] text-primary-400 mt-6 space-y-0.5">
        <p>CockPit F&amp;A — SYSCOHADA révisé 2017 · Tous droits réservés © {currentYear}</p>
        <p>
          Une application <a href="https://atlas-studio.app" target="_blank" rel="noopener noreferrer" className="font-semibold text-primary-500 hover:text-accent transition-colors">Atlas Studio</a>
        </p>
      </div>
      </div>
    </div>
  );
}

function Metric({ value, label, onClick }: { value: string; label: string; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="text-center hover:opacity-70 transition cursor-pointer">
      <p className="num text-3xl md:text-4xl font-light text-primary-900 dark:text-primary-50 leading-none">{value}</p>
      <p className="text-[11px] text-primary-400 mt-2">{label}</p>
    </button>
  );
}
