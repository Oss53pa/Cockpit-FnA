-- ════════════════════════════════════════════════════════════════════
-- 025 — Durcissement : retrait de l'exécution PUBLIC/anon sur la fonction
--       SECURITY DEFINER fna_get_last_audit_hash(text).
-- ════════════════════════════════════════════════════════════════════
-- Contexte (audit advisors Supabase) : les fonctions SECURITY DEFINER
-- exécutables par le rôle `anon` sont signalées (defense-in-depth).
--
-- Portée VOLONTAIREMENT minimale : on ne durcit QUE fna_get_last_audit_hash,
-- seule fonction fna_* SECURITY DEFINER executable par anon qui n'est
-- référencée dans AUCUNE policy RLS (vérifié : 0 référence).
--
-- Les helpers RLS (fna_auth_org_ids, can_write_for_fna, can_admin_for_fna,
-- fna_user_has_any_org) sont DÉLIBÉRÉMENT laissés exécutables par anon :
-- ils sont appelés dans 78 / 61 / 26 / 1 policies. Leur révoquer l'exécution
-- provoquerait un « permission denied for function » lors de l'évaluation des
-- policies par une requête pré-auth, au lieu d'un simple « 0 ligne ». Ils
-- restent inoffensifs pour anon (gardés par auth.uid() ⇒ renvoient vide/false).
--
-- L'accès anon provient du grant PUBLIC par défaut (anon en hérite), d'où le
-- REVOKE ... FROM PUBLIC puis le GRANT explicite aux rôles légitimes. Même
-- pattern que les fonctions déjà verrouillées (fna_append_audit_log,
-- fna_import_tiers, fna_org_has_other_admin).
-- fna_get_last_audit_hash n'est appelée que par du code authentifié
-- (src/db/supabaseProvider.ts — vérification de la chaîne de hash de l'audit
-- trail, requiert une appartenance org). anon ne l'appelle jamais.

REVOKE EXECUTE ON FUNCTION public.fna_get_last_audit_hash(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fna_get_last_audit_hash(text) TO authenticated, service_role;
