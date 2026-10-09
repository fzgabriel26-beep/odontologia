# OPERACIONES — guía operativa (fase 12)

> Sistema de Gestión Odontológica: web + API + PostgreSQL. Esta guía cubre
> backups automáticos, retención configurable y el procedimiento de
> restauración probado (SDD §7). Administración: el personal del consultorio
> gestiona **desde la UI** (usuarios, códigos de invitación, auditoría); esto
> es solo para quien opera la infraestructura.

## 1. Entorno de la demo desplegada

| Componente              | URL / dato                                                      |
| ----------------------- | --------------------------------------------------------------- |
| Web (Next.js, estático) | <https://odontologia-web-6uzt.onrender.com>                     |
| API (NestJS)            | <https://odontologia-api-tlk2.onrender.com> · prefijo `/api/v1` |
| PostgreSQL (free)       | `odontologia-demo` → `dpg-db45splg1s2s738bs4g0-a` (Oregon)      |
| Swagger (docs API)      | `/api/v1/docs` — **apagado en prod**; ver §6                    |
| Cuenta admin demo       | `admin@consultorio.local` / `OdontoDemo!2026`                   |
| Repo                    | GitHub privado `fzgabriel26-beep/odontologia`                   |

**Limitaciones aceptadas del plan free (ADR-016, ADR-017):**

- La API **duerme** a los 15 min sin requests: el primer request tarda ~30-60 s.
- **El PostgreSQL expira el 2026-11-08** (30 días desde su creación, más 14
  días de gracia para migrar; dato confirmado por la API de Render). Al
  expirar la BD se elimina: los backups de §2 son la red de seguridad.
- **Plan free sin backups nativos**: ni exports lógicos (la API responde
  `400 database is a free tier database`) ni snapshots de Render. Por eso el
  mecanismo de §2 es `pg_dump` desde GitHub Actions.
- La conexión **externa** a la BD está habilitada con allowlist
  `0.0.0.0/0` (necesaria para que CI y demo la alcancen; protegida por
  contraseña + TLS `sslmode=require`). Se puede restringir a IPs conocidas
  desde el Dashboard → BD → Connect → IP Allow List.
- Los archivos médicos corren con `STORAGE_DRIVER=fs` **dentro del contenedor**
  de la API: no sobreviven redeploys/reinicios (ver §5).
- `SESSION_COOKIE_SAMESITE=none` (necesario entre dominios onrender.com).

**Al cerrar la demo:** revocar la API key de Render (Dashboard → Account →
API Keys) y borrar el secreto `BACKUP_DATABASE_URL` del repo.

## 2. Backups automáticos de PostgreSQL (SDD §7)

Workflow: **`.github/workflows/backup.yml`** (nombre: `Backup`).

|           |                                                                         |
| --------- | ----------------------------------------------------------------------- |
| Disparo   | Diario **06:00 UTC** (03:00 ART) + manual (`gh workflow run Backup`)    |
| Qué hace  | `pg_dump -Fc` → drill de restauración → publica artefacto               |
| Artefacto | `odontologia-db-<run>` (un `.dump` por corrida), en la run de Actions   |
| Seguridad | Usa el secreto del repo `BACKUP_DATABASE_URL` (jamás está en el código) |

**Retención configurable (default 30 días):**

```bash
# Retención de los artefactos en GitHub Actions:
gh variable set BACKUP_RETENTION_DAYS --body 30
```

La misma variable (nombre `BACKUP_RETENTION_DAYS`) gobierna el borrado local
de `scripts/backup-db.mjs` cuando se corre a mano. Los dumps vencidos se
eliminan automáticamente (script y/o vencimiento del artefacto).

**Backup manual desde CI** (recomendado, no requiere nada local):

```bash
gh workflow run Backup          # crea la run y descarga:
gh run download <run-id> -n odontologia-db-<run> --dir backups/
```

## 3. Backup manual local (opcional)

Requiere `pg_dump` **16+** en el PATH (`postgresql-client` en Linux,
instalador de PostgreSQL en Windows). La conexión externa funciona desde
cualquier red (allowlist `0.0.0.0/0`, ver §1); si fallara, revisar esa
allowlist en el Dashboard de Render.

```bash
$env:BACKUP_DATABASE_URL = 'postgresql://...@dpg-...oregon-postgres.render.com:5432/odontologia_xxx?sslmode=require'
$env:BACKUP_RETENTION_DAYS = 30
node scripts/backup-db.mjs        # genera backups/odontologia_<fecha>.dump
```

El script **nunca imprime la contraseña** y falla con mensaje claro si falta
`pg_dump` o la variable de entorno.

## 4. Procedimiento de restauración (probado)

> Cada corrida del workflow **ya restaura el dump** en un PostgreSQL 16 efímero
> y exige que los conteos coincidan con la fuente (paso _Drill de
> restauración_). Si un dump quedara corrupto, la run diaria falla y se ve en
> Actions — la restauración nunca queda "probada solo en papel".

**Restauración manual, paso a paso** (con `pg_restore` 16+):

```bash
# 1) Crear destino limpio (recomendado: primero restaurar a una BD de prueba)
createdb odontologia_restore

# 2) Restaurar el dump (formato custom .dump, NO psql)
pg_restore --dbname odontologia_restore \
  --no-owner --no-privileges --exit-on-error backups/odontologia_<fecha>.dump

# 3) Verificar conteos contra la fuente (deben coincidir)
#    Los nombres físicos son snake_case (@@map de Prisma).
psql odontologia_restore -c \
  'SELECT (SELECT count(*) FROM users), (SELECT count(*) FROM patients),
          (SELECT count(*) FROM appointments), (SELECT count(*) FROM clinical_records),
          (SELECT count(*) FROM audit_logs);'
```

**Restaurar sobre la BD de Render (solo emergencia, piso de datos vivo):**

```bash
pg_restore --dbname "$BACKUP_DATABASE_URL" --no-owner --no-privileges \
  --clean --if-exists --exit-on-error backups/odontologia_<fecha>.dump
```

- El dump incluye `_prisma_migrations`: después de restaurar,
  `pnpm exec prisma migrate status` debe quedar _up to date_; si el esquema
  avanzó respecto del dump, correr `pnpm exec prisma migrate deploy`.
- Turnos e historias clínicos **no se borran nunca** desde la aplicación
  (regla dura): la restauración es la única vía de recuperación de datos.
- Coherencia archivos ↔ BD: cada `MedicalFile.storageKey` apunta a un objeto
  (`patients/<patientId>/<uuid>.ext`). Restaurar BD sin los archivos deja
  filas cuyo contenido no se puede descargar: si se restaura una BD vieja,
  conviene restaurar también los archivos (§5).

## 5. Backups de archivos médicos (SDD §7: "PostgreSQL + archivos")

**En la demo (fs):** los binarios viven en `storage-files/` **dentro del
contenedor** de la API. No hay cómo alcanzarlos desde fuera (sin shell en
Render) y no sobreviven redeploys — _limitación aceptada y documentada en
ADR-016_; los archivos de la demo son de prueba.

**En producción (driver S3 compatible, `STORAGE_DRIVER=s3`):** los objetos
son privados (solo el backend accede con `STORAGE_*`). El backup es un sync
del bucket a una copia con retención:

```bash
# Backup diario (idéntico esquema de claves que usa la app)
aws s3 sync s3://$STORAGE_BUCKET/ s3://$STORAGE_BUCKET-backup/ --sse AES256

# Restauración (copiar de vuelta los objetos que falten)
aws s3 sync s3://$STORAGE_BUCKET-backup/ s3://$STORAGE_BUCKET/ --sse AES256
```

La retención la gobierna una **lifecycle policy** del bucket (p. ej. delete
objetos de `*-backup/` con > 30 días). Con esto el par BD + archivos queda
respaldado de forma consistente (mismas claves `patients/...`).

## 6. Operaciones frecuentes

| Tarea                      | Cómo                                                                       |
| -------------------------- | -------------------------------------------------------------------------- |
| Ver logs / reiniciar       | Render Dashboard → servicio → Logs / Manual Deploy                         |
| Activar Swagger en prod    | Variable `SWAGGER_ENABLED=true` en la API + redeploy (apagado por defecto) |
| Cambiar credenciales admin | UI → Usuarios (contraseñas con Argon2id; nunca en SQL)                     |
| Invitar personal           | UI → Códigos de invitación (no hay registro público)                       |
| Dormido de la API          | Primer request tras 15 min tarda ~30-60 s (no es un error)                 |
| Rate limit de login        | 10 intentos/min por IP (429 en adelante)                                   |
| Backup puntual             | `gh workflow run Backup` (§2)                                              |

## 7. Checklists

**Antes de que expire la BD (2026-11-08):**

1. Descargar el artefacto más reciente de Actions (§2) y validar el drill.
2. Si la demo se migra a otra BD: restaurar con §4 y verificar conteos.

**Cierre de la demo:**

1. Descargar backups finales (BD) y, si hubiera S3, sincronizarlos (§5).
2. Revocar la API key de Render y borrar `BACKUP_DATABASE_URL` del repo.
3. Exportar/eliminar la instancia de PostgreSQL en Render.
