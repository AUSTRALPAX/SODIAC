# Auditoría — Cronograma Maestro y reconstrucción del Mapa académico

Fecha: 2026-07-16
Rama: `fix/installed-app-persistence-and-complete-map`
Alcance: solo diagnóstico. No se modificó ninguna tabla, migración, ni el
código del Mapa. Backup verificable creado antes de esta auditoría (ver
§0).

## 0. Backup verificable

- Copia de `sodiac.db` (+ `-wal`/`-shm`) tomada antes de esta auditoría.
- SHA-256 del `.db`: `EF04DA41A07B897D2C3EA213C6C3548A0FE4406BBD9B85D86DDE79038ADDAFB6`.
- Restauración probada sobre una copia temporal: `PRAGMA integrity_check` →
  `ok`; conteos base verificados (ver §1).

## 1. Conteos SQLite (estado real actual)

| Tabla | Filas | Activos (`archived_at IS NULL`) |
|---|---:|---:|
| `fundamental_question` | 6 | 6 |
| `competency` | 84 | 84 |
| `subject` | 9 | 9 |
| `curriculum_unit` | 0 | 0 |
| `topic` | 43 | 43 |
| `obsidian_note` | 626 | — |
| `project` | 2 | 2 |
| `resource` | 40 | — |
| `bibliographic_source` | 1 | — |
| `note_link` | 3417 | — |

Relaciones pobladas:

- `topic.curriculum_unit_id` seteado: **0 de 43**.
- `topic.competency_id` seteado: **0 de 43**.
- `subject.fundamental_question_id` seteado: **9 de 9** (completo).
- `competency.fundamental_question_id` seteado: **78 de 84** (6 sin pregunta).
- `obsidian_note.sodiac_id` seteado: **0 de 626**.
- `bibliographic_source` (vínculo recurso↔entidad académica): **1 de 40 `resource`**.

Migraciones aplicadas: 1 a 10, sin pendientes (`_sqlx_migrations`).

## 2. Conteos del vault de Obsidian (fuente real de la carrera)

Vault: `D:\admin\Documentos\...\IAC` — **626 archivos `.md`**, coincide
exactamente con `obsidian_note` (el índice está completo y sincronizado).

Por `tipo`/`type` de frontmatter (los relevantes para la carrera):

| Tipo (vault) | Cantidad | IDs |
|---|---:|---|
| `pregunta-fundamental` | 6 | PF-01 … PF-06 |
| `competencia` | 10 | COMP-01 … COMP-10 |
| `materia` | 30 | MAT-01 … MAT-30 |
| `tema` | 449 | T-XX.YY (dentro de cada materia) |
| `recurso` (bibliografía) | 69 | BIB-001 … BIB-069 |
| `ruta` | 7 | RUTA-00 … RUTA-06 |
| `laboratorio` | 8 | — |
| `empresa` / `país` / `instrumento` | 3 / 2 / 2 | estudios de caso, sin tabla propia |
| resto (plantillas, guías, gobierno del vault, etc.) | ~33 | no académicos |

Cada nota `tema` trae explícitamente `materia: "MAT-XX"`,
`preguntas: [PF-XX, …]` y `competencias: [COMP-XX, …]` en su frontmatter
— es decir, **la relación completa ya existe, con IDs explícitos**, no
hace falta inferirla por nombre de archivo.

Cada nota `ruta` agrupa varias `materias` en pistas temáticas
**superpuestas** (p. ej. MAT-08 aparece en RUTA-01 y RUTA-04): no
constituyen una secuencia lineal única, sino recorridos temáticos
alternativos. No existe en el vault un campo de secuencia global
(`sequenceOrder`) — el orden implícito es: número de `RUTA-XX`, número de
`MAT-XX` dentro de la ruta, y sufijo `T-XX.YY` dentro de cada materia.

Dato importante: **el pipeline de indexación de Obsidian (Fase 6) ya
parsea correctamente todo esto** — `obsidian_note.note_type` y
`obsidian_note.frontmatter_json` en SQLite reproducen exactamente esta
clasificación (449 `tema`, 69 `recurso`, 30 `materia`, 10 `competencia`,
etc.). El problema no es de indexación; es que esos datos nunca se
promovieron a las tablas de Carrera (`subject`, `topic`, `competency`,
`curriculum_unit`).

## 3. Conteos enviados actualmente al Mapa

`useCurriculumData.ts` consulta, sin `LIMIT` ni filtros que excluyan
filas, únicamente: `fundamental_question`, `competency`, `subject`,
`curriculum_unit`, `topic`, `project` (todas con `archived_at IS NULL`).
Confirmado además que el repositorio genérico (`src/database/repository.ts:17`)
no aplica ningún límite de página en `list()`.

`RelationsView.tsx` dibuja como nodos solo los tipos listados en
`RENDERED_TYPES` (`mapTypeColors.ts`): `fundamental_question`,
`competency`, `subject`, `curriculum_unit`, `topic`, `project`.
**`obsidian_note` y `resource` están en la paleta de colores pero nunca
se agregan como nodo** — es una omisión de alcance explícita del
rediseño anterior (Fase F), no un bug oculto.

## 4. Tabla comparativa

| Tipo de entidad | SQLite | Obsidian (vault real) | Consulta del mapa | Nodos renderizados hoy | Diferencia / causa |
|---|---:|---:|---|---:|---|
| Preguntas fundamentales | 6 | 6 | trae 6/6 | 6 | Coinciden en cantidad. Los códigos difieren en formato (`PF1` en SQLite vs `PF-01` en el vault) — hace falta un mapeo explícito, no por nombre. |
| Competencias | 84 | 10 | trae 84/84 | 84 | **Son dos taxonomías distintas.** SQLite `competency` son micro-objetivos de aprendizaje (códigos `A5.1`, `E2.1`, `F0.1`…) de una fase anterior del proyecto; el vault `COMP-01..10` son competencias de alto nivel. No se pueden fusionar por nombre — requiere una decisión de reconciliación (ver §5). |
| Materias | 9 | 30 | trae 9/9 | 9 | SQLite solo tiene la muestra de prueba cargada en la Fase D (`curriculumImport` fixture). Faltan **21 materias reales** (MAT-01..30) que ya existen, completas, en el vault. |
| Unidades curriculares | 0 | 0 | trae 0/0 | 0 | Ninguna de las dos fuentes tiene esta capa poblada. El vault no usa "unidad" como tipo intermedio entre materia y tema — su jerarquía real es Materia → Tema directamente. |
| Temas | 43 | 449 | trae 43/43 | 43 | SQLite tiene ~10 % de los temas reales. **406 temas existen en el vault, con relaciones completas a materia/pregunta/competencia, y nunca se importaron.** Esta es la causa principal de "el mapa no muestra todos los temas". |
| Notas de Obsidian | 626 (indexadas) | 626 (archivos) | no se consulta desde el mapa | 0 | El índice está perfecto y sincronizado, pero el Mapa nunca agrega `obsidian_note` como nodo (`RENDERED_TYPES` la excluye). |
| Bibliografía | 40 `resource` / 1 vínculo | 69 `BIB-XXX` | no se consulta desde el mapa | 0 | `resource` viene de una importación bibliográfica anterior (v1.1.0, "Base Bibliográfica Inicial"), no de las fichas `BIB-*` del vault — son catálogos parcialmente distintos. Tampoco se renderiza como nodo. |
| Proyectos | 2 | sin tipo propio (mezclado en `empresa`/laboratorios) | trae 2/2 | 2 | Cobertura baja en ambos lados; no es prioritario para esta corrección. |
| Rutas / secuencia | no existe tabla | 7 (`RUTA-00..06`, superpuestas) | n/a | n/a | No hay `sequenceOrder` ni tabla de dependencias en SQLite. El vault tampoco define una única secuencia lineal — son pistas temáticas parcialmente superpuestas. El Cronograma Maestro necesita definir su propio criterio de orden (ver §6). |

## 5. Conflicto a resolver antes de importar: "competencia" tiene dos significados

- **SQLite `competency`** (84 filas): micro-objetivos de evaluación,
  códigos tipo `A5.1`/`E2.1`/`F0.1`, creados en una fase anterior
  (rúbricas/evaluación) — están vinculados a `fundamental_question` y se
  usan hoy en el sistema de dominio/evaluación.
- **Vault `competencia`** (10 notas `COMP-01..10`): competencias de alto
  nivel del currículo real, referenciadas por cada `materia` y cada
  `tema`.

**No se pueden fusionar automáticamente.** Antes de cualquier
importación hay que decidir: ¿el `competency` de SQLite pasa a ser una
tabla de "objetivos" subordinada a las 10 competencias del vault (nueva
relación `competency.parent_competency_id` o similar), o son sistemas
paralelos que deben convivir con nombres distintos? Esto se resuelve en
la fase de diseño de la importación, no en este diagnóstico.

## 6. Causa exacta de "el mapa no muestra todos los temas" (conclusión)

No es un bug de consulta, de paginación, de `INNER JOIN`, de caché ni de
capas de ReactFlow. Se descartó cada una de las causas típicas
(`LIMIT` oculto, paginación, `DISTINCT`, IDs duplicados, memoización)
revisando el código real:

1. El repositorio genérico no pagina (`repository.ts:17`).
2. `useCurriculumData.ts` no filtra por estado/progreso, solo por
   `archived_at IS NULL`.
3. `buildGraph()` en `RelationsView.tsx` no descarta materias/temas por
   falta de relaciones — sí excluye por diseño `obsidian_note` y
   `resource` del renderizado (documentado en el propio código,
   `mapTypeColors.ts`).
4. No hay IDs duplicados en ninguna tabla de Carrera.

**La causa real es que SQLite contiene solo una muestra de prueba (9
materias, 43 temas) cargada en la Fase D, mientras que el currículo
completo y real (30 materias, 449 temas, con relaciones explícitas a
preguntas y competencias) existe íntegro en el vault de Obsidian y ya
está indexado en `obsidian_note.frontmatter_json` — pero nunca fue
promovido a las tablas de Carrera.** Corregir el Mapa sin antes
completar esta importación solo estaría redecorando una jerarquía
incompleta.

## 7. Lo que esto implica para las próximas fases (no ejecutado todavía)

1. **Importación reconciliada Obsidian → Carrera**, leyendo
   `obsidian_note.frontmatter_json` (ya parseado, no hace falta volver a
   escanear el filesystem) — con asistente de revisión antes de escribir
   nada (sección 22 del pedido original), priorizando `sodiac_id` /
   IDs explícitos del frontmatter (`MAT-XX`, `T-XX.YY`, `COMP-XX`,
   `PF-XX`) sobre nombre de archivo.
2. **Resolver el conflicto de "competencia"** (§5) antes de escribir
   cualquier fila nueva en `competency`.
3. Recién con datos reales completos tiene sentido reconstruir el Mapa
   (columnas por tipo, ELK/dagre horizontal, expansión progresiva) y
   construir el Cronograma Maestro sobre `sequenceOrder` — layout y
   cronograma serían prematuros sobre datos de prueba.

## 8. Qué NO se tocó en esta auditoría

- Ninguna migración.
- Ninguna fila de `subject`, `topic`, `competency`, `curriculum_unit`,
  `obsidian_note`.
- Ningún archivo del vault.
- El código del Mapa (`RelationsView.tsx`, `useCurriculumData.ts`,
  `mapLayout.ts`, `mapTypeColors.ts`) — solo se leyó, no se modificó.
