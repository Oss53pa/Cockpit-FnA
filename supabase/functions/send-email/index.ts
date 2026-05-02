// Supabase Edge Function — Envoi d'email generique via Resend
// Accepte directement le HTML construit cote client (templates Cockpit FnA).
//
// Deploy : supabase functions deploy send-email --no-verify-jwt
// Secrets : supabase secrets set RESEND_API_KEY=re_xxx RESEND_FROM="Cockpit FnA <noreply@votre-domaine.com>"
//
// Body attendu :
// {
//   to: string,
//   recipientName?: string,
//   subject: string,
//   html: string,
//   text?: string,
//   mode?: 'invitation' | 'review' | 'report',
//   orgId?: string,
//   reportId?: number,            // si mode=report → log dans fna_email_logs
//   replyTo?: string
// }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const RESEND_FROM = Deno.env.get('RESEND_FROM') ?? 'Cockpit FnA <onboarding@resend.dev>';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
};

interface Body {
  to: string;
  recipientName?: string;
  subject: string;
  html: string;
  text?: string;
  mode?: 'invitation' | 'review' | 'report';
  orgId?: string;
  reportId?: number;
  replyTo?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  // Verifie la cle Resend
  if (!RESEND_API_KEY) {
    return json(500, {
      error: 'RESEND_API_KEY manquante',
      hint: 'Executez: supabase secrets set RESEND_API_KEY=re_xxx',
    });
  }

  // Auth
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json(401, { error: 'Unauthorized' });

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'Body JSON invalide' });
  }

  const { to, subject, html, text, mode, orgId, reportId, replyTo, recipientName } = body;
  if (!to || !subject || !html) {
    return json(400, { error: 'Champs requis : to, subject, html' });
  }

  // Verification user (pour eviter spam — toute personne loggee peut envoyer pour son orgId)
  let userId: string | null = null;
  if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user } } = await supabase.auth.getUser(token);
    userId = user?.id ?? null;
    // Si orgId fourni, verifier l'appartenance
    if (userId && orgId) {
      const { data: membership } = await supabase
        .from('fna_user_orgs')
        .select('role')
        .eq('user_id', userId)
        .eq('org_id', orgId)
        .maybeSingle();
      if (!membership) {
        return json(403, { error: "Acces refuse a cette organisation" });
      }
    }
  }

  // Envoi via Resend
  const toFormatted = recipientName ? `${recipientName} <${to}>` : to;
  const resendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: RESEND_FROM,
      to: [toFormatted],
      subject,
      html,
      text: text ?? stripHtml(html),
      reply_to: replyTo,
      tags: mode ? [{ name: 'mode', value: mode }] : undefined,
    }),
  });

  const resendData = await resendRes.json().catch(() => ({}));
  const ok = resendRes.ok;

  // Log si mode=report et orgId connu
  if (mode === 'report' && orgId && SUPABASE_URL && SUPABASE_SERVICE_KEY) {
    try {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
      await supabase.from('fna_email_logs').insert({
        org_id: orgId,
        report_id: reportId ?? null,
        recipients: [to],
        subject,
        status: ok ? 'sent' : 'failed',
        error: ok ? null : JSON.stringify(resendData).slice(0, 1000),
      });
    } catch (e) {
      console.error('Email log failed:', e);
    }
  }

  if (!ok) {
    return json(resendRes.status, {
      error: 'Resend rejette l\'envoi',
      details: resendData,
      hint: typeof resendData?.message === 'string' && resendData.message.toLowerCase().includes('domain')
        ? 'Verifiez que le domaine du champ from est bien valide chez Resend (verification DNS).'
        : undefined,
    });
  }

  return json(200, { success: true, emailId: resendData?.id, mode });
});

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

function stripHtml(html: string): string {
  return html.replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
