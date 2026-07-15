# SODIAC — Matriz de Trazabilidad (Fase 0)

Requisito institucional → función → entidad → pantalla → prueba.

| Requisito institucional (fuente) | Función SODIAC | Entidad(es) | Pantalla | Prueba (flujo crítico) |
|---|---|---|---|---|
| "No se avanza porque terminó el mes" (Hoja de Ruta §2) | Dominio manual con evidencia | MasteryAssessment, LearningEvidence | Sesiones / Mapa | #5 Registrar evidencia, #6 Finalizar correctamente |
| Protocolo INICIAR ESTUDIO (Compendio §4, Hoja de Ruta §13) | Asistente de inicio de sesión + generación de prompt | StudySession | Hoy → Iniciar Estudio | #2 Planificar sesión, #3 Iniciar sesión |
| Protocolo FINALIZAR ESTUDIO / cierre mínimo | Formulario de cierre con 4 campos obligatorios | StudySession, LearningEvidence, ContinuityPoint | Modo Sesión → Finalizar | #6 Finalizar correctamente, #7 Crear próxima acción |
| Escala de dominio 0–5 (Mapa Maestro) | Registro de nivel + confianza + dificultad | MasteryAssessment | Mapa / Sesión | #5 Registrar evidencia |
| Sistema de repaso adaptable (Hoja de Ruta §15) | Cola de repasos con estados y razones explicables | Review | Repasos | #8 Programar repaso |
| Preguntas fundamentales → competencias → materias → temas (Doc. Fundacional §8-9) | Mapa académico jerárquico | FundamentalQuestion, Competency, Subject, Topic, CurriculumDependency | Mapa | #1 Crear estructura académica |
| Integración con Obsidian sin apropiarse del vault (Doc. Fundacional §14.3) | Indexación + apertura + escritura controlada | ObsidianNote, NoteLink | Obsidian | #9 Vincular nota |
| Backups antes de operaciones destructivas (prompt maestro §3) | BackupRecord automático + restauración validada | BackupRecord | Configuración → Backups | #12 Crear backup, #13 Restaurar backup, #14 Comprobar integridad |
| Primera Misión: opciones argentinas (Compendio, doc. 11) | Proyecto tipo laboratorio importable | Project, ProjectMilestone | Proyectos | Importación de seed institucional |
| Ritmo semanal / calendario (Hoja de Ruta §11-12) | Calendario diario/semanal/mensual | DailyPlan, WeeklyPlan, Task, StudySession, Review | Planificación | #2 Planificar una sesión |
| No debe transformarse en burocracia (Doc. Fundacional §16.2) | Cierre mínimo simple, formularios opcionales fuera del mínimo | StudySession | Modo Sesión | Revisión manual de UX en Fase 10 |
| Cambiar la ruta del vault sin perder datos | Reconfiguración de `UserSetting.vault_path` con re-indexación | UserSetting, ObsidianNote | Configuración | #15 Cambiar ruta del vault sin perder datos |
| Cerrar y reabrir sin perder información | Persistencia SQLite en AppData | (todas) | — | #10 Cerrar y reabrir, #11 Comprobar persistencia |

Esta matriz se amplía en cada fase posterior a medida que se agregan pantallas y pruebas
concretas (Biblioteca, Estadísticas, Documentos institucionales).
