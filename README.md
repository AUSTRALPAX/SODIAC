# SODIAC

Sistema operativo académico y centro de estudio del Instituto de Asignación de Capital,
Creación de Valor y Pensamiento Sistémico (IAC). Aplicación de escritorio local-first para
Windows (Tauri 2 + React + TypeScript + SQLite).

Documentación completa en [`docs/`](docs/):
- [PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md) — qué es SODIAC y alcance del MVP.
- [ARCHITECTURE.md](docs/ARCHITECTURE.md) — stack, capas, puerto de desarrollo.
- [DATA_MODEL.md](docs/DATA_MODEL.md) — esquema completo de entidades.
- [DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) — tokens visuales y marca.
- [SECURITY_AND_BACKUPS.md](docs/SECURITY_AND_BACKUPS.md) — persistencia, backups, integridad.
- [ROADMAP.md](docs/ROADMAP.md) — fases de desarrollo.
- [DECISIONS.md](docs/DECISIONS.md) — decisiones de arquitectura y por qué.
- [TRACEABILITY_MATRIX.md](docs/TRACEABILITY_MATRIX.md) — requisito → función → entidad → prueba.
- [MANUAL_DE_USO.md](docs/MANUAL_DE_USO.md) — guía de uso de la aplicación.

## Requisitos

- Node.js 20+ y npm.
- Rust (toolchain estable) vía [rustup](https://rustup.rs).
- En Windows: Visual Studio Build Tools con el workload "Desktop development with C++"
  (necesario para el linker de Rust).

## Desarrollo

```bash
npm install
npm run dev          # solo frontend (Vite) en http://127.0.0.1:53117
npm run tauri dev    # app de escritorio completa
```

El puerto de desarrollo **53117** es fijo (`strictPort: true`). Si está ocupado, la ejecución
se detiene — nunca se elige otro puerto automáticamente.

## Calidad

```bash
npm run lint
npm run typecheck
npm run test
cd src-tauri && cargo check
```

## Instalador de producción

```bash
npm run tauri build
```

Genera el instalador de Windows en `src-tauri/target/release/bundle/`. Ver
`docs/MANUAL_DE_USO.md` para el detalle de instalación y primer uso.

## Estado

Fases 0 a 10 completas (ver `docs/ROADMAP.md` y `CHANGELOG.md`).
