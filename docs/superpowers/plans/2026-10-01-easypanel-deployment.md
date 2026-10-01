# Easypanel Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar imágenes Docker reproducibles y documentación para publicar Geek Solution en Easypanel con PostgreSQL privado.

**Architecture:** El frontend y la API se construyen en imágenes separadas. Easypanel gestiona PostgreSQL, variables protegidas, volúmenes, dominio temporal y proxy HTTPS; la API aplica migraciones antes de iniciar.

**Tech Stack:** Docker multi-stage, Node 20, Vite, Express, Prisma 7, PostgreSQL y Easypanel.

**Spec:** `docs/superpowers/specs/2026-10-01-easypanel-deployment-design.md`

## Global Constraints

- No incluir secretos, archivos `.env` ni URLs privadas en Git o imágenes.
- PostgreSQL no se expone públicamente y conserva volumen persistente.
- Producción usa únicamente `prisma migrate deploy`; nunca `prisma db push`.
- El dominio temporal de Easypanel debe poder sustituirse por uno propio mediante variables.

## Review Focus

- Imagen API sin `DATABASE_URL`: debe fallar con mensaje claro antes de servir tráfico.
- Migración fallida: API no debe iniciar.
- Frontend con URL de API ausente: build debe fallar de forma explícita.
- El contenedor final no debe contener `.env` ni dependencias de desarrollo innecesarias.
- Health checks deben responder después de que los servicios estén disponibles.

---

### Task 1: Contenedor de API y migraciones seguras

**Files:**
- Create: `server/Dockerfile`
- Create: `server/docker-entrypoint.sh`
- Create: `server/.dockerignore`
- Modify: `server/package.json`
- Test: `server/tests/deployment/api-container.test.ts`

**Interfaces:**
- Produces imagen API que ejecuta `prisma migrate deploy` y `npm start`.
- Consumes variables protegidas `DATABASE_URL`, secretos de autenticación, CORS y zona horaria.

- [ ] Escribir pruebas que validen entrypoint, migración y exclusión de secretos; ejecutar y confirmar fallo.
- [ ] Implementar Dockerfile multi-stage Node 20, script de inicio con `set -e` y `.dockerignore`.
- [ ] Añadir script `start:production` si hace falta y verificar `docker build` sin secretos.
- [ ] Ejecutar pruebas de despliegue, `npm run typecheck` y build de API; confirmar PASS.
- [ ] Commit: `feat(despliegue): contenerizar API con migraciones`.

### Task 2: Contenedor de frontend configurable

**Files:**
- Create: `Dockerfile`
- Create: `.dockerignore`
- Modify: `src/config` o la configuración Vite existente
- Modify: `.env.example`
- Test: `src/deployment/frontend-container.test.ts`

**Interfaces:**
- Produces imagen estática con `VITE_API_BASE_URL` requerido durante build.
- Consumes URL HTTPS pública de la API declarada en Easypanel.

- [ ] Escribir pruebas para URL ausente y URL incluida en el build; ejecutar y confirmar fallo.
- [ ] Implementar build multi-stage y servidor estático sin secretos.
- [ ] Verificar build Docker y `npm run build`; confirmar PASS.
- [ ] Commit: `feat(despliegue): contenerizar frontend configurable`.

### Task 3: Configuración de Easypanel y operación

**Files:**
- Create: `deploy/easypanel/README.md`
- Create: `deploy/easypanel/api.env.example`
- Create: `deploy/easypanel/frontend.env.example`
- Create: `deploy/easypanel/postgres-backup.md`
- Modify: `README.md`

**Interfaces:**
- Produces guía para crear PostgreSQL, API y frontend en Easypanel y validar el dominio temporal.

- [ ] Documentar variables por servicio, red privada, volumen, health checks, backup y restauración.
- [ ] Añadir checklist para cambio de dominio propio: URL frontend/API, CORS y redespliegue.
- [ ] Verificar que ejemplos no contienen secretos y que comandos usan `prisma migrate deploy`.
- [ ] Commit: `docs(despliegue): documentar operación Easypanel`.

### Task 4: Verificación integral de entrega

**Files:**
- Modify: `README.md`
- Create: `docs/superpowers/verification/2026-10-01-easypanel-deployment.md`

- [ ] Ejecutar tests, typecheck, lint y builds de frontend/API.
- [ ] Construir ambas imágenes localmente con variables de ejemplo no sensibles.
- [ ] Registrar resultados, tamaños de imagen y pasos de smoke test en Easypanel.
- [ ] Commit: `docs(despliegue): verificar entrega Easypanel`.
