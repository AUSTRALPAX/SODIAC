import { useCallback, useEffect, useState, type FormEvent } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { exists, readTextFile } from "@tauri-apps/plugin-fs";
import { PdfViewer } from "@/components/documents/PdfViewer";
import type { DocumentVersionRow, InstitutionalDocumentRow } from "@/database/types";
import {
  attachFileToCurrentVersion,
  compareVersions,
  configureCompendioMaestro,
  listDocuments,
  listVersions,
  publishNewVersion,
  resolveDocumentFile,
  setDocumentStatus,
  type DocumentWithVersion,
  type MetadataDiffRow,
  type ResolvedDocumentFile,
} from "@/services/documents";

const COMPENDIO_CODE = "IAC-CVPS-CM-001";

const STATUS_LABEL: Record<InstitutionalDocumentRow["status"], string> = {
  borrador: "Borrador",
  propuesto: "Propuesto",
  publicado: "Publicado",
  reemplazado: "Reemplazado",
  archivado: "Archivado",
};

const STATUS_COLOR: Record<string, string> = {
  borrador: "text-text-muted",
  propuesto: "text-warning",
  publicado: "text-success",
  reemplazado: "text-text-muted",
  archivado: "text-text-muted",
};

const STATUS_OPTIONS: InstitutionalDocumentRow["status"][] = [
  "borrador",
  "propuesto",
  "publicado",
  "reemplazado",
  "archivado",
];

export function DocumentsPage() {
  const [documents, setDocuments] = useState<DocumentWithVersion[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [versions, setVersions] = useState<DocumentVersionRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const rows = await listDocuments();
    setDocuments(rows);
    setLoading(false);
    return rows;
  }, []);

  useEffect(() => {
    void refresh().then((rows) => {
      if (rows.length > 0) setSelectedId(rows[0]!.id);
    });
  }, [refresh]);

  const refreshVersions = useCallback(async (documentId: string) => {
    setVersions(await listVersions(documentId));
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setVersions([]);
      return;
    }
    void refreshVersions(selectedId);
  }, [selectedId, refreshVersions]);

  const selected = documents.find((d) => d.id === selectedId) ?? null;

  async function handleStatusChange(documentId: string, status: InstitutionalDocumentRow["status"]) {
    await setDocumentStatus(documentId, status);
    await refresh();
  }

  async function handlePublished(documentId: string) {
    await refresh();
    await refreshVersions(documentId);
  }

  if (loading) return <div className="p-10 text-sm text-text-muted">Cargando…</div>;

  return (
    <div className="grid h-full grid-cols-1 gap-6 overflow-y-auto p-8 lg:grid-cols-[320px_1fr]">
      <div>
        <h1 className="font-display text-2xl">Documentos</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Documentos institucionales, con historial completo de versiones.
        </p>

        <ul className="mt-4 divide-y divide-border-subtle rounded border border-border-subtle bg-surface">
          {documents.length === 0 && <li className="p-4 text-sm text-text-muted">Sin documentos todavía.</li>}
          {documents.map((d) => (
            <li key={d.id}>
              <button
                onClick={() => setSelectedId(d.id)}
                className={`block w-full px-3 py-2.5 text-left text-sm ${
                  selectedId === d.id ? "bg-surface-elevated text-text-primary" : "text-text-secondary hover:bg-surface-hover"
                }`}
              >
                <span>{d.title}</span>
                <div className="mt-0.5 flex items-center gap-2 text-xs">
                  <span className="text-text-muted">{d.code}</span>
                  <span className={STATUS_COLOR[d.status]}>· {STATUS_LABEL[d.status]}</span>
                  {d.currentVersion && <span className="text-text-muted">· {d.currentVersion.version_label}</span>}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div>
        {!selected ? (
          <p className="text-sm text-text-muted">Elegí un documento para ver el detalle.</p>
        ) : (
          <DocumentDetail
            document={selected}
            versions={versions}
            onStatusChange={(status) => handleStatusChange(selected.id, status)}
            onPublished={() => handlePublished(selected.id)}
          />
        )}
      </div>
    </div>
  );
}

function DocumentDetail({
  document,
  versions,
  onStatusChange,
  onPublished,
}: {
  document: DocumentWithVersion;
  versions: DocumentVersionRow[];
  onStatusChange: (status: InstitutionalDocumentRow["status"]) => void;
  onPublished: () => void;
}) {
  const [showNewVersion, setShowNewVersion] = useState(false);
  const [versionLabel, setVersionLabel] = useState("");
  const [changelog, setChangelog] = useState("");
  const [filePath, setFilePath] = useState("");
  const [publishNow, setPublishNow] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [compareA, setCompareA] = useState("");
  const [compareB, setCompareB] = useState("");

  async function handlePublish(e: FormEvent) {
    e.preventDefault();
    if (!versionLabel.trim()) return;
    setPublishing(true);
    try {
      await publishNewVersion({
        documentId: document.id,
        versionLabel: versionLabel.trim(),
        changelog: changelog.trim() || "Sin notas de cambios.",
        ...(filePath.trim() ? { filePath: filePath.trim() } : {}),
        publish: publishNow,
      });
      setVersionLabel("");
      setChangelog("");
      setFilePath("");
      setShowNewVersion(false);
      onPublished();
    } finally {
      setPublishing(false);
    }
  }

  const versionA = versions.find((v) => v.id === compareA) ?? null;
  const versionB = versions.find((v) => v.id === compareB) ?? null;
  const diff: MetadataDiffRow[] = versionA && versionB ? compareVersions(versionA, versionB) : [];

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-xl">{document.title}</h2>
          <p className="mt-1 text-xs text-text-muted">
            {document.code} {document.doc_type && `· ${document.doc_type}`}
          </p>
        </div>
        <select
          value={document.status}
          onChange={(e) => onStatusChange(e.target.value as InstitutionalDocumentRow["status"])}
          className="shrink-0 rounded border border-border bg-background px-2 py-1.5 text-xs text-text-primary focus:border-accent focus:outline-none"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </div>

      <DocumentViewerSection document={document} onChanged={onPublished} />

      <div className="mt-6">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">
            Historial de versiones ({versions.length})
          </h3>
          <button
            onClick={() => setShowNewVersion((s) => !s)}
            className="rounded border border-accent px-2 py-1 text-xs uppercase tracking-wide text-accent"
          >
            Nueva versión
          </button>
        </div>

        {showNewVersion && (
          <form onSubmit={handlePublish} className="mt-2 space-y-2 rounded border border-border-subtle bg-surface p-3">
            <input
              value={versionLabel}
              onChange={(e) => setVersionLabel(e.target.value)}
              placeholder="Etiqueta de versión (ej. v1.1.0)"
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
            />
            <textarea
              value={changelog}
              onChange={(e) => setChangelog(e.target.value)}
              placeholder="Notas de cambios"
              rows={2}
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
            />
            <input
              value={filePath}
              onChange={(e) => setFilePath(e.target.value)}
              placeholder="Ruta de archivo (opcional)"
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
            />
            <label className="flex items-center gap-2 text-xs text-text-secondary">
              <input type="checkbox" checked={publishNow} onChange={(e) => setPublishNow(e.target.checked)} />
              Publicar ahora (marca la versión actual como reemplazada)
            </label>
            <button
              type="submit"
              disabled={publishing || !versionLabel.trim()}
              className="w-full rounded border border-accent px-3 py-1.5 text-xs uppercase tracking-wide text-accent disabled:opacity-40"
            >
              {publishing ? "Guardando…" : "Guardar versión"}
            </button>
          </form>
        )}

        <ul className="mt-2 divide-y divide-border-subtle rounded border border-border-subtle bg-surface">
          {versions.length === 0 && <li className="p-3 text-sm text-text-muted">Sin versiones todavía.</li>}
          {versions.map((v) => (
            <li key={v.id} className="p-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-text-primary">
                  {v.version_label}
                  {v.id === document.current_version_id && (
                    <span className="ml-2 text-xs uppercase tracking-wide text-accent">Vigente</span>
                  )}
                </span>
                <span className="shrink-0 text-xs uppercase tracking-wide text-text-muted">{v.status}</span>
              </div>
              {v.changelog && <p className="mt-1 text-xs text-text-muted">{v.changelog}</p>}
              {v.published_at && (
                <p className="mt-0.5 text-xs text-text-muted">
                  Publicada el {new Date(v.published_at).toLocaleDateString("es-AR")}
                </p>
              )}
            </li>
          ))}
        </ul>
      </div>

      {versions.length >= 2 && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">
            Comparar metadatos
          </h3>
          <div className="mt-2 flex gap-2">
            <select
              value={compareA}
              onChange={(e) => setCompareA(e.target.value)}
              className="flex-1 rounded border border-border bg-background px-2 py-1.5 text-xs text-text-primary focus:border-accent focus:outline-none"
            >
              <option value="">Versión A…</option>
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.version_label}
                </option>
              ))}
            </select>
            <select
              value={compareB}
              onChange={(e) => setCompareB(e.target.value)}
              className="flex-1 rounded border border-border bg-background px-2 py-1.5 text-xs text-text-primary focus:border-accent focus:outline-none"
            >
              <option value="">Versión B…</option>
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.version_label}
                </option>
              ))}
            </select>
          </div>

          {diff.length > 0 && (
            <table className="mt-3 w-full border-collapse overflow-hidden rounded border border-border-subtle text-xs">
              <thead>
                <tr className="bg-surface text-text-muted">
                  <th className="p-2 text-left font-normal">Campo</th>
                  <th className="p-2 text-left font-normal">{versionA?.version_label}</th>
                  <th className="p-2 text-left font-normal">{versionB?.version_label}</th>
                </tr>
              </thead>
              <tbody>
                {diff.map((row) => (
                  <tr key={row.field} className={row.changed ? "bg-surface-elevated" : "bg-surface"}>
                    <td className="p-2 text-text-secondary">{row.field}</td>
                    <td className={`p-2 ${row.changed ? "text-accent" : "text-text-primary"}`}>{row.a}</td>
                    <td className={`p-2 ${row.changed ? "text-accent" : "text-text-primary"}`}>{row.b}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

function DocumentViewerSection({
  document,
  onChanged,
}: {
  document: DocumentWithVersion;
  onChanged: () => void;
}) {
  const [resolved, setResolved] = useState<ResolvedDocumentFile | null | undefined>(undefined);
  const [fileMissing, setFileMissing] = useState(false);
  const [markdownContent, setMarkdownContent] = useState<string | null>(null);
  const [attaching, setAttaching] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [restrictToFull, setRestrictToFull] = useState(false);

  const refresh = useCallback(async () => {
    setResolved(undefined);
    setMarkdownContent(null);
    setFileMissing(false);
    if (!document.currentVersion) {
      setResolved(null);
      return;
    }
    const result = await resolveDocumentFile(document.currentVersion);
    if (!result) {
      setResolved(null);
      return;
    }
    const fileExists = await exists(result.filePath);
    if (!fileExists) {
      setFileMissing(true);
      setResolved(result);
      return;
    }
    setResolved(result);
    if (result.filePath.toLowerCase().endsWith(".md")) {
      setMarkdownContent(await readTextFile(result.filePath));
    }
  }, [document]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleAttachFile() {
    setAttachError(null);
    const picked = await openDialog({
      multiple: false,
      filters: [{ name: "Documentos", extensions: ["pdf", "md"] }],
    });
    if (!picked || Array.isArray(picked)) return;
    setAttaching(true);
    try {
      await attachFileToCurrentVersion(document.id, picked);
      await refresh();
      onChanged();
    } catch (e) {
      setAttachError(e instanceof Error ? e.message : String(e));
    } finally {
      setAttaching(false);
    }
  }

  async function handleConfigureCompendio() {
    setAttachError(null);
    const picked = await openDialog({ multiple: false, filters: [{ name: "PDF", extensions: ["pdf"] }] });
    if (!picked || Array.isArray(picked)) return;
    setAttaching(true);
    try {
      await configureCompendioMaestro(picked);
      await refresh();
      onChanged();
    } catch (e) {
      setAttachError(e instanceof Error ? e.message : String(e));
    } finally {
      setAttaching(false);
    }
  }

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">Visor</h3>
        <div className="flex gap-2">
          {document.code === COMPENDIO_CODE && (
            <button
              onClick={handleConfigureCompendio}
              disabled={attaching}
              className="rounded border border-accent px-2 py-1 text-xs uppercase tracking-wide text-accent disabled:opacity-40"
            >
              Configurar Compendio Maestro
            </button>
          )}
          <button
            onClick={handleAttachFile}
            disabled={attaching}
            className="rounded border border-border px-2 py-1 text-xs text-text-secondary hover:border-accent hover:text-accent disabled:opacity-40"
          >
            {fileMissing ? "Relocalizar archivo" : "Asociar archivo"}
          </button>
        </div>
      </div>

      {attachError && <p className="mt-2 text-xs text-danger">{attachError}</p>}

      <div className="mt-2">
        {resolved === undefined ? (
          <p className="text-sm text-text-muted">Cargando…</p>
        ) : resolved === null ? (
          <p className="text-sm text-text-muted">
            Este documento institucional todavía no tiene un archivo asociado.
          </p>
        ) : fileMissing ? (
          <div className="rounded border border-warning/40 bg-warning/5 p-3 text-xs text-warning">
            <p>Archivo no encontrado en: {resolved.filePath}</p>
            <p className="mt-1 text-text-muted">Puede haberse movido o renombrado. Relocalizalo con el botón de arriba.</p>
          </div>
        ) : markdownContent !== null ? (
          <pre className="max-h-[32rem] overflow-auto rounded border border-border-subtle bg-background p-3 text-xs text-text-primary">
            {markdownContent}
          </pre>
        ) : (
          <PdfViewer
            documentKey={document.id}
            filePath={resolved.filePath}
            rangeStart={restrictToFull ? undefined : resolved.startPage}
            rangeEnd={restrictToFull ? undefined : resolved.endPage}
            {...(resolved.endPage ? { onOpenFullDocument: () => setRestrictToFull(true) } : {})}
          />
        )}
      </div>
    </div>
  );
}
