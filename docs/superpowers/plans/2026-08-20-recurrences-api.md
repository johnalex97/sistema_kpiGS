# Recurrences API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the reviewed recurrence workflow from technician report through supervised analysis, correction, evidence-backed closure, dismissal, and audited closed-case adjustment.

**Architecture:** Add a focused `recurrences` backend module following route → controller → service → read/report/workflow repositories → Prisma/PostgreSQL. Persist immutable order/technician snapshots and notes, extend the private evidence port to recurrence resources, and expose facts for the later KPI phase without calculating scores here.

**Tech Stack:** Node.js 24, TypeScript 6, Express 5, Zod 4, Prisma 7.9.1, PostgreSQL 18, Vitest 4, Supertest, existing Busboy/local private evidence adapter.

**Spec:** `docs/superpowers/specs/2026-08-20-recurrences-api-design.md`

## Global Constraints

- Keep the SPA on mocks; no frontend API integration enters this plan.
- Add no runtime dependency and do not add OpenAPI, notifications, KPI scores, Docker, VPS, domains, or automatic recurrence detection.
- Preserve all nine applied migrations byte-for-byte; create one additive tenth migration.
- New recurrence numbers are immutable `RI-AAAA-NNNN` values allocated transactionally per year.
- Existing pre-API recurrence rows must survive migration. Backfill numbers deterministically; nullable reporter/reviewer actor fields are accepted only for legacy rows, while every API write supplies actors.
- `OPEN → ANALYSIS → CORRECTION → CLOSED` is the only successful chain. `OPEN` or `ANALYSIS` may become terminal `DISMISSED`; no terminal state reopens.
- Only original-order participants may have `affectsQuality = true`; technical responsibility requires at least one justified original participant, and nontechnical responsibility forces all rows false.
- KPI facts exist only for `CLOSED`; this phase never computes scores.
- Evidence remains private, accepts only JPEG/PNG/WebP/PDF up to 10 MiB, rejects `CLIENT`, and physically retains archived files.
- All writes require allowed origin, authentication, completed password change, permission, row-level visibility, optimistic version where specified, transactional audit, and safe errors.
- For technicians, foreign and absent recurrence IDs are indistinguishable `404` responses.
- Mutations use serializable transactions and the lock order annual sequence → advisory order-pair key → orders sorted by UUID → recurrence → evidence/user.
- `RECURRENCE_WARNING_DAYS` defaults to 30 and accepts integers from 1 through 365.
- Known `pg client.query()` deprecation warnings are recorded but do not fail otherwise green gates.

---

### Task 1: Database workflow contract, migration, configuration, permissions, and seed

**Files:**
- Modify: `server/prisma/schema.prisma`
- Create: `server/prisma/migrations/20260820120000_recurrences_workflow_api/migration.sql`
- Modify: `server/prisma/seed/catalogs.ts`
- Modify: `server/prisma/seed/quality.ts`
- Modify: `server/database/verify-database.sql`
- Modify: `server/src/config/env.ts`
- Modify: `.env.example`
- Modify: `server/.env.example`
- Modify: `server/tests/env.test.ts`
- Modify: `server/tests/database/schema-contract.test.ts`
- Modify: `server/tests/database/constraints.test.ts`
- Modify: `server/tests/database/seed.test.ts`

**Interfaces:**
- Consumes: existing `Reincidencia`, `ReincidenciaOrden`, `ReincidenciaTecnico`, `CausaReincidencia`, `Usuario`, `OrdenTrabajo`, and `Auditoria` tables.
- Produces: Prisma models/fields for the recurrence workflow, exact permissions, and `Environment.RECURRENCE_WARNING_DAYS: number`.

- [ ] **Step 1: Write failing schema, constraint, permission, seed, and environment tests**

Add assertions for:

```ts
expect(Object.values(Prisma.EstadoReincidencia)).toContain("DISMISSED");
expect(Object.values(Prisma.ReincidenciaScalarFieldEnum)).toEqual(
  expect.arrayContaining([
    "recurrenceNumber", "reportedById", "reviewedById", "reviewedAt",
    "ageOverrideReason", "closedById", "dismissedById", "dismissedAt",
    "dismissalReason", "version",
  ]),
);
expect(Prisma.dmmf.datamodel.models.map(({ name }) => name)).toEqual(
  expect.arrayContaining(["SecuenciaReincidencia", "ReincidenciaNota"]),
);
```

Table-drive DB failures for negative cost/minutes, partial close/dismiss triplets,
nonpositive version, blank/bad-format recurrence number, terminal dates before
`detectedAt`, and a participant row that sets `affectsQuality` without both an
original participation type and nonblank justification. Cross-row technical vs.
nontechnical quality rules belong to the transactional tests in Tasks 5 and 6,
not to a PostgreSQL row `CHECK`. Assert `parseEnvironment(baseEnv)` returns warning days `30`, accepts
`1` and `365`, and rejects `0`, `366`, decimals, and non-numeric input. Assert
the exact role matrix:

```ts
expect(supervisorPermissions).toEqual(expect.arrayContaining([
  "RECURRENCES_VIEW_ALL", "RECURRENCES_REVIEW",
]));
expect(technicianPermissions).toEqual(expect.arrayContaining([
  "RECURRENCES_VIEW_OWN", "RECURRENCES_REPORT_OWN",
]));
expect(technicianPermissions).not.toContain("RECURRENCES_REVIEW");
```

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
cd server
npm test -- tests/env.test.ts
npm run test:db -- tests/database/schema-contract.test.ts tests/database/constraints.test.ts tests/database/seed.test.ts
```

Expected: failures for missing enum value, fields/models, permissions, checks,
and environment property.

- [ ] **Step 3: Extend the Prisma contract and environment parser**

Add the workflow fields and relations. Use these shapes as the binding contract:

```prisma
enum EstadoReincidencia {
  OPEN
  ANALYSIS
  CORRECTION
  CLOSED
  DISMISSED @map("dismissed")
  @@map("estado_reincidencia")
}

model SecuenciaReincidencia {
  year       Int @id
  lastNumber Int @default(0) @map("last_number")
  @@map("secuencia_reincidencia")
}

model ReincidenciaNota {
  id             String   @id @default(uuid()) @db.Uuid
  reincidenciaId String   @map("reincidencia_id") @db.Uuid
  authorId       String   @map("author_id") @db.Uuid
  content        String   @db.Text
  createdAt      DateTime @default(now()) @map("created_at") @db.Timestamptz(3)
  reincidencia   Reincidencia @relation(fields: [reincidenciaId], references: [id], onDelete: Restrict)
  author         Usuario @relation(fields: [authorId], references: [id], onDelete: Restrict)
  @@index([reincidenciaId, createdAt, id])
  @@map("reincidencia_nota")
}
```

Make `causeId` nullable for `OPEN`/`DISMISSED`; add the actor/date/reason fields,
relations, `recurrenceNumber @unique @db.VarChar(20)`, and notes relation. Add:

```ts
RECURRENCE_WARNING_DAYS: z.coerce.number().int().min(1).max(365).default(30)
```

to the Zod schema, `Environment`, and parsed return value.

- [ ] **Step 4: Create the additive migration with deterministic legacy backfill**

Generate the migration directory without applying it first:

```bash
cd server
npx prisma migrate dev --name recurrences_workflow_api --create-only
```

Rename only the new directory to the planned timestamp if Prisma chose another
timestamp. In SQL:

- add the enum value outside transaction-sensitive incompatible constructs;
- add nullable columns first;
- backfill `RI-AAAA-NNNN` using a per-year `row_number()` ordered by
  `detected_at, id`, left-padding the ordinal to four digits;
- create/populate `secuencia_reincidencia` with each year's maximum;
- make `recurrence_number` non-null and unique;
- create notes, FKs, indexes, and checks;
- leave actor fields nullable for pre-API legacy rows;
- make new API invariants enforceable through status/field checks without
  inventing legacy actors.

- [ ] **Step 5: Seed permissions, recurrence numbers, and representative workflow data idempotently**

Add permission catalog entries:

```ts
{ code: "RECURRENCES_VIEW_ALL", resource: "recurrences", action: "view_all" },
{ code: "RECURRENCES_VIEW_OWN", resource: "recurrences", action: "view_own" },
{ code: "RECURRENCES_REPORT_OWN", resource: "recurrences", action: "report_own" },
```

Keep `RECURRENCES_REVIEW`. Backfill the two deterministic seed cases with stable
numbers and actor fields through `upsert`. Preserve one technical attributable
case and one equipment non-attributable case.

- [ ] **Step 6: Extend database verification**

Verify the tenth migration, new table/columns, indexes, checks, enum value, four
recurrence permissions, and exact role grants in `verify-database.sql`. The
verifier must fail if a check or permission is absent, not merely print it.

- [ ] **Step 7: Run formatting, migration, focused tests, and commit**

Run:

```bash
cd server
npm run db:format
npm run db:validate
npm run db:generate
npm run db:migrate:deploy
npm run db:verify
npm test -- tests/env.test.ts
npm run test:db -- tests/database/schema-contract.test.ts tests/database/constraints.test.ts tests/database/seed.test.ts
npm run typecheck
npm run lint
```

Repeat deploy/verify against `DATABASE_TEST_URL`. Then commit:

```bash
git add server/prisma/schema.prisma server/prisma/migrations/20260820120000_recurrences_workflow_api/migration.sql server/prisma/seed/catalogs.ts server/prisma/seed/quality.ts server/database/verify-database.sql server/src/config/env.ts .env.example server/.env.example server/tests/env.test.ts server/tests/database/schema-contract.test.ts server/tests/database/constraints.test.ts server/tests/database/seed.test.ts
git commit -m "feat(recurrences): add reviewed workflow contract"
```

---

### Task 2: Domain types, schemas, state machine, calculations, and mapper

**Files:**
- Create: `server/src/recurrences/recurrences.types.ts`
- Create: `server/src/recurrences/recurrences.schemas.ts`
- Create: `server/src/recurrences/recurrences.state-machine.ts`
- Create: `server/src/recurrences/recurrences.calculations.ts`
- Create: `server/src/recurrences/recurrences.mapper.ts`
- Create: `server/src/recurrences/recurrences.repository.types.ts`
- Create: `server/tests/recurrences/recurrences-schemas.test.ts`
- Create: `server/tests/recurrences/recurrences-state-machine.test.ts`
- Create: `server/tests/recurrences/recurrences-calculations.test.ts`
- Create: `server/tests/recurrences/recurrences-mapper.test.ts`

**Interfaces:**
- Consumes: Task 1 Prisma enums/models.
- Produces: all public/input types, Zod schemas, pure transition/calculation functions, Prisma selects, mappers, and repository ports used by Tasks 3–9.

- [ ] **Step 1: Define compile-time ports and public contracts**

Use these exact core signatures:

```ts
export interface RecurrenceActorContext {
  userId: string;
  technicianId: string | null;
  permissions: readonly string[];
  requestId: string;
}

export type RecurrenceAccessScope =
  | { kind: "ALL" }
  | { kind: "TECHNICIAN"; technicianId: string };

export interface ReportRecurrenceInput {
  originalOrderId: string;
  correctionOrderId: string;
  detectedProblem: string;
}

export interface QualityDecisionInput {
  technicianId: string;
  affectsQuality: boolean;
  justification?: string;
}

export interface AnalyzeRecurrenceInput {
  version: number;
  causeId: string;
  impact: "LOW" | "MEDIUM" | "HIGH";
  responsibility: Exclude<ResponsabilidadReincidencia, "UNDETERMINED">;
  analysis: string;
  qualityDecisions: QualityDecisionInput[];
  ageOverrideReason?: string;
  estimatedCost?: string;
  costReason?: string;
}

export interface CorrectRecurrenceInput {
  version: number;
  correctiveAction: string;
  preventiveAction?: string | null;
  observations?: string | null;
  estimatedCost?: string;
  costReason?: string;
}

export interface AddRecurrenceVisitInput { version: number; orderId: string; observation?: string; }
export interface AddRecurrenceNoteInput { content: string; }
export interface DismissRecurrenceInput { version: number; reason: string; }
export interface CloseRecurrenceInput { version: number; }
export type AdjustRecurrenceInput = {
  version: number;
  reason: string;
} & Partial<Omit<AnalyzeRecurrenceInput, "version">>
  & Partial<Omit<CorrectRecurrenceInput, "version">>;
```

Define `RecurrenceListFilters`, `PublicRecurrenceCatalog`,
`PublicRecurrenceSummary`, `PublicRecurrenceDetail`, visit/technician/note DTOs,
pagination, `RecurrenceFailureKind`, `RecurrenceMutationResult`, and repository
interfaces. Repository ports must expose:

```ts
listCauses(): Promise<RecurrenceCauseRecord[]>;
listRecurrences(filters, scope): Promise<PageRecord<RecurrenceSummaryRecord>>;
findRecurrence(id, scope): Promise<RecurrenceDetailRecord | null>;
reportRecurrence(input, actor, now): Promise<RecurrenceMutationResult>;
analyzeRecurrence(id, input, actor, now, warningDays): Promise<RecurrenceMutationResult>;
correctRecurrence(id, input, actor, now): Promise<RecurrenceMutationResult>;
addVisit(id, input, actor, now): Promise<RecurrenceMutationResult>;
addNote(id, input, actor, now): Promise<RecurrenceMutationResult>;
dismissRecurrence(id, input, actor, now): Promise<RecurrenceMutationResult>;
closeRecurrence(id, input, actor, now): Promise<RecurrenceMutationResult>;
adjustClosedRecurrence(id, input, actor, now): Promise<RecurrenceMutationResult>;
```

- [ ] **Step 2: Write failing schema/state/calculation/mapper tests**

Table-drive schemas for trimmed lengths, UUIDs, decimal cost, paired
`estimatedCost/costReason`, unique quality technician IDs, page bounds, date
ranges, and update bodies with at least one mutable field. Assert transitions:

```ts
expect(transitionRecurrence("OPEN", "ANALYZE")).toBe("ANALYSIS");
expect(transitionRecurrence("ANALYSIS", "START_CORRECTION")).toBe("CORRECTION");
expect(transitionRecurrence("CORRECTION", "CLOSE")).toBe("CLOSED");
expect(transitionRecurrence("OPEN", "DISMISS")).toBe("DISMISSED");
expect(transitionRecurrence("CORRECTION", "DISMISS")).toBeNull();
expect(transitionRecurrence("CLOSED", "ANALYZE")).toBeNull();
```

For calculations, prove unique activity IDs are summed once and group size does
not multiply minutes. Prove preventive action is required for `HIGH` or
`TECHNICAL_WORK`. Mapper tests must reject impossible relations and serialize
Decimal/BigInt/Date without leaking internal actor IDs.

- [ ] **Step 3: Run focused unit tests and verify RED**

Run:

```bash
cd server
npm test -- tests/recurrences/recurrences-schemas.test.ts tests/recurrences/recurrences-state-machine.test.ts tests/recurrences/recurrences-calculations.test.ts tests/recurrences/recurrences-mapper.test.ts
```

Expected: missing module failures.

- [ ] **Step 4: Implement schemas and pure functions**

Implement:

```ts
export function transitionRecurrence(current: EstadoReincidencia, command: RecurrenceCommand): EstadoReincidencia | null;
export function requiresPreventiveAction(impact: ImpactoReincidencia, responsibility: ResponsabilidadReincidencia): boolean;
export function sumUniqueProductiveMinutes(rows: readonly { id: string; productiveMinutes: number }[]): number;
export function validateQualityDecisions(responsibility, originalTechnicianIds, decisions): QualityValidationResult;
export function mapRecurrenceSummary(record: RecurrenceSummaryRecord): PublicRecurrenceSummary;
export function mapRecurrenceDetail(record: RecurrenceDetailRecord): PublicRecurrenceDetail;
```

Use explicit Prisma `select` objects with `satisfies Prisma.ReincidenciaSelect`.
Do not cast arbitrary database strings into public enums.

- [ ] **Step 5: Verify and commit**

Run the four focused files, typecheck, lint, and diff-check. Commit:

```bash
git add server/src/recurrences server/tests/recurrences
git commit -m "feat(recurrences): define workflow contracts"
```

---

### Task 3: Scoped catalog, list, and detail reads

**Files:**
- Create: `server/src/recurrences/recurrences.read.repository.ts`
- Create: `server/tests/database/recurrences-test-data.ts`
- Create: `server/tests/database/recurrences-read-persistence.test.ts`

**Interfaces:**
- Consumes: Task 2 read port, selects, filters, and access scopes.
- Produces: Prisma-backed catalog/list/detail reads with historical technician visibility.

- [ ] **Step 1: Create fixed-ID fixtures and failing read tests**

Create ADMIN, SUPERVISOR, linked technician, foreign technician, original and
correction orders, active/legacy recurrence cases, notes, visits, original and
correction participants. Cleanup order must delete evidence/audit/notes,
participants/visits, recurrences, then parent resources.

Assert:

- management sees all cases;
- a technician sees cases where reporter or any participation row matches;
- original/correction participation remains visible after assignment closure;
- foreign and absent detail both return `null` at repository boundary;
- inactive/deleted causes are excluded from catalog but historical detail keeps
  the stored cause;
- filters and stable `detectedAt DESC, id DESC` pagination return exact totals;
- search covers recurrence number, order number, problem, client, and branch;
- an authorized empty page is distinct from an unauthorized resource.

- [ ] **Step 2: Run focused DB tests and verify RED**

```bash
cd server
npm run test:db -- tests/database/recurrences-read-persistence.test.ts
```

Expected: missing read repository.

- [ ] **Step 3: Implement SQL-scoped reads**

Build the technician predicate in the database:

```ts
const ownWhere = {
  OR: [
    { reportedBy: { tecnico: { id: technicianId } } },
    { tecnicos: { some: { tecnicoId: technicianId } } },
  ],
};
```

Use a repeatable-read transaction for count + page. Do not fetch all cases and
filter in memory. Catalog order: `displayOrder ASC, code ASC`.

- [ ] **Step 4: Prove historical ACL with mutation tests**

Temporarily remove each ownership branch in turn and verify its dedicated test
fails, then restore. This demonstrates both reporter and participant visibility
are load-bearing.

- [ ] **Step 5: Verify and commit**

Run the focused DB file, typecheck, lint, and diff-check. Commit:

```bash
git add server/src/recurrences/recurrences.read.repository.ts server/tests/database/recurrences-test-data.ts server/tests/database/recurrences-read-persistence.test.ts
git commit -m "feat(recurrences): scope historical recurrence reads"
```

---

### Task 4: Atomic technician report, numbering, snapshots, and audit

**Files:**
- Create: `server/src/recurrences/recurrences.repository.helpers.ts`
- Create: `server/src/recurrences/recurrences.report.repository.ts`
- Create: `server/tests/database/recurrences-report-persistence.test.ts`

**Interfaces:**
- Consumes: Task 2 report input/result and Task 3 fixtures.
- Produces: `reportRecurrence()` with annual number allocation, duplicate-pair serialization, visits/team snapshots, and audit.

- [ ] **Step 1: Write failing report transaction tests**

Prove success creates in one transaction:

```text
RI-2026-0001
OPEN recurrence
visit 1 for correction order
deduplicated original responsibility snapshot
correction participant snapshot
RECURRENCE_REPORTED audit
```

Assert failures for same order twice, original not completed, correction
cancelled/deleted, different branch, technician not assigned, missing principal
covering `endedAt`, and duplicate open pair. Force audit failure and assert no
case, sequence increment, visit, or participant survives.

- [ ] **Step 2: Write concurrency tests before implementation**

Use barriers/hooks to force:

- two reports in one year receive consecutive unique numbers;
- two reports for the same order pair produce one `CREATED` and one
  `RECURRENCE_DUPLICATE`;
- retryable `P2034` and Prisma `P2010` driver codes `40001`/`40P01` retry at most
  three attempts; unrelated raw errors do not retry.

- [ ] **Step 3: Run focused DB tests and verify RED**

```bash
cd server
npm run test:db -- tests/database/recurrences-report-persistence.test.ts
```

Expected: missing report repository.

- [ ] **Step 4: Implement shared serializable runner and deterministic locks**

Export:

```ts
export async function runRecurrenceSerializableTransaction<T>(database, operation, options?): Promise<T>;
export async function lockOrdersInOrder(transaction, ids: readonly string[]): Promise<LockedOrder[]>;
export async function lockRecurrence(transaction, id: string): Promise<LockedRecurrence | null>;
```

Allocate the sequence first with
`INSERT ... ON CONFLICT ... DO UPDATE RETURNING`; a rejected transaction rolls
the allocation back. Then acquire a transaction advisory lock derived from the
sorted original/correction UUID pair before duplicate lookup, followed by both
order row locks in sorted UUID order. Await and revalidate all locks before
writes. This preserves the global sequence → advisory pair → orders order.

- [ ] **Step 5: Implement snapshots and exact upload audit**

Choose the principal whose assignment interval covers original `endedAt`.
Deduplicate other historical technicians; principal wins over participant.
Snapshot distinct correction-order technicians. Audit entity `Reincidencia`,
entity ID recurrence UUID, action `RECURRENCE_REPORTED`, with public business
fields only.

- [ ] **Step 6: Verify and commit**

Run focused DB, typecheck, lint, and diff-check. Commit:

```bash
git add server/src/recurrences/recurrences.repository.helpers.ts server/src/recurrences/recurrences.report.repository.ts server/tests/database/recurrences-report-persistence.test.ts
git commit -m "feat(recurrences): report cases atomically"
```

---

### Task 5: Analysis, correction, visits, and append-only notes

**Files:**
- Create: `server/src/recurrences/recurrences.workflow.repository.ts`
- Create: `server/tests/database/recurrences-workflow-persistence.test.ts`

**Interfaces:**
- Consumes: Task 2 workflow inputs, Task 4 helpers/locks, Task 3 detail select.
- Produces: analysis/correction/visit/note mutations; Task 6 extends the same repository.

- [ ] **Step 1: Write failing analysis tests**

Cover `OPEN → ANALYSIS`, in-state `ANALYSIS` revision, exact version increment,
active cause, determined responsibility, full original-technician decision set,
technical/nontechnical quality rules, age warning threshold, cost/reason pairing,
exact audit snapshots, stale version, forced rollback, and forbidden actor at
repository scope.

- [ ] **Step 2: Write failing correction, visit, and note tests**

Cover:

- `ANALYSIS → CORRECTION` and in-state correction update;
- corrective action required;
- cost change reason required;
- valid additional visit gets next number and snapshots technicians;
- invalid branch/state/duplicate order rejected without partial writes;
- note is append-only, stores actor/time, and cannot mutate recurrence version;
- terminal cases reject visits and notes;
- audit actions and reasons are exact.

- [ ] **Step 3: Run focused DB tests and verify RED**

```bash
cd server
npm run test:db -- tests/database/recurrences-workflow-persistence.test.ts
```

Expected: workflow repository missing methods.

- [ ] **Step 4: Implement analysis and correction mutations**

Read identifiers without relying on them as validation, lock any referenced
orders in sorted UUID order, then lock recurrence, cause, and users. Revalidate
the recurrence version/state and all relationships after the locks. Use
`updateMany` predicates containing `id`, `version`, and allowed state. Replace
only quality decisions for original snapshot rows; never delete participant
history. Use audit actions
`RECURRENCE_ANALYZED`, `RECURRENCE_CORRECTION_STARTED`, and
`RECURRENCE_CORRECTION_UPDATED`.

- [ ] **Step 5: Implement visits and notes**

For a visit, preliminarily read the recurrence's current order IDs, lock that
union plus the proposed order in sorted UUID order, then lock the recurrence.
Re-read and revalidate version/state, branch, order relation set, and duplicate
visit after the locks; retry the serializable transaction if the preliminary
relation set changed. Allocate `max(visitNumber)+1` and add only missing
correction participants. Notes lock only the recurrence and insert without
update/delete methods. Audit `RECURRENCE_VISIT_ADDED` and
`RECURRENCE_NOTE_ADDED` in the same transaction.

- [ ] **Step 6: Verify and commit**

Run focused DB, typecheck, lint, and diff-check. Commit:

```bash
git add server/src/recurrences/recurrences.workflow.repository.ts server/tests/database/recurrences-workflow-persistence.test.ts
git commit -m "feat(recurrences): review and correct reported cases"
```

---

### Task 6: Dismissal, evidence-backed closure, derived time, and closed adjustment

**Files:**
- Modify: `server/src/recurrences/recurrences.workflow.repository.ts`
- Create: `server/tests/database/recurrences-terminal-persistence.test.ts`

**Interfaces:**
- Consumes: Tasks 2/4/5 contracts and helpers.
- Produces: terminal workflow and audited adjustment used by the service/HTTP layer.

- [ ] **Step 1: Write failing dismissal tests**

Assert only `OPEN`/`ANALYSIS` dismiss, reason is required, all quality flags
become false, dismissal triplet/version/audit are exact, no linked row/evidence
is deleted, stale version has no audit, and concurrent dismiss attempts have one
winner.

- [ ] **Step 2: Write failing closure tests**

Assert closure rejects missing/inactive cause, undetermined responsibility,
missing analysis/corrective/preventive documentation, invalid quality decisions,
zero active evidence, non-completed correction orders, and stale version.

Create completed activities with repeated team membership and prove the case
counts each activity's productive minutes once. Force a concurrent evidence
archive/close race and prove the lock order yields either a valid close with one
active evidence or a documented `RECURRENCE_EVIDENCE_REQUIRED`, never a closed
case that passed a stale pre-lock count.

- [ ] **Step 3: Write failing closed-adjustment tests**

Prove allowed mutable fields, reason/version, quality revalidation, cost reason,
unchanged number/orders/visits/notes/evidence/closedAt, exact before/after audit,
rollback, and concurrent version conflict.

- [ ] **Step 4: Run focused DB tests and verify RED**

```bash
cd server
npm run test:db -- tests/database/recurrences-terminal-persistence.test.ts
```

- [ ] **Step 5: Implement terminal mutations**

Use the state machine and pure calculations. For closure, preliminarily read the
related order IDs, lock those orders in sorted UUID order, then lock the
recurrence, active evidence rows, and related activities. Re-read and revalidate
the recurrence/order relation set, version, state, evidence, documentation, and
completion conditions inside the transaction; retry if the preliminary order
set changed. Set derived minutes/close actors/version, and audit
`RECURRENCE_CLOSED`. Dismiss and adjust audit `RECURRENCE_DISMISSED` and
`RECURRENCE_ADJUSTED` with reasons.

- [ ] **Step 6: Verify and commit**

Run focused DB, typecheck, lint, and diff-check. Commit:

```bash
git add server/src/recurrences/recurrences.workflow.repository.ts server/tests/database/recurrences-terminal-persistence.test.ts
git commit -m "feat(recurrences): finalize reviewed quality facts"
```

---

### Task 7: Service permission matrix and public error policy

**Files:**
- Create: `server/src/recurrences/recurrences.service.ts`
- Create: `server/tests/recurrences/recurrences-service.test.ts`

**Interfaces:**
- Consumes: Tasks 2–6 read/report/workflow ports.
- Produces: `RecurrenceService` methods consumed by controllers and evidence authorization.

- [ ] **Step 1: Define the service interface and failing permission tests**

Use:

```ts
export interface RecurrenceService {
  getCatalog(actor: RecurrenceActorContext): Promise<PublicRecurrenceCatalog>;
  list(filters: RecurrenceListFilters, actor: RecurrenceActorContext): Promise<PaginatedRecurrences>;
  get(id: string, actor: RecurrenceActorContext): Promise<PublicRecurrenceDetail>;
  report(input: ReportRecurrenceInput, actor: RecurrenceActorContext): Promise<PublicRecurrenceDetail>;
  analyze(id: string, input: AnalyzeRecurrenceInput, actor: RecurrenceActorContext): Promise<PublicRecurrenceDetail>;
  correct(id: string, input: CorrectRecurrenceInput, actor: RecurrenceActorContext): Promise<PublicRecurrenceDetail>;
  addVisit(id: string, input: AddRecurrenceVisitInput, actor: RecurrenceActorContext): Promise<PublicRecurrenceDetail>;
  addNote(id: string, input: AddRecurrenceNoteInput, actor: RecurrenceActorContext): Promise<PublicRecurrenceDetail>;
  dismiss(id: string, input: DismissRecurrenceInput, actor: RecurrenceActorContext): Promise<PublicRecurrenceDetail>;
  close(id: string, input: CloseRecurrenceInput, actor: RecurrenceActorContext): Promise<PublicRecurrenceDetail>;
  adjust(id: string, input: AdjustRecurrenceInput, actor: RecurrenceActorContext): Promise<PublicRecurrenceDetail>;
}
```

Table-drive ADMIN, SUPERVISOR, linked technician, unlinked technician, and
missing permission. Management precedence must be permission-based even when
the user also has a technician profile.

- [ ] **Step 2: Write failing result-to-HTTP error tests**

Assert exact mappings for every design error code: 404 hidden resources, 409
version/state/mismatch/duplicate, and 422 documentation/evidence. Verify no
database/storage error detail becomes an API message.

- [ ] **Step 3: Run focused unit tests and verify RED**

```bash
cd server
npm test -- tests/recurrences/recurrences-service.test.ts
```

- [ ] **Step 4: Implement permission scopes and orchestration**

`RECURRENCES_VIEW_ALL`/`RECURRENCES_REVIEW` yield `{ kind: "ALL" }`.
`RECURRENCES_VIEW_OWN` requires a non-null technician profile. Reporting uses
`RECURRENCES_REPORT_OWN` or management. Every administrative mutation requires
`RECURRENCES_REVIEW`; note creation accepts management or visible technician.

- [ ] **Step 5: Verify and commit**

Run focused unit, typecheck, lint, diff-check. Commit:

```bash
git add server/src/recurrences/recurrences.service.ts server/tests/recurrences/recurrences-service.test.ts
git commit -m "feat(recurrences): enforce reviewed workflow policy"
```

---

### Task 8: Extend private evidences to recurrence resources

**Files:**
- Modify: `server/src/evidences/evidences.types.ts`
- Modify: `server/src/evidences/evidences.repository.types.ts`
- Modify: `server/src/evidences/evidences.mapper.ts`
- Modify: `server/src/evidences/evidences.schemas.ts`
- Modify: `server/src/evidences/evidences.read.repository.ts`
- Modify: `server/src/evidences/evidences.mutation.repository.ts`
- Modify: `server/src/evidences/evidences.service.ts`
- Modify: `server/src/evidences/evidences.controller.ts`
- Modify: `server/src/evidences/evidences.routes.ts`
- Modify: `server/tests/evidences/evidences-mapper.test.ts`
- Modify: `server/tests/evidences/evidences-schemas.test.ts`
- Modify: `server/tests/evidences/evidences-service.test.ts`
- Modify: `server/tests/evidences/evidences-http.test.ts`
- Modify: `server/tests/database/evidences-persistence.test.ts`

**Interfaces:**
- Consumes: recurrence state/ACL persisted by Tasks 1–6.
- Produces: `EvidenceResource` and `EvidencePublic.resourceType` support for
  `RECURRENCE`, plus recurrence upload/list routes mounted through the existing
  singleton evidence composition.

- [ ] **Step 1: Write failing recurrence evidence contract tests**

Change the expected unions to:

```ts
export type EvidenceResource =
  | { type: "ORDER"; id: string }
  | { type: "ACTIVITY"; id: string }
  | { type: "RECURRENCE"; id: string };
```

Assert mapping returns `resourceType: "RECURRENCE"`, schemas accept it, and an
impossible multi-resource row still throws.

- [ ] **Step 2: Write failing DB/service ACL and lifecycle tests**

Prove at repository/service and DB-backed HTTP levels that management can
read/upload `INTERNAL`; a participating technician can
read/upload only `TECHNICIAN`; a foreign/unlinked technician gets null/404;
uploads work for `OPEN`, `ANALYSIS`, `CORRECTION`; `CLOSED`/`DISMISSED` reject
upload without calling promotion; reads/downloads remain available after
terminal state; archive retains bytes and metadata behavior.

- [ ] **Step 3: Run focused tests and verify RED**

```bash
cd server
npm test -- tests/evidences/evidences-mapper.test.ts tests/evidences/evidences-schemas.test.ts tests/evidences/evidences-service.test.ts
npm run test:db -- tests/database/evidences-persistence.test.ts tests/evidences/evidences-http.test.ts
```

- [ ] **Step 4: Extend mapper, repositories, service, and controller**

Add recurrence SQL predicates based on `reportedBy`/`tecnicos`. For upload,
lock/revalidate recurrence before promotion and reject terminal states as
`RESOURCE_INACTIVE`. Export controller handlers `uploadRecurrence` and
`listRecurrence`, then mount the two recurrence evidence paths in
`evidences.routes.ts`. This intentionally reuses its one service, parser,
controller, and local-storage adapter.

- [ ] **Step 5: Verify regression breadth and commit**

Run all evidence unit, persistence, and HTTP tests, typecheck, lint, diff-check.
Commit:

```bash
git add server/src/evidences server/tests/evidences server/tests/database/evidences-persistence.test.ts
git commit -m "feat(evidences): authorize recurrence attachments"
```

---

### Task 9: Controllers, routes, application wiring, and DB-backed HTTP contract

**Files:**
- Create: `server/src/recurrences/recurrences.controller.ts`
- Create: `server/src/recurrences/recurrences.routes.ts`
- Modify: `server/src/routes/index.ts`
- Create: `server/tests/recurrences/recurrences-http.test.ts`
- Modify: `server/vitest.config.ts`
- Modify: `server/vitest.database.config.ts`

**Interfaces:**
- Consumes: Task 7 service and the two evidence endpoints already mounted by Task 8.
- Produces: all 13 design endpoints mounted under `/api/v1`.

- [ ] **Step 1: Write failing HTTP tests using real PostgreSQL fixtures**

Use authenticated Supertest agents and prove:

- catalog/list/report/detail;
- exact `201 Location: /api/v1/recurrences/<id>`;
- technician own visibility and foreign/absent identical envelope except request ID;
- management with technician profile retains all scope;
- analysis, correction update, visit, note, dismissal, closure, adjustment;
- recurrence evidence upload/list/download;
- version conflict, invalid transition, branch mismatch, duplicate pair;
- close without evidence/documentation and valid close;
- no-origin write 403 and provisional-password denial;
- response never exposes storage keys or internal actor fields.

- [ ] **Step 2: Run HTTP test and verify RED**

```bash
cd server
npm run test:db -- tests/recurrences/recurrences-http.test.ts
```

Expected: routes return 404 and the database config initially excludes the file.

- [ ] **Step 3: Implement controller handlers**

Build `RecurrenceActorContext` from `request.auth` and `request.requestId`.
Validate params/query/body with Task 2 schemas. Return the standard envelope and
messages; never catch `ApiError` as success.

- [ ] **Step 4: Compose route security in exact order**

Read routes:

```ts
authentication, requirePasswordChanged,
requireAnyPermission("RECURRENCES_VIEW_ALL", "RECURRENCES_VIEW_OWN", "RECURRENCES_REVIEW")
```

Writes:

```ts
requireAllowedOrigin(env.CORS_ORIGINS), authentication,
requirePasswordChanged, requireAnyPermission(...operationPermissions)
```

Mount the 11 recurrence workflow paths. Verify that the two recurrence evidence
paths mounted by Task 8 share the existing singleton evidence
service/parser/controller composition; do not reconstruct or remount them in
the recurrence router.

The complete route contract is:

```text
GET  /api/v1/recurrences/catalog
GET  /api/v1/recurrences
POST /api/v1/recurrences
GET  /api/v1/recurrences/:id
POST /api/v1/recurrences/:id/analysis
POST /api/v1/recurrences/:id/correction
POST /api/v1/recurrences/:id/visits
POST /api/v1/recurrences/:id/notes
POST /api/v1/recurrences/:id/dismiss
POST /api/v1/recurrences/:id/close
POST /api/v1/recurrences/:id/adjust
POST /api/v1/recurrences/:id/evidences
GET  /api/v1/recurrences/:id/evidences
```

Register static `/catalog` before `/:id`. Apply the evidence router's existing
write chain to recurrence uploads and its authenticated read chain to recurrence
lists. The generic evidence download endpoint remains the download path and
must authorize its `RECURRENCE` resource through Task 8's repository predicate.

- [ ] **Step 5: Partition Vitest profiles correctly**

Exclude `recurrences-http.test.ts` from unit config and include it exactly once
in DB config. Add a contract test or explicit file-list assertion so no test is
hidden from both profiles.

- [ ] **Step 6: Verify HTTP/security regressions and commit**

Run:

```bash
cd server
npm run test:db -- tests/recurrences/recurrences-http.test.ts
npm test -- tests/security.test.ts tests/errors.test.ts tests/server.test.ts
npm run typecheck
npm run lint
```

Commit:

```bash
git add server/src/recurrences server/src/routes/index.ts server/tests/recurrences/recurrences-http.test.ts server/vitest.config.ts server/vitest.database.config.ts
git commit -m "feat(recurrences): expose reviewed case API"
```

---

### Task 10: Documentation and operational contract

**Files:**
- Modify: `README.md`
- Modify: `docs/plans/implementation-plan.md`
- Modify: `docs/architecture/current-state.md`

**Interfaces:**
- Consumes: final HTTP/config/migration behavior from Tasks 1–9.
- Produces: accurate local-operation and future-phase documentation.

- [ ] **Step 1: Document the workflow and permissions**

README must include:

- `RECURRENCE_WARNING_DAYS` and its 1–365 range;
- the 13 endpoints and role matrix;
- report/analyze/correct/evidence/close example requests;
- dismissal and adjustment rules;
- terminal-state and KPI timing rules;
- tenth migration and idempotent seed;
- explicit statement that frontend and KPI score calculation remain pending.

- [ ] **Step 2: Update plan/current-state only with verified facts**

Mark phase 10 complete only after HTTP and integration gates are green. Record
actual test counts, migration count, module boundaries, known `pg` warning, and
remaining phases 11–14. Do not claim automatic detection, frontend integration,
exports, or deployment.

- [ ] **Step 3: Check documentation and commit**

Run:

```bash
rg -n "RECURRENCE_WARNING_DAYS|RI-AAAA-NNNN|DISMISSED|RECURRENCES_REPORT_OWN" README.md docs
git diff --check
```

Commit:

```bash
git add README.md docs/plans/implementation-plan.md docs/architecture/current-state.md
git commit -m "docs(recurrences): document reviewed case operations"
```

---

### Task 11: Full verification, adversarial smoke, and delivery audit

**Files:**
- Modify only if a fresh gate exposes a defect inside the approved recurrence scope.
- Inspect: every file in this plan and `docs/superpowers/specs/2026-08-20-recurrences-api-design.md`.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: fresh evidence that phase 10 is complete with a clean branch.

- [ ] **Step 1: Verify Prisma and both schemas**

Run format, validate, generate, deploy, status, and `db:verify` against `public`
and `test`. Expected: ten migrations, exact recurrence checks/indexes/permissions,
and no pending migration.

- [ ] **Step 2: Prove seed idempotence twice per schema**

Compare roles, permissions, role mappings, causes, recurrences, participants,
visits, notes, orders, activities, and evidences after each run. The second run
must not create duplicates.

- [ ] **Step 3: Run every backend and frontend gate fresh**

```bash
cd server
npm test -- --run
npm run test:db
npm run typecheck
npm run lint
npm run build
cd ..
npm test -- --run
npm run lint
npm run build
```

- [ ] **Step 4: Run an adversarial compiled smoke**

Using the test schema and a disposable preprovisioned evidence root, execute:

```text
technician report 201
supervisor analysis 200
supervisor correction 200
technician note 200
technician evidence 201/download 200
supervisor close 200
closed adjustment 200
separate dismissal 200
foreign technician 404
duplicate pair 409
stale version 409
close without evidence 422
```

Assert response bodies contain neither absolute storage root nor `storageKey`.

- [ ] **Step 5: Audit the spec section by section**

Map all 24 spec sections to code/tests/docs in a temporary checklist. Resolve
every Critical/Important gap, capture conclusions in the task report, and remove
the temporary checklist. Adjudicate every deferred Minor explicitly.

- [ ] **Step 6: Verify final range and state**

```bash
git diff --check "$(git merge-base HEAD main)..HEAD"
git status --short
git log --oneline --decorate -20
```

Expected: clean diff and no uncommitted implementation files. Do not create an
empty commit when no fix is required.

---

## Execution Notes

- Each task receives a fresh implementation review before the next begins.
- Critical/Important review findings are fixed by the original implementer with
  focused RED → GREEN evidence, then re-reviewed.
- Minor findings are recorded and deferred unless they reveal a load-bearing
  defect or are safely corrected inside the same focused round.
- Keep `.env`, secrets, database passwords, ignored generated Prisma clients,
  and local evidence bytes out of commits and reports.
