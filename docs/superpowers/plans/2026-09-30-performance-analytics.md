# Análisis de rendimiento técnico Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir un panel autorizado y exportable que permita evaluar el rendimiento y la calidad de cada técnico con hechos operativos y KPI explicables.

**Architecture:** Un módulo backend `performance-analytics` consulta, en una instantánea consistente, resultados KPI vigentes y hechos de órdenes, actividades y reincidencias. El servicio aplica el alcance, decide si el resultado es oficial o preview y produce alertas; el controlador serializa el mismo resumen como JSON o CSV. El frontend añade un cliente tipado, un hook cancelable y una página de análisis que reutiliza el shell y el lenguaje visual de Geek Solution.

**Tech Stack:** Express, TypeScript estricto, Prisma/PostgreSQL, Zod, Vitest, React, React Testing Library, Vite y CSV nativo sin dependencias nuevas.

**Spec:** `docs/superpowers/specs/2026-09-30-performance-analytics-design.md`

## Global Constraints

- No crear migraciones, tablas, dependencias ni una segunda fórmula KPI.
- El servidor es la única autoridad para alcance, periodos, alertas, datos y CSV.
- `KPI_VIEW_ALL` permite equipo completo; `KPI_VIEW_OWN` no expone técnicos, medias ni alertas de terceros.
- Semanas, meses y años usan `KPI_TIME_ZONE`; fechas y filtros inválidos se rechazan antes de PostgreSQL.
- El resultado oficial se reutiliza sin reescritura; filtros operativos producen `PREVIEW` si no corresponden a una instantánea oficial completa.
- CSV refleja exactamente las filas y el alcance autorizados del resumen; no se persiste ningún archivo.
- No se implementan auditoría general, PDF/XLSX, envíos programados ni umbrales editables.
- Consultas compuestas excluyen registros archivados/padres inactivos y usan una instantánea consistente.
- La interfaz no fabrica métricas: conserva datos válidos durante refresh, aborta lecturas obsoletas y es accesible en escritorio y móvil.

## Review Focus

- Un actor con `KPI_VIEW_OWN` no puede ampliar técnico, CSV ni URL para conocer nombre, promedio o alerta de otro técnico — Task 3 y Task 4.
- Un filtro de cliente/sucursal/servicio/estado no puede etiquetar como oficial un KPI que no corresponde al subconjunto — Task 3.
- Dos pausas cortas, participaciones parciales y actividades sin tiempo terminado deben producir minutos coherentes o una explicación de insuficiencia — Task 2.
- Una reincidencia cerrada atribuible debe afectar calidad/tasa una vez; descartada, no atribuible o archivada no debe hacerlo — Task 2 y Task 3.
- Comillas, saltos de línea y caracteres acentuados en nombres/descripciones deben resultar en CSV válido y en el mismo orden que el JSON — Task 4.

---

### Task 1: Contrato, periodos y validación de consulta

**Files:**
- Create: `server/src/performance-analytics/performance-analytics.types.ts`
- Create: `server/src/performance-analytics/performance-analytics.schemas.ts`
- Create: `server/src/performance-analytics/performance-analytics.period.ts`
- Test: `server/tests/performance-analytics/performance-analytics-schemas.test.ts`
- Test: `server/tests/performance-analytics/performance-analytics-period.test.ts`

**Interfaces:**
- Produces `PerformanceAnalyticsQuery`, `PerformanceGranularity`, `PerformanceActorContext`, `PerformanceAccessScope`, `parsePerformanceAnalyticsQuery()` y `resolvePerformancePeriod()`.
- Consumes el formato de periodo y actor existente en `server/src/kpis`.

- [ ] **Step 1: Write failing schema and period tests**

Cover a valid week, month and year; malformed period starts; invalid UUID filters; invalid order status; Honduras boundaries; and a query that uses at least one operational filter.

- [ ] **Step 2: Run the focused tests to verify failure**

Run: `npm test -- tests/performance-analytics/performance-analytics-schemas.test.ts tests/performance-analytics/performance-analytics-period.test.ts` from `server/`.
Expected: FAIL because the performance analytics contracts do not exist.

- [ ] **Step 3: Implement the typed query boundary**

Validate `granularity`, `periodStart`, optional `technicianId`, `clientId`, `branchId`, `serviceTypeId` and order status. Resolve the inclusive/exclusive period through `KPI_TIME_ZONE`, preserving the `YYYY-MM-DD` public representation.

- [ ] **Step 4: Run the focused tests to verify pass**

Run the command from Step 2. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/performance-analytics/performance-analytics.types.ts server/src/performance-analytics/performance-analytics.schemas.ts server/src/performance-analytics/performance-analytics.period.ts server/tests/performance-analytics
git commit -m "feat(analisis): definir consulta de rendimiento"
```

### Task 2: Repositorio de hechos y resultados de rendimiento

**Files:**
- Create: `server/src/performance-analytics/performance-analytics.repository.types.ts`
- Create: `server/src/performance-analytics/performance-analytics.repository.ts`
- Test: `server/tests/performance-analytics/performance-analytics-repository.test.ts`
- Test: `server/tests/database/performance-analytics-persistence.test.ts`

**Interfaces:**
- Consumes `PerformanceAnalyticsQuery`, periodo resuelto y `PerformanceAccessScope`.
- Produces `PerformanceAnalyticsRepository.readSnapshot(input)`, que devuelve técnicos autorizados, resultados KPI actuales, órdenes, actividades finalizadas y reincidencias cerradas atribuibles, sin campos privados.

- [ ] **Step 1: Write failing repository tests**

Assert one transacción `RepeatableRead`; exclusión de borrados/padres inactivos; equipo limitado para alcance propio; participación parcial; pausas; estados de orden; y reincidencias cerradas atribuibles una sola vez.

- [ ] **Step 2: Run repository tests to verify failure**

Run: `npm test -- tests/performance-analytics/performance-analytics-repository.test.ts` from `server/`.
Expected: FAIL because the repository is absent.

- [ ] **Step 3: Implement `createPerformanceAnalyticsRepository(database)`**

Use selecciones Prisma limitadas y filtros anidados coherentes con los módulos fuente. Exponer datos crudos tipados para: trabajos completados/tardíos/cancelados, minutos registrados/productivos/pausados, duración completada, participaciones y reincidencias atribuibles. Reutilizar resultados KPI `isCurrent` cuando el periodo/filtro permite una lectura oficial.

- [ ] **Step 4: Add PostgreSQL persistence scenarios**

Sembrar una participación parcial, dos pausas cortas, una orden archivada, una reincidencia descartada y una atribuible; comprobar métricas y que el alcance propio no recibe filas ajenas.

- [ ] **Step 5: Run repository matrices**

Run: `npm test -- tests/performance-analytics/performance-analytics-repository.test.ts` and `npm run test:db -- tests/database/performance-analytics-persistence.test.ts` from `server/`.
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/performance-analytics/performance-analytics.repository.ts server/src/performance-analytics/performance-analytics.repository.types.ts server/tests/performance-analytics/performance-analytics-repository.test.ts server/tests/database/performance-analytics-persistence.test.ts
git commit -m "feat(analisis): consultar hechos de rendimiento"
```

### Task 3: Servicio, métricas explicables y alertas

**Files:**
- Create: `server/src/performance-analytics/performance-analytics.service.ts`
- Create: `server/src/performance-analytics/performance-analytics.alerts.ts`
- Test: `server/tests/performance-analytics/performance-analytics-service.test.ts`
- Test: `server/tests/performance-analytics/performance-analytics-alerts.test.ts`

**Interfaces:**
- Consumes `PerformanceAnalyticsRepository.readSnapshot`, actor, query y periodo de Tasks 1–2.
- Produces `createPerformanceAnalyticsService(repository, timeZone, now).getSummary(query, actor)` and typed `PerformanceAnalyticsSummary`/`PerformanceTechnicianRow`.

- [ ] **Step 1: Write failing service and alert tests**

Cover official vs preview, dimensions not applicable, period comparison, team average only for global scope, no-data explanation, `CRITICAL` quality `< 60`, critical attributable recurrence rate `> 10%`, `ATTENTION` dimensions `< 70`, and `INFO` for missing inputs.

- [ ] **Step 2: Run focused service tests to verify failure**

Run: `npm test -- tests/performance-analytics/performance-analytics-service.test.ts tests/performance-analytics/performance-analytics-alerts.test.ts` from `server/`.
Expected: FAIL because service and alert mapper do not exist.

- [ ] **Step 3: Implement metric and alert mapping**

Map only public fields. Reuse the official KPI result for unfiltered/compatible periods; mark filtered or incomplete facts as `PREVIEW`. Calculate operational counts/times from repository facts, derive comparison only from an authorized previous period, and centralize the three alert thresholds in `performance-analytics.alerts.ts`.

- [ ] **Step 4: Run focused tests to verify pass**

Run the command from Step 2. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/performance-analytics/performance-analytics.service.ts server/src/performance-analytics/performance-analytics.alerts.ts server/tests/performance-analytics/performance-analytics-service.test.ts server/tests/performance-analytics/performance-analytics-alerts.test.ts
git commit -m "feat(analisis): calcular desempeño y alertas"
```

### Task 4: Frontera HTTP y exportación CSV autorizada

**Files:**
- Create: `server/src/performance-analytics/performance-analytics.csv.ts`
- Create: `server/src/performance-analytics/performance-analytics.controller.ts`
- Create: `server/src/performance-analytics/performance-analytics.routes.ts`
- Modify: `server/src/routes/index.ts`
- Test: `server/tests/performance-analytics/performance-analytics-http.test.ts`
- Test: `server/tests/performance-analytics/performance-analytics-csv.test.ts`

**Interfaces:**
- Consumes `getSummary(query, actor)` from Task 3.
- Produces `GET /api/v1/performance-analytics/summary` and `GET /api/v1/performance-analytics/export.csv`.

- [ ] **Step 1: Write failing HTTP and CSV tests**

Assert envelope/status on summary; 400 before repository on invalid query; 401 unauthenticated; 403 without KPI access; own scope row suppression; `text/csv; charset=utf-8`, attachment filename, stable header/row order, proper escaping and parity with JSON rows.

- [ ] **Step 2: Run focused tests to verify failure**

Run: `npm test -- tests/performance-analytics/performance-analytics-http.test.ts tests/performance-analytics/performance-analytics-csv.test.ts` from `server/`.
Expected: FAIL because routes/controllers are absent.

- [ ] **Step 3: Implement routes and CSV serialization**

Apply authentication and changed-password middleware, then `requireAnyPermission("KPI_VIEW_ALL", "KPI_VIEW_OWN")`. Build the actor with the established controller pattern. Generate CSV in memory from the exact mapped summary rows with RFC 4180 escaping and no internal fields.

- [ ] **Step 4: Run backend module suite**

Run: `npm test -- tests/performance-analytics` from `server/`.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/performance-analytics server/src/routes/index.ts server/tests/performance-analytics
git commit -m "feat(analisis): publicar resumen y exportación"
```

### Task 5: Contrato, cliente y hook del frontend

**Files:**
- Create: `src/models/performance-analytics.ts`
- Create: `src/api/performance-analytics.ts`
- Create: `src/hooks/usePerformanceAnalytics.ts`
- Test: `src/api/performance-analytics.test.ts`
- Test: `src/hooks/usePerformanceAnalytics.test.tsx`

**Interfaces:**
- Consumes el contrato público de Task 4 y `requestJson`/cliente HTTP existente.
- Produces `PerformanceAnalyticsApi`, `createPerformanceAnalyticsApi()` y `usePerformanceAnalytics(api, initialQuery)`.

- [ ] **Step 1: Write failing API and hook tests**

Cover URL codificada, `AbortSignal`, CSV como descarga binaria, carga, éxito, vacío, error con datos previos, retry, cambio de filtro, petición obsoleta, desmontaje y permiso revocado.

- [ ] **Step 2: Run focused frontend tests to verify failure**

Run: `npm test -- src/api/performance-analytics.test.ts src/hooks/usePerformanceAnalytics.test.tsx`.
Expected: FAIL because the client, model and hook do not exist.

- [ ] **Step 3: Implement immutable models, API and hook**

Do not accept user/technician scope inputs outside the public filters. Maintain one `AbortController`/generation per query, preserve the latest valid summary during refresh and clear sensitive data when a 403 revokes access.

- [ ] **Step 4: Run focused frontend tests to verify pass**

Run the command from Step 2. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/models/performance-analytics.ts src/api/performance-analytics.ts src/api/performance-analytics.test.ts src/hooks/usePerformanceAnalytics.ts src/hooks/usePerformanceAnalytics.test.tsx
git commit -m "feat(analisis): consumir resumen autorizado"
```

### Task 6: Pantalla comparativa, detalle y navegación

**Files:**
- Create: `src/components/performance-analytics/PerformanceSummary.tsx`
- Create: `src/components/performance-analytics/PerformanceFilters.tsx`
- Create: `src/components/performance-analytics/PerformanceTable.tsx`
- Create: `src/components/performance-analytics/PerformanceDetail.tsx`
- Create: `src/components/performance-analytics/performance-analytics.css`
- Create: `src/pages/PerformanceAnalyticsPage.tsx`
- Modify: `src/models/app.ts`
- Modify: `src/routes/appRoutes.ts`
- Modify: `src/mocks/data.ts`
- Modify: `src/layouts/AppShell.tsx`
- Test: `src/components/performance-analytics/*.test.tsx`
- Test: `src/pages/PerformanceAnalyticsPage.test.tsx`

**Interfaces:**
- Consumes `usePerformanceAnalytics`, typed summary and export callback from Task 5.
- Produces route `/analisis`, page `Análisis` and accessible summary/table/detail components.

- [ ] **Step 1: Write failing component and page tests**

Assert period/filter controls update the URL; row displays all four dimensions, public variables and textual alerts; own scope hides team ranking/average; empty/error states direct the user; CSV action starts the authorized download; keyboard selection opens detail; mobile uses cards/full-screen detail.

- [ ] **Step 2: Run focused tests to verify failure**

Run: `npm test -- src/components/performance-analytics src/pages/PerformanceAnalyticsPage.test.tsx`.
Expected: FAIL because the page and components do not exist.

- [ ] **Step 3: Implement the analytical workspace**

Use a diagnostic card that ties each alert to its supporting dimension/value, not color alone. Keep the existing operational palette and responsive patterns. The page assembles the hook and components; components make no network calls. Gate the navigation item with KPI permissions and preserve route-based access denial.

- [ ] **Step 4: Run focused tests to verify pass**

Run the command from Step 2. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/performance-analytics src/pages/PerformanceAnalyticsPage.tsx src/models/app.ts src/routes/appRoutes.ts src/mocks/data.ts src/layouts/AppShell.tsx src/pages/PerformanceAnalyticsPage.test.tsx
git commit -m "feat(analisis): visualizar desempeño técnico"
```

### Task 7: Recorrido integrado, documentación y verificación

**Files:**
- Create: `src/performance-analytics-flow.integration.test.tsx`
- Modify: `README.md`
- Modify: `docs/architecture/current-state.md`
- Modify: `docs/plans/implementation-plan.md`

**Interfaces:**
- Consumes the finished route, API client and page from Tasks 1–6.
- Produces documented local usage, permission behavior and validation commands.

- [ ] **Step 1: Write the failing end-to-end frontend flow test**

Exercise entry from the shell, week/month/year filters, a critical quality alert, technician detail, an own-scope denied comparison, retry after network error and the CSV download boundary.

- [ ] **Step 2: Run the flow test to verify failure**

Run: `npm test -- src/performance-analytics-flow.integration.test.tsx`.
Expected: FAIL until the completed modules are connected.

- [ ] **Step 3: Implement only integration wiring and documentation**

Document endpoints, filters, periods, permissions, alert thresholds, CSV behavior, preview/official distinction, limitations and commands. Update current state to mark the dashboard operational migration complete while retaining global evidences, audit, PDF/XLSX and deployment as pending.

- [ ] **Step 4: Run final verification**

Run from root: `npm test -- src/performance-analytics-flow.integration.test.tsx`, `npm run lint`, `npm run build`.

Run from `server/`: `npm test -- tests/performance-analytics`, `npm run test:db -- tests/database/performance-analytics-persistence.test.ts`, `npm run typecheck`, `npm run lint`, `npm run build`.

Expected: all commands pass; document the known `pg` test deprecation warning if it remains non-blocking.

- [ ] **Step 5: Commit**

```bash
git add src/performance-analytics-flow.integration.test.tsx README.md docs/architecture/current-state.md docs/plans/implementation-plan.md
git commit -m "docs(analisis): registrar uso y verificación"
```
