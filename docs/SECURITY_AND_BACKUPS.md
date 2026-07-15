# SODIAC — Seguridad, Persistencia y Backups (Fase 0)

## 1. Ubicación de datos

- Base SQLite principal: directorio de datos de la app provisto por Tauri
  (`app_data_dir()`, típicamente `%APPDATA%\com.sodiac.desktop\`). **Nunca** dentro del repo,
  `src`, `public`, `dist`, ni dentro de la carpeta del vault de Obsidian.
- Vault de Obsidian y carpeta maestra: rutas elegidas por el usuario, referenciadas por path
  absoluto en `UserSetting`, nunca copiadas dentro del repo/app.

## 2. Integridad

- Migraciones versionadas y transaccionales (`migrations/NNNN_*.sql`).
- Claves foráneas activas (`PRAGMA foreign_keys = ON`).
- Escrituras atómicas (transacción por operación de negocio, no por statement suelto).
- Escritura en Obsidian: archivo temporal + rename atómico + backup `.bak` previo si el archivo
  ya existe.
- Comprobación de integridad: `PRAGMA integrity_check` expuesto en Configuración → Estado del
  sistema, y ejecutado automáticamente después de una restauración.

## 3. Backups automáticos

Se crea un `BackupRecord` (copia completa del archivo SQLite + manifiesto):
- antes de cada migración;
- antes de una importación;
- antes de una restauración;
- antes de una operación masiva (ej. reimportar seed institucional);
- al cerrar una sesión de estudio marcada como importante (configurable);
- como máximo un backup automático "diario" adicional si no hubo cambios estructurales ese día.

Retención inicial: 10 backups diarios, 8 semanales, 6 mensuales (rotación FIFO por categoría,
nunca se borra el backup pre-migración más reciente aunque exceda la cuota).

## 4. Exportación

- JSON completo (todas las entidades, con relaciones por id).
- CSV por entidad.
- Markdown para contenidos académicos (sesiones, evidencias, notas).
- Paquete comprimido: base SQLite + `UserSetting` (sin rutas absolutas sensibles si el usuario
  así lo elige) + manifiesto de versión.

## 5. Restauración (flujo obligatorio)

1. Validar el archivo (checksum, versión de esquema compatible).
2. Crear un `BackupRecord` del estado actual antes de tocar nada.
3. Informar explícitamente qué se va a reemplazar (conteo de filas por tabla, fecha del backup a
   restaurar).
4. Restaurar dentro de una transacción.
5. Ejecutar `PRAGMA integrity_check`.
6. Informar resultado claro (éxito/fallo) y, si falló, revertir al backup creado en el paso 2.

Ninguna operación destructiva se ejecuta sin confirmación explícita del usuario que muestre sus
consecuencias (número de registros afectados, reversibilidad).

## 6. Auditoría

Toda operación relevante (crear/editar/archivar entidades académicas, backups, restauraciones,
escrituras en el vault, cambios de configuración sensible) se registra en `ActivityLog` con actor,
payload y timestamp.

## 7. Logging de errores

Log estructurado con rotación (Rust `tracing`), consultable desde Configuración → Estado del
sistema → "logs recientes", sin necesidad de abrir la terminal.
