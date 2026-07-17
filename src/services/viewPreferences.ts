import type { z } from "zod";
import { getDb } from "@/database/client";
import { getSetting, setSetting } from "@/services/settings";

const VIEW_STATE_PREFIX = "view_state:";

function viewStateKey(workspaceKey: string): string {
  return `${VIEW_STATE_PREFIX}${workspaceKey}`;
}

/**
 * Carga la preferencia de una sección, validándola con su schema Zod. Si no
 * existe, es de una versión vieja sin migración, o no matchea la forma
 * esperada, se descarta en silencio y se devuelven los predeterminados —
 * una preferencia inválida nunca debe impedir que la pantalla abra.
 */
export async function loadViewPreference<T>(
  workspaceKey: string,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  defaults: T,
): Promise<T> {
  const raw = await getSetting<unknown>(viewStateKey(workspaceKey));
  if (raw == null) return defaults;
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    console.warn(`[SODIAC] Preferencia de vista inválida para "${workspaceKey}", se usan los valores predeterminados.`);
    return defaults;
  }
  return parsed.data;
}

export async function saveViewPreference<T>(workspaceKey: string, value: T): Promise<void> {
  await setSetting(viewStateKey(workspaceKey), value);
}

export async function resetViewPreference(workspaceKey: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM user_setting WHERE key = ?", [viewStateKey(workspaceKey)]);
}

/** Borra todas las preferencias de vista de todas las secciones — nunca toca datos académicos. */
export async function resetAllViewPreferences(): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM user_setting WHERE key LIKE ?", [`${VIEW_STATE_PREFIX}%`]);
}

export interface ViewPreferencesExport {
  exportedAt: string;
  preferences: Record<string, unknown>;
}

export async function exportViewPreferences(): Promise<ViewPreferencesExport> {
  const db = await getDb();
  const rows = await db.select<Array<{ key: string; value_json: string }>>(
    "SELECT key, value_json FROM user_setting WHERE key LIKE ?",
    [`${VIEW_STATE_PREFIX}%`],
  );
  const preferences: Record<string, unknown> = {};
  for (const row of rows) {
    try {
      preferences[row.key] = JSON.parse(row.value_json);
    } catch {
      // fila corrupta — se omite del export en vez de romperlo.
    }
  }
  return { exportedAt: new Date().toISOString(), preferences };
}

/**
 * Importa un export previo. Cada clave se guarda tal cual (la validación
 * real ocurre al leerla después, en `loadViewPreference`, con el schema de
 * cada sección) — acá solo se filtra lo que ni siquiera tiene la forma de
 * clave `view_state:*` esperada, para no dejar entrar valores arbitrarios.
 */
export async function importViewPreferences(data: ViewPreferencesExport): Promise<{ imported: number; skipped: number }> {
  let imported = 0;
  let skipped = 0;
  for (const [key, value] of Object.entries(data.preferences ?? {})) {
    if (!key.startsWith(VIEW_STATE_PREFIX)) {
      skipped += 1;
      continue;
    }
    await setSetting(key, value);
    imported += 1;
  }
  return { imported, skipped };
}
