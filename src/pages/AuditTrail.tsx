// Page Audit Trail — Journal des modifications
import { useState, useMemo } from 'react';
import { Download, Trash2 } from 'lucide-react';
import { saveAs } from 'file-saver';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { useApp } from '../store/app';
import { getAuditTrail, clearAuditTrail, exportAuditTrailCSV } from '../engine/auditLog';

const ACTION_LABELS: Record<string, string> = {
  create: 'Création', update: 'Modification', delete: 'Suppression',
  import: 'Import', export: 'Export', close_period: 'Clôture', open_period: 'Ouverture',
};

const ENTITY_LABELS: Record<string, string> = {
  gl: 'Grand Livre', account: 'Compte', period: 'Période', organization: 'Société',
  budget: 'Budget', report: 'Rapport', template: 'Modèle', attention_point: 'Point d\'attention', action_plan: 'Plan d\'action',
};

export default function AuditTrail() {
  const { currentOrgId } = useApp();
  const [filter, setFilter] = useState('');
  const [entityFilter, setEntityFilter] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  const entries = useMemo(() => getAuditTrail(currentOrgId, 500), [currentOrgId, refreshKey]);

  const filtered = useMemo(() => {
    let result = entries;
    if (filter) result = result.filter((e) => e.summary.toLowerCase().includes(filter.toLowerCase()) || e.action.includes(filter.toLowerCase()));
    if (entityFilter) result = result.filter((e) => e.entity === entityFilter);
    return result;
  }, [entries, filter, entityFilter]);

  const entities = Array.from(new Set(entries.map((e) => e.entity)));

  const handleExport = () => {
    const csv = exportAuditTrailCSV(currentOrgId);
    saveAs(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `AuditTrail_${new Date().toISOString().split('T')[0]}.csv`);
  };

  const handleClear = () => {
    if (confirm('Effacer tout le journal d\'audit ? Cette action est irréversible.')) {
      clearAuditTrail();
      setRefreshKey((k) => k + 1);
    }
  };

  return (
    <div>
      <PageHeader
        title="Journal d'audit"
        subtitle={`${filtered.length} entrée(s) enregistrée(s)`}
        action={
          <div className="flex gap-2">
            <button className="btn-outline" onClick={handleExport}><Download className="w-4 h-4" /> Export CSV</button>
            <button className="btn-outline" onClick={handleClear}><Trash2 className="w-4 h-4" /> Effacer</button>
          </div>
        }
      />

      <div className="flex flex-wrap gap-2 mb-4">
        <input className="input !w-auto !py-1.5 text-sm min-w-[200px]" placeholder="Rechercher..." value={filter} onChange={(e) => setFilter(e.target.value)} />
        <select className="input !w-auto !py-1.5 text-sm" value={entityFilter} onChange={(e) => setEntityFilter(e.target.value)}>
          <option value="">Toutes les entités</option>
          {entities.map((e) => <option key={e} value={e}>{ENTITY_LABELS[e] ?? e}</option>)}
        </select>
      </div>

      <Card padded={false}>
        {filtered.length === 0 ? (
          <div className="py-16 text-center text-primary-500 text-sm">
            Aucune entrée dans le journal. Les actions (imports, exports, modifications) seront enregistrées ici automatiquement.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-primary-100 dark:bg-primary-900">
                  <th className="text-left px-4 py-2 font-semibold">Date</th>
                  <th className="text-left px-4 py-2 font-semibold">Utilisateur</th>
                  <th className="text-left px-4 py-2 font-semibold">Action</th>
                  <th className="text-left px-4 py-2 font-semibold">Entité</th>
                  <th className="text-left px-4 py-2 font-semibold">Détail</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => (
                  <tr key={e.id} className="border-b border-primary-100 dark:border-primary-800 hover:bg-primary-50 dark:hover:bg-primary-900/50">
                    <td className="px-4 py-2 num text-primary-500 whitespace-nowrap">{new Date(e.date).toLocaleDateString('fr-FR')} {new Date(e.date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</td>
                    <td className="px-4 py-2">{e.user}</td>
                    <td className="px-4 py-2">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-primary-200 dark:bg-primary-800">{ACTION_LABELS[e.action] ?? e.action}</span>
                    </td>
                    <td className="px-4 py-2 text-primary-500">{ENTITY_LABELS[e.entity] ?? e.entity}</td>
                    <td className="px-4 py-2 text-primary-700 dark:text-primary-300 max-w-[400px] truncate">{e.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
