// Cockpit FnA — cockpit-invite-user (v3 : token_hash anti-prefetch)
//
// FIX BUG "lien expire immediatement" :
//   Les scanners email (Microsoft SafeLinks, Proofpoint, Gmail) prefetchent
//   les URLs dans les emails. Si on envoie action_link (GoTrue /verify?token=...),
//   le token est consomme par le scanner AVANT que l'utilisateur ne clique.
//
// SOLUTION :
//   Au lieu de action_link, on construit l'URL avec hashed_token + type, qui
//   pointe directement vers /auth/accept-invite ou la consommation se fait
//   client-side via supabase.auth.verifyOtp(). Les scanners ne pouvant pas
//   executer le JS, le token reste valide jusqu'au clic reel.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const RESEND_FROM = Deno.env.get('RESEND_FROM_COCKPIT')
  ?? 'Cockpit FnA <notifications.cockpitfna@atlas-studio.org>';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const url = new URL(req.url);
  if (url.searchParams.get('debug') === '1') {
    return json(200, {
      env: {
        RESEND_API_KEY_set: RESEND_API_KEY.length > 0,
        SUPABASE_URL: SUPABASE_URL || null,
        SUPABASE_SERVICE_ROLE_KEY_set: SUPABASE_SERVICE_KEY.length > 0,
        SUPABASE_SERVICE_ROLE_KEY_length: SUPABASE_SERVICE_KEY.length,
      },
    });
  }

  if (!RESEND_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return json(200, {
      success: false,
      error: 'Configuration incomplete',
      details: {
        RESEND_API_KEY: RESEND_API_KEY ? 'OK' : 'MANQUANT',
        SUPABASE_URL: SUPABASE_URL ? 'OK' : 'MANQUANT',
        SUPABASE_SERVICE_ROLE_KEY: SUPABASE_SERVICE_KEY ? 'OK' : 'MANQUANT',
      },
    });
  }

  const auth = req.headers.get('Authorization');
  const apikey = req.headers.get('apikey');
  if (!auth && !apikey) return json(200, { success: false, error: 'Authorization requis' });

  let body: any;
  try { body = await req.json(); } catch { return json(200, { success: false, error: 'Body JSON invalide' }); }

  const { email, name, role, orgIds, appUrl, html: htmlTemplate, subject } = body ?? {};
  if (!email || !appUrl || !htmlTemplate) {
    return json(200, { success: false, error: 'Champs requis : email, appUrl, html', received: { email: !!email, appUrl: !!appUrl, html: !!htmlTemplate } });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const redirectTo = `${appUrl.replace(/\/$/, '')}/auth/accept-invite`;

  // ETAPE 1 : Genere lien Supabase Auth
  let magicLink: string | undefined;
  let userId: string | null = null;
  let linkType = 'invite';

  try {
    const { data, error } = await (supabase as any).auth.admin.generateLink({
      type: 'invite',
      email,
      options: {
        data: {
          full_name: name,
          role,
          org_ids: orgIds,
          invited_at: new Date().toISOString(),
          invited_by_app: 'cockpit-fna',
        },
        redirectTo,
      },
    });

    if (error) {
      console.warn('[invite] generateLink invite error:', JSON.stringify(error));
      const msg = (error.message ?? '').toString().toLowerCase();
      const code = (error.code ?? '').toString();
      const status = error.status;
      const isAlreadyExists = msg.includes('already') || msg.includes('exists') || msg.includes('registered')
        || code === 'email_exists' || code === 'user_already_exists' || status === 422 || status === 409;

      if (isAlreadyExists) {
        console.info('[invite] User existe deja, fallback recovery');
        const { data: rdata, error: rerror } = await (supabase as any).auth.admin.generateLink({
          type: 'recovery',
          email,
          options: { redirectTo },
        });
        if (rerror) {
          return json(200, {
            success: false,
            error: 'Le user existe deja mais le lien de recovery a echoue',
            supabaseError: { message: rerror.message, code: rerror.code, status: rerror.status },
            hint: 'Demandez au user de cliquer sur "Mot de passe oublie" sur la page de login.',
          });
        }
        magicLink = buildSafeLink(redirectTo, rdata?.properties);
        userId = rdata.user?.id ?? null;
        linkType = 'recovery';
      } else {
        return json(200, {
          success: false,
          error: 'Generation du lien d\'invitation echouee',
          supabaseError: { message: error.message, code: error.code, status: error.status },
          hint: identifyHint(error),
        });
      }
    } else {
      magicLink = buildSafeLink(redirectTo, data?.properties);
      userId = data.user?.id ?? null;
    }
  } catch (e: any) {
    return json(200, {
      success: false,
      error: 'Exception lors de la generation du lien',
      details: e?.message ?? String(e),
      stack: e?.stack?.split('\n').slice(0, 3).join(' | '),
    });
  }

  if (!magicLink) {
    return json(200, { success: false, error: 'Pas de magic link genere (hashed_token manquant dans la reponse Supabase)' });
  }

  // ETAPE 2 : mapping fna_user_orgs + fna_org_members
  if (userId && orgIds && Array.isArray(orgIds) && orgIds.length > 0) {
    for (const orgId of orgIds) {
      try {
        await (supabase as any).from('fna_user_orgs').upsert({
          user_id: userId, org_id: orgId, role: role ?? 'viewer',
        }, { onConflict: 'user_id,org_id' });
      } catch (e) {
        console.warn('[invite] fna_user_orgs upsert failed (non-bloquant):', e);
      }
      try {
        await (supabase as any).from('fna_org_members').upsert({
          org_id: orgId, email, name: name ?? email,
          role: role ?? 'viewer', active: true,
          invited_at: Date.now(),
        }, { onConflict: 'org_id,email' });
      } catch (e) {
        console.warn('[invite] fna_org_members upsert failed (non-bloquant):', e);
      }
    }
  }

  // ETAPE 3 : Injecte le lien dans le HTML
  let html = htmlTemplate as string;
  if (html.includes('{{ACTION_LINK}}')) {
    html = html.replaceAll('{{ACTION_LINK}}', magicLink);
  } else {
    const loginUrl = `${appUrl.replace(/\/$/, '')}/login`;
    html = html.replaceAll(`href="${loginUrl}"`, `href="${magicLink}"`);
    html = html.replaceAll(`href='${loginUrl}'`, `href='${magicLink}'`);
    if (!html.includes(magicLink)) {
      const cta = `<div style="text-align:center;margin:24px 0;"><a href="${magicLink}" style="display:inline-block;padding:14px 32px;background:#7FA88E;color:#FFF;text-decoration:none;border-radius:10px;font-weight:600">Activer mon compte</a></div>`;
      html = html.includes('</body>') ? html.replace('</body>', cta + '</body>') : html + cta;
    }
  }

  // ETAPE 4 : Resend
  const toFormatted = name ? `${name} <${email}>` : email;
  let resendData: any = {};
  let resendStatus = 0;
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: RESEND_FROM,
        to: [toFormatted],
        subject: subject ?? `[Cockpit FnA] Invitation - definissez votre mot de passe`,
        html,
        reply_to: 'support@atlas-studio.org',
        tags: [{ name: 'cockpit-mode', value: 'invitation' }, { name: 'link-type', value: linkType }],
      }),
    });
    resendStatus = r.status;
    resendData = await r.json().catch(() => ({}));
  } catch (e: any) {
    return json(200, { success: false, error: 'Erreur reseau Resend', details: e?.message, magicLink });
  }

  if (resendStatus < 200 || resendStatus >= 300) {
    return json(200, {
      success: false,
      error: 'Resend rejette l\'envoi de l\'invitation',
      resendStatus, resendBody: resendData,
      magicLink,
    });
  }

  return json(200, {
    success: true, userId, magicLink,
    emailId: resendData?.id, from: RESEND_FROM, to: email,
    linkType,
  });
});

// Construit un lien anti-prefetch : ${appUrl}/auth/accept-invite?token_hash=xxx&type=invite
// Le scanner email ne peut pas consommer le token car la verification se fait
// client-side via supabase.auth.verifyOtp(token_hash, type) — execution JS requise.
function buildSafeLink(redirectTo: string, properties: any): string | undefined {
  const hashed = properties?.hashed_token;
  const type = properties?.verification_type ?? 'invite';
  if (!hashed) {
    // Fallback ultime : utiliser action_link (vulnerable au prefetch mais
    // au moins le user pourra s'authentifier si le scanner est inactif)
    return properties?.action_link;
  }
  return `${redirectTo}?token_hash=${encodeURIComponent(hashed)}&type=${encodeURIComponent(type)}`;
}

function identifyHint(error: any): string {
  const msg = (error.message ?? '').toString().toLowerCase();
  const code = (error.code ?? '').toString();
  if (msg.includes('jwt') || msg.includes('token') || code === 'invalid_token') {
    return 'Cle SUPABASE_SERVICE_ROLE_KEY invalide ou expiree.';
  }
  if (msg.includes('email')) {
    return `Email invalide ou rejete : ${error.message}`;
  }
  if (msg.includes('rate')) {
    return 'Limite de debit atteinte — reessayez dans quelques minutes.';
  }
  return `Voir details Supabase ci-dessus. Code: ${code || 'N/A'}.`;
}

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json', ...CORS } });
}
