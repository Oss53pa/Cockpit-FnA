/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck — WIP: waiting for @atlas-studio/proph3t-client package (peer dep
// linké via file:../SiteWeb Atlas Studio/proph3t-client en local, absent en CI).
// `@ts-nocheck` est requis car les types ne sont pas résolvables hors du
// worktree local. Le code est défensif (try/catch + return null/[]) donc
// l'absence du package en runtime ne casse pas l'app — cf. dégradation
// gracieuse dans la docstring ci-dessous.
/**
 * Proph3t federation adapter for Cockpit F&A.
 *
 * The local Proph3t engine (`src/engine/proph3/*`) stays in charge of the LLM
 * call (Ollama or local rule-based fallback). This adapter plugs the engine
 * into the Atlas Studio shared core for:
 *
 *   1. searchKnowledge — RAG on SYSCOHADA/OHADA centralisé (sources à jour
 *      partout, plus de drift entre apps)
 *   2. recall          — mémoire utilisateur cross-app (ce que l'utilisateur
 *      a déjà demandé dans TableSmart ou AtlasBanx remonte ici)
 *   3. logAudit        — chaîne SHA-256 OHADA-grade
 *   4. runTool         — accès aux 197 tools centraux (compute_irpp_uemoa, etc.)
 *
 * Tous les appels ont une dégradation gracieuse : si le core est down, la
 * fonction renvoie `null` / `[]` sans bloquer la réponse Proph3 locale.
 *
 * Voir docs/PROPH3T_FEDERATION.md (repo SiteWeb Atlas Studio).
 */

import { Proph3tClient, Proph3tError } from "@atlas-studio/proph3t-client";
import type { KnowledgeHit, MemoryHit } from "@atlas-studio/proph3t-client";

const ATLAS_SUPABASE_URL =
  import.meta.env.VITE_ATLAS_SUPABASE_URL ??
  "https://vgtmljfayiysuvrcmunt.supabase.co";
const ATLAS_SUPABASE_ANON_KEY =
  import.meta.env.VITE_ATLAS_SUPABASE_ANON_KEY ?? "";

const TOKEN_STORAGE_KEY = "atlas_federation_token";

let cachedClient: Proph3tClient | null = null;
let cachedToken: string | null = null;

/**
 * Build (or reuse) the federation client. Returns `null` when:
 *   - the user never came through the Atlas Studio SSO (no token in storage),
 *   - OR the SDK envs are missing.
 *
 * The caller MUST check for null and fall back to local-only behaviour.
 */
export function getProph3tClient(): Proph3tClient | null {
  if (!ATLAS_SUPABASE_ANON_KEY) return null;

  let token: string | null = null;
  try {
    token = localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    /* localStorage unavailable */
  }
  if (!token) return null;

  if (cachedClient && cachedToken === token) return cachedClient;

  cachedToken = token;
  cachedClient = new Proph3tClient({
    product: "cockpit-fa",
    supabaseUrl: ATLAS_SUPABASE_URL,
    apiKey: ATLAS_SUPABASE_ANON_KEY,
    userToken: token,
    timeoutMs: 8000, // hard cap — local engine still has to respond
  });
  return cachedClient;
}

/** Drop the cached client (e.g. on logout, on SSO refresh). */
export function resetProph3tClient(): void {
  cachedClient = null;
  cachedToken = null;
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Hook 1 — searchKnowledge (central RAG SYSCOHADA / OHADA / CGI)
// ──────────────────────────────────────────────────────────────────────────

export interface FederatedKnowledgeRef {
  title: string;
  content: string;
  citation?: string;
}

export async function federatedSearchKnowledge(
  query: string,
  topK = 3,
): Promise<FederatedKnowledgeRef[]> {
  const client = getProph3tClient();
  if (!client) return [];
  try {
    const hits: KnowledgeHit[] = await client.searchKnowledge({
      query,
      sourceType: "syscohada",
      topK,
    });
    return hits.map((h) => ({
      title: h.title,
      content: h.excerpt,
      citation: h.citation,
    }));
  } catch (err) {
    if (err instanceof Proph3tError) {
      console.warn("[proph3t-federation] searchKnowledge fallback:", err.message);
    }
    return [];
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Hook 2 — recall (cross-app user memory)
// ──────────────────────────────────────────────────────────────────────────

export async function federatedRecall(
  query: string,
  limit = 5,
): Promise<MemoryHit[]> {
  const client = getProph3tClient();
  if (!client) return [];
  try {
    return await client.recall({ query, limit });
  } catch (err) {
    if (err instanceof Proph3tError) {
      console.warn("[proph3t-federation] recall fallback:", err.message);
    }
    return [];
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Hook 3 — logAudit (chained SHA-256, OHADA-grade)
// ──────────────────────────────────────────────────────────────────────────

export interface AuditPayload {
  /** e.g. "ai_response", "report_generated", "anomaly_acknowledged" */
  action: string;
  orgId?: string;
  content: Record<string, unknown>;
}

export async function federatedLogAudit(payload: AuditPayload): Promise<void> {
  const client = getProph3tClient();
  if (!client) return;
  try {
    await client.logAudit({
      action: payload.action,
      subjectType: payload.orgId ? "society" : undefined,
      subjectId: payload.orgId,
      content: payload.content,
    });
  } catch (err) {
    if (err instanceof Proph3tError) {
      console.warn("[proph3t-federation] logAudit fallback:", err.message);
    }
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Hook 4 — runTool (any of the 197 central tools)
// ──────────────────────────────────────────────────────────────────────────

export async function federatedRunTool<TData = unknown>(
  name: string,
  args: Record<string, unknown>,
): Promise<TData | null> {
  const client = getProph3tClient();
  if (!client) return null;
  try {
    const r = await client.runTool<TData>({ name, args });
    return r.result;
  } catch (err) {
    if (err instanceof Proph3tError) {
      console.warn(
        `[proph3t-federation] runTool(${name}) fallback:`,
        err.message,
      );
    }
    return null;
  }
}
