import libraryInstitutionalSeed from "../../seed/library-institutional.json";
import { resourcesRepo } from "@/database/entities";
import type { ResourceRow } from "@/database/types";

const now = () => new Date().toISOString();

interface LibrarySeedEntry {
  area: string;
  author: string;
  title: string;
  description: string;
  resource_type: ResourceRow["resource_type"];
  function_note: ResourceRow["function_note"];
}

const seed = libraryInstitutionalSeed as LibrarySeedEntry[];

/**
 * Clave lógica normalizada área+autor/fuente+título (docs/UPDATE_1_1_BASELINE.md
 * — sección Biblioteca). Solo se usa para comparar y decidir duplicados; el
 * texto original visible (area/author/title guardados) nunca se altera.
 */
export function normalizeKey(area: string, author: string, title: string): string {
  const strip = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "") // tildes (marcas combinantes tras NFD)
      .toLowerCase()
      .replace(/['".,;:-]/g, "") // signos menores
      .replace(/\s+/g, " ")
      .trim();
  return `${strip(area)}|${strip(author)}|${strip(title)}`;
}

export interface LibraryImportSummary {
  expected: number;
  imported: number;
  alreadyExisting: number;
  updated: number;
  duplicatesAvoided: number;
  errors: string[];
}

/**
 * Importa la Base Bibliográfica Inicial (39 recursos, IAC_Compendio_Maestro_v1.0.0.pdf
 * páginas 76-80). Idempotente: reejecutar no duplica filas. Nunca sobrescribe un
 * campo que el usuario ya haya completado — solo rellena campos institucionales
 * ausentes (area, evaluation_state, function_note, notes).
 */
export async function importLibraryInstitutionalBase(): Promise<LibraryImportSummary> {
  const existingResources = await resourcesRepo.list({ where: "archived_at IS NULL" });
  const existingByKey = new Map<string, ResourceRow>();
  for (const r of existingResources) {
    if (r.area && r.author) {
      existingByKey.set(normalizeKey(r.area, r.author, r.title), r);
    }
  }

  const summary: LibraryImportSummary = {
    expected: seed.length,
    imported: 0,
    alreadyExisting: 0,
    updated: 0,
    duplicatesAvoided: 0,
    errors: [],
  };

  for (const entry of seed) {
    try {
      const key = normalizeKey(entry.area, entry.author, entry.title);
      const existing = existingByKey.get(key);

      if (!existing) {
        const row: ResourceRow = {
          id: crypto.randomUUID(),
          title: entry.title,
          resource_type: entry.resource_type,
          author: entry.author,
          function_note: entry.function_note,
          reading_state: "pendiente",
          priority: null,
          file_path: null,
          url: null,
          area: entry.area,
          evaluation_state: "Por evaluar",
          status: "activo",
          sort_order: 0,
          notes: entry.description,
          tags: "seed:biblioteca_institucional",
          created_at: now(),
          updated_at: now(),
          archived_at: null,
          catalog_number: null,
          original_year: null,
          category: null,
          access_label: null,
          access_type: null,
          source_document: null,
          source_page: null,
          import_batch: "biblioteca_institucional",
        };
        await resourcesRepo.insert(row, "sistema");
        summary.imported++;
        continue;
      }

      summary.duplicatesAvoided++;
      const patch: Partial<ResourceRow> = {};
      if (!existing.area) patch.area = entry.area;
      if (!existing.evaluation_state) patch.evaluation_state = "Por evaluar";
      if (!existing.function_note) patch.function_note = entry.function_note;
      if (!existing.notes) patch.notes = entry.description;

      if (Object.keys(patch).length > 0) {
        await resourcesRepo.update(existing.id, patch, "sistema");
        summary.updated++;
      } else {
        summary.alreadyExisting++;
      }
    } catch (error) {
      summary.errors.push(`${entry.area} · ${entry.author} · ${entry.title}: ${String(error)}`);
    }
  }

  return summary;
}
