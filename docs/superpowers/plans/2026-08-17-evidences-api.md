# Evidences API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a protected evidences API that stores validated JPEG, PNG, WebP, and PDF files in a private Docker-ready volume while PostgreSQL preserves metadata, authorization, concurrency, and audit history.

**Architecture:** Add a focused `server/src/evidences/` module following the existing route → controller → service → repository pattern, with an injected `EvidenceStorage` port implemented by the local filesystem. Uploads stream through a same-volume temporary file, are validated and promoted atomically, and are compensated if the metadata transaction fails.

**Tech Stack:** Node.js 26 types, TypeScript 6, Express 5, Busboy 1.6.0, Zod 4, Prisma 7.9.1, PostgreSQL 18, Vitest 4, Supertest, native `node:fs`, streams, and crypto.

**Spec:** `docs/superpowers/specs/2026-08-17-evidences-api-design.md`

## Global Constraints

- Accept only JPEG, PNG, WebP, and PDF after final-extension, declared-MIME, and magic-byte agreement.
- Reject files larger than exactly `10_485_760` bytes; `EVIDENCE_MAX_BYTES` may lower but never raise that ceiling.
- Store files outside public/static paths and never return `storedName`, `storageKey`, temporary names, or absolute paths.
- Use one uploaded file per request and force every download to `attachment`, `private, no-store`, and `nosniff`.
- Technicians may use only `TECHNICIAN` evidence on current or historical work in their scope; only management may use `INTERNAL`, update, or archive.
- Reject `CLIENT` through every write contract in this phase.
- Do not permit uploads to deleted or `CANCELLED` orders/activities; completed work remains eligible.
- Archive logically with a reason of 10–500 characters and retain the physical file.
- Keep reincidence metadata compatible but expose no reincidence evidence endpoint in this phase.
- Use TDD for every task, preserve the standard API envelope, and commit only after the task's focused gates pass.
- Do not modify an applied migration; create `20260817120000_evidences_api_constraints`.
- Do not commit `.env`, real evidence files, temporary uploads, generated Prisma clients, logs, or credentials.

---

## File Map

### New production files

- `server/src/evidences/evidences.types.ts`: public and internal contracts shared by the module.
- `server/src/evidences/evidences.schemas.ts`: Zod route/query/JSON/multipart-field validation.
- `server/src/evidences/evidences.file-validation.ts`: canonical extension, MIME, magic bytes, and SHA-256 helpers.
- `server/src/evidences/evidences.storage.ts`: provider-independent storage contract and typed storage failures.
- `server/src/evidences/evidences.local-storage.ts`: traversal-safe local-volume adapter.
- `server/src/evidences/evidences.multipart.ts`: one-file Busboy parser that streams to `EvidenceStorage`.
- `server/src/evidences/evidences.repository.types.ts`: Prisma selects and repository result unions.
- `server/src/evidences/evidences.read.repository.ts`: scoped list/download metadata and reconciliation reads.
- `server/src/evidences/evidences.mutation.repository.ts`: locked create/update/archive and audit writes.
- `server/src/evidences/evidences.mapper.ts`: safe public metadata mapper.
- `server/src/evidences/evidences.service.ts`: permission policy and file/transaction compensation coordinator.
- `server/src/evidences/evidences.controller.ts`: HTTP envelopes and private streaming response.
- `server/src/evidences/evidences.routes.ts`: nested resource routes and middleware composition.
- `server/scripts/verify-evidences.ts`: read-only bidirectional metadata/file reconciliation command.
- `server/prisma/migrations/20260817120000_evidences_api_constraints/migration.sql`: additive schema, checks, indexes, and permissions.

### New tests

- `server/tests/evidences/evidences-file-validation.test.ts`
- `server/tests/evidences/evidences-local-storage.test.ts`
- `server/tests/evidences/evidences-multipart.test.ts`
- `server/tests/evidences/evidences-schemas.test.ts`
- `server/tests/evidences/evidences-mapper.test.ts`
- `server/tests/evidences/evidences-service.test.ts`
- `server/tests/evidences/evidences-http.test.ts`
- `server/tests/database/evidences-persistence.test.ts`
- `server/tests/database/evidences-test-data.ts`
- `server/tests/evidences/evidences-reconciliation.test.ts`

### Existing files to modify

- `server/package.json`, `server/package-lock.json`
- `server/.env.example`, `.env.example`, `.gitignore`
- `server/src/config/env.ts`, `server/src/app.ts`, `server/src/server.ts`, `server/src/routes/index.ts`
- `server/prisma/schema.prisma`, `server/prisma/seed/catalogs.ts`
- `server/database/verify-database.sql`
- `server/vitest.config.ts`, `server/vitest.database.config.ts`
- `server/tests/env.test.ts`
- `README.md`, `docs/plans/implementation-plan.md`, `docs/architecture/current-state.md`

---

### Task 1: Database contract, migration, permissions, and seed

**Files:**
- Modify: `server/prisma/schema.prisma`
- Create: `server/prisma/migrations/20260817120000_evidences_api_constraints/migration.sql`
- Modify: `server/prisma/seed/catalogs.ts`
- Modify: `server/database/verify-database.sql`
- Modify: `server/tests/database/schema-contract.test.ts`
- Modify: `server/tests/database/constraints.test.ts`
- Modify: `server/tests/database/seed.test.ts`
- Test: `server/tests/database/evidences-persistence.test.ts`

**Interfaces:**
- Consumes: existing `Evidencia`, `Usuario`, `OrdenTrabajo`, `Actividad`, `Reincidencia`, `Permiso`, `RolPermiso`, and `Auditoria` models.
- Produces: Prisma fields `checksumSha256`, `version`, `deletedById`, `deletionReason`, named uploader/archiver relations, evidence checks/indexes, and permissions `EVIDENCES_VIEW`, `EVIDENCES_UPLOAD`, `EVIDENCES_MANAGE`.

- [ ] **Step 1: Prove the migration precondition without changing data**

Run against the development schema and then repeat with
`DATABASE_URL="$DATABASE_TEST_URL"`; record both counts in the task report:

```bash
cd server
npx tsx -e 'import "dotenv/config"; import { createDatabaseClient } from "./src/config/database.ts"; const db=createDatabaseClient(process.env.DATABASE_URL); console.log({ schema: new URL(process.env.DATABASE_URL).searchParams.get("schema"), evidenceRows: await db.evidencia.count() }); await db.$disconnect();'
```

Expected: `evidence_rows = 0` in `public` and `test`. Stop and design a real metadata backfill if either schema contains rows; never invent hashes for existing files.

- [ ] **Step 2: Write failing schema, constraint, and seed tests**

Add assertions equivalent to:

```ts
expect(evidenceColumns).toEqual(expect.arrayContaining([
  "checksum_sha256", "version", "deleted_by_id", "deletion_reason",
]));
await expect(database.evidencia.create({ data: invalidNoTarget })).rejects.toThrow();
await expect(database.evidencia.create({ data: invalidTwoTargets })).rejects.toThrow();
expect(rolePermissions.ADMIN).toEqual(expect.arrayContaining([
  "EVIDENCES_VIEW", "EVIDENCES_UPLOAD", "EVIDENCES_MANAGE",
]));
expect(rolePermissions.TECHNICIAN).toEqual(expect.arrayContaining([
  "EVIDENCES_VIEW", "EVIDENCES_UPLOAD",
]));
expect(rolePermissions.TECHNICIAN).not.toContain("EVIDENCES_MANAGE");
```

- [ ] **Step 3: Run the focused tests and verify RED**

Run:

```bash
cd server
npm run test:db -- tests/database/schema-contract.test.ts tests/database/constraints.test.ts tests/database/seed.test.ts
```

Expected: failures naming the absent columns, constraints, indexes, or permission codes.

- [ ] **Step 4: Extend Prisma with explicit dual user relations**

Use these field names so later repository types remain stable:

```prisma
model Usuario {
  evidenciasSubidas    Evidencia[] @relation("EvidenciaSubidaPor")
  evidenciasArchivadas Evidencia[] @relation("EvidenciaArchivadaPor")
}

model Evidencia {
  checksumSha256 String  @map("checksum_sha256") @db.VarChar(64)
  version        Int     @default(1)
  deletedById    String? @map("deleted_by_id") @db.Uuid
  deletionReason String? @map("deletion_reason") @db.VarChar(500)

  uploadedBy Usuario  @relation("EvidenciaSubidaPor", fields: [uploadedById], references: [id], onDelete: Restrict)
  deletedBy  Usuario? @relation("EvidenciaArchivadaPor", fields: [deletedById], references: [id], onDelete: Restrict)
}
```

- [ ] **Step 5: Write the additive SQL migration**

The migration must begin with this `DO` block, which raises when `evidencia` is not
empty, because there is no truthful hash backfill without physical files. It
then adds the four columns, named foreign key, checks, partial indexes,
permissions, and role assignments. Use these exact integrity rules:

```sql
DO $migration$
BEGIN
  IF EXISTS (SELECT 1 FROM "evidencia") THEN
    RAISE EXCEPTION 'Evidencia contiene filas sin hash verificable; se requiere migración asistida';
  END IF;
END
$migration$;

ALTER TABLE "evidencia"
  ADD COLUMN "checksum_sha256" VARCHAR(64) NOT NULL,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "deleted_by_id" UUID,
  ADD COLUMN "deletion_reason" VARCHAR(500);

ALTER TABLE "evidencia"
  ADD CONSTRAINT "ck_evidencia_destino_exclusivo"
    CHECK (num_nonnulls("orden_id", "actividad_id", "reincidencia_id") = 1),
  ADD CONSTRAINT "ck_evidencia_tamano"
    CHECK ("size_bytes" > 0 AND "size_bytes" <= 10485760),
  ADD CONSTRAINT "ck_evidencia_checksum_sha256"
    CHECK ("checksum_sha256" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "ck_evidencia_version"
    CHECK ("version" > 0),
  ADD CONSTRAINT "ck_evidencia_archivado_completo"
    CHECK (num_nonnulls("deleted_at", "deleted_by_id", "deletion_reason") IN (0, 3));
```

Create `idx_evidence_order_active`, `idx_evidence_activity_active`, and `idx_evidence_archived`, using `WHERE deleted_at IS NULL` for active-resource indexes. Insert permissions idempotently and assign all three to `ADMIN`/`SUPERVISOR`, only view/upload to `TECHNICIAN`.

- [ ] **Step 6: Extend the idempotent seed and database verifier**

Add catalog rows:

```ts
{ code: "EVIDENCES_VIEW", resource: "evidences", action: "view" },
{ code: "EVIDENCES_UPLOAD", resource: "evidences", action: "upload" },
{ code: "EVIDENCES_MANAGE", resource: "evidences", action: "manage" },
```

Add verifier checks for all fields, five named checks, three indexes, permission presence, and exact role assignments.

- [ ] **Step 7: Format, generate, deploy, seed twice, and verify GREEN**

Run:

```bash
cd server
npm run db:format
npm run db:validate
npm run db:generate
npm run db:migrate:deploy
npm run db:seed
npm run db:seed
npm run db:verify
npm run test:db -- tests/database/schema-contract.test.ts tests/database/constraints.test.ts tests/database/seed.test.ts tests/database/evidences-persistence.test.ts
```

Repeat deploy/seed/verify against the test-schema URL. Expected: migration current in both schemas, identical seed counts on both runs, and all focused tests pass.

- [ ] **Step 8: Commit the database contract**

```bash
git add server/prisma server/database/verify-database.sql server/tests/database
git commit -m "feat(evidences): add metadata integrity contract"
```

---

### Task 2: Environment contract and multipart dependency

**Files:**
- Modify: `server/package.json`
- Modify: `server/package-lock.json`
- Modify: `server/src/config/env.ts`
- Modify: `server/tests/env.test.ts`
- Modify: `server/.env.example`
- Modify: `.env.example`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `parseEnvironment(EnvironmentInput)` and the existing `Environment` interface.
- Produces: `EVIDENCE_STORAGE_PATH: string`, `EVIDENCE_MAX_BYTES: number`, `EVIDENCE_TEMP_MAX_AGE_MINUTES: number`, plus Busboy runtime/types.

- [ ] **Step 1: Write failing environment tests**

Cover defaults, the hard ceiling, positive temp age, and production absolute/private path:

```ts
expect(parseEnvironment(base)).toMatchObject({
  EVIDENCE_STORAGE_PATH: expect.any(String),
  EVIDENCE_MAX_BYTES: 10_485_760,
  EVIDENCE_TEMP_MAX_AGE_MINUTES: 60,
});
expect(() => parseEnvironment({ ...base, EVIDENCE_MAX_BYTES: "10485761" })).toThrow("EVIDENCE_MAX_BYTES");
expect(() => parseEnvironment({ ...base, EVIDENCE_TEMP_MAX_AGE_MINUTES: "0" })).toThrow("EVIDENCE_TEMP_MAX_AGE_MINUTES");
expect(() => parseEnvironment({ ...base, NODE_ENV: "production", EVIDENCE_STORAGE_PATH: "relative" })).toThrow("EVIDENCE_STORAGE_PATH");
```

- [ ] **Step 2: Run the environment test and verify RED**

Run: `cd server && npm test -- tests/env.test.ts`

Expected: missing evidence properties or missing validation messages.

- [ ] **Step 3: Install the single streaming parser dependency**

Run:

```bash
cd server
npm install busboy@1.6.0
npm install --save-dev @types/busboy@1.5.4
```

- [ ] **Step 4: Implement exact environment validation**

Add Zod fields:

```ts
EVIDENCE_STORAGE_PATH: z.string().min(1).default("./storage/evidences"),
EVIDENCE_MAX_BYTES: z.coerce.number().int().positive().max(10_485_760).default(10_485_760),
EVIDENCE_TEMP_MAX_AGE_MINUTES: z.coerce.number().int().positive().max(10_080).default(60),
```

Normalize the path with `path.resolve`. In production require the raw value to be absolute and reject any path inside `server/public`, `dist`, or the frontend `dist` directory.

- [ ] **Step 5: Document and ignore storage**

Add all three keys to environment examples. Add `server/storage/` to `.gitignore`; do not add a keep file because the runtime creates directories.

- [ ] **Step 6: Verify and commit**

Run:

```bash
cd server
npm test -- tests/env.test.ts
npm run typecheck
npm run lint
```

Expected: all pass with the new environment fields in every equality assertion.

```bash
git add server/package.json server/package-lock.json server/src/config/env.ts server/tests/env.test.ts server/.env.example .env.example .gitignore
git commit -m "feat(evidences): configure private upload storage"
```

---

### Task 3: Pure file identification and validation

**Files:**
- Create: `server/src/evidences/evidences.file-validation.ts`
- Create: `server/tests/evidences/evidences-file-validation.test.ts`

**Interfaces:**
- Consumes: original filename, declared MIME, head bytes, whole-file size, and streaming SHA-256 result.
- Produces: `detectEvidenceFormat(input): EvidenceFormat` and `normalizeDownloadName(name, extension): string`.

- [ ] **Step 1: Write table-driven failing tests with real signatures**

Define fixtures without executable documents:

```ts
const cases = [
  ["photo.jpg", "image/jpeg", Buffer.from([0xff, 0xd8, 0xff, 0xdb]), "jpg"],
  ["screen.png", "image/png", Buffer.from("89504e470d0a1a0a", "hex"), "png"],
  ["proof.webp", "image/webp", Buffer.from("524946460400000057454250", "hex"), "webp"],
  ["report.pdf", "application/pdf", Buffer.from("%PDF-1.7\n"), "pdf"],
] as const;
```

Assert canonical MIME/extension, `.jpeg → jpg`, case-insensitive final suffix, allowed preceding dots, rejection of empty content, wrong MIME, wrong final suffix, mismatched magic bytes, control characters, path separators, and names that normalize empty.

- [ ] **Step 2: Run focused test and verify RED**

Run: `cd server && npm test -- tests/evidences/evidences-file-validation.test.ts`

Expected: module-not-found failure.

- [ ] **Step 3: Implement strict pure helpers**

Export:

```ts
export interface EvidenceFormat { mimeType: "image/jpeg" | "image/png" | "image/webp" | "application/pdf"; extension: "jpg" | "png" | "webp" | "pdf"; }
export class InvalidEvidenceFileError extends Error { readonly code = "INVALID_EVIDENCE_FILE"; }
export function detectEvidenceFormat(input: { originalName: string; declaredMimeType: string; head: Buffer; sizeBytes: number }): EvidenceFormat;
export function normalizeDownloadName(originalName: string, extension: EvidenceFormat["extension"]): string;
```

Use a fixed signature table, compare final suffix only, strip path/control characters from the download name, cap it at 255 UTF-8-safe characters, and append the canonical extension exactly once.

- [ ] **Step 4: Verify mutation-resistant cases**

Run the focused test, then temporarily invert one signature comparison and prove at least one case fails. Restore and rerun:

```bash
cd server
npm test -- tests/evidences/evidences-file-validation.test.ts
```

Expected after restoration: all cases pass.

- [ ] **Step 5: Commit**

```bash
git add server/src/evidences/evidences.file-validation.ts server/tests/evidences/evidences-file-validation.test.ts
git commit -m "feat(evidences): validate supported file content"
```

---

### Task 4: Traversal-safe local storage adapter

**Files:**
- Create: `server/src/evidences/evidences.storage.ts`
- Create: `server/src/evidences/evidences.local-storage.ts`
- Create: `server/tests/evidences/evidences-local-storage.test.ts`

**Interfaces:**
- Consumes: Node `Readable`, configured root, byte limit, and relative storage keys.
- Produces:

```ts
import type { Readable } from "node:stream";

export interface TemporaryEvidence {
  tempKey: string;
  sizeBytes: number;
  checksumSha256: string;
}
export interface EvidenceStorage {
  initialize(now: Date, tempMaxAgeMinutes: number): Promise<{ removedTemporaries: number }>;
  writeTemporary(source: Readable, maxBytes: number): Promise<TemporaryEvidence>;
  readHead(key: string, maxBytes: number): Promise<Buffer>;
  promote(tempKey: string, finalKey: string): Promise<void>;
  open(finalKey: string): Promise<Readable>;
  remove(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  listFinalKeys(): AsyncIterable<string>;
}
export class EvidenceSizeLimitError extends Error {}
export class EvidenceStorageUnavailableError extends Error {}
```

- [ ] **Step 1: Write failing adapter tests in a disposable directory**

Use `mkdtemp`, never the repository storage path. Cover directory creation, same-volume temp write, exact SHA-256 and byte count, `max` acceptance, `max + 1` rejection with no temp left, atomic promotion, byte-identical open, idempotent compensation remove, expired-temp cleanup, final-key enumeration, and rejection of absolute/`..`/backslash escape keys.

```ts
await expect(storage.writeTemporary(Readable.from(Buffer.alloc(11)), 10)).rejects.toBeInstanceOf(EvidenceSizeLimitError);
await expect(storage.open("../secret.txt")).rejects.toBeInstanceOf(EvidenceStorageUnavailableError);
```

- [ ] **Step 2: Run focused test and verify RED**

Run: `cd server && npm test -- tests/evidences/evidences-local-storage.test.ts`

Expected: missing storage modules.

- [ ] **Step 3: Implement the port and local adapter**

Resolve every key with a single private helper:

```ts
function resolveKey(root: string, key: string): string {
  if (path.isAbsolute(key) || key.includes("\\")) throw new EvidenceStorageUnavailableError();
  const resolved = path.resolve(root, ...key.split("/"));
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) throw new EvidenceStorageUnavailableError();
  return resolved;
}
```

Implement `writeTemporary` with `pipeline`, a counting/hash transform, exclusive file creation, and cleanup in `catch`. Generate only `tmp/<uuid>.upload`. Implement `promote` only from `tmp/` to `files/` and create the month directory before `rename`.

- [ ] **Step 4: Verify focused storage behavior**

Run:

```bash
cd server
npm test -- tests/evidences/evidences-local-storage.test.ts
npm run typecheck
npm run lint
```

Expected: no disposable directory or file remains after the suite.

- [ ] **Step 5: Commit**

```bash
git add server/src/evidences/evidences.storage.ts server/src/evidences/evidences.local-storage.ts server/tests/evidences/evidences-local-storage.test.ts
git commit -m "feat(evidences): add private local storage adapter"
```

---

### Task 5: Evidence schemas, records, and public mapper

**Files:**
- Create: `server/src/evidences/evidences.types.ts`
- Create: `server/src/evidences/evidences.schemas.ts`
- Create: `server/src/evidences/evidences.repository.types.ts`
- Create: `server/src/evidences/evidences.mapper.ts`
- Create: `server/tests/evidences/evidences-schemas.test.ts`
- Create: `server/tests/evidences/evidences-mapper.test.ts`

**Interfaces:**
- Consumes: generated Prisma `NivelAccesoEvidencia`, actor principal, and canonical file metadata from Tasks 1–4.
- Produces: stable DTOs, Zod contracts, `evidenceRecordSelect`, repository interfaces, and `mapEvidence(record)`.

- [ ] **Step 1: Write failing contract tests**

Cover UUID route params; pagination defaults `1/20`, max 100; trimmed optional description; update requiring at least one mutable field plus positive version; archive reason 10–500 plus version; multipart metadata rejecting unknown fields and `CLIENT`; and mapper omission of private fields.

```ts
expect(Object.keys(mapEvidence(record))).not.toEqual(expect.arrayContaining([
  "storedName", "storageKey", "deletedById", "deletionReason", "deletedAt",
]));
expect(archiveEvidenceSchema.safeParse({ reason: "corto", version: 1 }).success).toBe(false);
```

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
cd server
npm test -- tests/evidences/evidences-schemas.test.ts tests/evidences/evidences-mapper.test.ts
```

Expected: missing module failures.

- [ ] **Step 3: Define exact shared types**

Use these contracts in `evidences.types.ts`:

```ts
export type EvidenceResource =
  | { type: "ORDER"; id: string }
  | { type: "ACTIVITY"; id: string };

export interface EvidenceActorContext {
  userId: string;
  technicianId: string | null;
  permissions: readonly string[];
  requestId: string;
}

export interface EvidencePublic {
  id: string;
  originalName: string;
  mimeType: string;
  fileExtension: string;
  sizeBytes: number;
  description: string | null;
  accessLevel: "INTERNAL" | "TECHNICIAN";
  uploadedBy: { id: string; displayName: string };
  resourceType: "ORDER" | "ACTIVITY";
  resourceId: string;
  checksumSha256: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateEvidencePersistenceInput {
  resource: EvidenceResource;
  originalName: string;
  storedName: string;
  mimeType: EvidencePublic["mimeType"];
  fileExtension: EvidencePublic["fileExtension"];
  sizeBytes: number;
  storageKey: string;
  checksumSha256: string;
  description: string | null;
  accessLevel: "INTERNAL" | "TECHNICIAN";
}

export interface UpdateEvidenceInput {
  description?: string | null;
  accessLevel?: "INTERNAL" | "TECHNICIAN";
  version: number;
}

export interface ArchiveEvidenceInput { reason: string; version: number; }

export interface EvidenceListFilters { page: number; pageSize: number; }
export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface IncomingEvidenceUpload {
  file: TemporaryEvidence & {
    originalName: string;
    declaredMimeType: string;
  };
  description?: string;
  accessLevel?: "INTERNAL" | "TECHNICIAN";
}
```

- [ ] **Step 4: Define repository ports and result unions**

Include `EvidenceFailureKind` values `EVIDENCE_NOT_FOUND`, `RESOURCE_NOT_FOUND`, `RESOURCE_CANCELLED`, `VERSION_CONFLICT`, and `RESOURCE_INACTIVE`; `PageRecord<EvidenceRecord>`; and these exact ports:

```ts
export type EvidenceRecord = Prisma.EvidenciaGetPayload<{ select: typeof evidenceRecordSelect }>;
export interface PageRecord<T> { items: T[]; totalItems: number; }
export type EvidenceMutationResult =
  | { kind: "CREATED" | "UPDATED"; evidence: EvidenceRecord }
  | { kind: EvidenceFailureKind };

export interface EvidenceReadRepository {
  findUploadTarget(resource: EvidenceResource, actor: EvidenceActorContext): Promise<{ status: EstadoOrden | EstadoActividad } | null>;
  listEvidence(resource: EvidenceResource, filters: EvidenceListFilters, actor: EvidenceActorContext): Promise<PageRecord<EvidenceRecord> | null>;
  findDownloadableEvidence(id: string, actor: EvidenceActorContext): Promise<EvidenceRecord | null>;
  listMetadataStorageKeys(): Promise<string[]>;
}

export interface EvidenceMutationRepository {
  createEvidence(input: CreateEvidencePersistenceInput, actor: EvidenceActorContext, now: Date, promote: () => Promise<void>): Promise<EvidenceMutationResult>;
  updateEvidence(id: string, input: UpdateEvidenceInput, actor: EvidenceActorContext, now: Date): Promise<EvidenceMutationResult>;
  archiveEvidence(id: string, input: ArchiveEvidenceInput, actor: EvidenceActorContext, now: Date): Promise<EvidenceMutationResult>;
  recordAdministrativeDownload(id: string, actor: EvidenceActorContext, now: Date): Promise<void>;
}
```

`promote` is `() => Promise<void>` and runs after target locks/revalidation but before metadata/audit creation in the same interactive transaction.

- [ ] **Step 5: Implement schemas and mapper**

Serialize `BigInt` only after asserting `sizeBytes <= Number.MAX_SAFE_INTEGER`. Derive resource type from exactly one non-null API-supported relation. Throw an internal invariant error if a record has neither/both or only a reincidence relation in this phase.

- [ ] **Step 6: Verify and commit**

Run:

```bash
cd server
npm test -- tests/evidences/evidences-schemas.test.ts tests/evidences/evidences-mapper.test.ts
npm run typecheck
```

```bash
git add server/src/evidences/evidences.types.ts server/src/evidences/evidences.schemas.ts server/src/evidences/evidences.repository.types.ts server/src/evidences/evidences.mapper.ts server/tests/evidences/evidences-schemas.test.ts server/tests/evidences/evidences-mapper.test.ts
git commit -m "feat(evidences): define API contracts"
```

---

### Task 6: Scoped reads and historical visibility

**Files:**
- Create: `server/src/evidences/evidences.read.repository.ts`
- Create: `server/tests/database/evidences-test-data.ts`
- Expand: `server/tests/database/evidences-persistence.test.ts`

**Interfaces:**
- Consumes: `EvidenceResource`, `EvidenceActorContext`, `EvidenceListFilters`, `evidenceRecordSelect`.
- Produces: `listEvidence(resource, filters, actor)`, `findDownloadableEvidence(id, actor)`, `findUploadTarget(resource, actor)`, `listMetadataStorageKeys()`.

- [ ] **Step 1: Create deterministic database fixtures**

Build one admin, one supervisor, an assigned technician, a formerly assigned technician, an activity historical member, and a foreign technician. Create active/completed/cancelled orders and activities plus `TECHNICIAN`, `INTERNAL`, archived, and foreign evidence rows with real-looking 64-character hashes and fake relative storage keys.

- [ ] **Step 2: Write failing read/ACL tests**

Assert:

```ts
expect(await repo.listEvidence(orderResource, page, assignedActor)).toContainOnlyTechnicianLevel();
expect(await repo.listEvidence(orderResource, page, formerActor)).not.toBeNull();
expect(await repo.listEvidence(activityResource, page, historicalActivityActor)).not.toBeNull();
expect(await repo.listEvidence(orderResource, page, foreignActor)).toBeNull();
expect(await repo.findDownloadableEvidence(internalId, assignedActor)).toBeNull();
expect(await repo.findDownloadableEvidence(archivedId, adminActor)).toBeNull();
```

Also prove stable `createdAt DESC, id DESC` pagination and that count/list share one repeatable-read snapshot.

- [ ] **Step 3: Run focused database test and verify RED**

Run: `cd server && npm run test:db -- tests/database/evidences-persistence.test.ts`

Expected: missing read repository.

- [ ] **Step 4: Implement one visibility predicate per resource**

For technicians, use any historical `OrdenTecnico` interval for orders and current team or `ActividadVisibilidadTecnico` for activities. For management, require the resource to exist and not be deleted. Add `deletedAt: null` and access-level filtering to every evidence query; never fetch then filter in memory.

- [ ] **Step 5: Verify read consistency and mutation resistance**

Run the focused test. Temporarily remove the historical-ACL branch from each resource predicate and prove its dedicated test fails; restore and rerun.

- [ ] **Step 6: Commit**

```bash
git add server/src/evidences/evidences.read.repository.ts server/tests/database/evidences-test-data.ts server/tests/database/evidences-persistence.test.ts
git commit -m "feat(evidences): enforce historical evidence visibility"
```

---

### Task 7: Locked metadata mutations and audit history

**Files:**
- Create: `server/src/evidences/evidences.mutation.repository.ts`
- Expand: `server/tests/database/evidences-persistence.test.ts`

**Interfaces:**
- Consumes: Task 5 mutation inputs/result union and promotion callback; PostgreSQL target/evidence row locks.
- Produces: atomic create, optimistic update, archive, and administrative-download audit.

- [ ] **Step 1: Write failing create transaction tests**

Prove the repository:

- locks and revalidates order/activity before calling `promote`;
- rejects deleted or `CANCELLED` targets without calling `promote`;
- accepts `COMPLETED` targets;
- inserts metadata and `EVIDENCE_UPLOADED` together;
- rolls back both when audit creation is forced to fail;
- never accepts `reincidenciaId` from the phase-9 input type.

Record event order with a spy array and assert `lock → promote → metadata → audit`.

- [ ] **Step 2: Write failing update/archive/concurrency tests**

Assert exact snapshot content, one version increment, stale version `VERSION_CONFLICT`, no mutation/audit on conflict, archive triplet completeness, physical callback absence during update/archive, and two concurrent archive attempts producing one update plus one conflict/not-found.

- [ ] **Step 3: Run focused test and verify RED**

Run: `cd server && npm run test:db -- tests/database/evidences-persistence.test.ts`

Expected: mutation repository missing.

- [ ] **Step 4: Implement global lock order and transactions**

Use the established retry wrapper pattern and lock in this order:

```text
resource row (order or activity) → evidence row → uploader/archiver user only when needed
```

Create the final key as `files/${yyyy}/${mm}/${uuid}.${canonicalExtension}`. Await `promote()` while the resource lock is held, then insert metadata and audit. Update/archive with `WHERE id = ? AND version = ? AND deleted_at IS NULL`; check affected rows before reading the result.

- [ ] **Step 5: Implement exact audit snapshots**

Use entity `Evidencia`, entity ID equal to evidence UUID, and the exact actions
`EVIDENCE_UPLOADED`, `EVIDENCE_UPDATED`, `EVIDENCE_ARCHIVED`, and
`EVIDENCE_DOWNLOADED`. Include only resource type/ID, hash, size, level, actor,
version, and mutable before/after values. Put archive reason in
`Auditoria.reason` and the archived fields in `afterData`.

- [ ] **Step 6: Verify database mutations and commit**

Run:

```bash
cd server
npm run test:db -- tests/database/evidences-persistence.test.ts
npm run typecheck
npm run lint
```

```bash
git add server/src/evidences/evidences.mutation.repository.ts server/tests/database/evidences-persistence.test.ts
git commit -m "feat(evidences): persist audited metadata mutations"
```

---

### Task 8: Service policy and file/transaction compensation

**Files:**
- Create: `server/src/evidences/evidences.service.ts`
- Create: `server/tests/evidences/evidences-service.test.ts`

**Interfaces:**
- Consumes: read/mutation repository, `EvidenceStorage`, canonical validator, clock, logger-safe callbacks.
- Produces these `EvidenceService` methods:

```ts
prepareUpload(resource: EvidenceResource, actor: EvidenceActorContext): Promise<void>;
createEvidence(resource: EvidenceResource, upload: IncomingEvidenceUpload, actor: EvidenceActorContext): Promise<EvidencePublic>;
listEvidence(resource: EvidenceResource, filters: EvidenceListFilters, actor: EvidenceActorContext): Promise<{ items: EvidencePublic[]; pagination: PaginationMeta }>;
getDownload(id: string, actor: EvidenceActorContext): Promise<{ evidence: EvidencePublic; stream: Readable }>;
updateEvidence(id: string, input: UpdateEvidenceInput, actor: EvidenceActorContext): Promise<EvidencePublic>;
archiveEvidence(id: string, input: ArchiveEvidenceInput, actor: EvidenceActorContext): Promise<EvidencePublic>;
recordDownload(id: string, actor: EvidenceActorContext): Promise<void>;
```

- [ ] **Step 1: Write failing permission matrix tests**

Table-drive all three roles and permissions. Prove permission absence is `403`, an unlinked/inactive technician is `403`, foreign IDs map to the same `404` as absent IDs, technicians are forced to `TECHNICIAN`, and management can choose only `TECHNICIAN`/`INTERNAL`.

- [ ] **Step 2: Write failing compensation tests**

Inject a fake storage and repository. Cover:

```ts
await expect(service.createEvidence(validUpload)).rejects.toMatchObject({ statusCode: 503 });
expect(storage.remove).toHaveBeenCalledWith(finalKey); // DB/audit failed after promotion
expect(repository.createEvidence).not.toHaveBeenCalled(); // validation failed before promotion
expect(storage.remove).toHaveBeenCalledWith(tempKey); // every terminal path cleans temp
```

Also cover promotion failure, compensation-remove failure logging without path leakage, and missing final file on download mapping to `503`.

- [ ] **Step 3: Run focused test and verify RED**

Run: `cd server && npm test -- tests/evidences/evidences-service.test.ts`

Expected: missing service.

- [ ] **Step 4: Implement the orchestration boundary**

`prepareUpload` checks general permission and preliminary resource visibility before body streaming. `createEvidence` reads the temp head, calls `detectEvidenceFormat`, calculates the final key, then calls repository create with a promotion callback. Track `promoted` and compensate final/temp keys in `finally` without ever deleting an established evidence file.

Map failures exactly:

```ts
const statusByKind = {
  EVIDENCE_NOT_FOUND: 404,
  RESOURCE_NOT_FOUND: 404,
  RESOURCE_CANCELLED: 409,
  RESOURCE_INACTIVE: 409,
  VERSION_CONFLICT: 409,
} as const;
```

Map size to `413`, content to `422`, and storage failure to `503`.

- [ ] **Step 5: Verify and commit**

Run:

```bash
cd server
npm test -- tests/evidences/evidences-service.test.ts
npm run typecheck
npm run lint
```

```bash
git add server/src/evidences/evidences.service.ts server/tests/evidences/evidences-service.test.ts
git commit -m "feat(evidences): coordinate secure file lifecycle"
```

---

### Task 9: Streaming multipart parser

**Files:**
- Create: `server/src/evidences/evidences.multipart.ts`
- Create: `server/tests/evidences/evidences-multipart.test.ts`

**Interfaces:**
- Consumes: authorized Express request, Busboy, `EvidenceStorage.writeTemporary`, multipart metadata schema.
- Produces:

```ts
export interface ParsedEvidenceUpload {
  file: IncomingEvidenceUpload["file"];
  description?: IncomingEvidenceUpload["description"];
  accessLevel?: IncomingEvidenceUpload["accessLevel"];
}
export interface EvidenceMultipartParser {
  parse(request: Request): Promise<ParsedEvidenceUpload>;
}
```

- [ ] **Step 1: Write failing parser tests**

Use real multipart requests or controlled streams to prove one file succeeds and these fail deterministically: no file, second file, wrong field name, unknown text field, `CLIENT`, truncated request, Busboy limit event, storage size error, and client abort. Assert temporary cleanup once for every failure after temp creation.

- [ ] **Step 2: Run focused parser test and verify RED**

Run: `cd server && npm test -- tests/evidences/evidences-multipart.test.ts`

Expected: parser module missing.

- [ ] **Step 3: Implement one-settlement streaming parsing**

Configure Busboy with:

```ts
Busboy({
  headers: request.headers,
  limits: { files: 1, fields: 2, fileSize: maxBytes, parts: 3 },
});
```

Pause/reject additional streams, propagate `limit`, await `storage.writeTemporary`, validate text fields after `close`, and guard resolve/reject with a single settled flag. On `aborted`, destroy Busboy and remove an already-created temp key.

- [ ] **Step 4: Verify parser and commit**

Run:

```bash
cd server
npm test -- tests/evidences/evidences-multipart.test.ts
npm run typecheck
npm run lint
```

```bash
git add server/src/evidences/evidences.multipart.ts server/tests/evidences/evidences-multipart.test.ts
git commit -m "feat(evidences): stream single-file uploads"
```

---

### Task 10: HTTP routes, private download, and application wiring

**Files:**
- Create: `server/src/evidences/evidences.controller.ts`
- Create: `server/src/evidences/evidences.routes.ts`
- Create: `server/tests/evidences/evidences-http.test.ts`
- Modify: `server/src/routes/index.ts`
- Modify: `server/src/app.ts`
- Modify: `server/src/server.ts`
- Modify: `server/vitest.database.config.ts`

**Interfaces:**
- Consumes: `EvidenceService`, multipart parser, `EvidenceStorage`, `Environment`, auth service, logger.
- Produces: seven phase-9 endpoints and injectable `CreateAppOptions.evidenceStorage`.

- [ ] **Step 1: Write failing end-to-end HTTP tests**

Use a disposable storage root, real DB fixtures, authenticated agents, and Supertest `.attach()`. Cover all seven endpoints, standard JSON envelopes, exact `201` location, pagination, byte-identical download, safe headers, technician/internal visibility, current/historical ownership, management update/archive, `CLIENT` rejection, canceled target `409`, foreign/absent identical `404`, stale version `409`, oversized `413`, disguised `422`, no-origin write `403`, forced-password-change denial, and archived download `404` while the file still exists.

- [ ] **Step 2: Run HTTP test and verify RED**

Run: `cd server && npm run test:db -- tests/evidences/evidences-http.test.ts`

Expected: all evidence routes return `404`.

- [ ] **Step 3: Implement controller handlers and download streaming**

For upload handlers, parse UUID params, call `prepareUpload` before parsing multipart, then call `createEvidence`. For download, set headers only after `service.getDownload` returns metadata plus stream:

```ts
res.status(200);
res.setHeader("Content-Type", evidence.mimeType);
res.setHeader("Content-Length", String(evidence.sizeBytes));
res.setHeader("Content-Disposition", buildAttachmentHeader(evidence.originalName));
res.setHeader("X-Content-Type-Options", "nosniff");
res.setHeader("Cache-Control", "private, no-store");
stream.on("error", next);
stream.pipe(res);
```

Record an administrative download only after the stream opens. Handle an error after headers with `res.destroy(error)` rather than attempting a JSON envelope.

- [ ] **Step 4: Compose route security in the required order**

Use authentication and password-change checks on all routes. Writes require allowed origin. Upload requires `EVIDENCES_UPLOAD`; list/download require `EVIDENCES_VIEW`; update/archive require `EVIDENCES_MANAGE`. Mount exact paths from the spec and do not expose a static directory.

- [ ] **Step 5: Inject and initialize storage without making `createApp` asynchronous**

Add optional `evidenceStorage` to `CreateAppOptions`. Tests pass an initialized disposable adapter. Direct server execution creates and awaits `LocalEvidenceStorage.initialize(...)` before `listen`, then injects it. A lazy initialization guard may protect alternate app creation, but production must fail before listening when the root is unavailable.

- [ ] **Step 6: Verify HTTP behavior and existing security tests**

Run:

```bash
cd server
npm run test:db -- tests/evidences/evidences-http.test.ts
npm test -- tests/security.test.ts tests/errors.test.ts tests/server.test.ts
npm run typecheck
npm run lint
```

Expected: evidence HTTP tests pass, existing JSON/error behavior is unchanged, and no route serves `storageKey` directly.

- [ ] **Step 7: Commit**

```bash
git add server/src/evidences/evidences.controller.ts server/src/evidences/evidences.routes.ts server/src/routes/index.ts server/src/app.ts server/src/server.ts server/tests/evidences/evidences-http.test.ts server/vitest.database.config.ts
git commit -m "feat(evidences): expose protected file API"
```

---

### Task 11: Reconciliation command and operational documentation

**Files:**
- Create: `server/scripts/verify-evidences.ts`
- Create: `server/tests/evidences/evidences-reconciliation.test.ts`
- Modify: `server/package.json`
- Modify: `README.md`
- Modify: `docs/plans/implementation-plan.md`
- Modify: `docs/architecture/current-state.md`

**Interfaces:**
- Consumes: `EvidenceStorage.listFinalKeys()`, `EvidenceStorage.exists()`, repository metadata-key iterator, environment/database factories.
- Produces: `reconcileEvidenceStorage(storageKeys, metadataKeys)` pure summary and `npm run evidences:verify` read-only command.

- [ ] **Step 1: Write failing pure reconciliation tests**

Assert deterministic sorted output:

```ts
expect(reconcileEvidenceStorage(
  ["files/2026/08/a.pdf", "files/2026/08/orphan.jpg"],
  ["files/2026/08/a.pdf", "files/2026/08/missing.png"],
)).toEqual({
  matched: 1,
  orphanFiles: ["files/2026/08/orphan.jpg"],
  missingFiles: ["files/2026/08/missing.png"],
});
```

Prove the function never calls remove and never returns absolute paths.

- [ ] **Step 2: Run focused test and verify RED**

Run: `cd server && npm test -- tests/evidences/evidences-reconciliation.test.ts`

Expected: verification module missing.

- [ ] **Step 3: Implement pure diff and CLI exit contract**

The command initializes storage, queries active and archived metadata keys, scans final keys, prints counts plus relative mismatches, and sets exit code `2` when either mismatch list is non-empty. It performs no deletion. Add:

```json
"evidences:verify": "tsx scripts/verify-evidences.ts"
```

- [ ] **Step 4: Document local and future Docker operation**

README must show local path setup, accepted formats, 10 MiB ceiling, permissions, upload/download examples, backup requirement, and this future compose fragment without claiming Docker files already exist:

```yaml
volumes:
  - evidence_data:/data/evidences
environment:
  EVIDENCE_STORAGE_PATH: /data/evidences
```

Update current state and phase 9 status only after all feature gates pass. Keep frontend integration explicitly pending.

- [ ] **Step 5: Verify and commit**

Run:

```bash
cd server
npm test -- tests/evidences/evidences-reconciliation.test.ts
npm run evidences:verify
```

Expected on the clean local volume: exit `0`, zero orphan files, zero missing files.

```bash
git add server/scripts/verify-evidences.ts server/tests/evidences/evidences-reconciliation.test.ts server/package.json README.md docs/plans/implementation-plan.md docs/architecture/current-state.md
git commit -m "docs(evidences): document private storage operations"
```

---

### Task 12: Full verification and delivery audit

**Files:**
- Modify only if a gate exposes a defect inside the phase-9 scope.
- Inspect: every file named in this plan and `docs/superpowers/specs/2026-08-17-evidences-api-design.md`.

**Interfaces:**
- Consumes: all prior task outputs.
- Produces: fresh proof that the integrated phase satisfies the spec with no uncommitted implementation changes.

- [ ] **Step 1: Verify migration and generated client in both schemas**

Run:

```bash
cd server
npm run db:format
npm run db:validate
npm run db:generate
npm run db:migrate:deploy
npm run db:verify
```

Repeat deploy and verify using the test-schema URL. Expected: eight migrations applied, evidence checks/indexes present, and role permissions exact.

- [ ] **Step 2: Prove seed idempotence in both schemas**

Run seed twice per schema and compare catalog/role-assignment counts. Expected: second run makes no duplicate permission or role mapping.

- [ ] **Step 3: Run every backend gate fresh**

Run:

```bash
cd server
npm test -- --run
npm run test:db
npm run typecheck
npm run lint
npm run build
npm run evidences:verify
```

Expected: zero failed tests, type errors, lint warnings, build errors, orphan files, or missing files. Record known `pg` deprecation warnings separately; do not call them failures.

- [ ] **Step 4: Run frontend regression gates**

Run from repository root:

```bash
npm test -- --run
npm run lint
npm run build
```

Expected: existing frontend remains green and still explicitly uses mocks.

- [ ] **Step 5: Perform adversarial smoke checks**

Against the compiled API and a disposable evidence root, perform one valid upload/download/archive flow plus one oversized, one disguised, one foreign-technician, and one missing-file request. Confirm exact statuses `201/200/200`, `413`, `422`, `404`, and `503`; confirm no response body contains the absolute root or `storageKey`.

- [ ] **Step 6: Review the spec line by line**

Create a temporary checklist mapping all 18 spec sections to code/tests/docs. Resolve every Critical or Important gap before delivery. Delete only the temporary checklist after its conclusions are captured in the task report; never delete implementation evidence.

- [ ] **Step 7: Check the final diff and repository state**

Run:

```bash
git diff --check "$(git merge-base HEAD main)..HEAD"
git status --short
git log --oneline --decorate -15
```

Expected: diff check succeeds and the worktree contains no uncommitted files except an intentionally ignored local report.

- [ ] **Step 8: Commit any verified documentation-only correction**

If Step 6 required a documentation correction, commit only those reviewed files:

```bash
git add README.md docs/plans/implementation-plan.md docs/architecture/current-state.md
git commit -m "docs(evidences): finalize phase verification"
```

If no correction was needed, do not create an empty commit.
