import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { getDb } from "@/database/client";

/**
 * Tablas exportables en esta fase (las que ya tienen datos reales desde
 * Fase 2). Se amplía a medida que existan StudySession, Review, etc.
 * (docs/SECURITY_AND_BACKUPS.md §4).
 */
export const EXPORTABLE_TABLES = [
  "fundamental_question",
  "competency",
  "learning_stage",
  "subject",
  "topic",
  "project",
  "project_milestone",
  "institutional_document",
  "document_version",
  "backup_record",
  "activity_log",
] as const;

export type ExportableTable = (typeof EXPORTABLE_TABLES)[number];

export async function exportAllAsJson(): Promise<{ path: string } | null> {
  const db = await getDb();
  const payload: Record<string, unknown[]> = {};
  for (const table of EXPORTABLE_TABLES) {
    payload[table] = await db.select(`SELECT * FROM ${table}`);
  }
  const manifest = {
    app: "SODIAC",
    exported_at: new Date().toISOString(),
    tables: EXPORTABLE_TABLES,
  };

  const path = await save({
    title: "Exportar SODIAC (JSON completo)",
    defaultPath: `sodiac-export-${Date.now()}.json`,
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  if (!path) return null;

  await writeTextFile(path, JSON.stringify({ manifest, data: payload }, null, 2));
  return { path };
}

function toCsvValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function exportEntityAsCsv(table: ExportableTable): Promise<{ path: string } | null> {
  const db = await getDb();
  const rows = await db.select<Array<Record<string, unknown>>>(`SELECT * FROM ${table}`);
  const columns = rows.length > 0 ? Object.keys(rows[0]!) : [];
  const lines = [
    columns.join(","),
    ...rows.map((row) => columns.map((c) => toCsvValue(row[c])).join(",")),
  ];

  const path = await save({
    title: `Exportar ${table} (CSV)`,
    defaultPath: `sodiac-${table}-${Date.now()}.csv`,
    filters: [{ name: "CSV", extensions: ["csv"] }],
  });
  if (!path) return null;

  await writeTextFile(path, lines.join("\n"));
  return { path };
}
