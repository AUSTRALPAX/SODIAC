-- Nota externa 0-10 (ej. una evaluación de ChatGPT sobre el tema recién
-- estudiado), separada del nivel de dominio 0-5 (`level`) que ya existe.
-- No reemplaza ni re-escala `level` — ver docs/DATA_MODEL.md.
ALTER TABLE mastery_assessment
  ADD COLUMN external_score_0_10 INTEGER CHECK (external_score_0_10 BETWEEN 0 AND 10);
