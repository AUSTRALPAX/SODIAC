-- Fase A: XP directo por finalización (tareas/hitos, temas, materias),
-- separado del flujo de evaluación con ChatGPT.

-- 1. Vínculos de finalización cotidiana ---------------------------------------------------

ALTER TABLE task ADD COLUMN subject_id TEXT REFERENCES subject(id);
ALTER TABLE task ADD COLUMN topic_id TEXT REFERENCES topic(id);
ALTER TABLE task ADD COLUMN milestone_id TEXT REFERENCES project_milestone(id);

ALTER TABLE topic ADD COLUMN completed_at TEXT;
ALTER TABLE subject ADD COLUMN completed_at TEXT;

-- Segundo presupuesto de XP, independiente del `budgeted_xp` de trabajo calificado.
ALTER TABLE subject ADD COLUMN completion_budgeted_xp REAL;

-- 2. Ampliar las categorías de xp_event -----------------------------------------------------
-- SQLite no permite ALTER sobre un CHECK; se reconstruye la tabla preservando
-- todas las filas e IDs existentes.

CREATE TABLE xp_event_new (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  amount REAL NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  subject_id TEXT REFERENCES subject(id),
  category TEXT NOT NULL CHECK (category IN
    ('notas_conceptuales','ejercicios_practicas','aplicaciones_casos',
     'proyecto_examen_integrador','hitos_dominio','revision_diferida_retencion','intento',
     'finalizacion_tarea_hito','finalizacion_tema','cierre_materia')),
  reason TEXT NOT NULL,
  score INTEGER,
  multiplier REAL,
  rubric_version_id TEXT REFERENCES grading_rubric_version(id),
  idempotency_key TEXT NOT NULL UNIQUE,
  reversal_of TEXT REFERENCES xp_event(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  metadata_json TEXT
);

INSERT INTO xp_event_new SELECT * FROM xp_event;
DROP TABLE xp_event;
ALTER TABLE xp_event_new RENAME TO xp_event;

CREATE INDEX idx_xp_event_subject ON xp_event(subject_id);
