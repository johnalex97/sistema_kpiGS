# Task 1 report — recurrence workflow contract

## Status

DONE_WITH_CONCERNS.

## Implementation

- Added the reviewed recurrence contract: `DISMISSED`, a unique `RI-YYYY-NNNN`
  number, nullable legacy actor fields, review/close/dismiss metadata, nullable
  cause, sequence allocation table, and recurrence notes with restrictive FKs.
- Added only migration `20260820120000_recurrences_workflow_api`. It backfills
  numbers deterministically by `detected_at, id`, initializes annual sequence
  maxima, adds indexes/FKs, and enforces row-level checks. The close check is
  `NOT VALID`: it leaves unknown legacy records untouched while enforcing full
  close data on every new or changed row. No cross-row quality trigger was added.
- Added `RECURRENCE_WARNING_DAYS` with the 1–365 range and default 30, including
  both example environment files.
- Seeded the three new recurrence permissions and grants; the two demo cases now
  upsert stable recurrence numbers and reporting/review actors.
- Extended `verify-database.sql` to fail for an absent tenth migration, tables,
  fields, enum value, checks, indexes, permissions, or exact grants.
- Updated the evidence fixture with `RI-2026-9001`, required by the new Prisma
  create input.

## Files

- `server/prisma/schema.prisma`
- `server/prisma/migrations/20260820120000_recurrences_workflow_api/migration.sql`
- `server/prisma/seed/catalogs.ts`, `server/prisma/seed/quality.ts`
- `server/src/config/env.ts`, `.env.example`, `server/.env.example`
- `server/database/verify-database.sql`
- `server/tests/env.test.ts`
- `server/tests/database/{schema-contract,constraints,seed,evidences-test-data}.ts`

## TDD evidence

RED was observed before the corresponding production changes:

- `npm test -- tests/env.test.ts`: default/property missing and invalid warning
  days accepted (6 failures).
- `npm run test:db -- tests/database/schema-contract.test.ts tests/database/constraints.test.ts tests/database/seed.test.ts`:
  missing models/enum/checks/permissions and an invalid non-original quality
  attribution was accepted (4 failures after the check-catalog assertion).
- Removing recurrence seed workflow fields made `tests/database/seed.test.ts`
  fail with `Argument recurrenceNumber is missing`.
- The added close-actor case was accepted first; after correcting the check it
  passes with the complete focused constraints suite.

GREEN final evidence:

- `npm run db:format`, `npm run db:validate`, `npm run db:generate`: pass.
- `npm run db:migrate:deploy`: no pending migrations on `public`; repeated deploy
  on `test` also reports no pending migrations.
- `npm run db:verify`: pass on `public`; explicit `search_path=test` verifier:
  pass on `test`.
- `npm test -- tests/env.test.ts`: 21/21 pass.
- `npm run test:db -- tests/database/schema-contract.test.ts tests/database/constraints.test.ts tests/database/seed.test.ts`: 46/46 pass.
- `npm run test:db -- tests/database/evidences-persistence.test.ts tests/evidences/evidences-http.test.ts`: 22/22 pass.
- `npm run typecheck` and `npm run lint`: pass.

## Auto-review

- Confirmed exactly nine pre-existing migration directories remain unchanged and
  the tenth has the required timestamp/name.
- Confirmed the only quality check is row-local; cross-row rules remain for later
  transactional tasks.
- Confirmed the new close condition rejects both `OPEN` plus close fields and
  `CLOSED` without an actor, while `NOT VALID` preserves legacy rows.
- Confirmed public and test verifiers execute in their intended schemas; raw pg
  needs an explicit `search_path=test` because it does not interpret Prisma's
  `?schema=test` URL parameter.

## Concerns

- The local public migration ledger contains two rolled-back attempts from
  discovering PostgreSQL's same-transaction enum visibility restriction (55P04),
  plus the successful tenth migration. A clean deployment applies only the
  successful migration source.
- The local seed placeholder password was invalid. Verification used a strong,
  non-sensitive process-only seed credential as authorized; it creates the
  associated local seed administrator. No `.env` file was read, printed, copied,
  or changed.
- Existing PG client test helpers emit a deprecation warning about overlapping
  `client.query()` calls; all requested commands still exit successfully.
