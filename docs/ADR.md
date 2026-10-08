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

## ADR-013 — El código de invitación define el rol que recibirá la cuenta

- **Fecha:** 2026-10-08
- **Contexto:** El registro es solo por código de invitación y toda cuenta necesita un rol; el SDD no especifica quién decide el rol de la cuenta nueva.
- **Decisión:** `InvitationCode.roleId` (obligatorio) contiene el rol a asignar: el administrador lo elige al generar el código (panel de la fase 3) y el registro lo aplica de forma atómica junto con el consumo del código.
- **Consecuencias:** No hay cuentas "sin rol" ni pasos extra posteriores; el administrador conserva el control total de quién entra y como qué. El registro reutiliza el mensaje de error genérico para códigos inválidos y específicos para expirado/revocado.
