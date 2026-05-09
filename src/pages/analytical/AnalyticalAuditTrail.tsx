/**
 * T10 — Audit Trail Analytique
 *
 * Historique consolidé des modifications du module analytique :
 *   - Imports d'axes (kind = ANALYTIC_AXES)
 *   - Imports de codes (kind = ANALYTIC_CODES)
 *   - Affectations manuelles (méthode = manual)
 *   - Affectations automatiques (méthode = direct/label/account/journal/amount)
 *
 * Pas d'historique granulaire des modifications de codes/axes/règles dans
 * cette version — nécessite une table fna_analytic_audit dédiée (Phase 2).
 *
 * Vue tabulaire avec filtres : type d'événement, période, utilisateur.
 */
import { useEffect, useMemo, useState } from 'react';
import { ClipboardList, Download } from 'lucide-react';
import { PageHeader } from '../../components/layout/PageHeader';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { useApp } from '../../store/app';
import { dataProvider } from '../../db/provider';
import type { ImportLog, AnalyticAssignment } from '../../db/schema';

type EventType = 'import_axes' | 'import_codes' | 'assign_manual' | 'assign_auto';

interface AuditEvent {
  date: number;
  type: EventType;
  user: string;
  object: string;       // Description courte
  detail: string;       // Détails (count, file…)
  source?: string;
}

const TYPE_LABELS: Record<EventType, string> = {
  import_axes: 'Import axes',
  import_codes: 'Import codes',
  assign_manual: 'Affectation manuelle',
  assign_auto: 'Affectation automatique',
};

const TYPE_COLORS: Record<EventType, 'success' | 'accent' | 'warning' | 'default'> = {
  import_axes: 'accent',
  import_codes: 'accent',
  assign_manual: 'success',
  assign_auto: 'default',
};

export default function AnalyticalAuditTrail() {
  const { currentOrgId } = useApp();
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [typeFilter, setTypeFilter] = useState<'all' | EventType>('all');

  useEffect(() => {
    if (!currentOrgId) return;
    setLoading(true);
    void (async () => {
      try {
        const [imports, assignments] = await Promise.all([
          dataProvider.getImports(currentOrgId),
          dataProvider.getAnalyticAssignments(currentOrgId),
        ]);

        const out: AuditEvent[] = [];

        // Imports d'axes / codes
        for (const imp of imports as ImportLog[]) {
          if (imp.kind === 'ANALYTIC_AXES') {
            out.push({
              date: imp.date,
              type: 'import_axes',
              user: imp.user,
              object: 'Plan analytique — Axes',
              detail: `${imp.count} axe(s) traité(s) · ${imp.rejected} rejet(s) · statut ${imp.status}`,
              source: imp.fileName,
            });
          } else if (imp.kind === 'ANALYTIC_CODES') {
            out.push({
              date: imp.date,
              type: 'import_codes',
              user: imp.user,
              object: 'Plan analytique — Codes',
              detail: `${imp.count} code(s) traité(s) · ${imp.rejected} rejet(s) · statut ${imp.status}`,
              source: imp.fileName,
            });
          }
        }

        // Affectations (manuelles + automatiques agrégées par date+méthode)
        const byDateAndMethod = new Map<string, { date: number; method: string; count: number; ruleIds: Set<string> }>();
        for (const a of assignments as AnalyticAssignment[]) {
          const day = new Date(a.assignedAt).toISOString().substring(0, 10);
          const k = `${day}|${a.method}`;
          let bucket = byDateAndMethod.get(k);
          if (!bucket) {
            bucket = { date: a.assignedAt, method: a.method, count: 0, ruleIds: new Set() };
            byDateAndMethod.set(k, bucket);
          }
          bucket.count++;
          if (a.ruleId) bucket.ruleIds.add(a.ruleId);
          // Garde le timestamp le plus récent
          if (a.assignedAt > bucket.date) bucket.date = a.assignedAt;
        }
        for (const b of byDateAndMethod.values()) {
          if (b.method === 'manual') {
            out.push({
              date: b.date,
              type: 'assign_manual',
              user: 'Utilisateur',
              object: 'Affectation manuelle',
              detail: `${b.count} ligne(s) affectée(s) manuellement`,
            });
          } else {
            out.push({
              date: b.date,
              type: 'assign_auto',
              user: 'Système',
              object: `Règles automatiques — ${b.method}`,
              detail: `${b.count} ligne(s) affectée(s) · ${b.ruleIds.size} règle(s) appliquée(s)`,
            });
          }
        }

        out.sort((a, b) => b.date - a.date);
        setEvents(out);
      } finally {
        setLoading(false);
      }
    })();
  }, [currentOrgId]);

  const filtered = useMemo(() => {
    if (typeFilter === 'all') return events;
    return events.filter((e) => e.type === typeFilter);
  }, [events, typeFilter]);

  const stats = useMemo(() => ({
    total: events.length,
    imports: events.filter((e) => e.type === 'import_axes' || e.type === 'import_codes').length,
    manual: events.filter((e) => e.type === 'assign_manual').length,
    auto: events.filter((e) => e.type === 'assign_auto').length,
  }), [events]);

  const exportCsv = () => {
    const lines = ['Date;Type;Utilisateur;Objet;Détail;Source'];
    for (const e of filtered) {
      lines.push([
        new Date(e.date).toLocaleString('fr-FR'),
        TYPE_LABELS[e.type],
        e.user,
        e.object,
        e.detail.replace(/;/g, ','),
        e.source ?? '',
      ].join(';'));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'audit_trail_analytique.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="w-full space-y-4">
      <PageHeader
        title="T10 — Audit Trail analytique"
        subtitle="Historique des imports et affectations sur le module analytique"
        icon={<ClipboardList className="w-5 h-5" />}
        back="/dashboards"
        action={
          <button className="btn-outline text-sm" onClick={exportCsv} disabled={filtered.length === 0}>
            <Download className="w-4 h-4" /> Export CSV
          </button>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Total événements" value={stats.total.toString()} />
        <Stat label="Imports" value={stats.imports.toString()} />
        <Stat label="Affectations manuelles" value={stats.manual.toString()} />
        <Stat label="Affectations auto" value={stats.auto.toString()} />
      </div>

      <Card padded>
        <label className="text-[10px] uppercase tracking-wider text-primary-500 font-semibold block mb-1">Filtrer par type</label>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as 'all' | EventType)} className="input !w-auto">
          <option value="all">Tous les événements</option>
          <option value="import_axes">{TYPE_LABELS.import_axes}</option>
          <option value="import_codes">{TYPE_LABELS.import_codes}</option>
          <option value="assign_manual">{TYPE_LABELS.assign_manual}</option>
          <option value="assign_auto">{TYPE_LABELS.assign_auto}</option>
        </select>
      </Card>

      <Card title={`Événements (${filtered.length})`} padded={false}>
        {loading ? (
          <div className="py-12 text-center text-sm text-primary-500">Chargement…</div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-primary-400">Aucun événement enregistré.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-xs uppercase tracking-wider text-primary-500 border-b border-primary-200 dark:border-primary-800 bg-primary-50 dark:bg-primary-900/40">
                <tr>
                  <th className="text-left px-3 py-2">Date</th>
                  <th className="text-left px-3 py-2">Type</th>
                  <th className="text-left px-3 py-2">Utilisateur</th>
                  <th className="text-left px-3 py-2">Objet</th>
                  <th className="text-left px-3 py-2">Détail</th>
                  <th className="text-left px-3 py-2">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-primary-100 dark:divide-primary-800">
                {filtered.map((e, i) => (
                  <tr key={i} className="hover:bg-primary-50 dark:hover:bg-primary-900/40">
                    <td className="px-3 py-1.5 num">{new Date(e.date).toLocaleString('fr-FR')}</td>
                    <td className="px-3 py-1.5">
                      <Badge variant={TYPE_COLORS[e.type]}>{TYPE_LABELS[e.type]}</Badge>
                    </td>
                    <td className="px-3 py-1.5">{e.user}</td>
                    <td className="px-3 py-1.5 font-medium">{e.object}</td>
                    <td className="px-3 py-1.5 text-primary-600 dark:text-primary-400">{e.detail}</td>
                    <td className="px-3 py-1.5 font-mono text-[11px]">{e.source ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="text-[11px] text-primary-400 italic px-1">
        Note : audit granulaire des modifications de codes/axes/règles (avant/après) prévu Phase 2 via une table dédiée <code>fna_analytic_audit</code>.
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card padded>
      <p className="text-[10px] uppercase tracking-wider text-primary-500 font-semibold">{label}</p>
      <p className="num text-xl font-bold mt-1">{value}</p>
    </Card>
  );
}
