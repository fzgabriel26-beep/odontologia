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

- Node.js >= 20
- pnpm >= 10 (`npm install -g pnpm`)
- Docker + Docker Compose (PostgreSQL y MinIO de desarrollo)

## Puesta en marcha

```bash
# 1. Dependencias
pnpm install

# 2. Contenedores de desarrollo (PostgreSQL + MinIO)
docker compose -f docker/docker-compose.yml up -d

# 3. Variables de entorno
cp .env.example .env

# 4. Desarrollo (api + web)
pnpm dev
```

## Scripts

| Script            | Descripción                              |
| ----------------- | ---------------------------------------- |
| `pnpm dev`        | Desarrollo de todas las apps             |
| `pnpm build`      | Build de todas las apps y paquetes       |
| `pnpm typecheck`  | Verificación de tipos en todo el monorepo|
| `pnpm lint`       | ESLint en todo el repositorio            |
| `pnpm test`       | Tests con Vitest                         |
| `pnpm format`     | Formateo con Prettier                    |

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
