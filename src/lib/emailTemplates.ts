/**
 * Templates d'emails HTML — branding Cockpit FnA cohérent.
 *
 * 3 templates actuels :
 *  1. invitation : invite un nouvel utilisateur à se connecter
 *  2. review     : invite un destinataire à relire / valider un rapport
 *  3. report     : diffusion finale d'un rapport (PDF en pièce jointe)
 *
 * Chaque template renvoie { subject, textBody, htmlBody } prêts à l'envoi
 * via :
 *  - Supabase Auth invite (cas 1 uniquement)
 *  - Supabase Edge Function send-email (cas 2 et 3)
 *  - mailto: pré-rempli (fallback universel)
 *  - Copie HTML + .eml téléchargeable
 */

export interface EmailContent {
  subject: string;
  textBody: string;
  htmlBody: string;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ─── Layout HTML commun ───────────────────────────────────────────────
function wrapHtml(headerLabel: string, headerTitle: string, content: string): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(headerTitle)}</title>
</head>
<body style="margin:0; padding:0; background:#f5f5f7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color:#222834;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f5f5f7; padding:40px 0;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px; background:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.08);">
        <tr><td style="background:#222834; padding:32px 40px; text-align:left;">
          <p style="margin:0; color:#E7EBEE; font-size:14px; letter-spacing:0.1em; text-transform:uppercase; font-weight:600;">${escapeHtml(headerLabel)}</p>
          <p style="margin:8px 0 0; color:#ffffff; font-size:24px; font-weight:700; letter-spacing:-0.02em;">${escapeHtml(headerTitle)}</p>
        </td></tr>
        <tr><td style="padding:40px;">${content}</td></tr>
        <tr><td style="background:#F8F9FB; padding:24px 40px; text-align:center; border-top:1px solid #E7EBEE;">
          <p style="margin:0; font-size:11px; color:#939BAA;">Cockpit FnA · Pilotage financier SYSCOHADA · Confidentiel</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function ctaButton(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
    <tr><td align="center" style="padding:8px 0 24px;">
      <a href="${escapeHtml(href)}" style="display:inline-block; background:#DA4D28; color:#ffffff; text-decoration:none; padding:14px 32px; border-radius:999px; font-size:15px; font-weight:600; box-shadow:0 2px 8px rgba(218,77,40,0.25);">
        ${escapeHtml(label)} →
      </a>
    </td></tr>
  </table>`;
}

function infoCard(rows: { label: string; value: string; highlight?: boolean }[]): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#F8F9FB; border-radius:12px; padding:20px; margin-bottom:24px;">
    ${rows.map((r) => `
    <tr><td style="padding:8px 0; font-size:13px;">
      <span style="color:#6E7888; display:inline-block; width:140px;">${escapeHtml(r.label)} :</span>
      <strong style="color:${r.highlight ? '#DA4D28' : '#222834'};">${escapeHtml(r.value)}</strong>
    </td></tr>`).join('')}
  </table>`;
}

// ─── Template 1 : INVITATION CONNEXION ────────────────────────────────

export interface InvitationParams {
  recipientName: string;
  recipientEmail: string;
  roleLabel: string;
  orgsLabel: string;
  appUrl: string;
}

export function buildInvitationEmail(p: InvitationParams): EmailContent {
  const subject = `Invitation Cockpit FnA — Définissez votre mot de passe`;

  // Le placeholder {{ACTION_LINK}} sera remplacé par l'Edge Function
  // 'cockpit-invite-user' avec un magic link Supabase qui :
  //  1. Crée le compte Supabase Auth avec l'email
  //  2. Établit la session lors du clic
  //  3. Redirige vers /auth/accept-invite où l'utilisateur définit son mdp
  const ACTION_LINK = '{{ACTION_LINK}}';

  const textBody = `Bonjour ${p.recipientName},

Vous avez été invité(e) à rejoindre Cockpit FnA, l'outil de pilotage financier SYSCOHADA.

Vos accès :
• Email de connexion : ${p.recipientEmail}
• Rôle : ${p.roleLabel}
• Sociétés : ${p.orgsLabel}

Pour activer votre compte et définir votre mot de passe, cliquez sur le lien ci-dessous (valable 24h) :
${ACTION_LINK}

Cordialement,
L'équipe Cockpit FnA`;

  const content = `
    <p style="margin:0 0 16px; font-size:16px; line-height:1.6;">Bonjour <strong>${escapeHtml(p.recipientName)}</strong>,</p>
    <p style="margin:0 0 24px; font-size:14px; line-height:1.6; color:#525C6E;">
      Vous avez été invité(e) à rejoindre <strong>Cockpit FnA</strong>, l'outil de pilotage financier SYSCOHADA. Voici les détails de votre compte :
    </p>
    ${infoCard([
      { label: 'Email', value: p.recipientEmail },
      { label: 'Rôle', value: p.roleLabel, highlight: true },
      { label: 'Sociétés', value: p.orgsLabel },
    ])}
    <p style="margin:24px 0 16px; font-size:14px; line-height:1.6;">
      Pour <strong>activer votre compte</strong> et <strong>définir votre mot de passe</strong>, cliquez sur le bouton ci-dessous :
    </p>
    ${ctaButton(ACTION_LINK, 'Activer mon compte et définir mon mot de passe')}
    <p style="margin:0 0 8px; font-size:13px; line-height:1.6; color:#525C6E;">
      Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :
    </p>
    <p style="margin:0; font-size:12px; word-break:break-all;">
      <a href="${ACTION_LINK}" style="color:#7FA88E; text-decoration:underline;">${ACTION_LINK}</a>
    </p>
    <p style="margin:32px 0 0; font-size:12px; line-height:1.6; color:#7A776E; padding-top:20px; border-top:1px solid #E7EBEE;">
      <strong>⏱ Lien valable 24 heures.</strong> Passé ce délai, demandez à votre administrateur de relancer l'invitation. Si vous n'attendez pas cet email, ignorez-le ou contactez <a href="mailto:support@atlas-studio.org" style="color:#7FA88E;">support@atlas-studio.org</a>.
    </p>`;

  return { subject, textBody, htmlBody: wrapHtml('Cockpit FnA', 'Activez votre compte', content) };
}

// ─── Template 2 : REVIEW / VALIDATION ─────────────────────────────────

export interface ReviewParams {
  recipientName: string;
  recipientEmail: string;
  reportTitle: string;
  reportPeriod: string;
  authorName: string;
  reviewUrl: string;          // lien vers le rapport en mode review
  deadline?: string;          // ISO date facultative
  comments?: string;          // commentaire personnalisé du sender
}

export function buildReviewEmail(p: ReviewParams): EmailContent {
  const subject = `Revue requise — ${p.reportTitle}`;
  const dl = p.deadline ? new Date(p.deadline).toLocaleDateString('fr-FR', { dateStyle: 'long' }) : '—';

  const textBody = `Bonjour ${p.recipientName},

${p.authorName} vous demande de relire et valider le rapport suivant :

• Rapport : ${p.reportTitle}
• Période : ${p.reportPeriod}
• Auteur : ${p.authorName}
${p.deadline ? `• Échéance : ${dl}\n` : ''}${p.comments ? `\nMessage de ${p.authorName} :\n${p.comments}\n` : ''}
Consultez le rapport et apposez votre validation :
${p.reviewUrl}

Cordialement,
Cockpit FnA`;

  const content = `
    <p style="margin:0 0 16px; font-size:16px; line-height:1.6;">Bonjour <strong>${escapeHtml(p.recipientName)}</strong>,</p>
    <p style="margin:0 0 24px; font-size:14px; line-height:1.6; color:#525C6E;">
      <strong>${escapeHtml(p.authorName)}</strong> vous demande de relire et valider le rapport ci-dessous avant diffusion finale.
    </p>
    ${infoCard([
      { label: 'Rapport', value: p.reportTitle, highlight: true },
      { label: 'Période', value: p.reportPeriod },
      { label: 'Auteur', value: p.authorName },
      ...(p.deadline ? [{ label: 'Échéance', value: dl }] : []),
    ])}
    ${p.comments ? `
    <div style="background:#FFF8F0; border-left:3px solid #DA4D28; padding:16px 20px; margin-bottom:24px; border-radius:0 8px 8px 0;">
      <p style="margin:0 0 8px; font-size:11px; color:#DA4D28; letter-spacing:0.05em; text-transform:uppercase; font-weight:700;">Message de ${escapeHtml(p.authorName)}</p>
      <p style="margin:0; font-size:14px; line-height:1.6; color:#222834;">${escapeHtml(p.comments).replace(/\n/g, '<br>')}</p>
    </div>` : ''}
    ${ctaButton(p.reviewUrl, 'Consulter et valider')}
    <p style="margin:32px 0 0; font-size:13px; line-height:1.6; color:#525C6E; padding-top:24px; border-top:1px solid #E7EBEE;">
      Une fois ouvert, vous pourrez <strong>annoter, commenter et apposer votre validation</strong>. Le rapport sera ensuite diffusé aux destinataires finaux.
    </p>`;

  return { subject, textBody, htmlBody: wrapHtml('Workflow de validation', 'Revue d\'un rapport', content) };
}

// ─── Template 3 : DIFFUSION RAPPORT ───────────────────────────────────

export interface ReportParams {
  recipientName: string;
  recipientEmail: string;
  reportTitle: string;
  reportPeriod: string;
  authorName: string;
  appUrl: string;             // lien vers le rapport en lecture
  pdfAttached: boolean;       // si PDF joint
  summary?: string;           // synthèse 2-3 lignes
  highlights?: string[];      // bullet points (3-5 max)
  hasComments?: boolean;      // si l'utilisateur peut commenter
}

export function buildReportEmail(p: ReportParams): EmailContent {
  const subject = `${p.reportTitle} — ${p.reportPeriod}`;

  const textBody = `Bonjour ${p.recipientName},

${p.authorName} vous transmet le rapport suivant :

• Rapport : ${p.reportTitle}
• Période : ${p.reportPeriod}
• Auteur : ${p.authorName}
${p.pdfAttached ? '• Le PDF est joint à cet email.\n' : ''}${p.summary ? `\nSynthèse :\n${p.summary}\n` : ''}${p.highlights && p.highlights.length > 0 ? `\nPoints clés :\n${p.highlights.map((h) => `• ${h}`).join('\n')}\n` : ''}
Consulter en ligne :
${p.appUrl}

Cordialement,
Cockpit FnA`;

  const content = `
    <p style="margin:0 0 16px; font-size:16px; line-height:1.6;">Bonjour <strong>${escapeHtml(p.recipientName)}</strong>,</p>
    <p style="margin:0 0 24px; font-size:14px; line-height:1.6; color:#525C6E;">
      <strong>${escapeHtml(p.authorName)}</strong> vous transmet le rapport ci-dessous.
    </p>
    ${infoCard([
      { label: 'Rapport', value: p.reportTitle, highlight: true },
      { label: 'Période', value: p.reportPeriod },
      { label: 'Auteur', value: p.authorName },
      ...(p.pdfAttached ? [{ label: 'Pièce jointe', value: 'PDF complet' }] : []),
    ])}
    ${p.summary ? `
    <div style="background:#F8F9FB; border-radius:12px; padding:20px; margin-bottom:24px;">
      <p style="margin:0 0 8px; font-size:11px; color:#6E7888; letter-spacing:0.05em; text-transform:uppercase; font-weight:700;">Synthèse</p>
      <p style="margin:0; font-size:14px; line-height:1.6; color:#222834;">${escapeHtml(p.summary).replace(/\n/g, '<br>')}</p>
    </div>` : ''}
    ${p.highlights && p.highlights.length > 0 ? `
    <div style="margin-bottom:24px;">
      <p style="margin:0 0 12px; font-size:11px; color:#6E7888; letter-spacing:0.05em; text-transform:uppercase; font-weight:700;">Points clés</p>
      <ul style="margin:0; padding-left:20px; font-size:14px; line-height:1.8; color:#222834;">
        ${p.highlights.map((h) => `<li>${escapeHtml(h)}</li>`).join('')}
      </ul>
    </div>` : ''}
    ${ctaButton(p.appUrl, 'Consulter le rapport en ligne')}
    ${p.hasComments ? `
    <p style="margin:24px 0 0; font-size:13px; line-height:1.6; color:#525C6E; padding-top:20px; border-top:1px solid #E7EBEE;">
      💬 Vous pouvez <strong>commenter et poser des questions</strong> directement dans l'application. Vos commentaires seront visibles par l'auteur et les autres destinataires.
    </p>` : ''}
    <p style="margin:24px 0 0; font-size:12px; line-height:1.6; color:#939BAA;">
      Document confidentiel destiné aux destinataires nommés. Toute reproduction ou diffusion non autorisée est interdite.
    </p>`;

  return { subject, textBody, htmlBody: wrapHtml('Cockpit FnA', p.reportTitle, content) };
}

// ─── Helpers UI partagés ──────────────────────────────────────────────

/** Génère un mailto: avec subject et corps texte pré-remplis. */
export function buildMailto(to: string, content: EmailContent): string {
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(content.subject)}&body=${encodeURIComponent(content.textBody)}`;
}

/** Génère un fichier .eml téléchargeable. */
export function buildEmlBlob(to: string, content: EmailContent): Blob {
  const eml = `From: noreply@cockpit-fna.app
To: ${to}
Subject: ${content.subject}
MIME-Version: 1.0
Content-Type: text/html; charset=UTF-8

${content.htmlBody}`;
  return new Blob([eml], { type: 'message/rfc822' });
}
