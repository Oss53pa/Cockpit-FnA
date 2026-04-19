import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../db/supabaseTypes';

const url = import.meta.env.VITE_SUPABASE_URL ?? '';
const key = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

export const supabase: SupabaseClient<Database> = createClient<Database>(url, key, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});

/** true when Supabase env vars are configured */
export const isSupabaseConfigured = Boolean(url && key);
