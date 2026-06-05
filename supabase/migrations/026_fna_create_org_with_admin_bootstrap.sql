-- ════════════════════════════════════════════════════════════════════
-- 026 — Fix bootstrap : création de la PREMIÈRE organisation (catch-22 RLS)
-- ════════════════════════════════════════════════════════════════════
-- Problème : un utilisateur SANS aucune org ne peut pas créer sa première
-- société. L'INSERT direct dans fna_organizations est bloqué par la policy
-- RESTRICTIVE fna_organizations_role_write dont le CHECK est :
--     can_write_for_fna() OR auth.role()='service_role' OR fna_user_has_any_org()
-- Pour une 1re org, les trois sont FAUX → INSERT refusé (catch-22 : il faudrait
-- déjà avoir une org pour pouvoir en créer une).
--
-- Solution (alignée sur le patron create_org_with_admin) : une fonction
-- SECURITY DEFINER qui crée l'org + le mapping admin atomiquement en
-- contournant la RLS, avec deux gardes :
--   1) auth.uid() obligatoire (pas d'appel anonyme),
--   2) ANTI-ESCALADE : on ne devient admin que d'une org RÉELLEMENT créée par
--      cet appel — si l'id existe déjà, on refuse (sinon un utilisateur pourrait
--      se rattacher admin à une org existante en devinant son id).
--
-- Le client (Settings « Sociétés » + OnboardingModal) appelle ce RPC quand
-- Supabase est configuré ; la voie dataProvider directe reste pour le mode
-- démo/local.

CREATE OR REPLACE FUNCTION public.fna_create_org_with_admin(
  p_id         text,
  p_name       text,
  p_sector     text DEFAULT 'Industrie',
  p_currency   text DEFAULT 'XOF',
  p_coa_system text DEFAULT 'SYSCOHADA',
  p_rccm       text DEFAULT NULL,
  p_ifu        text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_inserted int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentification requise pour créer une organisation';
  END IF;
  IF coalesce(btrim(p_name), '') = '' THEN
    RAISE EXCEPTION 'La raison sociale est obligatoire';
  END IF;

  INSERT INTO fna_organizations (id, name, sector, currency, coa_system, rccm, ifu)
  VALUES (
    p_id,
    btrim(p_name),
    coalesce(nullif(btrim(p_sector), ''),    'Industrie'),
    coalesce(nullif(btrim(p_currency), ''),  'XOF'),
    coalesce(nullif(btrim(p_coa_system), ''),'SYSCOHADA'),
    nullif(btrim(p_rccm), ''),
    nullif(btrim(p_ifu), '')
  )
  ON CONFLICT (id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  -- Anti-escalade : org déjà existante ⇒ refus (pas d'auto-rattachement admin).
  IF v_inserted = 0 THEN
    RAISE EXCEPTION 'Organisation % déjà existante — création refusée', p_id;
  END IF;

  INSERT INTO fna_user_orgs (user_id, org_id, role)
  VALUES (v_uid, p_id, 'admin')
  ON CONFLICT (user_id, org_id) DO UPDATE SET role = 'admin';
END;
$$;

-- L'exécution anonyme est inutile (auth.uid() requis) → réservée aux sessions.
REVOKE EXECUTE ON FUNCTION public.fna_create_org_with_admin(text,text,text,text,text,text,text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fna_create_org_with_admin(text,text,text,text,text,text,text) TO authenticated, service_role;
