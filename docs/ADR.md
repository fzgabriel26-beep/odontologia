# ADR — Decisiones Arquitectónicas

Registro de decisiones técnicas del proyecto. Formato: contexto → decisión → consecuencias.
Fecha en formato AAAA-MM-DD.

---

## ADR-001 — Sesión opaca en cookie httpOnly (no JWT autocontenido)

- **Fecha:** 2026-10-07
- **Contexto:** Se necesita autenticación segura con expiración configurable y posibilidad de revocar accesos.
- **Decisión:** Sesión representada por un identificador opaco persistido en la base de datos, entregado en cookie `httpOnly + Secure + SameSite=Lax`. El servidor valida contra la tabla de sesiones.
- **Alternativas descartadas:** JWT autocontenido (no revocable sin lista negra extra, más complejidad sin beneficio en app interna de un solo consultorio).
- **Consecuencias:** Revocación inmediata al desactivar usuario; expiración configurable (`SESSION_TTL_MIN`); requiere un round-trip a BD por validación (aceptable).

## ADR-002 — Validación con Zod compartido entre frontend y backend

- **Fecha:** 2026-10-07
- **Contexto:** El SDD exige validación triple (frontend, backend, BD) sin duplicar reglas.
- **Decisión:** Los esquemas Zod viven en `packages/validation` y se usan en React Hook Form (zodResolver) y en un pipe de NestJS. PostgreSQL mantiene constraints (unique, not null, FK).
- **Consecuencias:** Una sola fuente de verdad por entidad; cambios de reglas se aplican en ambos lados a la vez.

## ADR-003 — Proveedor de almacenamiento: `StorageProvider` (FS local / S3 por env)

- **Fecha:** 2026-10-07 (actualizado 2026-10-08, fase 7)
- **Contexto:** Los archivos médicos deben ir a object storage compatible con S3. El proveedor definitivo de producción aún no se definió y este entorno de desarrollo no tiene Docker (mismo motivo que ADR-009 para PostgreSQL).
- **Decisión:** Adaptador único `StorageProvider` (`apps/api/src/storage/`) con dos implementaciones seleccionables por `STORAGE_DRIVER`:
  - `fs` (default): carpeta privada local `STORAGE_FS_DIR` (fuera de `public/`, gitignored). Usada en desarrollo y tests: todo el flujo (subida, proxy de descarga, archivado) queda integración-testeado sin servicios externos.
  - `s3`: bucket S3 compatible (MinIO, AWS S3, Cloudflare R2) con `@aws-sdk/client-s3`, configurado por `STORAGE_ENDPOINT/REGION/BUCKET/ACCESS_KEY_ID/SECRET_ACCESS_KEY/FORCE_PATH_STYLE` y testeado con el SDK espiado (sin red).
  - El swap a producción es solo cambiar variables de entorno.
- **Estado:** Implementado en fase 7. **El proveedor definitivo de producción sigue a definirse antes del despliegue (MinIO propio vía Docker u otro).**

## ADR-004 — Exportación a PDF del odontograma en el backend con Playwright

- **Fecha:** 2026-10-07
- **Contexto:** El PDF debe ser consistente entre web y escritorio, con encabezado del consultorio, datos del paciente, odontograma FDI, estados y leyenda.
- **Decisión:** El backend renderiza una vista HTML (con el SVG del odontograma) y la convierte a PDF con Playwright. El frontend solo solicita el endpoint.
- **Consecuencias:** Mismo resultado en ambas versiones, sin depender del navegador del usuario; Playwright ya es dependencia del stack (tests e2e).
- **Actualización (fase 10):** si el Chromium de Playwright no está instalado
  (`playwright install chromium`), el servicio intenta en secuencia el Chrome y
  el Edge del sistema (`channel: 'chrome' | 'msedge'`); si no hay ningún
  navegador responde `503 PDF_UNAVAILABLE`. El navegador vive en un singleton
  que se cierra con el módulo. La exportación audita `ODONTOGRAM_PDF_EXPORTED`
  (entidad `PATIENT`) por exponer información clínica.

## ADR-005 — Recuperación de contraseña sin proveedor de email en el MVP

- **Fecha:** 2026-10-07
- **Contexto:** El MVP no debe integrar proveedores de email, pero la recuperación de contraseña necesita un medio de entrega.
- **Decisión (elegida por el responsable):**
  1. El administrador puede restablecer la contraseña de cualquier usuario desde el panel (`POST /users/:id/password`, auditada como `PASSWORD_RESET_BY_ADMIN`; prohibido sobre la propia cuenta — el propio perfil usará el cambio normal de contraseña).
  2. El flujo "olvidé mi contraseña" queda implementado completo detrás de una interfaz `MailProvider`. En MVP el proveedor solo registra el token de un solo uso (logs internos, sin datos clínicos); no envía correos ni usa credenciales de terceros.
- **Consecuencias:** Al habilitar un proveedor real después, solo se implementa `MailProvider` sin tocar la lógica de autenticación.

## ADR-006 — Dientes como entidad persistida por paciente

- **Fecha:** 2026-10-07
- **Contexto:** El odontograma FDI necesita 52 dientes por paciente (32 permanentes + 20 temporales) con historial y archivos propios.
- **Decisión:** Tabla `Tooth` con una fila por diente creada al alta del paciente, `UNIQUE(patientId, fdiNumber)`. Los eventos se guardan en `ToothEvent`.
- **Consecuencias:** Consultas simples e integridad referencial real hacia eventos y archivos; costo de 52 filas por paciente es despreciable.

## ADR-007 — Zona horaria fija

- **Fecha:** 2026-10-07
- **Contexto:** Turnos, historias clínicas y auditoría dependen de fecha/hora.
- **Decisión:** `America/Argentina/Buenos_Aires` fija en backend (variables de entorno) y en la UI. Las fechas de turno se guardan como fecha civil + hora local; la auditoría en UTC.
- **Consecuencias:** Sin sorpresas de huso horario; al expandir a otros países habrá que parametrizar.

## ADR-008 — NotificationService como stub sin proveedores

- **Fecha:** 2026-10-07
- **Contexto:** El sistema debe quedar preparado para recordatorios por email/WhatsApp sin implementarlos ahora.
- **Decisión:** Interfaz `NotificationService` con eventos de dominio (p.ej. `AppointmentCreated`), sin implementaciones externas. No se agregan credenciales ni SDKs de terceros.
- **Consecuencias:** Integraciones futuras (email, WhatsApp, SMS) se agregan como proveedores nuevos sin modificar pacientes, historias clínicas ni turnos.

## ADR-009 — PostgreSQL 16 local para desarrollo (sin Docker)

- **Fecha:** 2026-10-08
- **Contexto:** El entorno de desarrollo no tiene Docker instalado; la fase 1 necesita PostgreSQL.
- **Decisión (elegida por el responsable):** PostgreSQL 16 instalado localmente en Windows (servicio `postgresql-x64-16`, puerto 5432, BD `odontologia`, rol `odontologia`). `docker/docker-compose.yml` se conserva para otros entornos/producción y para MinIO en la fase 7.
- **Consecuencias:** Sin contenedores en el día a día del dev; el compose sigue siendo la referencia para levantar el stack completo en otra máquina.

## ADR-010 — Prisma 7 (Rust-free) con `prisma.config.ts` y driver adapter

- **Fecha:** 2026-10-08
- **Contexto:** El SDD exige Prisma ORM sin fijar versión; la versión estable actual es 7.x (8 solo en RC).
- **Decisión:** Prisma 7.10.0:
  - `prisma.config.ts` en la raíz (URL de BD y seed vía `dotenv`).
  - Cliente generado como TypeScript en `apps/api/src/generated/prisma` (`prisma-client`, gitignored, regenerado con `pnpm generate`).
  - Conexión mediante driver adapter `@prisma/adapter-pg` en `PrismaService` (NestJS).
  - Seed idempotente: roles con permisos granulares + administrador inicial (Argon2id).
- **Consecuencias:** Sin binarios Rust, arranque más liviano; los scripts raíz (`build`, `typecheck`, `test`) ejecutan `generate` antes de corre.

## ADR-011 — `AuditLog.action` como texto, no como enum

- **Fecha:** 2026-10-08
- **Contexto:** La auditoría debe registrar acciones aunque aparezcan nuevas; fallar un INSERT por un enum desactualizado es inaceptable.
- **Decisión:** `action` y `entityType` se guardan como `VARCHAR` (catálogo de acciones en `packages/types`, `AUDIT_ACTIONS`).
- **Consecuencias:** La app controla los valores; la BD no rechaza acciones nuevas. Se puede migrar a enum más adelante si se desea.

## ADR-012 — Protección CSRF: cookie `SameSite=Lax` + validación de `Origin` en el backend

- **Fecha:** 2026-10-08
- **Contexto:** El SDD pide protección CSRF sin intervención obligatoria del frontend: la sesión viaja en cookie, por lo que un sitio de terceros podría intentar requests mutantes.
- **Decisión:** Control enteramente del lado del servidor, en dos capas:
  1. La cookie de sesión se emite con `SameSite=Lax` + `httpOnly` (y `secure` en producción), de modo que un navegador no adjunta la cookie en requests mutantes cruzados.
  2. `CsrfOriginGuard` rechaza con `403 CSRF_ORIGIN_REJECTED` todo `POST/PUT/PATCH/DELETE` cuya cabecera `Origin` no coincida con `WEB_ORIGIN`, `CSRF_ORIGINS` ni el host de la API. Requests sin `Origin` (clientes no navegador) no se validan.
- **Consecuencias:** Sin tokens CSRF ni cambios en el frontend; los E2E y `curl` siguen funcionando. Si algún día el frontend se sirve de otro origen, se agrega a `CSRF_ORIGINS`.
- **Enmienda (fase 11, ADR-015):** `WEB_ORIGIN` es ahora una lista separada por coma (incluye `http://tauri.localhost`) y el login desde la webview de escritorio emite la cookie con `SameSite=None; Secure` (origen cross-site). Web conserva `SameSite=Lax`; el `CsrfOriginGuard` no cambia.
- **Enmienda (despliegue, ADR-016):** con `SESSION_COOKIE_SAMESITE=none` (entorno desplegado, web y API en origen cruzado) el login del web también emite `SameSite=None; Secure`. Sin la env, el comportamiento local por defecto sigue siendo `SameSite=Lax`. El `CsrfOriginGuard` no cambia.

## ADR-013 — El código de invitación define el rol que recibirá la cuenta

- **Fecha:** 2026-10-08
- **Contexto:** El registro es solo por código de invitación y toda cuenta necesita un rol; el SDD no especifica quién decide el rol de la cuenta nueva.
- **Decisión:** `InvitationCode.roleId` (obligatorio) contiene el rol a asignar: el administrador lo elige al generar el código (panel de la fase 3) y el registro lo aplica de forma atómica junto con el consumo del código.
- **Consecuencias:** No hay cuentas "sin rol" ni pasos extra posteriores; el administrador conserva el control total de quién entra y como qué. El registro reutiliza el mensaje de error genérico para códigos inválidos y específicos para expirado/revocado.

## ADR-014 — Interceptor de auditoría como red de seguridad (AsyncLocalStorage)

- **Fecha:** 2026-10-08
- **Contexto:** Todas las mutaciones HTTP actuales auditan con acciones de dominio (`PATIENT_UPDATED`, `APPOINTMENT_CREATED`, …), pero un endpoint futuro podría olvidar el `audit.log` y quedar sin registrar. Repetir la auditoría en el interceptor duplicaría cada fila.
- **Decisión:** `AuditInterceptor` global (APP_INTERCEPTOR) que, solo para `POST/PUT/PATCH/DELETE` con respuesta 2xx, comprueba vía `AsyncLocalStorage` (`audit-context.ts`) si el handler ya dejó una fila (`AuditService.log` lo marca). Si no la dejó, escribe una fila `API_MUTATION` (`entityType: API`, metadata `method` + `path` sin query) **antes** de emitir la respuesta. Los errores no generan fila (los fallos relevantes como `LOGIN_FAILED` ya auditan explícitamente) y las lecturas no se interceptan.
- **Consecuencias:** Ninguna mutación exitosa queda sin registrar y no hay filas duplicadas; el coste es un `AsyncLocalStorage` en el camino de toda request mutante y una fila de respaldo de baja semántica (`API_MUTATION`) que en la práctica solo aparece si alguien agrega un endpoint sin auditoría. El panel la muestra con etiqueta "Mutación sin registrar (interceptor)".

## ADR-015 — Escritorio Tauri: bundle estático, origen `tauri.localhost` y cookie de sesión

- **Fecha:** 2026-10-08
- **Contexto:** El MVP exige una app de escritorio sobre la misma web y el mismo backend. La webview de Tauri en Windows sirve los archivos bajo `http://tauri.localhost` (custom protocol de WebView2), no puede ejecutar un servidor Next en producción, y ese origen resultó ser _cross-site_ con `localhost` (verificado empíricamente en la fase 11: con `SameSite=Lax` la cookie no viajaba y `/auth/me` respondía 401).
- **Decisión:**
  1. **Entrega:** `apps/web` se exporta como sitio estático (`output: 'export'` + `trailingSlash: true`) a `apps/web/out`, que es el `frontendDist` de Tauri; en desarrollo, `tauri dev` usa `devUrl: http://localhost:3000` con `beforeDevCommand: scripts/dev-web.mjs` (reutiliza un web ya corriendo en :3000 o lo levanta).
  2. **Ruta de la ficha:** `/pacientes/[id]` pasó a `/pacientes/ficha?id=...` — era la única ruta dinámica que impedía el export y solo había que ajustar 2 links.
  3. **Orígenes:** `WEB_ORIGIN` es una lista separada por coma (web primero, `http://tauri.localhost` después). CORS (`corsOptions()`), `CsrfOriginGuard` y los enlaces de recuperación de contraseña (primer origen) comparten `common/utils/origins.ts`.
  4. **Cookie de sesión:** login con Origin de escritorio ⇒ `SameSite=None; Secure` (`Secure` es válido sobre `http://localhost`, origen confiable); web ⇒ `SameSite=Lax` sin cambios (ADR-012) y el `CsrfOriginGuard` sigue validando toda mutación en el backend.
  5. **CSP:** `script-src 'self' 'unsafe-inline'` porque el export de Next embebe el payload RSC en scripts inline (necesario para hidratar); `connect-src`/`img-src` permiten `http://localhost:3001` y `https:` (producción con API en HTTPS, SDD §7).
- **Consecuencias:** El `.exe` funciona sin servidor web (solo requiere la API). Los scripts del escritorio (`tauri:dev`, `tauri:build`) están deliberadamente fuera de `turbo dev`/`turbo build`: compilar Rust no es requisito para desarrollar web/API y `pnpm dev` no debe abrir ventanas ni pelear por el puerto 3000. Requieren toolchain Rust (rustup) + VS Build Tools. El trade-off de `script-src 'unsafe-inline'` se acepta porque la app no renderiza HTML de usuario y los archivos clínicos se entregan como blob/descarga; convendrá reforzar si algún día se inyecta HTML externo.

## ADR-016 — Despliegue demo: GitHub (repo privado) + Render (web estático, API y PostgreSQL)

- **Fecha:** 2026-10-08
- **Contexto:** Se quiere que un tercero pruebe la web sin clonar el repo ni instalar dependencias (solo un link + credenciales). El MVP no define proveedor de hosting, el entorno no tiene Docker local (ADR-009) y la única cuenta de infraestructura disponible es GitHub.
- **Decisión:**
  1. **Repositorio:** el monorepo se sube a GitHub como repo **privado**; es la fuente del deploy (cada push a `main` redeploya) pero el probador nunca lo ve.
  2. **Web:** export estático de `apps/web` (`apps/web/out`) publicado en **Render Static Sites**, con `NEXT_PUBLIC_API_URL` compilado hacia el API desplegado.
  3. **API:** **Render Web Service** construido desde el `Dockerfile` de la raíz (`node:24-slim` + pnpm; `prisma migrate deploy` idempotente en cada arranque). El puerto lo inyecta la plataforma (`PORT`, ver `apps/api/src/main.ts`); `Health Check Path` = `/api/v1/health`.
  4. **Base de datos:** PostgreSQL administrado de Render (plan free; la BD expira a los 90 días — la demo es de corta vida).
  5. **Cookie cross-site (enmienda a ADR-012/015):** el web desplegado y la API viven en origen cruzado, así que la env `SESSION_COOKIE_SAMESITE=none` hace que cualquier origen reciba `SameSite=None; Secure` (requiere HTTPS, que Render provee). En local, sin la env, se mantiene `SameSite=Lax`.
  6. **Storage:** `STORAGE_DRIVER=fs` para la demo (los archivos no sobreviven redeploys); R2/S3 queda para después (ADR-003 pendiente).
- **Consecuencias:** El probador solo recibe el link y las credenciales del seed. Costo $0 (planes free) con limitaciones conocidas: la API duerme a los 15 min (primera carga lenta), la BD free expira a los 90 días y los archivos subidos se pierden al redeploy. No se pudo verificar el build Docker localmente (sin Docker); la verificación real es el primer deploy. El repo es la única fuente de verdad; los pasos de cuenta están en `docs/DEPLOY.md`.

## ADR-016 — Enmienda (fase 12): expiración real de la BD free

- **Fecha:** 2026-10-09
- **Corrección:** el párrafo original dice "la BD expira a los 90 días". El dato real reportado por la API de Render es **30 días desde la creación + 14 días de gracia**: `odontologia-demo` (creada 2026-10-09) expira el **2026-11-08** y se elimina tras la gracia. Además, el plan free **no tiene ningún tipo de backup nativo** (ni exports lógicos — la API responde `400 database is a free tier database` — ni snapshots), por lo que el mecanismo de respaldo es el descrito en ADR-017.

## ADR-017 — Swagger completo gateado, hardening y backups automáticos (fase 12)

- **Fecha:** 2026-10-09
- **Contexto:** El SDD exige Swagger (§9), "backups automáticos (PostgreSQL + archivos) con retención configurable y procedimiento de restauración documentado" (§7) y tests para funcionalidades críticas (§13). La demo gratuita de Render no ofrece exports lógicos ni snapshots de BD, y el `pnpm audit` acumulaba 12 vulnerabilidades (2 críticas).
- **Decisión:**
  1. **Swagger completo desde Zod:** los inputs de la documentación se generan con `z.toJSONSchema` (zod 4.6, `target: 'openapi-3.0'` + `io`) desde los mismos schemas que validan en runtime; las respuestas se declaran desde Prisma (`apps/api/src/swagger/response-schemas.ts`) omitiendo siempre `passwordHash`, `tokenHash` y `storageKey`. Las 48 operaciones de los 10 controladores llevan `summary`, `tag` y respuesta documentada, con un gate automático (`swagger.spec.ts`: ≥ 36 paths con prefijo `/api/v1`, securityScheme de cookie de sesión, body de login derivado del schema Zod, toda operación con summary/tag/respuesta).
  2. **Swagger gateado por entorno:** `swaggerEnabled(env)` instala `/api/v1/docs` siempre en desarrollo y en producción solo con `SWAGGER_ENABLED=true`; la demo corre con las docs apagadas (se activan para depurar y se apagan después).
  3. **Hardening del API y del sitio:** middleware `securityHeaders()` aplicado en el bootstrap a toda respuesta (elimina `X-Powered-By`; agrega `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Cache-Control: no-store`) con spec HTTP propio; `storageKey` dejó de aparecer en cualquier respuesta de archivos (tipo `MedicalFileView` + getter interno `getFullFile()` que es el único que ve la clave); el sitio estático de Render recibe CSP estricta (`default-src 'self'`, `frame-ancestors 'none'`, `connect-src` solo con su API) más `nosniff`/`X-Frame-Options`/`Referrer-Policy`/`Permissions-Policy` como reglas vía API de Render.
  4. **Dependencias sin CVEs:** `pnpm audit` de 12 a 0 mediante overrides selectivos en `pnpm-workspace.yaml` (`postcss@8.4.31 → 8.5.23`, `js-yaml@5.3.0 → 5.4.2`, `mysql2 → 3.23.1`, `deepmerge-ts → 8.0.0`, los dos últimos solo empaquetados por Prisma y jamás usados con PostgreSQL) y salto de `vitest` 3 → 4.1.11 (resolvía tinypool crítico y @vitest/mocker). `prisma validate` y la suite completa verifican que nada rompió.
  5. **Backups automatizados con drill:** workflow de GitHub Actions **`Backup`** (cron diario 06:00 UTC + `workflow_dispatch`) que corre `scripts/backup-db.mjs` (`pg_dump -Fc` contra el endpoint externo de Render con `sslmode=require`), **restaura el dump en un PostgreSQL 16 efímero y exige conteos idénticos a la fuente** (paso "Drill de restauración": si un dump no restaura, la run falla), y publica el `.dump` como artefacto con retención configurable (repo variable `BACKUP_RETENTION_DAYS`, default 30 días; el mismo valor gobierna el borrado local del script). Se descartó la API de exports de Render por plan free y se habilitó la allowlist externa `0.0.0.0/0` (protegida por contraseña + TLS). El procedimiento completo de retención/restauración y el respaldo de archivos (S3 en producción; `fs` efímero en la demo) están en `docs/OPERACIONES.md`.
- **Consecuencias:** La documentación de la API existe donde se habilita y nunca filtra credenciales ni claves de almacenamiento; el audit quedó en 0 vulnerabilidades conocidas con verificación repetible; la demo tiene red de seguridad ante el vencimiento de la BD (2026-11-08) y cada backup prueba su propia restauración, cumpliendo §7 sin backups nativos del proveedor. Persisten como limitaciones aceptadas los archivos médicos en `fs` de la demo (no respaldables fuera del contenedor; el procedimiento S3 queda documentado) y la allowlist `0.0.0.0/0` del endpoint externo, restringible a IPs conocidas si la demo deja de necesitar CI externa.
