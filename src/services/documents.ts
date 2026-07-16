import { documentVersionsRepo, institutionalDocumentsRepo } from "@/database/entities";
import type { DocumentVersionRow, InstitutionalDocumentRow } from "@/database/types";

const now = () => new Date().toISOString();

export interface DocumentWithVersion extends InstitutionalDocumentRow {
  currentVersion: DocumentVersionRow | null;
}

export async function listDocuments(): Promise<DocumentWithVersion[]> {
  const documents = await institutionalDocumentsRepo.list({
    where: "archived_at IS NULL",
    orderBy: "sort_order ASC, title ASC",
  });
  const result: DocumentWithVersion[] = [];
  for (const doc of documents) {
    const currentVersion = doc.current_version_id
      ? await documentVersionsRepo.getById(doc.current_version_id)
      : null;
    result.push({ ...doc, currentVersion });
  }
  return result;
}

export async function getDocument(id: string): Promise<InstitutionalDocumentRow | null> {
  return institutionalDocumentsRepo.getById(id);
}

export async function listVersions(documentId: string): Promise<DocumentVersionRow[]> {
  return documentVersionsRepo.list({
    where: "institutional_document_id = ?",
    params: [documentId],
    orderBy: "created_at DESC",
  });
}

export interface PublishVersionInput {
  documentId: string;
  versionLabel: string;
  changelog: string;
  filePath?: string;
  publish: boolean;
}

/**
 * Publica una nueva versión sin borrar el historial: la versión anterior se
 * marca "reemplazada" y queda enlazada vía replaces_version_id (docs/DATA_MODEL.md
 * §7 — el historial de versiones se preserva, nunca se sobrescribe).
 */
export async function publishNewVersion(input: PublishVersionInput): Promise<void> {
  const document = await institutionalDocumentsRepo.getById(input.documentId);
  if (!document) throw new Error("Documento no encontrado.");

  const previousVersionId = document.current_version_id;
  const versionId = crypto.randomUUID();

  await documentVersionsRepo.insert({
    id: versionId,
    institutional_document_id: input.documentId,
    version_label: input.versionLabel,
    file_path: input.filePath ?? null,
    changelog: input.changelog,
    published_at: input.publish ? now() : null,
    replaces_version_id: previousVersionId,
    status: input.publish ? "publicado" : "borrador",
    created_at: now(),
    updated_at: now(),
    source_document_id: null,
    start_page: null,
    end_page: null,
  });

  if (previousVersionId && input.publish) {
    await documentVersionsRepo.update(previousVersionId, { status: "reemplazado" });
  }

  await institutionalDocumentsRepo.update(input.documentId, {
    current_version_id: versionId,
    status: input.publish ? "publicado" : document.status,
  });
}

export async function setDocumentStatus(
  documentId: string,
  status: InstitutionalDocumentRow["status"],
): Promise<void> {
  await institutionalDocumentsRepo.update(documentId, { status });
}

/**
 * Asocia un archivo real (PDF/Markdown) a la versión vigente de un documento.
 * Se usa tanto para "reparar" una ruta que dejó de existir como para asignar
 * el archivo por primera vez.
 */
export async function attachFileToCurrentVersion(documentId: string, filePath: string): Promise<void> {
  const document = await institutionalDocumentsRepo.getById(documentId);
  if (!document?.current_version_id) throw new Error("El documento no tiene una versión vigente todavía.");
  await documentVersionsRepo.update(document.current_version_id, {
    file_path: filePath,
    source_document_id: null,
    start_page: null,
    end_page: null,
  });
}

/**
 * Registra un documento como un rango de páginas dentro de OTRO documento ya
 * asociado a un archivo (ej. varios documentos institucionales embebidos en un
 * único Compendio Maestro) — no duplica el PDF físicamente.
 */
export async function registerVirtualRange(
  documentId: string,
  sourceDocumentId: string,
  startPage: number,
  endPage: number,
): Promise<void> {
  const document = await institutionalDocumentsRepo.getById(documentId);
  if (!document?.current_version_id) throw new Error("El documento no tiene una versión vigente todavía.");
  await documentVersionsRepo.update(document.current_version_id, {
    file_path: null,
    source_document_id: sourceDocumentId,
    start_page: startPage,
    end_page: endPage,
  });
}

interface CompendioRange {
  code: string;
  startPage: number;
  endPage: number;
}

/**
 * Rangos de página verificados contra IAC_Compendio_Maestro_v1.0.0.pdf (92
 * páginas): cada documento institucional embebido comparte el mismo archivo
 * físico del Compendio Maestro, solo cambia el rango — no se duplica el PDF.
 */
const COMPENDIO_RANGES: CompendioRange[] = [
  { code: "IAC-CVPS-DF-001", startPage: 9, endPage: 25 },
  { code: "IAC-CVPS-CP-01", startPage: 32, endPage: 37 },
  { code: "IAC-CVPS-CG-02", startPage: 38, endPage: 41 },
  { code: "IAC-CVPS-MC-03", startPage: 42, endPage: 48 },
  { code: "IAC-CVPS-MD-04", startPage: 49, endPage: 60 },
  { code: "IAC-CVPS-PS-05", startPage: 61, endPage: 68 },
  { code: "IAC-CVPS-NC-06", startPage: 69, endPage: 75 },
  { code: "IAC-CVPS-BB-07", startPage: 76, endPage: 80 },
  { code: "IAC-CVPS-IL-08", startPage: 81, endPage: 87 },
  { code: "IAC-CVPS-M01-09", startPage: 88, endPage: 92 },
];

const COMPENDIO_CODE = "IAC-CVPS-CM-001";
const FUNDACIONAL_V01_CODE = "IAC-CVPS-DF-001";

export interface CompendioConfigResult {
  configured: string[];
  skipped: string[];
}

/**
 * Asocia el PDF real del Compendio Maestro y configura, sin duplicar el
 * archivo, los rangos de página de cada documento institucional embebido
 * dentro de él (docs/UPDATE_1_1_BASELINE.md — Documentos virtuales del Compendio).
 */
export async function configureCompendioMaestro(filePath: string): Promise<CompendioConfigResult> {
  const result: CompendioConfigResult = { configured: [], skipped: [] };

  const compendio = (await institutionalDocumentsRepo.list({ where: "code = ?", params: [COMPENDIO_CODE] }))[0];
  if (!compendio) {
    result.skipped.push(`${COMPENDIO_CODE} (no encontrado)`);
    return result;
  }
  await attachFileToCurrentVersion(compendio.id, filePath);
  result.configured.push(COMPENDIO_CODE);

  for (const range of COMPENDIO_RANGES) {
    const doc = (await institutionalDocumentsRepo.list({ where: "code = ?", params: [range.code] }))[0];
    if (!doc) {
      result.skipped.push(`${range.code} (no encontrado)`);
      continue;
    }
    await registerVirtualRange(doc.id, compendio.id, range.startPage, range.endPage);
    result.configured.push(range.code);
  }

  // Documento Fundacional v0.1 (páginas 26-31): versión histórica anterior a la
  // v1.0.0 vigente, se agrega al historial sin reemplazar la versión actual.
  const fundacional = (await institutionalDocumentsRepo.list({ where: "code = ?", params: [FUNDACIONAL_V01_CODE] }))[0];
  if (fundacional) {
    const existingV01 = await documentVersionsRepo.list({
      where: "institutional_document_id = ? AND version_label = ?",
      params: [fundacional.id, "v0.1"],
    });
    if (existingV01.length === 0) {
      await documentVersionsRepo.insert(
        {
          id: crypto.randomUUID(),
          institutional_document_id: fundacional.id,
          version_label: "v0.1",
          file_path: null,
          changelog: "Versión histórica previa, embebida en el Compendio Maestro.",
          published_at: null,
          replaces_version_id: null,
          status: "reemplazado",
          created_at: now(),
          updated_at: now(),
          source_document_id: compendio.id,
          start_page: 26,
          end_page: 31,
        },
        "sistema",
      );
      result.configured.push(`${FUNDACIONAL_V01_CODE} (v0.1 histórica)`);
    }
  }

  return result;
}

export interface ResolvedDocumentFile {
  filePath: string;
  startPage: number;
  endPage: number | null;
}

/** Resuelve el archivo físico real que debe abrir el visor, siguiendo source_document_id si corresponde. */
export async function resolveDocumentFile(version: DocumentVersionRow): Promise<ResolvedDocumentFile | null> {
  if (version.file_path) {
    return { filePath: version.file_path, startPage: version.start_page ?? 1, endPage: version.end_page };
  }
  if (version.source_document_id) {
    const source = await institutionalDocumentsRepo.getById(version.source_document_id);
    const sourceVersion = source?.current_version_id ? await documentVersionsRepo.getById(source.current_version_id) : null;
    if (sourceVersion?.file_path) {
      return { filePath: sourceVersion.file_path, startPage: version.start_page ?? 1, endPage: version.end_page };
    }
  }
  return null;
}

export interface MetadataDiffRow {
  field: string;
  a: string;
  b: string;
  changed: boolean;
}

const VERSION_FIELD_LABELS: Record<string, string> = {
  version_label: "Versión",
  status: "Estado",
  published_at: "Publicada el",
  file_path: "Archivo",
  changelog: "Cambios",
  replaces_version_id: "Reemplaza a",
};

export function compareVersions(a: DocumentVersionRow, b: DocumentVersionRow): MetadataDiffRow[] {
  return Object.entries(VERSION_FIELD_LABELS).map(([field, label]) => {
    const aValue = String((a as unknown as Record<string, unknown>)[field] ?? "—");
    const bValue = String((b as unknown as Record<string, unknown>)[field] ?? "—");
    return { field: label, a: aValue, b: bValue, changed: aValue !== bValue };
  });
}
