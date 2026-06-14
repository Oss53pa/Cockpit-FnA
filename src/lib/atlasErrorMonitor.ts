// Atlas Studio — Error Monitor reporter (web, sans dépendance).
// Remonte les erreurs non interceptées à la console Atlas Studio
// (public.error_logs via la RPC publique upsert_error_log) → alimente
// l'écran Error Monitor + l'agent Bug-Triage d'ASVC.
// Silencieux : n'impacte jamais l'app. Clé ANON Atlas = publique (aucun secret).
// Additif : coexiste avec un éventuel Sentry déjà présent.

const ATLAS_URL = 'https://vgtmljfayiysuvrcmunt.supabase.co';
const ATLAS_ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZndG1samZheWl5c3V2cmNtdW50Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5NzgyMDUsImV4cCI6MjA4NjU1NDIwNX0.a2pyz1up8ZmZk-Tl51B0v6n3eVNkBPG5L_BJAM20qt4';

type Severity = 'critical' | 'error' | 'warning' | 'info';
let APP_ID = '';
let installed = false;

function fingerprint(message: string, component?: string): string {
  const raw = `${APP_ID}::${message}::${component ?? ''}`;
  let h = 0;
  for (let i = 0; i < raw.length; i++) h = ((h << 5) - h + raw.charCodeAt(i)) | 0;
  return `as${Math.abs(h).toString(36)}`.slice(0, 32);
}

function ignorable(msg: string): boolean {
  const m = (msg || '').toLowerCase();
  return (
    m.includes('failed to fetch') ||
    m.includes('networkerror') ||
    m.includes('load failed') ||
    m.includes('signal is aborted') ||
    m.includes('aborterror') ||
    m.includes('resizeobserver loop')
  );
}

export async function captureError(
  message: string,
  opts: { stack?: string | null; component?: string | null; context?: string | null; severity?: Severity } = {},
): Promise<void> {
  try {
    if (!APP_ID || !message || ignorable(message)) return;
    const isProd = Boolean((import.meta as unknown as { env?: { PROD?: boolean } }).env?.PROD);
    await fetch(`${ATLAS_URL}/rest/v1/rpc/upsert_error_log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: ATLAS_ANON, Authorization: `Bearer ${ATLAS_ANON}` },
      body: JSON.stringify({
        p_app_id: APP_ID,
        p_fingerprint: fingerprint(message, opts.component ?? undefined),
        p_severity: opts.severity ?? 'error',
        p_message: message.slice(0, 2000),
        p_stack_trace: opts.stack ? String(opts.stack).slice(0, 10000) : null,
        p_component: opts.component ?? null,
        p_context: opts.context ?? null,
        p_metadata: {},
        p_environment: isProd ? 'production' : 'dev',
        p_app_version: null,
        p_url: typeof window !== 'undefined' ? window.location.href : null,
        p_user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      }),
      keepalive: true,
    });
  } catch {
    /* silencieux — le monitoring ne doit jamais perturber l'app */
  }
}

/** Installe les handlers globaux. À appeler une fois au démarrage. */
export function initAtlasErrorMonitor(appId: string): void {
  if (installed) return;
  installed = true;
  APP_ID = appId;
  if (typeof window === 'undefined') return;
  window.addEventListener('error', (e: ErrorEvent) => {
    const err = e.error as (Error | undefined);
    void captureError(e.message || String(err), { stack: err?.stack, context: 'window.onerror', severity: 'error' });
  });
  window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
    const r = e.reason as { message?: string; stack?: string } | undefined;
    void captureError(r?.message ? String(r.message) : String(r), { stack: r?.stack, context: 'unhandledrejection', severity: 'error' });
  });
}

export default { captureError, initAtlasErrorMonitor };
