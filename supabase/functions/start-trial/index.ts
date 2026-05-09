// Supabase Edge Function — start-trial
//
// Démarre un essai gratuit pour une app Atlas Studio Suite.
// Crée une entrée trial dans `licence_trials` et envoie l'URL de portail.
//
// Body attendu :
// {
//   appId: string,                // ex. "cockpit-fna"
//   plan?: string,                // ex. "solo", "team"
//   trial_days?: number           // ex. 14
// }
//
// Headers :
//   Authorization: Bearer <user JWT>
//
// Deploy : supabase functions deploy start-trial
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
  appId: string;
  plan?: string;
  trial_days?: number;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS });

  try {
    const auth = req.headers.get('authorization') ?? '';
    if (!auth.startsWith('Bearer ')) {
      return json({ error: 'Authorization required' }, 401);
    }

    const body = (await req.json()) as Body;
    if (!body.appId) return json({ error: 'Missing field: appId' }, 400);
    const trialDays = Math.max(1, Math.min(60, body.trial_days ?? 14));

    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      return json({ error: 'Service role key not configured' }, 500);
    }

    const token = auth.slice('Bearer '.length);
    const supa = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: userData } = await supa.auth.getUser(token);
    const user = userData?.user;
    if (!user) return json({ error: 'Invalid user token' }, 401);

    const now = Date.now();
    const expiresAt = now + trialDays * 86_400_000;

    // Insert / upsert dans licence_trials (table partagée Atlas Studio)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supa as any).from('licence_trials').upsert(
        {
          user_id: user.id,
          app_id: body.appId,
          plan: body.plan ?? 'solo',
          started_at: now,
          expires_at: expiresAt,
          status: 'active',
        },
        { onConflict: 'user_id,app_id', ignoreDuplicates: false },
      );
      if (error) {
        console.warn('[start-trial] licence_trials upsert failed:', error.message);
      }
    } catch (e) {
      console.warn('[start-trial] licence_trials skipped:', e);
    }

    return json({
      message: `Essai de ${trialDays} jours activé pour ${body.appId}`,
      expiresAt,
      redirectUrl: '/portal',
    }, 200);
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
