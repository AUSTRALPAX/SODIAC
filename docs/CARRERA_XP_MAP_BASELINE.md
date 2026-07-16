# Baseline previo a "XP directo desde sesiones, Carrera y rediseño del Mapa"

Fecha: 2026-07-16 (Fase 0, previa a la migración 0008).

## Estado verificado antes de tocar nada

- **Ubicación real de la base**: `C:\Users\admin\AppData\Roaming\com.sodiac.desktop\sodiac.db`.
- **Integridad**: `PRAGMA integrity_check` → `ok`.
- **Migraciones aplicadas** (tabla `_sqlx_migrations`): 1–7, todas `success = 1`
  (`init_schema`, `library_institutional_fields`, `document_viewer_ranges`,
  `obsidian_sync_state`, `academic_progression`,
  `academic_assignment_base_columns`, `academic_updated_at_columns`).
- **Ejecutable en uso por el usuario**: `C:\Users\admin\AppData\Local\SODIAC\app.exe`
  (build de release v1.2.0, instalado — instancia corriendo al momento de
  este chequeo). No se reinició ni se tocó este proceso.
- **Backup verificable creado**: `sodiac-pre_fase_a-2026-07-16T07-30-05-496Z.db`
  en `...\com.sodiac.desktop\backups\`, tamaño 4.161.536 bytes, checksum
  SHA-256 `a2b90d8aee67cec084940b0e7847929ec1e5161392ea4e4c05cd5d354650e6ff`,
  registrado como fila en `backup_record` (tipo `pre_migracion`, mismo
  formato que usa `createBackup()` en `src/services/backup/index.ts`).
  Antes de copiar se ejecutó `PRAGMA wal_checkpoint(TRUNCATE)` para asegurar
  una copia consistente incluso con la app release manteniendo la conexión
  abierta.
- **Conteos de referencia** (para confirmar luego que nada se perdió):
  `subject` = 9 filas, `task` = 3 filas, `xp_event` = 0 filas.
- **Calidad de código previa**: `npm run lint`, `npm run typecheck`,
  `npm test` (23/23 tests) y `cargo check` (perfil debug) — los cuatro en
  verde antes de escribir la migración 0008.

## Alcance de esta actualización

Ver `C:\Users\admin\.claude\plans\ticklish-foraging-lightning.md` para el
plan completo aprobado (Fase 0–F). Este documento cubre exclusivamente la
Fase 0 (preflight). La Fase A (motor de XP por finalización) se documenta
en el informe final de esa fase, no acá.
