/**
 * SyncStatusPanel — diagnostic d'état des données local/cloud.
 *
 * Affiche en synthèse :
 *   - Le nombre d'orgs / écritures GL / budgets visibles dans Supabase
 *   - Le nombre dans Dexie (cache local)
 *   - L'état de la sync (alignée / désalignée / orpheline)
 *   - Actions rapides : "Sync vers cloud" et "Réparer l'accès" (RLS)
 *
 * Utilisé dans DashboardHome.tsx pour rendre visible ce qui était caché dans
 * la console (`[Sync] GL: Supabase vide… Donnees locales preservees`).
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, AlertTriangle, Cloud, Database, Shield, ArrowRight } from 'lucide-react';
import { safeLocalStorage } from '../../lib/safeStorage';
import { db } from '../../db/schema';
import { dataProvider } from '../../db/provider';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { useApp } from '../../store/app';

interface DataStats {
  cloudGL: number;
  cloudBudgets: number;
  cloudOrgs: number;
  localGL: number;
  localBudgets: number;
  localOrgs: number;
  hasUserOrgMapping: boolean;
  loading: boolean;
}

export function SyncStatusPanel() {
  const { currentOrgId } = useApp();
  const navigate = useNavigate();
  const [stats, setStats] = useState<DataStats>({
    cloudGL: 0, cloudBudgets: 0, cloudOrgs: 0,
    localGL: 0, localBudgets: 0, localOrgs: 0,
    hasUserOrgMapping: true,
    loading: true,
  });

  useEffect(() => {
    if (!currentOrgId || !isSupabaseConfigured) {
      setStats((s) => ({ ...s, loading: false }));
      return;
    }
    // Mode démo : pas de diagnostic sync (tout est hardcodé)
    if (currentOrgId.startsWith('demo-org') && safeLocalStorage.getItem('demo-mode') === '1') {
      setStats((s) => ({ ...s, loading: false }));
      return;
    }
    (async () => {
      try {
        // Cloud counts (RLS-filtered)
        const cloudOrgs = await dataProvider.getOrganizations().catch(() => []);
        const [{ count: cloudGL }, { count: cloudBudgets }] = await Promise.all([
          (supabase as any).from('fna_gl_entries').select('*', { count: 'exact', head: true }).eq('org_id', currentOrgId),
          (supabase as any).from('fna_budgets').select('*', { count: 'exact', head: true }).eq('org_id', currentOrgId),
        ]);
        // Local counts (Dexie cache)
        const [localGL, localBudgets, localOrgs] = await Promise.all([
          db.gl.where('orgId').equals(currentOrgId).count().catch(() => 0),
          db.budgets.where('orgId').equals(currentOrgId).count().catch(() => 0),
          db.organizations.count().catch(() => 0),
        ]);
        // Vérifie si user a la mapping fna_user_orgs pour cette org
        const { data: sessionData } = await supabase.auth.getSession();
        const userId = sessionData.session?.user?.id;
        let hasUserOrgMapping = true;
        if (userId) {
          const { data: mapping } = await (supabase as any)
            .from('fna_user_orgs')
            .select('org_id')
            .eq('user_id', userId)
            .eq('org_id', currentOrgId)
            .maybeSingle();
          hasUserOrgMapping = !!mapping;
        }
        setStats({
          cloudGL: cloudGL ?? 0, cloudBudgets: cloudBudgets ?? 0, cloudOrgs: cloudOrgs.length,
          localGL, localBudgets, localOrgs,
          hasUserOrgMapping,
          loading: false,
        });
      } catch (e) {
        console.warn('[SyncStatusPanel] fetch failed:', e);
        setStats((s) => ({ ...s, loading: false }));
      }
    })();
  }, [currentOrgId]);

  if (!isSupabaseConfigured || stats.loading) return null;

  // Détermine le diagnostic
  const localHasData = stats.localGL > 0 || stats.localBudgets > 0;
  const cloudHasData = stats.cloudGL > 0 || stats.cloudBudgets > 0;
  const diagnostic: 'ok' | 'orphan' | 'rls' | 'empty' | 'mismatch' = (() => {
    if (!stats.hasUserOrgMapping) return 'rls';
    if (localHasData && !cloudHasData) return 'orphan';
    if (!localHasData && !cloudHasData) return 'empty';
    if (cloudHasData && localHasData && (Math.abs(stats.cloudGL - stats.localGL) > 100)) return 'mismatch';
    return 'ok';
  })();

  // Cas OK : on n'affiche rien (pas de pollution UI)
  if (diagnostic === 'ok' || diagnostic === 'empty') return null;

  const config = {
    rls: {
      icon: Shield,
      bg: 'bg-error/10 border-error/30',
      iconColor: 'text-error',
      title: '⚠ Accès cloud non configuré pour cette société',
      description: `Cette société n'est pas associée à votre compte dans la table de droits (fna_user_orgs). Toute écriture dans le cloud (import GL, budget, plan comptable) sera bloquée par la sécurité RLS de Supabase.`,
      action: { label: 'Réparer l\'accès cloud', icon: Shield, route: '/settings?tab=donnees' },
    },
    orphan: {
      icon: AlertTriangle,
      bg: 'bg-warning/10 border-warning/30',
      iconColor: 'text-warning',
      title: 'Données locales non synchronisées',
      description: `Vous avez ${stats.localGL.toLocaleString('fr-FR')} écriture(s) GL et ${stats.localBudgets.toLocaleString('fr-FR')} ligne(s) de budget en cache local mais le cloud Supabase est vide. Vos données ne sont accessibles que depuis ce navigateur — sync conseillée pour le multi-device et la protection contre la perte.`,
      action: { label: 'Sync complet vers le cloud', icon: Cloud, route: '/settings?tab=donnees' },
    },
    mismatch: {
      icon: AlertTriangle,
      bg: 'bg-warning/10 border-warning/30',
      iconColor: 'text-warning',
      title: 'Cache local et cloud désynchronisés',
      description: `Cloud : ${stats.cloudGL.toLocaleString('fr-FR')} écritures · Local : ${stats.localGL.toLocaleString('fr-FR')} écritures. Une re-synchronisation est recommandée pour aligner les deux.`,
      action: { label: 'Sync complet vers le cloud', icon: Cloud, route: '/settings?tab=donnees' },
    },
  }[diagnostic];

  const Icon = config.icon;
  const ActionIcon = config.action.icon;

  return (
    <div className={`mb-5 rounded-2xl border-l-4 ${config.bg} p-4`}>
      <div className="flex items-start gap-3">
        <Icon className={`w-5 h-5 ${config.iconColor} shrink-0 mt-0.5`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-primary-900 dark:text-primary-100">
            {config.title}
          </p>
          <p className="text-xs text-primary-700 dark:text-primary-300 mt-1">
            {config.description}
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-3 text-[11px]">
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-primary-50 dark:bg-primary-900/30">
              <Cloud className="w-3 h-3 text-primary-500" />
              Cloud · GL : <strong className="num">{stats.cloudGL.toLocaleString('fr-FR')}</strong>
            </div>
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-primary-50 dark:bg-primary-900/30">
              <Cloud className="w-3 h-3 text-primary-500" />
              Cloud · Budgets : <strong className="num">{stats.cloudBudgets.toLocaleString('fr-FR')}</strong>
            </div>
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-primary-50 dark:bg-primary-900/30">
              <Cloud className="w-3 h-3 text-primary-500" />
              Cloud · Sociétés : <strong className="num">{stats.cloudOrgs.toLocaleString('fr-FR')}</strong>
            </div>
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-primary-100 dark:bg-primary-800">
              <Database className="w-3 h-3 text-primary-500" />
              Local · GL : <strong className="num">{stats.localGL.toLocaleString('fr-FR')}</strong>
            </div>
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-primary-100 dark:bg-primary-800">
              <Database className="w-3 h-3 text-primary-500" />
              Local · Budgets : <strong className="num">{stats.localBudgets.toLocaleString('fr-FR')}</strong>
            </div>
            <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md ${stats.hasUserOrgMapping ? 'bg-success/10 text-success' : 'bg-error/10 text-error'}`}>
              {stats.hasUserOrgMapping
                ? <><CheckCircle2 className="w-3 h-3" /> Accès RLS OK</>
                : <><Shield className="w-3 h-3" /> Accès RLS manquant</>}
            </div>
          </div>
          <button
            className="btn-primary !py-1.5 !text-xs mt-3 inline-flex items-center gap-1.5"
            onClick={() => navigate(config.action.route)}
          >
            <ActionIcon className="w-3.5 h-3.5" /> {config.action.label} <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
}
