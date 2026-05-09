/**
 * D05 — Dashboard Ressources
 *
 * Public : Chef de projet, RH-projet.
 * Filtre : axe 3, branche project_cost (ressources affectées aux projets).
 */
import { Users } from 'lucide-react';
import AnalyticalAxisDashboard from './AnalyticalAxisDashboard';

export default function AnalyticalResources() {
  return (
    <AnalyticalAxisDashboard
      title="D05 — Ressources"
      subtitle="Consommation des ressources sur projets — axe 3 branche Coûts projets"
      icon={<Users className="w-5 h-5" />}
      axisNumber={3}
      branchFilter="project_cost"
      amountLabel="Coût ressource"
    />
  );
}
