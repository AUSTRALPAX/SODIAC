import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ResourceRow } from "@/database/types";
import seedData from "../seed/library-austrofinanciera.json";
import minimalPathData from "../seed/library-austrofinanciera-ruta-minima.json";

interface SeedEntry {
  catalogNumber: number;
  author: string;
  title: string;
  originalYear: number;
  category: string;
}

const seed = seedData as SeedEntry[];

/** Repo en memoria mínimo — igual patrón que tests/curriculumReconciliation.test.ts. */
function makeMemoryRepo<T extends { id: string }>(seedRows: T[] = []) {
  const rows = [...seedRows];
  return {
    rows,
    async list(options: { where?: string } = {}) {
      // Los tests de este archivo solo filtran por archived_at IS NULL,
      // que es exactamente el comportamiento por defecto de esta base en
      // memoria (nunca se archiva nada acá).
      void options;
      return [...rows];
    },
    async insert(row: T) {
      rows.push(row);
      return row;
    },
    async update(id: string, patch: Partial<T>) {
      const row = rows.find((r) => r.id === id);
      if (row) Object.assign(row, patch);
    },
    async getById(id: string) {
      return rows.find((r) => r.id === id) ?? null;
    },
  };
}

let resources: ReturnType<typeof makeMemoryRepo<ResourceRow>>;

vi.mock("@/database/entities", () => ({
  get resourcesRepo() {
    return resources;
  },
}));

vi.mock("@/services/backup", () => ({
  createBackup: vi.fn(async () => ({ id: "backup-test" })),
}));

const { normalizeMatchKey, previewImport, runImport, IMPORT_VERSION, MINIMAL_PATH_TAG } = await import(
  "@/services/libraryAustrofinancialImport"
);

function baseResourceRow(overrides: Partial<ResourceRow> & { id: string }): ResourceRow {
  return {
    title: "Título",
    resource_type: "libro",
    author: null,
    function_note: null,
    reading_state: "pendiente",
    priority: null,
    file_path: null,
    url: null,
    status: "activo",
    sort_order: 0,
    notes: null,
    tags: null,
    created_at: "",
    updated_at: "",
    archived_at: null,
    area: null,
    evaluation_state: null,
    catalog_number: null,
    original_year: null,
    category: null,
    access_label: null,
    access_type: null,
    source_document: null,
    source_page: null,
    import_batch: null,
    ...overrides,
  };
}

beforeEach(() => {
  resources = makeMemoryRepo<ResourceRow>([]);
});

describe("catálogo austrofinanciero (seed)", () => {
  it("contiene exactamente 110 obras", () => {
    expect(seed.length).toBe(110);
  });

  it("tiene números de catálogo únicos del 1 al 110", () => {
    const numbers = seed.map((e) => e.catalogNumber).sort((a, b) => a - b);
    expect(numbers).toEqual(Array.from({ length: 110 }, (_, i) => i + 1));
  });

  it("agrupa en exactamente 11 categorías", () => {
    const categories = new Set(seed.map((e) => e.category));
    expect(categories.size).toBe(11);
  });

  it("la ruta mínima tiene 12 títulos válidos del catálogo", () => {
    const minimal = minimalPathData as number[];
    expect(minimal).toHaveLength(12);
    const catalogNumbers = new Set(seed.map((e) => e.catalogNumber));
    for (const n of minimal) expect(catalogNumbers.has(n)).toBe(true);
  });
});

describe("normalizeMatchKey", () => {
  it("normaliza ignorando mayúsculas, tildes y signos menores", () => {
    const a = normalizeMatchKey("Human Action", "Ludwig von Mises", 1949);
    const b = normalizeMatchKey("  HUMAN, ACTION.  ", "LUDWIG VON MISES", 1949);
    expect(a).toBe(b);
  });

  it("colapsa la partícula von/tildes/mayúsculas del mismo nombre completo", () => {
    const a = normalizeMatchKey("The Positive Theory of Capital", "Eugen von Böhm-Bawerk", 1889);
    const b = normalizeMatchKey("The Positive Theory of Capital", "EUGEN BÖHM-BAWERK", 1889);
    expect(a).toBe(b);

    const c = normalizeMatchKey("Competition and Entrepreneurship", "Israel M. Kirzner", 1973);
    const d = normalizeMatchKey("Competition and Entrepreneurship", "Israel  Kirzner", 1973);
    expect(c).toBe(d);
  });

  it("NO fusiona automáticamente nombre completo vs. solo apellido (ejemplo del pedido) — queda como coincidencia probable, no exacta", () => {
    // "Eugen von Böhm-Bawerk" / "Böhm-Bawerk" es justo el tipo de coincidencia
    // dudosa que el pedido dice que no hay que fusionar sola: distinta clave
    // exacta, se resuelve vía previewImport() como coincidencia probable por
    // título (ver el test de previewImport más abajo).
    const a = normalizeMatchKey("The Positive Theory of Capital", "Eugen von Böhm-Bawerk", 1889);
    const b = normalizeMatchKey("The Positive Theory of Capital", "Böhm-Bawerk", 1889);
    expect(a).not.toBe(b);
  });

  it("distingue obras con el mismo título pero distinto año", () => {
    const a = normalizeMatchKey("Omnipotent Government", "Ludwig von Mises", 1944);
    const b = normalizeMatchKey("Omnipotent Government", "Ludwig von Mises", 1949);
    expect(a).not.toBe(b);
  });
});

describe("previewImport", () => {
  it("clasifica las 110 obras como nuevas cuando la base está vacía", async () => {
    const preview = await previewImport();
    expect(preview.totalCatalog).toBe(110);
    expect(preview.newEntries).toHaveLength(110);
    expect(preview.exactMatches).toHaveLength(0);
  });

  it("detecta una coincidencia exacta por clave título+autor+año", async () => {
    resources.rows.push(
      baseResourceRow({
        id: "r1",
        title: "Human Action: A Treatise on Economics",
        author: "Ludwig von Mises",
        original_year: 1949,
      }),
    );
    const preview = await previewImport();
    expect(preview.exactMatches).toHaveLength(1);
    expect(preview.exactMatches[0]!.existingResourceId).toBe("r1");
    expect(preview.newEntries).toHaveLength(109);
  });

  it("detecta una coincidencia probable cuando el título coincide pero el autor no (traducción)", async () => {
    resources.rows.push(
      baseResourceRow({
        id: "r1",
        title: "Economics in One Lesson",
        author: "H. Hazlitt (trad. distinta)",
        original_year: null,
      }),
    );
    const preview = await previewImport();
    expect(preview.probableMatches).toHaveLength(1);
    expect(preview.probableMatches[0]!.existingResourceId).toBe("r1");
    expect(preview.exactMatches).toHaveLength(0);
  });
});

describe("runImport", () => {
  it("importa exactamente 110 obras nuevas cuando la base está vacía", async () => {
    const summary = await runImport({ skipBackup: true });
    expect(summary.imported).toBe(110);
    expect(summary.duplicatesAvoided).toBe(0);
    expect(summary.errors).toHaveLength(0);
    expect(resources.rows).toHaveLength(110);
    expect(resources.rows.every((r) => r.import_batch === IMPORT_VERSION)).toBe(true);
  });

  it("es idempotente: correrlo dos veces no duplica nada", async () => {
    await runImport({ skipBackup: true });
    const second = await runImport({ skipBackup: true });
    expect(second.imported).toBe(0);
    expect(second.duplicatesAvoided).toBe(110);
    expect(resources.rows).toHaveLength(110);
  });

  it("nunca pisa un campo institucional que el usuario ya completó", async () => {
    await runImport({ skipBackup: true });
    const misesHumanAction = resources.rows.find((r) => r.title === "Human Action: A Treatise on Economics")!;
    misesHumanAction.priority = "Mi prioridad personal";
    misesHumanAction.file_path = "D:/mis-libros/human-action.pdf";
    misesHumanAction.reading_state = "activo";

    await runImport({ skipBackup: true });

    const after = resources.rows.find((r) => r.id === misesHumanAction.id)!;
    expect(after.priority).toBe("Mi prioridad personal");
    expect(after.file_path).toBe("D:/mis-libros/human-action.pdf");
    expect(after.reading_state).toBe("activo");
  });

  it("marca las 12 obras de la ruta mínima con el tag correspondiente", async () => {
    await runImport({ skipBackup: true });
    const tagged = resources.rows.filter((r) => r.tags?.includes(MINIMAL_PATH_TAG));
    expect(tagged).toHaveLength(12);
  });

  it("no crea un recurso nuevo para una coincidencia exacta preexistente", async () => {
    resources.rows.push(
      baseResourceRow({
        id: "existing-1",
        title: "Economics in One Lesson",
        author: "Henry Hazlitt",
        original_year: 1946,
      }),
    );
    const summary = await runImport({ skipBackup: true });
    expect(summary.imported).toBe(109);
    expect(summary.duplicatesAvoided).toBe(1);
    expect(resources.rows).toHaveLength(110);
    expect(resources.rows.filter((r) => r.title === "Economics in One Lesson")).toHaveLength(1);
  });
});
