-- ════════════════════════════════════════════════════════════════════
-- 020_append_audit_log_rpc.sql
--
-- RPC atomique pour append au audit log SHA-256 — résout la race condition
-- du calcul de chaîne côté client (migration 019).
--
-- Problème : `fna_get_last_audit_hash` retourne le dernier hash sans verrou.
-- 2 imports concurrents sur la même org lisent le même `prev_hash`, calculent
-- chacun leur nouveau hash, et insèrent — la chaîne est cassée dès le 2e
-- insert (deux rows partagent le même `previous_audit_hash`).
--
-- Solution : une fonction `SECURITY DEFINER` qui :
--   1. Lock le dernier row du log via `SELECT ... FOR UPDATE` (sérialise les
--      writes concurrents sur la même org)
--   2. Calcule la chaîne SHA-256 server-side via `pgcrypto.digest()` (pas
--      d'aller-retour client, pas de désynchronisation ms/timestamptz)
--   3. Insère le batch atomique
--
-- Bonus : `changed_at` est défini une seule fois côté DB (now()) au lieu de
-- Date.now() côté client → le hash inclut le timestamp DB exact, vérifiable
-- a posteriori.
--
-- Requiert l'extension pgcrypto (activée par défaut sur Supabase).
-- ════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION fna_append_audit_log(
  p_org_id text,
  p_changes jsonb   -- [{gl_entry_id, field, old_value, new_value, reason, source_kind, source_id}, ...]
) RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_prev_hash text;
  v_new_hash text;
  v_now timestamptz := now();
  v_now_epoch text;
  v_change jsonb;
  v_count int := 0;
  v_user uuid := auth.uid();
  v_canonical text;
BEGIN
  IF p_org_id IS NULL OR length(trim(p_org_id)) = 0 THEN
    RAISE EXCEPTION 'org_id requis';
  END IF;
  IF p_changes IS NULL OR jsonb_typeof(p_changes) != 'array' OR jsonb_array_length(p_changes) = 0 THEN
    RETURN 0;
  END IF;

  -- Sécurité : editor/admin requis sur cette org (sauf service_role)
  IF auth.role() != 'service_role'
     AND NOT EXISTS (
       SELECT 1 FROM fna_user_orgs
       WHERE user_id = v_user
         AND org_id = p_org_id
         AND role IN ('admin', 'editor')
     )
  THEN
    RAISE EXCEPTION 'Accès refusé : audit log nécessite role editor/admin sur org %', p_org_id;
  END IF;

  -- LOCK + lecture du dernier hash. Le FOR UPDATE sérialise les writes
  -- concurrents : 2 sessions qui veulent appender en même temps sur la même
  -- org attendent leur tour, chacune voit la chaîne à jour.
  -- Sur une org vide (1er log), aucun row → prev_hash = ''.
  SELECT COALESCE(audit_hash, '') INTO v_prev_hash
  FROM fna_gl_audit_log
  WHERE org_id = p_org_id
  ORDER BY id DESC
  LIMIT 1
  FOR UPDATE;

  IF v_prev_hash IS NULL THEN v_prev_hash := ''; END IF;

  -- Timestamp epoch pour le hash (cohérent entre client et serveur)
  v_now_epoch := EXTRACT(EPOCH FROM v_now)::bigint::text;

  FOR v_change IN SELECT * FROM jsonb_array_elements(p_changes) LOOP
    -- Format canonique (DOIT correspondre à ce que produit lib/glAuditLog.ts
    -- pour pouvoir revérifier la chaîne côté client si besoin)
    v_canonical :=
      v_prev_hash || '||' ||
      p_org_id || '||' ||
      (v_change->>'gl_entry_id') || '||' ||
      v_now_epoch || '||' ||
      (v_change->>'field') || '||' ||
      COALESCE(v_change->>'old_value', '') || '||' ||
      COALESCE(v_change->>'new_value', '') || '||' ||
      (v_change->>'reason') || '||' ||
      COALESCE(v_change->>'source_kind', '') || '||' ||
      COALESCE(NULLIF(v_change->>'source_id',''), '0');

    v_new_hash := encode(digest(v_canonical, 'sha256'), 'hex');

    INSERT INTO fna_gl_audit_log (
      org_id, gl_entry_id, changed_at, changed_by,
      field, old_value, new_value, reason, source_kind, source_id,
      audit_hash, previous_audit_hash
    ) VALUES (
      p_org_id,
      (v_change->>'gl_entry_id')::bigint,
      v_now,
      v_user,
      v_change->>'field',
      NULLIF(v_change->>'old_value', ''),
      NULLIF(v_change->>'new_value', ''),
      v_change->>'reason',
      NULLIF(v_change->>'source_kind', ''),
      NULLIF(v_change->>'source_id', '')::bigint,
      v_new_hash,
      v_prev_hash
    );

    v_prev_hash := v_new_hash;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION fna_append_audit_log FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fna_append_audit_log TO authenticated;
