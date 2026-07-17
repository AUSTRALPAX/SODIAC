-- Agrega el tipo "manual" a backup_record.backup_type (hoy el botón "Crear
-- backup ahora" lo etiqueta como "diario" y por lo tanto queda sujeto al
-- límite de retención de 10 — un backup manual podría borrarse solo) y
-- columnas para verificación al crear y protección explícita.
--
-- Ninguna tabla tiene FK hacia backup_record (es tabla de auditoría hoja,
-- confirmado por auditoría previa), así que esta recreación no necesita la
-- danza en cascada que sí hizo falta para `resource` en la migración 0013.

ALTER TABLE backup_record RENAME TO backup_record_old;

CREATE TABLE backup_record (
  id TEXT PRIMARY KEY,
  backup_type TEXT NOT NULL CHECK (backup_type IN
    ('pre_migracion','pre_importacion','pre_restauracion','pre_operacion_masiva','diario','semanal','mensual','manual')),
  file_path TEXT NOT NULL,
  size_bytes INTEGER,
  checksum TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  restored_at TEXT,
  restore_result TEXT,
  status TEXT CHECK (status IN ('verificado','incompleto','corrupto','incompatible')),
  schema_version INTEGER,
  record_counts_json TEXT,
  protected_at TEXT
);

INSERT INTO backup_record (
  id, backup_type, file_path, size_bytes, checksum, created_at, restored_at, restore_result
)
SELECT id, backup_type, file_path, size_bytes, checksum, created_at, restored_at, restore_result
FROM backup_record_old;

DROP TABLE backup_record_old;
