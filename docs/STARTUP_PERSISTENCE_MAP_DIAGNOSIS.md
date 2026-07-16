# Diagnóstico: ejecutable instalado, persistencia y completitud del mapa

Fecha: 2026-07-16. Rama: `fix/installed-app-persistence-and-complete-map`.
**Este documento es solo diagnóstico — no se aplicó ningún cambio de código
ni de datos todavía.** Corresponde a los puntos 1-4 y 13-14 del pedido del
usuario; las secciones de corrección (persistencia, autoguardado, instancia
única, rediseño del mapa) quedan para la siguiente etapa, una vez aprobado
este diagnóstico.

## 1. Qué abre el acceso — resultado

**Único acceso encontrado en todo el sistema**: `SODIAC.lnk` en el Menú
Inicio (`C:\Users\admin\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\SODIAC.lnk`).
No se encontró ningún acceso en el Escritorio, en `C:\Users\Public\Desktop`,
ni un `.lnk` separado en la carpeta clásica de anclados a la barra de tareas
— en Windows 11 el ícono anclado a la barra de tareas normalmente referencia
este mismo acceso del Menú Inicio, no un archivo aparte.

Propiedades resueltas del acceso (vía COM `WScript.Shell`):

| Campo | Valor |
|---|---|
| TargetPath | `C:\Users\admin\AppData\Local\SODIAC\app.exe` |
| Arguments | (ninguno) |
| WorkingDirectory | `C:\Users\admin\AppData\Local\SODIAC` |
| IconLocation | `,0` (ícono embebido del propio exe) |

**"Este acceso abre: `C:\Users\admin\AppData\Local\SODIAC\app.exe`"**
**"Esta base de datos utiliza: `C:\Users\admin\AppData\Roaming\com.sodiac.desktop\sodiac.db`"**

No se encontró ningún `.bat`, `.cmd`, ni acceso que invoque `npm`, `cargo`,
`Vite` o `cmd.exe`/PowerShell. El acceso apunta directamente al ejecutable
release instalado — **no hay ninguna dependencia del entorno de desarrollo
en el punto de entrada del usuario.**

### El problema real no es el acceso — es que el ejecutable al que apunta está desactualizado

| Ejecutable | Ruta | Tamaño | Última escritura | SHA-256 |
|---|---|---|---|---|
| Instalado (el que abre el acceso) | `AppData\Local\SODIAC\app.exe` | 16.124.928 B | 16/7 03:52:02 | `9EFACFA9…9BABF` |
| `target\release\app.exe` actual del repo | `src-tauri\target\release\app.exe` | 16.124.928 B | 16/7 03:52:16 | `83E1260…C38B2E` |
| `target\debug\app.exe` (dev, en uso ahora) | `src-tauri\target\debug\app.exe` | 20.472.832 B | 16/7 13:14:17 | `FD80009…9AAA6` |

Los tres reportan **"1.2.0"** como `FileVersion`/`ProductVersion` — el número
de versión nunca se incrementó durante todo el trabajo de hoy (Fases A-G:
motor de XP, sección Carrera, importador de currículo, Mapa rediseñado,
presupuesto de XP dinámico, tarjeta de Trayectoria, etc.), así que **no hay
forma de distinguir "cuál build es cuál" mirando la versión — solo por
hash.** El ejecutable instalado y el `target/release` actual tienen hashes
distintos: el instalado es una build de **antes** de todo el trabajo de
hoy. Por eso al abrir SODIAC desde el Menú Inicio/barra de tareas se ve una
"versión antigua" — no porque haya datos viejos (ver sección 4), sino
porque el código instalado directamente no tiene Carrera, el Mapa nuevo, la
tarjeta de Trayectoria del Dashboard, ni el presupuesto de XP dinámico.

**Hallazgo adicional, reproducido en vivo durante este diagnóstico**: al
revisar los procesos en ejecución había **tres instancias simultáneas**
de `AppData\Local\SODIAC\app.exe` corriendo a la vez (PIDs 20436, 19096,
11600), las tres hijas directas de `explorer.exe` (o sea, lanzadas por
clics reales, no por este proceso de diagnóstico), iniciadas con segundos
de diferencia. **Confirma en vivo que hoy no existe ningún mecanismo de
instancia única** — cada clic abre una ventana nueva en vez de enfocar la
existente (pedido explícito en la sección 9 del usuario).

## 2. Identificador — resultado

`identifier` en `tauri.conf.json`, `name` en `Cargo.toml` (paquete `app`,
que es lo que determina `app.exe`) y `name`/`version` en `package.json`
están **consistentes hoy**: `com.sodiac.desktop`, versión `1.2.0` en los
tres. La entrada de desinstalación en el registro de Windows
(`HKCU\...\Uninstall\SODIAC`) también reporta `DisplayVersion: 1.2.0` y una
única instalación registrada — no hay instalaciones duplicadas ni
identificadores antiguos en conflicto. No se requiere ninguna migración de
identificador; **no hay que cambiar `com.sodiac.desktop`.**

No se encontró ninguna carpeta SODIAC en `Program Files` ni
`Program Files (x86)` — la instalación NSIS es por-usuario bajo
`AppData\Local\SODIAC`, comportamiento esperado y correcto para este tipo
de instalador.

## 3. Bases de datos — resultado (el hallazgo más importante de este diagnóstico)

Se encontraron dos rutas con archivo `sodiac.db`:

1. `C:\Users\admin\AppData\Roaming\com.sodiac.desktop\sodiac.db` (la ruta
   estándar de Windows para `%APPDATA%`, la que usa Tauri normalmente).
2. `C:\Users\admin\AppData\Local\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\com.sodiac.desktop\sodiac.db`
   (dentro de la carpeta de datos empaquetados de este propio entorno de
   Claude Code).

**Verificación exhaustiva antes de sacar ninguna conclusión** (siguiendo el
protocolo de "no elegir ni combinar bases silenciosamente"):

- Tamaño y fecha de modificación: idénticos en ambas rutas (4.255.744
  bytes, mismo segundo).
- `fsutil hardlink list` sobre la ruta (1) revela que su único hardlink es
  exactamente la ruta (2).
- `fsutil file queryFileID` sobre ambas rutas devuelve el **mismo File ID
  de NTFS** (`0x...163fb0`).
- SHA-256 del archivo principal y de su `.db-wal` coinciden byte a byte
  entre ambas copias.

**Conclusión verificada, no una suposición: son el mismo archivo físico en
disco, enlazado por un hardlink de NTFS — no son dos bases de datos
separadas, no hay divergencia de datos entre ellas.** Esto es un mecanismo
de compatibilidad de Windows para procesos empaquetados que acceden a
`%APPDATA%` clásico, no un error de SODIAC. Lo documento porque el pedido
exige registrar toda base encontrada, pero **no representa un riesgo ni
requiere fusión ni migración.**

No se encontraron más copias de `sodiac.db` en Desktop, Documents, el
repositorio (`src`, `dist`, `target`, etc.), ni en ninguna otra ubicación
del perfil del usuario.

### Estado de la base real (única)

| Campo | Valor |
|---|---|
| Ruta canónica | `C:\Users\admin\AppData\Roaming\com.sodiac.desktop\sodiac.db` |
| Tamaño | 4.255.744 bytes |
| Última escritura | 16/7/2026 14:49:57 |
| Última migración aplicada | versión 10 (`resource_usage`) |
| Integridad (`PRAGMA integrity_check`) | `ok` |
| Preguntas fundamentales | 6 |
| Competencias | 84 |
| Materias | 9 |
| Temas | 43 |
| Unidades curriculares | 0 |
| Notas de Obsidian indexadas | 626 |
| Recursos de bibliografía | 40 |
| Vínculos bibliográficos (`bibliographic_source`) | 1 |
| Proyectos | 2 |
| Sesiones de estudio | 2 |
| Eventos de XP | 0 |
| Configuraciones (`user_setting`) | 3 |

No se encontraron entidades huérfanas: 0 competencias sin pregunta
fundamental válida, 0 materias sin pregunta fundamental válida, 0 temas sin
materia válida, 0 temas con `competency_id` apuntando a una competencia
inexistente. Las 43 filas de `topic` y las 9 de `subject` no tienen ninguna
fila archivada (`archived_at IS NULL` en el 100%), así que ningún filtro de
"solo activos" está ocultando nada hoy.

### Backups

- Ya existían 11 backups previos en `...\com.sodiac.desktop\backups\`
  (de las fases anteriores de este mismo proyecto), más una carpeta
  `forensics-empty-db\` que preserva una base vacía de un incidente
  anterior ya resuelto (no es la base activa).
- Se creó un backup nuevo y verificable de la base actual:
  `sodiac-pre_migracion-2026-07-16T18-20-35-017Z.db`
  (SHA-256 `7da4ff0d19816a887745ce0fc6d7eea8f6e07e3a5dfe302db4cbb6cffca44893`).
- **Prueba de restauración realizada**: se restauró el backup previo más
  reciente (`sodiac-pre_migracion-2026-07-16T17-29-40-004Z.db`) sobre una
  copia **temporal** (nunca sobre la base real) y se verificó: integridad
  `ok`, 10 migraciones, 9 materias, 0 eventos de XP — la restauración
  funciona correctamente.

**Con esto se cumple el requisito de "no continuar con migraciones hasta
confirmar que existe un backup restaurable."**

## 4. Diagnóstico de completitud del mapa (secciones 13-14 del pedido)

Antes de tocar el diseño del Mapa, se determinó si el problema está en los
datos, las consultas, las relaciones, el layout, los filtros o la
representación visual (opciones A-F del pedido).

**Se revisó el código actual** (`src/features/curriculum/useCurriculumData.ts`,
`RelationsView.tsx`, `mapLayout.ts`) y se confirmó: no hay ningún `LIMIT`,
ninguna paginación, ningún `INNER JOIN` que descarte entidades sin
relación, ningún filtro que excluya temas sin nota/proyecto/XP. Todas las
consultas usan `WHERE archived_at IS NULL` y, como se vio arriba, esa
condición no excluye ninguna fila hoy (0 archivadas). **El código del mapa
ya trae y dibuja el 100% de lo que hay en SQLite.**

Tabla comparativa (Entidad | En SQLite | En consulta/mapa | Diferencia):

| Entidad | En SQLite | En la consulta del mapa | Diferencia |
|---|---|---|---|
| Preguntas fundamentales | 6 | 6 | 0 |
| Competencias | 84 | 84 | 0 |
| Materias | 9 | 9 | 0 |
| Unidades curriculares | 0 | 0 | 0 |
| Temas | 43 | 43 | 0 |
| Proyectos | 2 | 2 | 0 |

**Conclusión: el problema no está en el mapa ni en sus consultas — está en
que a los datos todavía les faltan relaciones cargadas:**

- **0 de 43 temas** tienen una competencia asignada (`topic.competency_id`
  vacío en el 100% de los casos) — por eso el Mapa y la Malla curricular no
  muestran "competencia principal" en ninguna materia.
- **0 unidades curriculares** existen todavía — nadie importó el currículo
  completo con unidades (la Fase D de este proyecto construyó el
  importador, pero no se ejecutó contra el documento real de ~30 materias
  todavía).
- **Solo 1 vínculo bibliográfico** (`bibliographic_source`) existe pese a
  haber 40 recursos y 43 temas — casi ninguna bibliografía está conectada a
  un tema o materia específica.
- **0 de 626 notas de Obsidian** están vinculadas a ninguna entidad
  académica (`sodiac_id` vacío en el 100% de las notas indexadas). El vault
  tiene 626 notas reales, pero SODIAC no sabe a qué pregunta/materia/tema
  corresponde ninguna.
- **0 relaciones de prerrequisito** (`curriculum_dependency`) definidas.

Es decir: **si el Mapa "se ve incompleto" hoy, es porque genuinamente hay
pocas relaciones cargadas — no porque el código esconda nada.** Antes de
rediseñar el layout/colores del Mapa (que sigue siendo válido y ya
verificado en la Fase F), lo que realmente movería la aguja es cargar esas
relaciones faltantes (vincular temas a competencias, importar el currículo
completo con unidades, vincular bibliografía y notas de Obsidian a temas
específicos) — y eso requiere el documento curricular completo o que el
usuario vincule manualmente desde Carrera/Biblioteca/Obsidian.

## Resumen para decidir cómo seguir

Lo verificado hoy, en una frase cada uno:

1. El acceso del Menú Inicio apunta directamente al ejecutable release
   instalado — sin CMD, sin dependencia de desarrollo — pero ese
   ejecutable es una build vieja de antes de las Fases A-G de hoy.
2. El identificador (`com.sodiac.desktop`) es consistente en todo el
   proyecto y no requiere ningún cambio.
3. Existe una única base de datos real; las dos rutas encontradas son el
   mismo archivo (hardlink de Windows), no hay divergencia de datos.
4. La base tiene sus 10 migraciones aplicadas, integridad `ok`, backup
   fresco creado y restauración probada exitosamente sobre una copia
   temporal.
5. Se reprodujo en vivo el problema de instancias múltiples (3 ventanas
   simultáneas) — confirma que falta el plugin de instancia única.
6. El Mapa y sus consultas están completos y correctos; lo que falta es
   que los datos tengan más relaciones cargadas (competencias por tema,
   unidades curriculares, bibliografía y notas vinculadas).

**No se implementó todavía ninguna corrección** (autoguardado,
recuperación de sesión, instancia única, nuevo build/instalador, ni cambios
al Mapa) — quedan para la siguiente etapa, según lo pedido explícitamente.
