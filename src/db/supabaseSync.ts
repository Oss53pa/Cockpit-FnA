/**
 * Sync Supabase → Dexie (pull au login)
 *
 * Stratégie : Supabase est la source de vérité quand configuré.
 * Au login, on tire TOUTES les données de l'utilisateur depuis Supabase
 * et on écrase le Dexie local. Les moteurs de calcul (balance.ts, statements.ts, etc.)
 * continuent de lire Dexie — ils ne voient aucune différence.
 *
 * Au write (import GL, saisie budget, etc.), on écrit dans Dexie (via le code existant)
 * PUIS on pousse vers Supabase en arrière-plan.
 */
import { db } from './schema';
import { toSnake, toCamel } from './caseConvert';
import { supabase as supabaseTyped, isSupabaseConfigured } from '../lib/supabase';

// Cast as any : les tables fna_* ne sont pas typees dans Database
const supabase = supabaseTyped as any;

async function fetchAll(table: string, orgId?: string) {
  let q = supabase.from(table).select('*');
  if (orgId) q = q.eq('org_id', orgId);
  // Supabase limite à 1000 par défaut — paginer
  const all: any[] = [];
  let offset = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await q.range(offset, offset + PAGE - 1);
    if (error) throw new Error(`Sync ${table}: ${error.message}`);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

// ── PULL : Supabase → Dexie ─────────────────────────────────────────
export type SyncProgress = {
  step: string;
  current: number;
  total: number;
};

export async function pullFromSupabase(
  orgIds: string[],
  onProgress?: (p: SyncProgress) => void,
): Promise<{ orgs: number; entries: number; duration: number }> {
  if (!isSupabaseConfigured) return { orgs: 0, entries: 0, duration: 0 };
  const t0 = Date.now();
  let totalEntries = 0;

  const steps = ['organizations', 'fiscal_years', 'periods', 'accounts', 'gl_entries', 'imports', 'budgets', 'reports', 'attention_points', 'action_plans'];
  let stepIdx = 0;
  const progress = (step: string) => {
    stepIdx++;
    onProgress?.({ step, current: stepIdx, total: steps.length });
  };

  // 1. Organizations
  progress('Organisations');
  const orgs = await fetchAll('fna_organizations');
  const myOrgs = orgIds.length > 0 ? orgs.filter((o: any) => orgIds.includes(o.id)) : orgs;
  if (myOrgs.length > 0) {
    await db.organizations.bulkPut(myOrgs.map((o: any) => toCamel(o) as any));
  }

  for (const org of myOrgs) {
    const oid = org.id;

    // 2. Fiscal years
    progress('Exercices');
    const fys = await fetchAll('fna_fiscal_years', oid);
    if (fys.length > 0) await db.fiscalYears.bulkPut(fys.map((r: any) => toCamel(r) as any));

    // 3. Periods
    progress('Périodes');
    const periods = await fetchAll('fna_periods', oid);
    if (periods.length > 0) await db.periods.bulkPut(periods.map((r: any) => toCamel(r) as any));

    // 4. Accounts
    progress('Plan comptable');
    const accs = await fetchAll('fna_accounts', oid);
    if (accs.length > 0) await db.accounts.bulkPut(accs.map((r: any) => toCamel(r) as any));

    // 5. GL entries (le plus volumineux — par chunks)
    // SAFETY : on NE supprime PAS les donnees locales si Supabase est VIDE
    // (evite la perte de donnees pour les users qui ont importe localement
    // mais pas encore push vers Supabase).
    progress('Grand Livre');
    const glRows = await fetchAll('fna_gl_entries', oid);
    if (glRows.length > 0) {
      // Supabase a des donnees → on remplace en local.
      // Mapping (pur, hors Dexie) effectue AVANT la transaction.
      const mapped = glRows.map((r: any) => {
        const c = toCamel(r) as any;
        c.importId = c.importId != null ? String(c.importId) : undefined;
        delete c.id;
        // Supabase renvoie numeric(18,2) en string — forcer Number()
        if (c.debit != null) c.debit = Number(c.debit);
        if (c.credit != null) c.credit = Number(c.credit);
        return c;
      });
      // (S-01) ATOMICITE : suppression de l'ancien GL local + re-insertion dans
      // UNE SEULE transaction Dexie. Avant, un crash/refresh/coupure entre le
      // delete et la fin des bulkAdd laissait le Grand Livre local vide ou
      // partiel → etats financiers faux jusqu'au prochain pull reussi.
      await db.transaction('rw', db.gl, async () => {
        const oldGlKeys = await db.gl.where('orgId').equals(oid).primaryKeys();
        if (oldGlKeys.length > 0) await db.gl.bulkDelete(oldGlKeys);
        for (let i = 0; i < mapped.length; i += 5000) {
          await db.gl.bulkAdd(mapped.slice(i, i + 5000));
        }
      });
      totalEntries += mapped.length;
      console.log(`[Sync] GL: ${mapped.length} ecritures pulled depuis Supabase`);
    } else {
      // Supabase vide → on garde les donnees locales (fallback safe)
      const localCount = await db.gl.where('orgId').equals(oid).count();
      console.log(`[Sync] GL: Supabase vide pour ${oid}. Donnees locales preservees (${localCount} ecritures).`);
    }

    // 6. Imports
    progress('Imports');
    const imports = await fetchAll('fna_imports', oid);
    if (imports.length > 0) await db.imports.bulkPut(imports.map((r: any) => toCamel(r) as any));

    // 7. Budgets — SAFETY : on NE vide pas le local si Supabase est vide
    progress('Budgets');
    const budgets = await fetchAll('fna_budgets', oid);
    if (budgets.length > 0) {
      // Supabase a des budgets → replace en local (mapping hors transaction).
      const rows = budgets.map((r: any) => {
        const c = toCamel(r) as any;
        delete c.id;
        if (c.amount != null) c.amount = Number(c.amount);
        if (c.year != null) c.year = Number(c.year);
        if (c.month != null) c.month = Number(c.month);
        return c;
      });
      // (S-01) ATOMICITE : delete + bulkAdd des budgets dans une seule transaction.
      await db.transaction('rw', db.budgets, async () => {
        await db.budgets.where('orgId').equals(oid).delete();
        await db.budgets.bulkAdd(rows);
      });
      console.log(`[Sync] Budgets: ${rows.length} lignes pulled depuis Supabase`);
    } else {
      const localCount = await db.budgets.where('orgId').equals(oid).count();
      console.log(`[Sync] Budgets: Supabase vide. Donnees locales preservees (${localCount} lignes).`);
    }

    // 8. Reports
    progress('Rapports');
    const reports = await fetchAll('fna_reports', oid);
    if (reports.length > 0) await db.reports.bulkPut(reports.map((r: any) => toCamel(r) as any));

    // 9. Attention points
    progress('Points d\'attention');
    const aps = await fetchAll('fna_attention_points', oid);
    if (aps.length > 0) await db.attentionPoints.bulkPut(aps.map((r: any) => toCamel(r) as any));

    // 10. Action plans
    progress('Plans d\'action');
    const plans = await fetchAll('fna_action_plans', oid);
    if (plans.length > 0) await db.actionPlans.bulkPut(plans.map((r: any) => toCamel(r) as any));
  }

  return { orgs: myOrgs.length, entries: totalEntries, duration: Date.now() - t0 };
}

// ── PUSH : Dexie → Supabase (après import/write) ────────────────────
export async function pushGLToSupabase(orgId: string): Promise<number> {
  if (!isSupabaseConfigured) return 0;
  const entries = await db.gl.where('orgId').equals(orgId).toArray();
  if (entries.length === 0) return 0;

  // Supprimer les anciennes entrées cloud pour cet org
  await supabase.from('fna_gl_entries').delete().eq('org_id', orgId);

  // Pousser par chunks de 500
  const rows = entries.map((e) => {
    const s = toSnake(e);
    delete s.id; // Supabase bigserial auto
    return s;
  });
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from('fna_gl_entries').insert(rows.slice(i, i + 500));
    if (error) throw new Error(`Push GL chunk ${i}: ${error.message}`);
  }
  return entries.length;
}

export async function pushOrgToSupabase(orgId: string): Promise<void> {
  if (!isSupabaseConfigured) return;

  const check = (res: { error: any }, label: string) => {
    if (res.error) console.warn(`[Sync] Push ${label} failed:`, res.error.message);
  };

  const org = await db.organizations.get(orgId);
  if (org) check(await supabase.from('fna_organizations').upsert(toSnake(org)), 'org');

  const fys = await db.fiscalYears.where('orgId').equals(orgId).toArray();
  if (fys.length > 0) check(await supabase.from('fna_fiscal_years').upsert(fys.map((f) => toSnake(f))), 'fiscal_years');

  const periods = await db.periods.where('orgId').equals(orgId).toArray();
  if (periods.length > 0) {
    for (let i = 0; i < periods.length; i += 500) {
      check(await supabase.from('fna_periods').upsert(periods.slice(i, i + 500).map((p) => toSnake(p))), 'periods');
    }
  }

  const accs = await db.accounts.where('orgId').equals(orgId).toArray();
  if (accs.length > 0) {
    for (let i = 0; i < accs.length; i += 500) {
      check(await supabase.from('fna_accounts').upsert(accs.slice(i, i + 500).map((a) => toSnake(a))), 'accounts');
    }
  }

  const budgets = await db.budgets.where('orgId').equals(orgId).toArray();
  if (budgets.length > 0) {
    for (let i = 0; i < budgets.length; i += 500) {
      check(await supabase.from('fna_budgets').upsert(budgets.slice(i, i + 500).map((b) => toSnake(b))), 'budgets');
    }
  }

  const imports = await db.imports.where('orgId').equals(orgId).toArray();
  if (imports.length > 0) {
    for (let i = 0; i < imports.length; i += 500) {
      await supabase.from('fna_imports').upsert(imports.slice(i, i + 500).map((im) => toSnake(im)));
    }
  }
}

// ── SYNC COMPLÈTE (pull + push) ─────────────────────────────────────
export async function fullSync(orgIds: string[], onProgress?: (p: SyncProgress) => void) {
  // Pull d'abord (Supabase → Dexie)
  const result = await pullFromSupabase(orgIds, onProgress);
  // Puis push les données locales qui pourraient manquer dans Supabase
  for (const oid of orgIds) {
    await pushOrgToSupabase(oid);
    await pushGLToSupabase(oid);
  }
  return result;
}

// ── AUTO-RECOVERY : détecte les données locales orphelines ──────────
// Cas typique : un user avait des données dans Dexie (ancienne version),
// la migration vers Supabase n'a jamais été déclenchée, et l'app maintenant
// lit uniquement Supabase (donc affiche vide). On détecte ce cas et on push
// automatiquement les données Dexie vers Supabase pour rétablir la situation.
//
// Conditions de déclenchement :
//   - Au moins UN orgId a des écritures GL dans Dexie
//   - Cet orgId n'a AUCUNE écriture GL dans Supabase
//   - Le marqueur de migration (`localStorage.fna-auto-recovery-done`) n'est pas posé
//
// Renvoie le nombre de lignes migrées par org (0 = pas de migration nécessaire).
export type AutoRecoveryResult = {
  needed: boolean;
  migrated: { orgId: string; rows: number }[];
  skipped: string[];     // orgIds qui n'avaient pas besoin de migration
  errors: { orgId: string; error: string }[];
};

const RECOVERY_MARKER_KEY = 'fna-auto-recovery-done';

export async function autoRecoverDexieToSupabase(
  authOrgIds: string[],
  onProgress?: (msg: string) => void,
): Promise<AutoRecoveryResult> {
  const result: AutoRecoveryResult = { needed: false, migrated: [], skipped: [], errors: [] };
  if (!isSupabaseConfigured) return result;

  // Marker : on ne re-tente pas si déjà fait sur ce device.
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem(RECOVERY_MARKER_KEY) === '1') {
      return result;
    }
  } catch { /* sandboxed */ }

  // BUG FIX URGENT : on UNIONNE les orgIds passés (depuis fna_user_orgs auth)
  // avec les orgIds présents dans Dexie. Cas critique : l'utilisateur a des
  // données dans Dexie sous des orgIds qui ne sont PAS dans fna_user_orgs
  // (org créée localement avant authentification, ou ID régénéré).
  let dexieOrgIds: string[] = [];
  try {
    const dexieOrgs = await db.organizations.toArray();
    dexieOrgIds = dexieOrgs.map((o: any) => o.id);
  } catch { /* Dexie inaccessible */ }
  const orgIdsToCheck = Array.from(new Set([...authOrgIds, ...dexieOrgIds]));
  console.info(`[autoRecovery] Vérification ${orgIdsToCheck.length} org(s) (auth: ${authOrgIds.length}, dexie: ${dexieOrgIds.length})`);

  for (const orgId of orgIdsToCheck) {
    try {
      // 1) Compte les écritures GL dans Dexie pour cet org
      const dexieGLCount = await db.gl.where('orgId').equals(orgId).count();
      if (dexieGLCount === 0) {
        result.skipped.push(orgId);
        continue;
      }

      // 2) Vérifie si Supabase a déjà des écritures pour cet org
      const { count: supabaseGLCount, error } = await supabase
        .from('fna_gl_entries')
        .select('*', { count: 'exact', head: true })
        .eq('org_id', orgId);
      if (error) {
        console.warn(`[autoRecovery] Check Supabase failed for ${orgId}:`, error);
        result.errors.push({ orgId, error: error.message });
        continue;
      }

      if ((supabaseGLCount ?? 0) > 0) {
        // Supabase a déjà des données → pas besoin de migration
        result.skipped.push(orgId);
        continue;
      }

      // 3) Cas critique : Dexie a des données, Supabase est vide → on migre.
      result.needed = true;
      onProgress?.(`Restauration des données locales pour ${orgId}…`);
      console.info(`[autoRecovery] Migration ${orgId} : ${dexieGLCount} écritures Dexie → Supabase`);

      // Push toutes les tables avec dépendances dans le bon ordre.
      const pushResult = await pushAllToSupabase([orgId], (p) => {
        onProgress?.(`${p.step} (${p.current}/${p.total})…`);
      });
      const totalRows = pushResult.totalRows;
      result.migrated.push({ orgId, rows: totalRows });
      console.info(`[autoRecovery] ${orgId} migré : ${totalRows} lignes`);
    } catch (e: any) {
      console.error(`[autoRecovery] Erreur pour ${orgId}:`, e);
      result.errors.push({ orgId, error: e?.message ?? String(e) });
    }
  }

  // Pose le marker pour ne pas re-tenter
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(RECOVERY_MARKER_KEY, '1');
    }
  } catch { /* sandboxed */ }

  return result;
}

// ── PUSH ALL : Migration complète Dexie → Supabase ──────────────────
// Pousse TOUTES les tables Dexie vers Supabase en une seule passe.
// Utilisé pour la migration finale avant l'abandon de Dexie (Phase 2).
//
// Ordre : on pousse d'abord les tables "racines" (organizations, fiscal_years)
// puis celles qui référencent (periods → fiscal_year_id, gl → period_id, etc.)
// pour que les FK soient toujours satisfaites côté Supabase.

export type PushAllProgress = {
  step: string;
  table: string;
  current: number;
  total: number;
  rowsPushed: number;
};

export type PushAllResult = {
  totalTables: number;
  totalRows: number;
  details: Array<{ table: string; rows: number; ok: boolean; error?: string }>;
  duration: number;
};

const PUSH_STEPS: Array<{
  step: string;
  table: string;             // table Supabase (sans org filter ici, on filtre par orgId)
  dexieKey: keyof Pick<typeof db,
    'organizations' | 'fiscalYears' | 'periods' | 'accounts' | 'gl' | 'imports'
    | 'budgets' | 'mappings' | 'reports' | 'templates' | 'attentionPoints' | 'actionPlans'
    | 'analyticAxes' | 'analyticCodes' | 'analyticRules' | 'analyticAssignments'
    | 'analyticBudgets' | 'activities' | 'channels' | 'chatMessages'>;
  stripId?: boolean;          // strip Dexie auto-id avant insert (++id Dexie ≠ id Supabase)
}> = [
  { step: 'Sociétés',           table: 'fna_organizations',        dexieKey: 'organizations' },
  { step: 'Exercices',          table: 'fna_fiscal_years',         dexieKey: 'fiscalYears' },
  { step: 'Périodes',           table: 'fna_periods',              dexieKey: 'periods' },
  { step: 'Plan comptable',     table: 'fna_accounts',             dexieKey: 'accounts' },
  { step: 'Mappings comptes',   table: 'fna_account_mappings',     dexieKey: 'mappings' },
  { step: 'Grand Livre',        table: 'fna_gl_entries',           dexieKey: 'gl',                stripId: true },
  { step: 'Historique imports', table: 'fna_imports',              dexieKey: 'imports',           stripId: true },
  { step: 'Budgets',            table: 'fna_budgets',              dexieKey: 'budgets',           stripId: true },
  { step: 'Rapports',           table: 'fna_reports',              dexieKey: 'reports',           stripId: true },
  { step: 'Modèles rapport',    table: 'fna_report_templates',     dexieKey: 'templates',         stripId: true },
  { step: "Points d'attention", table: 'fna_attention_points',     dexieKey: 'attentionPoints',   stripId: true },
  { step: "Plans d'action",     table: 'fna_action_plans',         dexieKey: 'actionPlans',       stripId: true },
  { step: 'Axes analytiques',   table: 'fna_analytic_axes',        dexieKey: 'analyticAxes' },
  { step: 'Codes analytiques',  table: 'fna_analytic_codes',       dexieKey: 'analyticCodes' },
  { step: 'Règles analytiques', table: 'fna_analytic_rules',       dexieKey: 'analyticRules' },
  { step: 'Affectations',       table: 'fna_analytic_assignments', dexieKey: 'analyticAssignments', stripId: true },
  { step: 'Budgets analytiques',table: 'fna_analytic_budgets',     dexieKey: 'analyticBudgets',   stripId: true },
  { step: 'Activités',          table: 'fna_activities',           dexieKey: 'activities',        stripId: true },
  { step: 'Canaux chat',        table: 'fna_channels',             dexieKey: 'channels' },
  { step: 'Messages chat',      table: 'fna_chat_messages',        dexieKey: 'chatMessages',      stripId: true },
];

async function getRowsForOrg(table: any, orgId: string): Promise<any[]> {
  // db.organizations.get(orgId) → single row → wrap as array
  if (table === db.organizations) {
    const o = await db.organizations.get(orgId);
    return o ? [o] : [];
  }
  // Toutes les autres ont un index orgId
  return await table.where('orgId').equals(orgId).toArray();
}

export async function pushAllToSupabase(
  orgIds: string[],
  onProgress?: (p: PushAllProgress) => void,
): Promise<PushAllResult> {
  if (!isSupabaseConfigured) {
    return { totalTables: 0, totalRows: 0, details: [], duration: 0 };
  }
  const t0 = Date.now();
  const details: PushAllResult['details'] = [];
  let totalRows = 0;

  // BUG FIX URGENT : avant de pousser les tables, on ASSOCIE l'utilisateur courant
  // aux orgs migrées via fna_user_orgs (RLS) — sinon il ne pourra pas relire ses
  // propres données. Si l'org existe déjà avec une autre association, on ne touche
  // pas (upsert sans écrasement de role).
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id;
    if (userId) {
      const userOrgsRows = orgIds.map((oid) => ({
        user_id: userId, org_id: oid, role: 'admin' as const,
      }));
      // upsert sans écraser le rôle si déjà présent
      await supabase.from('fna_user_orgs').upsert(userOrgsRows, { onConflict: 'user_id,org_id', ignoreDuplicates: true });
      console.info(`[pushAllToSupabase] Associé user ${userId} à ${orgIds.length} org(s) via fna_user_orgs`);
    }
  } catch (e) {
    console.warn('[pushAllToSupabase] fna_user_orgs upsert failed (non bloquant):', e);
  }

  for (let i = 0; i < PUSH_STEPS.length; i++) {
    const cfg = PUSH_STEPS[i];
    const dexieTable = (db as any)[cfg.dexieKey];
    let stepRows = 0;
    let stepError: string | undefined;

    try {
      // Collecte toutes les lignes (multi-org)
      const allRows: any[] = [];
      for (const oid of orgIds) {
        const rows = await getRowsForOrg(dexieTable, oid);
        allRows.push(...rows);
      }

      onProgress?.({
        step: cfg.step,
        table: cfg.table,
        current: i + 1,
        total: PUSH_STEPS.length,
        rowsPushed: 0,
      });

      if (allRows.length === 0) {
        details.push({ table: cfg.table, rows: 0, ok: true });
        continue;
      }

      // Convert camelCase → snake_case ; strip auto-id si nécessaire
      const snakeRows = allRows.map((r) => {
        const s = toSnake(r);
        if (cfg.stripId) delete s.id;
        // Forcer Number() sur les colonnes numériques (Dexie peut avoir des string)
        if (s.debit != null) s.debit = Number(s.debit);
        if (s.credit != null) s.credit = Number(s.credit);
        if (s.amount != null) s.amount = Number(s.amount);
        if (s.year != null) s.year = Number(s.year);
        if (s.month != null) s.month = Number(s.month);
        return s;
      });

      // Push par chunks de 500 — upsert pour idempotence (sauf gl: insert seul)
      const CHUNK = 500;
      for (let j = 0; j < snakeRows.length; j += CHUNK) {
        const slice = snakeRows.slice(j, j + CHUNK);
        // Pour les tables avec auto-id (gl, imports, etc.), insert simple.
        // Pour les tables avec id stable (organizations, periods, etc.), upsert.
        const useUpsert = !cfg.stripId;
        const q = (supabase as any).from(cfg.table);
        const { error } = useUpsert
          ? await q.upsert(slice)
          : await q.insert(slice);
        if (error) {
          stepError = error.message;
          break;
        }
        stepRows += slice.length;

        onProgress?.({
          step: cfg.step,
          table: cfg.table,
          current: i + 1,
          total: PUSH_STEPS.length,
          rowsPushed: stepRows,
        });
      }

      details.push({
        table: cfg.table,
        rows: stepRows,
        ok: !stepError,
        error: stepError,
      });
      totalRows += stepRows;
    } catch (e: any) {
      details.push({
        table: cfg.table,
        rows: stepRows,
        ok: false,
        error: e?.message ?? String(e),
      });
    }
  }

  return {
    totalTables: PUSH_STEPS.length,
    totalRows,
    details,
    duration: Date.now() - t0,
  };
}
