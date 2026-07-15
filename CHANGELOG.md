# Changelog

Formato basado en Keep a Changelog. Versión de la app en `package.json` / `src-tauri/tauri.conf.json`.

## [Unreleased]

### Fase 0 — Análisis y documentación
- Lectura completa del Compendio Maestro y la Hoja de Ruta Académica del IAC.
- `docs/PRODUCT_SPEC.md`, `docs/ARCHITECTURE.md`, `docs/DATA_MODEL.md`,
  `docs/DESIGN_SYSTEM.md`, `docs/SECURITY_AND_BACKUPS.md`, `docs/ROADMAP.md`,
  `docs/DECISIONS.md`, `docs/TRACEABILITY_MATRIX.md`.

### Fase 1 — Fundación técnica (en curso)
- Repositorio Git inicializado.
- Proyecto Tauri 2 + React + TypeScript estricto + Vite, puerto fijo 127.0.0.1:53117.
- Tailwind con tokens de `docs/DESIGN_SYSTEM.md`, tipografías Space Grotesk/Inter locales.
- Navegación persistente (11 secciones) + paleta de comandos Ctrl+K.
- Error boundary global.
- Migración inicial `migrations/0001_init.sql` con el esquema completo de `docs/DATA_MODEL.md`.
- Plugins Tauri registrados: `sql` (SQLite + migraciones), `dialog`, `fs`, `log`.
- Datos semilla institucionales en `seed/` (preguntas, competencias, materias, temas, etapas,
  proyectos, documentos institucionales).
