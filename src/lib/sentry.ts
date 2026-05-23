// Sentry — suivi d'erreurs & performance.
//
// Le DSN vient de l'env (VITE_SENTRY_DSN). Sans DSN, Sentry reste désactivé
// (dev local non configuré). Par défaut on n'envoie QU'EN PRODUCTION pour ne
// pas polluer le projet Sentry avec les erreurs de dev/HMR.
//
// IMPORTANT (app financière SYSCOHADA) : pas de Session Replay (capture d'écran
// des données comptables sensibles) ; `sendDefaultPii: false`.
import * as Sentry from '@sentry/react';

export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return; // pas de DSN configuré → Sentry inactif

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    // N'envoie réellement les events qu'en build de production.
    enabled: import.meta.env.PROD,
    release: import.meta.env.VITE_APP_VERSION as string | undefined,
    integrations: [Sentry.browserTracingIntegration()],
    // 10 % des transactions tracées (ajustable).
    tracesSampleRate: 0.1,
    // Ne pas envoyer d'informations personnelles (IP, cookies…) par défaut.
    sendDefaultPii: false,
  });
}

export { Sentry };
