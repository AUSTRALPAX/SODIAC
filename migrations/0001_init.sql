-- SODIAC — esquema inicial (ver docs/DATA_MODEL.md)
-- Convenciones: id TEXT (uuid) PRIMARY KEY; timestamps TEXT ISO-8601;
-- archived_at NULL = activo; status TEXT libre por entidad.

PRAGMA foreign_keys = ON;

-- 1. Arquitectura académica -------------------------------------------------

CREATE TABLE fundamental_question (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'activa',
  notes TEXT,
  tags TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  archived_at TEXT
);

CREATE TABLE competency (
  id TEXT PRIMARY KEY,
  fundamental_question_id TEXT NOT NULL REFERENCES fundamental_question(id),
  code TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  level_group INTEGER NOT NULL DEFAULT 0,
  evidence_hint TEXT,
  status TEXT NOT NULL DEFAULT 'activa',
  sort_order INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  tags TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  archived_at TEXT
);

CREATE TABLE learning_stage (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  orientative_duration TEXT,
  main_product TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'activa',
  notes TEXT,
  tags TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  archived_at TEXT
);

CREATE TABLE subject (
  id TEXT PRIMARY KEY,
  fundamental_question_id TEXT NOT NULL REFERENCES fundamental_question(id),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'activa',
  sort_order INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  tags TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  archived_at TEXT
);

CREATE TABLE topic (
  id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL REFERENCES subject(id),
  competency_id TEXT REFERENCES competency(id),
  learning_stage_id TEXT REFERENCES learning_stage(id),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'activo',
  sort_order INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  tags TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  archived_at TEXT
);

CREATE TABLE curriculum_dependency (
  id TEXT PRIMARY KEY,
  from_topic_id TEXT NOT NULL REFERENCES topic(id),
  to_topic_id TEXT NOT NULL REFERENCES topic(id),
  dependency_type TEXT NOT NULL DEFAULT 'requires' CHECK (dependency_type IN ('requires','suggests')),
  status TEXT NOT NULL DEFAULT 'activa',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- 2. Sesiones y estudio -------------------------------------------------------

CREATE TABLE study_session (
  id TEXT PRIMARY KEY,
  fundamental_question_id TEXT REFERENCES fundamental_question(id),
  competency_id TEXT REFERENCES competency(id),
  subject_id TEXT REFERENCES subject(id),
  topic_id TEXT REFERENCES topic(id),
  session_type TEXT NOT NULL CHECK (session_type IN
    ('explicacion','debate','lectura','ejercicio','laboratorio','revision','aplicacion','produccion_escrita','diagnostico')),
  planned_duration_min INTEGER,
  actual_duration_min INTEGER,
  prior_knowledge TEXT,
  observable_objective TEXT,
  resources TEXT,
  expected_product TEXT,
  continuity_point_prev_id TEXT,
  started_at TEXT,
  ended_at TEXT,
  closure_status TEXT NOT NULL DEFAULT 'en_curso' CHECK (closure_status IN ('en_curso','formal','cancelada','incompleta')),
  conclusion TEXT,
  evidence_summary TEXT,
  next_action TEXT,
  continuity_point TEXT,
  status TEXT NOT NULL DEFAULT 'activa',
  sort_order INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  tags TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  archived_at TEXT
);

CREATE TABLE study_block (
  id TEXT PRIMARY KEY,
  study_session_id TEXT NOT NULL REFERENCES study_session(id),
  block_type TEXT NOT NULL CHECK (block_type IN ('comprension','aplicacion','consolidacion')),
  started_at TEXT,
  ended_at TEXT,
  quick_notes TEXT,
  status TEXT NOT NULL DEFAULT 'activo',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE pomodoro_cycle (
  id TEXT PRIMARY KEY,
  study_session_id TEXT NOT NULL REFERENCES study_session(id),
  cycle_index INTEGER NOT NULL,
  phase TEXT NOT NULL CHECK (phase IN ('foco','pausa_corta','pausa_larga')),
  planned_minutes INTEGER NOT NULL,
  actual_minutes INTEGER,
  interrupted INTEGER NOT NULL DEFAULT 0,
  started_at TEXT,
  ended_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE learning_evidence (
  id TEXT PRIMARY KEY,
  study_session_id TEXT REFERENCES study_session(id),
  project_id TEXT REFERENCES project(id),
  evidence_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  file_path TEXT,
  obsidian_note_id TEXT REFERENCES obsidian_note(id),
  status TEXT NOT NULL DEFAULT 'activa',
  sort_order INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  tags TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  archived_at TEXT
);

CREATE TABLE mastery_assessment (
  id TEXT PRIMARY KEY,
  competency_id TEXT NOT NULL REFERENCES competency(id),
  topic_id TEXT REFERENCES topic(id),
  level INTEGER NOT NULL CHECK (level BETWEEN 0 AND 5),
  assessed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  declared_confidence INTEGER,
  perceived_difficulty INTEGER,
  result_explanation TEXT,
  evidence_id TEXT REFERENCES learning_evidence(id),
  evaluator TEXT NOT NULL DEFAULT 'fundador' CHECK (evaluator IN ('fundador','chatgpt','sodiac_heuristica')),
  is_provisional INTEGER NOT NULL DEFAULT 1,
  next_advance_criterion TEXT,
  status TEXT NOT NULL DEFAULT 'activa',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE review (
  id TEXT PRIMARY KEY,
  competency_id TEXT REFERENCES competency(id),
  topic_id TEXT REFERENCES topic(id),
  evidence_id TEXT REFERENCES learning_evidence(id),
  due_at TEXT,
  state TEXT NOT NULL DEFAULT 'no_programado' CHECK (state IN
    ('no_programado','proximo','pendiente','vencido','completado','pospuesto','innecesario','enfriado')),
  reason_factors TEXT,
  completed_at TEXT,
  status TEXT NOT NULL DEFAULT 'activo',
  sort_order INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  tags TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  archived_at TEXT
);

-- 3. Planificación ------------------------------------------------------------

CREATE TABLE project (
  id TEXT PRIMARY KEY,
  fundamental_question_id TEXT REFERENCES fundamental_question(id),
  competency_id TEXT REFERENCES competency(id),
  subject_id TEXT REFERENCES subject(id),
  title TEXT NOT NULL,
  description TEXT,
  project_type TEXT NOT NULL,
  closure_conditions TEXT,
  context_type TEXT NOT NULL CHECK (context_type IN
    ('estudio','laboratorio','simulacion','cartera_real','produccion_editorial')),
  started_at TEXT,
  closed_at TEXT,
  status TEXT NOT NULL DEFAULT 'activo',
  sort_order INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  tags TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  archived_at TEXT
);

CREATE TABLE project_milestone (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES project(id),
  title TEXT NOT NULL,
  description TEXT,
  due_at TEXT,
  completed_at TEXT,
  status TEXT NOT NULL DEFAULT 'pendiente',
  sort_order INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE task (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  due_at TEXT,
  priority TEXT NOT NULL DEFAULT 'media' CHECK (priority IN ('baja','media','alta','critica')),
  task_type TEXT NOT NULL DEFAULT 'estudio' CHECK (task_type IN ('estudio','administrativo','proyecto','otro')),
  project_id TEXT REFERENCES project(id),
  study_session_id TEXT REFERENCES study_session(id),
  completed_at TEXT,
  status TEXT NOT NULL DEFAULT 'pendiente',
  sort_order INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  tags TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  archived_at TEXT
);

CREATE TABLE task_history (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES task(id),
  changed_field TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  changed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  reason TEXT
);

CREATE TABLE daily_plan (
  id TEXT PRIMARY KEY,
  plan_date TEXT NOT NULL UNIQUE,
  energy_declared INTEGER,
  available_minutes INTEGER,
  focus_subject_id TEXT REFERENCES subject(id),
  status TEXT NOT NULL DEFAULT 'activo',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE weekly_plan (
  id TEXT PRIMARY KEY,
  week_start_date TEXT NOT NULL UNIQUE,
  review_type TEXT CHECK (review_type IN ('cada_5_sesiones','etapa','trimestral','extraordinaria')),
  accelerated_json TEXT,
  postponed_json TEXT,
  removed_json TEXT,
  added_json TEXT,
  rationale TEXT,
  status TEXT NOT NULL DEFAULT 'activo',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- 4. Biblioteca -----------------------------------------------------------------

CREATE TABLE resource (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  resource_type TEXT NOT NULL CHECK (resource_type IN
    ('libro','articulo','informe','video','curso','sitio','dataset','documento_interno','archivo_local')),
  author TEXT,
  function_note TEXT CHECK (function_note IN ('estructural','didactica','tecnica','caso','critica','referencia')),
  reading_state TEXT NOT NULL DEFAULT 'pendiente' CHECK (reading_state IN
    ('pendiente','consultando','activo','finalizado','referencia','descartado','reemplazado')),
  priority TEXT,
  file_path TEXT,
  url TEXT,
  status TEXT NOT NULL DEFAULT 'activo',
  sort_order INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  tags TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  archived_at TEXT
);

CREATE TABLE bibliographic_source (
  id TEXT PRIMARY KEY,
  resource_id TEXT NOT NULL REFERENCES resource(id),
  fundamental_question_id TEXT REFERENCES fundamental_question(id),
  competency_id TEXT REFERENCES competency(id),
  subject_id TEXT REFERENCES subject(id),
  topic_id TEXT REFERENCES topic(id),
  project_id TEXT REFERENCES project(id),
  study_session_id TEXT REFERENCES study_session(id),
  obsidian_note_id TEXT REFERENCES obsidian_note(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- 5. Obsidian ---------------------------------------------------------------------

CREATE TABLE obsidian_note (
  id TEXT PRIMARY KEY,
  vault_relative_path TEXT NOT NULL UNIQUE,
  title TEXT,
  frontmatter_json TEXT,
  indexed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  checksum TEXT,
  sodiac_id TEXT,
  note_type TEXT,
  status TEXT,
  mastery_level INTEGER,
  last_review_at TEXT,
  next_review_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE note_link (
  id TEXT PRIMARY KEY,
  source_note_id TEXT NOT NULL REFERENCES obsidian_note(id),
  target_note_path TEXT NOT NULL,
  link_type TEXT NOT NULL DEFAULT 'wikilink' CHECK (link_type IN ('wikilink','embed')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- 6. Documentos institucionales -----------------------------------------------------

CREATE TABLE institutional_document (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  doc_type TEXT,
  current_version_id TEXT,
  status TEXT NOT NULL DEFAULT 'borrador' CHECK (status IN
    ('borrador','propuesto','publicado','reemplazado','archivado')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  tags TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  archived_at TEXT
);

CREATE TABLE document_version (
  id TEXT PRIMARY KEY,
  institutional_document_id TEXT NOT NULL REFERENCES institutional_document(id),
  version_label TEXT NOT NULL,
  file_path TEXT,
  changelog TEXT,
  published_at TEXT,
  replaces_version_id TEXT REFERENCES document_version(id),
  status TEXT NOT NULL DEFAULT 'borrador',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- 7. Continuidad, configuración y sistema --------------------------------------------

CREATE TABLE continuity_point (
  id TEXT PRIMARY KEY,
  study_session_id TEXT REFERENCES study_session(id),
  topic_id TEXT REFERENCES topic(id),
  project_id TEXT REFERENCES project(id),
  description TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE user_setting (
  id TEXT PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE backup_record (
  id TEXT PRIMARY KEY,
  backup_type TEXT NOT NULL CHECK (backup_type IN
    ('pre_migracion','pre_importacion','pre_restauracion','pre_operacion_masiva','diario','semanal','mensual')),
  file_path TEXT NOT NULL,
  size_bytes INTEGER,
  checksum TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  restored_at TEXT,
  restore_result TEXT
);

CREATE TABLE activity_log (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  action TEXT NOT NULL,
  payload_json TEXT,
  actor TEXT NOT NULL DEFAULT 'usuario' CHECK (actor IN ('usuario','sistema')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Índices de soporte a las consultas más frecuentes (dashboard Hoy, repasos, calendario) ---

CREATE INDEX idx_study_session_topic ON study_session(topic_id);
CREATE INDEX idx_study_session_status ON study_session(status, closure_status);
CREATE INDEX idx_review_due ON review(due_at, state);
CREATE INDEX idx_task_due ON task(due_at, status);
CREATE INDEX idx_mastery_competency ON mastery_assessment(competency_id, assessed_at);
CREATE INDEX idx_topic_subject ON topic(subject_id);
CREATE INDEX idx_obsidian_note_sodiac_id ON obsidian_note(sodiac_id);
