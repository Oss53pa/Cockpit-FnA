/**
 * appConfig.ts — constantes globales de configuration applicative.
 *
 * Centralise les valeurs précédemment hardcodées dans le code (emails de
 * service, identifiants système, fallback users) pour faciliter la
 * personnalisation par déploiement (white-label / multi-tenant).
 *
 * Surcharge possible via variables d'environnement Vite (cf. .env.example).
 */

/** Email "système" pour les entrées d'audit générées automatiquement. */
export const SYSTEM_USER_EMAIL = (import.meta.env.VITE_SYSTEM_EMAIL as string | undefined)
  ?? 'system@cockpit-fna.app';

/** Identifiant utilisateur "système" (audit log, automatisations). */
export const SYSTEM_USER_ID = 'system';

/** Adresse expéditeur des emails templates (peut être surchargée par RESEND_FROM côté Edge Function). */
export const FROM_EMAIL = (import.meta.env.VITE_FROM_EMAIL as string | undefined)
  ?? 'noreply@cockpit-fna.app';

/** User invité par défaut pour le chat / commentaires (avant authentification). */
export const GUEST_USER = {
  id: 'guest',
  name: 'Invité',
  email: 'guest@cockpit-fna.app',
} as const;

/** URL Atlas Studio Suite (catalogue d'apps). */
export const ATLAS_STUDIO_URL = (import.meta.env.VITE_ATLAS_STUDIO_URL as string | undefined)
  ?? 'https://atlas-studio.app';
