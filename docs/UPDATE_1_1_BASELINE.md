# SODIAC v1.1.0 — Estado base antes de la actualización

Registrado antes de tocar código, para la actualización funcional de Dashboard,
Sesiones, Biblioteca, Documentos, Obsidian e ícono (ver solicitud original en el
historial de la sesión). Rama de trabajo: `feat/sodiac-dashboard-documents-obsidian`.

## 1. Verificación previa

- `npm run lint` — sin errores.
- `npm run typecheck` — sin errores.
- `npm run test` — 1/1 tests OK (`tests/smoke.test.ts`).
- Backup verificable creado a través del propio servicio de la app (no un script nuevo):
  `createBackup("pre_migracion")` invocado sobre la app real corriendo (vía CDP), resultado:
  - Archivo: `C:\Users\admin\AppData\Roaming\com.sodiac.desktop\backups\sodiac-pre_migracion-2026-07-16T00-51-09-955Z.db`
  - `PRAGMA integrity_check` → `ok`.
- Base de datos real en uso: `C:\Users\admin\AppData\Roaming\com.sodiac.desktop\sodiac.db`
  (modo WAL; también existen backups previos `pre_importacion-*` de fases anteriores).

## 2. Arquitectura actual (relevante para esta actualización)

### Rutas (`src/app/router.tsx`)
Todas bajo `AppShell`. La ruta índice (`/`) renderiza `TodayPage` — esto es lo que pasa a
ser `/dashboard`. No existe hoy una ruta literal `/today`.

```
/                 → TodayPage       (pasa a ser Dashboard)
/mapa             → CurriculumPage
/sesiones         → SessionsPage
/sesiones/nueva   → StartSessionPage
/sesiones/:id     → ActiveSessionPage
/planificacion    → PlanningPage
/repasos          → ReviewsPage
/proyectos        → ProjectsPage
/biblioteca       → LibraryPage
/estadisticas     → StatisticsPage
/documentos       → DocumentsPage
/obsidian         → ObsidianPage
/configuracion    → SettingsPage
```

### Dashboard actual (`src/features/today/TodayPage.tsx`)
Header con recomendación de próxima acción + botón "Iniciar estudio" / "Continuar sesión
interrumpida", más listas de tareas vencidas/hoy/próximas y alta rápida de tarea. Es lo que
la actualización pide sacar de la pantalla principal y trasladar a Sesiones.

### Sesiones (`src/features/sessions/`)
`SessionsPage.tsx` (listado), `StartSessionPage.tsx` (formulario de inicio),
`ActiveSessionPage.tsx` (modo sesión), `usePomodoro.ts`. `src/services/sessions.ts` ya
implementa `startSession/getInProgressSession/listSessions/cancelSession/recordComprobacion/
finalizeSession`.

### Esquema SQLite (`migrations/0001_init.sql`, 449 líneas, una sola migración aplicada)
~24 tablas. Relevantes para esta actualización:
- `institutional_document(id, code, title, doc_type, current_version_id, status, sort_order,
  notes, tags, created_at, updated_at, archived_at)`.
- `document_version(id, institutional_document_id, version_label, file_path, changelog,
  published_at, replaces_version_id, status, created_at, updated_at)` — **no tiene aún**
  columnas para rango de páginas dentro de un PDF fuente ni para "documento origen"
  (`source_document_id`, `start_page`, `end_page`) — se necesitará una migración `0002_*`.
- `resource` / `bibliographic_source` (biblioteca) — ver `src/services/library.ts`.
- `obsidian_note(id, vault_relative_path, title, frontmatter_json, tags_json, checksum,
  last_synced_at, ...)`, `note_link` — ver `src/database/types.ts`. No existen hoy columnas
  de estado de sincronización granular (`sincronizada/pendiente/conflicto/no_encontrada`) ni
  watcher de archivo — se necesitará una migración adicional.
- `backup_record`, `activity_log` — usados por todo el sistema de auditoría/backups.

### Documentos institucionales sembrados (`seed/institutional-documents.json`)
12 documentos, cada uno con 1 versión inicial ya importada en Fase 2. Ninguno tiene
`file_path` cargado todavía (todos `null`) — hoy no hay ningún PDF real asociado, por eso al
seleccionarlos no se abre nada.

### Biblioteca (`src/services/library.ts`, `src/features/library/LibraryPage.tsx`)
Repos `resourcesRepo` / `bibliographicSourcesRepo` (Fase 7). No existe todavía un importador
de la Base Bibliográfica Inicial (39 registros) — el PDF fuente
(`IAC_Compendio_Maestro_v1.0.0.pdf`) no está presente en el repositorio ni se ha
proporcionado en esta sesión.

### Obsidian (`src/services/obsidian/index.ts`, `src/features/obsidian/ObsidianPage.tsx`)
Indexación por escaneo manual (sin watcher de archivos), apertura de nota vía
`openNoteInObsidian` (URI `obsidian://open?...`) usando `@tauri-apps/plugin-opener`.
Reportado por el usuario como no funcional en la práctica — a diagnosticar antes de
corregir (candidatos: falta de scope `shell:allow-open`/permiso de opener para el esquema
`obsidian:`, URI mal codificado, o el protocolo no registrado en el sistema).

### Ícono / identidad visual (`src-tauri/icons/`, `public/favicon.svg`,
`src/components/brand/SodiacLogo.tsx`)
Regenerado en la Fase de branding a partir de un PNG cuadrado con margen transparente
amplio alrededor del símbolo — de ahí el símbolo pequeño dentro del ícono real de Windows,
tal como reporta el usuario. `tauri.conf.json` referencia `icons/32x32.png`,
`icons/128x128.png`, `icons/128x128@2x.png`, `icons/icon.icns`, `icons/icon.ico`.

### Configuración de Tauri (`src-tauri/tauri.conf.json`)
`identifier: com.sodiac.desktop`, ventana 1280×800 (mínimo 1280×720, ajustado en Fase 10),
`bundle.targets: "all"`. Puerto de desarrollo fijo `127.0.0.1:53117` (`vite.config.ts`,
`strictPort: true`) — no se toca.

## 3. Bloqueo identificado antes de continuar

La sección "Completar la biblioteca" (39 registros de la Base Bibliográfica Inicial,
páginas 76–80) y la sección "Documentos virtuales del Compendio" (rangos de página exactos
dentro de `IAC_Compendio_Maestro_v1.0.0.pdf`) requieren el PDF fuente real. No está en el
repositorio y no fue adjuntado en esta conversación. No se van a inventar 39 registros
bibliográficos ni rangos de página — eso violaría la regla de no alterar/inventar datos
institucionales. Se pidió el archivo al usuario antes de implementar esas dos secciones;
el resto de la actualización (Dashboard, Sesiones, ícono, apertura de Obsidian, sincronización)
avanza en paralelo.
