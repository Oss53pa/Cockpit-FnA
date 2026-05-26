// ════════════════════════════════════════════════════════════════════
// TEMPLATE — Helper client pour inviter un utilisateur (React / supabase-js)
//
// Usage (depuis votre écran admin, après confirmation de l'admin) :
//   const res = await inviteUser({
//     email, name, role: 'editor', orgIds: ['org-123'], appUrl: location.origin,
//   });
//   if (!res.success) { /* afficher res.error ; res.magicLink dispo pour copie manuelle */ }
// ════════════════════════════════════════════════════════════════════
import { supabase } from './supabaseClient'; // ← votre client supabase-js

const APP_NAME = 'MonApp';
const BRAND_COLOR = '#2563eb';

export interface InvitePayload {
  email: string;
  name: string;
  role: 'admin' | 'editor' | 'viewer';
  orgIds: string[];
  appUrl: string;          // ex: window.location.origin
  orgsLabel?: string;      // ex: "ACME SA, Filiale B" (affichage)
  forceRecovery?: boolean; // true = renvoi pour un user existant
}

export interface InviteResult {
  success: boolean;
  error?: string;
  magicLink?: string;      // repli : à copier/coller si l'email n'est pas parti
  linkType?: 'invite' | 'recovery';
}

/** Construit l'email HTML. Le placeholder {{ACTION_LINK}} est remplacé côté serveur. */
export function buildInvitationEmail(p: { recipientName: string; roleLabel: string; orgsLabel: string }) {
  const subject = `[${APP_NAME}] Vous êtes invité — activez votre compte`;
  const htmlBody = `
  <div style="font-family:system-ui,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a">
    <h2 style="margin:0 0 8px">Bienvenue sur ${APP_NAME}</h2>
    <p>Bonjour ${p.recipientName},</p>
    <p>Vous avez été invité avec le rôle <strong>${p.roleLabel}</strong> sur : <strong>${p.orgsLabel}</strong>.</p>
    <p>Cliquez ci-dessous pour définir votre mot de passe et accéder à l'application.</p>
    <div style="text-align:center;margin:28px 0">
      <a href="{{ACTION_LINK}}" style="display:inline-block;padding:14px 32px;background:${BRAND_COLOR};color:#fff;text-decoration:none;border-radius:10px;font-weight:600">
        Activer mon compte
      </a>
    </div>
    <p style="font-size:12px;color:#888">Si le bouton ne fonctionne pas, ce lien est à usage unique et expire après quelques heures. Vous pourrez aussi utiliser « Mot de passe oublié » sur la page de connexion.</p>
  </div>`;
  return { subject, htmlBody };
}

export async function inviteUser(p: InvitePayload): Promise<InviteResult> {
  const roleLabel = { admin: 'Administrateur', editor: 'Éditeur', viewer: 'Lecture seule' }[p.role];
  const { subject, htmlBody } = buildInvitationEmail({
    recipientName: p.name,
    roleLabel,
    orgsLabel: p.orgsLabel ?? 'Toutes les sociétés autorisées',
  });

  const { data, error } = await supabase.functions.invoke('invite-user', {
    body: {
      email: p.email, name: p.name, role: p.role, orgIds: p.orgIds,
      appUrl: p.appUrl, subject, html: htmlBody, forceRecovery: p.forceRecovery,
    },
  });

  if (error) return { success: false, error: error.message ?? 'Erreur réseau Edge Function' };
  if (data?.success === false) {
    return { success: false, error: data.error ?? 'Échec', magicLink: data.magicLink, linkType: data.linkType };
  }
  return { success: true, linkType: data?.linkType };
}
