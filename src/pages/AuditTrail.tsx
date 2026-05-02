/**
 * Page Audit Trail — Journal d'audit Big4-grade.
 *
 * Fonctionnalités :
 * - Stats : total, dernieres 24h / 7j / 30j, top users, top actions
 * - Filtres : recherche full-text, action, entite, user, plage de dates
 * - Vérification intégrité chaine SHA-256 (1 clic)
 * - Détail par entrée : payload complet + hash + previousHash
 * - Export CSV / JSON
 */
import { useState, useMemo, useEffect } from 'react';
import { Download, Trash2, Shield, ShieldCheck, ShieldAlert, Activity, Users as UsersIcon, FileText, Search as SearchIcon, Eye, RefreshCw, FileJson } from 'lucide-react';
import { saveAs } from 'file-saver';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Modal } from '../components/ui/Modal';
import { useApp } from '../store/app';
import {
  getAuditTrail, clearAuditTrail, exportAuditTrailCSV, exportAuditTrailJSON,
  verifyChainIntegrity, audit, type AuditEntry, type AuditAction, type AuditEntity,
} from '../engine/auditLog';
import { toast } from '../components/ui/Toast';

const ACTION_LABELS: Record<string, string> = {
  create: 'Création', update: 'Modification', delete: 'Suppression',
  import: 'Import', export: 'Export',
  close_period: 'Clôture', open_period: 'Réouverture',
  invite: 'Invitation', revoke: 'Révocation',
  login: 'Connexion', logout: 'Déconnexion',
  settings_change: 'Paramètres', reset: 'Reset',
  send_email: 'Email envoyé',
};

const ENTITY_LABELS: Record<string, string> = {
  gl: 'Grand Livre', account: 'Compte', period: 'Période', organization: 'Société',
  budget: 'Budget', report: 'Rapport', template: 'Modèle',
  attention_point: "Point d'attention", action_plan: "Plan d'action",
  user: 'Utilisateur', token: 'API Token', webhook: 'Webhook',
  settings: 'Paramètres', email: 'Email', import: 'Import', fiscal_year: 'Exercice',
};

const ACTION_COLORS: Record<string, string> = {
  create: 'bg-success/10 text-success border-success/30',
  update: 'bg-warning/10 text-warning border-warning/30',
  delete: 'bg-danger/10 text-danger border-danger/30',
  import: 'bg-info/10 text-info border-info/30',
  export: 'bg-info/10 text-info border-info/30',
  close_period: 'bg-primary-200 dark:bg-primary-800',
  open_period: 'bg-primary-200 dark:bg-primary-800',
  invite: 'bg-success/10 text-success border-success/30',
  revoke: 'bg-danger/10 text-danger border-danger/30',
  login: 'bg-primary-200 dark:bg-primary-800',
  logout: 'bg-primary-200 dark:bg-primary-800',
  settings_change: 'bg-warning/10 text-warning border-warning/30',
  reset: 'bg-danger/10 text-danger border-danger/30',
  send_email: 'bg-info/10 text-info border-info/30',
};

export default function AuditTrail() {
  const { currentOrgId } = useApp();
  const [filter, setFilter] = useState('');
  const [actionFilter, setActionFilter] = useState<AuditAction | ''>('');
  const [entityFilter, setEntityFilter] = useState<AuditEntity | ''>('');
  const [userFilter, setUserFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [detail, setDetail] = useState<AuditEntry | null>(null);
  const [chainStatus, setChainStatus] = useState<{ valid: boolean; brokenAt: number | null; total: number } | null>(null);
  const [verifying, setVerifying] = useState(false);

  const entries = useMemo(() => getAuditTrail(currentOrgId, 5000), [currentOrgId, refreshKey]);

  // Genere des entrees demo si journal vide (uniquement la 1ere fois pour montrer le format)
  useEffect(() => {
    if (entries.length === 0 && currentOrgId) {
      void audit.login(currentOrgId, 'system@cockpit-fna.app');
      setTimeout(() => setRefreshKey((k) => k + 1), 100);
    }
  }, []); // eslint-disable-line

  const filtered = useMemo(() => {
    let result = entries;
    if (filter) {
      const q = filter.toLowerCase();
      result = result.filter((e) =>
        e.summary.toLowerCase().includes(q) ||
        e.action.includes(q) ||
        e.user.toLowerCase().includes(q) ||
        (e.entityId ?? '').toLowerCase().includes(q),
      );
    }
    if (actionFilter) result = result.filter((e) => e.action === actionFilter);
    if (entityFilter) result = result.filter((e) => e.entity === entityFilter);
    if (userFilter) result = result.filter((e) => e.user === userFilter);
    if (dateFrom) {
      const ts = new Date(dateFrom).getTime();
      result = result.filter((e) => e.date >= ts);
    }
    if (dateTo) {
      const ts = new Date(dateTo).getTime() + 86399999; // fin de journee
      result = result.filter((e) => e.date <= ts);
    }
    return result;
  }, [entries, filter, actionFilter, entityFilter, userFilter, dateFrom, dateTo]);

  // Stats
  const now = Date.now();
  const stats = useMemo(() => {
    const last24h = entries.filter((e) => now - e.date < 86_400_000).length;
    const last7d = entries.filter((e) => now - e.date < 7 * 86_400_000).length;
    const last30d = entries.filter((e) => now - e.date < 30 * 86_400_000).length;
    const userCounts: Record<string, number> = {};
    const actionCounts: Record<string, number> = {};
    for (const e of entries) {
      userCounts[e.user] = (userCounts[e.user] ?? 0) + 1;
      actionCounts[e.action] = (actionCounts[e.action] ?? 0) + 1;
    }
    const topUsers = Object.entries(userCounts).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const topActions = Object.entries(actionCounts).sort((a, b) => b[1] - a[1]).slice(0, 3);
    return { last24h, last7d, last30d, topUsers, topActions };
  }, [entries, now]);

  const uniqueUsers = useMemo(() => Array.from(new Set(entries.map((e) => e.user))).sort(), [entries]);
  const uniqueActions = useMemo(() => Array.from(new Set(entries.map((e) => e.action))).sort(), [entries]);
  const uniqueEntities = useMemo(() => Array.from(new Set(entries.map((e) => e.entity))).sort(), [entries]);

  const verifyChain = async () => {
    setVerifying(true);
    setChainStatus(null);
    try {
      const result = await verifyChainIntegrity(currentOrgId);
      setChainStatus(result);
      if (result.valid) {
        toast.success('Chaîne intègre', `${result.total} entrée(s) vérifiée(s) — aucune altération détectée`);
      } else {
        toast.error('Chaîne corrompue', `Altération détectée à l'entrée #${result.brokenAt}`);
      }
    } finally {
      setVerifying(false);
    }
  };

  const handleExportCSV = () => {
    const csv = exportAuditTrailCSV(currentOrgId);
    saveAs(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `AuditTrail_${new Date().toISOString().split('T')[0]}.csv`);
    toast.success('Export CSV', `${filtered.length} entrée(s) exportée(s)`);
  };

  const handleExportJSON = () => {
    const json = exportAuditTrailJSON(currentOrgId);
    saveAs(new Blob([json], { type: 'application/json' }), `AuditTrail_${new Date().toISOString().split('T')[0]}.json`);
    toast.success('Export JSON', `${filtered.length} entrée(s) exportée(s) avec hashes complets`);
  };

  const handleClear = () => {
    if (confirm('Effacer tout le journal d\'audit ? Cette action est irréversible et casse la chaîne d\'intégrité.')) {
      clearAuditTrail();
      setRefreshKey((k) => k + 1);
      setChainStatus(null);
      toast.success('Journal effacé');
    }
  };

  const resetFilters = () => {
    setFilter('');
    setActionFilter('');
    setEntityFilter('');
    setUserFilter('');
    setDateFrom('');
    setDateTo('');
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Journal d'audit"
        subtitle={`${filtered.length} / ${entries.length} entrée(s) — chaîne SHA-256 vérifiable`}
        action={
          <div className="flex gap-2">
            <button className="btn-outline" onClick={() => setRefreshKey((k) => k + 1)} title="Rafraîchir">
              <RefreshCw className="w-4 h-4" />
            </button>
            <button className="btn-outline" onClick={handleExportCSV}><Download className="w-4 h-4" /> CSV</button>
            <button className="btn-outline" onClick={handleExportJSON}><FileJson className="w-4 h-4" /> JSON</button>
            <button className="btn-outline" onClick={handleClear}><Trash2 className="w-4 h-4" /> Effacer</button>
          </div>
        }
      />

      {/* Stats grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <StatCard icon={Activity} label="Total" value={entries.length} subtext={`${stats.last30d} sur 30 j`} />
        <StatCard icon={Activity} label="Dernières 24h" value={stats.last24h} subtext={stats.last7d > 0 ? `${stats.last7d} sur 7 j` : '—'} />
        <StatCard icon={UsersIcon} label="Top utilisateurs" subtext={stats.topUsers.length > 0 ? '' : 'Aucun'} list={stats.topUsers.map(([u, c]) => `${u} (${c})`)} />
        <StatCard icon={FileText} label="Top actions" subtext={stats.topActions.length > 0 ? '' : 'Aucune'} list={stats.topActions.map(([a, c]) => `${ACTION_LABELS[a] ?? a} (${c})`)} />
      </div>

      {/* Chaine d'integrite */}
      <Card padded>
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
            chainStatus === null ? 'bg-primary-100 dark:bg-primary-800 text-primary-500' :
            chainStatus.valid ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'
          }`}>
            {chainStatus === null ? <Shield className="w-5 h-5" /> :
             chainStatus.valid ? <ShieldCheck className="w-5 h-5" /> : <ShieldAlert className="w-5 h-5" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold mb-0.5">Chaîne d'intégrité SHA-256</p>
            <p className="text-xs text-primary-500 leading-relaxed">
              {chainStatus === null
                ? "Chaque entrée contient le hash SHA-256 de la précédente. Toute modification d'une entrée passée casserait la chaîne — preuve cryptographique d'intégrité (conforme exigences Big4)."
                : chainStatus.valid
                  ? `✓ ${chainStatus.total} entrée(s) vérifiée(s). Aucune altération détectée.`
                  : `✗ Altération détectée à l'entrée #${chainStatus.brokenAt}. Le journal a été modifié manuellement.`}
            </p>
          </div>
          <button className="btn-primary shrink-0" onClick={verifyChain} disabled={verifying || entries.length === 0}>
            <Shield className="w-4 h-4" /> {verifying ? 'Vérification…' : 'Vérifier la chaîne'}
          </button>
        </div>
      </Card>

      {/* Filtres */}
      <Card padded>
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <SearchIcon className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-primary-400 pointer-events-none" />
            <input className="input !pl-8 !py-1.5 text-sm w-full" placeholder="Rechercher (résumé, user, ID…)" value={filter} onChange={(e) => setFilter(e.target.value)} />
          </div>
          <select className="input !w-auto !py-1.5 text-sm" value={actionFilter} onChange={(e) => setActionFilter(e.target.value as AuditAction)}>
            <option value="">Toutes actions</option>
            {uniqueActions.map((a) => <option key={a} value={a}>{ACTION_LABELS[a] ?? a}</option>)}
          </select>
          <select className="input !w-auto !py-1.5 text-sm" value={entityFilter} onChange={(e) => setEntityFilter(e.target.value as AuditEntity)}>
            <option value="">Toutes entités</option>
            {uniqueEntities.map((e) => <option key={e} value={e}>{ENTITY_LABELS[e] ?? e}</option>)}
          </select>
          <select className="input !w-auto !py-1.5 text-sm" value={userFilter} onChange={(e) => setUserFilter(e.target.value)}>
            <option value="">Tous utilisateurs</option>
            {uniqueUsers.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
          <input type="date" className="input !w-auto !py-1.5 text-sm" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} title="Du" />
          <input type="date" className="input !w-auto !py-1.5 text-sm" value={dateTo} onChange={(e) => setDateTo(e.target.value)} title="Au" />
          {(filter || actionFilter || entityFilter || userFilter || dateFrom || dateTo) && (
            <button className="btn-ghost !py-1.5" onClick={resetFilters}>Réinitialiser</button>
          )}
        </div>
      </Card>

      {/* Table */}
      <Card padded={false}>
        {filtered.length === 0 ? (
          <div className="py-16 text-center text-primary-500 text-sm">
            <Activity className="w-10 h-10 mx-auto mb-2 opacity-50" />
            <p className="mb-1">Aucune entrée correspondant aux filtres.</p>
            <p className="text-xs">Les actions (imports, exports, modifications, connexions, envois d'emails…) sont enregistrées automatiquement.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-primary-100 dark:bg-primary-900 sticky top-0">
                  <th className="text-left px-4 py-2 font-semibold">Date</th>
                  <th className="text-left px-4 py-2 font-semibold">Utilisateur</th>
                  <th className="text-left px-4 py-2 font-semibold">Action</th>
                  <th className="text-left px-4 py-2 font-semibold">Entité</th>
                  <th className="text-left px-4 py-2 font-semibold">Détail</th>
                  <th className="text-left px-4 py-2 font-semibold">Hash</th>
                  <th className="text-right px-4 py-2 font-semibold w-10"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => (
                  <tr key={e.id} className="border-b border-primary-100 dark:border-primary-800 hover:bg-primary-50 dark:hover:bg-primary-900/50 transition-colors">
                    <td className="px-4 py-2 num text-primary-500 whitespace-nowrap">
                      {new Date(e.date).toLocaleDateString('fr-FR')} <span className="text-primary-400">{new Date(e.date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                    </td>
                    <td className="px-4 py-2 font-medium truncate max-w-[160px]" title={e.user}>{e.user}</td>
                    <td className="px-4 py-2">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${ACTION_COLORS[e.action] ?? 'bg-primary-200 dark:bg-primary-800'}`}>
                        {ACTION_LABELS[e.action] ?? e.action}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-primary-500">{ENTITY_LABELS[e.entity] ?? e.entity}</td>
                    <td className="px-4 py-2 text-primary-700 dark:text-primary-300 max-w-[400px] truncate" title={e.summary}>{e.summary}</td>
                    <td className="px-4 py-2 text-primary-400 font-mono text-[10px]">{e.hash?.slice(0, 8) ?? '—'}…</td>
                    <td className="px-2 py-2 text-right">
                      <button className="btn-ghost !p-1.5" onClick={() => setDetail(e)} title="Voir détail">
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Detail modal */}
      {detail && <DetailModal entry={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, subtext, list }: {
  icon: any; label: string; value?: number | string; subtext?: string; list?: string[];
}) {
  return (
    <Card padded>
      <div className="flex items-start gap-2.5">
        <div className="w-9 h-9 rounded-xl bg-accent/10 flex items-center justify-center text-accent shrink-0">
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-primary-500 font-semibold">{label}</p>
          {value !== undefined && <p className="text-xl font-bold tabular-nums">{value}</p>}
          {list && list.length > 0 ? (
            <ul className="text-[11px] text-primary-700 dark:text-primary-300 mt-0.5 space-y-0.5">
              {list.map((l, i) => <li key={i} className="truncate" title={l}>{l}</li>)}
            </ul>
          ) : (
            subtext && <p className="text-[11px] text-primary-500 mt-0.5">{subtext}</p>
          )}
        </div>
      </div>
    </Card>
  );
}

function DetailModal({ entry, onClose }: { entry: AuditEntry; onClose: () => void }) {
  const details = useMemo(() => {
    if (!entry.details) return null;
    try { return JSON.parse(entry.details); } catch { return entry.details; }
  }, [entry.details]);

  return (
    <Modal open onClose={onClose} size="lg" title="Détail de l'entrée d'audit" subtitle={new Date(entry.date).toLocaleString('fr-FR')}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Utilisateur" value={entry.user} />
          <Field label="Date" value={new Date(entry.date).toLocaleString('fr-FR')} />
          <Field label="Action" value={ACTION_LABELS[entry.action] ?? entry.action} />
          <Field label="Entité" value={ENTITY_LABELS[entry.entity] ?? entry.entity} />
          {entry.entityId && <Field label="ID Entité" value={entry.entityId} mono />}
          <Field label="Société (orgId)" value={entry.orgId} mono />
        </div>

        <div>
          <p className="text-[10px] uppercase tracking-wider text-primary-500 font-semibold mb-1">Résumé</p>
          <p className="text-sm bg-primary-100 dark:bg-primary-800 p-3 rounded-lg">{entry.summary}</p>
        </div>

        {details && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-primary-500 font-semibold mb-1">Détails (payload)</p>
            <pre className="text-[11px] bg-primary-950 text-primary-100 p-3 rounded-lg overflow-x-auto">
              {typeof details === 'string' ? details : JSON.stringify(details, null, 2)}
            </pre>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 border-t border-primary-200 dark:border-primary-800 pt-4">
          <p className="text-[10px] uppercase tracking-wider text-primary-500 font-semibold">Chaîne de hashes SHA-256</p>
          <Field label="Hash de cette entrée" value={entry.hash ?? '—'} mono full />
          <Field label="Hash précédent" value={entry.previousHash ?? '(genesis — première entrée)'} mono full />
        </div>
      </div>
    </Modal>
  );
}

function Field({ label, value, mono, full }: { label: string; value: string; mono?: boolean; full?: boolean }) {
  return (
    <div className={full ? 'col-span-2' : ''}>
      <p className="text-[10px] uppercase tracking-wider text-primary-500 font-semibold mb-0.5">{label}</p>
      <p className={`text-xs ${mono ? 'font-mono break-all' : ''}`}>{value}</p>
    </div>
  );
}
