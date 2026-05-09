// Supabase Edge Function — cockpit-send-email
//
// Wrapper namespacé "cockpit-*" appelé par Settings.tsx et EmailPreviewModal.tsx.
// Délègue à la function `send-email` qui gère l'envoi Resend + log dans fna_email_logs.
//
// Pourquoi ce wrapper ? Permet de versionner / déployer indépendamment les deps
// "Cockpit FnA" sans toucher aux functions partagées avec d'autres apps Atlas Studio.
//
// Deploy : supabase functions deploy cockpit-send-email --no-verify-jwt
// Secrets : RESEND_API_KEY, RESEND_FROM_COCKPIT (ou RESEND_FROM en fallback).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const RESEND_FROM = Deno.env.get('RESEND_FROM_COCKPIT') ?? Deno.env.get('RESEND_FROM') ?? 'Cockpit FnA <onboarding@resend.dev>';
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
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS });

  try {
    const body = (await req.json()) as Body;
    if (!body.to || !body.subject || !body.html) {
      return json({ error: 'Missing fields: to, subject, html' }, 400);
    }
    if (!RESEND_API_KEY) {
      return json({ error: 'RESEND_API_KEY not configured' }, 500);
    }

    // Envoi via Resend
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: RESEND_FROM,
        to: [body.to],
        subject: body.subject,
        html: body.html,
        text: body.text,
        reply_to: body.replyTo,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      return json({ error: 'Resend error', detail: data }, res.status);
    }

    // Log dans fna_email_logs si mode=report et orgId+reportId fournis
    if (body.mode === 'report' && body.orgId && body.reportId && SUPABASE_URL && SUPABASE_SERVICE_KEY) {
      try {
        const supa = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
        await supa.from('fna_email_logs').insert({
          org_id: body.orgId,
          report_id: body.reportId,
          to_email: body.to,
          to_name: body.recipientName ?? null,
          subject: body.subject,
          status: 'sent',
          provider_id: data.id,
          sent_at: Date.now(),
        });
      } catch (e) {
        console.warn('[cockpit-send-email] fna_email_logs insert failed:', e);
      }
    }

    return json({ id: data.id, status: 'sent' }, 200);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
