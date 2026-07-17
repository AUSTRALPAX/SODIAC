import seedData from "../../seed/library-austrofinanciera.json";
import minimalPathData from "../../seed/library-austrofinanciera-ruta-minima.json";
import { resourcesRepo } from "@/database/entities";
import { createBackup } from "@/services/backup";
import type { ResourceRow } from "@/database/types";

const now = () => new Date().toISOString();

export const IMPORT_VERSION = "SODIAC_BIBLIOGRAPHY_AUSTROFINANCIAL_V1";
export const MINIMAL_PATH_TAG = "ruta_minima_austrofinanciera";

interface AustrofinancialSeedEntry {
  catalogNumber: number;
  author: string;
  title: string;
  originalYear: number;
  category: string;
  mainArea: string;
  priorityLevel: string;
  accessLabel: string;
  accessType: NonNullable<ResourceRow["access_type"]>;
  sourceDocument: string;
  sourcePage: number;
}

const seed = seedData as AustrofinancialSeedEntry[];
const minimalPathCatalogNumbers = new Set(minimalPathData as number[]);

function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function stripPunctuation(s: string): string {
  return stripDiacritics(s)
    .toLowerCase()
    .replace(/['".,;:-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Colapsa variantes frecuentes de un mismo autor (docs del pedido, sección 6):
 * "Friedrich A. Hayek" / "Friedrich von Hayek", "Murray N. Rothbard" /
 * "Murray Rothbard", "Eugen von Böhm-Bawerk" / "Böhm-Bawerk" — quita
 * partículas (von/van/de), iniciales sueltas y puntuación, para que la
 * clave de comparación coincida entre esas variantes sin fusionarlas
 * automáticamente en la base (solo se usa para clasificar la previsualización).
 */
function normalizeAuthorVariant(author: string): string {
  return stripPunctuation(author)
    .replace(/\b(von|van|de)\b/g, "")
    .replace(/\b[a-z]\b/g, "") // iniciales sueltas ("a", "n", ...)
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeAuthorsKey(author: string): string {
  return author
    .split(";")
    .map((part) => normalizeAuthorVariant(part))
    .filter(Boolean)
    .sort()
    .join(";");
}

/** Clave título+autor+año (sección 6 del pedido). Solo compara — nunca altera el texto visible. */
export function normalizeMatchKey(title: string, author: string, year: number | null): string {
  return `${stripPunctuation(title)}|${normalizeAuthorsKey(author)}|${year ?? ""}`;
}

function normalizeTitleOnlyKey(title: string): string {
  return stripPunctuation(title);
}

export interface ImportCandidate {
  catalogNumber: number;
  title: string;
  author: string;
}

export interface ProbableMatchCandidate extends ImportCandidate {
  existingResourceId: string;
  existingTitle: string;
  existingAuthor: string;
}

export interface ExactMatchCandidate extends ImportCandidate {
  existingResourceId: string;
}

export interface AustrofinancialImportPreview {
  totalCatalog: number;
  newEntries: ImportCandidate[];
  exactMatches: ExactMatchCandidate[];
  probableMatches: ProbableMatchCandidate[];
}

async function loadExistingIndexes() {
  const existing = await resourcesRepo.list({ where: "archived_at IS NULL" });
  const byExactKey = new Map<string, ResourceRow>();
  const byTitleKey = new Map<string, ResourceRow[]>();
  for (const r of existing) {
    byExactKey.set(normalizeMatchKey(r.title, r.author ?? "", r.original_year), r);
    const titleKey = normalizeTitleOnlyKey(r.title);
    const list = byTitleKey.get(titleKey) ?? [];
    list.push(r);
    byTitleKey.set(titleKey, list);
  }
  return { existing, byExactKey, byTitleKey };
}

/**
 * Clasifica las 110 obras sin escribir nada — nuevos / coincidencia exacta /
 * coincidencia probable (mismo título normalizado, autor o año distinto:
 * p. ej. una traducción ya cargada de otra forma). Nunca fusiona: la
 * decisión de qué hacer con una probable queda para revisión manual.
 */
export async function previewImport(): Promise<AustrofinancialImportPreview> {
  const { byExactKey, byTitleKey } = await loadExistingIndexes();

  const preview: AustrofinancialImportPreview = {
    totalCatalog: seed.length,
    newEntries: [],
    exactMatches: [],
    probableMatches: [],
  };

  for (const entry of seed) {
    const exactKey = normalizeMatchKey(entry.title, entry.author, entry.originalYear);
    const exact = byExactKey.get(exactKey);
    if (exact) {
      preview.exactMatches.push({
        catalogNumber: entry.catalogNumber,
        title: entry.title,
        author: entry.author,
        existingResourceId: exact.id,
      });
      continue;
    }

    const titleKey = normalizeTitleOnlyKey(entry.title);
    const titleMatches = byTitleKey.get(titleKey) ?? [];
    if (titleMatches.length > 0) {
      const match = titleMatches[0]!;
      preview.probableMatches.push({
        catalogNumber: entry.catalogNumber,
        title: entry.title,
        author: entry.author,
        existingResourceId: match.id,
        existingTitle: match.title,
        existingAuthor: match.author ?? "",
      });
      continue;
    }

    preview.newEntries.push({ catalogNumber: entry.catalogNumber, title: entry.title, author: entry.author });
  }

  return preview;
}

export interface AustrofinancialImportSummary {
  expected: number;
  imported: number;
  alreadyExisting: number;
  updated: number;
  duplicatesAvoided: number;
  errors: string[];
  backupId: string | null;
}

/**
 * Importa las 110 obras del catálogo austrofinanciero. Idempotente: correrlo
 * dos veces no duplica nada (misma clave exacta título+autor+año). Nunca
 * pisa un campo ya editado por el usuario ni una coincidencia probable —
 * esas quedan como "duplicado evitado" sin tocar el recurso existente.
 * Crea un backup verificable (`pre_importacion`) antes de escribir, salvo
 * que `skipBackup` se pase explícitamente (usado solo por los tests).
 */
export async function runImport(options: { skipBackup?: boolean } = {}): Promise<AustrofinancialImportSummary> {
  const backupId = options.skipBackup ? null : (await createBackup("pre_importacion")).id;
  const { byExactKey } = await loadExistingIndexes();

  const summary: AustrofinancialImportSummary = {
    expected: seed.length,
    imported: 0,
    alreadyExisting: 0,
    updated: 0,
    duplicatesAvoided: 0,
    errors: [],
    backupId,
  };

  for (const entry of seed) {
    try {
      const exactKey = normalizeMatchKey(entry.title, entry.author, entry.originalYear);
      const existing = byExactKey.get(exactKey);
      const isMinimalPath = minimalPathCatalogNumbers.has(entry.catalogNumber);

      if (!existing) {
        const row: ResourceRow = {
          id: crypto.randomUUID(),
          title: entry.title,
          resource_type: "libro",
          author: entry.author,
          function_note: null,
          reading_state: "pendiente",
          priority: entry.priorityLevel,
          file_path: null,
          url: null,
          area: entry.mainArea,
          evaluation_state: null,
          status: "activo",
          sort_order: entry.catalogNumber,
          notes: null,
          tags: isMinimalPath ? `seed:${IMPORT_VERSION},${MINIMAL_PATH_TAG}` : `seed:${IMPORT_VERSION}`,
          created_at: now(),
          updated_at: now(),
          archived_at: null,
          catalog_number: entry.catalogNumber,
          original_year: entry.originalYear,
          category: entry.category,
          access_label: entry.accessLabel,
          access_type: entry.accessType,
          source_document: entry.sourceDocument,
          source_page: entry.sourcePage,
          import_batch: IMPORT_VERSION,
        };
        await resourcesRepo.insert(row, "sistema");
        summary.imported++;
        continue;
      }

      summary.duplicatesAvoided++;
      const patch: Partial<ResourceRow> = {};
      if (!existing.priority) patch.priority = entry.priorityLevel;
      if (!existing.area) patch.area = entry.mainArea;
      if (existing.catalog_number == null) patch.catalog_number = entry.catalogNumber;
      if (existing.original_year == null) patch.original_year = entry.originalYear;
      if (!existing.category) patch.category = entry.category;
      if (!existing.access_label) patch.access_label = entry.accessLabel;
      if (!existing.access_type) patch.access_type = entry.accessType;
      if (!existing.source_document) patch.source_document = entry.sourceDocument;
      if (existing.source_page == null) patch.source_page = entry.sourcePage;
      if (!existing.import_batch) patch.import_batch = IMPORT_VERSION;
      if (isMinimalPath && !existing.tags?.includes(MINIMAL_PATH_TAG)) {
        patch.tags = existing.tags ? `${existing.tags},${MINIMAL_PATH_TAG}` : MINIMAL_PATH_TAG;
      }

      if (Object.keys(patch).length > 0) {
        await resourcesRepo.update(existing.id, patch, "sistema");
        summary.updated++;
      } else {
        summary.alreadyExisting++;
      }
    } catch (error) {
      summary.errors.push(`#${entry.catalogNumber} · ${entry.author} · ${entry.title}: ${String(error)}`);
    }
  }

  return summary;
}
