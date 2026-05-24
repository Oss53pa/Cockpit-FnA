/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Atlas Studio « Proph3t core » (fédération + mode hébergé).
   * Pour Cockpit F&A, = projet core ; à défaut, src/lib/proph3t.ts retombe sur
   * VITE_SUPABASE_* (typées librement par vite/client).
   */
  readonly VITE_ATLAS_SUPABASE_URL: string;
  readonly VITE_ATLAS_SUPABASE_ANON_KEY: string;
}
