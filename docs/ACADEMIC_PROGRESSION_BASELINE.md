# SODIAC — Estado base antes de la actualización de progresión académica

Registrado antes de tocar código. Rama: `feat/academic-progression-and-windows-release`.

## 1. Verificación previa

- `npm run lint` / `npm run typecheck` / `npm run test` (4/4) / `cargo check` — todos en verde.
- Backup verificable creado con el propio servicio de la app (no un script nuevo):
  `createBackup("pre_migracion")` invocado sobre la app real corriendo (vía CDP):
  - Archivo: `C:\Users\admin\AppData\Roaming\com.sodiac.desktop\backups\sodiac-pre_migracion-2026-07-16T05-45-58-721Z.db`
  - `PRAGMA integrity_check` → `ok`.
- Base de datos real en uso: `C:\Users\admin\AppData\Roaming\com.sodiac.desktop\sodiac.db` (WAL).
- Ejecutable que el proceso de desarrollo usa actualmente: `target/debug/app.exe`, lanzado vía
  `npm run tauri dev` (Vite en 127.0.0.1:53117 + Cargo). Este es el proceso con el que se viene
  verificando toda la sesión vía CDP (`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222`).

## 2. Diagnóstico de la ventana CMD

`src-tauri/src/main.rs` **ya tiene** el atributo correcto:

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
```

Esto significa que los builds **release** ya no deberían abrir consola. La ventana CMD que el
usuario ve casi con certeza proviene de estar ejecutando la app en modo desarrollo (`npm run
tauri dev`, que sí abre una consola porque invoca Node/Cargo) o el binario de `target/debug/`
directamente, no el instalador. Se verificará explícitamente contra el `.exe` instalado por el
NSIS generado (ver más abajo) antes de dar el tema por cerrado.

## 3. Diagnóstico del instalador y acceso directo

El script NSIS generado en el build anterior (`target/release/nsis/x64/installer.nsi`, producido
por `npm run tauri build` en la sesión previa) **ya incluye** lógica de acceso directo de
escritorio soportada oficialmente por Tauri (no requiere hook custom):

- `MAINBINARYNAME = "app"` (nombre real del ejecutable instalado, viene del nombre del paquete
  Cargo — el `productName` "SODIAC" solo se usa para el `.lnk` y metadatos, no renombra el .exe).
- La página final del instalador (MUI2 "finish page") reutiliza el botón "Show Readme" como
  botón "Crear acceso directo de escritorio" (`MUI_FINISHPAGE_SHOWREADME_FUNCTION
  CreateOrUpdateDesktopShortcut`), texto `$(createDesktop)`.
- Para instaladores silenciosos/pasivos crea el acceso directo automáticamente
  (`$PassiveMode = 1 OR ${Silent}`).
- `CreateShortcut "$DESKTOP\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"` — es decir,
  el acceso directo se llama `SODIAC.lnk` (usa `PRODUCTNAME`) y apunta directo al ejecutable
  instalado (`app.exe`), nunca a npm/cmd/powershell/cargo. El ícono del acceso directo es el del
  propio `.exe`, que a su vez viene de `bundle.icon` en `tauri.conf.json`.

Conclusión: el mecanismo de acceso directo de escritorio ya es correcto y no necesita un hook
NSIS personalizado. Lo que se verificará y corregirá en esta actualización es el **ícono real**
empaquetado en ese `.exe`/`.ico` (sección de íconos) y confirmar con una instalación real que
el acceso directo abre la app sin ventana de consola.

## 4. Esquema actual relevante

- `subject` (migración 0001): `id, fundamental_question_id, title, description, status,
  sort_order, notes, tags, created_at, updated_at, archived_at` — **no tiene** créditos,
  complejidad, importancia, carga estimada ni experiencia presupuestada todavía. Se necesita
  una migración aditiva.
- `mastery_assessment`: ya tiene `level (0-5)`, `declared_confidence`, `perceived_difficulty`,
  `is_provisional`, `evaluator`. Es la base de "dominio" — el nuevo sistema de calificaciones
  (0-100) es una capa complementaria, no un reemplazo: dominio sigue siendo la competencia
  evaluada en la escala 0-5 vigente; la calificación 0-100 vive en las nuevas entidades de
  evaluación académica (`AcademicEvaluation` etc.), vinculada a un trabajo entregado concreto,
  no a la competencia en sí.
- `learning_evidence`: evidencia de aprendizaje ligada a sesión/proyecto — reutilizable como
  "trabajo entregado" para el expediente académico en vez de duplicar una tabla de archivos.
- Repos existentes en `src/database/entities/index.ts`: patrón `createRepository<T>("table")`
  genérico con auditoría automática — se reutiliza para todas las entidades nuevas.
- `src/services/dashboard.ts` / `DashboardPage.tsx` (v1.1.0): cabecera con gradiente azul/púrpura
  ya construida en la Fase anterior — el problema de superposición/corte reportado ahora se
  corrige aquí mismo (min-height insuficiente, controles de rango pegados al título).
- `src/components/brand/SodiacLogo.tsx`: variante `horizontal` compone símbolo + wordmark como
  un único SVG con texto SVG embebido (viewBox fijo 470×160, `letterSpacing={10}` sobre
  `fontSize={64}` ⇒ ~0.156em efectivo, por debajo del 0.18–0.24em pedido) — de ahí la sensación
  de poca presencia/desbalance reportada. La solución no es ajustar la escala del SVG sino
  separar símbolo y wordmark como hijos flex reales (símbolo SVG + `<span>` HTML con
  Space Grotesk), ya que un SVG con texto embebido no puede centrarse ópticamente con
  `justify-content: center` de forma confiable cuando el ancho del texto varía.
- Ícono: origen real ya corregido en la actualización v1.1.0 (`src/assets/brand/
  sodiac-app-icon-master` conceptual, generado como `app-icon-1024.png`, 87% de superficie,
  fondo `#090B0D`). Esta actualización pide subir a ~88% y renombrar/confirmar el archivo
  maestro en `src-tauri/icons/` con el nombre exacto pedido
  (`sodiac-app-icon-master.png`), y volver a correr `npx tauri icon` para regenerar todos los
  tamaños, más un clean build y bump de versión para forzar la invalidación de caché de Windows.

## 5. Bloqueo / alcance

Esta actualización es extremadamente extensa (sistema de rúbricas versionadas, paquetes de
evaluación con Zod, doble evaluación/calibración, XP inmutable con 100.000 XP distribuidos,
niveles 0–100 con curva no lineal, 15 rangos editables, módulo Trayectoria con 7 vistas,
expediente exportable en 4 formatos, más las correcciones de Windows). Se aborda de forma
incremental: primero las correcciones acotadas de Windows/diseño (rápidas, verificables), luego
el modelo de datos académico completo, luego XP/niveles/rangos, luego Trayectoria y rúbricas,
con checkpoints intermedios en vez de un único commit gigante al final.
