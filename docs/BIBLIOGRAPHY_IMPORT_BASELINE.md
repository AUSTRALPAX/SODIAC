# Diagnóstico previo — importación del catálogo bibliográfico austrofinanciero

Rama: `feat/austrofinancial-library-import`. Ver el plan completo aprobado en
esta rama para el detalle fase por fase (BIB-0 a BIB-9).

## Estado antes de tocar nada

- Backup verificable creado con la función real de la app
  (`createBackup("pre_migracion")`, `src/services/backup/index.ts`):
  `sodiac-pre_migracion-2026-07-17T05-24-24-910Z.db`, checksum
  `53ff90629390487bd77c4d489afd3ceed2bdb18d071b4d7bdc5fbc1ed03a7cf1`,
  6.975.488 bytes.
- `checkIntegrity()` antes y después del backup: `{ ok: true, detail: "ok" }`.
- `PRAGMA foreign_key_check`: sin filas (sin violaciones).
- Conteos actuales: `resource` (activos) = 40, `bibliographic_source` = 1,
  `resource_usage_event` = 0.
- Baseline de calidad: `npm run lint` (0 errores, 1 warning preexistente en
  `ErrorBoundary.tsx`, no relacionado), `npm run typecheck` (limpio),
  `npm test` (50/50), `cargo check` (limpio) — todo verde antes de empezar.

## Esquema actual relevante (verificado en vivo, no solo en el .sql)

`resource` — columnas actuales: `id, title, resource_type, author,
function_note, reading_state, priority, file_path, url, status, sort_order,
notes, tags, created_at, updated_at, archived_at, area, evaluation_state`.
`resource_type` tiene `CHECK (... IN ('libro','articulo','informe','video',
'curso','sitio','dataset','documento_interno','archivo_local'))`.

`bibliographic_source` — columnas actuales: `id, resource_id,
fundamental_question_id, competency_id, subject_id, topic_id, project_id,
study_session_id, obsidian_note_id, created_at`. Ya vincula un recurso con
materia y tema, no solo con proyecto — solo le falta `curriculum_unit_id` y
metadatos de relación (tipo, importancia, orden de lectura, capítulos,
notas), que agrega la migración `0012`.

`resource_usage_event` (migración `0010_resource_usage.sql`): `id,
resource_id, session_id, subject_id, topic_id, project_id, note_id, action
CHECK(...'abierto','consultado','vinculado','citado','utilizado_en_sesion',
'utilizado_en_proyecto'), occurred_at`. Ya se llama desde
`openResource()` en `src/services/library.ts` con `action: "abierto"`.

## Decisión de modelo de datos (confirmada con el usuario)

El pedido original pide 4 tablas nuevas (`ResourceSubject`, `ResourceUnit`,
`ResourceTopic`, `ResourceProject`). Se decidió **extender
`bibliographic_source`** (agregar `curriculum_unit_id` + metadatos de
relación) en vez de fragmentar la lógica en 4 tablas nuevas casi idénticas,
porque:

1. `bibliographic_source` ya cumple exactamente ese rol (resource ↔
   cualquier entidad), con FKs nullable, un row por vínculo.
2. Es el mismo patrón que ya usa el resto de la app para vínculos
   secundarios (`topic_competency`, `subject_fundamental_question`, etc. —
   ver `migrations/0011_curriculum_reconciliation.sql`): una tabla de
   vínculo simple con las dos FKs, no una tabla dedicada por par de
   entidades.
3. Evita duplicar la lógica de lectura/escritura 4 veces.

## Importador existente que se reutiliza como plantilla

`src/services/libraryImport.ts` (`importLibraryInstitutionalBase`, 39
recursos institucionales, `seed/library-institutional.json`): usa
`normalizeKey(area, author, title)` (NFD, minúsculas, sin tildes/puntuación)
para detectar duplicados, inserta si es nuevo, y si ya existe solo parchea
campos institucionales vacíos (nunca pisa datos del usuario). El nuevo
importador `libraryAustrofinancialImport.ts` sigue el mismo patrón,
ampliando la normalización para variantes de autor (von/de, iniciales) y
agregando año a la clave de comparación, tal como pide la sección 6 del
documento fuente.

## Fuente de los datos (110 obras)

El texto que extrae automáticamente el PDF (`pdftotext`) viene con columnas
desplazadas y años/áreas corridos de fila — el propio documento lo advierte.
Los datos reales se reconstruyeron con `pdfjs-dist` en modo texto-con-
posición (agrupando por coordenada Y de cada línea y ordenando por X), lo
que reconstruye correctamente autor/obra/año/área/prioridad/acceso por fila
incluso cuando el título ocupa dos líneas. Se verificó manualmente contra
las 11 categorías y el total de 110 obras antes de volcarlas a
`seed/library-austrofinanciera.json` (BIB-1).
