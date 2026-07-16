# SODIAC — Manual de uso

Guía funcional para quien usa la aplicación día a día. Para arquitectura y decisiones técnicas
ver [ARCHITECTURE.md](ARCHITECTURE.md) y [DECISIONS.md](DECISIONS.md).

## Primer uso

Al abrir SODIAC por primera vez, la base de datos está vacía salvo por la estructura
institucional que se importa manualmente. En **Hoy** aparece un aviso de bienvenida mientras no
haya materias cargadas, señalando el camino:

1. Ir a **Configuración**.
2. Usar **Importar estructura institucional** — carga preguntas fundamentales, competencias,
   materias, temas, etapas, el proyecto "Primera Misión: Opciones Argentinas" y los documentos
   institucionales base desde `seed/`. La importación es idempotente: correrla de nuevo no
   duplica datos, solo agrega lo que falte.
3. Opcional: configurar la carpeta de respaldos y, si se usa Obsidian, seleccionar el vault en
   la sección **Obsidian**.

El aviso de bienvenida se puede descartar; no vuelve a aparecer una vez que hay materias
cargadas o se lo descarta explícitamente.

## Hoy

Panel de inicio con la recomendación explicable de próxima acción (por qué se sugiere, no solo
qué hacer), tareas vencidas/de hoy/próximas con alta rápida, y acceso directo a **Iniciar
estudio** o a retomar una sesión interrumpida.

## Modo Sesión (Sesiones)

Protocolo de tres pasos:

1. **Iniciar estudio** — se elige tema/proyecto y tipo de sesión; arranca el temporizador
   (Pomodoro configurable en Configuración).
2. **Comprobar** — punto de control intermedio opcional durante la sesión, sin cerrarla.
3. **Finalizar estudio** — obligatorio completar conclusión, resumen de evidencia, próxima
   acción y punto de continuidad. Al finalizar se genera automáticamente una tarea de
   seguimiento, un punto de continuidad y, si corresponde, una evaluación de dominio y un
   repaso programado.

Si se cierra la app con una sesión abierta, al reabrir se ofrece continuarla o cancelarla — no
se pierde el progreso silenciosamente.

## Mapa (académico)

Vista árbol, tabla y mapa de relaciones (React Flow) de preguntas fundamentales → competencias →
materias → temas, con dependencias curriculares y nivel de dominio (escala 0–5, ver
`DECISIONS.md` — nunca sube automáticamente, solo por evaluación explícita en Finalizar
estudio).

## Planificación

Calendario (día/semana/mes) con tareas, planes diarios/semanales. Reprogramar una tarea no borra
el historial: cada cambio de fecha queda registrado y consultable.

## Repasos

Cola de repasos con estado derivado de la fecha (vencido/próximo/sin programar) y la razón por
la que se sugiere cada uno. Acciones: completar, posponer, marcar innecesario, dejar enfriar, o
reactivar desde el historial.

## Proyectos

Alta de proyectos (tipo + contexto: estudio, laboratorio, simulación, cartera real, producción
editorial) con hitos. Incluye como dato importado la "Primera Misión: Opciones Argentinas" —
una estructura de proyecto/simulación, no una operación financiera real ni asesoramiento de
inversión.

## Biblioteca

Recursos bibliográficos con estado de lectura (pendiente/en curso/leído) y vinculación opcional
a proyectos.

## Estadísticas

Actividad de sesiones de los últimos 14 días, evolución del nivel de dominio promedio,
distribución de bloques de sesión (comprensión/aplicación/consolidación) y materias con menor
cobertura evaluada. El tiempo estudiado es deliberadamente secundario: la métrica central es la
continuidad, no la gamificación.

## Documentos

Documentos institucionales con historial completo de versiones. Publicar una nueva versión
preserva la anterior (queda marcada "reemplazada", nunca se borra) y permite comparar metadatos
entre dos versiones.

## Obsidian

Integración opcional de solo lectura, creación o actualización de metadatos (según el permiso
elegido) con un vault existente. Indexa notas, extrae frontmatter y wikilinks, y permite crear
notas desde plantilla con escritura atómica (nunca sobrescribe sin respaldo `.bak`, nunca borra).

## Configuración

Importación de estructura institucional, ruta de respaldos y retención, parámetros de Pomodoro,
configuración del vault de Obsidian, y estado del sistema (integridad de la base, último
respaldo).

## Respaldos y seguridad

Ver [SECURITY_AND_BACKUPS.md](SECURITY_AND_BACKUPS.md). En resumen: respaldos con checksum
SHA-256, rotación por retención configurable, respaldo previo automático antes de operaciones
riesgosas (import, restore), y verificación de integridad vía `PRAGMA integrity_check`.

## Accesibilidad

- Navegación completa por teclado; paleta de comandos con `Ctrl+K` / `Cmd+K` para saltar a
  cualquier sección.
- Foco siempre visible, respeta `prefers-reduced-motion`.
- Ningún estado se comunica solo por color: siempre hay texto o ícono que lo acompaña.
- Ventana soportada desde 1280×720 en adelante, redimensionable.

## Instalación (build de producción)

```bash
npm run tauri build
```

Genera el instalador de Windows (MSI/NSIS según `src-tauri/tauri.conf.json`) en
`src-tauri/target/release/bundle/`. El identificador de la app es `com.sodiac.desktop`; los
datos (`sodiac.db` y respaldos) viven en la carpeta de datos de la aplicación del usuario, no en
la carpeta de instalación.
