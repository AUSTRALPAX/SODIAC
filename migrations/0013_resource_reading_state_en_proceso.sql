-- Agrega "en_proceso" a los estados de lectura de `resource` (pedido del
-- usuario). SQLite no permite modificar un CHECK existente con ALTER TABLE,
-- así que se recrea la tabla completa preservando todas las columnas y
-- filas (ningún dato se pierde ni cambia de id).
--
-- Por qué esto no es un simple "crear tabla nueva, copiar, DROP la vieja":
-- `resource` es tabla padre de bibliographic_source.resource_id y de
-- resource_usage_event.resource_id. tauri-plugin-sql ejecuta cada migración
-- dentro de una transacción (no_tx=false, fijo, sin forma de cambiarlo
-- desde el SQL de la migración), y tanto PRAGMA foreign_keys como PRAGMA
-- legacy_alter_table son no-op dentro de una transacción — no hay forma de
-- desactivar la reescritura automática de REFERENCES ni la verificación de
-- FKs para este cambio. Con foreign_keys=ON, "ALTER TABLE resource RENAME"
-- reescribe automáticamente el texto "REFERENCES resource(id)" de las
-- tablas hijas para que sigan apuntando a la tabla renombrada (verificado
-- empíricamente contra una copia de la base real) — así que, si sólo se
-- renombra "resource" y se crea una tabla nueva con ese nombre, las hijas
-- quedan apuntando a la vieja (ahora "resource_old"), y el DROP final de
-- esa tabla vieja falla con "FOREIGN KEY constraint failed" porque sus
-- filas siguen siendo referenciadas.
--
-- Solución verificada: recrear también bibliographic_source y
-- resource_usage_event (sus propias tablas hijas: ninguna, se confirmó
-- contra el esquema real) para que, en el momento de su propia recreación,
-- su REFERENCES resource(id) se declare de nuevo apuntando al nombre
-- "resource" — que para entonces ya es la tabla NUEVA. Recién así, cuando
-- se llega al DROP final de "resource_old", ninguna tabla viva declara una
-- FK hacia ese nombre, y el DROP no dispara ninguna verificación de FK.

ALTER TABLE resource RENAME TO resource_old;

CREATE TABLE resource (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  resource_type TEXT NOT NULL CHECK (resource_type IN
    ('libro','articulo','informe','video','curso','sitio','dataset','documento_interno','archivo_local')),
  author TEXT,
  function_note TEXT CHECK (function_note IN ('estructural','didactica','tecnica','caso','critica','referencia')),
  reading_state TEXT NOT NULL DEFAULT 'pendiente' CHECK (reading_state IN
    ('pendiente','consultando','en_proceso','activo','finalizado','referencia','descartado','reemplazado')),
  priority TEXT,
  file_path TEXT,
  url TEXT,
  status TEXT NOT NULL DEFAULT 'activo',
  sort_order INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  tags TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  archived_at TEXT,
  area TEXT,
  evaluation_state TEXT,
  catalog_number INTEGER,
  original_year INTEGER,
  category TEXT,
  access_label TEXT,
  access_type TEXT CHECK (access_type IN (
    'pdf_legal',
    'texto_legal',
    'pdf_texto_legal',
    'acceso_institucional',
    'catalogo_legal',
    'autor_editorial',
    'editorial',
    'acceso_legal',
    'sin_url_verificada'
  )),
  source_document TEXT,
  source_page INTEGER,
  import_batch TEXT
);

INSERT INTO resource SELECT
  id, title, resource_type, author, function_note, reading_state, priority, file_path, url, status,
  sort_order, notes, tags, created_at, updated_at, archived_at, area, evaluation_state, catalog_number,
  original_year, category, access_label, access_type, source_document, source_page, import_batch
FROM resource_old;

ALTER TABLE bibliographic_source RENAME TO bibliographic_source_old;

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
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  curriculum_unit_id TEXT REFERENCES curriculum_unit(id),
  relation_type TEXT CHECK (relation_type IN (
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
  )),
  importance INTEGER,
  reading_order INTEGER,
  suggested_chapters TEXT,
  notes TEXT,
  linked_at TEXT
);

INSERT INTO bibliographic_source SELECT
  id, resource_id, fundamental_question_id, competency_id, subject_id, topic_id, project_id,
  study_session_id, obsidian_note_id, created_at, curriculum_unit_id, relation_type, importance,
  reading_order, suggested_chapters, notes, linked_at
FROM bibliographic_source_old;

DROP TABLE bibliographic_source_old;

CREATE INDEX idx_bibliographic_source_curriculum_unit ON bibliographic_source(curriculum_unit_id);

ALTER TABLE resource_usage_event RENAME TO resource_usage_event_old;

CREATE TABLE resource_usage_event (
  id TEXT PRIMARY KEY,
  resource_id TEXT NOT NULL REFERENCES resource(id),
  session_id TEXT REFERENCES study_session(id),
  subject_id TEXT REFERENCES subject(id),
  topic_id TEXT REFERENCES topic(id),
  project_id TEXT REFERENCES project(id),
  note_id TEXT REFERENCES obsidian_note(id),
  action TEXT NOT NULL CHECK (action IN
    ('abierto','consultado','vinculado','citado','utilizado_en_sesion','utilizado_en_proyecto')),
  occurred_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

INSERT INTO resource_usage_event SELECT
  id, resource_id, session_id, subject_id, topic_id, project_id, note_id, action, occurred_at
FROM resource_usage_event_old;

DROP TABLE resource_usage_event_old;

CREATE INDEX idx_resource_usage_resource ON resource_usage_event(resource_id);
CREATE INDEX idx_resource_usage_occurred ON resource_usage_event(occurred_at);

DROP TABLE resource_old;

CREATE INDEX idx_resource_catalog_number ON resource(catalog_number);
CREATE INDEX idx_resource_import_batch ON resource(import_batch);
