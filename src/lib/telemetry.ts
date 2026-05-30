/**
 * Télémétrie minimale pour beta privée.
 *
 * Sans dépendance externe (pas de Sentry, pas de Datadog), on capture :
 *   - Les erreurs JS non gérées (window.onerror, unhandledrejection)
 *   - Les actions critiques (import GL, import tiers, rattachement manuel)
 *   - Le contexte (org_id, user_id, route, browser)
 *
 * Les events sont POST-és vers une Edge Function Supabase qui les écrit dans
 * `fna_telemetry_events`. Si l'endpoint n'existe pas, fallback console.warn —
 * non bloquant pour l'app.
 *
 * Pendant la beta : on garde le payload léger (max 4 KB), pas de stack trace
 * complète (RGPD), pas de données utilisateur identifiantes (juste user_id UUID).
 * Pour une vraie observabilité GA → migrer vers Sentry/PostHog.
 */

import { supabase } from './supabase';

type TelemetryLevel = 'info' | 'warn' | 'error';

type TelemetryEvent = {
  level: TelemetryLevel;
  event: string;          // 'import_gl' | 'import_tiers' | 'manual_match' | 'js_error' | ...
  orgId?: string;
  message?: string;
  metadata?: Record<string, string | number | boolean>;
  url?: string;
  userAgent?: string;
};

let initialized = false;
let userId: string | null = null;

/**
 * À appeler au démarrage de l'app (après authentification si possible).
 * Configure les listeners globaux et la session.
 */
export async function initTelemetry(): Promise<void> {
  if (initialized) return;
  initialized = true;
  try {
    const { data } = await supabase.auth.getUser();
    userId = data.user?.id ?? null;
  } catch {
    userId = null;
  }
  // Catch JS errors globaux
  if (typeof window !== 'undefined') {
    window.addEventListener('error', (e) => {
      void track('error', 'js_error', {
        message: e.message,
        metadata: {
          filename: e.filename ?? '',
          lineno: e.lineno ?? 0,
          colno: e.colno ?? 0,
        },
      });
    });
    window.addEventListener('unhandledrejection', (e) => {
      const reason = e.reason instanceof Error ? e.reason.message : String(e.reason);
      void track('error', 'unhandled_promise_rejection', { message: reason });
    });
  }
}

/**
 * Envoie un event de télémétrie.
 *
 * Non bloquant : si l'endpoint échoue, on log en console et on continue.
 * Pas de retry, pas de queue persistante — c'est de la télémétrie best-effort.
 */
export async function track(
  level: TelemetryLevel,
  event: string,
  partial: Partial<Omit<TelemetryEvent, 'level' | 'event'>> = {},
): Promise<void> {
  try {
    const payload: TelemetryEvent & { userId?: string | null; timestamp: number } = {
      level,
      event,
      ...partial,
      userId,
      url: typeof window !== 'undefined' ? window.location.pathname : undefined,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent.substring(0, 200) : undefined,
      timestamp: Date.now(),
    };
    // Tronquer le message à 1 KB pour éviter de remplir la DB
    if (payload.message && payload.message.length > 1024) {
      payload.message = payload.message.substring(0, 1024) + '…';
    }
    // Edge Function Supabase recommandée : POST /functions/v1/telemetry
    // En attendant, on log juste en console pendant la beta.
    if (import.meta.env.DEV) {
      console.log('[telemetry]', payload);
    } else {
      // En prod, on tente l'envoi (best-effort)
      const url = `${(import.meta.env.VITE_SUPABASE_URL || '')}/functions/v1/telemetry`;
      if (!url || !import.meta.env.VITE_SUPABASE_ANON_KEY) return;
      // Fire-and-forget, pas d'await pour ne pas bloquer le caller
      void fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY as string,
        },
        body: JSON.stringify(payload),
        keepalive: true, // survit à la fermeture de l'onglet
      }).catch(() => { /* ignore */ });
    }
  } catch {
    // Jamais throw depuis la télémétrie
  }
}

/** Helpers pratiques */
export const telemetry = {
  info: (event: string, partial?: Parameters<typeof track>[2]) => track('info', event, partial),
  warn: (event: string, partial?: Parameters<typeof track>[2]) => track('warn', event, partial),
  error: (event: string, partial?: Parameters<typeof track>[2]) => track('error', event, partial),
};
