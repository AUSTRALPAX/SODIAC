-- Fase C: esquema de Carrera. Reutiliza fundamental_question/subject/topic/
-- curriculum_dependency tal cual — no se duplican. Solo se agrega lo que
-- realmente falta: `career` (envoltorio de importación/versión y presupuesto
-- total), `curriculum_unit` (el nivel que falta entre materia y tema) y
-- `curriculum_activity` (programación diaria bajo un tema, distinta de
-- `study_session`). `CurriculumSchedule`/`CurriculumRelation`/`XpBudget` del
-- pedido original se resuelven como cálculos derivados sobre estas tablas y
-- las existentes, no como tablas nuevas.

CREATE TABLE career (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  version_label TEXT NOT NULL,
  source_document_path TEXT,
  imported_at TEXT,
  total_xp_budget REAL,
  status TEXT NOT NULL DEFAULT 'activa',
  sort_order INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  tags TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  archived_at TEXT
);

CREATE TABLE curriculum_unit (
  id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL REFERENCES subject(id),
  title TEXT NOT NULL,
  description TEXT,
  budgeted_xp REAL,
  status TEXT NOT NULL DEFAULT 'activa',
  sort_order INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  tags TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  archived_at TEXT
);

CREATE INDEX idx_curriculum_unit_subject ON curriculum_unit(subject_id);

CREATE TABLE curriculum_activity (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL REFERENCES topic(id),
  title TEXT NOT NULL,
  activity_type TEXT NOT NULL DEFAULT 'estudio',
  estimated_minutes INTEGER,
  scheduled_date TEXT,
  completed_at TEXT,
  status TEXT NOT NULL DEFAULT 'activa',
  sort_order INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  tags TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  archived_at TEXT
);

CREATE INDEX idx_curriculum_activity_topic ON curriculum_activity(topic_id);
CREATE INDEX idx_curriculum_activity_scheduled ON curriculum_activity(scheduled_date);

-- Vínculos nuevos, todos nullable: las materias/temas existentes siguen
-- funcionando exactamente igual sin asignación de etapa/carrera/unidad.
ALTER TABLE subject ADD COLUMN learning_stage_id TEXT REFERENCES learning_stage(id);
ALTER TABLE subject ADD COLUMN career_id TEXT REFERENCES career(id);
ALTER TABLE topic ADD COLUMN curriculum_unit_id TEXT REFERENCES curriculum_unit(id);
