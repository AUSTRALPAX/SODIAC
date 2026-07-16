/**
 * Modo seguro: al activarlo, el próximo inicio de SODIAC salta la
 * indexación pesada de arranque (watcher de Obsidian, sincronizaciones) y
 * deja disponibles únicamente diagnóstico y backups. Se guarda en
 * localStorage (no en SQLite) a propósito: si la base está corrupta o no
 * abre, el modo seguro tiene que poder activarse igual.
 */
const SAFE_MODE_KEY = "sodiac_safe_mode_next_launch";

export function isSafeModeEnabled(): boolean {
  return localStorage.getItem(SAFE_MODE_KEY) === "1";
}

export function enableSafeMode(enabled: boolean): void {
  if (enabled) localStorage.setItem(SAFE_MODE_KEY, "1");
  else localStorage.removeItem(SAFE_MODE_KEY);
}
