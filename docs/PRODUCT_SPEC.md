# SODIAC — Especificación de Producto (Fase 0)

Versión: 0.1.0 · Fecha: 2026-07-15
Fuente funcional y académica: `IAC_Compendio_Maestro_v1.0.0.pdf` y `IAC — Hoja de Ruta Académica y Sistema de Estudio v1.0.0.pdf`.

## 1. Qué es SODIAC

SODIAC es la **capa operativa** del Instituto de Asignación de Capital, Creación de Valor y
Pensamiento Sistémico (IAC). Es una aplicación de escritorio local-first para Windows que
orienta el próximo paso de estudio, organiza sesiones, registra progreso, administra repasos,
evidencia, tareas, proyectos, calendario y estadísticas.

SODIAC **no es**:
- un LMS tradicional con currícula cerrada;
- un gestor de tareas genérico;
- un reemplazo de ChatGPT (profesor/tutor/investigador) ni de Obsidian (memoria conceptual).

## 2. Distribución de responsabilidades del ecosistema IAC

| Componente | Rol |
|---|---|
| SODIAC | Orienta, planifica, ejecuta sesiones, registra progreso, repasos, evidencia, tareas, proyectos, calendario, estadísticas |
| ChatGPT | Profesor, mentor socrático, investigador, editor, contraparte crítica |
| Obsidian | Memoria conceptual, notas permanentes, árbol de conocimiento |
| Carpeta maestra | Documentos oficiales, versiones, bibliografía, respaldos |

Principio rector (del Documento Fundacional y la Hoja de Ruta): **el progreso no se concede por
tiempo transcurrido**. Depende de comprensión, aplicación y evidencia.

## 3. Flujo operativo central

```
ORIENTAR → INICIAR → ESTUDIAR → COMPROBAR → FINALIZAR → TEJER → REVISAR → CONTINUAR
```

Este flujo (definido en el Compendio Maestro, ampliación "Flujo de trabajo del IAC") es el eje de
toda decisión funcional de SODIAC. Cada pantalla y cada entidad de datos debe poder explicarse
en términos de a qué paso del flujo sirve.

## 4. Principios de producto (derivados de los documentos fuente)

1. **Dominio antes que calendario.** El nivel de dominio (0–5) sólo sube con evidencia, evaluación
   o justificación explícita — nunca automáticamente al completar una tarea.
2. **Diagnóstico antes que repetición.** No se repiten contenidos ya dominados.
3. **Preguntas antes que materias.** Toda materia se vincula a una Pregunta Fundamental y una
   Competencia.
4. **Aplicación antes que acumulación.** Toda sesión relevante produce evidencia (nota, modelo,
   simulación, decisión, protocolo).
5. **Revisión sin castigo.** Reprogramar o volver a un tema no es un fracaso; se conserva
   historial, nunca se sobrescribe silenciosamente.
6. **Separación de contextos.** Estudio, laboratorio, simulación, cartera real y producción
   editorial se muestran y almacenan de forma distinguible.
7. **Explicabilidad.** Toda recomendación de "próxima acción" debe mostrar sus factores
   (prioridad, dependencia curricular, repaso vencido, dificultad, tiempo disponible, dominio).
8. **Contra la burocracia.** Si el sistema exige más energía que la que ahorra, se simplifica.

## 5. Usuarios

Un único usuario en esta etapa: el fundador del Instituto (primer alumno). No hay
multiusuario, no hay cuentas, no hay red. La app corre 100% local.

## 6. Alcance del MVP

El MVP está completo cuando el usuario puede, sin salir de la app y sin perder datos al cerrar:

1. Instalar SODIAC en Windows y configurarla (elegir vault de Obsidian, carpeta maestra).
2. Ver el dashboard **Hoy** con recomendación explicable de próxima acción.
3. Crear preguntas fundamentales, competencias, materias y temas (o importarlos desde `seed/`).
4. Planificar una sesión (protocolo INICIAR ESTUDIO) y generar el prompt para ChatGPT.
5. Ejecutar una sesión en Modo Sesión con Pomodoro configurable, notas rápidas y checklist.
6. Registrar una comprobación (protocolo COMPROBAR).
7. Finalizar la sesión con el cierre mínimo obligatorio: conclusión + evidencia + próxima acción +
   punto de continuidad (protocolo FINALIZAR ESTUDIO).
8. Crear una evidencia de aprendizaje y asignar un nivel de dominio (0–5) con justificación.
9. Programar un repaso.
10. Abrir la nota correspondiente en Obsidian (`obsidian://`) o generarla desde plantilla.
11. Ver el calendario (día/semana/mes) con sesiones, repasos, tareas y proyectos.
12. Ver progreso básico por pregunta/competencia/materia (sin gamificación punitiva).
13. Cerrar y reabrir la app sin pérdida de información (SQLite persistente).
14. Exportar datos (JSON/CSV/Markdown) y crear/restaurar un backup.

Todo lo que no está en esta lista (Documentos institucionales con versiones completas, motor de
repasos avanzado, React Flow para mapas de relaciones, estadísticas avanzadas, Biblioteca
completa, Proyectos con hitos múltiples) se construye en fases posteriores (ver `ROADMAP.md`),
pero el modelo de datos se diseña para soportarlas desde el inicio (ver `DATA_MODEL.md`).

## 7. No objetivos explícitos (de los documentos fuente)

- SODIAC no ejecuta órdenes financieras ni se conecta a un bróker.
- SODIAC no reemplaza asesoramiento profesional (legal/fiscal/contable).
- SODIAC no corrige intelectualmente el contenido de las sesiones mediante IA en esta versión
  (no hay integración con API de IA que requiera claves; la arquitectura debe permitirlo como
  módulo opcional futuro).
- SODIAC no borra notas de Obsidian en la primera versión (solo lectura/creación/actualización de
  metadatos autorizados, según el modo de permisos elegido).
