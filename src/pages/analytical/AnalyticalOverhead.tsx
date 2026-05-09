/**
 * D06 — Dashboard Frais Généraux
 *
 * Public : DAF, Contrôleur de gestion.
 * Filtre : axe 2 OR axe 3, branche overhead uniquement (FG isolés).
 *
 * Implémentation : on prend l'axe 2 (Cost Center FG) par défaut. L'utilisateur
 * peut consulter D03 (axe 2 + project_cost+overhead) pour comparaison.
 */
import { Wallet } from 'lucide-react';
import AnalyticalAxisDashboard from './AnalyticalAxisDashboard';

export default function AnalyticalOverhead() {
  return (
    <AnalyticalAxisDashboard
      title="D06 — Frais généraux"
      subtitle="FG isolés des coûts projets — axe 2 branche Frais généraux"
      icon={<Wallet className="w-5 h-5" />}
      axisNumber={2}
      branchFilter="overhead"
      amountLabel="FG"
    />
  );
}
