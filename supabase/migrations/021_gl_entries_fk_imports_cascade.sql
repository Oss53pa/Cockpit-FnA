-- ════════════════════════════════════════════════════════════════════
-- 021_gl_entries_fk_imports_cascade.sql
--
-- Ajoute une FK avec ON DELETE CASCADE de fna_gl_entries.import_id vers
-- fna_imports.id. Permet une suppression atomique : supprimer un import
-- supprime AUTOMATIQUEMENT toutes ses écritures GL en une seule transaction
-- Postgres — fini les états partiels où l'import_log disparaît mais les
-- écritures restent (ou l'inverse).
--
-- Bénéfices :
--   - Suppression atomique côté DB (pas besoin du 2-step dans le client)
--   - Aucun orphelin possible
--   - Performance : Postgres optimise le cascade mieux que 2 round trips
--
-- Pré-requis : aucune entry orpheline (import_id pointant vers un import
-- inexistant). Vérifié manuellement avant cette migration → 0 orphan.
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE fna_gl_entries
  ADD CONSTRAINT fna_gl_entries_import_id_fkey
  FOREIGN KEY (import_id) REFERENCES fna_imports(id)
  ON DELETE CASCADE;
