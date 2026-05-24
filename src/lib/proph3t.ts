/**
 * proph3t.ts — Intégration Atlas Studio « Proph3t core » pour Cockpit F&A.
 * ----------------------------------------------------------------------------
 * Adapté du snippet de référence oss53pa/atlas-studio-website
 * (docs/snippets/proph3t-integration.ts). PRODUCT = "cockpit-fa".
 *
 * Deux modes complémentaires existent dans le brief Atlas Studio :
 *   A) Fédération (SDK)  → l'agent local garde le LLM ; le core fournit mémoire
 *      inter-apps, RAG SYSCOHADA/OHADA/CGI, 197 outils et audit SHA-256.
 *      Dans CETTE app, le Mode A est déjà câblé via l'adaptateur tolérant aux
 *      pannes `src/lib/proph3tFederation.ts` (searchKnowledge / recall /
 *      runTool / logAudit), consommé par le moteur Proph3 local
 *      (`src/engine/proph3/index.ts`). On NE le réimplémente donc pas ici.
 *      Raison du découplage : le package `@atlas-studio/proph3t-client` est
 *      linké en `file:` et n'expose pas de build résolvable par le bundler
 *      (son `exports.import` pointe sur un `dist/index.mjs` non émis) ; le
 *      garder hors du graphe de build de ce module garantit que le build et le
 *      typecheck passent même quand le SDK est absent (cf. CI).
 *   B) Hébergé (ask)     → askProph3t() : on délègue tout le tour à
 *      l'orchestrateur hébergé, avec gouvernance par SENSIBILITÉ des données.
 *      100 % `fetch`, aucune dépendance au SDK. C'est le flux câblé ici
 *      (cf. `src/pages/AI.tsx`, sélecteur « Atlas Core »).
 *
 * Particularité Cockpit F&A : le projet Supabase de l'app EST le projet core
 * Atlas (vgtmljfayiysuvrcmunt). La session Supabase de l'utilisateur est donc
 * un JWT valide contre le core → la RLS s'applique. On la passe en `userToken`.
 * Les variables VITE_ATLAS_* permettent de pointer ailleurs si un jour l'app
 * est découplée du core ; à défaut elles retombent sur VITE_SUPABASE_*.
 */

// supabase = le client Supabase de l'app (= projet core) pour récupérer le JWT user.
import { supabase } from './supabase';
import { safeLocalStorage } from './safeStorage';

/** Id de Cockpit F&A au catalogue Atlas Studio (le core normalise les alias). */
export const PRODUCT = 'cockpit-fa';

const ATLAS_CORE_URL =
  (import.meta.env.VITE_ATLAS_SUPABASE_URL as string | undefined) ||
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ||
  'https://vgtmljfayiysuvrcmunt.supabase.co';

const ATLAS_CORE_ANON =
  (import.meta.env.VITE_ATLAS_SUPABASE_ANON_KEY as string | undefined) ||
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ||
  '';

/**
 * JWT Atlas Studio posé par le SSO (cf. `src/pages/auth/AtlasSSO.tsx`).
 * Sert de repli quand l'utilisateur n'a pas (encore) de session Supabase.
 */
const FEDERATION_TOKEN_KEY = 'atlas_federation_token';

/**
 * Résout le JWT utilisateur valide contre le core.
 * Priorité : session Supabase de l'app (= projet core, RLS appliquée) ;
 * repli : le JWT Atlas SSO persisté en localStorage.
 * Retourne `undefined` si aucun token → seuls les endpoints publics répondront.
 */
async function resolveUserToken(): Promise<string | undefined> {
  try {
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) return data.session.access_token;
  } catch {
    /* pas de session Supabase — on tente le token de fédération */
  }
  return safeLocalStorage.getItem(FEDERATION_TOKEN_KEY) ?? undefined;
}

// ============================================================
// MODE B — Hébergé : déléguer tout le tour à proph3t-ask
// ============================================================

export type Sensitivity = 'confidential' | 'internal' | 'public';

export interface AskResult {
  conversation_id: string;
  answer: string;
  citations: unknown[];
  confidence: number;
  disclaimer?: string;
}

/**
 * Pose une question à l'orchestrateur Proph3t hébergé.
 *
 * `sensitivity` gouverne les providers autorisés CÔTÉ CORE :
 *   - "confidential" → Ollama + Claude uniquement (aucune rétention).
 *     À utiliser pour relevés bancaires, liasses fiscales, paie, contrats,
 *     due diligence. Si aucune clé Ollama/Claude n'est dispo, le core refuse
 *     proprement plutôt que de router vers un tier gratuit.
 *   - "internal" (défaut) / "public" → tous providers selon disponibilité.
 */
export async function askProph3t(params: {
  message: string;
  sensitivity?: Sensitivity;
  conversationId?: string;
  societyId?: string;
}): Promise<AskResult> {
  const userToken = await resolveUserToken();
  const res = await fetch(`${ATLAS_CORE_URL}/functions/v1/proph3t-ask`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: ATLAS_CORE_ANON,
      Authorization: `Bearer ${userToken ?? ATLAS_CORE_ANON}`,
    },
    body: JSON.stringify({
      message: params.message,
      product: PRODUCT,
      sensitivity: params.sensitivity ?? 'internal',
      conversation_id: params.conversationId,
      society_id: params.societyId,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`proph3t-ask ${res.status}: ${detail || res.statusText}`);
  }
  return res.json() as Promise<AskResult>;
}
