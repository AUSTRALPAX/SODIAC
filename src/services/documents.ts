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
