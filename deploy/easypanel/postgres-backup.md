# Respaldo y restauración de PostgreSQL

## Política mínima

- PostgreSQL conserva un volumen persistente administrado por Easypanel.
- Programar al menos un respaldo diario y conservar copias fuera del VPS según la política de la empresa.
- Antes de aplicar una versión con migraciones, generar un respaldo lógico y verificar que se puede restaurar.
- Nunca publicar el puerto de PostgreSQL ni almacenar el volcado en el repositorio.

## Respaldo lógico

Desde una terminal que tenga acceso a la red privada del proyecto, sustituir los marcadores y guardar el archivo fuera del VPS:

```sh
pg_dump --format=custom --no-owner --no-privileges \
  --host=<PRIVATE_POSTGRES_HOST> --port=5432 \
  --username=<POSTGRES_USER> --dbname=<POSTGRES_DB> \
  --file=geek-solution-$(date +%F).dump
```

La contraseña se proporciona con el mecanismo protegido de Easypanel o con un prompt; no se añade al comando ni al historial. Registrar fecha, versión del commit y tamaño del archivo. Probar periódicamente que `pg_restore --list` puede leer el respaldo.

## Restauración controlada

1. Activar una ventana de mantenimiento y detener la API para evitar escrituras.
2. Crear una instancia o base de datos aislada; no restaurar directamente sobre la producción activa.
3. Restaurar y validar el esquema:

```sh
createdb --host=<PRIVATE_POSTGRES_HOST> --username=<POSTGRES_USER> <RESTORE_DB>
pg_restore --clean --if-exists --no-owner --no-privileges \
  --host=<PRIVATE_POSTGRES_HOST> --username=<POSTGRES_USER> \
  --dbname=<RESTORE_DB> geek-solution-YYYY-MM-DD.dump
```

4. Confirmar tablas, usuarios y una muestra de órdenes, actividades, reincidencias y KPI.
5. Cambiar la conexión de la API solamente después de la aprobación operativa; iniciar la API para que ejecute `prisma migrate deploy` y comprobar `/api/v1/health`.
6. Conservar la instancia anterior hasta que la validación funcional concluya. Documentar el incidente y el punto de restauración utilizado.

No usar `prisma db push` en recuperación ni en producción: las migraciones versionadas se aplican con `prisma migrate deploy` durante el arranque de la API.
