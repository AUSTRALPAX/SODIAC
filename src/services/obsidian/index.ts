import { open as openDialog } from "@tauri-apps/plugin-dialog";
import {
  copyFile,
  exists,
  mkdir,
  readDir,
  readTextFile,
  rename,
  writeTextFile,
} from "@tauri-apps/plugin-fs";
import { basename, join } from "@tauri-apps/api/path";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";
import { load as loadYaml, dump as dumpYaml } from "js-yaml";
import { getDb } from "@/database/client";
import { noteLinksRepo, obsidianNotesRepo } from "@/database/entities";
import type { NoteLinkRow, ObsidianNoteRow, ObsidianPermissionMode } from "@/database/types";
import { getSetting, setSetting } from "@/services/settings";

const VAULT_PATH_KEY = "obsidian_vault_path";
const PERMISSION_MODE_KEY = "obsidian_permission_mode";

export async function getVaultPath(): Promise<string | null> {
  return getSetting<string>(VAULT_PATH_KEY);
}

export async function setVaultPath(path: string): Promise<void> {
  await setSetting(VAULT_PATH_KEY, path);
}

export async function getPermissionMode(): Promise<ObsidianPermissionMode> {
  return (await getSetting<ObsidianPermissionMode>(PERMISSION_MODE_KEY)) ?? "solo_lectura";
}

export async function setPermissionMode(mode: ObsidianPermissionMode): Promise<void> {
  await setSetting(PERMISSION_MODE_KEY, mode);
}

/** Diálogo nativo para elegir la carpeta del vault (docs/ARCHITECTURE.md §5). */
export async function pickVaultFolder(): Promise<string | null> {
  const selected = await openDialog({ directory: true, title: "Seleccionar vault de Obsidian" });
  return typeof selected === "string" ? selected : null;
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

interface MarkdownFile {
  relativePath: string;
  absolutePath: string;
}

async function listMarkdownFiles(vaultPath: string, relativeDir = ""): Promise<MarkdownFile[]> {
  const currentAbsolute = relativeDir ? await join(vaultPath, relativeDir) : vaultPath;
  const entries = await readDir(currentAbsolute);
  const files: MarkdownFile[] = [];

  for (const entry of entries) {
    if (entry.name?.startsWith(".")) continue; // ignora .obsidian y ocultos
    const entryRelative = relativeDir ? `${relativeDir}/${entry.name}` : entry.name!;
    if (entry.isDirectory) {
      files.push(...(await listMarkdownFiles(vaultPath, entryRelative)));
    } else if (entry.isFile && entry.name?.toLowerCase().endsWith(".md")) {
      files.push({ relativePath: entryRelative, absolutePath: await join(vaultPath, entryRelative) });
    }
  }
  return files;
}

interface ParsedNote {
  frontmatter: Record<string, unknown> | null;
  body: string;
}

/** Separa el frontmatter YAML (entre --- ---) del cuerpo de la nota. */
function parseFrontmatter(content: string): ParsedNote {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(content);
  if (!match) return { frontmatter: null, body: content };
  try {
    const parsed = loadYaml(match[1]!);
    return {
      frontmatter: parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null,
      body: content.slice(match[0].length),
    };
  } catch {
    return { frontmatter: null, body: content };
  }
}

function extractWikilinks(body: string): string[] {
  const links = new Set<string>();
  const regex = /\[\[([^\]|#]+)/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(body))) {
    links.add(m[1]!.trim());
  }
  return Array.from(links);
}

function extractTitle(frontmatter: Record<string, unknown> | null, relativePath: string): string {
  const fmTitle = frontmatter?.title;
  if (typeof fmTitle === "string" && fmTitle.trim()) return fmTitle;
  const base = relativePath.split("/").pop() ?? relativePath;
  return base.replace(/\.md$/i, "");
}

export interface IndexSummary {
  total: number;
  created: number;
  updated: number;
  unchanged: number;
}

type IndexOutcome = "created" | "updated" | "unchanged";

/** Procesa un único archivo .md: frontmatter, checksum, wikilinks (compartido por indexVault y el watcher). */
async function indexOneFile(file: MarkdownFile): Promise<IndexOutcome> {
  const content = await readTextFile(file.absolutePath);
  const checksum = await sha256Hex(content);
  const { frontmatter, body } = parseFrontmatter(content);

  const existingRows = await obsidianNotesRepo.list({
    where: "vault_relative_path = ?",
    params: [file.relativePath],
  });
  const existingRow = existingRows[0];

  if (existingRow && existingRow.checksum === checksum && existingRow.sync_state !== "no_encontrada") {
    return "unchanged";
  }

  const now = new Date().toISOString();
  const frontmatterJson = frontmatter ? JSON.stringify(frontmatter) : null;
  const title = extractTitle(frontmatter, file.relativePath);
  const sodiacId = typeof frontmatter?.sodiac_id === "string" ? frontmatter.sodiac_id : null;
  const noteType = typeof frontmatter?.tipo === "string" ? frontmatter.tipo : null;
  const status = typeof frontmatter?.estado === "string" ? frontmatter.estado : null;
  const masteryLevel = typeof frontmatter?.dominio === "number" ? frontmatter.dominio : null;
  const lastReview = typeof frontmatter?.ultima_revision === "string" ? frontmatter.ultima_revision : null;
  const nextReview = typeof frontmatter?.proxima_revision === "string" ? frontmatter.proxima_revision : null;

  let noteId: string;
  let outcome: IndexOutcome;
  if (existingRow) {
    noteId = existingRow.id;
    await obsidianNotesRepo.update(noteId, {
      title,
      frontmatter_json: frontmatterJson,
      indexed_at: now,
      checksum,
      sodiac_id: sodiacId,
      note_type: noteType,
      status,
      mastery_level: masteryLevel,
      last_review_at: lastReview,
      next_review_at: nextReview,
      sync_state: "sincronizada",
      last_synced_at: now,
    });
    outcome = "updated";
  } else {
    noteId = crypto.randomUUID();
    const row: ObsidianNoteRow = {
      id: noteId,
      vault_relative_path: file.relativePath,
      title,
      frontmatter_json: frontmatterJson,
      indexed_at: now,
      checksum,
      sodiac_id: sodiacId,
      note_type: noteType,
      status,
      mastery_level: masteryLevel,
      last_review_at: lastReview,
      next_review_at: nextReview,
      created_at: now,
      updated_at: now,
      sync_state: "sincronizada",
      last_synced_at: now,
    };
    await obsidianNotesRepo.insert(row);
    outcome = "created";
  }

  const db = await getDb();
  await db.execute("DELETE FROM note_link WHERE source_note_id = ?", [noteId]);
  for (const target of extractWikilinks(body)) {
    const link: NoteLinkRow = {
      id: crypto.randomUUID(),
      source_note_id: noteId,
      target_note_path: target,
      link_type: "wikilink",
      created_at: now,
    };
    await noteLinksRepo.insert(link);
  }

  return outcome;
}

/** Indexa el vault completo: frontmatter, checksum y wikilinks por nota (prompt maestro §13). */
export async function indexVault(): Promise<IndexSummary> {
  const vaultPath = await getVaultPath();
  if (!vaultPath) throw new Error("No hay un vault configurado todavía.");
  if (!(await exists(vaultPath))) throw new Error(`La ruta del vault no existe: ${vaultPath}`);

  const files = await listMarkdownFiles(vaultPath);
  const summary: IndexSummary = { total: files.length, created: 0, updated: 0, unchanged: 0 };

  for (const file of files) {
    const outcome = await indexOneFile(file);
    if (outcome === "created") summary.created++;
    else if (outcome === "updated") summary.updated++;
    else summary.unchanged++;
  }

  return summary;
}

/**
 * Reacciona a un cambio detectado por el watcher nativo (una ruta absoluta
 * dentro del vault): reindexa ese archivo si sigue existiendo, o marca la
 * nota como "no_encontrada" sin borrarla si fue eliminado externamente
 * (docs/UPDATE_1_1_BASELINE.md — no eliminar inmediatamente el historial).
 */
export async function syncSingleAbsolutePath(absolutePath: string): Promise<void> {
  const vaultPath = await getVaultPath();
  if (!vaultPath) return;
  const normalizedVault = vaultPath.replace(/\\/g, "/");
  const normalizedFile = absolutePath.replace(/\\/g, "/");
  if (!normalizedFile.startsWith(normalizedVault)) return;
  const relativePath = normalizedFile.slice(normalizedVault.length).replace(/^\/+/, "");

  if (await exists(absolutePath)) {
    await indexOneFile({ relativePath, absolutePath });
    return;
  }

  const existing = await obsidianNotesRepo.list({ where: "vault_relative_path = ?", params: [relativePath] });
  if (existing[0]) {
    await obsidianNotesRepo.update(existing[0].id, { sync_state: "no_encontrada" });
  }
}

export async function listIndexedNotes(): Promise<ObsidianNoteRow[]> {
  return obsidianNotesRepo.list({ orderBy: "vault_relative_path" });
}

function resolveWithinVault(relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (normalized.split("/").some((segment) => segment === "..")) {
    throw new Error("Ruta inválida: no puede salir del vault.");
  }
  return normalized;
}

/**
 * Crea una nota nueva a partir de la plantilla de frontmatter (prompt maestro
 * §13). Requiere permiso de creación, valida la ruta y escribe de forma
 * atómica (archivo temporal + rename), con backup si ya existiera.
 */
export async function createNoteFromTemplate(
  relativePath: string,
  frontmatter: Record<string, unknown>,
  body: string,
): Promise<void> {
  const mode = await getPermissionMode();
  if (mode === "solo_lectura") {
    throw new Error("El vault está configurado en modo solo lectura.");
  }
  const vaultPath = await getVaultPath();
  if (!vaultPath) throw new Error("No hay un vault configurado todavía.");

  const safeRelative = resolveWithinVault(relativePath);
  const finalPath = await join(vaultPath, safeRelative);
  const tempPath = `${finalPath}.sodiac-tmp`;

  const yamlBlock = dumpYaml(frontmatter, { skipInvalid: true }).trimEnd();
  const content = `---\n${yamlBlock}\n---\n\n${body}`;

  if (await exists(finalPath)) {
    await copyFile(finalPath, `${finalPath}.bak`);
  }

  const parentDir = safeRelative.includes("/") ? safeRelative.split("/").slice(0, -1).join("/") : "";
  if (parentDir) {
    const parentAbsolute = await join(vaultPath, parentDir);
    if (!(await exists(parentAbsolute))) await mkdir(parentAbsolute, { recursive: true });
  }

  await writeTextFile(tempPath, content);
  await rename(tempPath, finalPath);
}

export interface ObsidianOpenResult {
  success: boolean;
  uri: string;
  error?: string;
}

/**
 * Nunca falla en silencio (pedido de la actualización v1.1 — sección Obsidian):
 * siempre devuelve el URI generado y, si falla, el motivo técnico, para que la
 * UI pueda mostrarlo, ofrecer copiarlo o abrir la carpeta como alternativa.
 */
async function openObsidianUri(uri: string): Promise<ObsidianOpenResult> {
  try {
    await openUrl(uri);
    return { success: true, uri };
  } catch (error) {
    console.error("No se pudo abrir el URI de Obsidian:", uri, error);
    return { success: false, uri, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function openNoteInObsidian(relativePath: string): Promise<ObsidianOpenResult> {
  const vaultPath = await getVaultPath();
  if (!vaultPath) return { success: false, uri: "", error: "No hay un vault configurado todavía." };
  const absolutePath = await join(vaultPath, relativePath);
  // Ruta absoluta primero (más confiable en Windows que vault+file relativo).
  const uri = `obsidian://open?path=${encodeURIComponent(absolutePath)}&paneType=tab`;
  return openObsidianUri(uri);
}

export async function openVaultInObsidian(): Promise<ObsidianOpenResult> {
  const path = await getVaultPath();
  if (!path) return { success: false, uri: "", error: "No hay un vault configurado todavía." };
  const name = await basename(path);
  return openObsidianUri(`obsidian://open?vault=${encodeURIComponent(name)}`);
}

/** Alternativa cuando obsidian:// no abre nada: revelar la carpeta en el explorador. */
export async function openVaultFolder(): Promise<void> {
  const vaultPath = await getVaultPath();
  if (!vaultPath) throw new Error("No hay un vault configurado todavía.");
  await revealItemInDir(vaultPath);
}

export interface ObsidianDiagnostics {
  vaultPath: string | null;
  vaultExists: boolean;
  vaultName: string | null;
  notesIndexed: number;
  lastIndexedAt: string | null;
  permissionMode: ObsidianPermissionMode;
  canRead: boolean;
  canWrite: boolean;
}

/** Botón "Verificar integración" en Configuración → Obsidian. */
export async function verifyObsidianIntegration(): Promise<ObsidianDiagnostics> {
  const vaultPath = await getVaultPath();
  const permissionMode = await getPermissionMode();
  const vaultExists = vaultPath ? await exists(vaultPath) : false;
  const notes = vaultExists ? await obsidianNotesRepo.list() : [];
  const lastIndexedAt = notes.reduce<string | null>((latest, n) => {
    return !latest || n.indexed_at > latest ? n.indexed_at : latest;
  }, null);

  return {
    vaultPath,
    vaultExists,
    vaultName: vaultPath ? await basename(vaultPath) : null,
    notesIndexed: notes.length,
    lastIndexedAt,
    permissionMode,
    canRead: vaultExists,
    canWrite: vaultExists && permissionMode !== "solo_lectura",
  };
}

interface VaultChangePayload {
  paths: string[];
  kind: string;
}

/** Arranca el watcher nativo (Rust, crate `notify`) sobre el vault configurado. */
export async function startVaultWatcher(): Promise<void> {
  const vaultPath = await getVaultPath();
  if (!vaultPath) return;
  await invoke("start_vault_watcher", { path: vaultPath });
}

export async function stopVaultWatcher(): Promise<void> {
  await invoke("stop_vault_watcher");
}

/**
 * Escucha los cambios detectados por el watcher nativo y reindexa cada
 * archivo afectado. Devuelve la función de desuscripción.
 */
export async function onVaultChanged(onSynced: () => void): Promise<UnlistenFn> {
  return listen<VaultChangePayload>("obsidian-vault-changed", (event) => {
    void (async () => {
      for (const path of event.payload.paths) {
        await syncSingleAbsolutePath(path);
      }
      onSynced();
    })();
  });
}

export interface SyncDiagnostics {
  total: number;
  sincronizada: number;
  pendiente: number;
  conflicto: number;
  noEncontrada: number;
  error: number;
  soloLectura: number;
  sinSodiacId: number;
}

/** Vista de diagnóstico de sincronización (docs/UPDATE_1_1_BASELINE.md). */
export async function getSyncDiagnostics(): Promise<SyncDiagnostics> {
  const notes = await obsidianNotesRepo.list();
  const count = (state: ObsidianNoteRow["sync_state"]) => notes.filter((n) => n.sync_state === state).length;
  return {
    total: notes.length,
    sincronizada: count("sincronizada"),
    pendiente: count("pendiente"),
    conflicto: count("conflicto"),
    noEncontrada: count("no_encontrada"),
    error: count("error"),
    soloLectura: count("solo_lectura"),
    sinSodiacId: notes.filter((n) => !n.sodiac_id).length,
  };
}

export class ObsidianConflictError extends Error {
  constructor(public readonly relativePath: string, public readonly currentDiskContent: string) {
    super(`El archivo cambió externamente desde la última lectura: ${relativePath}`);
    this.name = "ObsidianConflictError";
  }
}

/**
 * Escribe el cuerpo editado de una nota desde SODIAC. Antes de sobrescribir,
 * compara el checksum contra el que quedó registrado en la última indexación;
 * si no coincide, el archivo cambió externamente mientras estaba abierto en
 * SODIAC — no sobrescribe, lanza ObsidianConflictError para que la UI
 * muestre la comparación (docs/UPDATE_1_1_BASELINE.md — conflictos).
 */
export async function updateNoteBody(noteId: string, newBody: string): Promise<void> {
  const mode = await getPermissionMode();
  if (mode !== "lectura_creacion_actualizacion_metadatos") {
    throw new Error("El modo de permisos actual no habilita escritura de contenido.");
  }
  const note = await obsidianNotesRepo.getById(noteId);
  if (!note) throw new Error("La nota no existe en el índice.");
  const vaultPath = await getVaultPath();
  if (!vaultPath) throw new Error("No hay un vault configurado todavía.");

  const safeRelative = resolveWithinVault(note.vault_relative_path);
  const finalPath = await join(vaultPath, safeRelative);

  const currentContent = await readTextFile(finalPath);
  const currentChecksum = await sha256Hex(currentContent);
  if (note.checksum && currentChecksum !== note.checksum) {
    throw new ObsidianConflictError(note.vault_relative_path, currentContent);
  }

  const { frontmatter } = parseFrontmatter(currentContent);
  const yamlBlock = frontmatter ? dumpYaml(frontmatter, { skipInvalid: true }).trimEnd() : "";
  const content = yamlBlock ? `---\n${yamlBlock}\n---\n\n${newBody}` : newBody;

  const tempPath = `${finalPath}.sodiac-tmp`;
  await writeTextFile(tempPath, content);
  await rename(tempPath, finalPath);

  const newChecksum = await sha256Hex(content);
  const now = new Date().toISOString();
  await obsidianNotesRepo.update(noteId, {
    checksum: newChecksum,
    indexed_at: now,
    last_synced_at: now,
    sync_state: "sincronizada",
    updated_at: now,
  });
}

/** Lee el cuerpo actual (sin frontmatter) de una nota indexada. */
export async function readNoteBody(noteId: string): Promise<string> {
  const note = await obsidianNotesRepo.getById(noteId);
  if (!note) throw new Error("La nota no existe en el índice.");
  const vaultPath = await getVaultPath();
  if (!vaultPath) throw new Error("No hay un vault configurado todavía.");
  const finalPath = await join(vaultPath, resolveWithinVault(note.vault_relative_path));
  const content = await readTextFile(finalPath);
  return parseFrontmatter(content).body;
}
