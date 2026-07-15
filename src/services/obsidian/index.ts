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
import { openUrl } from "@tauri-apps/plugin-opener";
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

/** Indexa el vault completo: frontmatter, checksum y wikilinks por nota (prompt maestro §13). */
export async function indexVault(): Promise<IndexSummary> {
  const vaultPath = await getVaultPath();
  if (!vaultPath) throw new Error("No hay un vault configurado todavía.");
  if (!(await exists(vaultPath))) throw new Error(`La ruta del vault no existe: ${vaultPath}`);

  const files = await listMarkdownFiles(vaultPath);
  const summary: IndexSummary = { total: files.length, created: 0, updated: 0, unchanged: 0 };

  for (const file of files) {
    const content = await readTextFile(file.absolutePath);
    const checksum = await sha256Hex(content);
    const { frontmatter, body } = parseFrontmatter(content);

    const existingRows = await obsidianNotesRepo.list({
      where: "vault_relative_path = ?",
      params: [file.relativePath],
    });
    const existingRow = existingRows[0];

    if (existingRow && existingRow.checksum === checksum) {
      summary.unchanged++;
      continue;
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
      });
      summary.updated++;
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
      };
      await obsidianNotesRepo.insert(row);
      summary.created++;
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
  }

  return summary;
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

async function vaultName(): Promise<string> {
  const path = await getVaultPath();
  if (!path) throw new Error("No hay un vault configurado todavía.");
  return basename(path);
}

export async function openNoteInObsidian(relativePath: string): Promise<void> {
  const name = await vaultName();
  const url = `obsidian://open?vault=${encodeURIComponent(name)}&file=${encodeURIComponent(relativePath.replace(/\.md$/i, ""))}`;
  await openUrl(url);
}

export async function openVaultInObsidian(): Promise<void> {
  const name = await vaultName();
  await openUrl(`obsidian://open?vault=${encodeURIComponent(name)}`);
}
