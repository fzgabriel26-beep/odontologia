# Sistema de Gestión Odontológica

Aplicación profesional para la administración de un consultorio odontológico:
pacientes, historias clínicas, odontograma interactivo FDI, agenda de turnos,
archivos médicos y auditoría.

- **Web:** Next.js + React + TypeScript + Tailwind CSS + shadcn/ui
- **Escritorio:** Tauri (empaqueta la misma app web)
- **Backend:** NestJS (API REST + OpenAPI/Swagger)
- **Datos:** PostgreSQL + Prisma ORM
- **Archivos:** Object Storage compatible con S3 (metadatos en la base de datos)
- **Monorepo:** pnpm + Turborepo
- **Tests:** Vitest (unitarios/integración) + Playwright (e2e)

Especificación completa: [`docs/SDD.md`](docs/SDD.md).
Decisiones arquitectónicas: [`docs/ADR.md`](docs/ADR.md).

## Requisitos

- Node.js >= 20.19
- pnpm >= 10 (`npm install -g pnpm`)
- PostgreSQL >= 16 (en este entorno: instalación local, ver ADR-009; o Docker, ver `docker/README.md`)

## Puesta en marcha

```bash
# 1. Dependencias
pnpm install

# 2. Variables de entorno
cp .env.example .env

# 3. Base de datos (requiere PostgreSQL corriendo)
pnpm db:migrate -- --name init   # migración inicial
pnpm db:seed                     # roles + administrador inicial

# 4. Desarrollo (api + web)
pnpm dev
```

Credenciales iniciales del administrador (desarrollo): `admin@consultorio.local` /
`Admin1234!` — **cambiarlas en cuanto se inicie sesión**.

## Scripts

| Script                    | Descripción                                |
| ------------------------- | ------------------------------------------ |
| `pnpm dev`                | Desarrollo de todas las apps               |
| `pnpm build`              | Genera el cliente Prisma y compila todo    |
| `pnpm typecheck`          | Genera el cliente Prisma y verifica tipos  |
| `pnpm lint`               | ESLint en todo el repositorio              |
| `pnpm test`               | Tests con Vitest (incl. constraints de BD) |
| `pnpm generate`           | Regenera el cliente Prisma                 |
| `pnpm db:migrate -- --name <nombre>` | Crea/aplica migraciones         |
| `pnpm db:seed`            | Seed idempotente (roles + admin)           |
| `pnpm db:studio`          | Prisma Studio                              |
| `pnpm format`             | Formateo con Prettier                      |

## Estructura

```text
apps/
  web/       Next.js (app compartida con escritorio)
  api/       NestJS (única fuente de lógica de negocio)
  desktop/   Tauri (wrapper de apps/web)
packages/
  ui/          Componentes compartidos
  types/       Tipos y enums compartidos
  validation/  Esquemas Zod compartidos (frontend + backend)
  config/      Presets de TypeScript compartidos
prisma/      Esquema y migraciones
docker/      Contenedores de desarrollo
docs/        SDD y ADR
```
