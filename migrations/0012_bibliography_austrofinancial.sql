-- Importación del catálogo bibliográfico austrofinanciero (110 obras) y
-- vinculación de recursos con materias/unidades/temas, además de proyectos.
-- Ver docs/BIBLIOGRAPHY_IMPORT_BASELINE.md para el diagnóstico completo.
--
-- Todo aditivo: ninguna fila ni columna existente se modifica ni se borra.
-- No se crean 4 tablas nuevas (ResourceSubject/Unit/Topic/Project) como
-- pedía el documento original — se extiende `bibliographic_source`, que ya
-- vincula un recurso con materia/tema/proyecto/pregunta fundamental/
-- competencia/sesión/nota de Obsidian en una sola tabla (mismo patrón que
-- topic_competency, subject_fundamental_question, etc.), agregándole la
-- unidad curricular (que le faltaba) y los metadatos de relación.

-- 1. Metadatos del catálogo en `resource` -----------------------------------

ALTER TABLE resource ADD COLUMN catalog_number INTEGER;
ALTER TABLE resource ADD COLUMN original_year INTEGER;
ALTER TABLE resource ADD COLUMN category TEXT;
ALTER TABLE resource ADD COLUMN access_label TEXT;
ALTER TABLE resource ADD COLUMN access_type TEXT CHECK (access_type IN (
  'pdf_legal',
  'texto_legal',
  'pdf_texto_legal',
  'acceso_institucional',
  'catalogo_legal',
  'autor_editorial',
  'editorial',
  'acceso_legal',
  'sin_url_verificada'
));
ALTER TABLE resource ADD COLUMN source_document TEXT;
ALTER TABLE resource ADD COLUMN source_page INTEGER;
ALTER TABLE resource ADD COLUMN import_batch TEXT;

CREATE INDEX idx_resource_catalog_number ON resource(catalog_number);
CREATE INDEX idx_resource_import_batch ON resource(import_batch);

-- 2. Vínculo con unidad curricular + metadatos de relación en
--    `bibliographic_source` --------------------------------------------------

ALTER TABLE bibliographic_source ADD COLUMN curriculum_unit_id TEXT REFERENCES curriculum_unit(id);
ALTER TABLE bibliographic_source ADD COLUMN relation_type TEXT CHECK (relation_type IN (
  'bibliografia_principal',
  'bibliografia_obligatoria',
  'bibliografia_complementaria',
  'referencia',
  'profundizacion',
  'aplicacion',
  'consulta_tecnica',
  'fuente_historica',
  'lectura_opcional',
  'prerequisito',
  'utilizada_en_proyecto',
  'citada',
  'descartada'
));
ALTER TABLE bibliographic_source ADD COLUMN importance INTEGER;
ALTER TABLE bibliographic_source ADD COLUMN reading_order INTEGER;
ALTER TABLE bibliographic_source ADD COLUMN suggested_chapters TEXT;
ALTER TABLE bibliographic_source ADD COLUMN notes TEXT;
-- Nullable (no NOT NULL + default no constante): SQLite no permite un
-- default con función en ALTER TABLE ADD COLUMN sobre una tabla que ya
-- tiene filas si la columna es NOT NULL. Se completa siempre desde el
-- código en el momento de insertar el vínculo (igual que `created_at` en
-- el resto de la tabla, que ya se pasa explícito desde JS, no por default).
ALTER TABLE bibliographic_source ADD COLUMN linked_at TEXT;

CREATE INDEX idx_bibliographic_source_curriculum_unit ON bibliographic_source(curriculum_unit_id);
