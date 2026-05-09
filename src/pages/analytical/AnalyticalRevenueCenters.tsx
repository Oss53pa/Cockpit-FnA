/**
 * D04 — Dashboard Centres de Revenu
 *
 * Public : Direction commerciale, DAF.
 * Filtre : axe 2, branche revenue uniquement.
 */
import { TrendingUp } from 'lucide-react';
import AnalyticalAxisDashboard from './AnalyticalAxisDashboard';

export default function AnalyticalRevenueCenters() {
  return (
    <AnalyticalAxisDashboard
      title="D04 — Centres de revenu"
      subtitle="Sources de revenus par centre / type — axe 2 branche Revenus"
      icon={<TrendingUp className="w-5 h-5" />}
      axisNumber={2}
      branchFilter="revenue"
      amountLabel="CA"
      concentrationWarning={0.6}
    />
  );
}
