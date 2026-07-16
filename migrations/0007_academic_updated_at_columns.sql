-- El repositorio genérico (src/database/repository.ts) siempre escribe
-- `updated_at` en cada UPDATE. Estas tablas de la migración 0005 no la tenían
-- y se les llama vía repo.update() — aditivo, no destructivo.
--
-- SQLite no permite un DEFAULT no constante (como strftime(...)) en
-- ALTER TABLE ADD COLUMN (a diferencia de CREATE TABLE) — por eso estas
-- columnas se agregan sin DEFAULT (nulas hasta el primer update; el código
-- de la aplicación ya setea updated_at explícitamente en cada insert nuevo).
ALTER TABLE grading_rubric_version ADD COLUMN updated_at TEXT;
ALTER TABLE academic_evaluation ADD COLUMN updated_at TEXT;
ALTER TABLE academic_transcript_entry ADD COLUMN updated_at TEXT;
ALTER TABLE progress_formula_version ADD COLUMN updated_at TEXT;
ALTER TABLE assignment_submission ADD COLUMN updated_at TEXT;
