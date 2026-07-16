# Changelog

Formato basado en Keep a Changelog. Versión de la app en `package.json` / `src-tauri/tauri.conf.json`.

## [Unreleased]

### Fase 0 — Análisis y documentación
- Lectura completa del Compendio Maestro y la Hoja de Ruta Académica del IAC.
- `docs/PRODUCT_SPEC.md`, `docs/ARCHITECTURE.md`, `docs/DATA_MODEL.md`,
  `docs/DESIGN_SYSTEM.md`, `docs/SECURITY_AND_BACKUPS.md`, `docs/ROADMAP.md`,
  `docs/DECISIONS.md`, `docs/TRACEABILITY_MATRIX.md`.

### Fase 1 — Fundación técnica
- Repositorio Git inicializado.
- Proyecto Tauri 2 + React + TypeScript estricto + Vite, puerto fijo 127.0.0.1:53117.
- Tailwind con tokens de `docs/DESIGN_SYSTEM.md`, tipografías Space Grotesk/Inter locales.
- Navegación persistente (11 secciones) + paleta de comandos Ctrl+K.
- Error boundary global.
- Migración inicial `migrations/0001_init.sql` con el esquema completo de `docs/DATA_MODEL.md`.
- Plugins Tauri registrados: `sql` (SQLite + migraciones), `dialog`, `fs`, `log`.
- Datos semilla institucionales en `seed/` (preguntas, competencias, materias, temas, etapas,
  proyectos, documentos institucionales).
- Logotipo oficial de SODIAC (símbolo brújula/S) integrado en sidebar, favicon e íconos de
  instalación; provisional reemplazado por el vector definitivo del usuario.

### Fase 2 — Base de datos y seguridad
- Repositorio genérico (`createRepository<T>`) con auditoría automática en `activity_log`.
- Respaldos con checksum SHA-256, retención configurable, respaldo previo a operaciones
  riesgosas, verificación de integridad (`PRAGMA integrity_check`).
- Importación idempotente de la estructura institucional desde `seed/*.json` (upsert por código).
- Exportación JSON/CSV vía diálogo nativo.

### Fase 3 — Dashboard y planificación
- Panel **Hoy** con motor de recomendación explicable de próxima acción.
- Tareas (vencidas/hoy/próximas) con alta rápida y completado.
- Calendario (FullCalendar, locale es) con reprogramación no destructiva — el historial de
  cambios de fecha se preserva.

### Fase 4 — Sesiones y Pomodoro
- Protocolo Iniciar estudio / Comprobar / Finalizar estudio, con Pomodoro configurable.
- Recuperación de sesión interrumpida al reabrir la app.
- Finalizar estudio exige conclusión, evidencia, próxima acción y punto de continuidad; genera
  tarea de seguimiento, punto de continuidad y, si corresponde, evaluación de dominio y repaso.

### Fase 5 — Mapa académico
- Vistas árbol, tabla y mapa de relaciones (React Flow) de preguntas → competencias → materias →
  temas, con dependencias curriculares y nivel de dominio (0–5, nunca automático).

### Fase 6 — Obsidian
- Selección de vault, indexación de notas, parseo de frontmatter y wikilinks.
- Permisos por nivel (solo lectura / crear / actualizar metadatos).
- Creación de notas desde plantilla con escritura atómica y respaldo `.bak`; nunca sobrescribe
  ni borra sin ese resguardo.
- Apertura de notas y del vault en Obsidian desde la app (`obsidian://`).

### Fase 7 — Proyectos y biblioteca
- Proyectos con hitos, tipo y contexto (estudio/laboratorio/simulación/cartera real/producción
  editorial); importación de la "Primera Misión: Opciones Argentinas" como estructura de
  proyecto, no como operación financiera real.
- Biblioteca de recursos bibliográficos con estado de lectura y vinculación a proyectos.

### Fase 8 — Repasos y estadísticas
- Cola de repasos con estado derivado por fecha y razones explicables por sugerencia.
- Estadísticas: actividad de sesiones, evolución del dominio, distribución de bloques y materias
  con menor cobertura evaluada (Recharts).

### Fase 9 — Documentos y versiones
- Documentos institucionales con historial de versiones que nunca se sobrescribe (la versión
  anterior queda "reemplazada").
- Comparación básica de metadatos entre dos versiones.

### Fase 10 — Terminación
- Aviso de bienvenida en Hoy cuando no hay estructura institucional importada todavía.
- Ventana mínima 1280×720 (antes 800×600) acorde al rango soportado por `DESIGN_SYSTEM.md`.
- Paleta de comandos con semántica de diálogo accesible (`role="dialog"`, `aria-modal`).
- Manual de uso (`docs/MANUAL_DE_USO.md`).
