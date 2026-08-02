# Task 4 Report: Atomic order creation and administrative editing

## Status

Completed. The implementation provides atomic order creation, annual numbering in the `America/Tegucigalpa` civil year, active-parent validation, atomic history/audit trails, and locked/versioned administrative editing. Assignment, operational commands, and HTTP were not implemented.

## Files

- Modified `server/src/orders/orders.repository.types.ts`
  - Added `OrdersAdministrativeMutationRepository` so this task can expose only `createOrder` and `updateOrder` without implementing assignment methods.
  - Kept `OrdersMutationRepository` compatible by extending the administrative contract.
- Created `server/src/orders/orders.mutation.repository.ts`
  - Serializable transactions with targeted retry.
  - Annual numbering under `pg_advisory_xact_lock(1196575044, year)`.
  - Parent validation, creation, locked editing, version checks, history, audit, and sequential detail hydration.
- Created `server/tests/database/orders-mutation-persistence.test.ts`
  - 57 database integration cases using only the protected `test` schema.

## Implemented behavior

### Atomic creation and annual numbering

- Resolves the year with `Intl.DateTimeFormat` and `timeZone: "America/Tegucigalpa"`.
- Acquires the required transaction-scoped advisory lock for the resolved year.
- Reads only numbers matching `^GS-<year>-[0-9]+$`, derives the largest numeric suffix, and formats the next suffix with at least four digits.
- Runs the complete operation in a serializable transaction.
- Retries the complete transaction up to three times for:
  - Prisma `P2034` serialization/write conflicts.
  - Prisma `P2002` only when its metadata identifies model `OrdenTrabajo` and constraint `orden_trabajo_order_number_key`.
- The targeted `P2002` handling prevents unrelated uniqueness failures from being masked.
- Validates active, non-deleted branch and client plus active, non-deleted service type before insertion.
- Creates orders with `PENDING`, version `1`, and no participants/materials.
- Writes `ORDER_CREATED` to both `HistorialOrden` and `Auditoria` in the same transaction with actor request metadata.

### Locked administrative editing

- Locks the non-deleted order with `SELECT ... FOR UPDATE`.
- Compares the supplied version before transition or resource validation.
- Allows all seven administrative fields in `PENDING`.
- Allows only priority, problem, description, schedule, and estimate in `ASSIGNED`.
- Rejects every administrative field in `ON_ROUTE`, `IN_PROGRESS`, `PAUSED`, `COMPLETED`, and `CANCELLED`.
- Revalidates only changed branch/service references.
- Applies one `updateMany` guarded by `{ id, version }` and increments the version exactly once.
- Writes `ORDER_UPDATED` history and redacted before/after audit snapshots atomically.
- Sequentially materializes the full `OrderDetailRecord` inside the transaction, including participants and materials, without exposing hydration keys.

## TDD evidence

### Creation RED

Command:

```powershell
Set-Location server
npm run test:db -- tests/database/orders-mutation-persistence.test.ts
```

Observed before production implementation:

```text
Test Files  1 failed (1)
Tests       no tests
Error: Cannot find module '../../src/orders/orders.mutation.repository.js'
```

The failure was exactly the missing repository factory required by the brief.

### Creation GREEN

After the minimal creation implementation:

```text
Test Files  1 passed (1)
Tests       9 passed (9)
```

This initial run exposed a deprecation warning from Prisma's parallel nested relation hydration inside an interactive transaction. It was later eliminated at the source by sequential materialization; it is absent from all final evidence.

### Administrative editing RED

Command:

```powershell
npm run test:db -- tests/database/orders-mutation-persistence.test.ts
```

Observed before `updateOrder` implementation:

```text
Test Files  1 failed (1)
Tests       15 failed | 10 passed (25)
Error: Order update is not implemented
```

### Debugging evidence: physical enum representation

The first edit implementation returned `INVALID_ORDER_TRANSITION` for valid `PENDING`/`ASSIGNED` patches. A direct raw read demonstrated the root cause:

```json
{
  "status": "completed"
}
```

Raw PostgreSQL returns the mapped lowercase enum, while Prisma contracts use uppercase enum members. The locked projection now uses `UPPER("status"::text) AS "status"`. After that single root-cause correction:

```text
Test Files  1 passed (1)
Tests       25 passed (25)
```

### Deterministic concurrency RED/GREEN

The concurrent test now uses a third database connection to hold the exact annual advisory lock, starts two creation transactions, polls `pg_locks` until both are confirmed waiters, and only then releases the lock. This forces both transactions to establish the conflicting interleaving instead of relying on scheduler timing.

Mutation check with `serializableAttempts = 1`:

```text
Test Files  1 failed (1)
Tests       1 failed | 56 skipped (57)
AssertionError: expected false to be true
```

After restoring three attempts:

```text
Test Files  1 passed (1)
Tests       57 passed (57)
```

The retry restarts the whole transaction, so parent validation, number calculation, insertion, history, audit, and detail materialization all use a fresh serializable snapshot.

### Tegucigalpa boundary mutation check

The test uses `2026-01-01T03:00:00.000Z`, which is still calendar year 2025 in Tegucigalpa. Temporarily changing the implementation to UTC produced the expected RED:

```text
Expected: "GS-2025-0001"
Received: "GS-2026-0004"
Test Files  1 failed (1)
```

After restoring `America/Tegucigalpa`, the final task suite passed.

## Final verification evidence

All commands were run from `server` against the final working tree.

### Task database tests

```powershell
npm run test:db -- tests/database/orders-mutation-persistence.test.ts
```

```text
Test Files  1 passed (1)
Tests       57 passed (57)
Duration    2.09s
Exit code   0
```

### Complete unit suite

```powershell
npm test
```

```text
Test Files  16 passed (16)
Tests       118 passed (118)
Duration    3.82s
Exit code   0
```

### Complete database suite

```powershell
npm run test:db
```

```text
Test Files  13 passed (13)
Tests       125 passed (125)
Duration    23.89s
Exit code   0
```

### TypeScript and lint

```powershell
npm run typecheck
npm run lint
```

```text
typecheck: exit code 0
lint: exit code 0, zero warnings
```

All final outputs were pristine: no test warnings, adapter deprecations, type errors, or lint warnings.

## Coverage checklist

- [x] Active branch/client/service creation succeeds.
- [x] Inactive and deleted branch/client/service creation fails with `RESOURCE_INACTIVE`.
- [x] Initial status/version and empty participants/materials are correct.
- [x] Creation history/audit contain actor request metadata.
- [x] History failure rolls back the inserted order.
- [x] Tegucigalpa civil year is protected at a UTC year boundary.
- [x] Malformed annual-number candidates are ignored.
- [x] Concurrent creations are deterministically forced through the conflicting lock interleaving and return distinct sequential numbers.
- [x] `PENDING` accepts all seven administrative fields.
- [x] `ASSIGNED` accepts exactly its five permitted fields and rejects branch/service replacements.
- [x] Every one of the seven fields is rejected for each of the five non-editable states (35 cases).
- [x] Exact version conflicts do not mutate or write trails.
- [x] Changed inactive/deleted replacement parents are rejected.
- [x] Zod rejects empty patches.
- [x] A successful update increments once and writes one history plus one redacted audit.
- [x] Sequential detail hydration preserves existing participants/materials and hides internal foreign-key hydration fields.

## Self-review

- Re-read the brief line by line and mapped every requirement to implementation and tests.
- Confirmed no assignment, operational command, service/controller, route, or HTTP implementation was added.
- Confirmed the transaction retry is restricted to serialization failures and the exact order-number uniqueness constraint.
- Confirmed no external side effects occur inside the retryable transaction; every side effect is a database write rolled back with the attempt.
- Confirmed version comparison precedes state/resource checks and version increments only in the guarded `updateMany`.
- Confirmed audit snapshots contain only administrative order fields and omit relations, operational result fields, soft-delete fields, and hydration keys.
- Confirmed test data cleanup preserves the seeded orders and removes all task-created rows in dependency order.
- Scanned for `TODO`, `TBD`, placeholder throws, console statements, lint suppressions, and TypeScript suppressions; none remain.

## Concerns

- Non-blocking maintenance concern: sequential hydration mirrors the shape of `orderDetailSelect` manually to avoid the Prisma adapter's parallel-query deprecation inside interactive transactions. The tests protect participant/material hydration and hidden-key behavior, but a future change to the shared detail select must be reflected here as well. Extracting a shared sequential hydrator would cross this task's approved file boundary and is deferred.
- The retry budget is deliberately bounded at three attempts. Under unusually sustained contention, the final database conflict is surfaced rather than retried indefinitely.

No blocking concern remains for Task 4.
