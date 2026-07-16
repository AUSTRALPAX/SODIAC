-- Sincronización bidireccional con Obsidian (docs/UPDATE_1_1_BASELINE.md).
-- Aditiva y no destructiva.
ALTER TABLE obsidian_note ADD COLUMN sync_state TEXT NOT NULL DEFAULT 'sincronizada';
ALTER TABLE obsidian_note ADD COLUMN last_synced_at TEXT;
