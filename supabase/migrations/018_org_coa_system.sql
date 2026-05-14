-- ════════════════════════════════════════════════════════════════════
-- 018_org_coa_system.sql
--
-- Ajoute coa_system à fna_organizations.
-- Permet à chaque org de choisir son plan comptable (SYSCOHADA, PCG_FR,
-- IFRS, US_GAAP). Utilisé par l'engine de rapprochement tiers, la balance,
-- et toute logique qui classifie un compte par classe / racine.
--
-- Avant : SYSCOHADA hardcodé dans le code (substring(0,2)).
-- Maintenant : org.coa_system détermine le classifier (cf.
-- src/engine/accountingSystems.ts).
--
-- Défaut : SYSCOHADA pour toutes les orgs existantes (rétro-compat).
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE fna_organizations
  ADD COLUMN IF NOT EXISTS coa_system text
    CHECK (coa_system IN ('SYSCOHADA', 'PCG_FR', 'IFRS', 'US_GAAP'))
    DEFAULT 'SYSCOHADA';

-- Rétro-compat : remplir les NULL existants
UPDATE fna_organizations SET coa_system = 'SYSCOHADA' WHERE coa_system IS NULL;
