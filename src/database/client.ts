import Database from "@tauri-apps/plugin-sql";

/**
 * Punto único de acceso a SQLite. El nombre "sodiac.db" coincide con la
 * migración registrada en src-tauri/src/lib.rs (add_migrations). El plugin
 * resuelve la ruta real dentro del directorio de datos de la app (ver
 * docs/SECURITY_AND_BACKUPS.md §1) — nunca dentro del repo.
 */
let dbPromise: Promise<Database> | null = null;

export function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = Database.load("sqlite:sodiac.db").then(async (db) => {
      // Si el proceso anterior de SODIAC todavía está liberando el archivo
      // (por ejemplo, un cierre y una reapertura casi inmediatos), SQLite
      // devuelve "database is locked" de inmediato sin este PRAGMA. Con
      // busy_timeout, reintenta internamente hasta 10s antes de fallar.
      await db.execute("PRAGMA busy_timeout = 10000;");
      return db;
    });
  }
  return dbPromise;
}
