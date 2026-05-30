/* eslint-disable @typescript-eslint/no-explicit-any -- interop dynamique (parsers, payloads Supabase/Edge Functions, helpers Recharts). À typer finement au cas par cas. */
import { useState } from 'react';
import { safeLocalStorage } from '../../lib/safeStorage';
import { AlertTriangle, CheckCircle2, Cloud, Database, Download, Shield, Trash2, Upload } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Modal } from '../../components/ui/Modal';
import { toast } from '../../components/ui/Toast';
import { dataProvider } from '../../db/provider';
import { db } from '../../db/schema';
import { useCloudData, invalidateCloudData } from '../../hooks/useCloudData';
import { ensureSeeded } from '../../db/seed';
import { pushAllToSupabase, type PushAllProgress, type PushAllResult } from '../../db/supabaseSync';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { Row, Stat } from './helpers';

export function TabDonnees() {
  const [busy, setBusy] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const [syncRunning, setSyncRunning] = useState(false);
  const [syncProgress, setSyncProgress] = useState<PushAllProgress | null>(null);
  const [syncResult, setSyncResult] = useState<PushAllResult | null>(null);

  const { data: stats = { orgs: 0, periods: 0, gl: 0, accounts: 0, imports: 0, budgets: 0, templates: 0 } } = useCloudData(
    async () => {
      const orgs = await dataProvider.getOrganizations();
      let periods = 0, gl = 0, accounts = 0, imports = 0, budgets = 0, templates = 0;
      for (const o of orgs) {
        const [ps, glRows, accs, imps, buds, tpls] = await Promise.all([
          dataProvider.getPeriods(o.id),
          dataProvider.getGLEntries({ orgId: o.id }),
          dataProvider.getAccounts(o.id),
          dataProvider.getImports(o.id),
          dataProvider.getAllBudgets(o.id),
          dataProvider.getTemplates(o.id),
        ]);
        periods += ps.length; gl += glRows.length; accounts += accs.length;
        imports += imps.length; budgets += buds.length; templates += tpls.length;
      }
      return { orgs: orgs.length, periods, gl, accounts, imports, budgets, templates };
    },
    [],
    { initial: { orgs: 0, periods: 0, gl: 0, accounts: 0, imports: 0, budgets: 0, templates: 0 }, tag: ['organizations', 'gl', 'accounts', 'budgets', 'imports'] },
  );

  const runFullCloudSync = async () => {
    setSyncRunning(true);
    setSyncResult(null);
    setSyncProgress(null);
    try {
      const [dexieOrgs, cloudOrgs] = await Promise.all([
        db.organizations.toArray().catch(() => [] as any[]),
        dataProvider.getOrganizations().catch(() => [] as any[]),
      ]);
      const orgIdsSet = new Set<string>([
        ...dexieOrgs.map((o: any) => o.id),
        ...cloudOrgs.map((o: any) => o.id),
      ]);
      const orgIds = Array.from(orgIdsSet);
      if (orgIds.length === 0) {
        toast.error('Aucune société', 'Rien à synchroniser : aucune société locale ni cloud.');
        setSyncRunning(false);
        return;
      }
      const result = await pushAllToSupabase(orgIds, (p) => setSyncProgress(p));
      setSyncResult(result);
      const failed = result.details.filter((d) => !d.ok);
      if (failed.length === 0) {
        toast.success(
          'Migration cloud complète',
          `${result.totalRows.toLocaleString()} lignes poussées sur ${result.totalTables} tables en ${(result.duration / 1000).toFixed(1)}s.`,
        );
      } else {
        toast.error(
          'Migration partielle',
          `${failed.length} table(s) en erreur. Voir le détail dans la fenêtre.`,
        );
      }
    } catch (e: any) {
      toast.error('Erreur de synchronisation', e?.message ?? String(e));
    } finally {
      setSyncRunning(false);
    }
  };

  const exportDB = async () => {
    const orgs = await dataProvider.getOrganizations();
    const data: any = {
      version: 3, exportedAt: new Date().toISOString(),
      organizations: orgs,
      fiscalYears: [] as any[], periods: [] as any[], accounts: [] as any[],
      gl: [] as any[], imports: [] as any[], budgets: [] as any[],
      mappings: [] as any[], reports: [] as any[], templates: [] as any[],
    };
    for (const o of orgs) {
      const [fys, ps, accs, gl, imps, buds, maps, reps, tpls] = await Promise.all([
        dataProvider.getFiscalYears(o.id),
        dataProvider.getPeriods(o.id),
        dataProvider.getAccounts(o.id),
        dataProvider.getGLEntries({ orgId: o.id }),
        dataProvider.getImports(o.id),
        dataProvider.getAllBudgets(o.id),
        dataProvider.getMappings(o.id),
        dataProvider.getReports(o.id),
        dataProvider.getTemplates(o.id),
      ]);
      data.fiscalYears.push(...fys);
      data.periods.push(...ps);
      data.accounts.push(...accs);
      data.gl.push(...gl);
      data.imports.push(...imps);
      data.budgets.push(...buds);
      data.mappings.push(...maps);
      data.reports.push(...reps);
      data.templates.push(...tpls);
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `cockpit-backup-${new Date().toISOString().substring(0, 10)}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  const importDB = async (file: File) => {
    if (!confirm('Importer ajoutera/écrasera les données existantes. Continuer ?')) return;
    setBusy(true);
    try {
      const data = JSON.parse(await file.text());
      if (data.organizations) for (const o of data.organizations) await dataProvider.upsertOrganization(o);
      if (data.fiscalYears) await dataProvider.bulkUpsertFiscalYears(data.fiscalYears);
      if (data.periods) await dataProvider.bulkUpsertPeriods(data.periods);
      if (data.accounts) await dataProvider.bulkUpsertAccounts(data.accounts);
      if (data.mappings) for (const m of data.mappings) await dataProvider.upsertMapping(m);
      if (data.imports) for (const im of data.imports) {
        const { id: _i, ...rest } = im;
        await dataProvider.addImport(rest);
      }
      if (data.gl) {
        const stripped = data.gl.map(({ id: _i, ...r }: any) => r);
        await dataProvider.bulkInsertGL(stripped);
      }
      if (data.budgets) await dataProvider.bulkUpsertBudgets(data.budgets);
      if (data.reports) for (const r of data.reports) await dataProvider.upsertReport(r);
      if (data.templates) for (const t of data.templates) await dataProvider.upsertTemplate(t);
      ['organizations', 'fiscalYears', 'periods', 'accounts', 'gl', 'imports', 'budgets'].forEach((t) => invalidateCloudData(t));
      toast.success('Import terminé', 'Sauvegarde restaurée avec succès');
    } catch (e: any) { toast.error("Erreur d'import", e.message); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <Card title="Données locales" subtitle="IndexedDB — stockage navigateur">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <Stat label="Sociétés" value={stats.orgs} />
          <Stat label="Périodes" value={stats.periods} />
          <Stat label="Écritures GL" value={stats.gl} />
          <Stat label="Comptes" value={stats.accounts} />
          <Stat label="Imports" value={stats.imports} />
          <Stat label="Lignes budget" value={stats.budgets} />
          <Stat label="Modèles rapport" value={stats.templates} />
        </div>
        <div className="flex flex-wrap gap-2 pt-4 mt-4 border-t border-primary-200 dark:border-primary-800">
          <button className="btn-outline" onClick={exportDB} disabled={busy}><Download className="w-4 h-4" /> Exporter sauvegarde (JSON)</button>
          <label className="btn-outline cursor-pointer">
            <Upload className="w-4 h-4" /> Importer sauvegarde
            <input type="file" accept=".json" className="hidden" onChange={(e) => e.target.files?.[0] && importDB(e.target.files[0])} />
          </label>
          <button className="btn-outline" onClick={async () => { if (!confirm('Regénérer les données de démonstration ?')) return; setBusy(true); await ensureSeeded(); setBusy(false); toast.success('Données régénérées', 'Démo prête à être consultée'); }}>
            <Database className="w-4 h-4" /> Regénérer données démo
          </button>
        </div>
      </Card>

      <Card title="Migration cloud" subtitle="Pousser toutes les données locales vers Supabase (multi-device)">
        {!isSupabaseConfigured ? (
          <div className="flex items-start gap-3 p-3 rounded-lg bg-warning/10 border border-warning/30 text-sm">
            <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Supabase non configuré</p>
              <p className="text-xs text-primary-500 mt-1">
                Définissez <code>VITE_SUPABASE_URL</code> et <code>VITE_SUPABASE_ANON_KEY</code> pour activer la synchronisation.
              </p>
            </div>
          </div>
        ) : (
          <>
            <p className="text-sm text-primary-500 mb-3">
              Pousse toutes les sociétés, exercices, écritures, budgets, rapports, points d'attention,
              plans d'action, axes analytiques et messages chat vers le cloud Supabase. Indispensable
              avant la migration finale (abandon de Dexie).
            </p>
            <div className="flex flex-wrap gap-2">
              <button className="btn-primary" onClick={() => setSyncOpen(true)} disabled={busy || syncRunning}>
                <Cloud className="w-4 h-4" /> Sync complet vers le cloud
              </button>
              <button className="btn-outline" disabled={busy} onClick={async () => {
                setBusy(true);
                try {
                  const { data: sessionData } = await supabase.auth.getSession();
                  const userId = sessionData.session?.user?.id;
                  if (!userId) {
                    toast.error('Non connecté', 'Connectez-vous d\'abord à Supabase.');
                    return;
                  }
                  const dexieOrgs = await db.organizations.toArray().catch(() => [] as any[]);
                  const cloudOrgs = await dataProvider.getOrganizations().catch(() => [] as any[]);
                  const currentOrgId = (() => {
                    return safeLocalStorage.getItem('cockpit-current-org-id') ?? null;
                  })();
                  const orgIds = Array.from(new Set([
                    ...dexieOrgs.map((o: any) => o.id),
                    ...cloudOrgs.map((o: any) => o.id),
                    ...(currentOrgId ? [currentOrgId] : []),
                  ])).filter(Boolean);
                  if (orgIds.length === 0) {
                    toast.warning('Aucune société', 'Rien à réparer — créez d\'abord une société.');
                    return;
                  }
                  const rows = orgIds.map((oid) => ({ user_id: userId, org_id: oid, role: 'admin' as const }));
                  const { error } = await (supabase as any)
                    .from('fna_user_orgs')
                    .upsert(rows, { onConflict: 'user_id,org_id', ignoreDuplicates: true });
                  if (error) throw error;
                  invalidateCloudData('organizations');
                  toast.success(
                    'Accès réparé',
                    `${orgIds.length} société(s) associée(s) à votre compte. Réessayez l'import.`,
                  );
                } catch (e: any) {
                  toast.error('Erreur', e?.message ?? 'Impossible de réparer l\'accès cloud.');
                } finally { setBusy(false); }
              }}>
                <Shield className="w-4 h-4" /> Réparer l'accès cloud (RLS)
              </button>
              {syncResult && (
                <span className="text-xs text-primary-500 self-center">
                  Dernière sync : {syncResult.totalRows.toLocaleString()} lignes en {(syncResult.duration / 1000).toFixed(1)}s
                </span>
              )}
            </div>
            <p className="text-xs text-primary-500 mt-2">
              💡 Si l'import échoue avec « <em>row-level security policy</em> », cliquez sur
              <strong> Réparer l'accès cloud</strong> puis réessayez.
            </p>
          </>
        )}
      </Card>

      <Card title="Zone dangereuse" subtitle="Opérations irréversibles">
        <Row label="Réinitialiser toutes les données" hint="Supprime définitivement toutes les sociétés, écritures, budgets et rapports">
          <button className="btn text-error border border-error/30 hover:bg-error/10" onClick={() => setResetOpen(true)}>
            <Trash2 className="w-4 h-4" /> Réinitialiser
          </button>
        </Row>
      </Card>

      <Modal open={resetOpen} onClose={() => setResetOpen(false)} title="Réinitialiser toutes les données ?" subtitle="Cette action est irréversible"
        footer={<>
          <button className="btn-outline" onClick={() => setResetOpen(false)}>Annuler</button>
          <button className="btn text-primary-50 bg-error hover:bg-error/90" onClick={async () => {
            setBusy(true);
            const orgs = await dataProvider.getOrganizations();
            for (const o of orgs) await dataProvider.deleteOrganizationCascade(o.id);
            location.reload();
          }} disabled={busy}>
            {busy ? 'Suppression…' : 'Confirmer la suppression'}
          </button>
        </>}>
        <div className="flex items-start gap-3 p-4 bg-error/10 rounded-lg">
          <AlertTriangle className="w-5 h-5 text-primary-500 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-error">Toutes les données locales seront effacées.</p>
            <p className="text-xs text-primary-500 mt-2">L'application rechargera et regénérera les données de démonstration.</p>
          </div>
        </div>
      </Modal>

      <Modal
        open={syncOpen}
        onClose={() => { if (!syncRunning) { setSyncOpen(false); setSyncResult(null); setSyncProgress(null); } }}
        title="Sync complet vers le cloud"
        subtitle="Migration finale Dexie → Supabase"
        footer={<>
          {!syncRunning && !syncResult && (
            <>
              <button className="btn-outline" onClick={() => setSyncOpen(false)}>Annuler</button>
              <button className="btn-primary" onClick={runFullCloudSync}>
                <Cloud className="w-4 h-4" /> Lancer la synchronisation
              </button>
            </>
          )}
          {syncRunning && (
            <button className="btn-outline" disabled>
              Synchronisation en cours…
            </button>
          )}
          {!syncRunning && syncResult && (
            <button className="btn-primary" onClick={() => { setSyncOpen(false); setSyncResult(null); setSyncProgress(null); }}>
              Fermer
            </button>
          )}
        </>}
      >
        {!syncRunning && !syncResult && (
          <div className="space-y-3 text-sm">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-primary-50 dark:bg-primary-900/30">
              <Cloud className="w-4 h-4 text-primary-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Que va-t-il se passer ?</p>
                <ul className="list-disc list-inside text-xs text-primary-500 mt-1 space-y-0.5">
                  <li>Toutes les données de toutes les sociétés locales seront poussées vers Supabase.</li>
                  <li>Les lignes existantes côté cloud seront mises à jour (upsert) ou complétées.</li>
                  <li>L'opération peut prendre plusieurs minutes selon le volume de Grand Livre.</li>
                  <li>Vos données locales restent intactes — elles ne sont pas supprimées.</li>
                </ul>
              </div>
            </div>
            <div className="text-xs text-primary-500">
              Sociétés à synchroniser : <strong>{stats.orgs}</strong> · Écritures GL : <strong>{stats.gl.toLocaleString()}</strong> · Lignes budget : <strong>{stats.budgets.toLocaleString()}</strong>
            </div>
          </div>
        )}

        {syncRunning && syncProgress && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{syncProgress.step}</span>
              <span className="text-xs text-primary-500">
                {syncProgress.current} / {syncProgress.total}
              </span>
            </div>
            <div className="h-2 rounded-full bg-primary-100 dark:bg-primary-900 overflow-hidden">
              <div
                className="h-full bg-accent-500 transition-all"
                style={{ width: `${(syncProgress.current / syncProgress.total) * 100}%` }}
              />
            </div>
            <div className="text-xs text-primary-500">
              Table : <code>{syncProgress.table}</code> · Lignes poussées : {syncProgress.rowsPushed.toLocaleString()}
            </div>
          </div>
        )}

        {!syncRunning && syncResult && (
          <div className="space-y-3 text-sm">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-success/10 border border-success/30">
              <CheckCircle2 className="w-4 h-4 text-success shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Synchronisation terminée</p>
                <p className="text-xs text-primary-500 mt-1">
                  {syncResult.totalRows.toLocaleString()} lignes poussées sur {syncResult.totalTables} tables en {(syncResult.duration / 1000).toFixed(1)}s.
                </p>
              </div>
            </div>
            <div className="max-h-64 overflow-y-auto border border-primary-200 dark:border-primary-800 rounded-lg">
              <table className="w-full text-xs">
                <thead className="bg-primary-50 dark:bg-primary-900/30 sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Table</th>
                    <th className="text-right px-3 py-2 font-medium">Lignes</th>
                    <th className="text-left px-3 py-2 font-medium">État</th>
                  </tr>
                </thead>
                <tbody>
                  {syncResult.details.map((d) => (
                    <tr key={d.table} className="border-t border-primary-100 dark:border-primary-800/50">
                      <td className="px-3 py-1.5 font-mono">{d.table}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{d.rows.toLocaleString()}</td>
                      <td className="px-3 py-1.5">
                        {d.ok ? (
                          <span className="text-success">OK</span>
                        ) : (
                          <span className="text-error" title={d.error}>Erreur</span>
                        )}
                        {d.error && (
                          <span className="text-[10px] text-primary-500 block truncate max-w-xs">{d.error}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
