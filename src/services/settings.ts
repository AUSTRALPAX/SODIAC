import { userSettingsRepo } from "@/database/entities";

/** Acceso genérico a `user_setting` (clave/valor tipado, ver docs/DATA_MODEL.md §8). */
export async function getSetting<T>(key: string): Promise<T | null> {
  const rows = await userSettingsRepo.list({ where: "key = ?", params: [key] });
  if (rows.length === 0) return null;
  try {
    return JSON.parse(rows[0]!.value_json) as T;
  } catch {
    // Un value_json corrupto nunca debe romper al llamador — se trata igual
    // que una preferencia ausente.
    return null;
  }
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  const existing = await userSettingsRepo.list({ where: "key = ?", params: [key] });
  const now = new Date().toISOString();
  if (existing.length > 0) {
    await userSettingsRepo.update(existing[0]!.id, { value_json: JSON.stringify(value) });
  } else {
    await userSettingsRepo.insert({
      id: crypto.randomUUID(),
      key,
      value_json: JSON.stringify(value),
      updated_at: now,
    });
  }
}
