# Clients, Branches, and Contacts API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a protected PostgreSQL-backed REST API for managing Geek Solution clients, their service branches, and general or branch-specific contacts.

**Architecture:** Add one vertical `clients` module beside `technicians`, with schemas, public types, mapping, repository, service, controller, and routes. Prisma transactions enforce codes, ownership, optimistic concurrency, lifecycle invariants, primary-contact rules, and audit writes; Express composes authentication and permissions around the service.

**Tech Stack:** Node.js 24, TypeScript 6, Express 5, Prisma 7, PostgreSQL 18, Zod 4, Vitest 4, and Supertest.

## Global Constraints

- Work against database `"Sistema_kpiGS"`; preserve all existing data.
- Use `public` for local development and `test` for database integration tests.
- Create one incremental migration; never edit the three existing applied migrations.
- Add positive `version` columns, default 1, to `sucursal_cliente` and `contacto_cliente`.
- Client codes are immutable `CLI-001`, `CLI-002`, and so on, allocated by `cliente_code_seq`.
- The initial branch code is immutable `MAIN`; later codes are per-client `SUC-001`, `SUC-002`, and so on.
- Tax ID is optional and unique across active and inactive history after removing spaces/hyphens and ignoring case.
- Normalize email with `trim().toLowerCase()` and empty optional strings to `null`.
- Coordinates `lat` and `long` must be supplied together; `country` defaults to `HN`.
- Creating a client atomically creates its required main branch and optional primary contact.
- An active client must retain at least one active branch.
- Client deactivation changes no child internal state; effective child activity also depends on the parent.
- Active orders are `PENDING`, `ASSIGNED`, `ON_ROUTE`, `IN_PROGRESS`, or `PAUSED`.
- Active activities are `PENDING`, `IN_PROGRESS`, or `PAUSED`.
- One active primary contact is allowed per client-wide scope and one per branch scope; secondaries are unlimited.
- Mutations after creation require an exact positive `version`, increment it once, and audit in the same transaction.
- All reads require `CLIENTS_VIEW`; mutations require allowed `Origin` and `CLIENTS_MANAGE`.
- `CLIENTS_VIEW` belongs to `ADMIN`, `SUPERVISOR`, and `TECHNICIAN`; `CLIENTS_MANAGE` remains with `ADMIN` and `SUPERVISOR`.
- Do not modify the React frontend, orders API, activities API, KPI logic, deployment, or domains.
- Checkpoint commit commands are part of the execution plan; do not push without explicit authorization.

---

## File map

```text
server/
├── prisma/
│   ├── schema.prisma
│   ├── migrations/20260731120000_clients_api_constraints/migration.sql
│   └── seed/catalogs.ts
├── src/
│   ├── clients/
│   │   ├── clients.controller.ts
│   │   ├── clients.mapper.ts
│   │   ├── clients.repository.ts
│   │   ├── clients.routes.ts
│   │   ├── clients.schemas.ts
│   │   ├── clients.service.ts
│   │   └── clients.types.ts
│   └── routes/index.ts
└── tests/
    ├── clients/
    │   ├── clients-http.test.ts
    │   ├── clients-schemas.test.ts
    │   └── clients-service.test.ts
    └── database/clients-persistence.test.ts

server/database/verify-database.sql
server/tests/database/schema-contract.test.ts
server/tests/database/seed.test.ts
docs/architecture/current-state.md
docs/plans/implementation-plan.md
README.md
```

`clients.types.ts` defines stable contracts; schemas own external
normalization; the mapper prevents persistence fields leaking; the repository
is the only Prisma boundary; the service translates repository outcomes into
public business errors; controller and routes own HTTP composition.

---

### Task 1: Database constraints, versions, sequence, and permissions

**Files:**
- Create: `server/prisma/migrations/20260731120000_clients_api_constraints/migration.sql`
- Create: `server/tests/database/clients-persistence.test.ts`
- Modify: `server/prisma/schema.prisma`
- Modify: `server/prisma/seed/catalogs.ts`
- Modify: `server/tests/database/schema-contract.test.ts`
- Modify: `server/tests/database/seed.test.ts`
- Modify: `server/database/verify-database.sql`

**Interfaces:**
- Consumes: existing `Cliente`, `SucursalCliente`, `ContactoCliente`, `Rol`, and `Permiso` records.
- Produces: `cliente_code_seq`, version columns, normalized-tax index, active-primary indexes, and `CLIENTS_VIEW` assignments.

- [ ] **Step 1: Write failing persistence and seed tests**

Create database cases that use random UUIDs and clean their exact IDs. Assert:

```ts
expect(Number((await database.$queryRaw<Array<{ value: bigint }>>`
  SELECT nextval('cliente_code_seq') AS value
`)[0]?.value)).toBeGreaterThanOrEqual(3);

const branch = await database.sucursalCliente.findFirstOrThrow();
const contact = await database.contactoCliente.findFirstOrThrow();
expect(branch.version).toBeGreaterThan(0);
expect(contact.version).toBeGreaterThan(0);
```

Insert tax IDs `0801-1999 123456` and `08011999123456` for different clients
and expect the second insert to reject, even if the first has `deletedAt` set.
Insert two active general primaries for one client and expect rejection. Insert
two active primaries for one branch and expect rejection. Prove a deactivated
primary (`isActive=false`, `deletedAt!=null`) does not block a new primary.

Extend the seed test to assert exact permission matrices:

```ts
expect(rolePermissions.ADMIN).toContain("CLIENTS_VIEW");
expect(rolePermissions.SUPERVISOR).toEqual(
  expect.arrayContaining(["CLIENTS_VIEW", "CLIENTS_MANAGE"]),
);
expect(rolePermissions.TECHNICIAN).toContain("CLIENTS_VIEW");
expect(rolePermissions.TECHNICIAN).not.toContain("CLIENTS_MANAGE");
```

- [ ] **Step 2: Run focused tests and verify RED**

```powershell
cd server
npm run test:db -- tests/database/clients-persistence.test.ts tests/database/seed.test.ts
```

Expected: FAIL because the sequence, versions, tax index, general-primary
index, and permission do not yet exist.

- [ ] **Step 3: Add the Prisma fields and incremental SQL**

Add `version Int @default(1)` to both child models. Create the migration with:

```sql
ALTER TABLE "sucursal_cliente"
ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "contacto_cliente"
ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "sucursal_cliente"
ADD CONSTRAINT "ck_sucursal_cliente_version_positive" CHECK ("version" > 0);

ALTER TABLE "contacto_cliente"
ADD CONSTRAINT "ck_contacto_cliente_version_positive" CHECK ("version" > 0);

CREATE SEQUENCE "cliente_code_seq" AS BIGINT;

SELECT setval(
  '"cliente_code_seq"',
  COALESCE((
    SELECT MAX(SUBSTRING("code" FROM '^CLI-([0-9]+)$')::BIGINT)
    FROM "cliente"
    WHERE "code" ~ '^CLI-[0-9]+$'
  ), 0) + 1,
  false
);

CREATE UNIQUE INDEX "uq_cliente_tax_id_normalized"
ON "cliente" (UPPER(REGEXP_REPLACE("tax_id", '[-[:space:]]', '', 'g')))
WHERE "tax_id" IS NOT NULL;

DROP INDEX IF EXISTS "uq_contacto_principal_sucursal";

CREATE UNIQUE INDEX "uq_contacto_principal_sucursal"
ON "contacto_cliente" ("sucursal_id")
WHERE "sucursal_id" IS NOT NULL
  AND "is_primary" = true
  AND "is_active" = true
  AND "deleted_at" IS NULL;

CREATE UNIQUE INDEX "uq_contacto_principal_cliente"
ON "contacto_cliente" ("cliente_id")
WHERE "sucursal_id" IS NULL
  AND "is_primary" = true
  AND "is_active" = true
  AND "deleted_at" IS NULL;
```

Before applying, query both schemas for duplicate normalized tax IDs and
duplicate active primaries. Expected result for each preflight query: zero rows.

- [ ] **Step 4: Add idempotent permission data**

Add `{ code: "CLIENTS_VIEW", resource: "clients", action: "view" }` to
`permissionData`. Add it to all three role arrays, leaving `CLIENTS_MANAGE` out
of `TECHNICIAN`.

- [ ] **Step 5: Apply and verify both schemas**

```powershell
npx prisma migrate dev
$clientsTestUrl=(Get-Content .env | Select-String '^DATABASE_TEST_URL=').Line.Split('=',2)[1]
$env:DATABASE_URL=$clientsTestUrl
npx prisma migrate deploy
Remove-Item Env:DATABASE_URL
npm run db:generate
npm run db:seed
npm run db:validate
npm run test:db -- tests/database/clients-persistence.test.ts tests/database/seed.test.ts
```

Extend `verify-database.sql` and schema-contract tests to inventory all new
objects by their exact names. Expected: migration applied and focused tests
pass in `test`.

- [ ] **Step 6: Record the checkpoint**

```powershell
git add server/prisma server/tests/database server/database/verify-database.sql
git commit -m "feat(clients): add database constraints and permissions"
```

---

### Task 2: Public contracts and request validation

**Files:**
- Create: `server/src/clients/clients.types.ts`
- Create: `server/src/clients/clients.schemas.ts`
- Create: `server/tests/clients/clients-schemas.test.ts`

**Interfaces:**
- Produces: public client/branch/contact types, list filters, mutation inputs, actor context, and all Zod request schemas used by Tasks 3–8.

- [ ] **Step 1: Define exact public contracts**

Use these core shapes and add list results with the existing pagination shape:

```ts
export type ContactScope = "CLIENT" | "BRANCH";
export type InitialContactScope = "CLIENT" | "MAIN_BRANCH";

export interface ClientActorContext {
  userId: string;
  requestId: string;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface BranchInput {
  name: string;
  address: string;
  city?: string | null;
  region?: string | null;
  country: string;
  lat?: string | null;
  long?: string | null;
  locationReference?: string | null;
}

export interface ContactInput {
  fullName: string;
  position?: string | null;
  phone?: string | null;
  email?: string | null;
}

export interface CreateClientInput {
  tradeName: string;
  legalName?: string | null;
  taxId?: string | null;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  mainBranch: BranchInput;
  primaryContact?: (ContactInput & { scope: InitialContactScope }) | undefined;
}

export interface PublicBranch {
  id: string;
  clientId: string;
  code: string;
  name: string;
  address: string;
  city: string | null;
  region: string | null;
  country: string;
  lat: string | null;
  long: string | null;
  locationReference: string | null;
  isActive: boolean;
  isEffectivelyActive: boolean;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface PublicContact {
  id: string;
  clientId: string;
  branchId: string | null;
  scope: ContactScope;
  branchName: string | null;
  fullName: string;
  position: string | null;
  phone: string | null;
  email: string | null;
  isPrimary: boolean;
  isActive: boolean;
  isEffectivelyActive: boolean;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface PublicClientSummary {
  id: string;
  code: string;
  tradeName: string;
  legalName: string | null;
  taxId: string | null;
  phone: string | null;
  email: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  version: number;
  activeBranchCount: number;
  activeContactCount: number;
}

export interface PublicClientDetail
  extends Omit<PublicClientSummary, "activeBranchCount" | "activeContactCount"> {
  notes: string | null;
  branches: PublicBranch[];
  contacts: PublicContact[];
}

export interface ClientListFilters {
  search?: string;
  isActive?: boolean;
  includeInactive: boolean;
  page: number;
  pageSize: number;
}

export interface BranchListFilters {
  search?: string;
  city?: string;
  region?: string;
  isActive?: boolean;
  includeInactive: boolean;
  page: number;
  pageSize: number;
}

export interface ContactListFilters {
  search?: string;
  branchId?: string;
  scope?: ContactScope;
  isActive?: boolean;
  includeInactive: boolean;
  page: number;
  pageSize: number;
}

export interface UpdateClientInput {
  version: number;
  tradeName?: string;
  legalName?: string | null;
  taxId?: string | null;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
}

export type CreateBranchInput = BranchInput;

export interface UpdateBranchInput extends Partial<BranchInput> {
  version: number;
}

export interface CreateContactInput extends ContactInput {
  scope: ContactScope;
  branchId?: string | null;
  isPrimary: boolean;
}

export interface UpdateContactInput extends Partial<ContactInput> {
  version: number;
  scope?: ContactScope;
  branchId?: string | null;
  isPrimary?: boolean;
}

export interface LifecycleInput {
  version: number;
  reason: string;
}
```

Use one generic `PaginatedResult<T>` containing `items` and the existing
`page`, `pageSize`, `totalItems`, and `totalPages` fields. Expose active counts
only on client summaries.

- [ ] **Step 2: Write failing schema tests**

Cover literal behavior:

```ts
expect(clientListQuerySchema.parse({ includeInactive: "false" })).toEqual({
  page: 1,
  pageSize: 20,
  includeInactive: false,
});

expect(createClientSchema.parse({
  tradeName: "  Aurora  ",
  email: " ADMIN@AURORA.HN ",
  mainBranch: { name: " Principal ", address: " Centro ", country: "hn" },
})).toMatchObject({
  tradeName: "Aurora",
  email: "admin@aurora.hn",
  mainBranch: { country: "HN" },
});

expect(() => createBranchSchema.parse({
  name: "Norte", address: "Barrio Norte", lat: "14.1",
})).toThrow();
```

Also test strict unknown-field rejection, UUID params, page/pageSize limits,
search length, tax ID maximum 50, country length 2, latitude -90..90,
longitude -180..180, email maximum 254, positive versions, reason 10–500,
update requiring at least one editable field, and contact `branchId` required
exactly when scope is `BRANCH`.

- [ ] **Step 3: Run tests and verify RED**

```powershell
cd server
npm run test -- tests/clients/clients-schemas.test.ts
```

Expected: FAIL because `clients.schemas.ts` does not exist.

- [ ] **Step 4: Implement strict Zod schemas**

Use explicit boolean parsing and a reusable coordinate refinement:

```ts
const booleanText = z
  .union([z.boolean(), z.enum(["true", "false"])])
  .transform((value) => value === true || value === "true");

const branchShape = z.object({
  name: z.string().trim().min(1).max(160),
  address: z.string().trim().min(1).max(300),
  city: nullableTrimmed(100),
  region: nullableTrimmed(100),
  country: z.string().trim().length(2).toUpperCase().default("HN"),
  lat: nullableDecimal(-90, 90),
  long: nullableDecimal(-180, 180),
  locationReference: nullableTrimmed(300),
}).strict().superRefine((value, context) => {
  if ((value.lat == null) !== (value.long == null)) {
    context.addIssue({ code: "custom", message: "lat y long deben enviarse juntos" });
  }
});
```

Export `clientIdSchema`, `branchParamsSchema`, `contactParamsSchema`, three
list-query schemas, three create schemas, three update schemas, and one shared
`lifecycleSchema`.

- [ ] **Step 5: Verify GREEN and checkpoint**

```powershell
npm run test -- tests/clients/clients-schemas.test.ts
npm run typecheck
npm run lint
git add src/clients tests/clients/clients-schemas.test.ts
git commit -m "feat(clients): define API contracts"
```

---

### Task 3: Read repository, mapping, search, and pagination

**Files:**
- Create: `server/src/clients/clients.mapper.ts`
- Create: `server/src/clients/clients.repository.ts`
- Create: `server/src/clients/clients.service.ts`
- Create: `server/tests/clients/clients-service.test.ts`
- Modify: `server/tests/database/clients-persistence.test.ts`

**Interfaces:**
- Consumes: Task 2 types and generated Prisma client.
- Produces: `ClientsRepository`, `createClientsRepository(database)`, `mapPublicClient`, `mapPublicBranch`, `mapPublicContact`, and read methods on `ClientsService`.

- [ ] **Step 1: Write failing mapper and service tests**

Assert that a child is effectively inactive when its parent is inactive and
that Decimal coordinates serialize as strings:

```ts
expect(mapPublicBranch(branchRecord, false)).toMatchObject({
  lat: "14.072300",
  long: "-87.192100",
  isActive: true,
  isEffectivelyActive: false,
});

await expect(service.getClient(missingId, false)).rejects.toMatchObject({
  statusCode: 404,
  code: "CLIENT_NOT_FOUND",
});
```

Test `totalPages=0` for zero records and `2` for 21 records at page size 20.
Test that an inactive client is not returned unless `includeInactive=true`.

- [ ] **Step 2: Verify RED**

```powershell
npm run test -- tests/clients/clients-service.test.ts
```

- [ ] **Step 3: Implement reusable selects and read methods**

Create Prisma selects containing only public fields plus `deletedAt`, parent
activity, branch name, and `_count` needed for mapping. The repository exposes:

```ts
export interface ClientsRepository {
  listClients(filters: ClientListFilters): Promise<ClientPageRecord>;
  findClientById(id: string, includeInactive: boolean): Promise<ClientDetailRecord | null>;
  listBranches(clientId: string, filters: BranchListFilters): Promise<BranchPageRecord | null>;
  listContacts(clientId: string, filters: ContactListFilters): Promise<ContactPageRecord | null>;
}
```

Client search uses insensitive `contains` across code, trade name, legal name,
tax ID, phone, and email; order by `tradeName`, then `id`. Branch search covers
code, name, and address; contact search covers name, position, phone, and email.
Every list runs `findMany` and `count` in one Prisma array transaction.

- [ ] **Step 4: Add real PostgreSQL query tests**

Create isolated clients and assert case-insensitive search, active/inactive
filters, city/region filters, branch ownership, contact scope/branch filters,
stable ordering, and counts. Cleanup by exact client IDs so cascades are not
assumed.

```powershell
npm run test:db -- tests/database/clients-persistence.test.ts
```

- [ ] **Step 5: Verify GREEN and checkpoint**

```powershell
npm run test -- tests/clients/clients-service.test.ts
npm run test:db -- tests/database/clients-persistence.test.ts
npm run typecheck
npm run lint
git add src/clients tests/clients tests/database/clients-persistence.test.ts
git commit -m "feat(clients): query client aggregate"
```

---

### Task 4: Atomic client creation and client editing

**Files:**
- Modify: `server/src/clients/clients.repository.ts`
- Modify: `server/src/clients/clients.service.ts`
- Modify: `server/tests/clients/clients-service.test.ts`
- Modify: `server/tests/database/clients-persistence.test.ts`

**Interfaces:**
- Produces: `service.createClient(input, actor)`, `service.updateClient(id, input, actor)`, and audit actions `CLIENT_CREATED`/`CLIENT_UPDATED`.

- [ ] **Step 1: Write failing service outcome tests**

Use a repository fake and assert these translations:

```ts
expect(repository.createClient).toHaveBeenCalledWith(input, actor, now);
await expect(service.createClient(duplicateTaxInput, actor)).rejects.toMatchObject({
  statusCode: 409,
  code: "TAX_ID_ALREADY_EXISTS",
});
await expect(service.updateClient(id, { version: 1, tradeName: "X" }, actor))
  .rejects.toMatchObject({ statusCode: 409, code: "VERSION_CONFLICT" });
```

Cover `NOT_FOUND`, `INACTIVE`, and successful version increment.

- [ ] **Step 2: Verify RED**

```powershell
npm run test -- tests/clients/clients-service.test.ts
```

- [ ] **Step 3: Implement transactional creation**

Define repository results as discriminated unions: `CREATED`, `UPDATED`,
`NOT_FOUND`, `INACTIVE`, `VERSION_CONFLICT`, and `TAX_ID_CONFLICT`. Creation
must perform, inside one interactive transaction:

```ts
const [{ value }] = await transaction.$queryRaw<Array<{ value: bigint }>>`
  SELECT nextval('cliente_code_seq') AS value
`;
const code = `CLI-${String(value).padStart(3, "0")}`;
const client = await transaction.cliente.create({ data: { code, ...clientData } });
const branch = await transaction.sucursalCliente.create({
  data: { clienteId: client.id, code: "MAIN", ...branchData },
});
```

If present, create the primary contact using `client.id` and either `null` or
`branch.id`. Write `CLIENT_CREATED` with safe client, branch, and contact IDs in
the same transaction. Catch only known unique constraint targets and return
`TAX_ID_CONFLICT`; rethrow unknown database errors.

- [ ] **Step 4: Implement versioned client editing**

Read the current row, reject inactive, compare `version`, check normalized tax
conflict excluding the same ID, then call `updateMany({ where: { id, version },
data: { ...editable, version: { increment: 1 } } })`. If count is zero return
`VERSION_CONFLICT`. Audit only changed public fields.

- [ ] **Step 5: Prove database atomicity and concurrency**

Test code allocation begins after existing seed values; a failing optional
contact rolls back client and `MAIN`; duplicate tax on create/edit maps to the
union result; two edits with the same version yield one success and one version
conflict; and audit is absent after rollback.

```powershell
npm run test:db -- tests/database/clients-persistence.test.ts
npm run test -- tests/clients/clients-service.test.ts
```

- [ ] **Step 6: Record the checkpoint**

```powershell
git add src/clients tests/clients tests/database/clients-persistence.test.ts
git commit -m "feat(clients): create and edit clients"
```

---

### Task 5: Client deactivation and reactivation

**Files:**
- Modify: `server/src/clients/clients.repository.ts`
- Modify: `server/src/clients/clients.service.ts`
- Modify: `server/tests/clients/clients-service.test.ts`
- Modify: `server/tests/database/clients-persistence.test.ts`

**Interfaces:**
- Produces: `deactivateClient`, `reactivateClient`, `CLIENT_DEACTIVATED`, and `CLIENT_REACTIVATED`.

- [ ] **Step 1: Write failing lifecycle rule tests**

Assert exact mappings for `NOT_FOUND`, `VERSION_CONFLICT`, `INACTIVE`,
`ALREADY_ACTIVE`, `ACTIVE_WORK`, and `TAX_ID_CONFLICT`. The service maps active
work to `409 CLIENT_HAS_ACTIVE_WORK` and invalid state to
`409 RESOURCE_INACTIVE`.

- [ ] **Step 2: Implement locked lifecycle transactions**

Lock the client row first:

```ts
await transaction.$queryRaw`
  SELECT "id" FROM "cliente" WHERE "id" = ${id}::uuid FOR UPDATE
`;
```

For deactivation, count orders and activities joined through all client
branches using the exact active status arrays. If either count is nonzero,
return `ACTIVE_WORK`. Otherwise set client `isActive=false`, `deletedAt=now`,
increment version, and audit. Do not update child rows.

For reactivation, require inactive state, recheck normalized tax uniqueness,
set `isActive=true`, clear `deletedAt`, increment version, and audit. Return the
mapped detail proving only internally active children become effectively active.

- [ ] **Step 3: Add PostgreSQL lifecycle tests**

Test client blocking independently for active order and active activity; allow
completed/cancelled work; verify all child `isActive`, `deletedAt`, and `version`
values remain unchanged across parent deactivation/reactivation; verify stale
versions conflict and all audits share the actor request ID.

- [ ] **Step 4: Verify GREEN and checkpoint**

```powershell
npm run test -- tests/clients/clients-service.test.ts
npm run test:db -- tests/database/clients-persistence.test.ts
npm run typecheck
npm run lint
git add src/clients tests/clients tests/database/clients-persistence.test.ts
git commit -m "feat(clients): protect client lifecycle"
```

---

### Task 6: Branch creation, editing, and lifecycle

**Files:**
- Modify: `server/src/clients/clients.repository.ts`
- Modify: `server/src/clients/clients.service.ts`
- Modify: `server/tests/clients/clients-service.test.ts`
- Modify: `server/tests/database/clients-persistence.test.ts`

**Interfaces:**
- Produces: `createBranch`, `updateBranch`, `deactivateBranch`, `reactivateBranch`, and four `BRANCH_*` audit actions.

- [ ] **Step 1: Write failing branch service tests**

Cover client missing/inactive, branch missing or owned by another client,
version conflict, active work, last active branch, successful creation and each
lifecycle transition. Map results to `CLIENT_NOT_FOUND`, `BRANCH_NOT_FOUND`,
`RESOURCE_INACTIVE`, `BRANCH_HAS_ACTIVE_WORK`, and
`CLIENT_REQUIRES_ACTIVE_BRANCH`.

- [ ] **Step 2: Implement per-client code allocation**

Inside one transaction, lock the active parent and acquire an advisory lock:

```ts
await transaction.$queryRaw`
  SELECT pg_advisory_xact_lock(hashtextextended(${clientId}::text, 0))
`;
```

Read codes matching `^SUC-[0-9]+$`, calculate the maximum numeric suffix, and
create `SUC-${String(max + 1).padStart(3, "0")}`. Codes are never editable.

- [ ] **Step 3: Implement edits and lifecycle invariants**

Every mutation locks the parent and branch, verifies ownership and parent
activity, and uses versioned update. Deactivation counts active orders and
activities for that branch and counts other active branches. It allows `MAIN`
to deactivate only when another branch is active. Reactivation restores only
the chosen branch and increments its version.

- [ ] **Step 4: Add PostgreSQL concurrency and lifecycle tests**

Run two concurrent creates for one client and assert different sequential
`SUC-` codes. Test last-branch blocking, `MAIN` deactivation after creating an
alternative, work blocking, parent-inactive rejection, cross-client branch ID
rejection, paired-coordinate persistence, and transaction-bound audits.

- [ ] **Step 5: Verify GREEN and checkpoint**

```powershell
npm run test -- tests/clients/clients-service.test.ts
npm run test:db -- tests/database/clients-persistence.test.ts
npm run typecheck
npm run lint
git add src/clients tests/clients tests/database/clients-persistence.test.ts
git commit -m "feat(clients): manage client branches"
```

---

### Task 7: Contact creation, editing, primary reassignment, and lifecycle

**Files:**
- Modify: `server/src/clients/clients.repository.ts`
- Modify: `server/src/clients/clients.service.ts`
- Modify: `server/tests/clients/clients-service.test.ts`
- Modify: `server/tests/database/clients-persistence.test.ts`

**Interfaces:**
- Produces: `createContact`, `updateContact`, `deactivateContact`, `reactivateContact`, and five `CONTACT_*` audit actions.

- [ ] **Step 1: Write failing contact service tests**

Cover general and branch scopes, branch ownership, inactive parent, missing
contact, stale version, automatic demotion, no automatic promotion, and
reactivation conflict. Map a conflicting active principal to
`409 PRIMARY_CONTACT_CONFLICT`.

- [ ] **Step 2: Implement scope and primary transactions**

Resolve `scope=CLIENT` to `sucursalId=null`; resolve `scope=BRANCH` to the
validated `branchId`. When setting `isPrimary=true`, lock contacts in the same
scope, then demote the previous principal:

```ts
await transaction.contactoCliente.updateMany({
  where: {
    clienteId: clientId,
    sucursalId: branchId,
    isPrimary: true,
    isActive: true,
    deletedAt: null,
    id: { not: contactId },
  },
  data: { isPrimary: false, version: { increment: 1 } },
});
```

For general scope, use `sucursalId: null`. Record `CONTACT_PRIMARY_CHANGED`
with both affected contact IDs. Then create or update the selected contact.

- [ ] **Step 3: Implement contact lifecycle**

Deactivation sets `isActive=false`, `deletedAt=now`, increments version, and
does not promote another contact. Reactivation checks parent activity and, when
the old contact has `isPrimary=true`, rejects if another active principal exists
in the same scope. A successful reactivation restores only that contact.

- [ ] **Step 4: Add PostgreSQL contact tests**

Test one general plus one branch primary coexist; two branch primaries at
different branches coexist; selecting a new primary demotes and increments the
old primary; no promotion occurs on deactivation; old-primary reactivation
conflicts; cross-client branch/contact IDs reject; normalized email persists;
all mutations audit safe before/after data.

- [ ] **Step 5: Verify GREEN and checkpoint**

```powershell
npm run test -- tests/clients/clients-service.test.ts
npm run test:db -- tests/database/clients-persistence.test.ts
npm run typecheck
npm run lint
git add src/clients tests/clients tests/database/clients-persistence.test.ts
git commit -m "feat(clients): manage client contacts"
```

---

### Task 8: HTTP controllers, nested routes, and authorization

**Files:**
- Create: `server/src/clients/clients.controller.ts`
- Create: `server/src/clients/clients.routes.ts`
- Create: `server/tests/clients/clients-http.test.ts`
- Modify: `server/src/routes/index.ts`
- Modify: `server/tests/auth/authorization.test.ts`

**Interfaces:**
- Consumes: Task 2 schemas, Task 3–7 service, existing authentication/origin/permission middleware, and uniform API response helpers.
- Produces: all `/api/v1/clients` routes from the approved design.

The completed router must expose this exact inventory:

```text
GET    /api/v1/clients
GET    /api/v1/clients/:clientId
POST   /api/v1/clients
PATCH  /api/v1/clients/:clientId
DELETE /api/v1/clients/:clientId
POST   /api/v1/clients/:clientId/reactivate
GET    /api/v1/clients/:clientId/branches
POST   /api/v1/clients/:clientId/branches
PATCH  /api/v1/clients/:clientId/branches/:branchId
DELETE /api/v1/clients/:clientId/branches/:branchId
POST   /api/v1/clients/:clientId/branches/:branchId/reactivate
GET    /api/v1/clients/:clientId/contacts
POST   /api/v1/clients/:clientId/contacts
PATCH  /api/v1/clients/:clientId/contacts/:contactId
DELETE /api/v1/clients/:clientId/contacts/:contactId
POST   /api/v1/clients/:clientId/contacts/:contactId/reactivate
```

- [ ] **Step 1: Write failing HTTP security tests**

Build the real app and database fixture following `technicians-http.test.ts`.
Assert unauthenticated read is 401; provisional password is 403; missing Origin
on mutation is 403; technician reads are 200 but mutation is 403; supervisor and
admin mutation are allowed.

```ts
await technicianAgent.get("/api/v1/clients").expect(200);
const forbidden = await technicianAgent
  .post("/api/v1/clients")
  .set("Origin", allowedOrigin)
  .send(validClientBody)
  .expect(403);
expect(forbidden.body.errors[0].code).toBe("FORBIDDEN");
```

- [ ] **Step 2: Implement controller parsing and responses**

Each handler parses params/query/body with Task 2 schemas, builds actor context
from `request.auth` and `request.context`, calls exactly one service method, and
returns the existing envelope. Use Spanish messages such as `Clientes
consultados`, `Cliente creado`, `Sucursal actualizada`, and `Contacto
reactivado`. Never return `deletedAt`, Prisma relations, audit rows, or auth data.

- [ ] **Step 3: Compose routes in non-conflicting order**

```ts
const readSecurity = [authentication, requirePasswordChanged,
  requirePermission("CLIENTS_VIEW")];
const mutationSecurity = [requireAllowedOrigin(env.CORS_ORIGINS),
  authentication, requirePasswordChanged, requirePermission("CLIENTS_MANAGE")];

router.get("/", ...readSecurity, controller.listClients);
router.get("/:clientId/branches", ...readSecurity, controller.listBranches);
router.get("/:clientId/contacts", ...readSecurity, controller.listContacts);
router.get("/:clientId", ...readSecurity, controller.getClient);
router.post("/", ...mutationSecurity, controller.createClient);
```

Register the remaining routes with these exact method/path/controller mappings:

```ts
router.patch("/:clientId", ...mutationSecurity, controller.updateClient);
router.delete("/:clientId", ...mutationSecurity, controller.deactivateClient);
router.post("/:clientId/reactivate", ...mutationSecurity, controller.reactivateClient);

router.post("/:clientId/branches", ...mutationSecurity, controller.createBranch);
router.patch("/:clientId/branches/:branchId", ...mutationSecurity, controller.updateBranch);
router.delete("/:clientId/branches/:branchId", ...mutationSecurity, controller.deactivateBranch);
router.post("/:clientId/branches/:branchId/reactivate", ...mutationSecurity, controller.reactivateBranch);

router.post("/:clientId/contacts", ...mutationSecurity, controller.createContact);
router.patch("/:clientId/contacts/:contactId", ...mutationSecurity, controller.updateContact);
router.delete("/:clientId/contacts/:contactId", ...mutationSecurity, controller.deactivateContact);
router.post("/:clientId/contacts/:contactId/reactivate", ...mutationSecurity, controller.reactivateContact);
```

Mount with `router.use("/clients", createClientsRouter(env, database,
authService))`.

- [ ] **Step 4: Test the complete HTTP lifecycle**

Through Supertest: create client/main/contact; list and detail; update client;
create/update/deactivate/reactivate branch; create general and branch contacts;
change primary; deactivate/reactivate contact; deactivate/reactivate client;
assert versions at every step. Also assert include-inactive behavior, 404 for
cross-client nested IDs, 409 rules, validation errors, pagination shape, and
absence of `passwordHash`, `tokenHash`, `permissions`, and `deletedAt`.

- [ ] **Step 5: Verify GREEN and checkpoint**

```powershell
npm run test -- tests/clients/clients-http.test.ts tests/auth/authorization.test.ts
npm run test:db -- tests/database/clients-persistence.test.ts
npm run typecheck
npm run lint
git add src/clients src/routes/index.ts tests/clients tests/auth/authorization.test.ts
git commit -m "feat(clients): expose protected clients API"
```

---

### Task 9: Documentation, regression, build, and compiled smoke test

**Files:**
- Modify: `README.md`
- Modify: `docs/architecture/current-state.md`
- Modify: `docs/plans/implementation-plan.md`

**Interfaces:**
- Consumes: complete API from Tasks 1–8.
- Produces: verified phase 6B documentation and release evidence.

- [ ] **Step 1: Update project documentation**

Document the three-resource endpoint inventory, permission matrix, automatic
codes, soft-deactivation rules, local migration/seed order, and that the React
frontend still does not consume this API. Mark phase 6B complete without
claiming orders, KPI, deployment, or domains are implemented.

- [ ] **Step 2: Run all regression gates**

```powershell
cd server
npm run db:validate
npm run typecheck
npm run lint
npm run test
npm run test:db
npm run build
npm audit --audit-level=high
cd ..
npm run typecheck
npm run lint
npm run test -- --run
npm run build
npm audit --audit-level=high
```

Expected: every command exits 0. Record exact test counts in the implementation
handoff.

- [ ] **Step 3: Verify migrations and seed are repeatable**

```powershell
cd server
npx prisma migrate status
npm run db:seed
npm run db:seed
npm run db:verify
```

Expected: schema is current, both seed runs exit 0, no duplicate permission
links appear, and verification lists all new database objects.

- [ ] **Step 4: Run compiled-server smoke operations**

Start `node dist/src/server.js` with local environment variables in a hidden
background process. Use a disposable authenticated admin session to execute at
least these eight operations against a uniquely named client: create, list,
detail, client update, branch create, contact create, contact update, and client
detail with children. Then deactivate disposable children/client only when no
work is attached, revoke the test session, and stop the exact server process in
a `finally` block.

Expected: create returns 201; the remaining operations return 200; each response
has a request ID; no secret fields appear.

- [ ] **Step 5: Inspect scope and record the final checkpoint**

```powershell
git status --short
git diff --check
git diff --stat
git add README.md docs server
git commit -m "feat(clients): complete clients API phase"
```

Inspect the staged diff before committing. It must contain no `.env`, password,
database dump, generated secret, frontend feature work, or unrelated user
change. Do not push until the user selects the integration action.

---

## Plan self-review checklist

- The plan covers every endpoint and rule in the approved phase 6B design.
- Schema names, Prisma fields, public `lat`/`long` mapping, version fields, and
  service method names are consistent across tasks.
- Permission creation and all three role assignments are exercised by seed and
  HTTP tests.
- Client creation, branch code allocation, primary changes, lifecycle checks,
  optimistic concurrency, and audits are transaction-bound.
- Inactive parents preserve child internal state and block child mutations.
- Work-blocking statuses match the existing Prisma enums exactly.
- Database tests cover normalized historical tax uniqueness and both primary
  scopes.
- HTTP tests cover authentication, provisional password, Origin, read/manage
  permissions, nested ownership, response contracts, and secret exclusion.
- No frontend, orders/activity API, KPI, recurrence, VPS, or domain work enters
  this phase.
- Existing migrations remain untouched; the only intentional replacement is
  the old branch-primary index with its active-row equivalent.
