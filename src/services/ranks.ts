import academicRanksSeed from "../../seed/academic-ranks.json";
import { RANK_IMAGES_BY_FILE } from "@/assets/ranks";
import { academicRanksRepo } from "@/database/entities";
import { getDb } from "@/database/client";
import type { AcademicRankRow } from "@/database/types";

const now = () => new Date().toISOString();

interface RankSeedEntry {
  name: string;
  subtitle: string;
  minimumLevel: number;
  maximumLevel: number;
  imageFile?: string;
}

const seed = academicRanksSeed as RankSeedEntry[];

function badgeForEntry(entry: RankSeedEntry): string | null {
  return entry.imageFile ? (RANK_IMAGES_BY_FILE[entry.imageFile] ?? null) : null;
}

export const RANK_NARRATIVE_DISCLAIMER =
  "Los rangos representan una narrativa personal de aprendizaje. No constituyen una clasificación académica o una jerarquía objetiva entre autores.";

/** Siembra los 15 rangos iniciales (prompt maestro §17), idempotente por nombre. */
export async function ensureDefaultRanks(): Promise<void> {
  const existing = await academicRanksRepo.list();
  if (existing.length > 0) return;

  for (const [index, entry] of seed.entries()) {
    const row: AcademicRankRow = {
      id: crypto.randomUUID(),
      name: entry.name,
      subtitle: entry.subtitle,
      description: null,
      minimum_level: entry.minimumLevel,
      maximum_level: entry.maximumLevel,
      sort_order: index,
      badge: badgeForEntry(entry),
      color_token: index % 2 === 0 ? "accent" : "turquoise",
      is_active: 1,
      created_at: now(),
      updated_at: now(),
    };
    await academicRanksRepo.insert(row);
  }
}

export async function listRanks(): Promise<AcademicRankRow[]> {
  return academicRanksRepo.list({ where: "is_active = 1", orderBy: "sort_order ASC" });
}

export async function getRankForLevel(level: number): Promise<AcademicRankRow | null> {
  const ranks = await academicRanksRepo.list({
    where: "is_active = 1 AND minimum_level <= ? AND maximum_level >= ?",
    params: [level, level],
  });
  return ranks[0] ?? null;
}

export async function getNextRank(level: number): Promise<AcademicRankRow | null> {
  const ranks = await academicRanksRepo.list({
    where: "is_active = 1 AND minimum_level > ?",
    params: [level],
    orderBy: "minimum_level ASC",
  });
  return ranks[0] ?? null;
}

export interface UpdateRankInput {
  name?: string;
  subtitle?: string | null;
  description?: string | null;
  badge?: string | null;
  colorToken?: string | null;
  minimumLevel?: number;
  maximumLevel?: number;
}

/** Editar un rango nunca altera XP — son entidades completamente independientes. */
export async function updateRank(rankId: string, input: UpdateRankInput): Promise<void> {
  const patch: Partial<AcademicRankRow> = { updated_at: now() };
  if (input.name !== undefined) patch.name = input.name;
  if (input.subtitle !== undefined) patch.subtitle = input.subtitle;
  if (input.description !== undefined) patch.description = input.description;
  if (input.badge !== undefined) patch.badge = input.badge;
  if (input.colorToken !== undefined) patch.color_token = input.colorToken;
  if (input.minimumLevel !== undefined) patch.minimum_level = input.minimumLevel;
  if (input.maximumLevel !== undefined) patch.maximum_level = input.maximumLevel;
  await academicRanksRepo.update(rankId, patch);
}

/**
 * Intercambia identidad (nombre, subtítulo, retrato) entre dos rangos, sin
 * tocar sus rangos de nivel ni su sort_order — así "cambiar de lugar" a dos
 * autores no desordena el resto de la lista (que sigue viva por nivel), y el
 * retrato viaja con la persona, no se queda pegado al nivel.
 */
export async function swapRankIdentities(rankIdA: string, rankIdB: string): Promise<void> {
  const [a, b] = await Promise.all([academicRanksRepo.getById(rankIdA), academicRanksRepo.getById(rankIdB)]);
  if (!a || !b) throw new Error("No se encontraron ambos rangos para intercambiar.");
  await academicRanksRepo.update(a.id, { name: b.name, subtitle: b.subtitle, badge: b.badge, updated_at: now() });
  await academicRanksRepo.update(b.id, { name: a.name, subtitle: a.subtitle, badge: a.badge, updated_at: now() });
}

export async function setRankActive(rankId: string, isActive: boolean): Promise<void> {
  await academicRanksRepo.update(rankId, { is_active: isActive ? 1 : 0, updated_at: now() });
}

export async function reorderRank(rankId: string, newSortOrder: number): Promise<void> {
  await academicRanksRepo.update(rankId, { sort_order: newSortOrder, updated_at: now() });
}

export async function exportRanks(): Promise<AcademicRankRow[]> {
  return listRanks();
}

/** Restaura los 15 rangos por defecto — borra los actuales y vuelve a sembrar. */
export async function restoreDefaultRanks(): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM academic_rank");
  for (const [index, entry] of seed.entries()) {
    const row: AcademicRankRow = {
      id: crypto.randomUUID(),
      name: entry.name,
      subtitle: entry.subtitle,
      description: null,
      minimum_level: entry.minimumLevel,
      maximum_level: entry.maximumLevel,
      sort_order: index,
      badge: badgeForEntry(entry),
      color_token: index % 2 === 0 ? "accent" : "turquoise",
      is_active: 1,
      created_at: now(),
      updated_at: now(),
    };
    await academicRanksRepo.insert(row);
  }
}

export function rankInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter((w) => w.length > 0 && !["von", "de", "la"].includes(w.toLowerCase()))
    .map((w) => w[0]!.toUpperCase())
    .slice(0, 2)
    .join("");
}
