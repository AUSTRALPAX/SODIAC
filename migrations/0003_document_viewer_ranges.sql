-- Visor interno de documentos (docs/UPDATE_1_1_BASELINE.md): permite registrar un
-- documento como un rango de páginas dentro de otro PDF (ej. varios documentos
-- institucionales embebidos en un único Compendio Maestro), sin duplicar el
-- archivo físico. Aditiva y no destructiva.
ALTER TABLE document_version ADD COLUMN source_document_id TEXT REFERENCES institutional_document(id);
ALTER TABLE document_version ADD COLUMN start_page INTEGER;
ALTER TABLE document_version ADD COLUMN end_page INTEGER;
