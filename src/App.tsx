import { Suspense, useEffect, useState } from 'react';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { FloatingAI } from './components/layout/FloatingAI';
import { DemoBanner } from './components/layout/DemoBanner';
import { DemoTour } from './components/layout/DemoTour';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { ToastContainer } from './components/ui/Toast';
import { CommandPalette } from './components/ui/CommandPalette';
import { lazyWithRetry } from './lib/lazyWithRetry';
import { useApp } from './store/app';
import { useAmountMode } from './lib/format';
import Home from './pages/Home';

// Auth pages
const Login          = lazyWithRetry(() => import('./pages/auth/Login'));
const Register       = lazyWithRetry(() => import('./pages/auth/Register'));
const ForgotPassword = lazyWithRetry(() => import('./pages/auth/ForgotPassword'));
const AuthCallback   = lazyWithRetry(() => import('./pages/auth/Callback'));

const Landing        = lazyWithRetry(() => import('./pages/Landing'));
const Demo           = lazyWithRetry(() => import('./pages/Demo'));
const Imports        = lazyWithRetry(() => import('./pages/Imports'));
const States         = lazyWithRetry(() => import('./pages/States'));
const Ratios         = lazyWithRetry(() => import('./pages/Ratios'));
const Dashboards     = lazyWithRetry(() => import('./pages/Dashboards'));
const Dashboard      = lazyWithRetry(() => import('./pages/Dashboard'));
const DashboardHome  = lazyWithRetry(() => import('./pages/DashboardHome'));
const Reports        = lazyWithRetry(() => import('./pages/Reports'));
const AI             = lazyWithRetry(() => import('./pages/AI'));
const Alerts         = lazyWithRetry(() => import('./pages/Alerts'));
const Actions        = lazyWithRetry(() => import('./pages/Actions'));
const Budget         = lazyWithRetry(() => import('./pages/Budget'));
const COA            = lazyWithRetry(() => import('./pages/COA'));
const GrandLivre     = lazyWithRetry(() => import('./pages/GrandLivre'));
const Analytical     = lazyWithRetry(() => import('./pages/Analytical'));
const AuditTrail     = lazyWithRetry(() => import('./pages/AuditTrail'));
const Settings       = lazyWithRetry(() => import('./pages/Settings'));
const ExecutiveSummary = lazyWithRetry(() => import('./pages/ExecutiveSummary'));
const ComplianceSyscohada = lazyWithRetry(() => import('./pages/ComplianceSyscohada'));
const BreakEven = lazyWithRetry(() => import('./pages/BreakEven'));
const ParetoAccounts = lazyWithRetry(() => import('./pages/ParetoAccounts'));
const CashflowForecast = lazyWithRetry(() => import('./pages/CashflowForecast'));
const Waterfall = lazyWithRetry(() => import('./pages/Waterfall'));
const TFTMonthly = lazyWithRetry(() => import('./pages/TFTMonthly'));
const CapitalVariationPage = lazyWithRetry(() => import('./pages/CapitalVariationPage'));
const ClosingPack = lazyWithRetry(() => import('./pages/ClosingPack'));
const ZScorePage = lazyWithRetry(() => import('./pages/ZScorePage'));
const RollingForecast = lazyWithRetry(() => import('./pages/RollingForecast'));
const WorkingCapitalDays = lazyWithRetry(() => import('./pages/WorkingCapitalDays'));
const DashboardBuilder = lazyWithRetry(() => import('./pages/DashboardBuilder'));

function PageFallback() {
  return (
    <div className="py-20 flex flex-col items-center justify-center gap-3">
      <div className="w-8 h-8 rounded-full border-2 border-primary-200 border-t-accent animate-spin" />
      <p className="text-xs text-primary-400 tracking-wide">Chargement…</p>
    </div>
  );
}

/**
 * Page transition wrapper — anime l'entree de chaque route via animate-fade-in-up.
 * La key change a chaque navigation -> remount + animation.
 */
function PageTransition({ children }: { children: React.ReactNode }) {
  const loc = useLocation();
  return (
    <div key={loc.pathname} className="animate-fade-in-up">
      {children}
    </div>
  );
}

function AppLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebar-collapsed') === 'true');
  // Triple mécanisme pour garantir le re-render au toggle Entier ↔ Abrégé :
  // 1) abonnement au store Zustand
  // 2) abonnement à l'event custom via useAmountMode (useSyncExternalStore)
  // 3) compteur incrémenté en useEffect qui sert de key={remountKey} sur <main>
  // Comme ça le subtree est forcément démonté/remonté à chaque changement,
  // et tous les fmtK/fmtMoney sont ré-évalués depuis localStorage à jour.
  const amountModeStore = useApp((s) => s.amountMode);
  const amountModeReactive = useAmountMode();
  const amountMode = amountModeReactive || amountModeStore;
  const [remountKey, setRemountKey] = useState(0);
  useEffect(() => { setRemountKey((k) => k + 1); }, [amountMode]);

  const toggleCollapse = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem('sidebar-collapsed', String(next));
  };

  return (
    // Twisty layout : fond gris-bleu de la page (bg-bgpage défini par le thème),
    // sidebar à gauche, et le bloc droit est le grand "shell" crème arrondi qui
    // contient header + main. Le padding extérieur (p-3) crée la marge bleue.
    <div className="flex min-h-screen p-2 sm:p-3 lg:p-4 gap-3">
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapse}
      />
      <div className="flex-1 flex flex-col min-w-0 app-shell">
        <DemoBanner />
        <Header onMenuClick={() => setSidebarOpen(true)} />
        <main key={`${amountMode}-${remountKey}`} className="flex-1 p-3 sm:p-4 lg:p-6">
          <Suspense fallback={<PageFallback />}>
            <PageTransition>{children}</PageTransition>
          </Suspense>
        </main>
      </div>
      <FloatingAI />
      <DemoTour />
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary>
    <ToastContainer />
    <BrowserRouter>
      <CommandPalette />
      <Routes>
        {/* Auth pages — publiques */}
        <Route path="/login" element={<Suspense fallback={<PageFallback />}><Login /></Suspense>} />
        <Route path="/register" element={<Suspense fallback={<PageFallback />}><Register /></Suspense>} />
        <Route path="/forgot-password" element={<Suspense fallback={<PageFallback />}><ForgotPassword /></Suspense>} />
        <Route path="/auth/callback" element={<Suspense fallback={<PageFallback />}><AuthCallback /></Suspense>} />

        {/* Landing publique */}
        <Route path="/" element={<Suspense fallback={<PageFallback />}><Landing /></Suspense>} />
        {/* Démo publique — porte d'entrée parcours guidé avec données fictives */}
        <Route path="/demo" element={<Suspense fallback={<PageFallback />}><Demo /></Suspense>} />

        {/* Routes protégées */}
        <Route path="/home" element={<ProtectedRoute><DemoBanner /><Home /><FloatingAI /><DemoTour /></ProtectedRoute>} />
        <Route path="/dashboards" element={<ProtectedRoute><AppLayout><Dashboards /></AppLayout></ProtectedRoute>} />
        <Route path="/dashboard/home" element={<ProtectedRoute><AppLayout><DashboardHome /></AppLayout></ProtectedRoute>} />
        <Route path="/dashboard/:id" element={<ProtectedRoute><AppLayout><Dashboard /></AppLayout></ProtectedRoute>} />
        <Route path="/alerts" element={<ProtectedRoute><AppLayout><Alerts /></AppLayout></ProtectedRoute>} />
        <Route path="/actions" element={<ProtectedRoute><AppLayout><Actions /></AppLayout></ProtectedRoute>} />
        <Route path="/imports" element={<ProtectedRoute><AppLayout><Imports /></AppLayout></ProtectedRoute>} />
        <Route path="/budget" element={<ProtectedRoute><AppLayout><Budget /></AppLayout></ProtectedRoute>} />
        <Route path="/coa" element={<ProtectedRoute><AppLayout><COA /></AppLayout></ProtectedRoute>} />
        <Route path="/grand-livre" element={<ProtectedRoute><AppLayout><GrandLivre /></AppLayout></ProtectedRoute>} />
        <Route path="/states" element={<ProtectedRoute><AppLayout><States /></AppLayout></ProtectedRoute>} />
        <Route path="/ratios" element={<ProtectedRoute><AppLayout><Ratios /></AppLayout></ProtectedRoute>} />
        <Route path="/reports" element={<ProtectedRoute><AppLayout><Reports /></AppLayout></ProtectedRoute>} />
        <Route path="/ai" element={<ProtectedRoute><AppLayout><AI /></AppLayout></ProtectedRoute>} />
        <Route path="/analytical" element={<ProtectedRoute><AppLayout><Analytical /></AppLayout></ProtectedRoute>} />
        <Route path="/audit" element={<ProtectedRoute><AppLayout><AuditTrail /></AppLayout></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><AppLayout><Settings /></AppLayout></ProtectedRoute>} />
        <Route path="/dashboard/exec" element={<ProtectedRoute><AppLayout><ExecutiveSummary /></AppLayout></ProtectedRoute>} />
        <Route path="/dashboard/compliance" element={<ProtectedRoute><AppLayout><ComplianceSyscohada /></AppLayout></ProtectedRoute>} />
        <Route path="/dashboard/breakeven" element={<ProtectedRoute><AppLayout><BreakEven /></AppLayout></ProtectedRoute>} />
        <Route path="/dashboard/pareto" element={<ProtectedRoute><AppLayout><ParetoAccounts /></AppLayout></ProtectedRoute>} />
        <Route path="/dashboard/cashforecast" element={<ProtectedRoute><AppLayout><CashflowForecast /></AppLayout></ProtectedRoute>} />
        <Route path="/dashboard/waterfall" element={<ProtectedRoute><AppLayout><Waterfall /></AppLayout></ProtectedRoute>} />
        <Route path="/dashboard/tft-monthly" element={<ProtectedRoute><AppLayout><TFTMonthly /></AppLayout></ProtectedRoute>} />
        <Route path="/dashboard/capital-variation" element={<ProtectedRoute><AppLayout><CapitalVariationPage /></AppLayout></ProtectedRoute>} />
        <Route path="/dashboard/closing-pack" element={<ProtectedRoute><AppLayout><ClosingPack /></AppLayout></ProtectedRoute>} />
        <Route path="/dashboard/zscore" element={<ProtectedRoute><AppLayout><ZScorePage /></AppLayout></ProtectedRoute>} />
        <Route path="/dashboard/forecast" element={<ProtectedRoute><AppLayout><RollingForecast /></AppLayout></ProtectedRoute>} />
        <Route path="/dashboard/wcd" element={<ProtectedRoute><AppLayout><WorkingCapitalDays /></AppLayout></ProtectedRoute>} />
        <Route path="/builder" element={<ProtectedRoute><AppLayout><DashboardBuilder /></AppLayout></ProtectedRoute>} />
        <Route path="/builder/:id" element={<ProtectedRoute><AppLayout><DashboardBuilder /></AppLayout></ProtectedRoute>} />
      </Routes>
    </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
