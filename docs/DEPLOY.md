# DEPLOY — Despliegue demo para que un tercero prueve la web

> Guía paso a paso del despliegue descrito en **ADR-016**: repo privado en
> **GitHub** + **Render** (web estático, API y PostgreSQL). Al terminar le
> pasás al probador **un link y unas credenciales** — no necesita clonar nada
> ni instalar dependencias.

```
GitHub (repo PRIVADO)  ──push a main──►  Render Static Sites  (web → link público)
        │                                       │
        └────────────────────────────────►  Render Web Service (API, Dockerfile raíz)
                                                    │
                                            Render PostgreSQL
```

## Prerrequisitos (cuentas)

- **GitHub**: ya la tenés (repo **privado**).
- **Render**: crear cuenta gratis en <https://render.com> (sign up con GitHub,
  1 clic). **Sin tarjeta** para los planes free.

## Paso 1 — Subir el repo a GitHub (privado)

1. En GitHub: **New repository** → nombre (p. ej. `odontologia`) → **Private** →
   Create (sin README ni .gitignore, el repo local ya tiene todo).
2. Desde la raíz del monorepo:

```bash
git remote add origin https://github.com/TU-USUARIO/odontologia.git
git push -u origin main
```

> El repo es la **fuente del deploy**: cada `git push` a `main` vuelve a
> desplegar automáticamente. El probador nunca ve el repo.

## Paso 2 — Base de datos en Render

1. Dashboard → **New** → **PostgreSQL**.
2. Name: `odontologia-demo` → Region: **Virginia (us-east)** → Plan: **Free**
   → Create Database.
3. Espera a que esté **Available** y copiá la **Internal Database URL**
   (botón de copiar junto al campo). Es el valor de `DATABASE_URL`.

## Paso 3 — API en Render (Web Service + Docker)

1. **New** → **Web Service** → conectá el repo de GitHub (si pide permisos,
   autorizá la app de Render sobre el repo privado).
2. Config:
   - **Name**: `odontologia-api`
   - **Runtime Environment**: **Docker** (el `Dockerfile` está en la raíz del
     repo; si pregunta la ruta: `./Dockerfile`)
   - **Instance Type**: **Free**
3. **Environment Variables** (agregá todas antes de crear el servicio):

   | Variable                  | Valor                                                      | Para qué sirve                                                    |
   | ------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------- |
   | `DATABASE_URL`            | Internal Database URL del Paso 2                           | conexión a PostgreSQL                                             |
   | `WEB_ORIGIN`              | `https://PENDIENTE.onrender.com` (se corrige en el Paso 5) | CORS / CSRF / enlaces                                             |
   | `SESSION_COOKIE_SAMESITE` | `none`                                                     | cookie cross-site web↔API (ADR-016)                               |
   | `NODE_ENV`                | `production`                                               | modo producción                                                   |
   | `TZ`                      | `America/Argentina/Buenos_Aires`                           | fechas de la agenda                                               |
   | `STORAGE_DRIVER`          | `fs`                                                       | archivos médicos en la demo (no persisten entre redeploys)        |
   | `SEED_ADMIN_EMAIL`        | `admin@consultorio.local`                                  | email del admin inicial                                           |
   | `SEED_ADMIN_PASSWORD`     | **una contraseña fuerte y distinta** para la demo pública  | contraseña del admin inicial                                      |
   | `SWAGGER_ENABLED`         | _(dejar sin definir)_                                      | Swagger gateado: sin la env, `/api/docs` es 404 en prod (ADR-017) |

4. **Advanced** → **Health Check Path**: `/api/v1/health`.
5. **Create Web Service**. El primer build tarda ~4–8 min (instala el monorepo
   y compila el API). El arranque corre `prisma migrate deploy` solo.

> El puerto lo inyecta Render (`PORT`); la API lo detecta sola
> (`apps/api/src/main.ts`).

## Paso 4 — Web estático en Render (Static Site)

1. **New** → **Static Site** → mismo repo.
2. Config:
   - **Name**: `odontologia-web`
   - **Build Command**:
     ```bash
     npm i -g pnpm@12.10.1 && pnpm install --frozen-lockfile && pnpm --filter @odonto/web build
     ```
   - **Publish Directory**: `apps/web/out`
   - **Environment Variables**:
     | Variable              | Valor                                                      |
     | --------------------- | ---------------------------------------------------------- |
     | `NEXT_PUBLIC_API_URL` | `https://<TU-API>.onrender.com/api/v1` (la URL del Paso 3) |
3. **Create Static Site**. Copiá la URL que asigna
   (`https://<TU-WEB>.onrender.com`).

## Paso 5 — Apuntar el API al web y redeploy

1. Volvé al servicio **API** → **Environment** → editá `WEB_ORIGIN` con la URL
   **exacta** del sitio estático (con `https://`, sin barra al final):
   `https://<TU-WEB>.onrender.com` → **Save Changes** (fuerza un redeploy).
2. Esto habilita CORS/CSRF para ese origen y hace que los enlaces de
   recuperación de contraseña apunten al sitio.

## Paso 6 — Seed y prueba de login

1. Servicio API → pestaña **Shell** →:

   ```bash
   pnpm db:seed
   ```

   Crea roles y el administrador con `SEED_ADMIN_*`. Es **idempotente**: si el
   admin ya existe solo avisa.

2. Abrí `https://<TU-WEB>.onrender.com` y hacé login con
   `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`.
3. Smoke test: Dashboard carga · crear un paciente · abrir su ficha · subir un
   archivo y descargarlo · cerrar sesión.

## Paso 7 — Compartir con el probador

Pasale solo:

- **Link**: `https://<TU-WEB>.onrender.com`
- **Credenciales**: `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`
- **Aviso**: si el servicio está dormido, la **primera carga tarda ~40–60 s**
  (plan free); después queda despierto un rato.

## Limitaciones del plan free (ADR-016)

- **API dormida a los 15 min** sin tráfico → primera petición lenta. Para
  eliminarlo: Starter (~USD 7/mes) o un keep-alive externo.
- **PostgreSQL free expira a los 30 días + 14 de gracia** (creada 2026-10-09 →
  expira **2026-11-08**, según la API de Render; ADR-016 enmendado). No tiene
  backups nativos: el respaldo es el workflow `Backup` de GitHub Actions
  (ver siguiente sección y `docs/OPERACIONES.md`).
- **Archivos con `STORAGE_DRIVER=fs`** no sobreviven redeploys (persistencia
  real = R2/S3, pendiente ADR-003).
- **Solo datos de prueba**: es un sistema médico; nunca cargues datos reales
  en una instancia pública. El rate limit de login (10 intentos/min) queda
  activo.
- El **escritorio (Tauri)** no forma parte de esta demo: apunta a la API por
  build (`NEXT_PUBLIC_API_URL`), ver ADR-015.

## Backups y operaciones

- **Backup automático de la BD**: workflow **`Backup`** (GitHub Actions),
  diario 06:00 UTC + manual con `gh workflow run Backup`. Cada corrida baja
  un `pg_dump`, lo restaura en un Postgres 16 efímero y exige conteos
  idénticos (drill); el `.dump` queda como artefacto con retención
  configurable (repo variable `BACKUP_RETENTION_DAYS`, default 30 días).
- **Procedimiento de restauración, retención, backups de archivos (S3) y
  checklist de cierre**: `docs/OPERACIONES.md`.

## Actualizaciones y rollback

- **Actualizar**: `git push origin main` → Render redeploya API y web solos.
- **Rollback**: Dashboard → servicio → **Deploys** → deploy anterior →
  **Rollback**.
- **Ver logs**: pestaña **Logs** de cada servicio (el API no loguea datos
  sensibles, SDD §7).

## Troubleshooting

| Síntoma                                                                   | Causa probable                                                           | Solución                                                                            |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| CORS en consola del navegador                                             | `WEB_ORIGIN` desactualizado o con `/` al final                           | Paso 5: URL exacta del sitio y save                                                 |
| Login ok pero `/auth/me` 401                                              | Falta `SESSION_COOKIE_SAMESITE=none`                                     | Agregar la env y redeploy                                                           |
| 502/503                                                                   | Servicio durmiendo o build fallido                                       | Esperar cold start o revisar Logs                                                   |
| `prisma migrate deploy` falla                                             | `DATABASE_URL` mal copiado                                               | Revisar Internal Database URL                                                       |
| Seed no corre                                                             | Estás en el servicio equivocado                                          | Shell del servicio **API**                                                          |
| Build: `Cannot resolve environment variable: DATABASE_URL`                | Falta el fallback de `prisma.config.ts`                                  | Ya resuelto en `f3daaae` (generate no necesita conexión)                            |
| Desde la red local, la BD externa cierra con `SSL/TLS required` / `P1017` | El endpoint _external_ no aceptó conexiones desde esta red de desarrollo | Usar el endpoint _internal_ dentro de Render (migrate/seed corren en el contenedor) |

## Recursos desplegados (ejecución real de la fase 12b, 2026-10-09)

Se crearon con la **API de Render** (mismos valores que esta guía, paso a paso):

| Recurso                     | Valor                                                                                           |
| --------------------------- | ----------------------------------------------------------------------------------------------- |
| Repo (privado)              | <https://github.com/fzgabriel26-beep/odontologia>                                               |
| **Web (link del probador)** | <https://odontologia-web-6uzt.onrender.com>                                                     |
| API                         | <https://odontologia-api-tlk2.onrender.com>                                                     |
| PostgreSQL                  | `odontologia-demo` — free, oregón, **expira 2026-11-08** (90 días)                              |
| Admin seed                  | `admin@consultorio.local` (la contraseña vive en la env `SEED_ADMIN_PASSWORD` del servicio API) |

**Notas de la ejecución:**

- El seed corre **dentro del contenedor** en cada arranque (`pnpm db:seed`,
  idempotente), no desde la máquina local.
- Dos hallazgos del primer build quedaron corregidos en `f3daaae`:
  `prisma.config.ts` tolera la ausencia de `DATABASE_URL` en el build (las env
  vars son de runtime) y el Dockerfile instala `openssl` para que Prisma elija
  el schema-engine correcto.
- Smoke verificado tras el deploy: `/health` ok · login con cookie
  `SameSite=None; Secure` + CORS · `/auth/me` con sesión · sitio estático 200.
- El sitio estático se construye con `turbo build --filter=@odonto/web`
  (compila `@odonto/types/ui/validation` antes que Next).
