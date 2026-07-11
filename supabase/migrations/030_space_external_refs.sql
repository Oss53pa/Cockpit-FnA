-- 030_space_external_refs.sql
-- § Diffusion de l'Espace Collaboratif : ancrages EXTERNES (ressources hors FNA
-- reliées à un espace — ticket, GED, e-mail, relevé PDF…). Diffusion sortante,
-- jamais du calcul. Stocké en jsonb sur fna_spaces, comme `members`.
-- Forme : [{ "id": "...", "label": "...", "url": "...", "addedBy": "...", "addedAt": 0 }]

ALTER TABLE fna_spaces
  ADD COLUMN IF NOT EXISTS external_refs jsonb;
