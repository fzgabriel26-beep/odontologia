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

## ADR-003 — Proveedor de almacenamiento S3: pendiente (interfaz ya definida)

- **Fecha:** 2026-10-07
- **Contexto:** Los archivos médicos deben ir a object storage compatible con S3. El proveedor definitivo de producción aún no se definió.
- **Decisión:** Se implementa un adaptador único `StorageProvider` (fase 7). En desarrollo se usa MinIO local vía Docker. El proveedor de producción (MinIO propio, AWS S3, Cloudflare R2, etc.) se definirá antes del despliegue, cambiando únicamente variables de entorno.
- **Estado:** **PENDIENTE — requiere decisión antes de producción.**

## ADR-004 — Exportación a PDF del odontograma en el backend con Playwright

- **Fecha:** 2026-10-07
- **Contexto:** El PDF debe ser consistente entre web y escritorio, con encabezado del consultorio, datos del paciente, odontograma FDI, estados y leyenda.
- **Decisión:** El backend renderiza una vista HTML (con el SVG del odontograma) y la convierte a PDF con Playwright. El frontend solo solicita el endpoint.
- **Consecuencias:** Mismo resultado en ambas versiones, sin depender del navegador del usuario; Playwright ya es dependencia del stack (tests e2e).

## ADR-005 — Recuperación de contraseña sin proveedor de email en el MVP

- **Fecha:** 2026-10-07
- **Contexto:** El MVP no debe integrar proveedores de email, pero la recuperación de contraseña necesita un medio de entrega.
- **Decisión (elegida por el responsable):**
  1. El administrador puede restablecer la contraseña de cualquier usuario desde el panel (acción auditada).
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
