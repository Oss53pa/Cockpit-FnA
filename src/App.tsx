import { lazy, Suspense, useState } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { FloatingAI } from './components/layout/FloatingAI';
import { ErrorBoundary } from './components/ErrorBoundary';
import Home from './pages/Home';

const Imports        = lazy(() => import('./pages/Imports'));
const States         = lazy(() => import('./pages/States'));
const Ratios         = lazy(() => import('./pages/Ratios'));
const Dashboards     = lazy(() => import('./pages/Dashboards'));
const Dashboard      = lazy(() => import('./pages/Dashboard'));
const DashboardHome  = lazy(() => import('./pages/DashboardHome'));
const Reports        = lazy(() => import('./pages/Reports'));
const AI             = lazy(() => import('./pages/AI'));
const Alerts         = lazy(() => import('./pages/Alerts'));
const Actions        = lazy(() => import('./pages/Actions'));
const Budget         = lazy(() => import('./pages/Budget'));
const COA            = lazy(() => import('./pages/COA'));
const GrandLivre     = lazy(() => import('./pages/GrandLivre'));
const Analytical     = lazy(() => import('./pages/Analytical'));
const AuditTrail     = lazy(() => import('./pages/AuditTrail'));
const Settings       = lazy(() => import('./pages/Settings'));

function PageFallback() {
  return <div className="py-20 text-center text-primary-500">Chargement...</div>;
}

function AppLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebar-collapsed') === 'true');

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
        <main className="flex-1 p-3 sm:p-4 lg:p-6">
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
        <Route path="/" element={<><Home /><FloatingAI /></>} />
        <Route path="/dashboards" element={<AppLayout><Dashboards /></AppLayout>} />
        <Route path="/dashboard/home" element={<AppLayout><DashboardHome /></AppLayout>} />
        <Route path="/dashboard/:id" element={<AppLayout><Dashboard /></AppLayout>} />
        <Route path="/alerts" element={<AppLayout><Alerts /></AppLayout>} />
        <Route path="/actions" element={<AppLayout><Actions /></AppLayout>} />
        <Route path="/imports" element={<AppLayout><Imports /></AppLayout>} />
        <Route path="/budget" element={<AppLayout><Budget /></AppLayout>} />
        <Route path="/coa" element={<AppLayout><COA /></AppLayout>} />
        <Route path="/grand-livre" element={<AppLayout><GrandLivre /></AppLayout>} />
        <Route path="/states" element={<AppLayout><States /></AppLayout>} />
        <Route path="/ratios" element={<AppLayout><Ratios /></AppLayout>} />
        <Route path="/reports" element={<AppLayout><Reports /></AppLayout>} />
        <Route path="/ai" element={<AppLayout><AI /></AppLayout>} />
        <Route path="/analytical" element={<AppLayout><Analytical /></AppLayout>} />
        <Route path="/audit" element={<AppLayout><AuditTrail /></AppLayout>} />
        <Route path="/settings" element={<AppLayout><Settings /></AppLayout>} />
      </Routes>
    </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
