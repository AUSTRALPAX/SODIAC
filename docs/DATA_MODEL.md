# SODIAC — Modelo de Datos (Fase 0)

Motor: SQLite. Todas las tablas incluyen, salvo excepción indicada: `id TEXT PRIMARY KEY` (UUID),
`created_at`, `updated_at`, `status`, `sort_order`, `notes`, `tags` (tabla puente o JSON), y
`archived_at NULL` para archivado lógico. Claves foráneas con `ON DELETE RESTRICT` por defecto
(nunca borrado en cascada silencioso de contenido académico).

## 1. Entidades de arquitectura académica

### FundamentalQuestion
Preguntas fundamentales del Instituto (6 semillas: cómo funciona el mundo, cómo se crea valor,
cómo asignar capital, cómo decidir bajo incertidumbre, cómo construir organizaciones, cómo
aprender y producir conocimiento — Documento Fundacional §8).
`id, code, title, description, sort_order, status, notes, tags, created_at, updated_at, archived_at`

### Competency
Capacidades observables del Mapa Maestro de Competencias (códigos F0.x, P1.x, E2.x, V3.x, FI4.x,
A5.x, L6.x, K7.x).
`id, fundamental_question_id FK, code, title, description, level_group (0-7), evidence_hint,
status, sort_order, notes, tags, created_at, updated_at, archived_at`

### Subject (Materia)
`id, fundamental_question_id FK, title, description, status, sort_order, notes, tags,
created_at, updated_at, archived_at`

### Topic (Tema)
`id, subject_id FK, competency_id FK NULL, title, description, learning_stage_id FK NULL,
status, sort_order, notes, tags, created_at, updated_at, archived_at`

### LearningStage (Etapa)
Etapas 0–7 de la Hoja de Ruta (Puesta en marcha, Lenguaje básico, Empresas y creación de valor,
Finanzas e instrumentos, Opciones argentinas, Asignación de capital, Geopolítica, Finanzas
corporativas).
`id, code, title, description, orientative_duration, main_product, sort_order, status, notes,
tags, created_at, updated_at, archived_at`

### CurriculumDependency
Grafo de prerequisitos entre `Topic`/`Competency` (usado por el motor de recomendación y por el
mapa de "temas bloqueados").
`id, from_topic_id FK, to_topic_id FK, dependency_type (requires|suggests), status, notes,
created_at, updated_at`

## 2. Sesiones y estudio

### StudySession
Registro maestro de una sesión formal (protocolos INICIAR/FINALIZAR ESTUDIO, Plantilla de
Sesión).
`id, fundamental_question_id FK, competency_id FK, subject_id FK, topic_id FK NULL,
session_type (explicacion|debate|lectura|ejercicio|laboratorio|revision|aplicacion|
produccion_escrita|diagnostico), planned_duration_min, actual_duration_min, prior_knowledge,
observable_objective, resources, expected_product, continuity_point_prev_id FK NULL,
started_at, ended_at, closure_status (formal|cancelada|incompleta), conclusion, evidence_summary,
next_action, continuity_point, status, sort_order, notes, tags, created_at, updated_at,
archived_at`

Regla de negocio (no de esquema): no se permite `closure_status = 'formal'` sin `conclusion`,
`evidence_summary`, `next_action` y `continuity_point` no vacíos (validado en `services/`).

### StudyBlock
Bloques de comprensión / aplicación / consolidación dentro de una sesión.
`id, study_session_id FK, block_type (comprension|aplicacion|consolidacion), started_at,
ended_at, quick_notes, status, sort_order, created_at, updated_at`

### PomodoroCycle
`id, study_session_id FK, cycle_index, phase (foco|pausa_corta|pausa_larga), planned_minutes,
actual_minutes, interrupted (bool), started_at, ended_at, created_at, updated_at`

### LearningEvidence
Evidencia concreta de aprendizaje (nota, análisis, modelo, simulación, protocolo, decisión,
producto).
`id, study_session_id FK NULL, project_id FK NULL, evidence_type, title, description, file_path
NULL, obsidian_note_id FK NULL, status, sort_order, notes, tags, created_at, updated_at,
archived_at`

### MasteryAssessment
Evaluación de dominio (escala 0–5, sección 15 de la Hoja de Ruta / Mapa Maestro).
`id, competency_id FK, topic_id FK NULL, level (0-5), assessed_at, declared_confidence (0-100),
perceived_difficulty (0-100), result_explanation, evidence_id FK NULL, evaluator
(fundador|chatgpt|sodiac_heuristica), is_provisional (bool), next_advance_criterion, status,
notes, created_at, updated_at`

Regla: el nivel vigente de una `Competency` se calcula como el `MasteryAssessment` no provisional
más reciente; nunca se incrementa automáticamente al completar una `Task`.

### Review (Repaso)
`id, competency_id FK NULL, topic_id FK NULL, evidence_id FK NULL, due_at,
state (no_programado|proximo|pendiente|vencido|completado|pospuesto|innecesario|enfriado),
reason_factors (JSON: dominio/dificultad/confianza/importancia/errores/fecha/dependencia/
evidencia/proyecto), completed_at NULL, status, sort_order, notes, tags, created_at, updated_at,
archived_at`

## 3. Planificación

### Task
`id, title, description, due_at NULL, priority (baja|media|alta|critica), task_type
(estudio|administrativo|proyecto|otro), project_id FK NULL, study_session_id FK NULL,
completed_at NULL, status, sort_order, notes, tags, created_at, updated_at, archived_at`

### TaskHistory
Historial de reprogramaciones (nunca se sobrescribe silenciosamente — regla del prompt maestro
§14).
`id, task_id FK, changed_field, old_value, new_value, changed_at, reason NULL`

### DailyPlan / WeeklyPlan
`DailyPlan: id, plan_date, energy_declared (0-100), available_minutes, focus_subject_id FK NULL,
status, notes, created_at, updated_at`
`WeeklyPlan: id, week_start_date, review_type (cada_5_sesiones|etapa|trimestral|extraordinaria),
accelerated_json, postponed_json, removed_json, added_json, rationale, status, notes,
created_at, updated_at`

## 4. Proyectos

### Project
Tipos iniciales: análisis, simulación, modelo, planilla, software, ensayo, capítulo, protocolo,
estudio de caso, política, laboratorio.
`id, fundamental_question_id FK NULL, competency_id FK NULL, subject_id FK NULL, title,
description, project_type, closure_conditions, context_type
(estudio|laboratorio|simulacion|cartera_real|produccion_editorial), started_at, closed_at NULL,
status, sort_order, notes, tags, created_at, updated_at, archived_at`

### ProjectMilestone
`id, project_id FK, title, description, due_at NULL, completed_at NULL, status, sort_order,
notes, created_at, updated_at`

Nota: la "Primera Misión: Opciones Argentinas" se modela como un `Project` de tipo `laboratorio`
con `context_type = simulacion`, importado desde `seed/projects.json`, con sus 9 fases (A–I) como
`ProjectMilestone`.

## 5. Biblioteca y fuentes

### Resource
`id, title, resource_type (libro|articulo|informe|video|curso|sitio|dataset|
documento_interno|archivo_local), author, function_note (estructural|didactica|tecnica|caso|
critica|referencia), reading_state (pendiente|consultando|activo|finalizado|referencia|
descartado|reemplazado), priority, file_path NULL, url NULL, status, sort_order, notes, tags,
created_at, updated_at, archived_at`

### BibliographicSource
Vínculo N:N entre `Resource` y entidades académicas.
`id, resource_id FK, fundamental_question_id FK NULL, competency_id FK NULL, subject_id FK NULL,
topic_id FK NULL, project_id FK NULL, study_session_id FK NULL, obsidian_note_id FK NULL,
created_at`

## 6. Obsidian

### ObsidianNote
Espejo indexado (no fuente de verdad — la fuente de verdad es el archivo `.md`).
`id, vault_relative_path (unique), title, frontmatter_json, indexed_at, checksum,
sodiac_id NULL, note_type NULL, status NULL, mastery_level NULL, last_review_at NULL,
next_review_at NULL, created_at, updated_at`

### NoteLink
Wikilinks detectados entre notas (para el mapa de relaciones en React Flow).
`id, source_note_id FK, target_note_path, link_type (wikilink|embed), created_at`

Frontmatter propuesto (configurable, no impuesto — prompt maestro §13):
```yaml
sodiac_id:
tipo:
pregunta:
competencias:
materias:
temas:
estado:
dominio:
ultima_revision:
proxima_revision:
proyectos:
fuentes:
```

## 7. Documentos institucionales

### InstitutionalDocument
`id, code (ej. IAC-CVPS·DF-001), title, doc_type, current_version_id FK NULL, status
(borrador|propuesto|publicado|reemplazado|archivado), sort_order, notes, tags, created_at,
updated_at, archived_at`

### DocumentVersion
`id, institutional_document_id FK, version_label, file_path NULL, changelog, published_at NULL,
replaces_version_id FK NULL, status, created_at, updated_at`

## 8. Continuidad, configuración, sistema

### ContinuityPoint
`id, study_session_id FK NULL, topic_id FK NULL, project_id FK NULL, description, created_at`

### UserSetting
Clave/valor tipado (vault_path, master_folder_path, obsidian_permission_mode,
pomodoro_focus_min, pomodoro_short_break_min, pomodoro_long_break_min, backups_to_keep, idioma,
etc.) — `id, key (unique), value_json, updated_at`.

### BackupRecord
`id, backup_type (pre_migracion|pre_importacion|pre_restauracion|pre_operacion_masiva|diario|
semanal|mensual), file_path, size_bytes, checksum, created_at, restored_at NULL, restore_result
NULL`

### ActivityLog
Auditoría de operaciones importantes y de decisiones del usuario que ignoran la recomendación.
`id, entity_type, entity_id NULL, action, payload_json, actor (usuario|sistema), created_at`

## 9. Diagrama relacional (alto nivel)

```
FundamentalQuestion 1─* Competency 1─* Topic *─1 Subject 1─* Topic
FundamentalQuestion 1─* Subject
Competency 1─* MasteryAssessment
Topic *─* Topic  (via CurriculumDependency)
StudySession *─1 FundamentalQuestion/Competency/Subject/Topic
StudySession 1─* StudyBlock, 1─* PomodoroCycle, 1─* LearningEvidence
LearningEvidence 1─* MasteryAssessment (opcional), *─1 ObsidianNote
Review *─1 Competency/Topic, *─1 LearningEvidence
Project 1─* ProjectMilestone, 1─* LearningEvidence, *─* Resource (via BibliographicSource)
Task *─1 Project, *─1 StudySession
ObsidianNote 1─* NoteLink
InstitutionalDocument 1─* DocumentVersion
```

## 10. Migraciones

Versionadas en `migrations/NNNN_description.sql`, aplicadas con transacción por migración,
cada una precedida de un `BackupRecord` automático (ver `SECURITY_AND_BACKUPS.md`). `0001_init.sql`
crea el esquema completo descrito arriba.
