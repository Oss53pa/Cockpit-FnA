import { Suspense, useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { FloatingAI } from './components/layout/FloatingAI';
import { SpacesDock } from './components/layout/SpacesDock';
import { ActivitySidebar, ActivitySidebarToggle } from './components/layout/ActivitySidebar';
import { DemoBanner } from './components/layout/DemoBanner';
import { DemoTour } from './components/layout/DemoTour';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { OrgGuard } from './components/auth/OrgGuard';
import { ToastContainer } from './components/ui/Toast';
import { CommandPalette } from './components/ui/CommandPalette';
import { OnboardingModal } from './components/ui/OnboardingModal';
import { InstallPrompt } from './components/ui/InstallPrompt';
import { ReadOnlyBanner } from './components/ui/ReadOnlyBanner';
import { lazyWithRetry } from './lib/lazyWithRetry';
import { useApp } from './store/app';
import { useAmountMode } from './lib/format';
import { useOrgResolver } from './hooks/useOrgResolver';
import { safeLocalStorage } from './lib/safeStorage';
import Home from './pages/Home';

// Auth pages — format unifié Atlas Studio Suite
// /login, /signup, /forgot-password, /reset-password
const Login          = lazyWithRetry(() => import('./pages/auth/Login'));
const Signup         = lazyWithRetry(() => import('./pages/auth/Signup'));
const ForgotPassword = lazyWithRetry(() => import('./pages/auth/ForgotPassword'));
const ResetPassword  = lazyWithRetry(() => import('./pages/auth/ResetPassword'));
const AuthCallback   = lazyWithRetry(() => import('./pages/auth/Callback'));
const AcceptInvite   = lazyWithRetry(() => import('./pages/auth/AcceptInvite'));
const AtlasSSO       = lazyWithRetry(() => import('./pages/auth/AtlasSSO'));

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
const TeamSettings   = lazyWithRetry(() => import('./pages/settings/TeamSettingsPage'));
const Guide          = lazyWithRetry(() => import('./pages/Guide'));
const Chat           = lazyWithRetry(() => import('./pages/Chat'));
const Spaces         = lazyWithRetry(() => import('./pages/collaboration/Spaces'));
const SpaceDetail    = lazyWithRetry(() => import('./pages/collaboration/SpaceDetail'));
const ExecutiveSummary = lazyWithRetry(() => import('./pages/ExecutiveSummary'));
const ComplianceSyscohada = lazyWithRetry(() => import('./pages/ComplianceSyscohada'));
const BreakEven = lazyWithRetry(() => import('./pages/BreakEven'));
const ParetoAccounts = lazyWithRetry(() => import('./pages/ParetoAccounts'));
const CashflowForecast = lazyWithRetry(() => import('./pages/CashflowForecast'));
const Waterfall = lazyWithRetry(() => import('./pages/Waterfall'));
const TresorerieWaterfall = lazyWithRetry(() => import('./pages/TresorerieWaterfall'));
const Endettement = lazyWithRetry(() => import('./pages/Endettement'));
const EcheancierFiscal = lazyWithRetry(() => import('./pages/EcheancierFiscal'));
const DuPont = lazyWithRetry(() => import('./pages/DuPont'));
const BusinessPlan = lazyWithRetry(() => import('./pages/BusinessPlan'));
const StructureCouts = lazyWithRetry(() => import('./pages/StructureCouts'));
const Consolidation = lazyWithRetry(() => import('./pages/Consolidation'));
const IfrsReporting = lazyWithRetry(() => import('./pages/IfrsReporting'));
const ChartGallery = lazyWithRetry(() => import('./pages/ChartGallery'));
const TFTMonthly = lazyWithRetry(() => import('./pages/TFTMonthly'));
const CapitalVariationPage = lazyWithRetry(() => import('./pages/CapitalVariationPage'));
const ClosingPack = lazyWithRetry(() => import('./pages/ClosingPack'));
const ZScorePage = lazyWithRetry(() => import('./pages/ZScorePage'));
const RollingForecast = lazyWithRetry(() => import('./pages/RollingForecast'));
const WorkingCapitalDays = lazyWithRetry(() => import('./pages/WorkingCapitalDays'));
const DashboardBuilder = lazyWithRetry(() => import('./pages/DashboardBuilder'));
// Nouveaux dashboards (Phase 4 — coverage P0/P1/P2)
const TAFIREPage = lazyWithRetry(() => import('./pages/TAFIREPage'));
const BilanMonthly = lazyWithRetry(() => import('./pages/BilanMonthly'));
const CAFPage = lazyWithRetry(() => import('./pages/CAFPage'));
const MultiYear = lazyWithRetry(() => import('./pages/MultiYear'));
const BankReconciliation = lazyWithRetry(() => import('./pages/BankReconciliation'));
const ClosingJustification = lazyWithRetry(() => import('./pages/ClosingJustification'));
const AuditTrailVisualizer = lazyWithRetry(() => import('./pages/AuditTrailVisualizer'));
const AnomaliesHeatmap = lazyWithRetry(() => import('./pages/AnomaliesHeatmap'));
const Lettrage = lazyWithRetry(() => import('./pages/Lettrage'));
const Seasonality = lazyWithRetry(() => import('./pages/Seasonality'));
const WhatIf = lazyWithRetry(() => import('./pages/WhatIf'));
const ProvisionsTracking = lazyWithRetry(() => import('./pages/ProvisionsTracking'));
const Intercos = lazyWithRetry(() => import('./pages/Intercos'));
const WeeklyDashboard = lazyWithRetry(() => import('./pages/WeeklyDashboard'));
const MdaAuto = lazyWithRetry(() => import('./pages/MdaAuto'));
const BoardPack = lazyWithRetry(() => import('./pages/BoardPack'));
const SectorBenchmark = lazyWithRetry(() => import('./pages/SectorBenchmark'));
const Proph3tIntelligence = lazyWithRetry(() => import('./pages/Proph3tIntelligence'));
const CREditor = lazyWithRetry(() => import('./pages/CREditor'));
const CompanyDiagnostic = lazyWithRetry(() => import('./pages/CompanyDiagnostic'));
const SyntheseHub      = lazyWithRetry(() => import('./pages/SyntheseHub'));
const ImportAnalytical = lazyWithRetry(() => import('./pages/ImportAnalytical'));
// Dashboards analytiques dédiés (D03 / D04 / D05 / D06 / D09 / D10)
const AnalyticalCoverage       = lazyWithRetry(() => import('./pages/analytical/AnalyticalCoverage'));
const AnalyticalCostCenters    = lazyWithRetry(() => import('./pages/analytical/AnalyticalCostCenters'));
const AnalyticalRevenueCenters = lazyWithRetry(() => import('./pages/analytical/AnalyticalRevenueCenters'));
const AnalyticalResources      = lazyWithRetry(() => import('./pages/analytical/AnalyticalResources'));
const AnalyticalOverhead       = lazyWithRetry(() => import('./pages/analytical/AnalyticalOverhead'));
const AnalyticalFGAllocation   = lazyWithRetry(() => import('./pages/analytical/AnalyticalFGAllocation'));
// Tables T01-T10 + Catalogue KPIs (Sprint 1+2)
const AnalyticalJournal        = lazyWithRetry(() => import('./pages/analytical/AnalyticalJournal'));
const AnalyticalBalance        = lazyWithRetry(() => import('./pages/analytical/AnalyticalBalance'));
const AnalyticalPivot          = lazyWithRetry(() => import('./pages/analytical/AnalyticalPivot'));
const AnalyticalAnomalies      = lazyWithRetry(() => import('./pages/analytical/AnalyticalAnomalies'));
const AnalyticalAuditTrail     = lazyWithRetry(() => import('./pages/analytical/AnalyticalAuditTrail'));
const AnalyticalKPICatalog     = lazyWithRetry(() => import('./pages/analytical/AnalyticalKPICatalog'));

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
  // Résout dynamiquement currentOrgId depuis fna_user_orgs (plus de hardcode `sa-001`).
  // Si l'user n'a aucune org, OnboardingModal se déclenche (cf. plus bas).
  useOrgResolver();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => safeLocalStorage.getItem('sidebar-collapsed') === 'true');
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
    safeLocalStorage.setItem('sidebar-collapsed', String(next));
  };

  return (
    // Layout Cockpit CR : fond crème uniforme, sidebar flush avec un border
    // droit subtil, main area sans rounded shell — fluidité totale.
    <div className="flex min-h-screen bg-bgpage">
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapse}
      />
      <div className="flex-1 flex flex-col min-w-0 border-l border-primary-200/60 dark:border-primary-800/60">
        <DemoBanner />
        <ReadOnlyBanner />
        <Header onMenuClick={() => setSidebarOpen(true)} />
        <main key={`${amountMode}-${remountKey}`} className="flex-1 p-4 sm:p-6 lg:p-8">
          <Suspense fallback={<PageFallback />}>
            <PageTransition>{children}</PageTransition>
          </Suspense>
        </main>
      </div>
      <FloatingAI />
      <SpacesDock />
      <DemoTour />
      <ActivitySidebarToggle />
      <ActivitySidebar />
      <OnboardingModal />
      <InstallPrompt />
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
        <Route path="/signup" element={<Suspense fallback={<PageFallback />}><Signup /></Suspense>} />
        {/* /register : alias rétro-compatible vers /signup */}
        <Route path="/register" element={<Navigate to="/signup" replace />} />
        <Route path="/forgot-password" element={<Suspense fallback={<PageFallback />}><ForgotPassword /></Suspense>} />
        <Route path="/reset-password" element={<Suspense fallback={<PageFallback />}><ResetPassword /></Suspense>} />
        <Route path="/auth/callback" element={<Suspense fallback={<PageFallback />}><AuthCallback /></Suspense>} />
        <Route path="/auth/accept-invite" element={<Suspense fallback={<PageFallback />}><AcceptInvite /></Suspense>} />
        {/* SSO depuis Atlas Studio (token JWT signe par app-token) */}
        <Route path="/auth" element={<Suspense fallback={<PageFallback />}><AtlasSSO /></Suspense>} />

        {/* Landing publique */}
        <Route path="/" element={<Suspense fallback={<PageFallback />}><Landing /></Suspense>} />
        {/* Démo publique — porte d'entrée parcours guidé avec données fictives */}
        <Route path="/demo" element={<Suspense fallback={<PageFallback />}><Demo /></Suspense>} />

        {/* Routes protégées */}
        <Route path="/home" element={<ProtectedRoute><OrgGuard><DemoBanner /><Home /><FloatingAI /><DemoTour /></OrgGuard></ProtectedRoute>} />
        <Route path="/dashboards" element={<ProtectedRoute><AppLayout><Dashboards /></AppLayout></ProtectedRoute>} />
        {/* Synthèse : hub regroupant Vue d'ensemble + Santé entreprise + Alertes */}
        <Route path="/dashboard/home" element={<ProtectedRoute><AppLayout><SyntheseHub /></AppLayout></ProtectedRoute>} />
        {/* Routes legacy : redirection automatique vers le hub avec le bon onglet */}
        <Route path="/diagnostic" element={<Navigate to="/dashboard/home?tab=sante" replace />} />
        {/* Dashboards analytiques dédiés (catalogue D03/D04/D05/D06/D09/D10) */}
        <Route path="/analytical/coverage"        element={<ProtectedRoute><AppLayout><AnalyticalCoverage /></AppLayout></ProtectedRoute>} />
        <Route path="/analytical/cost-centers"    element={<ProtectedRoute><AppLayout><AnalyticalCostCenters /></AppLayout></ProtectedRoute>} />
        <Route path="/analytical/revenue-centers" element={<ProtectedRoute><AppLayout><AnalyticalRevenueCenters /></AppLayout></ProtectedRoute>} />
        <Route path="/analytical/resources"       element={<ProtectedRoute><AppLayout><AnalyticalResources /></AppLayout></ProtectedRoute>} />
        <Route path="/analytical/overhead"        element={<ProtectedRoute><AppLayout><AnalyticalOverhead /></AppLayout></ProtectedRoute>} />
        <Route path="/analytical/fg-allocation"   element={<ProtectedRoute><AppLayout><AnalyticalFGAllocation /></AppLayout></ProtectedRoute>} />
        {/* Tables T01-T10 + Catalogue KPIs */}
        <Route path="/analytical/journal"         element={<ProtectedRoute><AppLayout><AnalyticalJournal /></AppLayout></ProtectedRoute>} />
        <Route path="/analytical/balance"         element={<ProtectedRoute><AppLayout><AnalyticalBalance /></AppLayout></ProtectedRoute>} />
        <Route path="/analytical/pivot"           element={<ProtectedRoute><AppLayout><AnalyticalPivot /></AppLayout></ProtectedRoute>} />
        <Route path="/analytical/anomalies"       element={<ProtectedRoute><AppLayout><AnalyticalAnomalies /></AppLayout></ProtectedRoute>} />
        <Route path="/analytical/audit-trail"     element={<ProtectedRoute><AppLayout><AnalyticalAuditTrail /></AppLayout></ProtectedRoute>} />
        <Route path="/analytical/kpis"            element={<ProtectedRoute><AppLayout><AnalyticalKPICatalog /></AppLayout></ProtectedRoute>} />
        {/* Import unifié axes + codes analytiques (modèle Données / GL Tiers) */}
        <Route path="/import-analytical"          element={<ProtectedRoute><AppLayout><ImportAnalytical /></AppLayout></ProtectedRoute>} />
        <Route path="/dashboard/:id" element={<ProtectedRoute><AppLayout><Dashboard /></AppLayout></ProtectedRoute>} />
        <Route path="/alerts" element={<Navigate to="/dashboard/home?tab=alertes" replace />} />
        <Route path="/actions" element={<ProtectedRoute><AppLayout><Actions /></AppLayout></ProtectedRoute>} />
        <Route path="/imports" element={<ProtectedRoute><AppLayout><Imports /></AppLayout></ProtectedRoute>} />
        {/* GL Tiers consolidé dans le module Grand Livre (onglet Import). Ancienne route redirigée. */}
        <Route path="/import-tiers" element={<Navigate to="/grand-livre" replace />} />
        <Route path="/budget" element={<ProtectedRoute><AppLayout><Budget /></AppLayout></ProtectedRoute>} />
        <Route path="/coa" element={<ProtectedRoute><AppLayout><COA /></AppLayout></ProtectedRoute>} />
        <Route path="/grand-livre" element={<ProtectedRoute><AppLayout><GrandLivre /></AppLayout></ProtectedRoute>} />
        <Route path="/balance" element={<ProtectedRoute><AppLayout><GrandLivre /></AppLayout></ProtectedRoute>} />
        <Route path="/states" element={<ProtectedRoute><AppLayout><States /></AppLayout></ProtectedRoute>} />
        <Route path="/ratios" element={<ProtectedRoute><AppLayout><Ratios /></AppLayout></ProtectedRoute>} />
        <Route path="/reports" element={<ProtectedRoute><AppLayout><Reports /></AppLayout></ProtectedRoute>} />
        <Route path="/ai" element={<ProtectedRoute><AppLayout><AI /></AppLayout></ProtectedRoute>} />
        <Route path="/analytical" element={<ProtectedRoute><AppLayout><Analytical /></AppLayout></ProtectedRoute>} />
        <Route path="/audit" element={<ProtectedRoute><AppLayout><AuditTrail /></AppLayout></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><AppLayout><Settings /></AppLayout></ProtectedRoute>} />
        <Route path="/settings/team" element={<ProtectedRoute><AppLayout><TeamSettings /></AppLayout></ProtectedRoute>} />
        <Route path="/guide" element={<ProtectedRoute><AppLayout><Guide /></AppLayout></ProtectedRoute>} />
        <Route path="/chat" element={<ProtectedRoute><AppLayout><Chat /></AppLayout></ProtectedRoute>} />
        <Route path="/spaces" element={<ProtectedRoute><AppLayout><Spaces /></AppLayout></ProtectedRoute>} />
        <Route path="/spaces/:id" element={<ProtectedRoute><AppLayout><SpaceDetail /></AppLayout></ProtectedRoute>} />
        <Route path="/dashboard/exec" element={<ProtectedRoute><AppLayout><ExecutiveSummary /></AppLayout></ProtectedRoute>} />
        <Route path="/dashboard/compliance" element={<ProtectedRoute><AppLayout><ComplianceSyscohada /></AppLayout></ProtectedRoute>} />
        <Route path="/dashboard/breakeven" element={<ProtectedRoute><AppLayout><BreakEven /></AppLayout></ProtectedRoute>} />
        <Route path="/dashboard/pareto" element={<ProtectedRoute><AppLayout><ParetoAccounts /></AppLayout></ProtectedRoute>} />
        <Route path="/dashboard/cashforecast" element={<ProtectedRoute><AppLayout><CashflowForecast /></AppLayout></ProtectedRoute>} />
        <Route path="/dashboard/waterfall" element={<ProtectedRoute><AppLayout><Waterfall /></AppLayout></ProtectedRoute>} />
        <Route path="/dashboard/tre-waterfall" element={<ProtectedRoute><AppLayout><TresorerieWaterfall /></AppLayout></ProtectedRoute>} />
        <Route path="/dashboard/endettement" element={<ProtectedRoute><AppLayout><Endettement /></AppLayout></ProtectedRoute>} />
        <Route path="/dashboard/echeancier-fiscal" element={<ProtectedRoute><AppLayout><EcheancierFiscal /></AppLayout></ProtectedRoute>} />
        <Route path="/dashboard/dupont" element={<ProtectedRoute><AppLayout><DuPont /></AppLayout></ProtectedRoute>} />
        <Route path="/dashboard/business-plan" element={<ProtectedRoute><AppLayout><BusinessPlan /></AppLayout></ProtectedRoute>} />
        <Route path="/dashboard/structure-couts" element={<ProtectedRoute><AppLayout><StructureCouts /></AppLayout></ProtectedRoute>} />
        <Route path="/dashboard/consolidation" element={<ProtectedRoute><AppLayout><Consolidation /></AppLayout></ProtectedRoute>} />
        <Route path="/ifrs" element={<ProtectedRoute><AppLayout><IfrsReporting /></AppLayout></ProtectedRoute>} />
        <Route path="/dashboard/chart-gallery" element={<ProtectedRoute><AppLayout><ChartGallery /></AppLayout></ProtectedRoute>} />
        <Route path="/dashboard/tft-monthly" element={<ProtectedRoute><AppLayout><TFTMonthly /></AppLayout></ProtectedRoute>} />
        <Route path="/dashboard/capital-variation" element={<ProtectedRoute><AppLayout><CapitalVariationPage /></AppLayout></ProtectedRoute>} />
        <Route path="/dashboard/closing-pack" element={<ProtectedRoute><AppLayout><ClosingPack /></AppLayout></ProtectedRoute>} />
        <Route path="/dashboard/zscore" element={<ProtectedRoute><AppLayout><ZScorePage /></AppLayout></ProtectedRoute>} />
        <Route path="/dashboard/forecast" element={<ProtectedRoute><AppLayout><RollingForecast /></AppLayout></ProtectedRoute>} />
        <Route path="/dashboard/wcd" element={<ProtectedRoute><AppLayout><WorkingCapitalDays /></AppLayout></ProtectedRoute>} />
        <Route path="/dashboard/tafire" element={<ProtectedRoute><AppLayout><TAFIREPage /></AppLayout></ProtectedRoute>} />
        <Route path="/dashboard/bilan-monthly" element={<ProtectedRoute><AppLayout><BilanMonthly /></AppLayout></ProtectedRoute>} />
        <Route path="/dashboard/caf" element={<ProtectedRoute><AppLayout><CAFPage /></AppLayout></ProtectedRoute>} />
        <Route path="/dashboard/multi-year" element={<ProtectedRoute><AppLayout><MultiYear /></AppLayout></ProtectedRoute>} />
        <Route path="/dashboard/bank-reconciliation" element={<ProtectedRoute><AppLayout><BankReconciliation /></AppLayout></ProtectedRoute>} />
        <Route path="/dashboard/closing-justification" element={<ProtectedRoute><AppLayout><ClosingJustification /></AppLayout></ProtectedRoute>} />
        <Route path="/dashboard/audit-trail" element={<ProtectedRoute><AppLayout><AuditTrailVisualizer /></AppLayout></ProtectedRoute>} />
        <Route path="/dashboard/anomalies" element={<ProtectedRoute><AppLayout><AnomaliesHeatmap /></AppLayout></ProtectedRoute>} />
        <Route path="/dashboard/lettrage" element={<ProtectedRoute><AppLayout><Lettrage /></AppLayout></ProtectedRoute>} />
        <Route path="/dashboard/seasonality" element={<ProtectedRoute><AppLayout><Seasonality /></AppLayout></ProtectedRoute>} />
        <Route path="/dashboard/whatif" element={<ProtectedRoute><AppLayout><WhatIf /></AppLayout></ProtectedRoute>} />
        <Route path="/dashboard/provisions" element={<ProtectedRoute><AppLayout><ProvisionsTracking /></AppLayout></ProtectedRoute>} />
        <Route path="/dashboard/intercos" element={<ProtectedRoute><AppLayout><Intercos /></AppLayout></ProtectedRoute>} />
        <Route path="/dashboard/weekly" element={<ProtectedRoute><AppLayout><WeeklyDashboard /></AppLayout></ProtectedRoute>} />
        <Route path="/dashboard/mda" element={<ProtectedRoute><AppLayout><MdaAuto /></AppLayout></ProtectedRoute>} />
        <Route path="/dashboard/board-pack" element={<ProtectedRoute><AppLayout><BoardPack /></AppLayout></ProtectedRoute>} />
        <Route path="/dashboard/sector-benchmark" element={<ProtectedRoute><AppLayout><SectorBenchmark /></AppLayout></ProtectedRoute>} />
        <Route path="/dashboard/proph3t" element={<ProtectedRoute><AppLayout><Proph3tIntelligence /></AppLayout></ProtectedRoute>} />
        <Route path="/cr-editor" element={<ProtectedRoute><AppLayout><CREditor /></AppLayout></ProtectedRoute>} />
        <Route path="/builder" element={<ProtectedRoute><AppLayout><DashboardBuilder /></AppLayout></ProtectedRoute>} />
        <Route path="/builder/:id" element={<ProtectedRoute><AppLayout><DashboardBuilder /></AppLayout></ProtectedRoute>} />
      </Routes>
    </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
