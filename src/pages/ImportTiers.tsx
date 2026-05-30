/* eslint-disable @typescript-eslint/no-explicit-any -- interop dynamique (parsers, payloads Supabase/Edge Functions, helpers Recharts). À typer finement au cas par cas. */
import { useState, useEffect, useCallback } from 'react';
import { CheckCircle2, Download, FileWarning, Link2, RefreshCw, Trash2, XCircle, Users, Search, AlertTriangle, X } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { toast } from '../components/ui/Toast';
import { PageHeader } from '../components/layout/PageHeader';
import { useApp } from '../store/app';
import { type TiersUnmatched, type GLEntry } from '../db/schema';
import { dataProvider } from '../db/provider';
import { invalidateCloudData } from '../hooks/useCloudData';
import { useCurrentOrg, useImportsHistory } from '../hooks/useFinancials';
import { detectTiersColumns, importGLTiersBatch, migrateGLPeriods, resyncAccountLabels, parseFile, TiersMapping, TiersImportReport, computeFileHash, findDuplicateImport } from '../engine/importer';
import { downloadTiersTemplate } from '../engine/templates';
import { fmtFull } from '../lib/format';
import { Shield } from 'lucide-react';

const sources = ['SAGE', 'PERFECTO', 'SAARI', 'CEGID', 'ODOO', 'SAP', 'CSV générique', 'Excel'];

const controls = [
  'Rapprochement GL général ↔ GL tiers',
  'Pas de doublons (enrichissement, pas de création)',
  'Cohérence soldes GL vs Tiers par compte collectif',
  'Détection des tiers sans correspondance GL',
  'Validation codes tiers et noms',
  'Mode standalone si GL absent',
];

const tiersFieldLabels: Record<string, string> = {
  date: 'Date',
  account: 'Compte général (411/401)',
  codeTiers: 'Code tiers',
  labelTiers: 'Nom du tiers',
  debit: 'Débit',
  credit: 'Crédit',
  journal: 'Journal',
  piece: 'N° pièce',
  label: 'Libellé écriture',
};

export default function ImportTiers({ embedded = false }: { embedded?: boolean } = {}) {
  const { currentOrgId, currentYear } = useApp();
  const org = useCurrentOrg();
  const history = useImportsHistory(currentOrgId, 'TIERS');
  const glHistory = useImportsHistory(currentOrgId, 'GL');
  const [step, setStep] = useState<'idle' | 'mapping' | 'result'>('idle');
  const [file, setFile] = useState<File | null>(null);
  // Fichiers additionnels pour import multi-fichiers (1er reste dans `file` pour
  // détecter le mapping ; les autres seront traités avec le même mapping).
  const [extraFiles, setExtraFiles] = useState<File[]>([]);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number; name: string } | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Partial<TiersMapping>>({});
  const [source, setSource] = useState('CSV générique');
  const [report, setReport] = useState<TiersImportReport | null>(null);
  const [loading, setLoading] = useState(false);

  const hasGL = glHistory.length > 0;
  const [tiersTab, setTiersTab] = useState<'all' | 'clients' | 'fournisseurs' | 'personnel' | 'etat' | 'autres'>('all');

  // Lignes non rapprochées en attente de revue manuelle
  const [unmatchedRows, setUnmatchedRows] = useState<TiersUnmatched[]>([]);
  const [matchModalRow, setMatchModalRow] = useState<TiersUnmatched | null>(null);
  const loadUnmatched = useCallback(async () => {
    if (!currentOrgId) return;
    try {
      const rows = await dataProvider.getTiersUnmatched(currentOrgId, { onlyPending: true });
      setUnmatchedRows(rows);
    } catch (e) {
      console.warn('[ImportTiers] getTiersUnmatched failed:', e);
    }
  }, [currentOrgId]);
  useEffect(() => { void loadUnmatched(); }, [loadUnmatched, report]);

  const dismissUnmatched = async (id: number) => {
    try {
      await dataProvider.updateTiersUnmatched(id, {
        resolvedAt: Date.now(),
        resolution: 'dismissed',
      });
      await loadUnmatched();
      toast.success('Ligne ignorée');
    } catch (e: any) {
      toast.error('Erreur', e.message);
    }
  };

  const deleteUnmatched = async (id: number) => {
    if (!confirm('Supprimer définitivement cette ligne non rapprochée ?')) return;
    try {
      await dataProvider.deleteTiersUnmatched(id);
      await loadUnmatched();
    } catch (e: any) {
      toast.error('Erreur', e.message);
    }
  };

  // Accepte 1 ou plusieurs fichiers. Le 1er est utilisé pour le mapping
  // (détection des colonnes) ; les autres seront traités avec le même mapping.
  const onFiles = async (fs: File[]) => {
    if (fs.length === 0) return;
    const [first, ...rest] = fs;
    setFile(first);
    setExtraFiles(rest);
    setLoading(true);
    try {
      const { headers } = await parseFile(first);
      setHeaders(headers);
      setMapping(detectTiersColumns(headers));
      setStep('mapping');
    } catch (e: any) {
      toast.error('Lecture du fichier impossible', e.message);
    } finally {
      setLoading(false);
    }
  };

  const runImport = async () => {
    if (!file) return;
    const required: (keyof TiersMapping)[] = ['date', 'account', 'codeTiers', 'labelTiers', 'debit', 'credit'];
    for (const k of required) {
      if (!mapping[k]) { toast.warning('Colonne manquante', `Le champ "${tiersFieldLabels[k]}" n'a pas été mappé`); return; }
    }
    setLoading(true);
    setBatchProgress(null);
    try {
      // Vérification auth AVANT toute opération DB : si la session a expiré,
      // les INSERT échouent avec "permission denied for table fna_imports"
      // (le client tombe en anon, qui n'a que SELECT). Erreur cryptique pour
      // l'utilisateur — on intercepte et on propose une re-connexion.
      const { supabase } = await import('../lib/supabase');
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session) {
        toast.error(
          'Session expirée',
          'Votre session a expiré. Cliquez sur "Se déconnecter" puis reconnectez-vous pour relancer l\'import.',
        );
        setLoading(false);
        return;
      }
      const allFiles = [file, ...extraFiles];
      // Détection de doublon : vérifier chaque fichier contre l'historique
      // (hash SHA-256). En mode multi-fichiers, on alerte pour TOUS les
      // doublons trouvés en une fois.
      const duplicates: string[] = [];
      for (const f of allFiles) {
        const h = await computeFileHash(f);
        const dup = await findDuplicateImport(currentOrgId, h, 'TIERS');
        if (dup) {
          duplicates.push(`• "${f.name}" → déjà importé le ${new Date(dup.date).toLocaleDateString('fr-FR')} (${dup.count} lignes)`);
        }
      }
      if (duplicates.length > 0) {
        const ok = confirm(
          `⚠ ${duplicates.length} fichier(s) déjà importé(s) :\n\n${duplicates.join('\n')}\n\n` +
          `Continuer peut créer des enrichissements redondants. Recommandation : supprimer d'abord les anciens imports via l'historique.\n\n` +
          `Continuer quand même ?`,
        );
        if (!ok) { setLoading(false); return; }
      }
      const res = await importGLTiersBatch(
        allFiles,
        mapping as TiersMapping,
        { orgId: currentOrgId, user: 'Utilisateur local', source },
        allFiles.length > 1
          ? (current, total, name) => setBatchProgress({ current, total, name })
          : undefined,
      );
      setReport(res);
      setStep('result');
      if (res.enriched > 0 || res.unmatched > 0) {
        const filesPart = allFiles.length > 1 ? ` (${allFiles.length} fichiers)` : '';
        toast.success(`Import tiers terminé${filesPart}`, `${res.enriched} enrichies · ${res.unmatched} non rapprochées`);
      }
    } catch (e: any) {
      toast.error("Erreur d'import", e.message);
    } finally {
      setLoading(false);
      setBatchProgress(null);
    }
  };

  const reset = () => { setStep('idle'); setFile(null); setExtraFiles([]); setHeaders([]); setMapping({}); setReport(null); setBatchProgress(null); };

  const deleteImport = async (imp: typeof history[number]) => {
    if (!confirm(`Supprimer l'import tiers "${imp.fileName}" et ses écritures créées en standalone ?`)) return;
    try {
      // 1) Supprimer les écritures GL standalone créées par cet import
      //    (cas des anciens imports avant le fix "no_standalone").
      await dataProvider.deleteGLByImport(Number(imp.id));
      // 2) Supprimer les lignes non rapprochées persistées
      await dataProvider.deleteTiersUnmatchedByImport(Number(imp.id));
      // 3) Supprimer l'import lui-même
      await dataProvider.deleteImport(Number(imp.id));
      invalidateCloudData('gl');
      invalidateCloudData('imports');
      await loadUnmatched();
      toast.success('Import supprimé');
    } catch (e: any) {
      toast.error('Suppression impossible', e.message);
    }
  };

  // Diagnostic tiers : inspecter les écritures d'un code tiers
  const diagnosticTiers = async () => {
    const code = prompt('Diagnostic — entrez un code tiers ou un préfixe de compte (ex: CLI001, 411) :');
    if (!code) return;
    // FIX : dataProvider (Supabase paginé) au lieu de db.gl (Dexie vide)
    const entries = await dataProvider.getGLEntries({ orgId: currentOrgId });
    const filtered = entries.filter((e) =>
      (e.tiers && e.tiers.toUpperCase().includes(code.toUpperCase())) ||
      e.account.startsWith(code)
    );
    if (filtered.length === 0) {
      toast.info('Aucun résultat', `Aucune écriture trouvée pour "${code}"`);
      return;
    }
    // Regrouper par tiers
    const byTiers = new Map<string, { count: number; debit: number; credit: number; accounts: Set<string> }>();
    for (const e of filtered) {
      const key = e.tiers || e.account;
      const cur = byTiers.get(key) ?? { count: 0, debit: 0, credit: 0, accounts: new Set() };
      cur.count++;
      cur.debit += e.debit;
      cur.credit += e.credit;
      cur.accounts.add(e.account);
      byTiers.set(key, cur);
    }
    const lines = [`Diagnostic tiers "${code}" — ${filtered.length} écriture(s)`, ''];
    for (const [k, v] of Array.from(byTiers.entries()).sort()) {
      const solde = v.debit - v.credit;
      lines.push(`${k} : ${v.count} écr. | D=${fmtFull(v.debit)} C=${fmtFull(v.credit)} | Solde=${fmtFull(solde)} | Comptes: ${[...v.accounts].join(', ')}`);
    }
    console.log(lines.join('\n'));
    toast.info(`Diagnostic "${code}"`, `${filtered.length} écritures · ${byTiers.size} tiers distincts — voir console (F12)`);
  };

  // Statistiques tiers actuelles
  // tabKey = identifiant onglet (clients/fournisseurs/personnel/etat/autres)
  // match  = fonction qui dit si un compte appartient à cette catégorie
  //          (permet de gérer 43-44 et 45-48 comme catégories combinées)
  type TiersCat = {
    label: string;
    tabKey: 'clients' | 'fournisseurs' | 'personnel' | 'etat' | 'autres';
    accountRanges: string; // label humain : "411", "401", "42", "43-44", "45-48"
    count: number;
    entries: number;
    top: Array<{ code: string; label: string; solde: number }>;
  };
  const [tiersStats, setTiersStats] = useState<{ total: number; cats: TiersCat[] } | null>(null);
  const refreshStats = useCallback(async () => {
    if (!currentOrgId) return;
    const entries = await dataProvider.getGLEntries({ orgId: currentOrgId });
    const withTiers = entries.filter((e) => !!e.tiers);
    const aggregate = (arr: typeof entries) => {
      const map = new Map<string, { label: string; solde: number }>();
      for (const e of arr) {
        const k = e.tiers as string;
        const cur = map.get(k) ?? { label: e.label || k, solde: 0 };
        cur.solde += e.debit - e.credit;
        map.set(k, cur);
      }
      return Array.from(map.entries())
        .map(([code, v]) => ({ code, label: v.label, solde: v.solde }))
        .sort((a, b) => Math.abs(b.solde) - Math.abs(a.solde))
        .slice(0, 10);
    };
    // Catégorisation SYSCOHADA — 5 catégories alignées 1:1 avec les onglets UI :
    //   Clients      = comptes 41 (411 principalement, 412 FAE, 416 douteux…)
    //   Fournisseurs = comptes 40 (401 principal, 408 FNP, 409 avances…)
    //   Personnel    = comptes 42
    //   État & Org.  = comptes 43 ET 44 combinés
    //   Autres tiers = comptes 45, 46, 47, 48 (tout le reste de la classe 4 tiers)
    const catDefs: Array<{ label: string; tabKey: TiersCat['tabKey']; accountRanges: string; matches: (acc: string) => boolean }> = [
      { label: 'Clients', tabKey: 'clients', accountRanges: '411', matches: (a) => a.startsWith('41') },
      { label: 'Fournisseurs', tabKey: 'fournisseurs', accountRanges: '401', matches: (a) => a.startsWith('40') },
      { label: 'Personnel', tabKey: 'personnel', accountRanges: '42', matches: (a) => a.startsWith('42') },
      { label: 'État & Organismes', tabKey: 'etat', accountRanges: '43-44', matches: (a) => a.startsWith('43') || a.startsWith('44') },
      { label: 'Autres tiers', tabKey: 'autres', accountRanges: '45-48', matches: (a) => a.startsWith('45') || a.startsWith('46') || a.startsWith('47') || a.startsWith('48') },
    ];
    const cats: TiersCat[] = catDefs.map((d) => {
      const sub = withTiers.filter((e) => d.matches(e.account));
      return {
        label: d.label,
        tabKey: d.tabKey,
        accountRanges: d.accountRanges,
        count: new Set(sub.map((e) => e.tiers)).size,
        entries: sub.length,
        top: aggregate(sub),
      };
    });
    setTiersStats({ total: withTiers.length, cats });
  }, [currentOrgId]);

  // Auto-charge les stats à l'ouverture de la page (et quand on importe).
  // Sans ça, le user devait cliquer "Stats tiers" → les onglets étaient vides.
  useEffect(() => {
    void refreshStats();
  }, [refreshStats, report]);

  return (
    <div>
      {!embedded && <PageHeader
        title="Grand Livre Tiers"
        subtitle={`Import auxiliaire clients/fournisseurs — ${org?.name ?? '—'} · Exercice ${currentYear}`}
        action={tiersTab === 'all' ? (
          <div className="flex gap-2 flex-wrap">
            <button className="btn-outline" onClick={async () => {
              if (!confirm('Recalculer les périodes de toutes les écritures tiers selon leurs dates ?')) return;
              setLoading(true);
              try {
                const res = await migrateGLPeriods(currentOrgId);
                toast.success('Périodes recalculées', `${res.migrated} écritures réaffectées · ${res.periodsCreated} périodes créées`);
              } catch (e: any) { toast.error('Recalcul impossible', e.message); }
              finally { setLoading(false); }
            }}>
              <RefreshCw className="w-4 h-4" /> Recalculer périodes
            </button>
            <button className="btn-outline" onClick={async () => {
              if (!confirm('Resynchroniser les libellés des comptes tiers depuis le Grand Livre ?')) return;
              setLoading(true);
              try {
                const res = await resyncAccountLabels(currentOrgId);
                toast.success('Libellés synchronisés', `${res.updated} comptes mis à jour`);
              } catch (e: any) { toast.error('Resync impossible', e.message); }
              finally { setLoading(false); }
            }}>
              <RefreshCw className="w-4 h-4" /> Resync libellés
            </button>
            <button className="btn-outline" onClick={diagnosticTiers}>
              <Search className="w-4 h-4" /> Diagnostic compte
            </button>
            <button className="btn-outline" onClick={() => downloadTiersTemplate(org?.name, currentYear)}>
              <Download className="w-4 h-4" /> Modèle Excel
            </button>
            <button className="btn-outline" onClick={async () => {
              setLoading(true);
              try {
                const { verifyChain } = await import('../lib/auditHash');
                // FIX : dataProvider (Supabase paginé) au lieu de db.gl (Dexie vide)
                const entries = await dataProvider.getGLEntries({ orgId: currentOrgId });
                const tiersEntries = entries.filter((e) => !!e.tiers);
                if (tiersEntries.length === 0) { toast.info('Aucune écriture tiers', 'Importez d\'abord un GL Tiers'); return; }
                const result = await verifyChain(tiersEntries as any);
                if (result.valid) {
                  toast.success('Intégrité vérifiée', `${tiersEntries.length} écritures tiers — chaîne SHA-256 intacte`);
                } else {
                  toast.error('Intégrité compromise', `Rupture à l'index ${result.brokenIndex ?? '?'} (écriture ${result.brokenAt ?? '?'})`);
                }
              } catch (e: any) { toast.error('Vérification impossible', e.message); }
              finally { setLoading(false); }
            }}>
              <Shield className="w-4 h-4" /> Vérifier intégrité
            </button>
            <button className="btn-outline" onClick={async () => {
              setLoading(true);
              try {
                const { auditGL } = await import('../engine/glAudit');
                const result = await auditGL(currentOrgId, currentYear);
                const tiersFindings = result.findings.filter((f: any) =>
                  f.category === 'clients_crediteurs' || f.category === 'fournisseurs_debiteurs' ||
                  f.accounts?.some((a: string) => a.startsWith('41') || a.startsWith('40'))
                );
                console.log('Audit GL Tiers :', tiersFindings);
                toast.info(
                  `Audit GL — Score ${result.scoreGlobal}/100`,
                  `${tiersFindings.length} anomalie(s) tiers détectée(s) — voir console (F12)`
                );
              } catch (e: any) { toast.error('Audit impossible', e.message); }
              finally { setLoading(false); }
            }}>
              <FileWarning className="w-4 h-4" /> Auditer le GL
            </button>
            <button className="btn-outline" onClick={refreshStats}>
              <RefreshCw className="w-4 h-4" /> Stats tiers
            </button>
          </div>
        ) : undefined}
      />}

      <div className="space-y-6">
        {/* Onglets type de tiers SYSCOHADA classe 4 — masqués en mode embarqué
            (la navigation par nature appartient à l'onglet « Grand Livre Tiers » du
            module Grand Livre ; ici on ne garde QUE le workflow d'import). */}
        {!embedded && (
        <div className="flex gap-1 border-b border-primary-200 dark:border-primary-800 overflow-x-auto">
          {([
            { key: 'all' as const, label: 'Tous les tiers' },
            { key: 'clients' as const, label: 'Clients (411)' },
            { key: 'fournisseurs' as const, label: 'Fournisseurs (401)' },
            { key: 'personnel' as const, label: 'Personnel (42)' },
            { key: 'etat' as const, label: 'État & Org. (43-44)' },
            { key: 'autres' as const, label: 'Autres tiers (45-48)' },
          ]).map((t) => (
            <button key={t.key}
              className={`px-3 py-2 text-xs font-medium border-b-2 transition whitespace-nowrap ${tiersTab === t.key ? 'border-accent text-accent' : 'border-transparent text-primary-500 hover:text-primary-700'}`}
              onClick={() => setTiersTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
        )}

        {/* Contexte d'import — uniquement sous "Tous les tiers" */}
        {tiersTab === 'all' && (<>
        {/* Rappel de l'org cible */}
        {org && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent/10 border border-accent/30 text-xs">
            <span className="text-accent font-bold">▶</span>
            <span>Les données importées iront dans <strong className="text-accent">{org.name}</strong>.</span>
            <span className="text-primary-500">Vérifiez que c'est la bonne société avant d'importer.</span>
          </div>
        )}

        {/* Alerte si pas de GL importé */}
        {!hasGL && (
          <div className="p-4 rounded-lg bg-warning/10 border-l-4 border-warning">
            <p className="text-sm font-semibold">Aucun Grand Livre importé</p>
            <p className="text-xs text-primary-600 dark:text-primary-300 mt-1">
              Importez d'abord le <strong>Grand Livre Général</strong> (page Imports) pour que le rapprochement fonctionne.
              Sans GL, les écritures tiers seront créées en mode standalone.
            </p>
          </div>
        )}
        </>)}

        {/* Stats tiers actuelles — masquées en mode embarqué (doublon avec l'onglet
            « Grand Livre Tiers » du module). */}
        {!embedded && tiersStats && (() => {
          // L'onglet "all" affiche toutes les catégories. Sinon on filtre par tabKey
          // qui matche exactement la valeur de l'onglet (clients/fournisseurs/...).
          const visibleCats = tiersTab === 'all'
            ? tiersStats.cats
            : tiersStats.cats.filter((c) => c.tabKey === tiersTab);
          return (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {tiersTab === 'all' && <StatCard label="Total écritures tiers" value={tiersStats.total} />}
                {visibleCats.map((c) => (
                  <StatCard key={c.tabKey} label={`${c.label} (${c.accountRanges})`} value={c.count} good={c.count > 0} />
                ))}
              </div>
              {visibleCats.filter((c) => c.top.length > 0).map((cat) => (
                <Card key={cat.tabKey} title={`Top 10 — ${cat.label}`} subtitle={`Comptes ${cat.accountRanges} · ${cat.entries} écritures · ${cat.count} tiers`}>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead><tr className="border-b border-primary-200 dark:border-primary-800 text-primary-500 uppercase tracking-wider">
                        <th className="text-left py-1.5 px-2">Code tiers</th><th className="text-left py-1.5 px-2">Libellé</th><th className="text-right py-1.5 px-2">Solde</th>
                      </tr></thead>
                      <tbody className="divide-y divide-primary-100 dark:divide-primary-800">
                        {cat.top.map((t, i) => (
                          <tr key={i}><td className="py-1 px-2 font-mono">{t.code}</td><td className="py-1 px-2">{t.label}</td><td className="py-1 px-2 text-right num">{fmtFull(t.solde)}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              ))}
              {/* Si l'onglet sélectionné n'a aucun tier, message explicite */}
              {tiersTab !== 'all' && visibleCats.length > 0 && visibleCats.every((c) => c.count === 0) && (
                <Card>
                  <p className="text-sm text-primary-500 text-center py-6">
                    Aucun tier détecté dans cette catégorie pour l'org courante.
                    {visibleCats[0]?.tabKey === 'autres' && ' (Comptes 45-48 : associés, débiteurs divers, transitoires, HAO)'}
                  </p>
                </Card>
              )}
            </div>
          );
        })()}

        {/* Module d'import — uniquement sous "Tous les tiers" */}
        {tiersTab === 'all' && (<>
        {/* Guide */}
        <div className="p-4 rounded-lg bg-primary-100/60 dark:bg-primary-800/40 text-xs text-primary-600 dark:text-primary-300 space-y-1">
          <p><strong>Comment ça fonctionne :</strong></p>
          <p>1. Importez d'abord le <strong>Grand Livre Général</strong> (page Imports)</p>
          <p>2. Importez ici le <strong>Grand Livre Tiers</strong> (auxiliaire clients/fournisseurs)</p>
          <p>3. Rapprochement automatique par <strong>date + compte + montant</strong> — le code tiers est ajouté sans doublon</p>
          <p>4. Les balances auxiliaires, balances âgées, DSO/DPO et dashboards client/fournisseur se remplissent automatiquement</p>
        </div>

        {step === 'idle' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card title="Déposer le(s) fichier(s) tiers" subtitle="Grand livre auxiliaire — 1 ou plusieurs fichiers (clients, fournisseurs, personnel…)" className="lg:col-span-2">
              <label className="border-2 border-dashed border-primary-300 dark:border-primary-700 rounded-xl p-10 text-center block hover:border-primary-400 dark:hover:border-primary-600 transition cursor-pointer">
                <Users className="w-10 h-10 mx-auto text-primary-400 mb-3" />
                <p className="text-sm font-medium">Déposez ou cliquez pour choisir un ou plusieurs fichiers</p>
                <p className="text-xs text-primary-500 mt-1">Formats : CSV · TXT · XLSX · XLS — sélection multiple possible (même structure de colonnes)</p>
                <input type="file" accept=".csv,.txt,.xlsx,.xls" multiple className="hidden"
                  onChange={(e) => {
                    const fs = e.target.files ? Array.from(e.target.files) : [];
                    if (fs.length > 0) void onFiles(fs);
                  }} />
              </label>
              <div className="mt-4 flex flex-wrap gap-2">
                {sources.map((s) => (
                  <button key={s} onClick={() => setSource(s)}
                    className={`btn !py-1.5 text-xs ${source === s ? 'bg-primary-900 text-primary-50 dark:bg-primary-100 dark:text-primary-900' : 'btn-outline'}`}>
                    {s}
                  </button>
                ))}
              </div>
            </Card>
            <Card title="Contrôles automatiques" subtitle="Appliqués à chaque import">
              <ul className="space-y-2 text-sm">
                {controls.map((c) => (
                  <li key={c} className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-primary-500" />
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        )}

        {step === 'mapping' && (
          <Card
            title="Mapping des colonnes"
            subtitle={
              extraFiles.length > 0
                ? `${1 + extraFiles.length} fichiers · mapping détecté depuis "${file?.name}"`
                : `Fichier : ${file?.name} — ${headers.length} colonnes détectées`
            }
          >
            {extraFiles.length > 0 && (
              <div className="mb-4 p-3 rounded-lg bg-accent/5 border-l-4 border-accent text-xs">
                <p className="font-semibold mb-1">Import multi-fichiers ({1 + extraFiles.length} fichiers)</p>
                <p className="text-primary-600 dark:text-primary-300 mb-2">
                  Le mapping détecté sur le 1er fichier sera appliqué à tous. Si les structures diffèrent, lancez plutôt des imports séparés.
                </p>
                <ul className="space-y-0.5">
                  <li className="font-mono text-[11px]"><span className="text-accent">●</span> {file?.name} <span className="text-primary-400">(modèle de mapping)</span></li>
                  {extraFiles.map((f, i) => (
                    <li key={i} className="font-mono text-[11px]"><span className="text-primary-400">○</span> {f.name}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <Select label="Source ERP" value={source} onChange={setSource}
                options={sources.map((s) => ({ v: s, l: s }))} />
              <div>
                <label className="text-xs text-primary-500 font-medium block mb-1">GL de référence</label>
                <p className="text-sm text-primary-700 dark:text-primary-300 mt-1">
                  {hasGL ? `✓ ${glHistory.length} import(s) GL — rapprochement activé` : '⚠ Pas de GL — mode standalone'}
                </p>
              </div>
            </div>
            <h4 className="text-xs uppercase tracking-wider text-primary-500 font-semibold mb-3">Correspondance des colonnes</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {(['date', 'account', 'codeTiers', 'labelTiers', 'debit', 'credit', 'journal', 'piece', 'label'] as const).map((field) => (
                <Select key={field}
                  label={tiersFieldLabels[field]}
                  value={mapping[field] ?? ''}
                  onChange={(v) => setMapping({ ...mapping, [field]: v || undefined })}
                  options={[{ v: '', l: '— Non mappée —' }, ...headers.map((h) => ({ v: h, l: h }))]}
                  required={['date', 'account', 'codeTiers', 'labelTiers', 'debit', 'credit'].includes(field)} />
              ))}
            </div>
            {batchProgress && (
              <div className="mt-4 p-3 rounded-lg bg-primary-100 dark:bg-primary-900/40 text-xs">
                <p>Fichier {batchProgress.current}/{batchProgress.total} — <span className="font-mono">{batchProgress.name}</span></p>
                <div className="w-full bg-primary-200 dark:bg-primary-800 rounded-full h-1.5 mt-2 overflow-hidden">
                  <div className="bg-accent h-1.5 transition-all" style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }} />
                </div>
              </div>
            )}
            <div className="flex gap-2 mt-6 pt-4 border-t border-primary-200 dark:border-primary-800">
              <button className="btn-outline" onClick={reset}>Annuler</button>
              <button className="btn-primary" onClick={runImport} disabled={loading}>
                {loading ? 'Import en cours…' : (extraFiles.length > 0 ? `Lancer l'import (${1 + extraFiles.length} fichiers)` : 'Lancer l\'import tiers')}
              </button>
            </div>
          </Card>
        )}

        {step === 'result' && report && (
          <Card title="Résultat de l'import tiers">
            {/* Alerte : beaucoup de lignes non rapprochées (compte les
                lignes tiers qui n'ont trouvé aucune écriture GL à enrichir).
                Le GL Tiers ne crée pas d'écritures, il enrichit uniquement. */}
            {report.unmatched > 0 && report.enriched === 0 && (
              <div className="mb-6 p-3 rounded-lg bg-warning/10 border-l-4 border-warning">
                <p className="text-sm font-semibold">{report.unmatched} ligne(s) non rapprochée(s)</p>
                <p className="text-xs text-primary-600 dark:text-primary-300 mt-1">
                  Aucune écriture GL existante n'a pu être enrichie avec ces lignes tiers.
                  Vérifiez que le Grand Livre est bien importé pour la même période et que les
                  montants/dates correspondent. Le GL Tiers ne crée jamais d'écritures — il
                  complète celles du GL avec le code tiers détaillé.
                </p>
              </div>
            )}
            {report.enriched > 0 && (
              <div className="mb-6 p-3 rounded-lg bg-success/10 border-l-4 border-success">
                <p className="text-sm">
                  ✓ {report.enriched.toLocaleString('fr-FR')} écritures GL enrichies avec le code tiers
                  {report.unmatched > 0 && ` · ${report.unmatched} non rapprochées`}
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
              <StatCard label="Lignes lues" value={report.totalRows} />
              <StatCard label="GL enrichies" value={report.enriched} good={report.enriched > 0} />
              <StatCard label="Non rapprochées" value={report.unmatched} bad={report.unmatched > 0} />
              <StatCard label="Ignorées" value={report.skipped} />
              <StatCard label="Erreurs" value={report.errors.length} bad={report.errors.length > 0} />
            </div>

            {/* Note : on ne montre PLUS de "Contrôle de cohérence" agrégé sur
                les comptes collectifs/parents (401, 411, 410…). Le GL Tiers
                est précisément destiné à donner le DÉTAIL par tier individuel
                (CLI001, FRN042…), pas à afficher des sommes parent qui
                masquent les vrais détails. Toute l'information utile est
                visible dans :
                  - Le compteur "GL enrichies" ci-dessus
                  - Le tableau "Lignes non rapprochées" plus bas (par ligne)
                  - La page Bal. aux. Clients / Fournisseurs (par tier) */}

            {report.errors.length > 0 && (
              <div className="mb-4">
                <h4 className="text-xs uppercase tracking-wider font-semibold mb-2 text-error">{report.errors.length} erreur(s)</h4>
                <div className="max-h-40 overflow-y-auto text-xs font-mono bg-primary-50 dark:bg-primary-900/40 rounded p-3">
                  {report.errors.slice(0, 30).map((e, i) => <div key={i} className="py-0.5">Ligne {e.row} : {e.reason}</div>)}
                  {report.errors.length > 30 && <div className="text-primary-500 mt-1">… et {report.errors.length - 30} autres</div>}
                </div>
              </div>
            )}

            <button className="btn-primary" onClick={reset}>Nouvel import</button>
          </Card>
        )}

        {/* Lignes non rapprochées — révision manuelle */}
        {unmatchedRows.length > 0 && (
          <Card
            title={`Lignes non rapprochées (${unmatchedRows.length})`}
            subtitle="Le GL Tiers n'a pas pu enrichir le Grand Livre pour ces lignes — à arbitrer manuellement"
          >
            <div className="mb-3 p-3 rounded-lg bg-warning/10 border-l-4 border-warning text-xs">
              <p className="font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Pourquoi une ligne arrive ici ?
              </p>
              <ul className="mt-1 ml-5 list-disc text-primary-600 dark:text-primary-300">
                <li><strong>no_candidate</strong> : aucune écriture GL ne correspond (date / montant / classe). Vérifier que le GL est bien importé pour la même période.</li>
                <li><strong>ambiguous</strong> : plusieurs écritures GL matchent au même score. Arbitrage humain nécessaire.</li>
                <li><strong>tiers_conflict</strong> : l'écriture GL a déjà un autre code tiers assigné.</li>
              </ul>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-[10px] uppercase tracking-wider text-primary-500 border-b border-primary-200 dark:border-primary-800 sticky top-0 bg-white dark:bg-primary-950">
                  <tr>
                    <th className="text-left py-2 px-2">Ligne</th>
                    <th className="text-left py-2 px-2">Date</th>
                    <th className="text-left py-2 px-2">Compte</th>
                    <th className="text-left py-2 px-2">Tiers</th>
                    <th className="text-left py-2 px-2">Libellé</th>
                    <th className="text-right py-2 px-2">Débit</th>
                    <th className="text-right py-2 px-2">Crédit</th>
                    <th className="text-left py-2 px-2">Pièce</th>
                    <th className="text-left py-2 px-2">Motif</th>
                    <th className="text-center py-2 px-2">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-primary-100 dark:divide-primary-800">
                  {unmatchedRows.slice(0, 200).map((r) => (
                    <tr key={r.id} className="hover:bg-primary-50 dark:hover:bg-primary-900/50">
                      <td className="py-1.5 px-2 num">{r.rowIndex}</td>
                      <td className="py-1.5 px-2 num">{r.date}</td>
                      <td className="py-1.5 px-2 font-mono">{r.account}</td>
                      <td className="py-1.5 px-2 font-mono">{r.codeTiers}</td>
                      <td className="py-1.5 px-2 truncate max-w-[200px]">{r.labelTiers || r.label || '—'}</td>
                      <td className="py-1.5 px-2 text-right num">{r.debit > 0 ? fmtFull(r.debit) : '—'}</td>
                      <td className="py-1.5 px-2 text-right num">{r.credit > 0 ? fmtFull(r.credit) : '—'}</td>
                      <td className="py-1.5 px-2 font-mono">{r.piece || '—'}</td>
                      <td className="py-1.5 px-2">
                        {r.reason === 'no_candidate' && <Badge variant="error">no_candidate</Badge>}
                        {r.reason === 'ambiguous' && <Badge variant="warning">ambiguous ({r.candidateIds?.length ?? 0})</Badge>}
                        {r.reason === 'tiers_conflict' && <Badge variant="warning">tiers_conflict</Badge>}
                      </td>
                      <td className="py-1.5 px-2 text-center">
                        <div className="flex justify-center gap-1">
                          <button
                            className="btn-ghost !p-1 text-accent hover:text-accent-dark"
                            onClick={() => setMatchModalRow(r)}
                            title="Rattacher à une écriture GL manuellement"
                          >
                            <Link2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            className="btn-ghost !p-1 text-primary-500 hover:text-primary-700"
                            onClick={() => r.id !== undefined && dismissUnmatched(r.id)}
                            title="Ignorer (marquer comme traitée sans action)"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            className="btn-ghost !p-1 text-primary-500 hover:text-error"
                            onClick={() => r.id !== undefined && deleteUnmatched(r.id)}
                            title="Supprimer définitivement"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {unmatchedRows.length > 200 && (
                <p className="text-xs text-primary-500 mt-2 text-center">… et {unmatchedRows.length - 200} autres lignes (filtres à venir).</p>
              )}
            </div>
          </Card>
        )}

        {/* Historique complet */}
        <Card title="Historique des imports tiers" subtitle="Traçabilité complète">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wider text-primary-500 border-b border-primary-200 dark:border-primary-800">
                <tr>
                  <th className="text-left py-2 px-3">Date</th>
                  <th className="text-left py-2 px-3">Utilisateur</th>
                  <th className="text-left py-2 px-3">Fichier</th>
                  <th className="text-left py-2 px-3">Source</th>
                  <th className="text-right py-2 px-3">Écritures</th>
                  <th className="text-right py-2 px-3">Rejetées</th>
                  <th className="text-left py-2 px-3">Statut</th>
                  <th className="text-center py-2 px-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-primary-200 dark:divide-primary-800">
                {history.length === 0 && (
                  <tr><td colSpan={8} className="py-6 text-center text-primary-500 text-xs">Aucun import tiers</td></tr>
                )}
                {history.map((i) => (
                  <tr key={i.id} className="hover:bg-primary-100/50 dark:hover:bg-primary-900/50">
                    <td className="py-2 px-3 num text-xs">{new Date(i.date).toLocaleString('fr-FR')}</td>
                    <td className="py-2 px-3">{i.user}</td>
                    <td className="py-2 px-3 font-mono text-xs">{i.fileName}</td>
                    <td className="py-2 px-3"><Badge>{i.source}</Badge></td>
                    <td className="py-2 px-3 text-right num">{i.count.toLocaleString('fr-FR')}</td>
                    <td className="py-2 px-3 text-right num">{i.rejected}</td>
                    <td className="py-2 px-3">
                      {i.status === 'success' && <Badge variant="success"><CheckCircle2 className="w-3 h-3" /> Succès</Badge>}
                      {i.status === 'partial' && <Badge variant="warning"><FileWarning className="w-3 h-3" /> Partiel</Badge>}
                      {i.status === 'error' && <Badge variant="error"><XCircle className="w-3 h-3" /> Échec</Badge>}
                    </td>
                    <td className="py-2 px-3 text-center">
                      <button className="btn-ghost !p-1.5 text-primary-500 hover:text-error hover:bg-error/10" onClick={() => deleteImport(i)} title="Supprimer cet import et ses écritures standalone">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        </>)}
      </div>

      {/* Modal de rattachement manuel */}
      {matchModalRow && (
        <MatchModal
          orgId={currentOrgId}
          unmatched={matchModalRow}
          onClose={() => setMatchModalRow(null)}
          onMatched={async () => { setMatchModalRow(null); await loadUnmatched(); invalidateCloudData('gl'); }}
        />
      )}
    </div>
  );
}

function Select({ label, value, onChange, options, required }: {
  label: string; value: string; onChange: (v: string) => void;
  options: { v: string; l: string }[]; required?: boolean;
}) {
  return (
    <div>
      <label className="text-xs text-primary-500 font-medium block mb-1">
        {label} {required && <span className="text-error">*</span>}
      </label>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    </div>
  );
}

function StatCard({ label, value, good, bad }: { label: string; value: number; good?: boolean; bad?: boolean }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-primary-500">{label}</p>
      <p className={`num text-2xl font-bold ${good ? 'text-success' : bad ? 'text-error' : ''}`}>
        {value.toLocaleString('fr-FR')}
      </p>
    </div>
  );
}

/**
 * Modal "Rattacher cette ligne" — permet à l'utilisateur d'arbitrer
 * manuellement une ligne unmatched en sélectionnant une écriture GL précise.
 *
 * Comportement :
 *   - Si la ligne a `candidateIds` (cas ambiguous), on charge directement ces
 *     écritures et l'utilisateur choisit parmi elles.
 *   - Sinon (no_candidate / tiers_conflict), l'utilisateur peut filtrer par
 *     date, compte, fourchette de montants pour trouver l'écriture cible.
 *
 * Action :
 *   1. UPDATE fna_gl_entries SET tiers=... WHERE id=selected
 *   2. UPDATE fna_tiers_unmatched SET resolved_at=now(), resolved_to=selected,
 *      resolution='matched'
 */
function MatchModal({ orgId, unmatched, onClose, onMatched }: {
  orgId: string;
  unmatched: TiersUnmatched;
  onClose: () => void;
  onMatched: () => void | Promise<void>;
}) {
  const [candidates, setCandidates] = useState<GLEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // État drag-and-drop : id de la ligne GL survolée pour feedback visuel
  const [hoverDropId, setHoverDropId] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);

  // Cleanup global : si l'utilisateur drag puis sort du viewport (Alt+Tab, scroll
  // hors page), `onDragEnd` ne se déclenche pas. Un listener au document garantit
  // que `dragging` se reset → pas de ring accent fantôme.
  useEffect(() => {
    if (!dragging) return;
    const resetDrag = () => { setDragging(false); setHoverDropId(null); };
    document.addEventListener('dragend', resetDrag);
    document.addEventListener('drop', resetDrag);
    return () => {
      document.removeEventListener('dragend', resetDrag);
      document.removeEventListener('drop', resetDrag);
    };
  }, [dragging]);

  // Filtres pour la recherche large (no_candidate).
  // endOfMonth correct : pour février, juin, novembre… '-31' donne une date
  // invalide qui fait planter Postgres. On calcule le vrai dernier jour.
  const _dateParts = unmatched.date.split('-');
  const _year = parseInt(_dateParts[0], 10);
  const _month = parseInt(_dateParts[1], 10); // 1..12
  const _lastDay = new Date(_year, _month, 0).getDate(); // jour 0 du mois suivant = dernier jour du mois
  const defaultFromDate = `${_dateParts[0]}-${_dateParts[1]}-01`;
  const defaultToDate = `${_dateParts[0]}-${_dateParts[1]}-${String(_lastDay).padStart(2, '0')}`;
  const [fromDate, setFromDate] = useState(defaultFromDate);
  const [toDate, setToDate] = useState(defaultToDate);
  const [accountPrefix, setAccountPrefix] = useState(unmatched.account.substring(0, 2));
  const [amountTolerance, setAmountTolerance] = useState(0);

  const loadCandidates = useCallback(async () => {
    setLoading(true);
    try {
      // Cas ambiguous : charger les candidats pré-identifiés
      if (unmatched.reason === 'ambiguous' && unmatched.candidateIds && unmatched.candidateIds.length > 0) {
        // Pas d'API getGLEntriesByIds → on charge tout puis filtre client-side.
        // Pour des datasets très gros, à optimiser via une RPC ou un filter `in`.
        const all = await dataProvider.getGLEntries({ orgId });
        const ids = new Set(unmatched.candidateIds);
        setCandidates(all.filter((e) => e.id !== undefined && ids.has(e.id)));
        return;
      }
      // Cas no_candidate / tiers_conflict : recherche large
      const all = await dataProvider.getGLEntries({ orgId, fromDate, toDate });
      const filtered = all.filter((e) => {
        if (accountPrefix && !e.account.startsWith(accountPrefix)) return false;
        if (amountTolerance >= 0) {
          const dbDiff = Math.abs(e.debit - unmatched.debit);
          const crDiff = Math.abs(e.credit - unmatched.credit);
          if (dbDiff > amountTolerance) return false;
          if (crDiff > amountTolerance) return false;
        }
        return true;
      });
      // Limite à 50 résultats triés par proximité de montant
      const sorted = filtered.sort((a, b) => {
        const da = Math.abs(a.debit - unmatched.debit) + Math.abs(a.credit - unmatched.credit);
        const db = Math.abs(b.debit - unmatched.debit) + Math.abs(b.credit - unmatched.credit);
        return da - db;
      }).slice(0, 50);
      setCandidates(sorted);
    } catch (e: any) {
      toast.error('Recherche impossible', e.message);
    } finally {
      setLoading(false);
    }
  }, [orgId, unmatched, fromDate, toDate, accountPrefix, amountTolerance]);

  // Debounce 300ms : éviter de re-fetcher le GL paginé à chaque frappe dans
  // les inputs de filtre (date, compte, tolérance montant). Pour un GL de 8000+
  // entries, chaque round-trip = ~1s. Sans debounce, taper "1000" en tolérance
  // = 4 fetchs successifs.
  useEffect(() => {
    const handle = setTimeout(() => { void loadCandidates(); }, 300);
    return () => clearTimeout(handle);
  }, [loadCandidates]);

  const confirmMatch = async (glEntry: GLEntry) => {
    if (glEntry.id === undefined) return;
    if (glEntry.tiers && glEntry.tiers !== unmatched.codeTiers) {
      if (!confirm(`Cette écriture GL est déjà associée au tiers "${glEntry.tiers}". La remplacer par "${unmatched.codeTiers}" ?`)) return;
    }
    setSaving(true);
    // Best-effort atomicité (en attendant une RPC dédiée fna_manual_match_tiers) :
    // si l'étape 2 échoue après l'étape 1, on revert le GL pour ne pas laisser
    // un état partiel "écriture enrichie + unmatched toujours pending" qui
    // entraînerait un double-trigger d'audit log au prochain essai.
    const oldTiers = glEntry.tiers;
    const oldLabel = glEntry.label;
    let glUpdated = false;
    try {
      const newLabel = glEntry.label || unmatched.label || unmatched.labelTiers || '';
      // 1) Enrichir l'écriture GL
      await dataProvider.updateGLEntry(glEntry.id, {
        tiers: unmatched.codeTiers,
        label: newLabel,
      });
      glUpdated = true;
      // 2) Marquer l'unmatched comme résolu
      if (unmatched.id !== undefined) {
        await dataProvider.updateTiersUnmatched(unmatched.id, {
          resolvedAt: Date.now(),
          resolvedTo: glEntry.id,
          resolution: 'matched',
        });
      }
      // 3) Audit log de la modification manuelle
      const { logGLChanges } = await import('../lib/glAuditLog');
      type Change = Parameters<typeof logGLChanges>[1][number];
      const changes: Change[] = [
        {
          glEntryId: glEntry.id,
          field: 'tiers',
          oldValue: oldTiers,
          newValue: unmatched.codeTiers,
          reason: 'manual_match',
          sourceKind: 'MANUAL',
          sourceId: unmatched.id,
        },
      ];
      if (newLabel !== oldLabel) {
        changes.push({
          glEntryId: glEntry.id,
          field: 'label',
          oldValue: oldLabel,
          newValue: newLabel,
          reason: 'manual_match',
          sourceKind: 'MANUAL',
          sourceId: unmatched.id,
        });
      }
      await logGLChanges(orgId, changes);
      toast.success('Rattachement effectué', `${unmatched.codeTiers} → écriture #${glEntry.id}`);
      await onMatched();
    } catch (e: any) {
      // Compensation : si le GL a été enrichi mais la suite a échoué, on revert
      // pour éviter l'état partiel.
      if (glUpdated && glEntry.id !== undefined) {
        try {
          await dataProvider.updateGLEntry(glEntry.id, { tiers: oldTiers, label: oldLabel });
        } catch (rollbackErr) {
          console.error('[confirmMatch] rollback GL échoué — état partiel possible :', rollbackErr);
        }
      }
      toast.error('Échec du rattachement', e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-primary-950 rounded-xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-primary-200 dark:border-primary-800">
          <div>
            <h3 className="text-base font-semibold">Rattacher manuellement la ligne tiers</h3>
            <p className="text-xs text-primary-500 mt-1">
              Le code tiers <strong className="text-accent">{unmatched.codeTiers}</strong> sera ajouté à l'écriture GL que vous choisissez ci-dessous.
            </p>
          </div>
          <button onClick={onClose} className="btn-ghost !p-1.5">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Ligne tiers source (draggable) */}
        <div
          draggable
          onDragStart={(e) => {
            // Le payload est minimal — toute l'info utile est dans `unmatched` (state)
            e.dataTransfer.setData('text/plain', `tiers:${unmatched.id ?? ''}`);
            e.dataTransfer.effectAllowed = 'link';
            setDragging(true);
          }}
          onDragEnd={() => { setDragging(false); setHoverDropId(null); }}
          className={`p-4 bg-warning/5 border-b border-primary-200 dark:border-primary-800 cursor-grab active:cursor-grabbing transition ${dragging ? 'opacity-60 ring-2 ring-accent' : ''}`}
          title="Glissez cette ligne sur une écriture GL ci-dessous pour la rattacher"
        >
          <p className="text-[10px] uppercase tracking-wider text-primary-500 font-semibold mb-2 flex items-center gap-2">
            Ligne tiers source
            <span className="text-accent text-[10px] font-normal normal-case">▸ glisser-déposer ou cliquer "Rattacher"</span>
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2 text-xs">
            <Field label="Date" value={unmatched.date} mono />
            <Field label="Compte" value={unmatched.account} mono />
            <Field label="Code tiers" value={unmatched.codeTiers} mono accent />
            <Field label="Libellé" value={unmatched.labelTiers || unmatched.label || '—'} />
            <Field label="Débit" value={unmatched.debit > 0 ? fmtFull(unmatched.debit) : '—'} num />
            <Field label="Crédit" value={unmatched.credit > 0 ? fmtFull(unmatched.credit) : '—'} num />
            {unmatched.journal && <Field label="Journal" value={unmatched.journal} mono />}
            {unmatched.piece && <Field label="Pièce" value={unmatched.piece} mono />}
            <Field label="Motif" value={unmatched.reason} />
          </div>
        </div>

        {/* Filtres (uniquement si pas ambiguous) */}
        {unmatched.reason !== 'ambiguous' && (
          <div className="p-4 border-b border-primary-200 dark:border-primary-800">
            <p className="text-[10px] uppercase tracking-wider text-primary-500 font-semibold mb-2">Filtres de recherche GL</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="text-[10px] text-primary-500 block mb-1">Du</label>
                <input type="date" className="input !py-1.5 text-xs" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
              </div>
              <div>
                <label className="text-[10px] text-primary-500 block mb-1">Au</label>
                <input type="date" className="input !py-1.5 text-xs" value={toDate} onChange={(e) => setToDate(e.target.value)} />
              </div>
              <div>
                <label className="text-[10px] text-primary-500 block mb-1">Compte (préfixe)</label>
                <input type="text" className="input !py-1.5 text-xs font-mono" value={accountPrefix} onChange={(e) => setAccountPrefix(e.target.value)} placeholder="41, 411, 411100…" />
              </div>
              <div>
                <label className="text-[10px] text-primary-500 block mb-1">Tolérance montant (±)</label>
                <input type="number" className="input !py-1.5 text-xs num" value={amountTolerance} onChange={(e) => setAmountTolerance(Number(e.target.value))} min={0} />
              </div>
            </div>
            <button className="btn-outline mt-3 text-xs" onClick={loadCandidates} disabled={loading}>
              <Search className="w-3.5 h-3.5" /> {loading ? 'Recherche…' : 'Rechercher'}
            </button>
          </div>
        )}

        {/* Candidats */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <p className="text-sm text-primary-500 text-center py-8">Chargement…</p>
          ) : candidates.length === 0 ? (
            <p className="text-sm text-primary-500 text-center py-8">
              Aucune écriture GL ne correspond aux critères.
              {unmatched.reason !== 'ambiguous' && ' Élargissez la date, le préfixe de compte ou la tolérance de montant.'}
            </p>
          ) : (
            <table className="w-full text-xs">
              <thead className="text-[10px] uppercase tracking-wider text-primary-500 border-b border-primary-200 dark:border-primary-800">
                <tr>
                  <th className="text-left py-2 px-2">ID</th>
                  <th className="text-left py-2 px-2">Date</th>
                  <th className="text-left py-2 px-2">Compte</th>
                  <th className="text-left py-2 px-2">Journal</th>
                  <th className="text-left py-2 px-2">Pièce</th>
                  <th className="text-left py-2 px-2">Libellé</th>
                  <th className="text-right py-2 px-2">Débit</th>
                  <th className="text-right py-2 px-2">Crédit</th>
                  <th className="text-left py-2 px-2">Tiers actuel</th>
                  <th className="text-center py-2 px-2">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-primary-100 dark:divide-primary-800">
                {candidates.map((c) => {
                  const isHovered = hoverDropId === c.id;
                  return (
                    <tr
                      key={c.id}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'link';
                        if (c.id !== undefined) setHoverDropId(c.id);
                      }}
                      onDragLeave={() => setHoverDropId((cur) => (cur === c.id ? null : cur))}
                      onDrop={(e) => {
                        e.preventDefault();
                        setHoverDropId(null);
                        setDragging(false);
                        void confirmMatch(c);
                      }}
                      className={`transition ${isHovered ? 'bg-accent/15 ring-2 ring-accent ring-inset' : 'hover:bg-primary-50 dark:hover:bg-primary-900/50'}`}
                    >
                      <td className="py-1.5 px-2 num font-mono">{c.id}</td>
                      <td className="py-1.5 px-2 num">{c.date}</td>
                      <td className="py-1.5 px-2 font-mono">{c.account}</td>
                      <td className="py-1.5 px-2 font-mono">{c.journal}</td>
                      <td className="py-1.5 px-2 font-mono">{c.piece}</td>
                      <td className="py-1.5 px-2 truncate max-w-[200px]">{c.label}</td>
                      <td className="py-1.5 px-2 text-right num">{c.debit > 0 ? fmtFull(c.debit) : '—'}</td>
                      <td className="py-1.5 px-2 text-right num">{c.credit > 0 ? fmtFull(c.credit) : '—'}</td>
                      <td className="py-1.5 px-2 font-mono">
                        {c.tiers
                          ? <Badge variant={c.tiers === unmatched.codeTiers ? 'success' : 'warning'}>{c.tiers}</Badge>
                          : <span className="text-primary-400">—</span>}
                      </td>
                      <td className="py-1.5 px-2 text-center">
                        <button
                          className="btn-primary !py-1 !px-2 text-[10px]"
                          onClick={() => confirmMatch(c)}
                          disabled={saving}
                        >
                          <Link2 className="w-3 h-3" /> Rattacher
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, mono, num, accent }: { label: string; value: string; mono?: boolean; num?: boolean; accent?: boolean }) {
  return (
    <div>
      <p className="text-[10px] uppercase text-primary-500 font-medium">{label}</p>
      <p className={`text-xs ${mono || num ? 'font-mono' : ''} ${num ? 'num text-right' : ''} ${accent ? 'text-accent font-semibold' : ''}`}>{value}</p>
    </div>
  );
}
