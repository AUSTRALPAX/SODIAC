-- Campos institucionales de la Base Bibliográfica Inicial (docs/UPDATE_1_1_BASELINE.md).
-- Aditiva y no destructiva: agrega columnas nulas, no toca filas existentes.
--
-- `area` y `evaluation_state` son distintos de `reading_state` (que ya existía y
-- representa el flujo de lectura propio de SODIAC, con su propio vocabulario
-- pendiente/consultando/activo/...). El "Estado" de la Base Bibliográfica Inicial
-- (Por evaluar, seleccionado, en estudio, procesado, suspendido, descartado,
-- permanente) es la escala de evaluación institucional del recurso y no debe
-- forzarse dentro del enum de reading_state.
ALTER TABLE resource ADD COLUMN area TEXT;
ALTER TABLE resource ADD COLUMN evaluation_state TEXT;
