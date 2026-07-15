# SODIAC — Roadmap por fases

Cada fase termina solo si `npm run lint`, `npm run typecheck`, `npm run test` y `cargo check`
pasan, y se informa con el formato de la sección 30 del prompt maestro (qué se construyó, qué
archivos, qué decisiones, qué pruebas, qué riesgos, cómo probar manualmente, próxima fase).

- **Fase 0 — Análisis y documentación** ✅ en curso (este conjunto de documentos).
- **Fase 1 — Fundación técnica**: repo Git, Tauri init, puerto 53117, TS estricto, lint, tests,
  design system base, navegación, layout, manejo global de errores, logging.
- **Fase 2 — Base de datos y seguridad**: esquema, migraciones, repositorios, backups,
  restauración, exportaciones, auditoría, integridad, seed institucional separado de datos reales.
- **Fase 3 — Dashboard y planificación**: Hoy, tareas, calendario, planes diarios/semanales,
  próximas acciones, puntos de continuidad.
- **Fase 4 — Sesiones y Pomodoro**: INICIAR ESTUDIO, modo sesión, temporizador, recuperación de
  sesión interrumpida, COMPROBAR, FINALIZAR ESTUDIO, evidencias, próxima acción, repaso.
- **Fase 5 — Mapa académico**: preguntas, competencias, materias, temas, dependencias, etapas,
  dominio, progreso, vistas árbol/tabla/mapa de relaciones (React Flow).
- **Fase 6 — Obsidian**: selección de vault, indexación, frontmatter, enlaces, apertura/creación
  de notas, detección de cambios, permisos, escritura segura.
- **Fase 7 — Proyectos y biblioteca**: proyectos, hitos, productos, recursos, bibliografía,
  vinculaciones, importación de la Primera Misión (opciones argentinas) como estructura, no como
  operación financiera real.
- **Fase 8 — Repasos y estadísticas**: motor de sugerencias explicable, cola de repasos,
  retención, gráficos, cuellos de botella, evolución del dominio.
- **Fase 9 — Documentos y versiones**: documentos institucionales, versiones, estados, historial,
  comparación básica de metadatos.
- **Fase 10 — Terminación**: accesibilidad, rendimiento, estados vacíos, onboarding, instalador,
  manual de uso, auditoría final, build de producción.

El MVP (ver `PRODUCT_SPEC.md` §6) se completa al cierre de la Fase 6 (incluye 1–6 más export/backup
de la Fase 2). Las fases 7–10 son posteriores al MVP y no bloquean su entrega.
