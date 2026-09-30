# Dashboard operativo real Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sustituir los datos visuales simulados del resumen por una instantánea operativa, autorizada y persistida de la jornada, actividades recientes y reincidencias.

**Architecture:** Un módulo backend `dashboard` compone en una transacción de lectura datos ya existentes de Técnicos, Actividades, Órdenes y Reincidencias y publica `GET /dashboard/operational`. El cliente React consume ese contrato a través de una API, hook y componentes aislados; KPI permanece independiente y continúa usando su API actual.

**Tech Stack:** Express, TypeScript estricto, Prisma/PostgreSQL, Zod, Vitest, React, React Testing Library y Vite.

**Spec:** `docs/superpowers/specs/2026-09-30-operational-dashboard-design.md`

## Global Constraints

- La fecha pública acepta únicamente `YYYY-MM-DD`; el servidor usa el día de `KPI_TIME_ZONE` cuando se omite.
- No crear migraciones, tablas, permisos ni dependencias nuevas.
- El servidor es la única autoridad de permisos, alcance, tiempo y datos relacionados con reincidencias.
- Reutilizar las reglas de visibilidad existentes; una sección sin autorización se omite mediante `capabilities`, sin filtrar información.
- Toda lectura compuesta usa `RepeatableRead`, excluye registros eliminados/padres inactivos y nunca expone observaciones, evidencias o datos internos.
- El Dashboard no ejecuta mutaciones; la navegación conduce a los módulos fuente.
- No quedan imports de `mocks/data`, `Work`, `initialWorks` ni `technicians` en producción.
- La actualización automática es cada 60 segundos sólo con `document.visibilityState === "visible"`; conserva la última instantánea válida durante refresh.

## Review Focus

- Una fecha inválida, como `2026-2-3` o `2026-02-30`, debe responder 400 sin consultar PostgreSQL — Task 1.
- Un usuario KPI propio no debe recibir compañeros, actividades ni reincidencias fuera de sus permisos de los módulos origen — Tasks 2 y 3.
- Una actividad abierta antes de medianoche de Honduras y actualizada después debe ser visible el día correcto sin cambiar de día por UTC — Task 2.
- Un 403 parcial debe ocultar únicamente el bloque afectado y conservar KPI, datos operativos autorizados y accesibilidad — Tasks 3, 5 y 7.
- El polling no puede publicar una respuesta vieja tras cambiar de fecha, desmontar la página o volver la pestaña invisible — Task 5.

---

## File structure

- `server/src/dashboard/dashboard.types.ts`: contrato interno y público, actores, capacidades y filtros normalizados.
- `server/src/dashboard/dashboard.time.ts`: cálculo puro del día Honduras y orden de impacto.
- `server/src/dashboard/dashboard.schemas.ts`: validación del query de fecha.
- `server/src/dashboard/dashboard.repository.ts`: lectura Prisma consistente y limitada.
- `server/src/dashboard/dashboard.service.ts`: resolución de alcance/capacidades y mapeo seguro.
- `server/src/dashboard/dashboard.controller.ts` / `dashboard.routes.ts`: frontera HTTP.
- `server/tests/dashboard/*.test.ts`: pruebas unitarias, repositorio, HTTP y PostgreSQL.
- `src/models/dashboard.ts`: contrato React equivalente al contrato público.
- `src/api/dashboard.ts`: cliente tipado de la ruta consolidada.
- `src/hooks/useOperationalDashboard.ts`: estado async, abortos, refresh y polling visible.
- `src/components/dashboard/OperationalTeamBoard.tsx`: jornada real por técnico.
- `src/components/dashboard/RecentActivityTable.tsx`: actividad reciente sin `Work`.
- `src/components/dashboard/RecurrenceFocusPanel.tsx`: foco autorizado de reincidencias.
- `src/pages/DashboardPage.tsx`, `src/layouts/AppShell.tsx`: ensamblaje/navegación y retiro de mocks.
- `src/components/dashboard/dashboard.css` o estilo existente de Dashboard: estilos responsive y de estados.

### Task 1: Contratos, fechas y frontera HTTP del Dashboard

**Files:**
- Create: `server/src/dashboard/dashboard.types.ts`
- Create: `server/src/dashboard/dashboard.time.ts`
- Create: `server/src/dashboard/dashboard.schemas.ts`
- Create: `server/src/dashboard/dashboard.controller.ts`
- Create: `server/src/dashboard/dashboard.routes.ts`
- Test: `server/tests/dashboard/dashboard-schemas.test.ts`
- Test: `server/tests/dashboard/dashboard-controller.test.ts`

**Interfaces:**
- Produces: `OperationalDashboardQuery`, `PublicOperationalDashboard`, `DashboardActorContext`, `parseOperationalDate(query, timeZone)`, `createDashboardController(service)`, and `createDashboardRouter(env, database, authService)`.
- Consumes: API envelope/error conventions from KPI and authentication/permission middleware.

- [ ] **Step 1: Write failing schema and date-boundary tests**

Cover omitted date, `2026-09-30`, malformed date, impossible calendar date, and the Honduras start/end instants for a valid date.

- [ ] **Step 2: Run the focused tests to verify failure**

Run: `npm test -- tests/dashboard/dashboard-schemas.test.ts` from `server/`.
Expected: FAIL because Dashboard schema/time helpers do not exist.

- [ ] **Step 3: Implement query schema and pure time helpers**

Implement `operationalDashboardQuerySchema` and `getOperationalDayBounds(date: string, timeZone: string): { start: Date; end: Date }`. Use the same timezone library/pattern already used by KPI; reject invalid calendar dates rather than relying on JavaScript date rollover.

- [ ] **Step 4: Write failing controller/route tests**

Assert `GET /dashboard/operational` returns the standard envelope, requires authentication plus changed password plus `KPI_VIEW_ALL | KPI_VIEW_OWN`, and forwards normalized query and actor to `getOperationalDashboard`.

- [ ] **Step 5: Implement controller and route**

Use the established `parse`, `actor` and `success` conventions from `kpis.controller.ts`. Route mutations are not added and origin middleware is unnecessary for this GET.

- [ ] **Step 6: Run focused tests to verify pass**

Run: `npm test -- tests/dashboard/dashboard-schemas.test.ts tests/dashboard/dashboard-controller.test.ts` from `server/`.
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/src/dashboard server/tests/dashboard/dashboard-schemas.test.ts server/tests/dashboard/dashboard-controller.test.ts
git commit -m "feat(panel): definir contrato operativo"
```

### Task 2: Repositorio consistente y mapeo seguro de la instantánea

**Files:**
- Create: `server/src/dashboard/dashboard.repository.ts`
- Create: `server/src/dashboard/dashboard.repository.types.ts`
- Test: `server/tests/dashboard/dashboard-repository.test.ts`
- Test: `server/tests/database/dashboard-persistence.test.ts`

**Interfaces:**
- Consumes: `OperationalDashboardQuery`, bounds de Task 1 y selecciones Prisma de los módulos fuente cuando sean reutilizables.
- Produces: `DashboardReadRepository.readOperationalDashboard(input)` con registros crudos limitados a técnicos, actividades recientes y reincidencias abiertas.

- [ ] **Step 1: Write failing repository tests**

Probar `RepeatableRead`, límite de cinco actividades ordenadas `updatedAt DESC, id DESC`, exclusión de borrados/padres inactivos, actividad `IN_PROGRESS/PAUSED`, y selección de prioridad `HIGH → MEDIUM → LOW`.

- [ ] **Step 2: Run the unit test to verify failure**

Run: `npm test -- tests/dashboard/dashboard-repository.test.ts` from `server/`.
Expected: FAIL because the repository is absent.

- [ ] **Step 3: Implement read-only Prisma repository**

Implement `createDashboardReadRepository(database)`. Su entrada recibe scopes ya resueltos, límites de día y capacidades, y usa una sola transacción `RepeatableRead`. No consultar detalles por fila ni exponer campos internos.

- [ ] **Step 4: Add PostgreSQL persistence scenarios**

Sembrar actividades a ambos lados de medianoche Honduras, casos abiertos/cerrados de impactos distintos, filas eliminadas e inaccesibles; comprobar que la respuesta materializada coincide con el contrato de la spec.

- [ ] **Step 5: Run repository matrices**

Run: `npm test -- tests/dashboard/dashboard-repository.test.ts` and `npm run test:db -- tests/database/dashboard-persistence.test.ts` from `server/`.
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/dashboard/dashboard.repository.ts server/src/dashboard/dashboard.repository.types.ts server/tests/dashboard/dashboard-repository.test.ts server/tests/database/dashboard-persistence.test.ts
git commit -m "feat(panel): consultar jornada operativa"
```

### Task 3: Servicio, alcances, capacidades e integración de la ruta

**Files:**
- Create: `server/src/dashboard/dashboard.service.ts`
- Modify: `server/src/app.ts`
- Test: `server/tests/dashboard/dashboard-service.test.ts`
- Test: `server/tests/dashboard/dashboard-http.test.ts`

**Interfaces:**
- Consumes: `DashboardReadRepository` de Task 2, actor autenticado y los permisos de KPI, Técnicos, Actividades y Reincidencias.
- Produces: `createDashboardService(repository, timeZone, now).getOperationalDashboard(query, actor): Promise<PublicOperationalDashboard>`.

- [ ] **Step 1: Write failing service tests for authorization**

Cubrir actor global, actor propio, falta de `TECHNICIANS_VIEW`, falta de permisos de Actividades, falta de permisos de Reincidencias, y asegurar que IDs/contadores no autorizados no llegan a la salida.

- [ ] **Step 2: Run service tests to verify failure**

Run: `npm test -- tests/dashboard/dashboard-service.test.ts` from `server/`.
Expected: FAIL because service/capabilities do not exist.

- [ ] **Step 3: Implement scope and public mapping**

Implement capacidades independientes `team`, `recentActivities`, `recurrences`; derive scope from permisos existentes, no de roles. Mapear sólo los campos públicos definidos en la spec, con `recurrences: null` para bloque no autorizado.

- [ ] **Step 4: Write failing HTTP integration tests**

Validar 200 con todas las secciones autorizadas, 200 con secciones omitidas, 401 sin sesión, 403 con contraseña pendiente o sin KPI, y formato estándar con `generatedAt`.

- [ ] **Step 5: Wire router into the application and implement HTTP path**

Registrar `createDashboardRouter` en `server/src/app.ts` bajo `/api/v1/dashboard`, compartiendo el cliente Prisma/configuración creados por la aplicación.

- [ ] **Step 6: Run backend focused suite**

Run: `npm test -- tests/dashboard` from `server/`.
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/src/dashboard server/src/app.ts server/tests/dashboard/dashboard-service.test.ts server/tests/dashboard/dashboard-http.test.ts
git commit -m "feat(panel): publicar resumen operativo autorizado"
```

### Task 4: Modelos y API tipada del frontend

**Files:**
- Create: `src/models/dashboard.ts`
- Create: `src/api/dashboard.ts`
- Test: `src/api/dashboard.test.ts`

**Interfaces:**
- Consumes: el contrato `PublicOperationalDashboard` de Task 3 y `requestJson`.
- Produces: `OperationalDashboard`, `OperationalDashboardApi`, `createOperationalDashboardApi()` y `getOperationalDashboard(date?, signal?)`.

- [ ] **Step 1: Write failing API contract tests**

Verificar URL sin fecha, URL con `date=2026-09-30`, señal AbortSignal, respuesta tipada y propagación de `ApiClientError`.

- [ ] **Step 2: Run API test to verify failure**

Run: `npm test -- src/api/dashboard.test.ts`.
Expected: FAIL because dashboard client/model are absent.

- [ ] **Step 3: Implement immutable frontend contracts and API**

Crear tipos que sólo representen la respuesta pública. `getOperationalDashboard` no acepta IDs de usuario/técnico, ni transforma permisos.

- [ ] **Step 4: Run API test to verify pass**

Run: `npm test -- src/api/dashboard.test.ts`.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/models/dashboard.ts src/api/dashboard.ts src/api/dashboard.test.ts
git commit -m "feat(panel): consumir resumen operativo"
```

### Task 5: Hook de lectura, refresh y polling seguro

**Files:**
- Create: `src/hooks/useOperationalDashboard.ts`
- Test: `src/hooks/useOperationalDashboard.test.tsx`

**Interfaces:**
- Consumes: `OperationalDashboardApi.getOperationalDashboard(date?, signal?)` de Task 4.
- Produces: `useOperationalDashboard(api, { date?, pollIntervalMs? })` con `state`, `retry()`, `refresh()` y `setDate(date?)`.

- [ ] **Step 1: Write failing hook tests**

Cubrir carga inicial, éxito, estado vacío, error conservando datos, retry, abort al desmontar/cambiar fecha, respuesta tardía ignorada, intervalo de 60 segundos visible y pausa en pestaña oculta.

- [ ] **Step 2: Run hook test to verify failure**

Run: `npm test -- src/hooks/useOperationalDashboard.test.tsx`.
Expected: FAIL because hook is absent.

- [ ] **Step 3: Implement isolated async state**

Usar `AbortController` y una generación creciente por carga. No iniciar intervalos múltiples; al cambiar `visibilitychange`, detener/reanudar una única programación. El valor predeterminado es 60_000 ms y puede ser menor sólo en pruebas.

- [ ] **Step 4: Run hook test to verify pass**

Run: `npm test -- src/hooks/useOperationalDashboard.test.tsx`.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useOperationalDashboard.ts src/hooks/useOperationalDashboard.test.tsx
git commit -m "feat(panel): actualizar jornada de forma segura"
```

### Task 6: Componentes accesibles de jornada, actividad y reincidencias

**Files:**
- Create: `src/components/dashboard/OperationalTeamBoard.tsx`
- Create: `src/components/dashboard/OperationalTeamBoard.test.tsx`
- Create: `src/components/dashboard/RecentActivityTable.tsx`
- Create: `src/components/dashboard/RecentActivityTable.test.tsx`
- Create: `src/components/dashboard/RecurrenceFocusPanel.tsx`
- Create: `src/components/dashboard/RecurrenceFocusPanel.test.tsx`
- Modify: estilos existentes del Dashboard o Create: `src/components/dashboard/dashboard.css`

**Interfaces:**
- Consumes: tipos de Task 4 y callbacks de navegación simples.
- Produces: tres componentes de presentación sin llamadas HTTP ni imports de mocks.

- [ ] **Step 1: Write failing component tests**

Verificar fila activa/pausada/sin actividad, etiqueta textual de estado, hora y duración; tabla real de cinco/ninguna actividad; foco con caso, foco cero y bloque no autorizado; botones accesibles de navegación.

- [ ] **Step 2: Run focused component tests to verify failure**

Run: `npm test -- src/components/dashboard/OperationalTeamBoard.test.tsx src/components/dashboard/RecentActivityTable.test.tsx src/components/dashboard/RecurrenceFocusPanel.test.tsx`.
Expected: FAIL because components are absent.

- [ ] **Step 3: Implement presentation components and responsive styles**

Usar texto antes que color, nombres accesibles y controles de al menos 44 px. Sustituir la regla horaria y chunks simulados por el estado/actividad recibidos. El temporizador sólo se muestra para actividad abierta y se basa en `generatedAt` + tiempo local, sin modificar datos del servidor.

- [ ] **Step 4: Run component tests to verify pass**

Run: `npm test -- src/components/dashboard/OperationalTeamBoard.test.tsx src/components/dashboard/RecentActivityTable.test.tsx src/components/dashboard/RecurrenceFocusPanel.test.tsx`.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard
git commit -m "feat(panel): mostrar operación real del equipo"
```

### Task 7: Ensamblaje del resumen y retirada de mocks

**Files:**
- Modify: `src/pages/DashboardPage.tsx`
- Modify: `src/pages/DashboardPage.test.tsx`
- Modify: `src/layouts/AppShell.tsx`
- Modify: `src/layouts/AppShell.test.tsx`
- Modify: `src/models/app.ts`
- Modify: `src/mocks/data.ts`
- Test: `src/dashboard-flow.integration.test.tsx`

**Interfaces:**
- Consumes: KPI existente, hook de Task 5 y componentes de Task 6.
- Produces: `DashboardPage` sin prop `works`, con callbacks `onGoActivities`, `onGoTechnicians` y `onGoRecurrence`.

- [ ] **Step 1: Write failing integration tests**

Renderizar KPI y dashboard operativo juntos; verificar carga, datos, refresh visible, error con datos preservados, capacidades parciales, navegación y ausencia de actividad/reincidencias. Añadir regresión que falla si producción importa `initialWorks`, `technicians` o `Work`.

- [ ] **Step 2: Run integration tests to verify failure**

Run: `npm test -- src/pages/DashboardPage.test.tsx src/dashboard-flow.integration.test.tsx`.
Expected: FAIL because Dashboard todavía usa props y mocks.

- [ ] **Step 3: Assemble Dashboard and AppShell**

Inyectar API de dashboard para pruebas, conservar `useKpiDashboard` sin cambios funcionales y conectar callbacks a `changePage`. Mostrar loading/error/empty independiente del KPI. Retirar de `mocks/data.ts` y `models/app.ts` sólo los contratos exclusivos del Dashboard, preservando cualquier mock todavía usado por pruebas aisladas.

- [ ] **Step 4: Run integration tests to verify pass**

Run: `npm test -- src/pages/DashboardPage.test.tsx src/dashboard-flow.integration.test.tsx src/layouts/AppShell.test.tsx`.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/DashboardPage.tsx src/pages/DashboardPage.test.tsx src/layouts/AppShell.tsx src/layouts/AppShell.test.tsx src/models/app.ts src/mocks/data.ts src/dashboard-flow.integration.test.tsx
git commit -m "feat(panel): integrar resumen operativo"
```

### Task 8: Verificación completa y documentación de estado

**Files:**
- Modify: `README.md`
- Modify: `docs/architecture/current-state.md`
- Modify: `docs/plans/implementation-plan.md`

**Interfaces:**
- Consumes: entregables de Tasks 1–7.
- Produces: comandos reproducibles, pendientes actualizados y fase 12 marcada completa sólo si no quedan otros subbloques abiertos.

- [ ] **Step 1: Update documentation tests/claims**

Documentar endpoint, permisos/capacidades, polling visible, comandos de prueba y retiro de mocks. Marcar Dashboard operativo como completado; conservar Evidencias globales como pendiente si aún no se implementó.

- [ ] **Step 2: Run focused and full frontend verification**

Run: `npm test -- src/dashboard-flow.integration.test.tsx`, then `npm test -- --pool=threads --maxWorkers=1`, `npm run lint`, and `npm run build` from repository root.
Expected: all pass; an existing bundle-size warning may remain documented but is not a failure.

- [ ] **Step 3: Run full backend verification**

Run: `npm test`, `npm run test:db -- tests/database/dashboard-persistence.test.ts`, `npm run typecheck`, `npm run lint`, and `npm run build` from `server/`.
Expected: all pass with the test schema configured as existing backend tests require.

- [ ] **Step 4: Inspect final diff**

Run: `git diff --check main...HEAD` and `rg -n "initialWorks|technicians|\\bWork\\b" src --glob "!**/*.test.*"`.
Expected: no whitespace errors and no production Dashboard mock references.

- [ ] **Step 5: Commit**

```bash
git add README.md docs/architecture/current-state.md docs/plans/implementation-plan.md
git commit -m "docs(panel): registrar dashboard operativo"
```
