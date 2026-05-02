// Supabase Edge Function — Envoi de rapport par email via Resend
// Deploy: supabase functions deploy send-report --no-verify-jwt

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface RequestBody {
  reportId: number;
  recipients: string[];
  subject: string;
  message?: string;
  format: 'pdf' | 'html';
  orgId: string;
}

Deno.serve(async (req: Request) => {
  // CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
      },
    });
  }

  try {
    // Auth check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return new Response('Unauthorized', { status: 401 });

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Verify user token
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return new Response('Unauthorized', { status: 401 });

    // Check user has access to org
    const body: RequestBody = await req.json();
    const { data: membership } = await supabase
      .from('fna_user_orgs')
      .select('role')
      .eq('user_id', user.id)
      .eq('org_id', body.orgId)
      .single();

    if (!membership) return new Response('Forbidden', { status: 403 });

    // Get report
    const { data: report } = await supabase
      .from('fna_reports')
      .select('*')
      .eq('id', body.reportId)
      .single();

    if (!report) return new Response('Report not found', { status: 404 });

    // Get org name
    const { data: org } = await supabase
      .from('fna_organizations')
      .select('name')
      .eq('id', body.orgId)
      .single();

    // Build email HTML
    const htmlBody = `
      <div style="font-family: 'Segoe UI', Tahoma, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #0f172a; color: white; padding: 20px 24px; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 18px;">Cockpit FnA</h1>
          <p style="margin: 4px 0 0; font-size: 13px; opacity: 0.7;">${org?.name ?? 'Organisation'}</p>
        </div>
        <div style="padding: 24px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 8px 8px;">
          <h2 style="margin: 0 0 12px; font-size: 16px; color: #1e293b;">${report.title}</h2>
          ${body.message ? `<p style="color: #475569; font-size: 14px; line-height: 1.6;">${body.message}</p>` : ''}
          <p style="color: #64748b; font-size: 13px; margin-top: 16px;">
            Rapport g&eacute;n&eacute;r&eacute; automatiquement par Cockpit FnA le ${new Date().toLocaleDateString('fr-FR')}.
          </p>
        </div>
      </div>
    `;

    // Send via Resend
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Cockpit FnA <rapports@cockpit-fna.com>',
        to: body.recipients,
        subject: body.subject || `[Cockpit FnA] ${report.title}`,
        html: htmlBody,
      }),
    });

    const resendData = await resendRes.json();
    const status = resendRes.ok ? 'sent' : 'failed';

    // Log the email
    await supabase.from('fna_email_logs').insert({
      org_id: body.orgId,
      report_id: body.reportId,
      recipients: body.recipients,
      subject: body.subject || report.title,
      status,
      error: resendRes.ok ? null : JSON.stringify(resendData),
    });

    if (!resendRes.ok) {
      return new Response(JSON.stringify({ error: 'Email send failed', details: resendData }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, emailId: resendData.id }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
});
