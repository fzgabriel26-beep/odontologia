# syntax=docker/dockerfile:1
# ------------------------------------------------------------------
# API NestJS para despliegue (ADR-016: demo en Render).
#
# - Contexto de build: RAÍZ del monorepo (pnpm workspaces + turbo).
# - Este entorno no tiene Docker (ADR-009), así que la verificación real
#   ocurre en Render con cada push; el build de producción del API
#   (`turbo build --filter=@odonto/api`) sí se verifica localmente.
# - Las migraciones corren en cada arranque (son idempotentes) y el
#   seed inicial es manual/idempotente (docs/DEPLOY.md).
# ------------------------------------------------------------------
FROM node:24-slim

WORKDIR /app

# pnpm versionado igual que `packageManager` (package.json raíz).
RUN npm install -g pnpm@12.10.1

# Monorepo completo: primero dependencias (lockfile congelado), luego el
# cliente de Prisma generado y el build de producción del API junto con sus
# paquetes de trabajo (turbo respeta dependsOn: ^build).
COPY . .
RUN pnpm install --frozen-lockfile \
  && pnpm generate \
  && pnpm exec turbo build --filter=@odonto/api

# NODE_ENV al final: durante el install/build se necesitan las devDependencies
# (nest, prisma CLI, tsx). `PORT` lo inyecta la plataforma (Render); si no
# existe, la API usa API_PORT/3001 (apps/api/src/main.ts).
ENV NODE_ENV=production \
  TZ=America/Argentina/Buenos_Aires

EXPOSE 3001

# migrate deploy en cada arranque (idempotente) y arranque del servidor.
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && node apps/api/dist/main.js"]
