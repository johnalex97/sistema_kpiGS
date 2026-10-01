# Despliegue de Geek Solution en Easypanel

## Objetivo

Publicar Geek Solution desde la rama `main` en un VPS administrado con Easypanel,
usando un dominio temporal de Easypanel inicialmente y permitiendo cambiar a un
dominio propio sin rediseñar los servicios.

## Arquitectura aprobada

Easypanel administrará tres servicios independientes en la misma red privada:

1. **PostgreSQL** con volumen persistente, credenciales protegidas y política de
   respaldos configurada en Easypanel.
2. **API** Express/Prisma construida desde el repositorio. Antes de iniciar,
   aplica `prisma migrate deploy`; después expone un endpoint de salud.
3. **Frontend** Vite construido como imagen estática y publicado por el proxy
   HTTPS de Easypanel.

PostgreSQL no se expone públicamente. Solo la API y el frontend reciben dominio
temporal o propio mediante el proxy de Easypanel.

## Configuración

Las variables sensibles se declaran únicamente en Easypanel. No se guardan en
Git ni en imágenes Docker. La API requiere, como mínimo, `DATABASE_URL`,
secretos de autenticación, `CORS_ORIGIN`, zona horaria y entorno de ejecución.
El frontend recibe durante su build la URL pública de la API.

El cambio posterior de dominio actualiza el dominio asignado a cada servicio,
`CORS_ORIGIN` y la URL pública del frontend; después se redespliegan API y
frontend. Las tablas, migraciones y volumen de PostgreSQL no cambian.

## Despliegue y recuperación

Cada despliegue parte de un commit de `main`: construir imágenes, ejecutar
migraciones versionadas y realizar health checks. Una migración fallida detiene
el inicio de la API. No se utiliza `prisma db push` en producción.

Antes de migraciones importantes se genera un respaldo verificable de
PostgreSQL. La recuperación consiste en restaurar el respaldo en una instancia
aislada, validar el esquema y conmutar solo con una ventana planificada.

## Criterios de aceptación

- Frontend y API responden por el dominio temporal HTTPS de Easypanel.
- API conecta a PostgreSQL privado y supera su health check.
- Las migraciones se aplican una sola vez mediante `prisma migrate deploy`.
- No hay secretos en repositorio, logs ni imágenes.
- El procedimiento de respaldo y restauración está documentado y probado antes
  de operar con datos productivos.
