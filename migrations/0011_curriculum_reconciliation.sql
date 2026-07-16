-- Fase I/J: reconciliación entre la Carrera (SQLite) y el currículo real ya
-- indexado desde Obsidian (obsidian_note.frontmatter_json). Ver
-- docs/MASTER_SCHEDULE_MAP_AUDIT.md para el diagnóstico completo.
--
-- Todo aditivo: ninguna fila existente se modifica, ningún ID se toca.
--
-- Conflicto resuelto (decisión del usuario): `competency` en SQLite (84
-- filas, códigos tipo A5.1/E2.1/F0.1, sin ninguna fila referenciada desde
-- mastery_assessment/study_session/review/project) y `competencia` del vault
-- (10 notas COMP-01..10) son conceptos distintos que conviven en la misma
-- tabla, distinguidos por `origin`.

ALTER TABLE competency ADD COLUMN origin TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE competency ADD COLUMN external_ref TEXT;

ALTER TABLE fundamental_question ADD COLUMN external_ref TEXT;
ALTER TABLE subject ADD COLUMN external_ref TEXT;
ALTER TABLE topic ADD COLUMN external_ref TEXT;

-- Relaciones múltiples (una materia/tema puede vincularse a más de una
-- pregunta o competencia — sección 19 del pedido). Las columnas singulares
-- existentes (subject.fundamental_question_id, topic.competency_id) se
-- mantienen como la relación jerárquica primaria para el layout del Mapa;
-- estas tablas guardan las relaciones secundarias completas.
CREATE TABLE subject_fundamental_question (
  id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL REFERENCES subject(id),
  fundamental_question_id TEXT NOT NULL REFERENCES fundamental_question(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(subject_id, fundamental_question_id)
);

CREATE TABLE subject_competency (
  id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL REFERENCES subject(id),
  competency_id TEXT NOT NULL REFERENCES competency(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(subject_id, competency_id)
);

CREATE TABLE topic_fundamental_question (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL REFERENCES topic(id),
  fundamental_question_id TEXT NOT NULL REFERENCES fundamental_question(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(topic_id, fundamental_question_id)
);

CREATE TABLE topic_competency (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL REFERENCES topic(id),
  competency_id TEXT NOT NULL REFERENCES competency(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(topic_id, competency_id)
);

CREATE INDEX idx_subject_fundamental_question_subject ON subject_fundamental_question(subject_id);
CREATE INDEX idx_subject_competency_subject ON subject_competency(subject_id);
CREATE INDEX idx_topic_fundamental_question_topic ON topic_fundamental_question(topic_id);
CREATE INDEX idx_topic_competency_topic ON topic_competency(topic_id);
CREATE INDEX idx_competency_external_ref ON competency(external_ref);
CREATE INDEX idx_subject_external_ref ON subject(external_ref);
CREATE INDEX idx_topic_external_ref ON topic(external_ref);
