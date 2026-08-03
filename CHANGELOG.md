# Changelog

Formato basado en Keep a Changelog. Versión de la app en `package.json` / `src-tauri/tauri.conf.json`.

## [1.18.0] — Navegación Atrás/Adelante (Entrega 1)

Primera de dos entregas. Esta no toca la base de datos ni el historial
académico: es sólo navegación. La reversión de contenidos marcados como
completados va en la Entrega 2, con migración y backup previo.

### Historial navegable

- Nueva barra de navegación fija (`NavigationBar.tsx`) sobre el contenido,
  con botones Atrás y Adelante que se deshabilitan de verdad cuando no hay
  a dónde ir — no es un `history.back()` a ciegas.
- Nuevo hook `useAppHistory`. React Router 7 no expone `canGoBack` /
  `canGoForward`, así que el estado se deriva del índice que el propio
  router guarda en `history.state.idx`. Un PUSH trunca el máximo alcanzado
  (se perdió el "adelante"); POP y REPLACE lo conservan.
- Si no hay historial previo (la app se abrió directamente en una ruta
  profunda), Atrás **nunca** llama a `navigate(-1)` — eso cerraría la
  aplicación. En su lugar sube al padre jerárquico: `/carrera/:id` →
  `/carrera`, `/sesiones/:id` → `/sesiones`, el resto al Dashboard.

### Atajos

- `Alt+←` y `Alt+→`, más los botones 4 y 5 del mouse.
- Los atajos se ignoran mientras se escribe en un campo de texto — una
  guarda de foco que el único listener global previo (`CommandPalette`)
  no tenía.
- Documentados en Configuración → Atajos de teclado.

### Contexto al volver

- Nuevo `useScrollRestore`: la posición de scroll se restaura al volver
  (POP) y se resetea al navegar a algo nuevo (PUSH). Antes el scroll no
  se reseteaba nunca al cambiar de sección. Se guarda **en memoria**, no
  en la base: cada preferencia de vista persistida cuesta tres sentencias
  SQL incluyendo una fila permanente en `activity_log`, y hacer eso en
  cada pausa de scroll inflaría esa tabla.
  La posición se anota **sólo** desde el listener de scroll, mientras la
  página sigue montada. Guardarla al cambiar de ruta no funciona: para
  entonces React ya montó la ruta nueva, el contenedor se encogió y el
  navegador clampeó `scrollTop` a 0, así que se guardaba un cero encima
  de la posición real. Por el mismo motivo se ignoran los eventos de
  scroll sobre un contenedor sin nada que scrollear — son el clampeo del
  navegador, no el usuario. Lo detectó la verificación en vivo; ningún
  test unitario puede reproducirlo porque depende del layout real.
  Al volver, la restauración espera a que el contenido asíncrono levante
  la altura (hasta 2 s; Carrera la tiene a los ~400 ms) y se aborta si el
  usuario scrollea mientras tanto.
- Corregidos dos deep-links que rompían el Atrás: Biblioteca (`?tema=`) y
  Mapa (`?buscar=`) borraban el parámetro de la URL con `replace` y lo
  leían sólo al montar, así que volver atrás no re-aplicaba el filtro.
  Ahora el parámetro se conserva y se lee como dependencia.
- Cuatro navegaciones pasan a `replace` para no dejar entradas muertas:
  tras crear una sesión y tras finalizarla o cancelarla.

### Breadcrumbs

- El breadcrumb de la sesión muestra la ruta completa
  `Sesiones › materia › tema`, con la materia enlazada a su detalle.
  Sigue siendo jerarquía, no historial: los botones hacen lo otro.

## [1.17.2] — Aclarar el nombre completo del IPA

- La etiqueta "IPA" (Dashboard y Trayectoria) ahora muestra también el
  nombre completo — "IPA · Índice de Progreso Académico" — para que quede
  claro qué significa la sigla sin tener que preguntar.

## [1.17.1] — Espaciado de los encabezados de la barra lateral

- Corregido: "INICIO" quedaba pegado al borde superior de la barra lateral
  a diferencia de "ESTUDIO" y el resto de los encabezados de grupo. Causa
  raíz: el primer grupo de navegación (`AppShell.tsx`) recibía un
  `className` vacío mientras los siguientes recibían `mt-3 border-t ... pt-3`
  — nunca tuvo su propio espaciado superior.
- Nuevo componente compartido `SidebarSectionLabel` (`src/components/layout/SidebarSectionLabel.tsx`)
  para que los cinco encabezados (INICIO, ESTUDIO, PRODUCCIÓN, CONOCIMIENTO,
  ANÁLISIS, SISTEMA) usen exactamente el mismo estilo, sin excepciones por
  posición. El espaciado del primer grupo (`pt-4`) y el de los siguientes
  (`mt-3 border-t border-border-subtle pt-3`) quedan como dos constantes
  nombradas en `AppShell.tsx`, no como valores sueltos.

## [1.17.0] — Auto-completar tema al finalizar + nota externa 0-10

- **"Tema" tildado por defecto** en el modal de Finalizar estudio cuando la
  sesión tiene un tema vinculado sin completar — antes había que tildarlo a
  mano o el tema seguía apareciendo como pendiente en Carrera (no era un bug
  de XP duplicado: son dos categorías de XP distintas — tarea de seguimiento
  vs. finalización del tema — que ambas usan el mismo mecanismo idempotente
  de `awardXp()`, sin riesgo real de doble otorgamiento).
- **Nota externa 0-10** (ej. una evaluación de ChatGPT sobre el tema
  estudiado): nuevo campo opcional en el modal de Finalizar estudio, columna
  nueva `mastery_assessment.external_score_0_10` (migración `0018`, aditiva).
  Es un concepto separado del nivel de dominio 0-5 existente y de
  `academic_transcript_entry.score_10` (calificación formal por materia) —
  ninguno de los dos se toca ni se re-escala. El promedio se muestra en
  Trayectoria → Resumen ("Promedio de notas externas (por tema)").

## [1.16.1] — Corrección: Ritmo y continuidad no se quería sacar

La v1.16.0 interpretó mal el pedido del usuario: lo que sobraba no era
"Racha de estudio"/"Puntos de continuidad" sino el gestor de tareas +
calendario que compartía la página con ellos (el usuario no planifica con
anticipación, estudia tema por tema según el día). Se revierte:

- **Racha de estudio y Puntos de continuidad restaurados** tal como estaban
  antes de v1.16.0, en `/planificacion` (nav vuelve a decir "Ritmo y
  continuidad").
- **Gestor de tareas + calendario eliminado** de `PlanningPage.tsx` — el
  formulario de alta de tareas, el listado y el `FullCalendar` de
  arrastrar/soltar. Las tareas que ya existían en la base (`task`) no se
  tocan ni se borran, simplemente dejan de tener una pantalla propia.

## [1.16.0] — Ajustes de uso real (Ritmo, Pomodoro unificado, limpieza de sesiones)

- **Ritmo y continuidad eliminado**: la "racha de estudio" y los "puntos de
  continuidad" eran 100% de solo lectura (nada que el usuario pudiera guardar
  ahí), tenían un bug de zona horaria en el conteo, y duplicaban el calendario
  de actividad que ya existe en el Dashboard. La página `/planificacion`
  vuelve a llamarse "Planificación" y solo muestra tareas + calendario, como
  antes de la Fase 5. Los datos subyacentes (`continuity_point`,
  `src/services/rhythm.ts`) no se tocan ni se pierden, solo dejan de
  renderizarse.
- **Pomodoro unificado**: el widget del Dashboard y el temporizador de
  "Iniciar estudio" eran dos implementaciones independientes con valores por
  defecto distintos (25/10/4 vs 25/5/∞) que nunca se comunicaban entre sí.
  Ahora comparten una sola configuración persistida
  (`src/services/pomodoroSettings.ts`) y el mismo beep sintetizado al cambiar
  de fase — cambiar la configuración en cualquiera de los dos lugares afecta
  a ambos. El temporizador de sesiones además ahora respeta un tope de
  cantidad de sesiones (antes ciclaba indefinidamente).
- **Archivar sesiones**: nuevo botón "Archivar" en las pestañas Canceladas e
  Incompletas de Sesiones, y una nueva pestaña "Archivadas" con "Restaurar" —
  reutiliza la columna `archived_at` que ya existía en el esquema pero nunca
  se conectó a `study_session`. No es un borrado real: cero riesgo de dejar
  registros huérfanos en evidencia/tareas/bibliografía/puntos de continuidad
  vinculados, y es reversible en cualquier momento.

## [1.12.0]–[1.15.0] — Mejora integral (fases 1 a 7)

Ciclo de mejora sobre la base ya existente: sin reconstruir nada desde cero, sin
eliminar información ni reducir el nivel/XP de ningún usuario durante las migraciones.

### Fase 1 — v1.12.0: base de la mejora integral
- Migración `0016` (aditiva): tablas `xp_rules_version` y `curriculum_version` para
  poder versionar las reglas de XP y las importaciones curriculares en vez de tenerlas
  hardcodeadas, más columnas de atributos académicos.
- `xpRulesVersion.ts`: reglas de XP resueltas en vivo desde la base en lugar de
  constantes fijas en el código.
- `curriculumVersion.ts` y extensión de `curriculumReconciliation.ts` para asociar cada
  importación curricular a una versión trazable.

### Fase 2 — v1.12.1–1.12.3: ampliación curricular
- Importación de 9 unidades y 62 temas nuevos al currículo (`applyCurriculumImport`
  extendido con `curriculumVersionId`), con `target_mastery_level` y
  `topic_attribute_weight` asignados a cada tema nuevo desde el arranque.

### Fase 3 — v1.13.0–1.13.1: recalibración de XP + atributos académicos
- `xp.ts` convertido a async, leyendo las reglas de XP en vivo (`getResolvedXpRules()`)
  en vez de cachearlas; `CAREER_TOTAL_XP` recalibrado a 112.600 proporcional al
  crecimiento de temas (554/492).
- Purga de 29 filas de `academic_level_history` que eran datos de prueba de
  desarrollo — corregía un bug real: con una fila de nivel 28 falsa presente, un
  usuario real llegando a los niveles 1–27 nunca quedaba registrado.
- `recalculateSubjectCredits()` conectado a `applyCurriculumImport` (antes solo se
  disparaba desde el importador viejo, dejando los créditos desactualizados tras
  cualquier import nuevo).
- Atributos académicos visibles: `attributes.ts` (`computeAttributeScores()`) con
  cobertura reportada explícitamente (temas evaluados vs. clasificados, nunca se
  finge cobertura completa) — nueva pestaña "Atributos" en Trayectoria (radar) y
  widget en el Dashboard.

### Fase 4 — v1.14.0: navegación agrupada + búsqueda global real
- Sidebar reorganizado en 6 grupos temáticos sobre las mismas 13 secciones.
- `globalSearch.ts`: búsqueda real sobre materias y temas (antes la paleta de
  comandos Ctrl+K solo filtraba los ítems de navegación visibles).
- Breadcrumbs en detalle de materia, iniciar sesión y sesión activa.

### Fase 5 — v1.14.1–1.14.2: Ritmo y continuidad
- "Planificación" pasa a ser "Ritmo y continuidad": racha de estudio (actual y más
  larga, mismo cálculo que el heatmap de actividad) y puntos de continuidad —
  este último dato ya se guardaba en cada cierre de sesión pero nunca se mostraba
  en ningún lado.
- Corregido un bug de zona horaria (mismo patrón ya documentado en
  `src/utils/date.ts`): una fecha `YYYY-MM-DD` parseada sin ancla horaria se
  interpretaba como UTC y mostraba un día menos en Argentina (UTC-3).

### Fase 6 — v1.15.0: exportación de contenidos académicos
- `aiContextExport.ts`: exportación en Markdown de todas las sesiones de estudio con
  su evidencia, notas de Obsidian vinculadas y bibliografía de la materia — pensada
  para pegar en herramientas de IA (NotebookLM, ChatGPT) como paquete de contexto.
  El paquete comprimido de portabilidad (base + configuración) queda fuera de esta
  fase, documentado como pendiente.

### Fase 7 — pruebas y reporte final (sin cambios de código)
- Batería completa de regresión (typecheck, lint, tests, `cargo check`/`cargo test`)
  y recorrido en vivo por las 13 secciones y flujos clave vía CDP.
- Panel de Integridad académica y bibliográfica revisado: 0 referencias rotas, 0
  ciclos de dependencia, 0 catálogos duplicados, 0 vínculos huérfanos.
- Hallazgo documentado (no introducido por esta mejora, preexistente desde las fases
  BIB-*): la Biblioteca renderiza, por cada recurso, varios `<select>` de vinculación
  con la lista completa de materias/temas sin virtualizar (~93.000 elementos `<option>`
  para 150 recursos) — no rompe nada hoy, queda pendiente para una fase futura
  dedicada a Biblioteca.

## [1.1.0] — Dashboard, Sesiones, Biblioteca, Documentos y Obsidian

- **Dashboard** (antes "Hoy", ahora en `/dashboard` con redirección desde `/` y `/today`):
  visión general de la carrera — cabecera con etapa/dominio agregado/cobertura, resumen
  semanal/mensual, calendario de actividad (heatmap 30/90/365 días), progreso por
  etapa/pregunta/materia, distribución de niveles de dominio, estadísticas temporales
  (confianza declarada vs. nivel evaluado), estado del sistema y agenda de 7 días.
  Personalización de widgets (orden/visibilidad/rango) persistida. Ya no contiene
  INICIAR ESTUDIO ni gestión de tareas.
- **Sesiones**: absorbe el flujo operativo — próxima sesión con contexto completo,
  programar/reprogramar/cancelar/marcar incompleta, 8 vistas (próxima, programadas, en
  curso, completadas, incompletas, canceladas, historial, calendario). Se puede iniciar
  desde una tarea, un tema, un repaso, un proyecto o libremente.
- **Ícono**: corregido el margen transparente excesivo y el fondo transparente — nuevo
  master a 1024px con símbolo ocupando ~87% del área sobre fondo sólido `#090B0D`,
  regenerado en todos los tamaños (16 a 1024, `.ico`, `.icns`) y en el favicon.
- **Obsidian**:
  - "Abrir en Obsidian" corregido — la causa era un scope de permisos de Tauri que solo
    permitía abrir `http(s)/mailto/tel`, bloqueando `obsidian://` en silencio.
  - Panel de diagnóstico completo (vault, permisos, notas indexadas, última
    sincronización) con botones verificar/abrir/reindexar/elegir vault/abrir carpeta.
  - Sincronización bidireccional: watcher nativo de archivos (Rust, `notify`) con
    debounce, reindexado automático al detectar cambios externos, estado por nota
    (sincronizada/conflicto/no encontrada/…), editor interno con detección de conflicto
    por checksum (nunca sobrescribe un cambio externo sin preguntar).
- **Biblioteca**: importados los 39 recursos de la Base Bibliográfica Inicial
  (`IAC_Compendio_Maestro_v1.0.0.pdf`, páginas 76–80), import idempotente por clave
  área+autor+título normalizada, sin sobrescribir campos ya completados por el usuario.
  Filtros por área/tipo/función/estado/disponibilidad, búsqueda y ficha completa.
- **Documentos**: visor interno de PDF 100% offline (PDF.js, worker empaquetado, sin
  CDN) con zoom, ajuste al ancho, búsqueda de texto, rotación, pantalla completa,
  recordar última página/zoom. Soporte de "documentos virtuales" — varios documentos
  institucionales embebidos como rangos de página dentro de un único Compendio Maestro,
  sin duplicar el archivo físico.
- Migraciones `0002`–`0004` (aditivas, sin pérdida de datos): campos institucionales de
  biblioteca, rangos de página para el visor, estado de sincronización de Obsidian.

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
