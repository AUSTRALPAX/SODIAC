-- Sistema académico de calificaciones, progreso, experiencia, niveles y rangos
-- (docs/ACADEMIC_PROGRESSION_BASELINE.md). Aditiva: no toca tablas existentes salvo
-- por columnas nuevas en `subject` (créditos/complejidad/XP presupuestada).
--
-- Separación conceptual deliberada (prompt maestro de esta actualización, §2):
-- `mastery_assessment` (ya existente) sigue siendo la escala de dominio 0-5 por
-- competencia — nunca se reemplaza. La calificación 0-100 de este módulo vive en
-- `academic_evaluation`, ligada a un trabajo entregado concreto, no a la competencia.

-- 1. Créditos y peso de materias ------------------------------------------------------

ALTER TABLE subject ADD COLUMN credits INTEGER NOT NULL DEFAULT 3 CHECK (credits BETWEEN 1 AND 5);
ALTER TABLE subject ADD COLUMN complexity INTEGER NOT NULL DEFAULT 3 CHECK (complexity BETWEEN 1 AND 5);
ALTER TABLE subject ADD COLUMN importance INTEGER NOT NULL DEFAULT 3 CHECK (importance BETWEEN 1 AND 5);
ALTER TABLE subject ADD COLUMN estimated_load INTEGER NOT NULL DEFAULT 3 CHECK (estimated_load BETWEEN 1 AND 5);
ALTER TABLE subject ADD COLUMN is_mandatory INTEGER NOT NULL DEFAULT 1;
ALTER TABLE subject ADD COLUMN budgeted_xp REAL;

-- 2. Rúbricas ---------------------------------------------------------------------------

CREATE TABLE grading_rubric (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  work_type TEXT NOT NULL,
  description TEXT,
  current_version_id TEXT,
  status TEXT NOT NULL DEFAULT 'activa' CHECK (status IN ('activa','archivada')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE grading_rubric_version (
  id TEXT PRIMARY KEY,
  rubric_id TEXT NOT NULL REFERENCES grading_rubric(id),
  version_label TEXT NOT NULL,
  total_points INTEGER NOT NULL DEFAULT 100,
  changelog TEXT,
  status TEXT NOT NULL DEFAULT 'activa' CHECK (status IN ('activa','reemplazada','archivada')),
  replaces_version_id TEXT REFERENCES grading_rubric_version(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE rubric_criterion (
  id TEXT PRIMARY KEY,
  rubric_version_id TEXT NOT NULL REFERENCES grading_rubric_version(id),
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  weight_points INTEGER NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_rubric_criterion_version ON rubric_criterion(rubric_version_id);

-- 3. Trabajos, entregas y evaluaciones ---------------------------------------------------

CREATE TABLE academic_assignment (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  work_type TEXT NOT NULL,
  subject_id TEXT REFERENCES subject(id),
  topic_id TEXT REFERENCES topic(id),
  competency_id TEXT REFERENCES competency(id),
  fundamental_question_id TEXT REFERENCES fundamental_question(id),
  prompt TEXT,
  rubric_version_id TEXT REFERENCES grading_rubric_version(id),
  status TEXT NOT NULL DEFAULT 'borrador' CHECK (status IN
    ('borrador','listo_para_evaluar','evaluacion_pendiente','evaluado','aceptado',
     'revision_solicitada','reevaluado','reemplazado','archivado')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  archived_at TEXT
);

CREATE INDEX idx_assignment_subject ON academic_assignment(subject_id);

CREATE TABLE assignment_submission (
  id TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL REFERENCES academic_assignment(id),
  version INTEGER NOT NULL DEFAULT 1,
  content TEXT,
  file_path TEXT,
  obsidian_note_id TEXT REFERENCES obsidian_note(id),
  work_hash TEXT,
  submitted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  status TEXT NOT NULL DEFAULT 'entregado' CHECK (status IN ('entregado','reemplazado'))
);

CREATE INDEX idx_submission_assignment ON assignment_submission(assignment_id);

CREATE TABLE academic_evaluation (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL REFERENCES assignment_submission(id),
  rubric_version_id TEXT NOT NULL REFERENCES grading_rubric_version(id),
  total_score INTEGER NOT NULL CHECK (total_score BETWEEN 0 AND 100),
  score_10 REAL NOT NULL,
  verdict TEXT NOT NULL CHECK (verdict IN
    ('revision_required','basic','competent','advanced','outstanding')),
  confidence INTEGER,
  evaluator_notes TEXT,
  evaluator TEXT NOT NULL DEFAULT 'chatgpt' CHECK (evaluator IN ('chatgpt','fundador','sodiac_heuristica')),
  prompt_used TEXT,
  work_hash TEXT,
  strengths_json TEXT,
  critical_errors_json TEXT,
  required_revisions_json TEXT,
  is_calibration INTEGER NOT NULL DEFAULT 0,
  calibration_of_id TEXT REFERENCES academic_evaluation(id),
  status TEXT NOT NULL DEFAULT 'pendiente' CHECK (status IN
    ('pendiente','aceptada','revision_requerida','rechazada','reemplazada')),
  accepted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX idx_evaluation_submission ON academic_evaluation(submission_id);

CREATE TABLE criterion_evaluation (
  id TEXT PRIMARY KEY,
  evaluation_id TEXT NOT NULL REFERENCES academic_evaluation(id),
  criterion_id TEXT NOT NULL REFERENCES rubric_criterion(id),
  score INTEGER NOT NULL,
  maximum INTEGER NOT NULL,
  justification TEXT,
  evidence_json TEXT,
  weaknesses_json TEXT,
  required_improvements_json TEXT
);

CREATE INDEX idx_criterion_evaluation_evaluation ON criterion_evaluation(evaluation_id);

-- 4. Plan de evaluación de materia -------------------------------------------------------

CREATE TABLE subject_assessment_plan (
  id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL UNIQUE REFERENCES subject(id),
  minimum_final_score INTEGER NOT NULL DEFAULT 60,
  minimum_mastery_level INTEGER NOT NULL DEFAULT 3,
  requires_applied_evidence INTEGER NOT NULL DEFAULT 1,
  requires_integrative_evaluation INTEGER NOT NULL DEFAULT 1,
  requires_deferred_review INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'no_iniciada' CHECK (status IN
    ('no_iniciada','exploracion','cursando','evaluacion','revision','completada',
     'completada_con_revision_pendiente','reabierta')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE assessment_component (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES subject_assessment_plan(id),
  category TEXT NOT NULL CHECK (category IN
    ('notas_conceptuales','ejercicios_practicas','trabajos_aplicados',
     'proyecto_examen_integrador','revision_diferida_defensa')),
  weight_pct INTEGER NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_assessment_component_plan ON assessment_component(plan_id);

-- 5. Expediente académico ----------------------------------------------------------------

CREATE TABLE academic_transcript_entry (
  id TEXT PRIMARY KEY,
  subject_id TEXT REFERENCES subject(id),
  assignment_id TEXT REFERENCES academic_assignment(id),
  evaluation_id TEXT REFERENCES academic_evaluation(id),
  title TEXT NOT NULL,
  work_type TEXT NOT NULL,
  score_100 INTEGER NOT NULL,
  score_10 REAL NOT NULL,
  verdict TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'vigente' CHECK (status IN ('vigente','reemplazada','archivada')),
  recorded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX idx_transcript_subject ON academic_transcript_entry(subject_id);

-- 6. Experiencia (XP) — registro inmutable ------------------------------------------------

CREATE TABLE xp_event (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  amount REAL NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  subject_id TEXT REFERENCES subject(id),
  category TEXT NOT NULL CHECK (category IN
    ('notas_conceptuales','ejercicios_practicas','aplicaciones_casos',
     'proyecto_examen_integrador','hitos_dominio','revision_diferida_retencion','intento')),
  reason TEXT NOT NULL,
  score INTEGER,
  multiplier REAL,
  rubric_version_id TEXT REFERENCES grading_rubric_version(id),
  idempotency_key TEXT NOT NULL UNIQUE,
  reversal_of TEXT REFERENCES xp_event(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  metadata_json TEXT
);

CREATE INDEX idx_xp_event_subject ON xp_event(subject_id);

-- 7. Niveles y rangos ---------------------------------------------------------------------

CREATE TABLE academic_level_history (
  id TEXT PRIMARY KEY,
  level INTEGER NOT NULL,
  xp_total_at REAL NOT NULL,
  reached_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE academic_rank (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  subtitle TEXT,
  description TEXT,
  minimum_level INTEGER NOT NULL,
  maximum_level INTEGER NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  badge TEXT,
  color_token TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- 8. Progreso académico (IPA) --------------------------------------------------------------

CREATE TABLE progress_formula_version (
  id TEXT PRIMARY KEY,
  version_label TEXT NOT NULL,
  weights_json TEXT NOT NULL,
  is_current INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE career_progress_snapshot (
  id TEXT PRIMARY KEY,
  formula_version_id TEXT NOT NULL REFERENCES progress_formula_version(id),
  ipa_total REAL NOT NULL,
  coverage REAL NOT NULL,
  mastery REAL NOT NULL,
  evidence REAL NOT NULL,
  retention REAL NOT NULL,
  projects REAL NOT NULL,
  computed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE subject_progress_snapshot (
  id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL REFERENCES subject(id),
  formula_version_id TEXT NOT NULL REFERENCES progress_formula_version(id),
  ipa_total REAL NOT NULL,
  coverage REAL NOT NULL,
  mastery REAL NOT NULL,
  evidence REAL NOT NULL,
  retention REAL NOT NULL,
  projects REAL NOT NULL,
  computed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX idx_subject_progress_subject ON subject_progress_snapshot(subject_id);

-- 9. Importación de evaluaciones estructuradas ---------------------------------------------

CREATE TABLE evaluation_import (
  id TEXT PRIMARY KEY,
  assignment_id TEXT REFERENCES academic_assignment(id),
  submission_id TEXT REFERENCES assignment_submission(id),
  raw_response_json TEXT NOT NULL,
  validation_status TEXT NOT NULL DEFAULT 'pendiente' CHECK (validation_status IN
    ('pendiente','valida','rechazada')),
  validation_errors_json TEXT,
  resulting_evaluation_id TEXT REFERENCES academic_evaluation(id),
  imported_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
