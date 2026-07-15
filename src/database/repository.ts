import { getDb } from "./client";

export type Actor = "usuario" | "sistema";

/**
 * Fábrica de repositorios genéricos. La mayoría de las 24 tablas de
 * docs/DATA_MODEL.md comparten la misma forma de acceso (CRUD + archivado
 * lógico + auditoría), así que en vez de escribir 24 módulos casi
 * idénticos se centraliza aquí. Entidades con necesidades propias (por
 * ejemplo backup_record o activity_log, que no se auditan a sí mismas)
 * usan la base de datos directamente — ver src/database/entities/.
 */
export function createRepository<T extends { id: string }>(table: string) {
  return {
    table,

    async list(options: { orderBy?: string; where?: string; params?: unknown[] } = {}): Promise<T[]> {
      const db = await getDb();
      const where = options.where ? `WHERE ${options.where}` : "";
      const orderBy = options.orderBy ? `ORDER BY ${options.orderBy}` : "";
      return db.select<T[]>(`SELECT * FROM ${table} ${where} ${orderBy}`, options.params ?? []);
    },

    async getById(id: string): Promise<T | null> {
      const db = await getDb();
      const rows = await db.select<T[]>(`SELECT * FROM ${table} WHERE id = ?`, [id]);
      return rows[0] ?? null;
    },

    async insert(row: T, actor: Actor = "usuario"): Promise<T> {
      const db = await getDb();
      const columns = Object.keys(row);
      const placeholders = columns.map(() => "?").join(", ");
      const values = columns.map((c) => (row as Record<string, unknown>)[c]);
      await db.execute(
        `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`,
        values,
      );
      await logActivity(table, row.id, "create", row, actor);
      return row;
    },

    async update(id: string, patch: Partial<T>, actor: Actor = "usuario"): Promise<void> {
      const db = await getDb();
      const columns = Object.keys(patch);
      if (columns.length === 0) return;
      const assignments = columns.map((c) => `${c} = ?`).join(", ");
      const values = columns.map((c) => (patch as Record<string, unknown>)[c]);
      await db.execute(
        `UPDATE ${table} SET ${assignments}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`,
        [...values, id],
      );
      await logActivity(table, id, "update", patch, actor);
    },

    async archive(id: string, actor: Actor = "usuario"): Promise<void> {
      const db = await getDb();
      await db.execute(
        `UPDATE ${table} SET archived_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`,
        [id],
      );
      await logActivity(table, id, "archive", {}, actor);
    },
  };
}

async function logActivity(
  entityType: string,
  entityId: string,
  action: string,
  payload: unknown,
  actor: Actor,
): Promise<void> {
  if (entityType === "activity_log") return;
  const db = await getDb();
  await db.execute(
    `INSERT INTO activity_log (id, entity_type, entity_id, action, payload_json, actor) VALUES (?, ?, ?, ?, ?, ?)`,
    [crypto.randomUUID(), entityType, entityId, action, JSON.stringify(payload), actor],
  );
}
