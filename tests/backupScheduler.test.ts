import { describe, expect, it } from "vitest";
import { pickDueBackupTypes } from "@/services/backup/scheduler";
import type { BackupRecordRow } from "@/database/types";

function backup(type: BackupRecordRow["backup_type"], createdAt: string): BackupRecordRow {
  return {
    id: crypto.randomUUID(),
    backup_type: type,
    file_path: "x",
    size_bytes: 0,
    checksum: null,
    created_at: createdAt,
    restored_at: null,
    restore_result: null,
    status: "verificado",
    schema_version: null,
    record_counts_json: null,
    protected_at: null,
  };
}

describe("pickDueBackupTypes", () => {
  const now = new Date("2026-07-17T12:00:00.000Z");

  it("marca los tres tipos automáticos como vencidos si nunca se creó ninguno", () => {
    expect(pickDueBackupTypes([], now).sort()).toEqual(["diario", "mensual", "semanal"]);
  });

  it("no marca 'diario' como vencido si el último se creó hace menos de 1 día", () => {
    const backups = [backup("diario", "2026-07-17T00:00:00.000Z")];
    expect(pickDueBackupTypes(backups, now)).not.toContain("diario");
  });

  it("marca 'diario' como vencido si el último se creó hace más de 1 día", () => {
    const backups = [backup("diario", "2026-07-15T00:00:00.000Z")];
    expect(pickDueBackupTypes(backups, now)).toContain("diario");
  });

  it("no marca 'semanal' como vencido dentro de los 7 días", () => {
    const backups = [backup("semanal", "2026-07-12T00:00:00.000Z")];
    expect(pickDueBackupTypes(backups, now)).not.toContain("semanal");
  });

  it("marca 'mensual' como vencido después de 30 días", () => {
    const backups = [backup("mensual", "2026-06-01T00:00:00.000Z")];
    expect(pickDueBackupTypes(backups, now)).toContain("mensual");
  });

  it("ignora backups de tipos no automáticos (manual, pre_migracion, etc.) para la cadencia", () => {
    const backups = [backup("manual", now.toISOString())];
    expect(pickDueBackupTypes(backups, now).sort()).toEqual(["diario", "mensual", "semanal"]);
  });
});
