-- Fase E: trazabilidad de uso de bibliografía (pedido explícito del usuario,
-- sección 12). Nueva tabla — no existía ningún registro de "veces
-- consultado" para `resource` hasta ahora.

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

CREATE INDEX idx_resource_usage_resource ON resource_usage_event(resource_id);
CREATE INDEX idx_resource_usage_occurred ON resource_usage_event(occurred_at);
