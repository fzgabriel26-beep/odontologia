# apps/desktop — Aplicación de escritorio (Tauri)

Esta app **empaqueta `apps/web`** y consume el mismo backend (`apps/api`).
No contiene lógica de negocio propia (SDD §2.1, restricción: no duplicar lógica
para web y escritorio).

## Estado

- **Fase 0 (actual):** placeholder del monorepo.
- **Fase 11:** se creará el scaffold de Tauri (`pnpm create tauri-app`) apuntando a
  `apps/web` como frontend, con:
  - login y todas las funcionalidades autorizadas,
  - impresión y generación de PDF (mismo endpoint que la web, ADR-004),
  - gestión de archivos (mismo backend).

## Requisitos (para la fase 11)

- Rust toolchain (`rustup`)
- Visual Studio C++ Build Tools (Windows)
