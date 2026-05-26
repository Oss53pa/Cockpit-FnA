// ════════════════════════════════════════════════════════════════════
// TEMPLATE — Edge Function "invite-user" (Supabase / Deno)
//
// Invite un utilisateur dans une ou plusieurs organisations :
//   1. Authentifie l'appelant (JWT) et vérifie qu'il est ADMIN de chaque org.
//   2. Génère un lien Supabase Auth ANTI-PREFETCH (hashed_token, pas action_link).
//   3. Upsert user_orgs (accès) + org_members (roster).
//   4. Envoie l'email via Resend, avec repli "lien à copier" si échec.
//
// Secrets requis (supabase secrets set …) :
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY,
//   RESEND_FROM (ex: "MonApp <no-reply@mondomaine.com>"), APP_NAME (optionnel)
//
// Déploiement (laisser la vérif JWT ACTIVE — défense en profondeur) :
//   supabase functions deploy invite-user
// ════════════════════════════════════════════════════════════════════
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const RESEND_FROM = Deno.env.get('RESEND_FROM') ?? 'MonApp <no-reply@example.com>';
const APP_NAME = Deno.env.get('APP_NAME') ?? 'MonApp';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
};
const json = (status: number, payload: unknown) =>
  new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (!SUPABASE_URL || !SERVICE_KEY || !RESEND_API_KEY) {
    return json(200, { success: false, error: 'Configuration incomplète (SUPABASE_URL / SERVICE_ROLE_KEY / RESEND_API_KEY)' });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  // 1) AUTHN de l'appelant — on valide le JWT (le header anon est public).
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return json(401, { success: false, error: 'Authentification requise' });
  const { data: callerData, error: callerErr } = await supabase.auth.getUser(token);
  const caller = callerData?.user;
  if (callerErr || !caller) return json(401, { success: false, error: 'Jeton invalide ou expiré' });

  let body: any;
  try { body = await req.json(); } catch { return json(200, { success: false, error: 'Body JSON invalide' }); }
  const { email, name, role, orgIds, appUrl, html, subject, forceRecovery } = body ?? {};
  if (!email || !appUrl || !html) {
    return json(200, { success: false, error: 'Champs requis : email, appUrl, html' });
  }

  // 2) AUTHZ — l'appelant doit être ADMIN de CHAQUE org ciblée (la service-role
  //    ignore la RLS, donc on RE-vérifie ici : sinon brèche multi-tenant).
  const targetOrgIds: string[] = Array.isArray(orgIds) ? orgIds.filter(Boolean) : [];
  if (targetOrgIds.length > 0) {
    const { data: memberships, error: mErr } = await supabase
      .from('user_orgs').select('org_id, role')
      .eq('user_id', caller.id).in('org_id', targetOrgIds);
    if (mErr) return json(500, { success: false, error: 'Vérification des droits impossible' });
    const adminOrgs = new Set((memberships ?? []).filter((m: any) => m.role === 'admin').map((m: any) => m.org_id));
    const forbidden = targetOrgIds.filter((id) => !adminOrgs.has(id));
    if (forbidden.length > 0) return json(403, { success: false, error: `Droits administrateur requis sur : ${forbidden.join(', ')}` });
  }

  const redirectTo = `${appUrl.replace(/\/$/, '')}/auth/accept-invite`;

  // 3) Lien Supabase Auth ANTI-PREFETCH (hashed_token, pas action_link).
  const buildSafeLink = (props: any): string | undefined => {
    const hashed = props?.hashed_token;
    const type = props?.verification_type ?? 'invite';
    return hashed ? `${redirectTo}?token_hash=${encodeURIComponent(hashed)}&type=${encodeURIComponent(type)}` : props?.action_link;
  };

  let magicLink: string | undefined;
  let userId: string | null = null;
  let linkType: 'invite' | 'recovery' = forceRecovery ? 'recovery' : 'invite';

  const tryRecovery = async () => {
    const { data, error } = await supabase.auth.admin.generateLink({ type: 'recovery', email, options: { redirectTo } });
    if (error) return { ok: false as const, error };
    return { ok: true as const, link: buildSafeLink(data?.properties), userId: data.user?.id ?? null };
  };

  try {
    if (forceRecovery) {
      const r = await tryRecovery();
      if (!r.ok) return json(200, { success: false, error: 'Lien de renvoi échoué', supabaseError: r.error });
      magicLink = r.link; userId = r.userId; linkType = 'recovery';
    } else {
      const { data, error } = await supabase.auth.admin.generateLink({
        type: 'invite', email,
        options: { data: { full_name: name, role, org_ids: orgIds, invited_by_app: APP_NAME }, redirectTo },
      });
      if (error) {
        const msg = (error.message ?? '').toLowerCase();
        const alreadyExists = msg.includes('already') || msg.includes('registered') || error.status === 422 || error.status === 409;
        if (alreadyExists) {
          const r = await tryRecovery(); // user existant → lien de recovery
          if (!r.ok) return json(200, { success: false, error: 'User existant, recovery échoué', supabaseError: r.error });
          magicLink = r.link; userId = r.userId; linkType = 'recovery';
        } else {
          return json(200, { success: false, error: 'Génération du lien échouée', supabaseError: error });
        }
      } else {
        magicLink = buildSafeLink(data?.properties); userId = data.user?.id ?? null;
      }
    }
  } catch (e: any) {
    return json(200, { success: false, error: 'Exception generateLink', details: e?.message });
  }
  if (!magicLink) return json(200, { success: false, error: 'Pas de magic link (hashed_token manquant)' });

  // 4) Mapping user_orgs (accès) + org_members (roster) — non bloquant.
  if (userId && targetOrgIds.length > 0) {
    for (const orgId of targetOrgIds) {
      try { await supabase.from('user_orgs').upsert({ user_id: userId, org_id: orgId, role: role ?? 'viewer' }, { onConflict: 'user_id,org_id' }); } catch { /* noop */ }
      try { await supabase.from('org_members').upsert({ org_id: orgId, email, name: name ?? email, role: role ?? 'viewer', active: true }, { onConflict: 'org_id,email' }); } catch { /* noop */ }
    }
  }

  // 5) Injecte le lien dans le HTML (placeholder {{ACTION_LINK}}) + envoie via Resend.
  const finalHtml = (html as string).includes('{{ACTION_LINK}}')
    ? (html as string).replaceAll('{{ACTION_LINK}}', magicLink)
    : `${html}<div style="text-align:center;margin:24px 0"><a href="${magicLink}" style="display:inline-block;padding:14px 32px;background:#2563eb;color:#fff;text-decoration:none;border-radius:10px;font-weight:600">Activer mon compte</a></div>`;

  let resendStatus = 0; let resendData: any = {};
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: RESEND_FROM,
        to: [name ? `${name} <${email}>` : email],
        subject: subject ?? `[${APP_NAME}] Invitation — définissez votre mot de passe`,
        html: finalHtml,
      }),
    });
    resendStatus = r.status; resendData = await r.json().catch(() => ({}));
  } catch (e: any) {
    return json(200, { success: false, error: 'Erreur réseau Resend', details: e?.message, magicLink });
  }
  if (resendStatus < 200 || resendStatus >= 300) {
    return json(200, { success: false, error: 'Resend a rejeté l\'envoi', resendStatus, resendBody: resendData, magicLink });
  }

  return json(200, { success: true, userId, linkType, emailId: resendData?.id });
});
