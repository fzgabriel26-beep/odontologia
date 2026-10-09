# apps/desktop — Aplicación de escritorio (Tauri)

Esta app **empaqueta `apps/web`** como bundle estático y consume el mismo backend
(`apps/api`). No contiene lógica de negocio propia (SDD §2.1, ADR-015).

## Estado

- **Fase 11 (actual): scaffold + release verificados.** `src-tauri/` con
  `tauri.conf.json`, ventana 1440×900 (mín. 1024×700), CSP, capabilities
  (`core:default`) e íconos generados desde `app-icon.png`.
- **Build release:** `tauri:build` genera `odontologia-desktop.exe` +
  instalador NSIS (`target/release/bundle/nsis/`).
- **E2E real en WebView2 (verde):** bundle estático → login con cookie
  `SameSite=None` → sesión → listado → ficha por query param → logout →
  consola sin errores (CSP/CORS limpios).

## Cómo correr

```bash
# Desarrollo (levanta apps/web en :3000 si nadie lo está sirviendo)
pnpm --filter @odonto/desktop tauri:dev

# Release: exporta apps/web/out y compila el .exe + instalador NSIS
pnpm --filter @odonto/desktop tauri:build

# Solo validar que Rust compila (sin generar binario)
pnpm --filter @odonto/desktop check:rust

# E2E real sobre el .exe (requiere: API dev en :3001 + tauri:build previo)
pnpm --filter @odonto/desktop e2e
```

> `tauri:dev` y `tauri:build` **no** forman parte de `turbo dev`/`turbo build`
> a propósito: compilar Rust no es requisito para desarrollar la web o la API
> (ADR-015). Si ya tenés `pnpm dev` (raíz) corriendo, `tauri:dev` reutiliza ese
> web en :3000.

## Requisitos

- Rust toolchain (`rustup`, stable MSVC) — instalado en la fase 11.
- Visual Studio C++ Build Tools + Windows SDK (ya presentes en esta máquina).
- WebView2 runtime (incluido en Windows 10/11 actualizado).
- PostgreSQL local con el servicio `postgresql-x64-16` (el backend, no el
  escritorio, es quien lo usa).

## Detalles importantes (ADR-015)

- **Frontend:** `apps/web` con `output: 'export'` + `trailingSlash: true` →
  `apps/web/out`; la ficha del paciente vive en `/pacientes/ficha?id=...`
  (query param, no ruta dinámica, para que el bundle sea 100% estático).
- **Origen:** la webview corre en `http://tauri.localhost` (cross-site con
  `localhost`). Por eso `WEB_ORIGIN` incluye ese origen (CORS/CSRF) y el login
  de escritorio emite la cookie de sesión `SameSite=None; Secure`; el web
  conserva `SameSite=Lax` (ADR-012 enmendado).
- **Backend:** el escritorio necesita la API corriendo en
  `http://localhost:3001` (o `NEXT_PUBLIC_API_URL` + `WEB_ORIGIN` acorde en
  producción con HTTPS).
- **CSP:** `script-src` incluye `'unsafe-inline'` porque el export de Next
  embebe el payload RSC en scripts inline para hidratar.

## Pendientes conocidos

- Logo/ícono definitivo (hoy es un placeholder "OD" degradado en teal).
- Producción: API en HTTPS (cookie `Secure`) y `NEXT_PUBLIC_API_URL` apuntando
  al deployment; el CSP actual admite `https:` genérico.
- Validar en fase 12 (E2E): descargas (PDF/estudios) con el visor nativo de
  WebView2 y empaquetado NSIS en una máquina limpia.
