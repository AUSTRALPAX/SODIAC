import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { UserSettingRow } from "@/database/types";
import {
  exportViewPreferences,
  importViewPreferences,
  loadViewPreference,
  resetAllViewPreferences,
  resetViewPreference,
  saveViewPreference,
} from "@/services/viewPreferences";

let rows: UserSettingRow[] = [];

function makeMemoryRepo() {
  return {
    async list({ where, params }: { where?: string; params?: unknown[] } = {}) {
      if (where === "key = ?") return rows.filter((r) => r.key === params![0]);
      return [...rows];
    },
    async insert(row: UserSettingRow) {
      rows.push(row);
      return row;
    },
    async update(id: string, patch: Partial<UserSettingRow>) {
      const row = rows.find((r) => r.id === id);
      if (row) Object.assign(row, patch);
    },
  };
}

vi.mock("@/database/entities", () => ({
  get userSettingsRepo() {
    return makeMemoryRepo();
  },
}));

vi.mock("@/database/client", () => ({
  getDb: async () => ({
    async execute(sql: string, params: unknown[] = []) {
      if (sql.includes("WHERE key = ?")) {
        rows = rows.filter((r) => r.key !== params[0]);
      } else if (sql.includes("WHERE key LIKE ?")) {
        const prefix = String(params[0]).replace(/%$/, "");
        rows = rows.filter((r) => !r.key.startsWith(prefix));
      }
    },
    async select(sql: string, params: unknown[] = []) {
      if (sql.includes("WHERE key LIKE ?")) {
        const prefix = String(params[0]).replace(/%$/, "");
        return rows.filter((r) => r.key.startsWith(prefix)).map((r) => ({ key: r.key, value_json: r.value_json }));
      }
      return [];
    },
  }),
}));

const testSchema = z
  .object({
    schemaVersion: z.literal(1),
    sortKey: z.string().default("area"),
  })
  .strict();
const defaults = { schemaVersion: 1 as const, sortKey: "area" };

beforeEach(() => {
  rows = [];
});

describe("viewPreferences", () => {
  it("devuelve los valores predeterminados cuando no hay nada guardado", async () => {
    const value = await loadViewPreference("library", testSchema, defaults);
    expect(value).toEqual(defaults);
  });

  it("carga un valor válido previamente guardado", async () => {
    await saveViewPreference("library", { schemaVersion: 1, sortKey: "estado" });
    const value = await loadViewPreference("library", testSchema, defaults);
    expect(value.sortKey).toBe("estado");
  });

  it("descarta un value_json corrupto y devuelve los predeterminados", async () => {
    rows.push({ id: "1", key: "view_state:library", value_json: "{not json", updated_at: "" });
    const value = await loadViewPreference("library", testSchema, defaults);
    expect(value).toEqual(defaults);
  });

  it("descarta una forma inválida (campo extra, .strict()) y devuelve los predeterminados", async () => {
    rows.push({
      id: "1",
      key: "view_state:library",
      value_json: JSON.stringify({ schemaVersion: 1, sortKey: "area", campoQueNoExiste: true }),
      updated_at: "",
    });
    const value = await loadViewPreference("library", testSchema, defaults);
    expect(value).toEqual(defaults);
  });

  it("descarta una versión de schema vieja sin migración registrada", async () => {
    rows.push({
      id: "1",
      key: "view_state:library",
      value_json: JSON.stringify({ schemaVersion: 0, sortKey: "area" }),
      updated_at: "",
    });
    const value = await loadViewPreference("library", testSchema, defaults);
    expect(value).toEqual(defaults);
  });

  it("restablece una sola vista sin afectar otras", async () => {
    await saveViewPreference("library", { schemaVersion: 1, sortKey: "estado" });
    await saveViewPreference("trajectory", { schemaVersion: 1, sortKey: "otro" });
    await resetViewPreference("library");
    expect(await loadViewPreference("library", testSchema, defaults)).toEqual(defaults);
    expect((await loadViewPreference("trajectory", testSchema, defaults)).sortKey).toBe("otro");
  });

  it("restablece todas las vistas de una vez", async () => {
    await saveViewPreference("library", { schemaVersion: 1, sortKey: "estado" });
    await saveViewPreference("trajectory", { schemaVersion: 1, sortKey: "otro" });
    await resetAllViewPreferences();
    expect(await loadViewPreference("library", testSchema, defaults)).toEqual(defaults);
    expect(await loadViewPreference("trajectory", testSchema, defaults)).toEqual(defaults);
  });

  it("exporta e importa preferencias, ignorando claves fuera de convención", async () => {
    await saveViewPreference("library", { schemaVersion: 1, sortKey: "estado" });
    const exported = await exportViewPreferences();
    expect(Object.keys(exported.preferences)).toEqual(["view_state:library"]);

    rows = [];
    const withInvalidKey = {
      exportedAt: exported.exportedAt,
      preferences: { ...exported.preferences, "otra_clave_no_relacionada": { foo: "bar" } },
    };
    const result = await importViewPreferences(withInvalidKey);
    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(1);
    expect((await loadViewPreference("library", testSchema, defaults)).sortKey).toBe("estado");
  });
});
