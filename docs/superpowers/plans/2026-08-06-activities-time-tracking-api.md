# Activities and Time Tracking API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the protected activities API that records individual and group work, real-time timers, manual time, pauses, productive minutes, ownership, concurrency, and audited corrections.

**Architecture:** Add an isolated `activities` module following route → middleware → controller → service → focused repositories → Prisma/PostgreSQL. Pure state and time modules own deterministic rules; transactional repositories lock technicians in stable order and return discriminated domain results; the service owns contextual authorization and public errors.

**Tech Stack:** Node.js, TypeScript 6, Express 5, Zod 4, Prisma 7.9.1, PostgreSQL 18, Vitest 4, Supertest, PowerShell-compatible npm scripts.

## Global Constraints

- Approved specification: `docs/superpowers/specs/2026-08-06-activities-time-tracking-api-design.md`.
- Base API path is `/api/v1`; this phase mounts exactly 13 activity endpoints.
- Do not change frontend behavior or replace mocks in this phase.
- Do not expose activity materials, evidence, recurrences, KPI calculations, reports, notifications, deployment, VPS, or domains.
- A technician sees only activities where they are or were responsible/participant; foreign and nonexistent IDs have the same 404 behavior.
- Exactly one `RESPONSIBLE` member is required and team percentages must total exactly `100.00`.
- A technician may have paused work, but only one `IN_PROGRESS` activity at a time.
- Manual intervals use `[start, end)`, cannot be future/inverted, last 1 minute through 24 hours, and cannot intersect productive segments.
- Server time is authoritative for real-time operations; inject `now: () => Date` at the service boundary for deterministic tests.
- Every aggregate mutation increments `Actividad.version` exactly once and writes `Auditoria` in the same transaction.
- Lock technicians in sorted UUID order; concurrency tests must force the lock window with separate connections.
- Completed activities change only through `POST /activities/:activityId/adjustments`; cancelled work never contributes KPI time.
- Public records never include authentication data, deleted markers, raw Prisma relation keys, or auxiliary hydration IDs.
- Preserve ignored local `.env` files and never print credentials.

---

## Planned File Structure

```text
server/src/activities/
├── activities.controller.ts           # HTTP parsing and status codes
├── activities.mapper.ts               # persistent records → public DTOs
├── activities.mutation.repository.ts  # pending CRUD, team, manual entry
├── activities.operation.repository.ts # timer, close, cancel, adjustment
├── activities.repository.helpers.ts   # shared transactional validation/locks
├── activities.read.repository.ts      # catalog, list, detail, ownership
├── activities.repository.types.ts     # selects, records, interfaces, results
├── activities.routes.ts               # security stacks and 13 routes
├── activities.schemas.ts              # strict Zod contracts
├── activities.service.ts              # authorization and public errors
├── activities.state-machine.ts        # pure transition rules
├── activities.time.ts                 # intervals, pauses, overlap, minutes
└── activities.types.ts                # inputs, scopes, DTOs

server/tests/activities/
├── activities-http.test.ts
├── activities-mapper.test.ts
├── activities-schemas.test.ts
├── activities-service.test.ts
├── activities-state-machine.test.ts
└── activities-time.test.ts

server/tests/database/
├── activities-mutation-persistence.test.ts
├── activities-operation-persistence.test.ts
├── activities-read-persistence.test.ts
└── activities-test-data.ts
```

The repositories remain separate because read scoping, pending/manual writes,
and timer/concurrency rules can be reviewed independently. Do not create a
generic workflow engine or refactor the approved orders module.

---

### Task 1: Add Activity Permissions and Query Indexes

**Files:**
- Create: `server/prisma/migrations/20260806150000_activities_api_constraints/migration.sql`
- Modify: `server/prisma/seed/catalogs.ts`
- Modify: `server/database/verify-database.sql`
- Modify: `server/tests/database/schema-contract.test.ts`
- Modify: `server/tests/database/seed.test.ts`
- Test: `server/tests/auth/authorization.test.ts`

**Interfaces:**
- Consumes: existing `permiso`, `rol_permiso`, `actividad`, `actividad_tecnico`, and idempotent catalog seed.
- Produces: permissions `ACTIVITIES_VIEW_ALL`, `ACTIVITIES_MANAGE`, `ACTIVITIES_CREATE_OWN`, `ACTIVITIES_OPERATE_OWN`; indexes `idx_activity_page`, `idx_activity_status_page`, `idx_activity_order_page`, `idx_activity_technician_visibility`.

- [ ] **Step 1: Write failing permission, migration, and seed assertions**

Add exact expectations:

```ts
expect(technicianPermissions).toEqual(
  expect.arrayContaining([
    "ACTIVITIES_CREATE_OWN",
    "ACTIVITIES_OPERATE_OWN",
  ]),
);
expect(supervisorPermissions).toEqual(
  expect.arrayContaining([
    "ACTIVITIES_VIEW_ALL",
    "ACTIVITIES_MANAGE",
  ]),
);
expect(allPermissionCodes).not.toContain("ACTIVITIES_MANAGE_OWN");
expect(indexNames).toEqual(
  expect.arrayContaining([
    "idx_activity_page",
    "idx_activity_status_page",
    "idx_activity_order_page",
    "idx_activity_technician_visibility",
  ]),
);
```

Run the seed twice in the test and assert one row per permission code and one
role-permission pair per assignment.

- [ ] **Step 2: Run the focused tests and confirm RED**

Run:

```powershell
Set-Location server
npm run test:db -- tests/database/schema-contract.test.ts tests/database/seed.test.ts
npm test -- tests/auth/authorization.test.ts
```

Expected: failures name the missing permission codes/indexes and the legacy
`ACTIVITIES_MANAGE_OWN` code.

- [ ] **Step 3: Add the incremental migration**

Use idempotency only where PostgreSQL supports it safely; migration history
itself remains the single application guard.

```sql
UPDATE permiso
SET code = 'ACTIVITIES_CREATE_OWN', action = 'create_own'
WHERE code = 'ACTIVITIES_MANAGE_OWN';

CREATE INDEX idx_activity_page
ON actividad (created_at DESC, id DESC)
WHERE deleted_at IS NULL;

CREATE INDEX idx_activity_status_page
ON actividad (status, created_at DESC, id DESC)
WHERE deleted_at IS NULL;

CREATE INDEX idx_activity_order_page
ON actividad (orden_id, created_at DESC, id DESC)
WHERE deleted_at IS NULL AND orden_id IS NOT NULL;

CREATE INDEX idx_activity_technician_visibility
ON actividad_tecnico (tecnico_id, actividad_id);
```

- [ ] **Step 4: Update the idempotent permission catalog and role mapping**

The catalog must contain:

```ts
{ code: "ACTIVITIES_VIEW_ALL", resource: "activities", action: "view_all" },
{ code: "ACTIVITIES_MANAGE", resource: "activities", action: "manage" },
{ code: "ACTIVITIES_CREATE_OWN", resource: "activities", action: "create_own" },
{ code: "ACTIVITIES_OPERATE_OWN", resource: "activities", action: "operate_own" },
```

Assign `VIEW_ALL` and `MANAGE` to SUPERVISOR, `CREATE_OWN` and `OPERATE_OWN` to
TECHNICIAN, and all four to ADMIN through the existing all-permissions rule.
Update `verify-database.sql` to print these exact role mappings and all four new
index names.

- [ ] **Step 5: Apply migration to `public` and `test`, then prove GREEN**

Run:

```powershell
Set-Location server
npm run db:migrate
$testDatabaseUrl = (Get-Content .env | Where-Object { $_ -like 'DATABASE_TEST_URL=*' } | Select-Object -First 1) -split '=', 2
$env:DATABASE_URL = $testDatabaseUrl[1]
npm run db:migrate:deploy
Remove-Item Env:DATABASE_URL
npm run db:seed
npm run db:seed
npm run test:db -- tests/database/schema-contract.test.ts tests/database/seed.test.ts
npm test -- tests/auth/authorization.test.ts
npm run db:verify
```

Expected: focused tests pass, seed counts are identical twice, seven migrations
are current, and SQL verification lists the new permissions/indexes.

- [ ] **Step 6: Commit**

```powershell
git add server/prisma/migrations/20260806150000_activities_api_constraints/migration.sql server/prisma/seed/catalogs.ts server/database/verify-database.sql server/tests/database/schema-contract.test.ts server/tests/database/seed.test.ts server/tests/auth/authorization.test.ts
git commit -m "feat(activities): add permissions and database indexes"
```

---

### Task 2: Define Public Contracts, Schemas, State, Time, and Mapping

**Files:**
- Create: `server/src/activities/activities.types.ts`
- Create: `server/src/activities/activities.schemas.ts`
- Create: `server/src/activities/activities.state-machine.ts`
- Create: `server/src/activities/activities.time.ts`
- Create: `server/src/activities/activities.mapper.ts`
- Create: `server/src/activities/activities.repository.types.ts`
- Test: `server/tests/activities/activities-schemas.test.ts`
- Test: `server/tests/activities/activities-state-machine.test.ts`
- Test: `server/tests/activities/activities-time.test.ts`
- Test: `server/tests/activities/activities-mapper.test.ts`

**Interfaces:**
- Consumes: generated Prisma enums `EstadoActividad`, `RolActividadTecnico` and existing API pagination/error conventions.
- Produces:

```ts
export type ActivityCommand = "START" | "PAUSE" | "RESUME" | "COMPLETE" | "CANCEL";
export interface ActivityActorContext {
  userId: string;
  technicianId: string | null;
  permissions: string[];
  requestId: string;
}
export type ActivityAccessScope =
  | { kind: "ALL" }
  | { kind: "TECHNICIAN"; technicianId: string };
export interface ActivityTeamMemberInput {
  technicianId: string;
  role: "RESPONSIBLE" | "PARTICIPANT";
  participationPercentage: string;
}
export interface ActivityVersionInput { version: number }
export interface CreateActivityInput {
  branchId?: string;
  orderId?: string;
  activityTypeId: string;
  description: string;
  observations?: string;
  team?: ActivityTeamMemberInput[];
}
export interface ManualActivityInput extends CreateActivityInput {
  startedAt: Date;
  endedAt: Date;
  result: string;
  justification: string;
}
export interface UpdateActivityInput extends ActivityVersionInput {
  activityTypeId?: string;
  description?: string;
  observations?: string | null;
}
export interface ReplaceActivityTeamInput extends ActivityVersionInput {
  team: ActivityTeamMemberInput[];
}
export interface PauseActivityInput extends ActivityVersionInput { reason: string }
export interface CompleteActivityInput extends ActivityVersionInput {
  result: string;
  observations?: string | null;
}
export interface CancelActivityInput extends ActivityVersionInput { reason: string }
export interface AdjustActivityInput extends ActivityVersionInput {
  reason: string;
  activityTypeId?: string;
  description?: string;
  observations?: string | null;
  result?: string;
  startedAt?: Date;
  endedAt?: Date;
  team?: ActivityTeamMemberInput[];
}
```

Also produce `ActivityListFilters`, `Pagination`, `PaginatedResult<T>`,
`PublicActivityType`, `PublicActivitySummary`, `PublicActivityDetail`,
`PublicActivityTeamMember`, and `PublicActivityPause` exactly as consumed by
Tasks 3–10.

- [ ] **Step 1: Write schema tests for strict normalized inputs**

Cover: UUID params; page defaults `1/25` and max `100`; trimmed text; ISO dates;
exact decimal strings; one responsible; percentages totaling 100; both/neither
`branchId` and `orderId` rules; manual 1 minute/24 hours/future validation using
a schema factory with injected `now`; complete result; non-empty reasons; strict
rejection of unknown keys; adjustment requiring at least one changed field.

Representative assertion:

```ts
expect(
  manualActivitySchema(() => fixedNow).safeParse({
    orderId,
    activityTypeId,
    description: "Entrega e instalación",
    result: "Equipo operativo",
    justification: "Trabajo registrado al cierre",
    startedAt: "2026-08-06T14:00:00.000Z",
    endedAt: "2026-08-06T15:00:00.000Z",
    team: [{ technicianId, role: "RESPONSIBLE", participationPercentage: "100.00" }],
  }).success,
).toBe(true);
```

- [ ] **Step 2: Write state/time/mapper tests and confirm RED**

State tests enumerate every allowed and rejected transition. Time tests prove
`[start,end)` boundaries, multiple pauses, sub-minute rounding, negative-result
rejection, adjacent intervals, overlap outside/inside a paused gap. Mapper tests
assert no `deletedAt`, relation FK, password, session, or auxiliary hydration
property is exposed.

Run:

```powershell
Set-Location server
npm test -- tests/activities/activities-schemas.test.ts tests/activities/activities-state-machine.test.ts tests/activities/activities-time.test.ts tests/activities/activities-mapper.test.ts
```

Expected: module-not-found failures.

- [ ] **Step 3: Implement pure state and time interfaces**

```ts
export function transitionActivity(
  current: EstadoActividad,
  command: ActivityCommand,
): EstadoActividad | null;

export interface TimeRange { startedAt: Date; endedAt: Date }
export interface ActivityMinutes {
  pausedMinutes: number;
  productiveMinutes: number;
  productiveSegments: TimeRange[];
}
export function calculateActivityMinutes(
  startedAt: Date,
  endedAt: Date,
  pauses: readonly TimeRange[],
): ActivityMinutes;
export function rangesOverlap(left: TimeRange, right: TimeRange): boolean;
export function overlapsAny(
  candidate: TimeRange,
  productiveSegments: readonly TimeRange[],
): boolean;
```

Sort pauses, reject inverted/out-of-bound/overlapping pauses, subtract raw
milliseconds, and floor stored minutes only after subtraction.

- [ ] **Step 4: Implement strict schemas, selects, records, and mapper**

Define `activitySummarySelect`, `activityDetailSelect`, and
`activityTypeSelect` with only public relations. Define record types via
`Prisma.ActividadGetPayload`. The detail select includes all team rows ordered
responsible first then technician code, and pauses ordered by `startedAt ASC,
id ASC`.

Define repository results:

```ts
export type ActivityFailureKind =
  | "ACTIVITY_NOT_FOUND"
  | "ACTIVITY_TYPE_NOT_FOUND"
  | "VERSION_CONFLICT"
  | "INVALID_TEMPORAL_RANGE"
  | "INVALID_ACTIVITY_STATE"
  | "ACTIVE_TIMER_EXISTS"
  | "TIME_OVERLAP"
  | "INVALID_PARTICIPATION_TOTAL"
  | "TECHNICIAN_NOT_ASSIGNED_TO_ORDER"
  | "RESOURCE_INACTIVE";

export type ActivityMutationResult =
  | { kind: "CREATED" | "UPDATED"; activity: ActivityDetailRecord }
  | { kind: ActivityFailureKind };
```

- [ ] **Step 5: Run pure tests and full unit suite**

```powershell
Set-Location server
npm test -- tests/activities/activities-schemas.test.ts tests/activities/activities-state-machine.test.ts tests/activities/activities-time.test.ts tests/activities/activities-mapper.test.ts
npm test
npm run typecheck
npm run lint
```

Expected: all new tests and the existing 158 tests pass.

- [ ] **Step 6: Commit**

```powershell
git add server/src/activities server/tests/activities
git commit -m "feat(activities): define contracts and time rules"
```

---

### Task 3: Add Scoped Catalog, List, and Detail Queries

**Files:**
- Create: `server/src/activities/activities.read.repository.ts`
- Create: `server/tests/database/activities-test-data.ts`
- Create: `server/tests/database/activities-read-persistence.test.ts`
- Modify: `server/src/activities/activities.repository.types.ts`

**Interfaces:**
- Consumes: `ActivityAccessScope`, `ActivityListFilters`, `activitySummarySelect`, `activityDetailSelect`, `activityTypeSelect` from Task 2.
- Produces:

```ts
export interface ActivitiesReadRepository {
  listActivityTypes(): Promise<ActivityTypeRecord[]>;
  listActivities(
    filters: ActivityListFilters,
    scope: ActivityAccessScope,
  ): Promise<PageRecord<ActivitySummaryRecord>>;
  findActivityById(
    id: string,
    scope: ActivityAccessScope,
  ): Promise<ActivityDetailRecord | null>;
}
export function createActivitiesReadRepository(
  database: PrismaClient,
): ActivitiesReadRepository;
```

- [ ] **Step 1: Create a deterministic read fixture and failing tests**

The fixture creates two clients/branches, active and deleted types, four
technicians, pending/running/completed/deleted activities, a historical
participant, and three activities sharing `createdAt` with ordered UUIDs.
Tests assert catalog ordering, every filter, stable pagination, search across
description/result/order/client/technician, ALL scope, TECHNICIAN current and
historical scope, empty pages, and same null for foreign/deleted/nonexistent IDs.

- [ ] **Step 2: Run focused DB test and confirm RED**

```powershell
Set-Location server
npm run test:db -- tests/database/activities-read-persistence.test.ts
```

Expected: repository module/function missing.

- [ ] **Step 3: Implement shared scope and filter builders**

Build `Prisma.ActividadWhereInput` with `deletedAt: null`. Technician scope is:

```ts
{ tecnicos: { some: { tecnicoId: scope.technicianId } } }
```

Do not filter historical team rows by current state. Search uses case-insensitive
`contains` over allowed text/relations. Ignore deleted parents in returned
records. Use a `RepeatableRead` transaction for `findMany` plus `count` so items
and total share a snapshot. Order by `createdAt DESC, id DESC`.

- [ ] **Step 4: Implement catalog and detail hydration**

Catalog returns active, non-deleted types ordered `displayOrder ASC, name ASC,
id ASC`. Detail uses the same scope predicate in its root query; never fetch by
ID first and authorize later.

- [ ] **Step 5: Prove GREEN and run regression suites**

```powershell
Set-Location server
npm run test:db -- tests/database/activities-read-persistence.test.ts
npm run test:db
npm test
npm run typecheck
npm run lint
```

Expected: scoped read tests pass and existing suites remain green.

- [ ] **Step 6: Commit**

```powershell
git add server/src/activities/activities.read.repository.ts server/src/activities/activities.repository.types.ts server/tests/database/activities-test-data.ts server/tests/database/activities-read-persistence.test.ts
git commit -m "feat(activities): add scoped activity queries"
```

---

### Task 4: Create and Edit Pending Activities and Teams

**Files:**
- Create: `server/src/activities/activities.mutation.repository.ts`
- Create: `server/src/activities/activities.repository.helpers.ts`
- Create: `server/tests/database/activities-mutation-persistence.test.ts`
- Modify: `server/src/activities/activities.repository.types.ts`

**Interfaces:**
- Consumes: `CreateActivityInput`, `UpdateActivityInput`, `ReplaceActivityTeamInput`, `ActivityActorContext`, `ActivityMutationResult`.
- Produces:

```ts
export interface ActivitiesPendingMutationRepository {
  createActivity(input: CreateActivityInput, actor: ActivityActorContext, now: Date): Promise<ActivityMutationResult>;
  updateActivity(id: string, input: UpdateActivityInput, actor: ActivityActorContext, now: Date): Promise<ActivityMutationResult>;
  replaceActivityTeam(id: string, input: ReplaceActivityTeamInput, actor: ActivityActorContext, now: Date): Promise<ActivityMutationResult>;
}
export function createActivitiesMutationRepository(
  database: PrismaClient,
): ActivitiesPendingMutationRepository;

export interface ValidatedActivityContext {
  branchId: string;
  orderId: string | null;
  team: ActivityTeamMemberInput[];
}
export async function validateActivityContext(
  transaction: Prisma.TransactionClient,
  input: CreateActivityInput | ManualActivityInput,
  actor: ActivityActorContext,
): Promise<ValidatedActivityContext | { kind: ActivityFailureKind }>;
```

- [ ] **Step 1: Write failing persistence tests**

Cover leader individual/group creation, technician implicit self-team at 100,
order-derived branch, default order PRIMARY responsible, explicit valid order
team, inactive branch/type/technician, foreign order technician, duplicate
member, no/multiple responsible, bad total, pending edit, pending team replace,
non-pending rejection, stale version, audit snapshot, one version increment, and
audit-failure rollback.

- [ ] **Step 2: Confirm RED**

```powershell
Set-Location server
npm run test:db -- tests/database/activities-mutation-persistence.test.ts
```

Expected: mutation repository missing.

- [ ] **Step 3: Implement parent and team validation helpers**

Within one transaction:

1. resolve an order to its non-deleted branch, allowed state, and active
   assignments; otherwise validate standalone active branch;
2. validate active activity type;
3. sort/deduplicate technician IDs;
4. require one responsible and exact decimal total 100.00;
5. for orders, require every member in active `OrdenTecnico` and use active
   PRIMARY as default only when leader input omits team;
6. for technician creation, ignore any attempted foreign team and require self
   as sole responsible.

- [ ] **Step 4: Implement create/update/team transactions**

Create writes `Actividad`, `ActividadTecnico`, and `ACTIVITY_CREATED`. Update and
team replacement use `updateMany({ id, version, status: "PENDING",
deletedAt: null })`, require count 1, increment version once, and write
`ACTIVITY_UPDATED` or `ACTIVITY_TEAM_UPDATED`. Hydrate the complete detail inside
the transaction.

- [ ] **Step 5: Prove RED→GREEN and rollback**

Temporarily force the audit write to throw in the test transaction, observe the
test fail before implementation, restore the real path, and assert activity,
team, version, updatedAt, and audit are unchanged on failure.

Run:

```powershell
Set-Location server
npm run test:db -- tests/database/activities-mutation-persistence.test.ts
npm run test:db
npm test
npm run typecheck
npm run lint
```

- [ ] **Step 6: Commit**

```powershell
git add server/src/activities/activities.mutation.repository.ts server/src/activities/activities.repository.helpers.ts server/src/activities/activities.repository.types.ts server/tests/database/activities-mutation-persistence.test.ts
git commit -m "feat(activities): create and edit pending work"
```

---

### Task 5: Record Manual Completed Activities Safely

**Files:**
- Modify: `server/src/activities/activities.mutation.repository.ts`
- Modify: `server/src/activities/activities.repository.helpers.ts`
- Modify: `server/src/activities/activities.repository.types.ts`
- Modify: `server/tests/database/activities-mutation-persistence.test.ts`

**Interfaces:**
- Consumes: `ManualActivityInput`, `calculateActivityMinutes`, `overlapsAny`.
- Produces:

```ts
export interface ActivitiesManualMutationRepository {
  createManualActivity(input: ManualActivityInput, actor: ActivityActorContext, now: Date): Promise<ActivityMutationResult>;
}
export interface ActivitiesMutationRepository extends
  ActivitiesPendingMutationRepository,
  ActivitiesManualMutationRepository {}
export function createActivitiesMutationRepository(
  database: PrismaClient,
): ActivitiesMutationRepository;
```

- [ ] **Step 1: Add failing manual-entry tests**

Cover technician self entry, leader group entry, 1-minute and 24-hour boundaries,
future/inverted/overlong ranges, active timer conflict, overlap with completed
productive segment, adjacency, valid interval wholly inside a historical pause,
multi-technician conflict, ordered locking, order historical assignment, audit
justification, and rollback.

- [ ] **Step 2: Force and verify the concurrency RED**

Use three PostgreSQL connections: one holds the sorted technician advisory lock,
two attempt overlapping manual writes, then release the blocker. Initial RED is
the missing method. After GREEN, temporarily bypass `lockTechnicians` as a
mutation check and confirm the test fails, then restore the lock. The final
assertion requires one `CREATED`, one `TIME_OVERLAP`, and one persisted activity.

- [ ] **Step 3: Implement technician locks and productive-segment query**

Add internal helpers:

```ts
async function lockTechnicians(
  transaction: Prisma.TransactionClient,
  technicianIds: readonly string[],
): Promise<void>;
async function findProductiveSegments(
  transaction: Prisma.TransactionClient,
  technicianId: string,
  range: TimeRange,
  excludeActivityId?: string,
): Promise<TimeRange[]>;
```

Use transaction-scoped advisory locks derived from each UUID, acquired after
sorting. Query non-cancelled/non-deleted activities whose gross range may
intersect, hydrate closed pauses, derive productive segments, and compare in
memory with `[start,end)` semantics.

- [ ] **Step 4: Implement `createManualActivity` atomically**

Validate parents/team, reject future/range limits against `now`, lock every team
member, revalidate, reject active timer or overlap, create `COMPLETED` activity
with no pauses, set activity/team start/end, calculate productive minutes, write
`ACTIVITY_MANUAL_RECORDED` with justification, and hydrate inside the same
transaction.

- [ ] **Step 5: Run focused and full gates**

```powershell
Set-Location server
npm run test:db -- tests/database/activities-mutation-persistence.test.ts
npm run test:db
npm test
npm run typecheck
npm run lint
```

Expected: deterministic concurrency outcome and no leaked fixture rows.

- [ ] **Step 6: Commit**

```powershell
git add server/src/activities/activities.mutation.repository.ts server/src/activities/activities.repository.helpers.ts server/src/activities/activities.repository.types.ts server/tests/database/activities-mutation-persistence.test.ts
git commit -m "feat(activities): record manual work without overlap"
```

---

### Task 6: Start, Pause, and Resume Timers

**Files:**
- Create: `server/src/activities/activities.operation.repository.ts`
- Create: `server/tests/database/activities-operation-persistence.test.ts`
- Modify: `server/src/activities/activities.repository.types.ts`

**Interfaces:**
- Consumes: `ActivityVersionInput`, `PauseActivityInput`, transition/time helpers, and exported persistence helpers established in Tasks 4–5.
- Produces:

```ts
export interface ActivitiesTimerRepository {
  startActivity(id: string, input: ActivityVersionInput, actor: ActivityActorContext, now: Date): Promise<ActivityMutationResult>;
  pauseActivity(id: string, input: PauseActivityInput, actor: ActivityActorContext, now: Date): Promise<ActivityMutationResult>;
  resumeActivity(id: string, input: ActivityVersionInput, actor: ActivityActorContext, now: Date): Promise<ActivityMutationResult>;
}
export function createActivitiesOperationRepository(
  database: PrismaClient,
): ActivitiesTimerRepository;
```

- [ ] **Step 1: Write failing transition tests**

Cover start with server time on activity/team, participant denied context result,
bad state/version, invalid team, pause opening exactly one row with reason/user,
double pause, resume closing the same pause, paused work permitting another
start, resume blocked while another timer runs, version/audit increments, and
rollback of domain plus pause row.

- [ ] **Step 2: Add a forced two-start concurrency test and confirm RED**

Use a lock-chain with separate connections so both operations enter the
competition for one technician. Assert exactly one `UPDATED`, one
`ACTIVE_TIMER_EXISTS`, one `IN_PROGRESS` activity, and no orphan audit/pause.
After GREEN, temporarily bypass the technician lock, confirm this test fails,
then restore it before running the full suite.

- [ ] **Step 3: Implement shared operational transaction prelude**

Fetch activity plus complete team under root lock, sort/lock all technician IDs,
then re-read state/version/team/ownership. Require actor technician to be current
responsible unless actor carries `ACTIVITIES_MANAGE`. Return discriminated
failures instead of throwing business errors.

- [ ] **Step 4: Implement start, pause, and resume**

- Start: `PENDING → IN_PROGRESS`, set activity/team `startedAt`, reject other
  `IN_PROGRESS` membership, audit `ACTIVITY_STARTED`.
- Pause: `IN_PROGRESS → PAUSED`, create one open `PausaActividad`, audit
  `ACTIVITY_PAUSED` with allowlisted reason.
- Resume: lock team, reject other running membership, close the open pause at
  `now`, `PAUSED → IN_PROGRESS`, audit `ACTIVITY_RESUMED`.

Each command uses `expectedVersion`, changes version once, and returns a fully
hydrated record from its transaction.

- [ ] **Step 5: Run focused concurrency and regression suites**

```powershell
Set-Location server
npm run test:db -- tests/database/activities-operation-persistence.test.ts
npm run test:db
npm test
npm run typecheck
npm run lint
```

- [ ] **Step 6: Commit**

```powershell
git add server/src/activities/activities.operation.repository.ts server/src/activities/activities.repository.types.ts server/tests/database/activities-operation-persistence.test.ts
git commit -m "feat(activities): operate timers transactionally"
```

---

### Task 7: Complete and Cancel Activities

**Files:**
- Modify: `server/src/activities/activities.operation.repository.ts`
- Modify: `server/src/activities/activities.repository.types.ts`
- Modify: `server/tests/database/activities-operation-persistence.test.ts`

**Interfaces:**
- Consumes: `CompleteActivityInput`, `CancelActivityInput`, persisted pause rows, `calculateActivityMinutes`.
- Produces:

```ts
export interface ActivitiesCloseRepository extends ActivitiesTimerRepository {
  completeActivity(id: string, input: CompleteActivityInput, actor: ActivityActorContext, now: Date): Promise<ActivityMutationResult>;
  cancelActivity(id: string, input: CancelActivityInput, actor: ActivityActorContext, now: Date): Promise<ActivityMutationResult>;
}
export function createActivitiesOperationRepository(
  database: PrismaClient,
): ActivitiesCloseRepository;
```

- [ ] **Step 1: Write failing completion/cancellation tests**

Completion: running only, required result, no open pause, raw-millisecond pause
math, group timestamps, zero/nonnegative floor behavior, version, audit, and
rollback. Cancellation: own pending allowed; technician started cancellation
denied; leader pending/running/paused allowed; open pause closes; timestamps are
retained; `productiveMinutes` is null; reason audited; completed/cancelled reject.

- [ ] **Step 2: Confirm RED**

```powershell
Set-Location server
npm run test:db -- tests/database/activities-operation-persistence.test.ts
```

Expected: close methods missing or transition assertions fail.

- [ ] **Step 3: Implement completion**

Use the operational prelude, require `IN_PROGRESS`, load every pause, reject an
open pause, calculate raw milliseconds, set activity/team `endedAt`, persist
`pausedMinutes` and `productiveMinutes`, store result/observations, transition to
`COMPLETED`, audit `ACTIVITY_COMPLETED`, increment once, hydrate in transaction.

- [ ] **Step 4: Implement cancellation with contextual rule input**

Repository revalidates actor ownership supplied in `ActivityActorContext`:
manager may cancel PENDING/IN_PROGRESS/PAUSED; technician must be responsible
and state PENDING. Close an open pause at `now`, set state `CANCELLED`, preserve
operational timestamps, leave `productiveMinutes: null`, audit reason, and
increment once.

- [ ] **Step 5: Prove rollback timestamps and run suites**

Snapshots must include state, startedAt, endedAt, pausedMinutes,
productiveMinutes, version, updatedAt, team timestamps, pauses, and audit before
and after forced audit failure.

```powershell
Set-Location server
npm run test:db -- tests/database/activities-operation-persistence.test.ts
npm run test:db
npm test
npm run typecheck
npm run lint
```

- [ ] **Step 6: Commit**

```powershell
git add server/src/activities/activities.operation.repository.ts server/src/activities/activities.repository.types.ts server/tests/database/activities-operation-persistence.test.ts
git commit -m "feat(activities): complete and cancel recorded work"
```

---

### Task 8: Adjust Completed Activities with Audit Snapshots

**Files:**
- Modify: `server/src/activities/activities.operation.repository.ts`
- Modify: `server/src/activities/activities.repository.helpers.ts`
- Modify: `server/src/activities/activities.repository.types.ts`
- Modify: `server/tests/database/activities-operation-persistence.test.ts`

**Interfaces:**
- Consumes: `AdjustActivityInput`, overlap query, parent/team validators, completed activity detail.
- Produces:

```ts
export interface ActivitiesOperationRepository extends ActivitiesCloseRepository {
  adjustCompletedActivity(id: string, input: AdjustActivityInput, actor: ActivityActorContext, now: Date): Promise<ActivityMutationResult>;
}
export function createActivitiesOperationRepository(
  database: PrismaClient,
): ActivitiesOperationRepository;
export type ActivitiesRepository = ActivitiesReadRepository &
  ActivitiesPendingMutationRepository &
  ActivitiesManualMutationRepository &
  ActivitiesOperationRepository;
```

- [ ] **Step 1: Write failing adjustment tests**

Cover every allowlisted field, preservation of omitted fields, explicit nullable
observations, one temporal endpoint merged with stored counterpart, pause outside
new range rejection, interval overlap, team historical order assignment, exact
100 total, team timestamp synchronization, recalculation, reason, stale version,
non-completed rejection, malicious extra fields rejected at schema boundary,
before/after allowlist, changedFields, and audit-failure rollback.

- [ ] **Step 2: Confirm RED**

```powershell
Set-Location server
npm run test:db -- tests/database/activities-operation-persistence.test.ts
```

- [ ] **Step 3: Implement immutable allowlisted snapshots**

Define one serializer used for both before/after:

```ts
interface ActivityAdjustmentSnapshot {
  activityTypeId: string;
  description: string;
  observations: string | null;
  result: string | null;
  startedAt: string | null;
  endedAt: string | null;
  pausedMinutes: number;
  productiveMinutes: number | null;
  team: Array<{
    technicianId: string;
    role: "RESPONSIBLE" | "PARTICIPANT";
    participationPercentage: string;
  }>;
}
```

No object spread from Prisma records is allowed in audit metadata.

- [ ] **Step 4: Implement the adjustment transaction**

Require `COMPLETED` and version; merge endpoints; ensure every pause remains
inside the final range; validate type/team and historical order assignment;
lock final and previous technician union in sorted order; exclude the current
activity from overlap queries; recalculate minutes; synchronize team timestamps;
increment once; write `ACTIVITY_ADJUSTED` metadata `{ reason, changedFields,
before, after }`; hydrate before commit.

- [ ] **Step 5: Run focused and full suites**

```powershell
Set-Location server
npm run test:db -- tests/database/activities-operation-persistence.test.ts
npm run test:db
npm test
npm run typecheck
npm run lint
```

- [ ] **Step 6: Commit**

```powershell
git add server/src/activities/activities.operation.repository.ts server/src/activities/activities.repository.helpers.ts server/src/activities/activities.repository.types.ts server/tests/database/activities-operation-persistence.test.ts
git commit -m "feat(activities): audit completed work adjustments"
```

---

### Task 9: Add the Authorized Activities Service

**Files:**
- Create: `server/src/activities/activities.service.ts`
- Test: `server/tests/activities/activities-service.test.ts`

**Interfaces:**
- Consumes: complete `ActivitiesRepository`, public mapper functions, actor permissions.
- Produces:

```ts
export interface ActivitiesService {
  listActivityTypes(actor: ActivityActorContext): Promise<PublicActivityType[]>;
  listActivities(filters: ActivityListFilters, actor: ActivityActorContext): Promise<PaginatedResult<PublicActivitySummary>>;
  getActivity(id: string, actor: ActivityActorContext): Promise<PublicActivityDetail>;
  createActivity(input: CreateActivityInput, actor: ActivityActorContext): Promise<PublicActivityDetail>;
  createManualActivity(input: ManualActivityInput, actor: ActivityActorContext): Promise<PublicActivityDetail>;
  updateActivity(id: string, input: UpdateActivityInput, actor: ActivityActorContext): Promise<PublicActivityDetail>;
  replaceActivityTeam(id: string, input: ReplaceActivityTeamInput, actor: ActivityActorContext): Promise<PublicActivityDetail>;
  startActivity(id: string, input: ActivityVersionInput, actor: ActivityActorContext): Promise<PublicActivityDetail>;
  pauseActivity(id: string, input: PauseActivityInput, actor: ActivityActorContext): Promise<PublicActivityDetail>;
  resumeActivity(id: string, input: ActivityVersionInput, actor: ActivityActorContext): Promise<PublicActivityDetail>;
  completeActivity(id: string, input: CompleteActivityInput, actor: ActivityActorContext): Promise<PublicActivityDetail>;
  cancelActivity(id: string, input: CancelActivityInput, actor: ActivityActorContext): Promise<PublicActivityDetail>;
  adjustCompletedActivity(id: string, input: AdjustActivityInput, actor: ActivityActorContext): Promise<PublicActivityDetail>;
}
export function createActivitiesService(
  repository: ActivitiesRepository,
  now?: () => Date,
): ActivitiesService;
```

- [ ] **Step 1: Write a complete service delegation matrix**

Use exact spies and arguments for all 13 methods. Test ALL scope versus forced
TECHNICIAN scope; empty pagination; technician self-create normalization;
technician foreign/group creation forbidden before repository call; leader
management; responsible operation; participant denied; technician pending-only
cancel; manager cancellation/adjustment; and every failure-kind mapping.

- [ ] **Step 2: Confirm RED**

```powershell
Set-Location server
npm test -- tests/activities/activities-service.test.ts
```

- [ ] **Step 3: Implement permission and scope helpers**

`ACTIVITIES_VIEW_ALL` yields ALL. Otherwise any of `CREATE_OWN` or `OPERATE_OWN`
requires a linked technician and yields TECHNICIAN scope. `MANAGE` authorizes all
administrative calls. Technician create/manual calls replace team with exactly
self responsible at `100.00`; the repository still revalidates.

- [ ] **Step 4: Map all failures exhaustively**

Use `Record<ActivityFailureKind, () => ApiError>` with exact status/code from the
spec. Map `INVALID_TEMPORAL_RANGE` to public 400 `VALIDATION_ERROR`. Never map
foreign ownership to a different error than `ACTIVITY_NOT_FOUND` on reads.

- [ ] **Step 5: Prove forbidden calls do not touch repository**

For every denied branch assert all relevant mutation spies have call count zero.
Run:

```powershell
Set-Location server
npm test -- tests/activities/activities-service.test.ts
npm test
npm run typecheck
npm run lint
```

- [ ] **Step 6: Commit**

```powershell
git add server/src/activities/activities.service.ts server/tests/activities/activities-service.test.ts
git commit -m "feat(activities): add authorized activity service"
```

---

### Task 10: Expose the Protected HTTP API

**Files:**
- Create: `server/src/activities/activities.controller.ts`
- Create: `server/src/activities/activities.routes.ts`
- Modify: `server/src/routes/index.ts`
- Modify: `server/vitest.config.ts`
- Modify: `server/vitest.database.config.ts`
- Test: `server/tests/activities/activities-http.test.ts`

**Interfaces:**
- Consumes: `ActivitiesService`, strict schemas, authentication/origin/password/permission middleware.
- Produces: 13 mounted endpoints under `/api/v1` with existing success/error envelopes.

- [ ] **Step 1: Route HTTP tests to the database suite and write RED flow tests**

Exclude `tests/activities/activities-http.test.ts` from unit Vitest and include it
in database Vitest. Build authenticated fixtures for ADMIN, SUPERVISOR,
responsible TECHNICIAN, participant TECHNICIAN, foreign TECHNICIAN, and
provisional-password user.

The main flow must execute: catalog 200; create 201; list/detail 200; update/team
200; start/pause/resume/complete 200; manual create 201; adjustment 200; cancel
200 on a separate activity. Assert version increments, public fields, computed
minutes, audit count, and cleanup by created IDs.

- [ ] **Step 2: Add security and adversarial RED cases**

Cover missing session 401, provisional password 403, Origin 403, permission
403, participant operation 403, foreign/nonexistent same 404 envelope, stale
version 409, invalid state 409, overlap 409, invalid payload 400, strict unknown
keys, and no mutation snapshots. Use a real foreign activity visible to another
technician rather than only a random UUID.

- [ ] **Step 3: Implement controller schema parsing and actor extraction**

Reuse the orders controller conventions: parse params/query/body separately,
convert Zod issues to `ApiError(400, ..., "VALIDATION_ERROR", errors)`, build
`ActivityActorContext` from authenticated request, return 201 for both create
routes and 200 for all other successful routes.

- [ ] **Step 4: Implement route security stacks and mount router**

Security:

```ts
const readPermissions = [
  "ACTIVITIES_VIEW_ALL",
  "ACTIVITIES_MANAGE",
  "ACTIVITIES_CREATE_OWN",
  "ACTIVITIES_OPERATE_OWN",
] as const;
```

- GET catalog/list/detail: auth → password changed → any read permission.
- POST create/manual and PATCH activity: Origin → auth → password changed → any
  of MANAGE/CREATE_OWN.
- PUT team and POST adjustments: Origin → auth → password changed → MANAGE.
- POST start/pause/resume/complete: Origin → auth → password changed → any of
  MANAGE/OPERATE_OWN.
- POST cancel: Origin → auth → password changed → any of
  MANAGE/CREATE_OWN; service enforces pending-only own cancellation.

Mount `/activity-types` and `/activities` without changing existing route order.

- [ ] **Step 5: Run HTTP and full regression gates**

```powershell
Set-Location server
npm run test:db -- tests/activities/activities-http.test.ts
npm test
npm run test:db
npm run typecheck
npm run lint
npm run build
```

Expected: all 13 routes work; unauthorized and foreign requests leave activity,
team, pauses, version, timestamps, and audit unchanged.

- [ ] **Step 6: Commit**

```powershell
git add server/src/activities/activities.controller.ts server/src/activities/activities.routes.ts server/src/routes/index.ts server/vitest.config.ts server/vitest.database.config.ts server/tests/activities/activities-http.test.ts
git commit -m "feat(activities): expose protected time tracking API"
```

---

### Task 11: Document and Verify the Complete Phase

**Files:**
- Modify: `README.md`
- Modify: `docs/architecture/current-state.md`
- Modify: `docs/plans/implementation-plan.md`
- Modify: `server/database/verify-database.sql` if final verification exposes a missing contract
- Test: all existing frontend/backend/database suites

**Interfaces:**
- Consumes: complete 13-endpoint API and six-migration database.
- Produces: reproducible local documentation and final verification evidence.

- [ ] **Step 1: Update documentation with exact delivered behavior**

Document permissions, endpoints, state flow, manual 1-minute/24-hour rules,
team 100.00 rule, one active timer, overlap behavior, adjustment protection,
commands, migration count, permission/index verification, and explicit remaining
mock/frontend/KPI/evidence/reincidence work. Mark Stage 8 complete; do not claim
OpenAPI/Swagger or UI integration.

- [ ] **Step 2: Run Prisma and seed gates**

```powershell
Set-Location server
npm run db:format
npm run db:validate
npm run db:generate
npm run db:seed
npm run db:seed
npm run db:verify
npx prisma migrate status
```

Expected: schema valid, identical seed counts twice, seven migrations current,
permissions/indexes present.

- [ ] **Step 3: Run every automated gate fresh**

```powershell
Set-Location server
npm run typecheck
npm run lint
npm run build
npm test
npm run test:db
Set-Location ..
npm run lint
npm test
npm run build
git diff --check
```

Expected: zero failures/warnings and no whitespace errors.

- [ ] **Step 4: Run a disposable compiled smoke flow**

Start `server/dist/src/server.js` on an unused local port with the existing local
environment. Use an authenticated administrator and a linked technician to
verify health; catalog; pending create; start/pause/resume/complete; manual
create; one overlap 409; one participant operation 403; adjustment; final detail.
Delete only the fixture IDs inside a transaction and stop the process. Record
status codes and version sequence in the task report; do not commit credentials
or the disposable script.

- [ ] **Step 5: Inspect scope and create the phase commit**

```powershell
git status --short
git diff --stat
git diff --check
git add README.md docs/architecture/current-state.md docs/plans/implementation-plan.md server/database/verify-database.sql
git commit -m "docs(activities): document time tracking API"
```

If `verify-database.sql` did not change in this task, omit it from `git add`.

- [ ] **Step 6: Request final whole-branch review**

Review from the merge base through HEAD against both this plan and the approved
spec. Critical/Important findings must be fixed and re-reviewed; Minor findings
must be explicitly adjudicated before integration. Then apply
`superpowers:verification-before-completion` and
`superpowers:finishing-a-development-branch`.

---

## Completion Checklist

- [ ] Seven migrations are applied in `public` and `test`.
- [ ] Seed is idempotent and role permissions match the design.
- [ ] All 13 endpoints are mounted and protected.
- [ ] Technician own visibility and foreign-ID concealment are proven.
- [ ] Pending, timer, manual, close, cancel, and adjustment flows are complete.
- [ ] Team/order/percentage invariants are transactional.
- [ ] Forced concurrency proves one active timer and no overlapping manual time.
- [ ] Rollback tests include activity, team, pauses, version, timestamps, and audit.
- [ ] Backend unit, DB/HTTP, typecheck, lint, and build pass.
- [ ] Frontend lint, 5 tests, and build pass unchanged.
- [ ] Prisma validate/generate, seed twice, verify SQL, and migration status pass.
- [ ] README, architecture, and master plan describe delivered scope accurately.
- [ ] Final review and fresh verification are clean before integration.
