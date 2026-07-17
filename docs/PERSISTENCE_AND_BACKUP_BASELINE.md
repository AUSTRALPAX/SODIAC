# SODIAC — Persistencia de interfaz y backup integral: diagnóstico previo

Rama: `fix/persistent-workspaces-and-complete-backups`.
Fecha: 2026-07-17.

Este documento registra el estado real del código **antes** de tocar nada, para
la actualización pedida por el usuario (persistencia de cómo deja organizada
cada sección + backup que cubra todos los datos de SODIAC).

## 0. Verificación previa (gate obligatorio)

Antes de crear la rama se verificó la base activa (`%APPDATA%\com.sodiac.desktop\sodiac.db`,
copiada a un scratch file para no tocar la real):

- `PRAGMA integrity_check` → `ok`.
- `PRAGMA foreign_key_check` → 0 filas (sin violaciones).
- `backup_record` tiene 12 filas: 2 `diario`, 4 `pre_importacion`, 6 `pre_migracion`.
  No hay ningún backup `semanal` ni `mensual` — ver §3 (no existe scheduler).

La base abre y verifica correctamente. Se continúa.

## 1. Dónde vive hoy el estado de cada sección (el bug reportado)

Búsqueda de `localStorage`/`sessionStorage`/Zustand en `src/`: **un solo uso real**,
`src/services/safeMode.ts` (bandera "modo seguro para el próximo inicio",
deliberadamente en `localStorage` y no en SQLite, documentado en el propio
archivo: tiene que poder activarse aunque la base esté corrupta). `zustand` está
en `package.json` como dependencia pero **no se usa en ningún archivo** — no hay
stores de Zustand en el proyecto.

Todo lo demás (orden, filtros, pestaña activa, panel expandido, columnas,
paginación) vive **exclusivamente en `useState` de React**, sin ningún efecto
que lo persista. Confirmado literalmente en
[`LibraryPage.tsx`](../src/features/library/LibraryPage.tsx) — todos estos son
`useState` locales sin persistencia:

```
search, typeFilter, stateFilter, areaFilter, categoryFilter, functionFilter,
availabilityFilter, subjectFilter, topicFilter, sortKey, sortDirection,
expandedId, showMinimalPathOnly, urlDrafts
```

Esto reproduce exactamente el bug descrito: "Ordenar por estado de lectura" se
pierde al cambiar de sección porque no hay ningún lado donde se guarde. Lo
mismo aplica, por construcción (mismo patrón `useState`), a Trayectoria,
Carrera, Mapa, Sesiones, Planificación, Repasos, Proyectos, Estadísticas,
Documentos y Obsidian — no se auditó línea por línea cada componente porque
comparten el mismo patrón sin persistencia, verificado en Biblioteca como caso
representativo.

**Excepción — dos casos que sí persisten y son el patrón a seguir:**

- `src/services/dashboard.ts` (`DASHBOARD_WIDGET_IDS`, `getDashboardPrefs`/
  `setDashboardPrefs`) guarda el orden/visibilidad de widgets del Dashboard.
- `src/features/dashboard/PomodoroSection.tsx` guarda minutos/sesiones del
  Pomodoro.

Ambos usan el mismo mecanismo genérico: `src/services/settings.ts`
(`getSetting<T>(key)` / `setSetting<T>(key, value)`) sobre la tabla
`user_setting` (`id`, `key UNIQUE`, `value_json`, `updated_at` —
`migrations/0001_init.sql:412`). Hoy esa tabla tiene 4 claves en uso:
`dashboard_prefs`, `pomodoro_dashboard_settings`, `obsidian_permission_mode`,
`obsidian_vault_path`.

**Conclusión para el diseño**: no hace falta crear una tabla nueva tipo
`UserViewPreference`/`WorkspaceViewState` — `user_setting` ya es exactamente
eso (clave/valor tipado, ya persistido, ya respaldado porque vive en el mismo
`sodiac.db`). Extender el patrón existente con una convención de claves
(`view_state:<workspaceKey>:<viewKey>`) es coherente con cómo ya se trató este
mismo dilema para Pomodoro/Dashboard, y evita fragmentar la lógica en una
tabla nueva casi idéntica (mismo criterio ya aplicado con el usuario para
`bibliographic_source` en la fase anterior).

## 2. Qué cubre hoy el sistema de backup — realidad vs. lo documentado

`docs/SECURITY_AND_BACKUPS.md` es un diseño de la Fase 0 (aspiracional). El
código real (`src/services/backup/index.ts` + la sección "Backups" de
`src/features/settings/SettingsPage.tsx`) implementa una fracción de eso:

- **Copia**: `createBackup(type)` hace `copyFile(sodiac.db, destino)` — una
  copia de archivo a nivel de sistema operativo, **no** usa la SQLite Backup
  API ni `VACUUM INTO`. Sin garantía de consistencia si hay una escritura
  concurrente en curso (justo lo que pide evitar la sección 13 del pedido).
- **Verificación**: no se corre `PRAGMA integrity_check` al crear el backup,
  solo se calcula un SHA-256 del archivo copiado. La verificación con
  `integrity_check` solo ocurre **al restaurar**, no al crear. No existe ningún
  campo en `backup_record` para marcar un backup como verificado/incompleto/
  corrupto — el schema no lo contempla.
- **Formato**: es un archivo `.db` suelto, no un paquete autocontenido (no hay
  `manifest.json`, no es zip, no hay carpetas `settings/`/`files/`/`logs/`).
  Como *toda* la data de SODIAC (Dashboard, Trayectoria, Carrera, Mapa,
  Sesiones, Planificación, Repasos, Proyectos, Biblioteca, Configuración,
  y ahora las preferencias de vista) vive en las tablas de ese único
  `sodiac.db`, una copia correcta y consistente del archivo **sí** captura casi
  todo lo pedido en la sección 10 por construcción — los gaps reales son:
  consistencia de la copia, verificación, trazabilidad (manifiesto), manejo de
  archivos externos, protección de backups manuales, y UX de restauración
  (comparación/preview, restauración selectiva).
- **Tipos de backup — sin "manual"**: el `CHECK` de `backup_record.backup_type`
  (`migrations/0001_init.sql:421-422`) solo admite `pre_migracion`,
  `pre_importacion`, `pre_restauracion`, `pre_operacion_masiva`, `diario`,
  `semanal`, `mensual`. **No existe un tipo "manual"**. El botón "Crear backup
  ahora" en Configuración llama literalmente a `createBackup("diario")`
  (`SettingsPage.tsx:219`) — es decir, un backup creado a mano por el usuario
  queda taggeado como si fuera automático diario, y por lo tanto **sí** está
  sujeto al límite de retención de 10 (`RETENTION.diario = 10` en
  `backup/index.ts`). Si el usuario alguna vez crea más de 10 backups manuales,
  los más viejos se borran solos — esto contradice directamente el criterio de
  aceptación del pedido ("los backups manuales no se eliminan automáticamente").
  Confirmado con datos reales: los 2 backups `diario` existentes hoy son en
  realidad ambos manuales (no hay scheduler, ver siguiente punto).
- **No hay scheduler**: no existe ningún cron/temporizador en el código que
  llame a `createBackup("diario"|"semanal"|"mensual")` automáticamente. Los
  únicos triggers reales son: preflight de migración, preflight de
  importación, preflight de restauración, y el botón manual (mal taggeado como
  "diario"). La política de retención de 10/8/6 existe en el código
  (`RETENTION`) y en la UI (texto en `SettingsPage.tsx:212-215`), pero no hay
  nada que genere automáticamente backups `semanal`/`mensual` para que esa
  retención tenga sentido — hoy la retención solo protegería contra el uso
  repetido del botón manual, que es justamente el caso que NO debería
  limitarse.
- **Archivos gestionados por SODIAC — no existen hoy**: se confirmó que tanto
  Biblioteca (`updateResourceAccess` en `src/services/library.ts`) como
  Documentos (`attachFileToCurrentVersion`/`configureCompendioMaestro` en
  `DocumentsPage.tsx`) guardan la ruta que el usuario elige en el diálogo de
  archivos **tal cual**, sin copiar el archivo a ninguna carpeta administrada
  por la app. Es decir, bajo la arquitectura actual **todo archivo referenciado
  es "externo"** en los términos del pedido (sección 11) — no hay una carpeta
  `managed-library/`/`managed-documents/` real todavía. Esto acota la sección
  10/11 del pedido: si se quiere que el backup incluya copias de esos PDFs,
  hay que decidir explícitamente introducir almacenamiento gestionado (fuera
  del alcance mínimo de "backup íntegro de los datos propios de SODIAC", que sí
  se cumple respaldando la tabla `resource` con sus rutas/metadata).
- **Restauración**: sigue el flujo básico (backup previo, copiar, verificar
  integridad, informar) pero no hay comparación antes de restaurar, no hay
  restauración selectiva, y no hay wizard con pasos.
- **Exportación** (JSON/CSV/Markdown descripta en `SECURITY_AND_BACKUPS.md §4`):
  no implementada.

## 3. Vault de Obsidian y datos externos

`obsidian_vault_path` es una ruta absoluta guardada en `user_setting`,
consistente con la regla de "nunca copiar el vault dentro del repo/app" — esto
ya se respeta hoy y no requiere cambios; el pedido pide mantenerlo así
explícitamente (no modificar el vault, no copiarlo sin autorización).

## 4. Alcance a decidir con el usuario antes de implementar

Dado el tamaño del pedido (24 secciones), estos son los puntos que definen
cuánto trabajo real hay detrás de cada sección y que conviene confirmar en un
plan antes de tocar código:

1. Persistencia de vista: reutilizar `user_setting` con claves
   `view_state:<workspaceKey>:<viewKey>` (recomendado) vs. crear una tabla
   dedicada `workspace_view_state`.
2. Backup: mantener el formato actual (copia de `sodiac.db` con SQLite Backup
   API / `VACUUM INTO` en vez de `copyFile`, más manifiesto JSON *al lado* del
   `.db`) vs. migrar a un paquete zip autocontenido como describe la sección 12
   del pedido — este último es bastante más trabajo (formato nuevo, migración
   de los 12 backups existentes, actualización de `restoreBackup`).
3. Introducir o no almacenamiento "gestionado" para archivos de Biblioteca/
   Documentos (hoy no existe) — si no se introduce, la sección 11 del pedido
   se cumple documentando que todo archivo es externo y aplicando la política
   de "no copiar sin autorización" ya vigente.
4. Alcance de "restauración selectiva" (sección 18) — el pedido mismo advierte
   no habilitarla si las relaciones pueden quedar inconsistentes; dado el
   grafo de FKs actual (`resource`↔`bibliographic_source`↔materias/temas/
   proyectos/sesiones), probablemente conviene una versión muy acotada o
   directamente diferirla.
