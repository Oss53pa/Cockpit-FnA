// Supabase Edge Function — cockpit-invite-user
//
// Crée un user Supabase + l'associe à une org via fna_user_orgs + envoie un magic link.
//
// Body attendu :
// {
//   email: string,
//   name?: string,
//   orgId: string,
//   role?: 'admin' | 'editor' | 'viewer' | 'accountant_admin',
//   redirectTo?: string         // URL de retour après acceptation invitation
// }
//
// Deploy : supabase functions deploy cockpit-invite-user --no-verify-jwt
// Secrets : SUPABASE_SERVICE_ROLE_KEY (admin auth + insert fna_user_orgs)

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
  name?: string;
  orgId: string;
  role?: 'admin' | 'editor' | 'viewer' | 'accountant_admin';
  redirectTo?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS });

  try {
    const body = (await req.json()) as Body;
    if (!body.email || !body.orgId) {
      return json({ error: 'Missing fields: email, orgId' }, 400);
    }
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      return json({ error: 'Supabase service role key not configured' }, 500);
    }

    const supa = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const role = body.role ?? 'viewer';

    // 1) Vérifie / crée le user via auth.admin
    let userId: string | null = null;
    const { data: existing } = await supa.auth.admin.listUsers({ page: 1, perPage: 200 });
    const found = existing?.users?.find((u) => u.email?.toLowerCase() === body.email.toLowerCase());
    if (found) {
      userId = found.id;
    } else {
      const { data: created, error: createErr } = await supa.auth.admin.inviteUserByEmail(body.email, {
        redirectTo: body.redirectTo,
        data: body.name ? { full_name: body.name } : undefined,
      });
      if (createErr) return json({ error: 'Invite failed', detail: createErr.message }, 500);
      userId = created?.user?.id ?? null;
    }
    if (!userId) {
      return json({ error: 'User id not resolved' }, 500);
    }

    // 2) Insert / upsert dans fna_user_orgs
    const { error: insertErr } = await supa.from('fna_user_orgs').upsert(
      { user_id: userId, org_id: body.orgId, role },
      { onConflict: 'user_id,org_id', ignoreDuplicates: false },
    );
    if (insertErr) {
      return json({ error: 'fna_user_orgs upsert failed', detail: insertErr.message }, 500);
    }

    // 3) Insert / upsert dans fna_org_members (annuaire)
    await supa.from('fna_org_members').upsert(
      {
        org_id: body.orgId,
        email: body.email,
        name: body.name ?? null,
        role,
        active: true,
      },
      { onConflict: 'org_id,email', ignoreDuplicates: false },
    );

    return json({ userId, status: 'invited' }, 200);
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
