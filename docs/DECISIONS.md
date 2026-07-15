# SODIAC — Registro de Decisiones (Fase 0)

Formato: fecha · decisión · motivo · alternativas descartadas.

## 2026-07-15 · Stack Tauri 2 + React + SQLite
Motivo: requisito explícito del usuario (local-first, sin Electron salvo imposibilidad técnica
documentada; no existe tal imposibilidad para este alcance).
Alternativas descartadas: Electron (mayor footprint, no requerido), backend con servidor propio
(rompe el requisito local-first sin red).

## 2026-07-15 · Puerto fijo 53117 en desarrollo
Motivo: requisito explícito, evitar colisión con otros proyectos del usuario que ya usan 5173 y
5199. Se verificó que 53117 está libre en el entorno actual.

## 2026-07-15 · Modelo de dominio 0–5 no automático
Motivo: principio rector de los documentos fuente ("no se avanza porque terminó el mes"; Mapa
Maestro de Competencias, Matriz de Diagnóstico). El nivel de una competencia se deriva del último
`MasteryAssessment` no provisional, nunca de completar una tarea o sesión.

## 2026-07-15 · Módulo de IA diferido con interfaz explícita
Motivo: instrucción directa de no simular funciones inexistentes ni presentar placeholders como
terminados. Se define `AiProvider` como interfaz pendiente y se genera/copia el prompt para
pegarlo manualmente en ChatGPT (protocolo INICIAR ESTUDIO de la Hoja de Ruta, sección 13).

## 2026-07-15 · ObsidianNote como espejo, no fuente de verdad
Motivo: el Documento Fundacional (§14.3) es explícito: Obsidian es el espacio principal de notas;
SODIAC no debe apropiarse del vault ni ser un depósito indiscriminado. La tabla `ObsidianNote`
indexa metadatos para navegación/relación, pero el contenido vive en los archivos `.md`.

## 2026-07-15 · Primera Misión modelada como Project, no como módulo financiero operativo
Motivo: regla explícita — SODIAC no ejecuta órdenes financieras ni se conecta a un bróker
(prompt maestro §16). La Primera Misión (opciones argentinas) se importa como estructura de
`Project` + `ProjectMilestone` de tipo laboratorio/simulación, separada visual y
conceptualmente de una eventual cartera real futura.

## Pendientes de decisión (requieren confirmación del usuario más adelante)
- Nombre y símbolo definitivo de la marca (se implementa un símbolo geométrico provisional).
- Alcance exacto de "GENERAR NOTA OBSIDIAN" automatizado vs. asistido (se define en Fase 6).
- Si se usará `tauri-plugin-sql` oficial o un wrapper propio sobre `rusqlite` (se decide al
  iniciar Fase 1 según madurez del plugin en Tauri 2 al momento de implementar).
