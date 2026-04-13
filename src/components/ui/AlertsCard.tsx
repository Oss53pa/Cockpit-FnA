import { ChartCard } from './ChartCard';
import { AlertItem } from './AlertItem';
import type { Alert } from '../../engine/synthese';

export function AlertsCard({ alerts, title = 'Alertes Prioritaires' }: { alerts: Alert[]; title?: string }) {
  return (
    <ChartCard title={title}>
      {alerts.length === 0 ? (
        <div className="py-8 text-center text-xs text-primary-500">
          <p className="text-primary-500 font-medium">Aucune alerte active</p>
        </div>
      ) : (
        <div>
          {alerts.map((a, i) => <AlertItem key={i} {...a} />)}
        </div>
      )}
    </ChartCard>
  );
}
