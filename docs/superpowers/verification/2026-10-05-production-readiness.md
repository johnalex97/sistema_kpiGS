# Preparación operativa de producción — 2026-10-05

## Cambios

- `db:init:production`: carga manual transaccional de roles, permisos y catálogos básicos faltantes, reutilizando la definición del seed con modo de producción.
- Conserva usuarios, contraseñas, catálogos personalizados y registros desactivados; no crea materiales ni operaciones ficticias.
- `deploy:check`: consulta de requisitos básicos y validación de raíz privada de evidencias; no sustituye validación funcional, configuración de periodos KPI ni restauración.
- Prueba de ACL del seed limitada a las actividades que realmente genera; antes consultaba todas las actividades del esquema de pruebas persistente y fallaba por 10 participaciones ajenas al seed.
- Guía de validación funcional y respaldos en `deploy/easypanel/validacion-produccion.md`.

## Evidencia local

- Pruebas nuevas en PostgreSQL: antes del cambio, 2 fallos por materiales demo y sobrescritura de un rol personalizado/desactivado; después, 3 pruebas pasan.
- `npm test` en `server`: 60 archivos, 527 pruebas pasan, 2 omitidas (incluye la comprobación de permisos POSIX no aplicable a Windows).
- `npm run test:db` en `server`: 35 archivos, 416 pruebas pasan después de corregir el alcance de la prueba de ACL.
- `npm run build`, `npm run typecheck`, `npm run lint`: pasan.
- Se comprobó que los dos comandos y `dist/prisma/seed/catalogs.js` están compilados y disponibles para la imagen de producción, sin necesitar `tsx`.
- La suite de base emite avisos de deprecación de `pg` sobre consultas concurrentes de un cliente; no se modificó el adaptador en este trabajo.

## Comprobaciones públicas del VPS

- API `https://sistemakpigs-api-gs.ydz5e4.easypanel.host/api/v1/health`: `success: true`, `environment: production`.
- Frontend `https://sistemakpigs-frontend-gs.ydz5e4.easypanel.host/`: HTTP 200.
- El JavaScript publicado contiene la URL HTTPS correcta de API con `/api/v1`.
- Preflight OPTIONS de `/api/v1/auth/login`: HTTP 204, origen exacto del frontend permitido y `Access-Control-Allow-Credentials: true`.

## Pendientes externos

No hay acceso de esta sesión a la consola privada de Easypanel ni a una sesión autenticada del sistema.

- Redesplegar la API y ejecutar la carga/diagnóstico en el VPS; no se ejecutaron remotamente desde esta sesión.
- Crear o revisar la configuración y metas KPI con fechas vigentes.
- Provisionar y vincular cuentas reales de técnicos; el formulario de perfil no crea credenciales.
- Ejecutar el flujo funcional con evidencia y reincidencia desde el navegador.
- Configurar el proveedor externo de respaldo de PostgreSQL y evidencias y probar restauración aislada.

No se declara el proyecto finalizado ni se convierte una estimación porcentual en verificación formal.
