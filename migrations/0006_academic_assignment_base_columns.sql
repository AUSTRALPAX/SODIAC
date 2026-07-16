-- academic_assignment se declaró implementando BaseRow (id, status, sort_order,
-- notes, tags, created_at, updated_at, archived_at) pero la migración 0005 omitió
-- sort_order y tags. Aditiva, no destructiva.
ALTER TABLE academic_assignment ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE academic_assignment ADD COLUMN tags TEXT;
