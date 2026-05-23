-- ════════════════════════════════════════════════════════════════════
-- 022_replace_gl_atomic.sql
--
-- Fonction RPC atomique pour le PUSH du Grand Livre (Dexie → Supabase).
--
-- Problème corrigé (audit S-02) : `pushGLToSupabase` faisait
--   DELETE FROM fna_gl_entries WHERE org_id = ...   (toutes les écritures)
--   puis INSERT par chunks de 500
-- SANS transaction. Si un chunk d'INSERT échouait (réseau, timeout, contrainte)
-- ou si la connexion coupait après le DELETE, TOUT le Grand Livre cloud de l'org
-- — la source de vérité — était perdu, sans rollback possible.
--
-- Maintenant : un seul appel RPC. Une fonction PL/pgSQL s'exécute dans une
-- transaction implicite ⇒ le DELETE et l'INSERT réussissent ou échouent
-- ENSEMBLE. En cas d'erreur, l'ancien Grand Livre reste intact.
--
-- Le client (supabaseSync.pushGLToSupabase) tente cette RPC en priorité et
-- retombe sur l'ancienne voie delete+insert si la fonction n'est pas déployée
-- (aucune régression si la migration n'est pas appliquée).
--
-- Sécurité (modèle identique à 017_tiers_import_rpc) :
--   - SECURITY DEFINER + contrôle explicite admin/editor sur l'org via
--     fna_user_orgs (la fonction ne contourne donc PAS la logique de droits).
--   - search_path figé à 'public'.
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION fna_replace_gl(
  p_org_id text,
  p_rows   jsonb   -- [{org_id, period_id, date, journal, piece, account, label,
                   --   debit, credit, tiers?, analytical_axis?, analytical_section?,
                   --   lettrage?, import_id?, hash?, previous_hash?}, ...]
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_user_id    uuid := auth.uid();
  v_inserted   int  := 0;
BEGIN
  -- Validation : org_id obligatoire
  IF p_org_id IS NULL OR length(trim(p_org_id)) = 0 THEN
    RAISE EXCEPTION 'org_id requis';
  END IF;

  -- Sécurité : l'appelant doit être admin/editor sur cette org (ou service_role)
  IF auth.role() != 'service_role'
     AND NOT EXISTS (
       SELECT 1 FROM fna_user_orgs
       WHERE user_id = v_user_id
         AND org_id = p_org_id
         AND role IN ('admin', 'editor')
     )
  THEN
    RAISE EXCEPTION 'Accès refusé : rôle editor/admin requis sur org %', p_org_id;
  END IF;

  -- Cohérence : toute ligne doit appartenir à l'org ciblée
  IF p_rows IS NOT NULL AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_rows) j
    WHERE COALESCE(j->>'org_id', p_org_id) <> p_org_id
  ) THEN
    RAISE EXCEPTION 'Une ou plusieurs écritures ont un org_id différent de %', p_org_id;
  END IF;

  -- 1) Purge atomique du GL existant de l'org
  DELETE FROM fna_gl_entries WHERE org_id = p_org_id;

  -- 2) Réinsertion depuis le tableau jsonb (mêmes colonnes que le client)
  IF p_rows IS NOT NULL AND jsonb_array_length(p_rows) > 0 THEN
    INSERT INTO fna_gl_entries (
      org_id, period_id, date, journal, piece, account, label,
      debit, credit, tiers, analytical_axis, analytical_section,
      lettrage, import_id, hash, previous_hash
    )
    SELECT
      p_org_id,
      j->>'period_id',
      (j->>'date')::date,
      COALESCE(j->>'journal', 'OD'),
      COALESCE(j->>'piece', ''),
      j->>'account',
      COALESCE(j->>'label', ''),
      COALESCE((j->>'debit')::numeric, 0),
      COALESCE((j->>'credit')::numeric, 0),
      NULLIF(j->>'tiers', ''),
      NULLIF(j->>'analytical_axis', ''),
      NULLIF(j->>'analytical_section', ''),
      NULLIF(j->>'lettrage', ''),
      NULLIF(j->>'import_id', '')::bigint,
      NULLIF(j->>'hash', ''),
      NULLIF(j->>'previous_hash', '')
    FROM jsonb_array_elements(p_rows) j;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object('org_id', p_org_id, 'inserted', v_inserted);
END;
$$;

-- Permissions : la fonction vérifie elle-même le rôle editor/admin.
REVOKE ALL ON FUNCTION fna_replace_gl FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fna_replace_gl TO authenticated;
