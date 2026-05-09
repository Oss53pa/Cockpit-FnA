// Supabase Edge Function — invite-user
//
// Variante "Atlas Studio Suite" : invite un user dans une licence
// (système licence_seats) et déclenche l'envoi d'un magic link.
// Utilisée par TeamSettingsPage.tsx (gestion sièges multi-app).
//
// Body attendu :
// {
//   email: string,
//   licenceId: string,           // identifiant de la licence
//   role?: 'admin' | 'editor' | 'viewer',
//   redirectTo?: string
// }
//
// Deploy : supabase functions deploy invite-user --no-verify-jwt
// Secrets : SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
};

interface Body {
  email: string;
  licenceId: string;
  role?: 'admin' | 'editor' | 'viewer';
  redirectTo?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS });

  try {
    const body = (await req.json()) as Body;
    if (!body.email || !body.licenceId) {
      return json({ error: 'Missing fields: email, licenceId' }, 400);
    }
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      return json({ error: 'Service role key not configured' }, 500);
    }

    const supa = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const role = body.role ?? 'viewer';

    // Invite via auth.admin (idempotent : Supabase Auth gère les doublons)
    const { data: invite, error: inviteErr } = await supa.auth.admin.inviteUserByEmail(body.email, {
      redirectTo: body.redirectTo,
    });
    if (inviteErr) {
      return json({ error: 'Invite failed', detail: inviteErr.message }, 500);
    }

    const userId = invite?.user?.id;
    if (!userId) {
      return json({ error: 'User id not resolved' }, 500);
    }

    // Upsert dans licence_seats (table partagée Atlas Studio)
    // Si la table n'existe pas dans ce projet, on log et on continue.
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supa as any).from('licence_seats').upsert(
        { user_id: userId, licence_id: body.licenceId, role, active: true },
        { onConflict: 'user_id,licence_id', ignoreDuplicates: false },
      );
    } catch (e) {
      console.warn('[invite-user] licence_seats upsert skipped:', e);
    }

    return json({ userId, licenceId: body.licenceId, status: 'invited' }, 200);
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
