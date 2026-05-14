-- ════════════════════════════════════════════════════════════════════
-- 017_tiers_import_rpc.sql
--
-- Fonction RPC atomique pour l'import GL Tiers. Encapsule dans une seule
-- transaction Postgres :
--   1) INSERT INTO fna_imports (log de l'import, kind='TIERS')
--   2) UPDATE fna_gl_entries SET tiers=..., label=... (enrichissements)
--   3) INSERT INTO fna_tiers_unmatched (lignes non rapprochées)
--
-- Avant : 3 appels Supabase séparés via le JS client. Si la #2 ou #3 échoue
-- en cours (réseau, timeout, RLS), on se retrouve avec un état partiel sans
-- rollback possible.
--
-- Maintenant : un seul appel RPC. Postgres garantit l'atomicité. En cas
-- d'erreur sur n'importe quelle étape, toute la transaction est annulée
-- et l'utilisateur peut relancer l'import sans état corrompu.
--
-- Sécurité :
--   - SECURITY DEFINER + check explicite sur fna_auth_org_ids('editor') pour
--     que la fonction ne contourne pas les RLS.
--   - Validation des paramètres (org_id non null, kind imposé à 'TIERS').
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION fna_import_tiers(
  p_org_id      text,
  p_user        text,
  p_file_name   text,
  p_source      text,
  p_count       int,
  p_rejected    int,
  p_status      text,
  p_report      text,
  p_enriched    jsonb,    -- [{id: number, tiers: string, label?: string}, ...]
  p_unmatched   jsonb     -- [{row_index, date, account, code_tiers, ...}, ...]
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_import_id bigint;
  v_user_id   uuid := auth.uid();
  v_enriched_count int := 0;
  v_unmatched_count int := 0;
BEGIN
  -- Validation : org_id obligatoire
  IF p_org_id IS NULL OR length(trim(p_org_id)) = 0 THEN
    RAISE EXCEPTION 'org_id requis';
  END IF;

  -- Sécurité : l'appelant doit être editor sur cette org (ou service_role)
  IF auth.role() != 'service_role'
     AND NOT EXISTS (
       SELECT 1 FROM fna_user_orgs
       WHERE user_id = v_user_id
         AND org_id = p_org_id
         AND role IN ('admin', 'editor')
     )
  THEN
    RAISE EXCEPTION 'Accès refusé : role editor/admin requis sur org %', p_org_id;
  END IF;

  -- 1) Créer le log d'import
  INSERT INTO fna_imports (
    org_id, date, user_name, file_name, source, kind, count, rejected, status, report
  ) VALUES (
    p_org_id,
    (EXTRACT(EPOCH FROM now()) * 1000)::bigint,
    p_user,
    p_file_name,
    p_source,
    'TIERS',
    p_count,
    p_rejected,
    p_status,
    p_report
  )
  RETURNING id INTO v_import_id;

  -- 2) Enrichissement des écritures GL existantes (set tiers + fallback label)
  IF p_enriched IS NOT NULL AND jsonb_array_length(p_enriched) > 0 THEN
    WITH upd AS (
      SELECT
        (j->>'id')::bigint    AS id,
        j->>'tiers'           AS tiers,
        NULLIF(j->>'label','') AS label
      FROM jsonb_array_elements(p_enriched) j
    )
    UPDATE fna_gl_entries gl
    SET
      tiers = upd.tiers,
      label = COALESCE(upd.label, NULLIF(gl.label, '—'), gl.label, '')
    FROM upd
    WHERE gl.id = upd.id
      AND gl.org_id = p_org_id;
    GET DIAGNOSTICS v_enriched_count = ROW_COUNT;
  END IF;

  -- 3) Insérer les lignes non rapprochées
  IF p_unmatched IS NOT NULL AND jsonb_array_length(p_unmatched) > 0 THEN
    INSERT INTO fna_tiers_unmatched (
      org_id, import_id, row_index, date, account, code_tiers, label_tiers,
      debit, credit, journal, piece, label, reason, candidate_ids, created_at
    )
    SELECT
      p_org_id,
      v_import_id,
      (j->>'row_index')::int,
      (j->>'date')::date,
      j->>'account',
      j->>'code_tiers',
      NULLIF(j->>'label_tiers',''),
      COALESCE((j->>'debit')::numeric, 0),
      COALESCE((j->>'credit')::numeric, 0),
      NULLIF(j->>'journal',''),
      NULLIF(j->>'piece',''),
      NULLIF(j->>'label',''),
      j->>'reason',
      CASE
        WHEN j->'candidate_ids' IS NOT NULL AND jsonb_typeof(j->'candidate_ids') = 'array'
        THEN (SELECT array_agg((x)::bigint) FROM jsonb_array_elements_text(j->'candidate_ids') x)
        ELSE NULL
      END,
      now()
    FROM jsonb_array_elements(p_unmatched) j;
    GET DIAGNOSTICS v_unmatched_count = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'import_id',      v_import_id,
    'enriched_count', v_enriched_count,
    'unmatched_count', v_unmatched_count
  );
END;
$$;

-- Permissions : accessible aux utilisateurs authentifiés (la fonction
-- vérifie elle-même le rôle editor/admin).
REVOKE ALL ON FUNCTION fna_import_tiers FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fna_import_tiers TO authenticated;
