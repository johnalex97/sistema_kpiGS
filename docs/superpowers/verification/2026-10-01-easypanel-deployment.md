# Verificación de entrega Easypanel — 2026-10-01

## Resultado local

| Área | Comando | Resultado |
| --- | --- | --- |
| API | `npm test` | 59 archivos aprobados; 522 pruebas aprobadas y 1 omitida. |
| API | `npm run lint`, `npm run typecheck`, `npm run build` | Aprobados. |
| API | `DATABASE_URL=<URL_FICTICIA> npm run db:generate` | Cliente Prisma 7.9.1 generado correctamente. |
| API | `npm test -- tests/deployment/api-container.test.ts` | 1 prueba aprobada; valida migración, exclusión de `.env`, Prisma de producción, configuración de Prisma en runtime, ausencia de build arg secreto y puerto 4000. |
| Frontend | `npm test -- src/deployment/frontend-container.test.ts` | 3 pruebas aprobadas; valida URL de API, exclusión de `.env` y fallback SPA de Nginx. |
| Frontend | `npx eslint vite.config.ts src/config/production-env.ts src/deployment/frontend-container.test.ts` | Aprobado. |
| Frontend | `VITE_API_BASE_URL=https://api.example.com/api/v1 npm run build` | Aprobado. El bundle JavaScript es 643.23 kB (168.85 kB gzip); Vite informa una advertencia de tamaño, no un fallo. |

El build del frontend sin `VITE_API_BASE_URL` fue comprobado y falla deliberadamente con un mensaje explícito. La suite completa del frontend no concluyó dentro de la ventana de 30 segundos disponible en esta consola: una prueba histórica extensa de hooks continuaba ejecutándose y jsdom mostró el aviso conocido `Not implemented: navigation to another Document`. No se interpreta esa ejecución incompleta como una aprobación de la suite completa; debe ejecutarse en CI o en una máquina sin ese límite antes de una liberación crítica.

## Construcción de imágenes pendiente en VPS

Este equipo no tiene el comando `docker`, por lo que no se produjeron imágenes locales ni tamaños medibles. Antes del primer despliegue, ejecutar en el VPS o un runner con Docker:

```sh
cd server
docker build -t geek-solution-api:verify .

cd ..
docker build --build-arg VITE_API_BASE_URL='https://api.example.com/api/v1' -t geek-solution-frontend:verify .
docker image ls geek-solution-api:verify geek-solution-frontend:verify
```

La imagen de API usa internamente una URL ficticia solo para generar Prisma; no pasar valores de producción como argumentos de build. Registrar los tamaños mostrados por `docker image ls` en el registro operativo.

## Smoke test en Easypanel

1. Confirmar que PostgreSQL no tiene dominio ni puerto público y sí tiene volumen persistente y respaldo habilitado.
2. Configurar la API con las variables protegidas de `deploy/easypanel/api.env.example`, incluyendo el host privado de PostgreSQL y el volumen `/data/evidences` ya creado con permisos `0700`.
3. Desplegar la API y comprobar que el log aplica `prisma migrate deploy` una sola vez y que `https://<API_DOMAIN>/api/v1/health` devuelve `200`.
4. Construir el frontend con `VITE_API_BASE_URL=https://<API_DOMAIN>/api/v1`, publicarlo en el puerto `80` y comprobar `https://<FRONTEND_DOMAIN>/`.
5. Iniciar sesión, registrar una actividad, consultar KPI y subir una evidencia de prueba; confirmar que no existen errores CORS ni cookies inseguras.
6. Ejecutar una restauración de prueba conforme a `deploy/easypanel/postgres-backup.md` antes de operar con datos reales.

La entrega no está lista para producción hasta construir ambas imágenes, ejecutar la suite completa del frontend sin el límite local y completar este smoke test en Easypanel.
