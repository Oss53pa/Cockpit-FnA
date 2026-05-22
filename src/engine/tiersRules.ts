// Moteur — Règles de correction tiers mémorisées.
//
// Une règle corrige une incohérence du rapprochement (écriture de classe 4
// SANS code tiers) de façon RÉUTILISABLE :
//   • action 'assign' : poser le code tiers `tiers` sur les écritures sans tiers
//     du compte ciblé (réappliqué automatiquement après chaque import GL).
//   • action 'ignore' : marquer l'écart comme justifié → exclu de l'écart du
//     rapprochement (cf. buildReconRow dans balance.ts).
//
// Source de données : Supabase via dataProvider (table fna_tiers_rules,
// migration 021). Le chargement est résilient si la migration n'est pas encore
// appliquée (retourne []).
import type { GLEntry, TiersRule } from '../db/schema';
import { dataProvider } from '../db/provider';
import { logGLChanges, type AuditChange } from '../lib/glAuditLog';

// Pure — une règle s'applique à une écriture si le compte correspond
// exactement ET (si précisé) le libellé contient le motif.
export function matchesTiersRule(e: GLEntry, rule: TiersRule): boolean {
  if (e.account !== rule.account) return false;
  if (rule.labelContains) {
    const hay = (e.label ?? '').toLowerCase();
    if (!hay.includes(rule.labelContains.toLowerCase())) return false;
  }
  return true;
}

// Charge les règles d'une org (résilient si la table/migration est absente).
export async function loadTiersRules(orgId: string): Promise<TiersRule[]> {
  try {
    return await dataProvider.getTiersRules(orgId);
  } catch (e) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn('[tiersRules] getTiersRules indisponible (migration 021 non appliquée ?) :', e);
    }
    return [];
  }
}

/**
 * Applique les règles 'assign' : pose le code tiers sur les écritures SANS tiers
 * qui correspondent. Trace chaque modification dans l'audit log (non bloquant).
 * Idempotent : une écriture déjà rattachée à un tiers n'est jamais retouchée.
 *
 * @returns nombre d'écritures GL mises à jour.
 */
export async function applyTiersRules(orgId: string): Promise<{ updated: number }> {
  const rules = (await loadTiersRules(orgId)).filter((r) => r.action === 'assign' && !!r.tiers);
  if (rules.length === 0) return { updated: 0 };

  const entries = await dataProvider.getGLEntries({ orgId });
  const changes: AuditChange[] = [];
  let updated = 0;

  for (const e of entries) {
    if (e.tiers || e.id === undefined) continue; // déjà rattaché ou sans id
    const rule = rules.find((r) => matchesTiersRule(e, r));
    if (!rule || !rule.tiers) continue;

    const oldLabel = e.label;
    const newLabel = (!e.label || e.label === '—') ? (rule.tiersLabel || e.label) : e.label;
    try {
      await dataProvider.updateGLEntry(e.id, { tiers: rule.tiers, label: newLabel });
    } catch (err) {
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.warn('[tiersRules] updateGLEntry échec', e.id, err);
      }
      continue;
    }
    changes.push({ glEntryId: e.id, field: 'tiers', oldValue: e.tiers, newValue: rule.tiers, reason: 'manual_match', sourceKind: 'MANUAL', sourceId: rule.id });
    if (newLabel !== oldLabel) {
      changes.push({ glEntryId: e.id, field: 'label', oldValue: oldLabel, newValue: newLabel, reason: 'manual_match', sourceKind: 'MANUAL', sourceId: rule.id });
    }
    updated++;
  }

  if (changes.length > 0) await logGLChanges(orgId, changes);
  return { updated };
}
