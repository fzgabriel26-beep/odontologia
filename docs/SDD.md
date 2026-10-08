# SDD — Sistema de Gestión Odontológica

Software Design Document. Especificación viva del proyecto. Toda funcionalidad se
implementa respetando este documento; los cambios de alcance se registran aquí primero.

- **Versión:** 0.1 (Fase 0)
- **Fecha:** 2026-10-07
- **Decisiones técnicas:** ver `docs/ADR.md`

---

## 1. Objetivo

Aplicación profesional (web + escritorio) para administrar de forma centralizada un
consultorio odontológico: acceso y usuarios, pacientes, historias clínicas,
odontogramas, estudios/archivos, agenda de turnos, cancelaciones, ausencias, señas e
historial de actividad.

Prioridades: **1. Seguridad · 2. Privacidad · 3. Integridad · 4. Trazabilidad ·
5. Usabilidad · 6. Mantenibilidad · 7. Escalabilidad.**

No es un CRUD simple: la información clínica se trata como información sensible.

## 2. Alcance

### 2.1 MVP (incluido)

| Módulo | Funciones |
|---|---|
| Autenticación | Login, registro por código de invitación, recuperación de contraseña, usuarios, roles |
| Pacientes | Alta, edición, consulta, búsqueda, DNI obligatorio y único |
| Historia clínica | Crear registros, consultar registros, historial |
| Odontograma | FDI, permanente y temporal, estados, historial por diente, archivos por diente, exportación PDF |
| Agenda | Día/semana/mes, crear turno, modificar, cancelar, ausente, seña, historial |
| Archivos | Subir, visualizar, descargar, asociar a paciente y a diente |
| Auditoría | Acciones relevantes |
| Escritorio | Aplicación Tauri sobre la app web, mismo backend |

### 2.2 Fuera del MVP (no implementar)

Facturación, caja, presupuestos, portal del paciente, app móvil, integración real con
WhatsApp/SMS/proveedores de email, multi-sucursal, sistema contable, integraciones
externas no especificadas. La arquitectura debe quedar preparada para incorporarlas.

## 3. Stack obligatorio

| Capa | Tecnología |
|---|---|
| Frontend | Next.js, React, TypeScript, Tailwind CSS, shadcn/ui |
| Formularios/validación | Zod, React Hook Form |
| Backend | NestJS, TypeScript, API REST, OpenAPI/Swagger |
| Base de datos | PostgreSQL, Prisma ORM |
| Escritorio | Tauri (reutiliza la app web; sin lógica de negocio duplicada) |
| Monorepo | pnpm, Turborepo |
| Tests | Vitest, Playwright |
| Contenedores | Docker |
| Archivos | Object Storage compatible con S3 |
| Odontograma | React + SVG interactivo (nunca imagen estática) |

## 4. Arquitectura

```text
Frontend (Next.js / Tauri)  →  API NestJS  →  PostgreSQL
                                          →  Object Storage (S3)
                                          →  NotificationService (stub)
```

- El frontend **nunca** se conecta a PostgreSQL ni al storage directamente.
- El backend concentra: autenticación, autorización, validaciones, reglas de negocio,
  persistencia, archivos, auditoría, PDFs y futuras notificaciones.
- Sin microservicios innecesarios: un solo backend modular.

### 4.1 Módulos del backend

`auth`, `users`, `invitation-codes`, `patients`, `clinical-records`, `odontogram`,
`files`, `appointments`, `audit`, `health`.
Patrón por módulo: `controller → service → repository (Prisma)`, con guards y
interceptores transversales.

## 5. Reglas de negocio

1. **Sin registro público.** Toda cuenta nueva requiere un código de invitación generado
   por un administrador (formato `ODONTO-XXXX-XXXX`), único, difícil de adivinar,
   expirable, revocable, con estado y trazabilidad (generador, fecha de uso, usuario).
   Estados: Disponible, Utilizado, Expirado, Revocado.
2. **Usuario inactivo** no puede iniciar sesión.
3. **DNI de paciente:** obligatorio, validado, único, buscable; **nunca** es la clave
   técnica (cada paciente tiene `id` UUID propio).
4. **Turnos ineliminables:** cancelar o marcar ausente cambia el estado y conserva
   fecha, hora, paciente, usuario, fecha del cambio y motivo. Cancelación (el paciente
   avisó) y Ausente/No-show (no se presentó) se contabilizan por separado.
5. **Historias clínicas no se borran físicamente:** archivado/desactivación auditado.
   Cada registro conserva autor y fecha/hora de creación; en MVP son inmutables.
6. **Archivos médicos privados:** bucket sin acceso público; ver/descargar/eliminar
   siempre pasa por autorización en backend; nunca URLs públicas permanentes.
7. **Odontograma interactivo FDI** (2 dígitos), permanente y temporal. Cada diente
   seleccionable individualmente, con panel lateral/modal, estado actual, observaciones,
   historial, tratamientos, estudios y archivos. El estado no depende solo del color:
   iconos/patrones/etiquetas + texto.
8. **Backend manda:** toda autorización se verifica en el backend; el frontend solo
   aporta UX.
9. **NotificationService** existe como abstracción; sin proveedores reales, sin
   credenciales de terceros en el MVP.
10. **Mínimo privilegio y auditoría:** acciones sensibles registradas en `AuditLog`
    insert-only.

### 5.1 Estados

- **Usuarios:** Activo, Inactivo.
- **Roles:** Administrador, Odontólogo/a, Secretario/a. En MVP odontólogo y secretario
  tienen permisos funcionales idénticos, pero modelados como lista de permisos
  granular para divergir después sin cambiar código.
- **Turnos:** Pendiente, Confirmado, Seña realizada, Presente, En atención, Atendido,
  Cancelado, Ausente/No-show, Reprogramado. Extensible.
- **Estados dentales:** Sano, Caries, Restauración, Corona, Ausente, Extracción
  indicada, Extracción realizada, Endodoncia, Implante, Prótesis, Fractura, Diente
  retenido, Tratamiento pendiente, Otro. Extensible.

## 6. Casos de uso principales

| # | Caso | Actor | Flujo esencial |
|---|---|---|---|
| CU-01 | Iniciar sesión | Cualquier usuario | Email+contraseña → sesión; falla si inactivo o bloqueado por rate limit |
| CU-02 | Registrarse por código | Invitado | Código válido → crea cuenta → código pasa a Utilizado |
| CU-03 | Recuperar contraseña | Usuario | Solicita → token de un solo uso (MailProvider stub o reset por admin) |
| CU-04 | Gestionar códigos | Administrador | Generar / revocar / consultar códigos |
| CU-05 | Gestionar usuarios | Administrador | Crear, editar rol, activar/desactivar |
| CU-06 | Crear paciente | Personal | Formulario completo → DNI único validado |
| CU-07 | Buscar paciente | Personal | Query sobre nombre/apellido/DNI/teléfono/email |
| CU-08 | Registrar evolución | Personal | Nuevo registro clínico con motivo, diagnóstico, tratamiento, dientes |
| CU-09 | Gestionar odontograma | Personal | Seleccionar diente → ver estado/historial → registrar evento |
| CU-10 | Adjuntar archivo a diente | Personal | Subir con validación MIME/tamaño → asociar paciente+diente |
| CU-11 | Exportar odontograma PDF | Personal | Backend genera PDF con encabezado, FDI, estados y leyenda |
| CU-12 | Crear turno | Personal | Paciente, profesional, fecha/hora, duración, motivo |
| CU-13 | Cambiar estado de turno | Personal | Transición válida; cancelación/ausencia con motivo |
| CU-14 | Registrar seña | Personal | Monto, si fue abonado, monto recibido, fecha, método |
| CU-15 | Consultar auditoría | Administrador | Filtros por acción, usuario, fecha |

## 7. Requisitos no funcionales

- TypeScript estricto; sin `any` salvo justificación documentada.
- Respuestas al usuario en **español**; sin errores técnicos expuestos
  (ej. `SQLSTATE[23000]` → "No fue posible guardar los cambios. Intentá nuevamente.").
- Sin información clínica sensible en logs.
- HTTPS en producción; rate limiting; validación backend; protección XSS/CSRF/SQLi.
- UI profesional, minimalista, responsive, rápida; sin animaciones excesivas.
- Backups automáticos (PostgreSQL + archivos) con retención configurable y procedimiento
  de restauración documentado (`docs/OPERACIONES.md`, fase 12).

## 8. Modelo de datos (resumen)

Entidades: `User`, `Role`, `InvitationCode`, `Patient`, `ClinicalRecord`, `Tooth`,
`ToothEvent`, `Appointment`, `AppointmentEvent`, `MedicalFile`, `AuditLog`, `Session`.

- IDs internos **UUID**; DNI con constraint `UNIQUE` (jamás primary key).
- `UNIQUE(email)` en User; `UNIQUE(patientId, fdiNumber)` en Tooth.
- `ClinicalRecord`, `AuditLog`, `AppointmentEvent`: `onDelete: Restrict` + inmutables.
- Tooth: 52 filas por paciente (FDI 11–48 permanentes, 51–85 temporales).
- Archivos: metadatos en BD (`storageKey` generado por el servidor), binarios en S3.
- Índices: `Appointment(date)`, `Appointment(patientId, date)`, `Patient.lastName`,
  `AuditLog(entityId)`, `AuditLog(userId, createdAt)`, `ToothEvent(toothId, date)`.

Detalle completo de campos y relaciones: se documenta en la fase 3 (modelo de datos).

## 9. API (resumen)

Base `/api/v1`, documentada con Swagger. Errores uniformes
`{ error: { code, message } }` en español.

- **auth:** `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`,
  `POST /auth/register`, `POST /auth/password/forgot`, `POST /auth/password/reset`,
  `POST /auth/password/change`
- **users (admin):** `GET/POST /users`, `GET/PATCH /users/:id`,
  `POST /users/:id/status`, `POST /users/:id/role`
- **invitation-codes (admin):** `GET/POST /invitation-codes`,
  `POST /invitation-codes/:id/revoke`
- **patients:** `GET /patients?query=`, `POST /patients`, `GET/PATCH /patients/:id`,
  `POST /patients/:id/archive`
- **clinical-records:** `GET/POST /patients/:id/records`
- **odontogram:** `GET /patients/:id/teeth`, `GET /teeth/:id/events`,
  `POST /teeth/:id/events`, `POST /teeth/:id/files`,
  `GET /patients/:id/odontogram.pdf`
- **files:** `POST /patients/:id/files`, `GET /files/:id`,
  `GET /files/:id/content`, `POST /files/:id/archive`
- **appointments:** `GET /appointments?from=&to=&professionalId=`,
  `GET/POST /appointments`, `GET/PATCH /appointments/:id`,
  `POST /appointments/:id/status`, `POST /appointments/:id/signa`,
  `GET /patients/:id/appointments`, `GET /appointments/stats`
- **audit (admin):** `GET /audit?action=&userId=&from=&to=`

## 10. Seguridad

- Contraseñas **Argon2id**; jamás texto plano.
- Sesión opaca en cookie `httpOnly + Secure + SameSite=Lax` (ADR-001), expiración
  configurable, revocable.
- Rate limiting progresivo en `/auth/*` (fuerza bruta).
- RBAC con permisos granulares verificados en backend en cada endpoint.
- Archivos: bucket privado, descarga por proxy autenticado, validación de extensión +
  MIME real (magic bytes) + tamaño, nombre sanitizado, `storageKey` del servidor.
- XSS: React + CSP; CSRF: SameSite + token doble submit; SQLi: Prisma parametrizado.
- Auditoría insert-only de todas las acciones sensibles listadas en el SDD original.
- Privacidad (Ley 25.326 Argentina y datos de salud): controles técnicos implementados;
  el cumplimiento legal debe ser revisado por el responsable del consultorio y asesoría
  legal (conservación, derechos ARCO, registro de bases). **No se afirma cumplimiento
  automático.**

## 11. UI

- Pantalla inicial sin sesión: **solo** iniciar sesión, registrarse con código y
  recuperar contraseña. Cero información interna.
- Layout autenticado: navegación lateral (Dashboard, Pacientes, Agenda, Auditoría,
  Usuarios/Configuración para admin) + header con usuario.
- Dashboard: turnos del día, próximos turnos, pendientes, confirmados, atendidos,
  cancelaciones, ausencias + accesos rápidos (nuevo paciente, buscar paciente, nuevo
  turno, abrir agenda). Sin estadísticas innecesarias.
- Ficha del paciente: pestañas Datos personales · Historia clínica · Odontograma ·
  Estudios/Archivos · Turnos · Historial.
- Todo el texto en español.

## 12. Plan de implementación (fases)

| # | Fase | Estado |
|---|---|---|
| 0 | Infraestructura: monorepo, Docker, config, CI, docs | ✅ Completada (2026-10-07) |
| 1 | Base de datos: schema.prisma, migración inicial, seed | ✅ Completada (2026-10-08) |
| 2 | Autenticación: login, sesión, rate limit, código, recuperación | Pendiente |
| 3 | Usuarios: CRUD, roles, códigos de invitación (panel admin) | Pendiente |
| 4 | Pacientes: CRUD, búsqueda, ficha | Pendiente |
| 5 | Historia clínica | Pendiente |
| 6 | Odontograma (SVG FDI, estados, historial) | Pendiente |
| 7 | Archivos (subida, visualización, descarga, ADR-003) | Pendiente |
| 8 | Agenda y turnos (estados, señas, cancelaciones, ausencias) | Pendiente |
| 9 | Auditoría (interceptor + panel) | Pendiente |
| 10 | PDF del odontograma (Playwright, ADR-004) | Pendiente |
| 11 | Aplicación de escritorio (Tauri) | Pendiente |
| 12 | E2E, hardening, backups/restauración | Pendiente |

**Definición de "terminada":** UI + backend + persistencia + validaciones +
autorización + manejo de errores + tests cuando corresponda + auditoría cuando
corresponda. Una funcionalidad no está terminada solo porque "funciona visualmente".

**Tests obligatorios por fase** (sección de tests del SDD original): autenticación
(login correcto/incorrecto/inactivo, código válido/usado/expirado/revocado), pacientes
(alta, DNI duplicado, edición, búsqueda), turnos (crear, modificar, cancelar, ausencia,
seña), historia clínica (crear, consultar, autor), odontograma (seleccionar, estado,
evento, archivo, historial, PDF) y seguridad (accesos no autorizados rechazados).

## 13. Criterios de aceptación

- Usuario no autenticado no accede a información interna.
- Registro solo con código de invitación válido; el admin puede crear y revocar códigos.
- CRUD de usuarios y pacientes; DNI obligatorio y único.
- Historia clínica con autor y fecha.
- Odontograma FDI interactivo (permanente y temporal) con estados, historial por diente,
  archivos por diente y exportación PDF.
- Agenda con estados de turno, señas, cancelaciones, ausencias e historial conservado.
- Auditoría de acciones relevantes; archivos protegidos.
- Web responsive; escritorio Tauri; ambos sobre el mismo backend.
- Tests para funcionalidades críticas.
