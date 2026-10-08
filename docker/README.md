# Contenedores de desarrollo

Stack de desarrollo del monorepo: PostgreSQL y MinIO (object storage compatible con S3).

## Levantar

```bash
docker compose -f docker/docker-compose.yml up -d
```

## Detener

```bash
docker compose -f docker/docker-compose.yml down
```

Los datos persisten en volúmenes (`odontologia_pgdata`, `odontologia_miniodata`).
Para eliminarlos por completo (destrucción de datos de desarrollo):

```bash
docker compose -f docker/docker-compose.yml down -v
```

## Accesos (desarrollo)

| Servicio  | URL                      | Credenciales          |
| --------- | ------------------------ | --------------------- |
| PostgreSQL| `localhost:5432`         | odontologia/odontologia |
| MinIO API | `http://localhost:9000`  | minioadmin/minioadmin |
| MinIO UI  | `http://localhost:9001`  | minioadmin/minioadmin |

> Credenciales exclusivas de desarrollo. En producción se usan secretos gestionados
> por el entorno, nunca valores del repositorio.
