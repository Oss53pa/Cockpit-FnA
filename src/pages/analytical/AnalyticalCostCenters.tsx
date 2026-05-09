/**
 * D03 — Dashboard Centres de Coût
 *
 * Public : Contrôleur de gestion, Responsables de centre.
 * Filtre : axe 2, branches project_cost + overhead.
 * Délègue à AnalyticalAxisDashboard pour le rendu.
 */
import { Layers } from 'lucide-react';
import AnalyticalAxisDashboard from './AnalyticalAxisDashboard';

export default function AnalyticalCostCenters() {
  return (
    <AnalyticalAxisDashboard
      title="D03 — Centres de coût"
      subtitle="Performance des centres de coût (projets + frais généraux) — axe 2"
      icon={<Layers className="w-5 h-5" />}
      axisNumber={2}
      branchFilter={['project_cost', 'overhead']}
      amountLabel="Charges"
    />
  );
}
