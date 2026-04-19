import { Suspense, useEffect, useState } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { FloatingAI } from './components/layout/FloatingAI';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
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

function PageFallback() {
  return <div className="py-20 text-center text-primary-500">Chargement...</div>;
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
    <div className="flex min-h-screen">
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapse}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <Header onMenuClick={() => setSidebarOpen(true)} />
        <main key={`${amountMode}-${remountKey}`} className="flex-1 p-3 sm:p-4 lg:p-6">
          <Suspense fallback={<PageFallback />}>{children}</Suspense>
        </main>
      </div>
      <FloatingAI />
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary>
    <BrowserRouter>
      <Routes>
        {/* Auth pages — publiques */}
        <Route path="/login" element={<Suspense fallback={<PageFallback />}><Login /></Suspense>} />
        <Route path="/register" element={<Suspense fallback={<PageFallback />}><Register /></Suspense>} />
        <Route path="/forgot-password" element={<Suspense fallback={<PageFallback />}><ForgotPassword /></Suspense>} />
        <Route path="/auth/callback" element={<Suspense fallback={<PageFallback />}><AuthCallback /></Suspense>} />

        {/* Landing publique */}
        <Route path="/" element={<Suspense fallback={<PageFallback />}><Landing /></Suspense>} />

        {/* Routes protégées */}
        <Route path="/home" element={<ProtectedRoute><Home /><FloatingAI /></ProtectedRoute>} />
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
      </Routes>
    </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
