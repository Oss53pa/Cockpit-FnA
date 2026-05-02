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
import { supabase, isSupabaseConfigured } from '../lib/supabase';

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
    progress('Grand Livre');
    // Supprimer les anciennes entrées de cet org dans Dexie avant de remplacer
    const oldGlKeys = await db.gl.where('orgId').equals(oid).primaryKeys();
    if (oldGlKeys.length > 0) await db.gl.bulkDelete(oldGlKeys);
    const glRows = await fetchAll('fna_gl_entries', oid);
    if (glRows.length > 0) {
      const mapped = glRows.map((r: any) => {
        const c = toCamel(r) as any;
        // Supabase bigserial id → Dexie auto-increment: on laisse Dexie gérer
        c.importId = c.importId != null ? String(c.importId) : undefined;
        delete c.id;
        return c;
      });
      // Bulk insert par chunks de 5000
      for (let i = 0; i < mapped.length; i += 5000) {
        await db.gl.bulkAdd(mapped.slice(i, i + 5000));
      }
      totalEntries += mapped.length;
    }

    // 6. Imports
    progress('Imports');
    const imports = await fetchAll('fna_imports', oid);
    if (imports.length > 0) await db.imports.bulkPut(imports.map((r: any) => toCamel(r) as any));

    // 7. Budgets
    progress('Budgets');
    const budgets = await fetchAll('fna_budgets', oid);
    if (budgets.length > 0) await db.budgets.bulkPut(budgets.map((r: any) => toCamel(r) as any));

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
