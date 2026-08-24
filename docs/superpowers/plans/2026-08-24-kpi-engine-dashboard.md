# KPI Engine and Historical Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Geek Solution's explainable weekly KPI engine, audited weekly close and revisions, monthly/yearly trends, and a real-data KPI dashboard.

**Architecture:** Add a focused `server/src/kpis` module whose pure calculator consumes normalized weekly facts collected by repositories. Previews remain ephemeral; official results are immutable revisions persisted transactionally, and monthly/yearly views consolidate current official weekly revisions. The React dashboard consumes typed KPI endpoints through a small credentials-aware HTTP client while the rest of the SPA remains mock-backed until phase 12.

**Tech Stack:** TypeScript 6 backend, Node.js, Express 5, Zod 4, Prisma 7, PostgreSQL, Vitest, Supertest; React 18, TypeScript 5, Vite 6, Testing Library, CSS.

**Spec:** `docs/superpowers/specs/2026-08-24-kpi-engine-dashboard-design.md`

## Global Constraints

- Official periods are Monday through Sunday in `America/Tegucigalpa`, configurable through `KPI_TIME_ZONE`.
- Initial weights are productivity `0.20`, compliance `0.25`, efficiency `0.25`, and quality `0.30`; every configuration sums exactly `1.0000`.
- KPI work credits and recurrence credits use decimals; display rounding never feeds another calculation.
- Missing weekly target means no official result and no ranking position for that technician.
- `NOT_APPLICABLE` dimensions redistribute their configured weight across applicable dimensions; zero registered minutes makes efficiency `0`.
- A late recurrence creates a new official revision for the original work week and never overwrites an old result.
- ADMIN and SUPERVISOR manage targets, configurations, closes, recalculations, and audit; TECHNICIAN reads own details and the non-sensitive ranking.
- New writes follow existing authentication, changed-password, allowed-origin, Zod, request-ID, transaction, and safe-error conventions.
- Do not persist credentials, local database URLs, or secrets. Keep `Sistema_kpiGS` connection strings in environment files excluded from Git.
- Use TDD for every behavior and commit only after the focused tests pass.

---

## File Structure

Backend units to create:

- `server/src/kpis/kpis.types.ts`: public and internal KPI contracts.
- `server/src/kpis/kpis.period.ts`: IANA-zone weekly boundaries and month/year ownership.
- `server/src/kpis/kpis.calculator.ts`: pure decimal formulas and effective-weight normalization.
- `server/src/kpis/kpis.facts.ts`: normalize orders, activities, technicians, and recurrences into weekly facts.
- `server/src/kpis/kpis.repository.types.ts`: repository ports and persistence result unions.
- `server/src/kpis/kpis.read.repository.ts`: preview, official read, ranking, history, and drill-down queries.
- `server/src/kpis/kpis.management.repository.ts`: targets and versioned configurations.
- `server/src/kpis/kpis.close.repository.ts`: locks, official snapshots, revisions, and durable recurrence revision requests.
- `server/src/kpis/kpis.consolidation.ts`: month/year consolidation of official weekly revisions.
- `server/src/kpis/kpis.schemas.ts`: HTTP parameter, query, and body validation.
- `server/src/kpis/kpis.mapper.ts`: safe JSON conversion for Decimal and dates.
- `server/src/kpis/kpis.service.ts`: authorization and application use cases.
- `server/src/kpis/kpis.controller.ts`: HTTP translation.
- `server/src/kpis/kpis.routes.ts`: security middleware and endpoint registration.

Frontend units to create:

- `src/api/http.ts`: credentials-aware JSON transport and normalized API errors.
- `src/api/kpis.ts`: KPI endpoint client.
- `src/models/kpi.ts`: dashboard DTOs and period types.
- `src/hooks/useKpiDashboard.ts`: abortable loading, retry, and period navigation state.
- `src/components/kpis/KpiPeriodToolbar.tsx`: week/month/year controls and status.
- `src/components/kpis/KpiScoreCards.tsx`: overall and four explainable dimensions.
- `src/components/kpis/KpiTrend.tsx`: accessible SVG trend.
- `src/components/kpis/KpiRanking.tsx`: privacy-safe ranking.
- `src/components/kpis/KpiManagementPanel.tsx`: target/configuration/close/recalculate controls.

Existing files are modified only where listed in their task. Do not refactor unrelated modules.

---

### Task 1: Persistence, environment, permissions, and seed

**Files:**
- Create: `server/prisma/migrations/20260824150000_kpi_engine_dashboard/migration.sql`
- Modify: `server/prisma/schema.prisma`
- Modify: `server/prisma/seed/catalogs.ts`
- Modify: `server/prisma/seed/quality.ts`
- Modify: `server/src/config/env.ts`
- Modify: `server/database/verify-database.sql`
- Test: `server/tests/env.test.ts`
- Test: `server/tests/database/schema-contract.test.ts`
- Test: `server/tests/database/constraints.test.ts`
- Test: `server/tests/database/seed.test.ts`

**Interfaces:**
- Produces: `Environment.KPI_TIME_ZONE: string`.
- Produces: Prisma models with decimal KPI counters, revision metadata, and `SolicitudRevisionKPI`.
- Produces: permissions `KPI_VIEW_ALL`, `KPI_VIEW_OWN`, `KPI_MANAGE_TARGETS`, `KPI_MANAGE_CONFIGURATION`, `KPI_CLOSE_WEEK`, `KPI_RECALCULATE`, and `KPI_VIEW_AUDIT`.

- [ ] **Step 1: Write failing environment and schema contract tests**

Add assertions that `KPI_TIME_ZONE` defaults to `America/Tegucigalpa`, rejects a non-IANA value, KPI credit columns are `numeric`, revision columns exist, and only one current result is allowed per technician/week.

```ts
expect(parseEnvironment(validEnvironment).KPI_TIME_ZONE).toBe("America/Tegucigalpa");
expect(() => parseEnvironment({ ...validEnvironment, KPI_TIME_ZONE: "Mars/Olympus" }))
  .toThrow(/KPI_TIME_ZONE/);
```

```ts
expect(columns.get("resultado_kpi.completed_credits")).toMatchObject({ dataType: "numeric" });
expect(columns.get("resultado_kpi.revision")).toMatchObject({ dataType: "integer" });
expect(indexes).toContain("uq_resultado_kpi_current_week");
```

- [ ] **Step 2: Run the focused tests and confirm they fail**

Run from `server`:

```bash
npm test -- tests/env.test.ts
npm run test:db -- tests/database/schema-contract.test.ts tests/database/constraints.test.ts tests/database/seed.test.ts
```

Expected: failures for missing environment property, missing columns/indexes, old permissions, and old `0.30/0.25/0.20/0.25` seed.

- [ ] **Step 3: Extend Prisma and write the incremental SQL migration**

Change KPI work counters to `Decimal @db.Decimal(12, 4)`. Add `eligibleCredits`, `onTimeEligibleCredits`, nullable dimension scores, applicability fields, effective weights, `revision`, `isCurrent`, `calculationType`, `calculationReason`, `calculatedById`, and `previousResultId` to `ResultadoKPI`.

Add a durable revision request model with this database contract:

```prisma
model SolicitudRevisionKPI {
  id                String   @id @default(uuid()) @db.Uuid
  reincidenciaId    String   @map("reincidencia_id") @db.Uuid
  recurrenceVersion Int      @map("recurrence_version")
  originalOrderId   String   @map("original_order_id") @db.Uuid
  status            String   @default("PENDING") @db.VarChar(20)
  attempts          Int      @default(0)
  lastErrorCode     String?  @map("last_error_code") @db.VarChar(80)
  requestedById     String?  @map("requested_by_id") @db.Uuid
  createdAt         DateTime @default(now()) @map("created_at") @db.Timestamptz(3)
  processedAt       DateTime? @map("processed_at") @db.Timestamptz(3)

  @@unique([reincidenciaId, recurrenceVersion])
  @@index([status, createdAt])
  @@map("solicitud_revision_kpi")
}
```

Use SQL checks for score ranges, non-negative counters, positive revisions, valid request status, non-overlapping configuration dates, and exact weight sum. Create `uq_resultado_kpi_current_week` as a partial unique index over `(tecnico_id, period_start, period_end) WHERE is_current`.

Before enforcing weekly targets, copy non-weekly legacy rows into `meta_tecnico_legacy_archive` with all source fields and `archived_at`, verify copied row count in a `DO` block, then remove only those copied rows from `meta_tecnico`. This preserves existing local demo metadata without treating monthly rows as weekly goals.

- [ ] **Step 4: Add timezone validation and update the idempotent seed**

Validate with `Intl.DateTimeFormat` after Zod string parsing:

```ts
function isIanaTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}
```

Rename existing `KPIS_VIEW_OWN`/`KPIS_VIEW_TEAM` rows to the approved permission codes without changing their IDs, add management permissions, and grant exact role sets. Seed configuration version 1 with `0.20/0.25/0.25/0.30`. Replace monthly demo metas with Monday-Sunday rows.

- [ ] **Step 5: Format, generate, migrate, and run focused tests**

```bash
npm run db:format
npm run db:validate
npm run db:generate
npm run db:migrate:deploy
npm run db:verify
npm test -- tests/env.test.ts
npm run test:db -- tests/database/schema-contract.test.ts tests/database/constraints.test.ts tests/database/seed.test.ts
```

Expected: all commands exit 0; a second seed run has no duplicates and preserves exact grants.

- [ ] **Step 6: Commit the persistence foundation**

```bash
git add server/prisma server/src/config/env.ts server/database/verify-database.sql server/tests/env.test.ts server/tests/database/schema-contract.test.ts server/tests/database/constraints.test.ts server/tests/database/seed.test.ts
git commit -m "feat(kpi): add versioned persistence foundation"
```

---

### Task 2: Weekly periods and pure KPI calculator

**Files:**
- Modify: `server/package.json`
- Modify: `server/package-lock.json`
- Create: `server/src/kpis/kpis.types.ts`
- Create: `server/src/kpis/kpis.period.ts`
- Create: `server/src/kpis/kpis.calculator.ts`
- Test: `server/tests/kpis/kpis-period.test.ts`
- Test: `server/tests/kpis/kpis-calculator.test.ts`

**Interfaces:**
- Produces: `resolveWeek(instant: Date, timeZone: string): KpiWeek`.
- Produces: `parseWeekStart(value: string, timeZone: string): KpiWeek`.
- Produces: `calculateWeeklyKpi(input: WeeklyKpiCalculationInput): WeeklyKpiCalculation`.
- Produces: `KpiWeek`, `KpiWeights`, `WeeklyKpiFacts`, `KpiDimensionResult`, and `WeeklyKpiCalculation`.

- [ ] **Step 1: Write failing period tests**

```ts
expect(resolveWeek(new Date("2026-08-24T15:00:00Z"), "America/Tegucigalpa"))
  .toMatchObject({ periodStart: "2026-08-24", periodEnd: "2026-08-30" });
expect(parseWeekStart("2026-08-25", "America/Tegucigalpa"))
  .toEqual({ kind: "INVALID_WEEK_START" });
```

Also assert `startInclusive` is Monday 00:00 local converted to UTC and `endExclusive` is the following Monday.

- [ ] **Step 2: Write failing formula table tests**

Use a table covering: `8/10` productivity = 80; `3/4` compliance = 75; `360/480` efficiency = 75; `1/10` quality = 90; productivity cap; quality floor; compliance and quality `NOT_APPLICABLE`; zero-time efficiency; and effective weight redistribution.

```ts
const result = calculateWeeklyKpi({
  completedCredits: "8.0000",
  targetJobs: 10,
  eligibleCredits: "4.0000",
  onTimeEligibleCredits: "3.0000",
  registeredMinutes: 480,
  productiveMinutes: 360,
  attributableRecurrenceCredits: "1.0000",
  weights: { productivity: "0.2000", compliance: "0.2500", efficiency: "0.2500", quality: "0.3000" },
});
expect(result.scores).toMatchObject({ productivity: "80.00", compliance: "75.00", efficiency: "75.00", quality: "87.50" });
expect(result.overallScore).toBe("79.75");
```

- [ ] **Step 3: Run both tests and confirm missing-module failures**

```bash
npm test -- tests/kpis/kpis-period.test.ts tests/kpis/kpis-calculator.test.ts
```

- [ ] **Step 4: Install Temporal and implement period helpers**

```bash
npm install @js-temporal/polyfill
```

Use `Temporal.Instant.from(date.toISOString()).toZonedDateTimeISO(timeZone)`, subtract `dayOfWeek - 1`, and derive `[startInclusive, endExclusive)`. Reject non-Monday date strings instead of silently normalizing them.

- [ ] **Step 5: Implement the decimal calculator**

Use `Prisma.Decimal` for every ratio and round only returned scores:

```ts
const bounded = (value: Prisma.Decimal) => Prisma.Decimal.max(0, Prisma.Decimal.min(100, value));
const ratio = (numerator: Prisma.Decimal.Value, denominator: Prisma.Decimal.Value) =>
  new Prisma.Decimal(numerator).div(denominator).mul(100);
```

Represent an inapplicable score as `{ applicability: "NOT_APPLICABLE", score: null, effectiveWeight: "0.0000" }`. Normalize applicable weights by `configuredWeight / applicableWeightSum`, then sum `score * effectiveWeight`.

- [ ] **Step 6: Run tests, typecheck, and commit**

```bash
npm test -- tests/kpis/kpis-period.test.ts tests/kpis/kpis-calculator.test.ts
npm run typecheck
git add package.json package-lock.json src/kpis tests/kpis
git commit -m "feat(kpi): calculate deterministic weekly scores"
```

---

### Task 3: Prevent order completion without productive technician time

**Files:**
- Modify: `server/src/orders/orders.repository.types.ts`
- Modify: `server/src/orders/orders.operation.repository.ts`
- Modify: `server/src/orders/orders.service.ts`
- Test: `server/tests/orders/orders-service.test.ts`
- Test: `server/tests/database/orders-operation-persistence.test.ts`
- Test: `server/tests/orders/orders-http.test.ts`

**Interfaces:**
- Produces: `OrderFailureKind` member `ORDER_PRODUCTIVE_TIME_REQUIRED`.
- Preserves: `OrdersRepository.completeOrder(id: string, input: CompleteOrderInput, actor: OrderActorContext, now: Date): Promise<OrderMutationResult>`.

- [ ] **Step 1: Write failing service and persistence tests**

Add a service mapping assertion:

```ts
await expect(service.completeOrder(orderId, completeInput, operationActor)).rejects.toMatchObject({
  statusCode: 422,
  code: "ORDER_PRODUCTIVE_TIME_REQUIRED",
  message: "La orden requiere tiempo productivo de al menos un técnico",
});
```

In the database test, create an `IN_PROGRESS` order with no completed activity, attempt completion, and assert unchanged status/version plus zero history/audit rows. Then add a completed activity with one technician and positive productive minutes and assert completion succeeds.

- [ ] **Step 2: Run focused tests and confirm the unhandled failure kind**

```bash
npm test -- tests/orders/orders-service.test.ts tests/orders/orders-http.test.ts
npm run test:db -- tests/database/orders-operation-persistence.test.ts
```

- [ ] **Step 3: Add the locked productive-time guard**

Inside the existing completion transaction, after locking the order and before updating it, query for a non-deleted `COMPLETED` activity linked to the order with `productiveMinutes > 0` and at least one `ActividadTecnico`. Return `{ kind: "ORDER_PRODUCTIVE_TIME_REQUIRED" }` when absent. Keep validation and order mutation in the same transaction.

```ts
const productiveActivity = await transaction.actividad.findFirst({
  where: {
    ordenId: id,
    status: "COMPLETED",
    deletedAt: null,
    productiveMinutes: { gt: 0 },
    tecnicos: { some: {} },
  },
  select: { id: true },
});
if (productiveActivity === null) return { kind: "ORDER_PRODUCTIVE_TIME_REQUIRED" } as const;
```

- [ ] **Step 4: Map the safe HTTP error and run tests**

```bash
npm test -- tests/orders/orders-service.test.ts tests/orders/orders-http.test.ts
npm run test:db -- tests/database/orders-operation-persistence.test.ts
npm run typecheck
```

- [ ] **Step 5: Commit the integrity rule**

```bash
git add src/orders tests/orders tests/database/orders-operation-persistence.test.ts
git commit -m "feat(orders): require productive time before completion"
```

---

### Task 4: Weekly fact collection and preview service

**Files:**
- Create: `server/src/kpis/kpis.facts.ts`
- Create: `server/src/kpis/kpis.repository.types.ts`
- Create: `server/src/kpis/kpis.read.repository.ts`
- Create: `server/src/kpis/kpis.service.ts`
- Test: `server/tests/kpis/kpis-facts.test.ts`
- Test: `server/tests/kpis/kpis-service.test.ts`
- Test: `server/tests/database/kpis-read-persistence.test.ts`
- Create: `server/tests/database/kpis-test-data.ts`

**Interfaces:**
- Consumes: `KpiWeek`, `WeeklyKpiFacts`, and `calculateWeeklyKpi` from Task 2.
- Produces: `KpiFactsRepository.loadWeeklySources(week, scope): Promise<WeeklySourceRows>`.
- Produces: `buildWeeklyFacts(rows: WeeklySourceRows): Map<string, WeeklyKpiFacts>`.
- Produces: `KpiService.previewWeekly(periodStart, actor): Promise<WeeklyKpiResponse>`.

- [ ] **Step 1: Write failing fact-allocation tests**

Create an order with technician minutes `360` and `240`; assert completed credits `0.6000` and `0.4000`, total `1.0000`. Mark it on time and assert the same eligible/on-time shares. Add a closed technical recurrence affecting both and assert recurrence credits `0.6000` and `0.4000`. Add a second recurrence affecting only technician B and assert B receives `1.0000` for that recurrence.

- [ ] **Step 2: Write failing preview service tests**

Mock the repository with three active technicians: one with a target and facts, one with a target and no time, and one without a target. Assert `PREVIEW`, calculated score for the first, efficiency 0 for the second, and warning `{ code: "MISSING_TARGET", technicianId }` for the third.

- [ ] **Step 3: Run the focused tests and confirm missing modules**

```bash
npm test -- tests/kpis/kpis-facts.test.ts tests/kpis/kpis-service.test.ts
npm run test:db -- tests/database/kpis-read-persistence.test.ts
```

- [ ] **Step 4: Implement normalized source records and allocation**

Define `WeeklySourceRows` with completed orders, activity technician intervals, pauses, targets, configuration, and closed technical recurrence participants. Use existing activity time helpers to intersect each technician interval with productive segments. Accumulate per-order technician minutes before dividing by the order total.

```ts
export interface TechnicianOrderCredit {
  orderId: string;
  technicianId: string;
  productiveMinutes: number;
  completedCredit: string;
  eligibleCredit: string;
  onTimeCredit: string;
}
```

Time totals use completed activities whose `endedAt` falls inside the week. Order credits use orders whose `endedAt` falls inside the week. Recurrence credits use the original order week, not `detectedAt` or recurrence `closedAt`.

- [ ] **Step 5: Implement read repository and preview orchestration**

Use bounded queries with `[startInclusive, endExclusive)`, explicit selects, stable UUID ordering, and management/own scopes. `previewWeekly` resolves the week, loads sources once, calculates each target-bearing technician, and returns missing-target warnings without writes.

- [ ] **Step 6: Run focused tests and commit**

```bash
npm test -- tests/kpis/kpis-facts.test.ts tests/kpis/kpis-service.test.ts
npm run test:db -- tests/database/kpis-read-persistence.test.ts
npm run typecheck
git add src/kpis tests/kpis tests/database/kpis-read-persistence.test.ts tests/database/kpis-test-data.ts
git commit -m "feat(kpi): build weekly facts and previews"
```

---

### Task 5: Weekly targets and versioned configuration management

**Files:**
- Create: `server/src/kpis/kpis.management.repository.ts`
- Extend: `server/src/kpis/kpis.repository.types.ts`
- Extend: `server/src/kpis/kpis.service.ts`
- Create: `server/src/kpis/kpis.schemas.ts`
- Test: `server/tests/kpis/kpis-schemas.test.ts`
- Extend: `server/tests/kpis/kpis-service.test.ts`
- Test: `server/tests/database/kpis-management-persistence.test.ts`

**Interfaces:**
- Produces: `KpiService.listTargets`, `createTarget`, `updateTarget`, `listConfigurations`, and `createConfiguration`.
- Produces validated `CreateTargetInput`, `UpdateTargetInput`, and `CreateConfigurationInput`.

- [ ] **Step 1: Write failing Zod tests**

Assert Monday-Sunday periods, positive integer goals, observation length, four weights in `[0,1]`, exact decimal sum `1`, future Monday `validFrom`, and recalculation reason length `10..500`.

```ts
expect(createConfigurationSchema.safeParse({
  validFrom: "2026-08-31",
  productivityWeight: "0.2000",
  complianceWeight: "0.2500",
  efficiencyWeight: "0.2500",
  qualityWeight: "0.3000",
  description: "Mayor peso para calidad",
}).success).toBe(true);
```

- [ ] **Step 2: Write failing permission and persistence tests**

Assert ADMIN/SUPERVISOR management succeeds, TECHNICIAN receives 403, a target for a closed week conflicts, configuration overlap returns `KPI_CONFIGURATION_OVERLAP`, and concurrent version creation produces consecutive unique versions with one winner per `validFrom`.

- [ ] **Step 3: Run focused tests and confirm failures**

```bash
npm test -- tests/kpis/kpis-schemas.test.ts tests/kpis/kpis-service.test.ts
npm run test:db -- tests/database/kpis-management-persistence.test.ts
```

- [ ] **Step 4: Implement management transactions**

Lock configuration rows in version order, derive `nextVersion = max(version) + 1`, close the previous row at the preceding Sunday, insert the future row, and audit in one serializable transaction with bounded PostgreSQL retry handling. Target updates first check for a current official result and require recalculation flow after close.

- [ ] **Step 5: Run tests and commit**

```bash
npm test -- tests/kpis/kpis-schemas.test.ts tests/kpis/kpis-service.test.ts
npm run test:db -- tests/database/kpis-management-persistence.test.ts
npm run typecheck
git add src/kpis tests/kpis tests/database/kpis-management-persistence.test.ts
git commit -m "feat(kpi): manage weekly targets and weights"
```

---

### Task 6: Official close, revisions, and recurrence revision queue

**Files:**
- Create: `server/src/kpis/kpis.close.repository.ts`
- Extend: `server/src/kpis/kpis.repository.types.ts`
- Extend: `server/src/kpis/kpis.service.ts`
- Modify: `server/src/recurrences/recurrences.workflow.repository.ts`
- Modify: `server/src/recurrences/recurrences.repository.types.ts`
- Modify: `server/src/recurrences/recurrences.service.ts`
- Modify: `server/src/recurrences/recurrences.routes.ts`
- Modify: `server/src/routes/index.ts`
- Test: `server/tests/database/kpis-close-persistence.test.ts`
- Test: `server/tests/database/kpis-revision-persistence.test.ts`
- Extend: `server/tests/recurrences/recurrences-service.test.ts`

**Interfaces:**
- Produces: `KpiCloseRepository.closeWeek(input): Promise<CloseWeekResult>`.
- Produces: `KpiCloseRepository.recalculateWeek(input): Promise<RecalculateWeekResult>`.
- Produces: `KpiCloseRepository.processRevisionRequests(limit, now): Promise<RevisionBatchResult>`.
- Extends recurrence mutation output with `kpiRevisionRequestId: string | null` for closed/adjusted quality changes.

- [ ] **Step 1: Write failing close transaction tests**

Assert: preview rows are not persisted; close creates revision 1; missing-target technician is omitted with a warning; a repeated identical close returns current rows; two concurrent closes create one current revision; and forced audit failure rolls back result rows.

- [ ] **Step 2: Write failing recurrence revision tests**

Close a January work week, close a technical recurrence in February, and assert a unique pending request references the January order. Process it and assert revision 2 is current, revision 1 remains, quality changes, January consolidated inputs change, and the request becomes `PROCESSED`. Reprocessing must not create revision 3 when facts are unchanged.

- [ ] **Step 3: Run database and recurrence tests and confirm failures**

```bash
npm run test:db -- tests/database/kpis-close-persistence.test.ts tests/database/kpis-revision-persistence.test.ts
npm test -- tests/recurrences/recurrences-service.test.ts tests/kpis/kpis-service.test.ts
```

- [ ] **Step 4: Implement weekly locking and immutable revisions**

Use `pg_advisory_xact_lock` derived from `periodStart`, then lock current results in technician UUID order. Insert complete snapshots with copied weights. For a revision, set the old row `isCurrent = false` and insert `revision + 1`, `previousResultId`, calculation reason/type, and audit in the same transaction.

Return `{ kind: "UNCHANGED", results }` when the normalized facts, scores, weights, and warnings match the current snapshots.

- [ ] **Step 5: Enqueue recurrence revisions atomically**

In the existing recurrence close/adjust transaction, upsert `SolicitudRevisionKPI` only when a `CLOSED` technical-work recurrence has at least one `affectsQuality` original participant, or when an adjustment changes that quality effect. The unique `(reincidenciaId, recurrenceVersion)` key makes retries safe.

After the recurrence transaction commits, `RecurrenceService` invokes a bounded `processRevisionRequests(10, now)` callback. Processing failure does not undo the already valid recurrence; it leaves the durable request pending, records a safe error code, and the next KPI read/close retries it.

Wire one `createKpiCloseRepository(database)` instance in `createApiRouter`, pass its
revision processor to `createRecurrencesRouter`, and reuse the same repository when
the KPI router is registered in Task 7. This keeps recurrence code dependent on a
small callback rather than importing the KPI module directly.

- [ ] **Step 6: Run focused tests, full recurrence tests, and commit**

```bash
npm run test:db -- tests/database/kpis-close-persistence.test.ts tests/database/kpis-revision-persistence.test.ts tests/database/recurrences-terminal-persistence.test.ts
npm test -- tests/kpis/kpis-service.test.ts tests/recurrences/recurrences-service.test.ts
npm run typecheck
git add src/kpis src/recurrences src/routes/index.ts tests/kpis tests/recurrences tests/database/kpis-close-persistence.test.ts tests/database/kpis-revision-persistence.test.ts
git commit -m "feat(kpi): close and revise weekly results"
```

---

### Task 7: Consolidation, HTTP API, permissions, and audit reads

**Files:**
- Create: `server/src/kpis/kpis.consolidation.ts`
- Create: `server/src/kpis/kpis.mapper.ts`
- Create: `server/src/kpis/kpis.controller.ts`
- Create: `server/src/kpis/kpis.routes.ts`
- Extend: `server/src/kpis/kpis.read.repository.ts`
- Extend: `server/src/kpis/kpis.schemas.ts`
- Extend: `server/src/kpis/kpis.service.ts`
- Modify: `server/src/routes/index.ts`
- Test: `server/tests/kpis/kpis-consolidation.test.ts`
- Test: `server/tests/kpis/kpis-mapper.test.ts`
- Test: `server/tests/kpis/kpis-http.test.ts`
- Test: `server/tests/database/kpis-history-persistence.test.ts`

**Interfaces:**
- Consumes: current official weekly snapshots from Tasks 4 and 6.
- Produces: the following `/api/v1/kpis` routes.
- Produces: `consolidateOfficialWeeks(input): ConsolidatedKpi`.

```text
GET  /api/v1/kpis/weekly
GET  /api/v1/kpis/ranking
GET  /api/v1/kpis/technicians/:technicianId/history
GET  /api/v1/kpis/technicians/:technicianId/details
GET  /api/v1/kpis/weeks/:periodStart/validation
POST /api/v1/kpis/weeks/:periodStart/close
POST /api/v1/kpis/weeks/:periodStart/recalculate
GET  /api/v1/kpis/weeks/:periodStart/versions
GET  /api/v1/kpis/targets
POST /api/v1/kpis/targets
PATCH /api/v1/kpis/targets/:id
GET  /api/v1/kpis/configurations
POST /api/v1/kpis/configurations
```

- [ ] **Step 1: Write failing consolidation tests**

Use four weekly snapshots and assert summed dimension numerators/denominators, Sunday-based month ownership, exclusion of old revisions, exclusion plus coverage warning for missing-target weeks, and target-weighted overall score. Include two configuration versions to prove historical weekly overall scores remain authoritative.

- [ ] **Step 2: Write failing HTTP permission and contract tests**

Assert unauthenticated 401; provisional-password 403; TECHNICIAN own detail 200 and foreign detail 404; management list/close/configuration 200; technician management write 403; invalid week 400; conflict 409; source invariant 422; Decimal values serialized as strings; and no Prisma/SQL fields in responses. Also assert that `technicianId`, `serviceTypeId`, and work-status filters reach the repository unchanged, and that technician detail returns the source order IDs and recurrence IDs required for drill-down.

```ts
const response = await technician.get(`/api/v1/kpis/technicians/${ownId}/details?periodStart=2026-08-24`);
expect(response.status).toBe(200);
expect(response.body.data).toMatchObject({ status: "OFFICIAL", completedCredits: "8.5000" });
expect(response.body.data).not.toHaveProperty("calculationMetadata.databaseUrl");
```

- [ ] **Step 3: Run focused tests and confirm missing route failures**

```bash
npm test -- tests/kpis/kpis-consolidation.test.ts tests/kpis/kpis-mapper.test.ts tests/kpis/kpis-http.test.ts
npm run test:db -- tests/database/kpis-history-persistence.test.ts
```

- [ ] **Step 4: Implement consolidation and stable ranking**

Aggregate dimension ratios from stored raw counters. Compute period overall as the weekly overall weighted by `appliedTarget`. Sort ranking by overall descending, quality descending with null last, completed credits descending, and technician code ascending.

- [ ] **Step 5: Implement controllers, routes, and safe mappings**

Register read middleware with `KPI_VIEW_ALL`/`KPI_VIEW_OWN`; management routes require their exact permission plus allowed origin. Convert dates to ISO and Decimal to fixed strings in the mapper. Call `processRevisionRequests(10, now)` before official read endpoints so durable pending revisions converge.

- [ ] **Step 6: Run backend module and database tests, then commit**

```bash
npm test -- tests/kpis
npm run test:db -- tests/database/kpis-read-persistence.test.ts tests/database/kpis-management-persistence.test.ts tests/database/kpis-close-persistence.test.ts tests/database/kpis-revision-persistence.test.ts tests/database/kpis-history-persistence.test.ts
npm run typecheck
npm run lint
git add src/kpis src/routes/index.ts tests/kpis tests/database/kpis-history-persistence.test.ts
git commit -m "feat(kpi): expose history ranking and management API"
```

---

### Task 8: Frontend KPI client, state hook, and read-only dashboard

**Files:**
- Create: `src/api/http.ts`
- Create: `src/api/kpis.ts`
- Create: `src/models/kpi.ts`
- Create: `src/hooks/useKpiDashboard.ts`
- Create: `src/components/kpis/KpiPeriodToolbar.tsx`
- Create: `src/components/kpis/KpiScoreCards.tsx`
- Create: `src/components/kpis/KpiTrend.tsx`
- Create: `src/components/kpis/KpiRanking.tsx`
- Modify: `src/pages/DashboardPage.tsx`
- Modify: `src/styles.css`
- Test: `src/api/kpis.test.ts`
- Test: `src/hooks/useKpiDashboard.test.tsx`
- Test: `src/pages/DashboardPage.test.tsx`

**Interfaces:**
- Produces: `KpiApi` with `getDashboard`, `getTechnicianDetails`, and management methods used by Task 9.
- Produces: `useKpiDashboard(api, initialPeriod)` returning `{ state, period, setGranularity, previous, next, retry }`.
- Changes: `DashboardPage` accepts an optional injected `kpiApi` for deterministic tests.

- [ ] **Step 1: Write failing transport and hook tests**

Assert the client uses `credentials: "include"`, encodes period query parameters, maps non-2xx bodies to `ApiClientError`, and the hook aborts stale requests when navigating quickly. Assert state transitions `loading -> success`, `loading -> empty`, and `loading -> error -> retry -> success`.

- [ ] **Step 2: Write failing dashboard rendering tests**

Render an official response and assert five cards, `20/25/25/30` configured weights, `No aplica`, ranking order, trend accessible name, and “Oficial hasta” for current month. Render preview, revised, missing-target, 401, empty, and network-error fixtures and assert visible Spanish status messages.

- [ ] **Step 3: Run frontend tests and confirm missing modules**

```bash
npm test -- src/api/kpis.test.ts src/hooks/useKpiDashboard.test.tsx src/pages/DashboardPage.test.tsx
```

- [ ] **Step 4: Implement the typed client and abortable hook**

```ts
export async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api/v1"}${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init.headers },
  });
  const body = await response.json();
  if (!response.ok) throw new ApiClientError(response.status, body.error.code, body.error.message);
  return body.data as T;
}
```

The hook creates an `AbortController` per request, aborts it during cleanup, ignores `AbortError`, and keeps the last successful data visible while a navigation refresh is pending.

- [ ] **Step 5: Implement the real-data KPI presentation**

Replace only KPI strip/ranking/trend mock sources. Keep the existing operational activity panels until phase 12. The period toolbar owns week/month/year navigation plus technician, service-type, and work-status filters and sends them through `useKpiDashboard`. Cards show configured/effective weights, score or `No aplica`, comparison, and an expandable formula explanation. The SVG trend includes a text summary and visible data-point labels for keyboard/screen-reader parity.

- [ ] **Step 6: Run tests, build, and commit**

```bash
npm test -- src/api/kpis.test.ts src/hooks/useKpiDashboard.test.tsx src/pages/DashboardPage.test.tsx src/App.test.tsx
npm run build
npm run lint
git add src/api src/models/kpi.ts src/hooks/useKpiDashboard.ts src/components/kpis src/pages/DashboardPage.tsx src/styles.css
git commit -m "feat(dashboard): show real KPI history and ranking"
```

---

### Task 9: Dashboard management controls

**Files:**
- Create: `src/components/kpis/KpiManagementPanel.tsx`
- Create: `src/components/kpis/KpiTargetForm.tsx`
- Create: `src/components/kpis/KpiConfigurationForm.tsx`
- Create: `src/components/kpis/KpiCloseDialog.tsx`
- Extend: `src/api/kpis.ts`
- Extend: `src/models/kpi.ts`
- Modify: `src/pages/DashboardPage.tsx`
- Modify: `src/styles.css`
- Test: `src/components/kpis/KpiManagementPanel.test.tsx`
- Extend: `src/pages/DashboardPage.test.tsx`

**Interfaces:**
- Consumes: management endpoints and DTOs from Tasks 7 and 8.
- Produces: accessible ADMIN/SUPERVISOR target, configuration, validation, close, recalculate, and version-history flows.

- [ ] **Step 1: Write failing management interaction tests**

Assert: technician response hides the management panel; management opens it; four weight inputs reject a total other than 100; target form requires Monday-Sunday dates and positive goals; close first displays validation warnings; recalculation requires a 10-character reason; successful mutation reloads the dashboard; and a 409 leaves the dialog open with a conflict message.

- [ ] **Step 2: Run focused tests and confirm missing components**

```bash
npm test -- src/components/kpis/KpiManagementPanel.test.tsx src/pages/DashboardPage.test.tsx
```

- [ ] **Step 3: Implement forms with server-authoritative validation**

Use controlled numeric inputs expressed as percentage points and convert to four-decimal fractions only at the API boundary. Display the running total and disable submit unless exactly 100.

```ts
const total = productivity + compliance + efficiency + quality;
const payload = {
  productivityWeight: (productivity / 100).toFixed(4),
  complianceWeight: (compliance / 100).toFixed(4),
  efficiencyWeight: (efficiency / 100).toFixed(4),
  qualityWeight: (quality / 100).toFixed(4),
};
```

Do not infer permissions from display names. Render controls from capability flags returned by the KPI bootstrap response, and still rely on backend authorization.

- [ ] **Step 4: Implement close/recalculate/version workflows**

The close dialog calls validation first and lists included technicians, missing targets, and global blockers. Require explicit confirmation for close and a reason for recalculate. Version history shows revision, type, actor, timestamp, reason, and current badge without exposing raw audit JSON.

- [ ] **Step 5: Run frontend suite, accessibility assertions, and commit**

```bash
npm test
npm run build
npm run lint
git add src/api/kpis.ts src/models/kpi.ts src/components/kpis src/pages/DashboardPage.tsx src/styles.css
git commit -m "feat(dashboard): manage KPI targets closes and weights"
```

---

### Task 10: End-to-end verification and project documentation

**Files:**
- Create: `server/scripts/verify-kpis.ts`
- Modify: `server/package.json`
- Modify: `server/database/verify-database.sql`
- Modify: `docs/architecture/current-state.md`
- Modify: `docs/plans/implementation-plan.md`
- Test: `server/tests/database/kpis-smoke-persistence.test.ts`

**Interfaces:**
- Consumes: all backend and frontend deliverables.
- Produces: `npm run kpis:verify` deterministic smoke command.

- [ ] **Step 1: Write the failing PostgreSQL smoke test**

Create an isolated fixture that performs this exact flow: configure weekly target; create a two-technician order; register `60/40` productive minutes; complete the order; preview; close week; assert official revision 1; close an attributable recurrence later; process requests; assert revision 2 and preserved revision 1; query month/year and assert they use revision 2; query as foreign technician and assert 404.

- [ ] **Step 2: Run smoke test and confirm the missing verifier/failing flow**

```bash
npm run test:db -- tests/database/kpis-smoke-persistence.test.ts
npm run kpis:verify
```

Expected before implementation: smoke assertions or the missing `kpis:verify` script fail.

- [ ] **Step 3: Implement the compiled verifier**

Add `"kpis:verify": "tsx scripts/verify-kpis.ts"`. The script must require a database URL whose database is exactly `Sistema_kpiGS` and whose schema is `test`, run inside a transaction that always rolls back, print one concise line per acceptance checkpoint, and exit non-zero on the first failed invariant.

- [ ] **Step 4: Update architecture and phase tracking**

Document the formulas, API base path, weekly revision lifecycle, durable recurrence revision queue, timezone environment variable, local verification commands, and remaining phase 12–14 scope. Mark phase 11 complete only after every command in Step 5 succeeds.

- [ ] **Step 5: Run the complete verification matrix**

From `server`:

```bash
npm run db:format
npm run db:validate
npm run db:generate
npm test
npm run test:db
npm run typecheck
npm run lint
npm run build
npm run db:verify
npm run kpis:verify
```

From repository root:

```bash
npm test
npm run lint
npm run build
```

Expected: every command exits 0. Record exact test counts and any non-failing PostgreSQL deprecation warnings in `docs/architecture/current-state.md`.

- [ ] **Step 6: Inspect the final diff and commit verification artifacts**

```bash
git status --short
git diff --check
git diff --stat
git add server/scripts/verify-kpis.ts server/package.json server/database/verify-database.sql server/tests/database/kpis-smoke-persistence.test.ts docs/architecture/current-state.md docs/plans/implementation-plan.md
git commit -m "test(kpi): verify weekly dashboard workflow"
```

- [ ] **Step 7: Run post-commit verification**

```bash
git status --short --branch
git log -10 --oneline
```

Expected: clean worktree on the feature branch, ten reviewable task commits, and the KPI smoke command documented.
