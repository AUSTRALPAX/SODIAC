# SODIAC — Arquitectura (Fase 0)

## 1. Stack técnico (no negociable)

- **Shell**: Tauri 2 (Rust) — nunca Electron.
- **Frontend**: React + TypeScript estricto + Vite.
- **Persistencia**: SQLite como única fuente de verdad, vía `tauri-plugin-sql` (o equivalente
  oficial). `localStorage`/`sessionStorage`/IndexedDB solo para preferencias de UI no críticas.
- **Routing**: React Router.
- **Estado**: Zustand (UI/sesión) + TanStack Query (datos async / caché de lecturas SQL).
- **Validación**: Zod + React Hook Form.
- **Estilos**: Tailwind CSS con tokens propios (ver `DESIGN_SYSTEM.md`).
- **Componentes accesibles**: Radix UI.
- **Iconos**: Lucide.
- **Gráficos**: Recharts.
- **Calendario**: FullCalendar.
- **Mapas/relaciones**: React Flow.
- **Identificador de app**: `com.sodiac.desktop`.

## 2. Puerto de desarrollo — regla dura

- Único puerto permitido: **127.0.0.1:53117**, `strictPort: true`.
- Prohibido usar 5173, 5199 o cualquier puerto elegido automáticamente.
- Si 53117 está ocupado: **detener** la ejecución, informar qué proceso lo ocupa (no matarlo).
- La app empaquetada (producción) no depende de localhost ni de un navegador externo: Tauri
  sirve los assets embebidos.

```ts
// vite.config.ts (fragmento obligatorio)
server: {
  host: "127.0.0.1",
  port: 53117,
  strictPort: true,
}
```

`src-tauri/tauri.conf.json` → `build.devUrl` apunta a `http://127.0.0.1:53117`.

## 3. Capas de la aplicación

```
┌───────────────────────────────────────────────────────────┐
│ UI (React)                                                 │
│  features/{today,curriculum,sessions,planning,reviews,     │
│            projects,library,statistics,documents,obsidian, │
│            settings}                                        │
├───────────────────────────────────────────────────────────┤
│ stores (Zustand) · hooks · schemas (Zod) · types            │
├───────────────────────────────────────────────────────────┤
│ services/  → capa de casos de uso (recomendación de próxima │
│   acción, motor de repasos, generación de prompts, export)  │
├───────────────────────────────────────────────────────────┤
│ database/  → repositorios tipados por entidad (CRUD +       │
│   queries), migraciones versionadas, transacciones          │
├───────────────────────────────────────────────────────────┤
│ Tauri IPC (comandos Rust)                                   │
│  - acceso a filesystem (vault Obsidian, carpeta maestra)    │
│  - backups/restauración                                     │
│  - apertura de obsidian://, procesos externos                │
├───────────────────────────────────────────────────────────┤
│ src-tauri (Rust)                                             │
│  - tauri-plugin-sql → SQLite en AppData de SODIAC            │
│  - watcher de archivos del vault (detectar cambios)          │
│  - parser de frontmatter / wikilinks Markdown                │
└───────────────────────────────────────────────────────────┘
```

Reglas de separación (sección 23 del prompt maestro):
- La UI nunca llama SQL directo; siempre pasa por `database/repositories/*`.
- La lógica de negocio (recomendación, dominio, repasos) vive en `services/`, no en componentes.
- La integración con Obsidian y con el sistema de archivos vive en `services/obsidian/` (lado
  TS) + comandos Tauri dedicados (lado Rust) — nunca acceso directo a `fs` desde componentes.

## 4. Motor de recomendación ("¿qué conviene estudiar ahora?")

Implementado en `services/recommendation/`. Es una función pura y explicable:

`recommend(context) -> { action, reasons[] }`

Factores de entrada (todos con peso configurable, nunca ocultos):
- repasos vencidos (estado `vencido` en `Review`);
- dependencia curricular (`CurriculumDependency` satisfecha/no satisfecha);
- prioridad declarada en `DailyPlan`/`WeeklyPlan`;
- proyecto activo con hito próximo;
- dificultad percibida vs. tiempo disponible declarado por el usuario;
- punto de continuidad de la última `StudySession`;
- nivel de dominio actual vs. objetivo;
- energía declarada (input manual del usuario en el dashboard).

La salida siempre incluye `reasons[]` en lenguaje natural para no ser una caja negra (requisito
explícito del prompt maestro, sección 7). El usuario puede ignorar la recomendación; esa decisión
se registra en `ActivityLog` sin penalización visual.

## 5. Integración con Obsidian

- Selección de carpeta del vault vía diálogo nativo Tauri (`dialog` plugin).
- Indexación: lectura de todos los `.md`, parseo de frontmatter YAML y wikilinks `[[...]]`
  (Rust, para rendimiento con vaults grandes).
- Tres modos de permiso (persistidos en `UserSetting`): `solo_lectura`, `lectura_creacion`,
  `lectura_creacion_actualizacion_metadatos`.
- Escritura: siempre atómica (escribir a archivo temporal + rename), con copia previa (`.bak`)
  si el archivo ya existe, validación de path (anti path-traversal: la ruta resuelta debe quedar
  dentro del vault configurado), y solo se tocan los campos de frontmatter autorizados por el
  esquema (ver `DATA_MODEL.md` → `ObsidianNote`).
- Nunca se borran notas desde SODIAC en esta versión.
- Apertura de notas vía protocolo `obsidian://open?vault=...&file=...`.

## 6. Módulo de IA (diferido, no bloqueante)

No se integra ninguna API de IA que requiera claves en el MVP. Se define una interfaz
`services/ai/AiProvider.ts` marcada explícitamente como **pendiente** (no un placeholder oculto):
genera y copia prompts para pegar manualmente en ChatGPT. La arquitectura permite implementar un
proveedor real después sin tocar el resto del sistema.

## 7. Manejo de errores y logging

- Error boundary global de React para fallos de UI.
- Logging estructurado a un archivo rotado en el directorio de datos de la app (vía Rust,
  `tracing` + `tracing-appender`), visible en Configuración → Estado del sistema.
- Toda operación destructiva pasa por un comando Tauri auditado (ver `SECURITY_AND_BACKUPS.md`).

## 8. Estructura de repositorio

```
sodiac/
├── src/
│   ├── app/                # bootstrap, router, providers
│   ├── components/         # UI compartida (design system)
│   ├── features/
│   │   ├── today/
│   │   ├── curriculum/
│   │   ├── sessions/
│   │   ├── planning/
│   │   ├── reviews/
│   │   ├── projects/
│   │   ├── library/
│   │   ├── statistics/
│   │   ├── documents/
│   │   ├── obsidian/
│   │   └── settings/
│   ├── database/            # repositorios + tipos de fila
│   ├── services/             # casos de uso (recomendación, repasos, export, backups, obsidian)
│   ├── stores/                # Zustand
│   ├── hooks/
│   ├── schemas/               # Zod
│   ├── types/
│   ├── styles/                 # tokens Tailwind
│   └── utils/
├── src-tauri/
│   ├── src/                    # comandos Rust: fs, backups, obsidian watcher, sql init
│   └── tauri.conf.json
├── migrations/                  # SQL versionado
├── seed/                          # JSON institucional (preguntas, competencias, materias...)
├── tests/
├── docs/
└── scripts/
```
