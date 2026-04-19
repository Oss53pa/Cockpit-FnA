import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../db/supabaseTypes';

const url = import.meta.env.VITE_SUPABASE_URL ?? '';
const key = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

/** true when Supabase env vars are configured */
export const isSupabaseConfigured = Boolean(url && key);

// On utilise un placeholder valide quand les env vars ne sont pas définies, pour
// éviter le crash "supabaseUrl is required" au démarrage. L'app fonctionne en
// mode 100 % local (IndexedDB) sans Supabase. Toute tentative d'appel Supabase
// échouera silencieusement — il faut vérifier isSupabaseConfigured d'abord.
const safeUrl = url || 'https://placeholder.supabase.co';
const safeKey = key || 'placeholder-anon-key';

export const supabase: SupabaseClient<Database> = createClient<Database>(safeUrl, safeKey, {
  auth: {
    autoRefreshToken: isSupabaseConfigured,
    persistSession: isSupabaseConfigured,
    detectSessionInUrl: isSupabaseConfigured,
  },
});
