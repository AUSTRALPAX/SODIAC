-- Fase 1 de la mejora integral (mejora arquitectónica de SODIAC):
-- versiona las reglas de XP y el currículo, y sienta la base del sistema
-- de atributos académicos. Todo aditivo: ninguna columna existente cambia
-- de forma ni de valor, y todas las filas actuales quedan taggeadas a la
-- versión "v1" (que reproduce EXACTAMENTE los valores hoy hardcodeados en
-- src/services/xp.ts — ver src/services/xpRulesVersion.ts).

CREATE TABLE xp_rules_version (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  career_total_xp REAL NOT NULL,
  max_level INTEGER NOT NULL,
  level_curve_exponent REAL NOT NULL,
  graded_share REAL NOT NULL,
  completion_share REAL NOT NULL,
  category_weights_json TEXT NOT NULL,
  completion_category_weights_json TEXT NOT NULL,
  -- Punto de congelamiento para una futura recalibración no destructiva
  -- (sección "Decisión de diseño" del plan de Fase 1): mientras sean NULL,
  -- la curva es la simple de siempre. Una versión futura que amplíe
  -- career_total_xp los completa para que ningún usuario baje de nivel.
  frozen_at_level INTEGER,
  frozen_at_xp REAL,
  is_current INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  notes TEXT
);

INSERT INTO xp_rules_version (
  id, label, career_total_xp, max_level, level_curve_exponent,
  graded_share, completion_share, category_weights_json,
  completion_category_weights_json, frozen_at_level, frozen_at_xp,
  is_current, notes
) VALUES (
  'xp-rules-v1',
  'Reglas de XP fundacionales',
  100000, 100, 1.55,
  0.7, 0.3,
  '{"notas_conceptuales":0.10,"ejercicios_practicas":0.20,"aplicaciones_casos":0.25,"proyecto_examen_integrador":0.30,"hitos_dominio":0.10,"revision_diferida_retencion":0.05,"intento":0}',
  '{"finalizacion_tarea_hito":0.20,"finalizacion_tema":0.36,"validacion_conocimiento":0.24,"cierre_materia":0.20}',
  NULL, NULL,
  1,
  'Snapshot exacto de las constantes vigentes en xp.ts antes de esta migración — cero cambio de comportamiento.'
);

ALTER TABLE xp_event ADD COLUMN xp_rules_version_id TEXT REFERENCES xp_rules_version(id);
UPDATE xp_event SET xp_rules_version_id = 'xp-rules-v1' WHERE xp_rules_version_id IS NULL;

CREATE TABLE curriculum_version (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT,
  is_current INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

INSERT INTO curriculum_version (id, label, description, is_current) VALUES
  ('curriculum-v1', 'Currículo fundacional', 'Materias y temas importados desde el vault de Obsidian antes de la ampliación arquitectónica.', 1);

ALTER TABLE subject ADD COLUMN curriculum_version_id TEXT REFERENCES curriculum_version(id);
UPDATE subject SET curriculum_version_id = 'curriculum-v1' WHERE curriculum_version_id IS NULL;

ALTER TABLE topic ADD COLUMN curriculum_version_id TEXT REFERENCES curriculum_version(id);
UPDATE topic SET curriculum_version_id = 'curriculum-v1' WHERE curriculum_version_id IS NULL;

-- Nivel objetivo de dominio (0-5) por tema — nullable a propósito: no se
-- inventa un valor para los ~492 temas existentes, el panel de integridad
-- académica los va a señalar como pendientes de completar.
ALTER TABLE topic ADD COLUMN target_mastery_level INTEGER CHECK (target_mastery_level BETWEEN 0 AND 5);

-- Sistema de atributos académicos ("en qué te estás convirtiendo").
CREATE TABLE academic_attribute (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'activo' CHECK (status IN ('activo','archivado')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

INSERT INTO academic_attribute (id, code, name, sort_order) VALUES
  ('attr-pensamiento', 'pensamiento', 'Pensamiento', 1),
  ('attr-economia', 'economia', 'Economía', 2),
  ('attr-metodos-cuantitativos', 'metodos_cuantitativos', 'Métodos cuantitativos', 3),
  ('attr-empresa', 'empresa', 'Empresa', 4),
  ('attr-finanzas', 'finanzas', 'Finanzas', 5),
  ('attr-asignacion-capital', 'asignacion_capital', 'Asignación de capital', 6),
  ('attr-instituciones-derecho', 'instituciones_derecho', 'Instituciones y derecho', 7),
  ('attr-laboratorio', 'laboratorio', 'Laboratorio', 8),
  ('attr-produccion-conocimiento', 'produccion_conocimiento', 'Producción de conocimiento', 9);

-- Pesos por tema: se crea vacía a propósito (ver Fase 1 del plan — asignar
-- pesos a los ~492 temas existentes es autoría de contenido real, no algo
-- que se pueda inventar en una migración). Un tema sin filas acá
-- simplemente no aporta todavía a ningún atributo.
CREATE TABLE topic_attribute_weight (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL REFERENCES topic(id),
  attribute_id TEXT NOT NULL REFERENCES academic_attribute(id),
  weight_pct REAL NOT NULL CHECK (weight_pct > 0 AND weight_pct <= 100),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(topic_id, attribute_id)
);

CREATE INDEX idx_topic_attribute_weight_topic ON topic_attribute_weight(topic_id);
