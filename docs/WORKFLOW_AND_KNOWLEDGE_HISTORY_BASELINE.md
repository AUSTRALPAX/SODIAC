# Baseline — Flujo de trabajo, historial de conocimiento y validación

Auditoría previa a la rama `feat/workflow-and-knowledge-history`, antes de
escribir ninguna tabla o pantalla nueva. Ver también
`docs/PERSISTENCE_AND_BACKUP_BASELINE.md` y `docs/UPDATE_1_1_BASELINE.md` para
el mismo patrón en actualizaciones anteriores.

## 1. Esquema actual relevante

Orden de migraciones: `0001_init` → `0002_library_institutional_fields` →
`0003_document_viewer_ranges` → `0004_obsidian_sync_state` →
`0005_academic_progression` → `0006_academic_assignment_base_columns` →
`0007_academic_updated_at_columns` → `0008_completion_xp` → `0009_carrera` →
`0010_resource_usage` → `0011_curriculum_reconciliation` →
`0012_bibliography_austrofinancial` → `0013_resource_reading_state_en_proceso`
→ `0014_backup_record_manual_and_verification`.

**Currículo:** `subject` (0001:56, `status` texto libre default `'activa'`,
sin CHECK), `topic` (0001:70, `status` texto libre default `'activo'`, sin
CHECK — **en uso real hoy solo existen `'activo'` y `'completado'`**,
seteado en `completionXp.ts:168`), `curriculum_unit` (0009:26),
`curriculum_dependency` (0001:86), `curriculum_activity` (0009:43),
`career` (0009:10), `fundamental_question`/`competency`/`learning_stage`
(0001:9-54).

**Sesiones:** `study_session` (0001:99, `closure_status` CHECK
`en_curso|formal|cancelada|incompleta`), `study_block`, `pomodoro_cycle`.

**XP:** `xp_event` (0005:181, recreada en 0008) — `category` CHECK con 9
valores, **`idempotency_key TEXT NOT NULL UNIQUE`** (0005:195) como
mecanismo de deduplicación real y ya funcionando. `academic_level_history`,
`academic_rank`.

**Repasos:** `review` (0001:194) — `state` CHECK **ya incluye `'enfriado'`**
entre sus 8 valores posibles. Sin `ease_factor`/`interval_days`: el
enfriamiento hoy es un flag manual (`markReviewCooled`), no un modelo de
retención calculado.

**Evidencia/dominio:** `learning_evidence` (0001:157), `mastery_assessment`
(0001:175, escala 0-5, documentado como no confundir con el score 0-100 de
rúbrica).

**Rúbricas y evaluación** (0005:19-276) — **sistema completo y ya
sembrado**: `grading_rubric`, `grading_rubric_version` (versionado real,
`total_points` default 100), `rubric_criterion` (peso por criterio),
`academic_assignment`, `assignment_submission`, `academic_evaluation`
(`total_score` 0-100, `verdict`, `evaluator` CHECK
`chatgpt|fundador|sodiac_heuristica`), `criterion_evaluation`,
`subject_assessment_plan`, `assessment_component`,
`academic_transcript_entry`, `evaluation_import`.

**Obsidian:** `obsidian_note`, `note_link`.

**Uso de recursos** (0010) — `resource_usage_event.action` CHECK
`abierto|consultado|vinculado|citado|utilizado_en_sesion|utilizado_en_proyecto`
— coincide casi 1:1 con lo pedido en la sección 7 del pedido
(abierta/consultada/utilizada/citada).

## 2. Mecanismo actual de "completar" un tema

`src/services/completionXp.ts` + `src/services/xp.ts`:

- `completeTopic(topicId)` (completionXp.ts:164-179): marca
  `completed_at`+`status:"completado"` y llama `awardXp` con
  `category:"finalizacion_tema"`, **score100 siempre 100** (sin crédito
  parcial), monto repartido entre los temas activos de la materia.
- `checkSubjectCompletionGate` (completionXp.ts:114-121): la materia solo
  cierra cuando el 100% de sus temas no archivados tienen `completed_at` —
  gate puro, sin validación de por medio.
- `awardXp` (xp.ts:201-233): `idempotencyKey =
  sourceType:sourceId:category:version` (xp.ts:162); solo otorga la
  **diferencia positiva** entre el monto propuesto y lo ya otorgado con esa
  clave — infraestructura de idempotencia real y reutilizable, sin cambios
  necesarios en su mecánica.
- **Hoy "completar un tema" es una sola casilla binaria** — exactamente el
  hueco que el pedido quiere llenar con la división
  sesión/nota/validación/repaso.

## 3. Sistema de rúbricas existente — reutilizable directo

`rubrics.ts`: `ensureDefaultRubrics()` ya crea una "Rúbrica general" (100
puntos, 6 criterios: comprensión 25, razonamiento 20, evidencia/precisión 15,
aplicación 20, crítica/límites 10, claridad 10) más 8 rúbricas específicas
por tipo de trabajo, todas reutilizando el mismo set de criterios
parametrizado. `reviseRubric` nunca edita en el lugar, siempre versiona.

`evaluations.ts` ya implementa el pipeline completo: `academic_evaluation` +
`criterion_evaluation`, importación de JSON desde ChatGPT
(`importEvaluationResponse`), aceptación (`acceptEvaluation`) que escribe
`academic_transcript_entry` y llama `awardXp` (`<60` → categoría
`"intento"`, si no, categoría según tipo de trabajo).

**Los pesos exactos del pedido (comprensión 30/precisión 20/relación
20/aplicación 20/límites 10) no coinciden con la rúbrica general actual
(25/20/15/20/10/10, 6 criterios)** — el ajuste natural es una fila nueva en
`grading_rubric` con `work_type: "validacion_conocimiento"` (o similar),
usando la misma parametrización que ya soporta `createRubric`, no un
sistema paralelo.

## 4. Repasos

`reviews.ts`: `listReviewQueue()` calcula `'vencido'` en el momento de la
lectura si `due_at` ya pasó (sin job de fondo). Acciones:
`completeReview`/`postponeReview`/`markReviewUnnecessary`/`markReviewCooled`
(setea `state:'enfriado'`)/`reactivateReview`. Se crean desde
`finalizeSession` solo si se marca "necesita repaso", con `due_at` elegido a
mano por el usuario.

**No existe ningún algoritmo de repetición espaciada** (sin ease factor, sin
cálculo de intervalo por dificultad). El "enfriamiento" como modelo de
retención calculado (no solo un flag manual) es una pieza genuinamente
nueva a construir — el nombre de estado ya está reservado y conectado en
`computeDisplayState`, pero la lógica de decaimiento no existe.

## 5. Sesiones — "Finalizar estudio"

`sessions.ts:278-399`. Exige `conclusion`/`evidenceSummary`/`nextAction`/
`continuityPoint` no vacíos para cerrar formal. Al finalizar: inserta
`continuity_point`, autocrea una `task` desde `nextAction`, opcionalmente
`mastery_assessment` (0-5 + confianza/dificultad + texto), opcionalmente
`review`, opcionalmente dispara
`completeTaskOrMilestone`/`completeTopic`/`completeSubject` vía checkboxes.

Existe además un flujo de "Comprobación" (`recordComprobacion`,
sessions.ts:205-227) que crea `learning_evidence` desde una lista fija de 10
métodos — conceptualmente cercano a "validación de conocimiento" pero es
autoinforme libre, no puntuado por rúbrica.

Uso de recursos durante la sesión: `handleUseResource`
(ActiveSessionPage.tsx:401-411) ya llama `recordResourceUsage(...,
action:"utilizado_en_sesion")`.

## 6. Plantillas

No existe un sistema enumerado de plantillas. La pieza reutilizable es
`createNoteFromTemplate(relativePath, frontmatter, body)`
(`obsidian/index.ts:267-298`) — escribe atómico, respalda si el archivo ya
existía, crea carpetas padre. Hoy se llama con un frontmatter hardcodeado
puntual (`ActiveSessionPage.tsx:369-397`). **Es una primitiva reutilizable,
no un registro de plantillas** — las 4 plantillas pedidas pueden ser
constantes TS que alimenten esta misma función, sin tabla nueva obligatoria
salvo que deban ser editables por el usuario.

## 7. Trayectoria — 7 pestañas actuales

`TrajectoryPage.tsx:17-27`: Resumen, Expediente, Calificaciones,
Experiencia, Niveles y rangos, Progreso de materias, Configuración
académica. Un "Historial de conocimiento" encaja como **octava pestaña**
(mismo patrón que agregar `GradingTab`/`ExperienceTab` en su momento), no
como ruta nueva.

## 8. Navegación

`router.tsx:20-45` — rutas de primer nivel: dashboard, trayectoria, carrera
(+detalle), mapa, sesiones (+nueva/detalle), planificación, repasos,
proyectos, biblioteca, estadísticas, documentos, obsidian, configuración.
Un patrón de "una ruta por dominio, sub-features en pestañas". La sección
"Flujo de trabajo" (documentación/guía de proceso) encaja mejor como panel
dentro de Configuración o Carrera que como ruta nueva, salvo que necesite
una cola/lista propia (en ese caso, mejor un widget de Dashboard).

## 9. Cálculo de XP (`xp.ts`)

`CAREER_TOTAL_XP = 100_000`, `MAX_LEVEL = 100`. Dos presupuestos por materia,
**calculados en vivo, nunca persistidos**: 70% calificado / 30% completitud,
repartido proporcional a `credits`. El presupuesto de completitud se reparte
vía `COMPLETION_CATEGORY_WEIGHTS` (finalización_tarea_hito 20%,
finalización_tema 60%, cierre_materia 20%).

**Las columnas `subject.budgeted_xp`/`completion_budgeted_xp` están
explícitamente muertas desde esta versión** (comentario en xp.ts:63-68) —
la división 20/30/40/10 pedida sería un sub-reparto nuevo dentro de la
categoría `finalizacion_tema` existente (o una categoría nueva), no una
reutilización de columnas ya muertas. Requiere: nuevo valor en el CHECK de
`xp_event.category` (migración de recreación de tabla, mismo patrón que
0008/0013) + actualizar el union type en `database/types.ts:680-690`.

## 10. Idempotencia de XP

Confirmada y reutilizable sin cambios de mecánica:
`xp_event.idempotency_key TEXT NOT NULL UNIQUE`. Formato actual:
`` `${sourceType}:${sourceId}:${category}:${rubricVersionId ?? 'sin_rubrica'}` ``.
Reintentos usan sufijo `:rev${n}`. El estilo de clave pedido
(`topic-study:topicId:v1`) es compatible: sería un nuevo valor de
`sourceType` (columna TEXT libre, sin CHECK) reutilizando las mismas
funciones `computeXpPreview`/`awardXp`.

## 11. Uso de recursos

`resourceUsage.ts` + `resource_usage_event` ya implementan casi 1:1 lo
pedido (abierta/consultada/utilizada/citada). `recordResourceUsage()` solo
se llama desde acciones reales de usuario, nunca desde un rerender (comentario
explícito en el código). No requiere tabla nueva.

## Resumen — reutilizar vs. construir

| Necesidad | Veredicto |
|---|---|
| Motor de rúbricas (100pt, criterios con peso, versionado) | **Reutilizar** `grading_rubric`/`rubric_criterion`/`rubrics.ts` — nueva fila de rúbrica |
| Evaluación + aceptación + XP | **Reutilizar** `academic_evaluation`/`evaluations.ts` |
| Idempotencia de XP | **Reutilizar** tal cual, solo nuevos valores de `category`/`source_type` |
| Uso de recursos (abierta/consultada/utilizada/citada) | **Reutilizar** `resource_usage_event` casi verbatim |
| Sede de "Historial de conocimiento" | **Reutilizar** — 8va pestaña en Trayectoria |
| Primitiva de creación de notas | **Reutilizar** `createNoteFromTemplate` |
| Completar un tema (binario) | **Falta/rediseñar**: hoy es un solo evento, crédito completo — necesita partirse en sesión/nota/validación/repaso |
| Estados de aprendizaje ampliados | **Falta**: `topic.status` es texto libre sin CHECK, en uso real solo `activo`/`completado` — se puede ampliar sin migración, pero no hay máquina de estados ni UI |
| Modelo de enfriamiento/retención | **Falta como algoritmo real**: `'enfriado'` es un flag manual, no hay decaimiento calculado |
| Categoría de XP para validación | **Falta**: nuevo valor de CHECK en `xp_event.category` (migración de recreación de tabla) |
| Sección "Flujo de trabajo" documentada | **Falta** como sección de navegación — mejor como contenido dentro de Configuración/Carrera que ruta nueva |
