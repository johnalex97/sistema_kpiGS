# Technicians API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a protected PostgreSQL-backed REST API for listing, creating, editing, changing status, deactivating, and reactivating Geek Solution technicians.

**Architecture:** Add a vertical `technicians` module beside `auth`, split into schemas, public types, repository, service, controller, and routes. Prisma owns persistence, transactions, optimistic concurrency, and audit writes; the service owns business rules and public errors; Express owns validation, authentication, permissions, and HTTP response contracts.

**Tech Stack:** Node.js 24, TypeScript 6, Express 5, Prisma 7, PostgreSQL 18, Zod 4, Vitest 4, and Supertest.

## Global Constraints

- Work against the existing database `"Sistema_kpiGS"` and preserve all current data.
- Create one incremental Prisma migration; never edit the two existing applied migrations.
- Keep `public` for local development and `test` for database integration tests.
- Do not add columns to `tecnico`.
- Generate immutable codes from PostgreSQL sequence `tecnico_code_seq` in the format `TEC-001`, `TEC-002`, and so on.
- Normalize work email with `trim().toLowerCase()`; convert an empty optional string to `null`.
- Enforce case-insensitive work-email uniqueness only among records whose `deleted_at` is null.
- A linked user must be active, not deleted, have an active `TECHNICIAN` role, and not be linked to any other technician.
- New technicians always start as `AVAILABLE`.
- Only `AVAILABLE`, `BUSY`, and `ON_ROUTE` are operational status changes; only deactivation sets `INACTIVE`.
- General edit and operational status changes reject inactive or deleted technicians.
- Every mutation after creation requires an exact positive `version` and increments it once.
- Deactivation is soft deletion and is blocked by an active work order or activity.
- All endpoints require an authenticated session and a changed provisional password.
- Reads require `TECHNICIANS_VIEW`; mutations additionally require allowed `Origin` and `TECHNICIANS_MANAGE`.
- Never return authentication fields, complete roles, password data, sessions, or KPI values.
- Do not modify the React technicians screen or replace its mock data in this phase.
- Do not commit or push unless the user explicitly authorizes it; commit commands below are checkpoints only.

---

## File map

```text
server/
├── prisma/
│   └── migrations/<timestamp>_technicians_api_constraints/migration.sql
├── src/
│   ├── auth/auth.routes.ts
│   ├── routes/index.ts
│   └── technicians/
│       ├── technicians.controller.ts
│       ├── technicians.repository.ts
│       ├── technicians.routes.ts
│       ├── technicians.schemas.ts
│       ├── technicians.service.ts
│       └── technicians.types.ts
└── tests/
    ├── database/
    │   └── technicians-persistence.test.ts
    └── technicians/
        ├── technicians-http.test.ts
        ├── technicians-schemas.test.ts
        └── technicians-service.test.ts
├── vitest.config.ts
└── vitest.database.config.ts

README.md
docs/architecture/current-state.md
docs/plans/implementation-plan.md
```

Each file has one responsibility. `technicians.types.ts` is the shared contract;
schemas normalize external input; the repository is the only Prisma boundary;
the service translates repository outcomes into business errors; the controller
maps HTTP; routes compose security in a visible order.

---

### Task 1: PostgreSQL sequence and active-email constraint

**Files:**
- Create: `server/prisma/migrations/<generated>_technicians_api_constraints/migration.sql`
- Create: `server/tests/database/technicians-persistence.test.ts`
- Modify: `server/database/verify-database.sql`

**Interfaces:**
- Consumes: existing `Tecnico.code`, `Tecnico.workEmail`, and `Tecnico.deletedAt`
- Produces: sequence `tecnico_code_seq` and partial unique index `uq_tecnico_work_email_active`

- [ ] **Step 1: Write failing database contract tests**

Create `technicians-persistence.test.ts`, seed once, and test the two database
guarantees with unique UUID-based values:

```ts
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedDatabase } from "../../prisma/seed.js";
import {
  database,
  disconnectTestDatabase,
} from "./database-test-context.js";

beforeAll(() => seedDatabase(database));
afterAll(disconnectTestDatabase);

describe("technician persistence constraints", () => {
  it("allocates a code number after the existing seed range", async () => {
    const rows = await database.$queryRaw<Array<{ value: bigint }>>`
      SELECT nextval('tecnico_code_seq') AS value
    `;
    expect(Number(rows[0]?.value)).toBeGreaterThanOrEqual(4);
  });

  it("rejects equal active work emails ignoring case", async () => {
    const suffix = randomUUID();
    const firstId = randomUUID();
    const secondId = randomUUID();
    try {
      await database.tecnico.create({
        data: {
          id: firstId,
          code: `TEST-${suffix}-A`,
          fullName: "Correo activo A",
          workEmail: `Unique.${suffix}@Example.Test`,
        },
      });
      await expect(
        database.tecnico.create({
          data: {
            id: secondId,
            code: `TEST-${suffix}-B`,
            fullName: "Correo activo B",
            workEmail: `unique.${suffix}@example.test`,
          },
        }),
      ).rejects.toThrow();
    } finally {
      await database.tecnico.deleteMany({
        where: { id: { in: [firstId, secondId] } },
      });
    }
  });
});
```

Add a third case proving that the same email is allowed when the first
technician has non-null `deletedAt`.

- [ ] **Step 2: Run the focused test and verify RED**

```powershell
cd server
npm run test:db -- tests/database/technicians-persistence.test.ts
```

Expected: FAIL because `tecnico_code_seq` and the partial index do not exist.

- [ ] **Step 3: Generate an empty incremental migration**

```powershell
npx prisma migrate dev --create-only --name technicians_api_constraints
```

Replace only the newly generated migration body with:

```sql
CREATE SEQUENCE "tecnico_code_seq" AS BIGINT;

SELECT setval(
  '"tecnico_code_seq"',
  COALESCE(
    (
      SELECT MAX(
        SUBSTRING("code" FROM '^TEC-([0-9]+)$')::BIGINT
      )
      FROM "tecnico"
      WHERE "code" ~ '^TEC-[0-9]+$'
    ),
    0
  ) + 1,
  false
);

CREATE UNIQUE INDEX "uq_tecnico_work_email_active"
ON "tecnico" (LOWER("work_email"))
WHERE "deleted_at" IS NULL AND "work_email" IS NOT NULL;
```

Before applying it, run a read-only preflight against both schemas to confirm
there are no duplicate active emails:

```sql
SELECT LOWER(work_email), COUNT(*)
FROM tecnico
WHERE deleted_at IS NULL AND work_email IS NOT NULL
GROUP BY LOWER(work_email)
HAVING COUNT(*) > 1;
```

Expected: zero rows.

- [ ] **Step 4: Apply the migration to local and test schemas**

```powershell
npx prisma migrate dev
$taskDatabaseUrl=(Get-Content .env | Select-String '^DATABASE_TEST_URL=').Line.Split('=',2)[1]
$env:DATABASE_URL=$taskDatabaseUrl
npx prisma migrate deploy
Remove-Item Env:DATABASE_URL
npm run db:generate
```

Inspect the migration before applying it. It must contain no `DROP`, `DELETE`,
or change to an existing column.

- [ ] **Step 5: Extend read-only database verification**

Add `uq_tecnico_work_email_active` to the existing `pg_indexes` allowlist and
add this sequence inventory:

```sql
SELECT sequencename
FROM pg_sequences
WHERE schemaname = current_schema()
  AND sequencename = 'tecnico_code_seq';
```

- [ ] **Step 6: Verify GREEN**

```powershell
npm run db:validate
npm run test:db -- tests/database/technicians-persistence.test.ts
npm run db:verify
npx prisma migrate status
```

Expected: schema validation passes, all three focused tests pass, and both
schemas report the migration applied.

- [ ] **Step 7: Record the checkpoint**

```powershell
git add server/prisma/migrations server/tests/database/technicians-persistence.test.ts server/database/verify-database.sql
git commit -m "feat(technicians): add code and email constraints"
```

Do not execute the commit without authorization.

---

### Task 2: Public contracts and request validation

**Files:**
- Create: `server/src/technicians/technicians.types.ts`
- Create: `server/src/technicians/technicians.schemas.ts`
- Create: `server/tests/technicians/technicians-schemas.test.ts`

**Interfaces:**
- Produces:
  - `PublicTechnician`, `LinkedUserSummary`, and `TechnicianListResult`
  - `TechnicianListFilters`, `CreateTechnicianInput`, `UpdateTechnicianInput`
  - `ChangeTechnicianStatusInput`, `DeactivateTechnicianInput`, and `ReactivateTechnicianInput`
  - `technicianIdSchema`, `technicianListQuerySchema`, and five mutation schemas

- [ ] **Step 1: Define the public TypeScript contracts**

Use these exact public shapes:

```ts
export type OperationalTechnicianStatus =
  | "AVAILABLE"
  | "BUSY"
  | "ON_ROUTE";
export type TechnicianStatus =
  | OperationalTechnicianStatus
  | "INACTIVE";

export interface LinkedUserSummary {
  id: string;
  email: string;
  displayName: string;
}

export interface PublicTechnician {
  id: string;
  code: string;
  fullName: string;
  specialty: string | null;
  workPhone: string | null;
  workEmail: string | null;
  status: TechnicianStatus;
  hiredOn: string | null;
  leftOn: string | null;
  user: LinkedUserSummary | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface TechnicianListFilters {
  search?: string;
  status?: TechnicianStatus;
  page: number;
  pageSize: number;
  includeInactive: boolean;
}

export interface TechnicianListResult {
  items: PublicTechnician[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

export interface CreateTechnicianInput {
  fullName: string;
  specialty?: string | null;
  workPhone?: string | null;
  workEmail?: string | null;
  hiredOn?: string | null;
  userId?: string | null;
}

export type UpdateTechnicianInput = {
  version: number;
} & Partial<CreateTechnicianInput>;

export interface ChangeTechnicianStatusInput {
  version: number;
  status: OperationalTechnicianStatus;
}

export interface DeactivateTechnicianInput {
  version: number;
  leftOn?: string;
  reason: string;
}

export interface ReactivateTechnicianInput {
  version: number;
  reason: string;
}
```

The update schema must refine `UpdateTechnicianInput` so at least one field
besides `version` is present.

- [ ] **Step 2: Write failing schema tests**

Cover normalization and rejection with literal assertions:

```ts
it("normalizes list defaults and boolean text", () => {
  expect(
    technicianListQuerySchema.parse({ includeInactive: "true" }),
  ).toEqual({
    page: 1,
    pageSize: 20,
    includeInactive: true,
  });
});

it("normalizes optional email and blank optional strings", () => {
  expect(
    createTechnicianSchema.parse({
      fullName: "  Ana López  ",
      specialty: "  ",
      workEmail: "  ANA@EXAMPLE.TEST ",
    }),
  ).toMatchObject({
    fullName: "Ana López",
    specialty: null,
    workEmail: "ana@example.test",
  });
});

it("requires version and an editable field on update", () => {
  expect(() => updateTechnicianSchema.parse({ version: 1 })).toThrow();
  expect(() =>
    updateTechnicianSchema.parse({ fullName: "Ana" }),
  ).toThrow();
});

it("rejects INACTIVE as an operational status", () => {
  expect(() =>
    changeTechnicianStatusSchema.parse({
      version: 1,
      status: "INACTIVE",
    }),
  ).toThrow();
});
```

Also test UUID validation; search length 1–100; page at least 1; pageSize 1–100;
name 1–160; specialty at most 120; phone at most 30; email at most 254;
reason 10–500; positive integer version; `hiredOn` not in the future; and
`leftOn` in `YYYY-MM-DD`.

- [ ] **Step 3: Run schema tests and verify RED**

```powershell
npm run test -- tests/technicians/technicians-schemas.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 4: Implement Zod schemas and date helpers**

Use a factory so date validation receives a stable local date in tests:

```ts
export function createTechnicianSchemas(today: () => string) {
  const localDate = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((value) => {
      const parsed = new Date(`${value}T00:00:00.000Z`);
      return (
        !Number.isNaN(parsed.getTime()) &&
        parsed.toISOString().slice(0, 10) === value
      );
    });

  const nullableTrimmed = (maximum: number) =>
    z.preprocess(
      (value) =>
        typeof value === "string" && value.trim() === ""
          ? null
          : value,
      z.string().trim().max(maximum).nullable().optional(),
    );

}
```

Parse `includeInactive` explicitly from `"true"` and `"false"`; do not use
generic boolean coercion because `"false"` is truthy in JavaScript. Export
the six schemas returned by the factory (`technicianListQuerySchema`,
`createTechnicianSchema`, `updateTechnicianSchema`,
`changeTechnicianStatusSchema`, `deactivateTechnicianSchema`, and
`reactivateTechnicianSchema`) plus `technicianIdSchema`. Build every object
schema with `.strict()`. Create production schemas with a helper returning the
server's current local `YYYY-MM-DD`.

- [ ] **Step 5: Verify GREEN**

```powershell
npm run test -- tests/technicians/technicians-schemas.test.ts
npm run typecheck
npm run lint
```

- [ ] **Step 6: Record the checkpoint**

```powershell
git add server/src/technicians/technicians.types.ts server/src/technicians/technicians.schemas.ts server/tests/technicians/technicians-schemas.test.ts
git commit -m "feat(technicians): define API contracts"
```

Do not execute the commit without authorization.

---

### Task 3: Repository reads, mapping, and eligible-user checks

**Files:**
- Create: `server/src/technicians/technicians.repository.ts`
- Create: `server/src/technicians/technicians.service.ts`
- Create: `server/tests/technicians/technicians-service.test.ts`
- Extend: `server/tests/database/technicians-persistence.test.ts`

**Interfaces:**
- Consumes: types from Task 2 and the generated Prisma client
- Produces:
  - `TechniciansRepository`
  - `createTechniciansRepository(database)`
  - `list(filters)`, `findById(id)`, and `findUserEligibility(userId, excludedTechnicianId?)`
  - `mapPublicTechnician(record)`
  - `createTechniciansService({ repository, now, today })`
  - service methods `list(filters)` and `getById(id)`

- [ ] **Step 1: Write failing mapping and list service tests**

Use a small repository fake at the repository interface for pure service
behavior. Assert exact date serialization and pagination:

```ts
expect(
  mapPublicTechnician({
    ...record,
    hiredOn: new Date("2026-07-01T00:00:00.000Z"),
    leftOn: null,
    createdAt: new Date("2026-07-01T14:00:00.000Z"),
    updatedAt: new Date("2026-07-02T14:00:00.000Z"),
  }),
).toMatchObject({
  hiredOn: "2026-07-01",
  leftOn: null,
  createdAt: "2026-07-01T14:00:00.000Z",
  user: { id: expect.any(String), email: expect.any(String) },
});
```

Test that zero items yield `totalPages: 0`, 21 items at size 20 yield 2 pages,
and `getById` throws `404 TECHNICIAN_NOT_FOUND` when the repository returns
null.

- [ ] **Step 2: Verify the focused service tests RED**

```powershell
npm run test -- tests/technicians/technicians-service.test.ts
```

- [ ] **Step 3: Implement read mapping and repository queries**

Define one reusable Prisma select:

```ts
const technicianSelect = {
  id: true,
  code: true,
  fullName: true,
  specialty: true,
  workPhone: true,
  workEmail: true,
  status: true,
  hiredOn: true,
  leftOn: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  version: true,
  usuario: {
    select: { id: true, email: true, displayName: true },
  },
} as const;
```

`list` must build a Prisma `where` that:

- excludes deleted rows unless `includeInactive` or `status === "INACTIVE"`;
- applies exact status when supplied;
- searches code, full name, specialty, and work email with insensitive
  `contains`;
- runs `findMany` and `count` in one `$transaction`;
- orders by `fullName asc`, then `id asc`;
- uses `(page - 1) * pageSize` and `take: pageSize`.

`findUserEligibility` returns:

```ts
export type UserEligibility =
  | { kind: "ELIGIBLE" }
  | { kind: "NOT_ELIGIBLE" }
  | { kind: "ALREADY_LINKED"; technicianId: string };
```

The eligible query must require `status: "ACTIVE"`, `deletedAt: null`, and at
least one role whose role has `code: "TECHNICIAN"`, `isActive: true`, and
`deletedAt: null`. A technician link blocks reuse even if that technician is
inactive; `excludedTechnicianId` permits retaining the same link during edit.

- [ ] **Step 4: Write and run real PostgreSQL read tests**

Add tests that create isolated technicians and assert:

- case-insensitive search across all four fields;
- `includeInactive=false` excludes deleted rows;
- `status=INACTIVE` includes a deleted inactive row;
- stable alphabetical pagination;
- an active TECHNICIAN user is eligible;
- inactive, deleted, wrong-role, and already-linked users return the correct
  eligibility kind.

```powershell
npm run test:db -- tests/database/technicians-persistence.test.ts
```

Expected before implementation: FAIL. Expected after implementation: PASS.
Cleanup audits, links, roles, users, and technicians by the exact test IDs.

- [ ] **Step 5: Verify Task 3 GREEN**

```powershell
npm run test -- tests/technicians/technicians-service.test.ts
npm run test:db -- tests/database/technicians-persistence.test.ts
npm run typecheck
npm run lint
```

- [ ] **Step 6: Record the checkpoint**

```powershell
git add server/src/technicians server/tests/technicians/technicians-service.test.ts server/tests/database/technicians-persistence.test.ts
git commit -m "feat(technicians): query technicians"
```

Do not execute the commit without authorization.

---

### Task 4: Create, edit, status, concurrency, and auditing

**Files:**
- Modify: `server/src/technicians/technicians.service.ts`
- Modify: `server/src/technicians/technicians.repository.ts`
- Modify: `server/tests/technicians/technicians-service.test.ts`
- Modify: `server/tests/database/technicians-persistence.test.ts`

**Interfaces:**
- Consumes: Task 3 repository reads and `AuthRequestContext`
- Produces:
  - `TechniciansService`
  - `createTechniciansService({ repository, now, today })`
  - `create`, `update`, and `changeStatus`
  - audit actions `TECHNICIAN_CREATED`, `TECHNICIAN_UPDATED`, and `TECHNICIAN_STATUS_CHANGED`

- [ ] **Step 1: Write failing service rule tests**

At the repository boundary, test:

- create checks optional linked-user eligibility and always requests
  `AVAILABLE`;
- `NOT_ELIGIBLE` becomes `409 USER_NOT_ELIGIBLE_AS_TECHNICIAN`;
- `ALREADY_LINKED` becomes `409 USER_ALREADY_LINKED`;
- update/status on missing technician becomes `404 TECHNICIAN_NOT_FOUND`;
- update/status on inactive technician becomes
  `409 INVALID_TECHNICIAN_STATUS`;
- mismatched version becomes `409 VERSION_CONFLICT`;
- duplicate active email becomes `409 WORK_EMAIL_ALREADY_EXISTS`.

Use this actor context:

```ts
const actor = {
  userId: "10000000-0000-4000-8000-000000000001",
  requestId: "20000000-0000-4000-8000-000000000001",
  ipAddress: "127.0.0.1",
  userAgent: "Technicians Service Test",
};
```

- [ ] **Step 2: Verify service tests RED**

```powershell
npm run test -- tests/technicians/technicians-service.test.ts
```

- [ ] **Step 3: Define atomic repository mutation outcomes**

Use one discriminated result across versioned mutations:

```ts
export type TechnicianMutationResult =
  | { kind: "UPDATED"; technician: PublicTechnician }
  | { kind: "NOT_FOUND" }
  | { kind: "INACTIVE" }
  | { kind: "VERSION_CONFLICT" }
  | { kind: "WORK_EMAIL_CONFLICT" }
  | { kind: "USER_NOT_ELIGIBLE" }
  | { kind: "USER_ALREADY_LINKED" };
```

Create uses a PostgreSQL transaction:

1. validate the optional user again inside the transaction;
2. call `SELECT nextval('tecnico_code_seq')`;
3. format `TEC-${String(value).padStart(3, "0")}`;
4. create with `status: "AVAILABLE"` and `version: 1`;
5. write `TECHNICIAN_CREATED` audit;
6. return the selected public record.

Update and status use a transaction and a compare-and-swap:

```ts
const changed = await transaction.tecnico.updateMany({
  where: {
    id,
    version,
    deletedAt: null,
    status: { not: "INACTIVE" },
  },
  data: {
    ...editableData,
    version: { increment: 1 },
  },
});
```

If `changed.count === 0`, query by ID inside the same transaction and apply
this exact precedence: missing → `NOT_FOUND`; different version →
`VERSION_CONFLICT`; deleted or inactive → `INACTIVE`. After success, fetch the
new record and write the audit in the same transaction.

Catch Prisma unique violations by constraint:

- `uq_tecnico_work_email_active` → `WORK_EMAIL_CONFLICT`;
- `tecnico_user_id_key` → `USER_ALREADY_LINKED`;
- the existing code key should retry code allocation at most twice, then
  propagate as an internal error.

Audits use `entity: "tecnico"`, the technician UUID as `entityId`, the actor
fields, permitted before/after snapshots, and no reason for these three
actions.

- [ ] **Step 4: Implement service translation**

The service must validate linked-user eligibility before repository mutation
for a useful early error, while the repository repeats the check atomically.
Translate every discriminated outcome to the stable `ApiError` code from the
approved design. Return the public technician unchanged on success.

- [ ] **Step 5: Add PostgreSQL behavior tests**

Exercise real repository/service operations and assert:

- consecutive created codes are unique and numeric;
- created status is `AVAILABLE`, version is 1;
- email is stored lowercase;
- valid user links and invalid users fail as designed;
- update changes only supplied fields and increments version to 2;
- a stale version cannot overwrite a newer update;
- status change increments version;
- each successful mutation creates exactly one audit with the expected action;
- serialized audits contain only labor fields and no authentication data.

- [ ] **Step 6: Verify Task 4 GREEN**

```powershell
npm run test -- tests/technicians/technicians-service.test.ts
npm run test:db -- tests/database/technicians-persistence.test.ts
npm run typecheck
npm run lint
```

- [ ] **Step 7: Record the checkpoint**

```powershell
git add server/src/technicians server/tests/technicians/technicians-service.test.ts server/tests/database/technicians-persistence.test.ts
git commit -m "feat(technicians): mutate technician records"
```

Do not execute the commit without authorization.

---

### Task 5: Protected deactivation and reactivation

**Files:**
- Modify: `server/src/technicians/technicians.repository.ts`
- Modify: `server/src/technicians/technicians.service.ts`
- Modify: `server/tests/technicians/technicians-service.test.ts`
- Modify: `server/tests/database/technicians-persistence.test.ts`

**Interfaces:**
- Consumes: versioned mutation outcome and actor context from Task 4
- Produces:
  - `deactivate(id, input, actor)`
  - `reactivate(id, input, actor)`
  - `TECHNICIAN_DEACTIVATED` and `TECHNICIAN_REACTIVATED`

- [ ] **Step 1: Write failing deactivation rule tests**

Test exact service outcomes for:

- missing, inactive, and stale-version technicians;
- `leftOn` before `hiredOn`;
- `leftOn` after `today()`;
- active work becomes `409 TECHNICIAN_HAS_ACTIVE_WORK`;
- omitted `leftOn` uses the injected local current date;
- reactivation requires an inactive record;
- reactivation revalidates email and linked user.

- [ ] **Step 2: Verify RED**

```powershell
npm run test -- tests/technicians/technicians-service.test.ts
```

- [ ] **Step 3: Implement the active-work query**

Inside the deactivation transaction, block if either query finds a row:

```ts
const activeOrder = await transaction.ordenTecnico.findFirst({
  where: {
    tecnicoId: id,
    unassignedAt: null,
    orden: {
      deletedAt: null,
      status: {
        in: ["PENDING", "ASSIGNED", "ON_ROUTE", "IN_PROGRESS", "PAUSED"],
      },
    },
  },
  select: { id: true },
});

const activeActivity = await transaction.actividadTecnico.findFirst({
  where: {
    tecnicoId: id,
    actividad: {
      deletedAt: null,
      status: { in: ["PENDING", "IN_PROGRESS", "PAUSED"] },
    },
  },
  select: { id: true },
});
```

Return `{ kind: "ACTIVE_WORK" }` before changing the technician.

- [ ] **Step 4: Implement atomic soft deactivation**

After exact version and state checks:

```ts
data: {
  status: "INACTIVE",
  leftOn: new Date(`${leftOn}T00:00:00.000Z`),
  deletedAt: now,
  version: { increment: 1 },
}
```

Write audit `TECHNICIAN_DEACTIVATED` with before/after snapshots and the
required `reason`. Do not make this operation idempotent: an already inactive
record is `INVALID_TECHNICIAN_STATUS`.

- [ ] **Step 5: Implement atomic reactivation**

Within one transaction:

1. require an existing record, then check exact version, then require
   `status: "INACTIVE"` and non-null `deletedAt`;
2. check that active-email uniqueness will still hold;
3. revalidate the existing optional linked user;
4. set `status: "AVAILABLE"`, `leftOn: null`, `deletedAt: null`;
5. increment version once;
6. write `TECHNICIAN_REACTIVATED` with the supplied reason.

Return the same stable email/user conflict outcomes used by Task 4.

- [ ] **Step 6: Add real work-blocking and lifecycle tests**

Create isolated order/activity assignments and prove:

- each active order state blocks;
- completed and cancelled orders do not block;
- each active activity state blocks;
- completed and cancelled activities do not block;
- successful deactivation sets all three lifecycle fields and version;
- general update then rejects the deactivated record;
- successful reactivation clears lifecycle fields, returns `AVAILABLE`, and
  increments version;
- both lifecycle audit actions contain the reason.

- [ ] **Step 7: Verify Task 5 GREEN**

```powershell
npm run test -- tests/technicians/technicians-service.test.ts
npm run test:db -- tests/database/technicians-persistence.test.ts
npm run typecheck
npm run lint
```

- [ ] **Step 8: Record the checkpoint**

```powershell
git add server/src/technicians server/tests/technicians/technicians-service.test.ts server/tests/database/technicians-persistence.test.ts
git commit -m "feat(technicians): protect technician lifecycle"
```

Do not execute the commit without authorization.

---

### Task 6: Protected HTTP endpoints

**Files:**
- Create: `server/src/technicians/technicians.controller.ts`
- Create: `server/src/technicians/technicians.routes.ts`
- Modify: `server/src/auth/auth.routes.ts`
- Modify: `server/src/routes/index.ts`
- Create: `server/tests/technicians/technicians-http.test.ts`
- Modify: `server/vitest.config.ts`
- Modify: `server/vitest.database.config.ts`

**Interfaces:**
- Consumes: schemas and service from Tasks 2–5, current auth service factory,
  and current security middleware
- Produces:
  - `createTechniciansController(service)`
  - `createTechniciansRouter(env, database, authService)`
  - `GET /api/v1/technicians`
  - `GET /api/v1/technicians/:id`
  - `POST /api/v1/technicians`
  - `PATCH /api/v1/technicians/:id`
  - `PATCH /api/v1/technicians/:id/status`
  - `DELETE /api/v1/technicians/:id`
  - `POST /api/v1/technicians/:id/reactivate`

- [ ] **Step 1: Write failing HTTP security tests**

Using real PostgreSQL auth, a disposable user, and Supertest, assert:

- no session → `401 AUTHENTICATION_REQUIRED`;
- provisional password → `403 PASSWORD_CHANGE_REQUIRED`;
- missing `TECHNICIANS_VIEW` → `403 FORBIDDEN` on GET;
- missing `Origin` → `403 ORIGIN_REQUIRED` on mutation;
- disallowed `Origin` → `403 ORIGIN_NOT_ALLOWED`;
- view-only user can read but receives `403 FORBIDDEN` on mutation;
- admin and supervisor seeded permissions allow both reads and mutations.

Do not infer access from role names; construct test roles through persisted
permissions.

- [ ] **Step 2: Verify HTTP tests RED**

```powershell
npm run test:db -- tests/technicians/technicians-http.test.ts
```

- [ ] **Step 3: Expose one shared authentication service**

Refactor route composition so `createApiRouter` builds the auth service once
and passes the same instance to auth and technicians routers. Change
`createAuthRouter` to accept `AuthService` instead of constructing its own:

```ts
const authService = createAuthService({
  repository: createAuthRepository(database),
  now: () => new Date(),
  config: {
    sessionTtlMinutes: env.AUTH_SESSION_TTL_MINUTES,
    sessionIdleMinutes: env.AUTH_SESSION_IDLE_MINUTES,
    maxFailedAttempts: env.AUTH_MAX_FAILED_ATTEMPTS,
    lockMinutes: env.AUTH_LOCK_MINUTES,
  },
});

router.use("/auth", createAuthRouter(env, authService));
router.use(
  "/technicians",
  createTechniciansRouter(env, database, authService),
);
```

This is a composition-only refactor. Existing auth tests must remain green.
Add `tests/technicians/technicians-http.test.ts` to the database Vitest
`include` list and to the unit Vitest `exclude` list so it runs exactly once
against the protected `test` schema.

- [ ] **Step 4: Implement controller validation and responses**

Create one local `validationError(ZodError)` mapper identical to the existing
API contract. Extract actor context as:

```ts
{
  userId: request.auth!.userId,
  requestId: request.requestId,
  ipAddress: request.ip || null,
  userAgent: request.header("user-agent")?.slice(0, 500) ?? null,
}
```

Return:

- list `200`, message `"Técnicos consultados"`, `{ items, pagination }`;
- detail `200`, message `"Técnico consultado"`, the technician;
- create `201`, message `"Técnico creado"`;
- update `200`, message `"Técnico actualizado"`;
- status `200`, message `"Estado del técnico actualizado"`;
- delete `200`, message `"Técnico desactivado"`;
- reactivate `200`, message `"Técnico reactivado"`.

Every response uses `success`, `message`, `data`, empty `errors`, and
`meta.requestId`.

- [ ] **Step 5: Compose routes in the approved security order**

```ts
const readSecurity = [
  authentication,
  requirePasswordChanged,
  requirePermission("TECHNICIANS_VIEW"),
];
router.get("/", ...readSecurity, controller.list);
router.get("/:id", ...readSecurity, controller.get);

const mutationSecurity = [
  requireAllowedOrigin(env.CORS_ORIGINS),
  authentication,
  requirePasswordChanged,
  requirePermission("TECHNICIANS_MANAGE"),
];
router.post("/", ...mutationSecurity, controller.create);
router.patch("/:id", ...mutationSecurity, controller.update);
router.patch("/:id/status", ...mutationSecurity, controller.changeStatus);
router.delete("/:id", ...mutationSecurity, controller.deactivate);
router.post(
  "/:id/reactivate",
  ...mutationSecurity,
  controller.reactivate,
);
```

The effective mutation order is Origin → session → password changed →
permission, matching the approved design. Each mutable route visibly includes
all four controls.

- [ ] **Step 6: Add HTTP contract tests**

Assert all seven endpoint statuses and messages, plus:

- invalid UUID/query/body → `400 VALIDATION_ERROR`;
- list defaults and `totalPages: 0`;
- create ignores/rejects client-supplied `code`, `status`, and audit fields via
  strict Zod objects;
- stale version → `409 VERSION_CONFLICT`;
- active work → `409 TECHNICIAN_HAS_ACTIVE_WORK`;
- detail can read an inactive record;
- serialized JSON never includes `passwordHash`, `mustChangePassword`,
  `failedLoginAttempts`, `lockedUntil`, `roles`, `permissions`, or KPI data.

- [ ] **Step 7: Verify Task 6 GREEN**

```powershell
npm run test:db -- tests/technicians/technicians-http.test.ts
npm run test -- tests/auth/authorization.test.ts
npm run test:db -- tests/auth/auth-http.test.ts
npm run typecheck
npm run lint
```

- [ ] **Step 8: Record the checkpoint**

```powershell
git add server/src/routes/index.ts server/src/auth/auth.routes.ts server/src/technicians server/tests/technicians server/vitest.config.ts server/vitest.database.config.ts
git commit -m "feat(technicians): expose protected REST API"
```

Do not execute the commit without authorization.

---

### Task 7: Documentation and complete verification

**Files:**
- Modify: `README.md`
- Modify: `docs/architecture/current-state.md`
- Modify: `docs/plans/implementation-plan.md`

**Interfaces:**
- Consumes: completed technicians API
- Produces: reproducible local instructions and verified Stage 6A status

- [ ] **Step 1: Document the local API**

Add the seven endpoints, the two permission codes, the lifecycle rules, and
example requests using placeholders only:

```powershell
Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:3000/api/v1/technicians?page=1&pageSize=20" `
  -WebSession $session
```

Document that mutations require the browser/session cookie plus
`Origin: http://localhost:5173`, and that the current React technicians screen
still uses mock data by design.

- [ ] **Step 2: Update architecture and roadmap**

In `current-state.md`, record:

- PostgreSQL-backed technicians API;
- sequence and partial-email index;
- optimistic concurrency and soft-deactivation rules;
- actual test counts from the final commands.

Mark only Stage 6A complete in `implementation-plan.md`. Leave clients,
branches, contacts, KPI calculation, and frontend integration pending.

- [ ] **Step 3: Run complete backend verification**

```powershell
cd server
npm run db:validate
npm run db:generate
npx prisma migrate status
npm run db:seed
npm run db:verify
npm run typecheck
npm run lint
npm run test
npm run test:db
npm run build
npm audit --audit-level=moderate
```

Every command must exit 0. Capture the actual unit and database test counts for
the documentation.

- [ ] **Step 4: Run a compiled API smoke test**

Import `server/dist/src/app.js`, listen on port 0, and use a disposable active
admin with changed password to:

1. log in;
2. create a technician;
3. list and retrieve it;
4. change its status with the returned version;
5. deactivate it with the next version;
6. reactivate it with the next version;
7. log out;
8. delete all disposable audits, sessions, links, users, and technicians in
   `finally`;
9. close HTTP and Prisma in `finally`.

Expected statuses: `200, 201, 200, 200, 200, 200, 200, 204`.

- [ ] **Step 5: Run frontend regression verification**

From the repository root:

```powershell
npm run lint
npm run test -- --run
npm run build
npm audit --audit-level=moderate
```

The existing mock frontend must remain unchanged and green.

- [ ] **Step 6: Run repository and secret checks**

```powershell
git diff --check
git check-ignore server/.env server/generated/prisma
git ls-files server/.env
git status --short
```

`server/.env` must remain ignored and absent from `git ls-files`. Search
versionable files for real PostgreSQL credentials, seed passwords, cookies,
raw tokens, and password/session hashes. Test fixtures and explicit
placeholders are allowed only after manual review.

- [ ] **Step 7: Record the final checkpoint**

```powershell
git add README.md docs server
git commit -m "feat(technicians): complete technician management API"
```

Do not execute the commit or push without explicit authorization.

---

## Plan self-review checklist

- Tasks 1–7 cover all 18 sections and 11 acceptance criteria in the approved
  design specification.
- The migration calculates the next code from existing valid `TEC-N` codes and
  does not assume seed state.
- Active-email uniqueness, email reuse after deactivation, and reactivation
  conflict are tested separately.
- Optional user linking checks status, deletion, active role, and global
  one-to-one use, including inactive technicians.
- Every versioned mutation distinguishes not found, inactive state, and stale
  version without silently overwriting data.
- Deactivation checks both active order assignments and activity
  participation inside the mutation transaction.
- All five technician audit actions are transaction-bound and exclude
  authentication fields.
- HTTP tests cover authentication, provisional password, Origin, both
  permissions, validation, response shape, and sensitive-field exclusion.
- Frontend integration, client management, order assignment, KPI calculations,
  recurrence calculations, deployment, and domains remain outside this plan.
- Existing migrations are never edited and no destructive SQL is introduced.
- Commit commands are documentation-only checkpoints and remain unauthorized.
