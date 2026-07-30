# Persistence and Relational Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crear desde cero el modelo relacional de Geek Solution en la base PostgreSQL local `"Sistema_kpiGS"`, con Prisma, migración inicial, seed ficticio idempotente, scripts para pgAdmin y pruebas de integridad.

**Architecture:** Prisma define el modelo y genera el cliente tipado; una migración versionada añade las tablas y las restricciones específicas de PostgreSQL. La API encapsula la creación del cliente, el seed se divide por dominios y las pruebas usan exclusivamente el esquema `test` de la misma base.

**Tech Stack:** Node.js, TypeScript ESM, Express, Prisma ORM 7, `@prisma/adapter-pg`, PostgreSQL 18.4, `pg`, Zod y Vitest.

## Global Constraints

- La base se llama exactamente `"Sistema_kpiGS"` y ya existe un PostgreSQL local administrado con pgAdmin.
- No usar Docker, SQLite, `prisma db push` ni sustitutos de migraciones.
- No ejecutar `DROP DATABASE`, `migrate reset`, `DROP SCHEMA ... CASCADE` ni otra operación destructiva sin autorización.
- El esquema `public` contiene desarrollo; las pruebas solo pueden usar `DATABASE_TEST_URL` con `schema=test`.
- Un técnico puede existir sin usuario; `Tecnico.userId` es opcional y único.
- Los usuarios seed no tienen contraseña utilizable ni acceso funcional.
- Todos los datos seed son ficticios.
- UUID para entidades, `timestamptz` para instantes UTC, `date` para fechas civiles y `Decimal` para dinero, cantidades y métricas.
- Mantener TypeScript estricto, ESM y el contrato actual de la API.
- No implementar endpoints de negocio, login, carga de archivos ni cálculo de KPI en esta etapa.
- No modificar ni eliminar cambios existentes del usuario.
- No crear commits ni hacer push sin autorización expresa; cada tarea termina en un checkpoint de diff y validación.

## File Map

```text
server/
├── database/
│   ├── create-database.sql             # Crea únicamente "Sistema_kpiGS"
│   ├── create-test-schema.sql           # Crea el esquema test sin borrar datos
│   ├── verify-database.sql              # Consultas de verificación de solo lectura
│   └── run-sql.ts                       # Ejecuta verify-database.sql con node-postgres
├── generated/prisma/                    # Cliente generado, ignorado por Git
├── prisma/
│   ├── migrations/<timestamp>_initial_schema/migration.sql
│   ├── seed/
│   │   ├── catalogs.ts
│   │   ├── identity.ts
│   │   ├── organization.ts
│   │   ├── operations.ts
│   │   ├── quality.ts
│   │   └── constants.ts
│   ├── schema.prisma
│   └── seed.ts
├── src/config/
│   ├── env.ts
│   └── database.ts
├── tests/database/
│   ├── database-test-context.ts
│   ├── constraints.test.ts
│   ├── relations.test.ts
│   └── seed.test.ts
├── prisma.config.ts
├── vitest.database.config.ts
├── .env.example
├── package.json
└── package-lock.json
```

---

### Task 1: Prisma Tooling, Environment Contract, and pgAdmin Scripts

**Files:**
- Modify: `server/package.json`
- Modify: `server/package-lock.json`
- Modify: `server/src/config/env.ts`
- Modify: `server/tests/env.test.ts`
- Modify: every backend test that calls `parseEnvironment`
- Modify: `server/.env.example`
- Modify: `.gitignore`
- Create: `server/prisma.config.ts`
- Create: `server/database/create-database.sql`
- Create: `server/database/create-test-schema.sql`

**Interfaces:**
- Consumes: existing `parseEnvironment(input: EnvironmentInput): Environment`.
- Produces: `Environment.DATABASE_URL`, `Environment.DATABASE_TEST_URL`, Prisma CLI configuration, and database bootstrap scripts.

- [ ] **Step 1: Add failing environment tests**

Extend `server/tests/env.test.ts` with:

```ts
const developmentDatabaseUrl =
  "postgresql://user:password@localhost:5432/Sistema_kpiGS?schema=public";
const testDatabaseUrl =
  "postgresql://user:password@localhost:5432/Sistema_kpiGS?schema=test";

it("requires a PostgreSQL development URL", () => {
  expect(() => parseEnvironment({})).toThrow(
    "Configuración de entorno inválida",
  );
});

it("accepts isolated development and test schemas", () => {
  const result = parseEnvironment({
    DATABASE_URL: developmentDatabaseUrl,
    DATABASE_TEST_URL: testDatabaseUrl,
  });

  expect(result.DATABASE_URL).toBe(developmentDatabaseUrl);
  expect(result.DATABASE_TEST_URL).toBe(testDatabaseUrl);
});

it("rejects a non-PostgreSQL URL", () => {
  expect(() =>
    parseEnvironment({
      DATABASE_URL: "file:./local.db",
      DATABASE_TEST_URL: testDatabaseUrl,
    }),
  ).toThrow("Configuración de entorno inválida");
});

it("rejects a test URL that targets the public schema", () => {
  expect(() =>
    parseEnvironment({
      DATABASE_URL: developmentDatabaseUrl,
      DATABASE_TEST_URL: developmentDatabaseUrl,
    }),
  ).toThrow("DATABASE_TEST_URL debe utilizar el esquema test");
});
```

Update existing success cases and application tests with these two safe fixture
URLs. Never use credentials from `server/.env` in unit tests.

- [ ] **Step 2: Run the environment suite and verify RED**

Run:

```powershell
cd server
npm run test -- tests/env.test.ts
```

Expected: FAIL because the returned `Environment` does not contain database
URLs and the current parser accepts an empty input.

- [ ] **Step 3: Install the current audited Prisma 7 PostgreSQL stack**

Run:

```powershell
cd server
npm install @prisma/client@latest @prisma/adapter-pg@latest pg@latest
npm install --save-dev prisma@latest @types/pg@latest
npm audit --audit-level=moderate
```

Verify that `prisma` and `@prisma/client` resolve to the same major version and
that the major is `7`. If the audit reports a moderate or higher vulnerability,
stop and evaluate a non-vulnerable compatible version before proceeding.

- [ ] **Step 4: Implement the database URL contract**

Add to the Zod schema:

```ts
const postgresUrl = z
  .string()
  .url()
  .refine(
    (value) =>
      value.startsWith("postgresql://") || value.startsWith("postgres://"),
    "Debe utilizar PostgreSQL",
  );

DATABASE_URL: postgresUrl,
DATABASE_TEST_URL: postgresUrl,
```

After parsing, validate the schemas with URL parsing:

```ts
const developmentUrl = new URL(result.data.DATABASE_URL);
const testUrl = new URL(result.data.DATABASE_TEST_URL);

if (developmentUrl.searchParams.get("schema") !== "public") {
  throw new Error(
    "Configuración de entorno inválida: DATABASE_URL debe utilizar el esquema public",
  );
}

if (testUrl.searchParams.get("schema") !== "test") {
  throw new Error(
    "Configuración de entorno inválida: DATABASE_TEST_URL debe utilizar el esquema test",
  );
}
```

Return both values from `parseEnvironment`.

- [ ] **Step 5: Configure Prisma 7**

Create `server/prisma.config.ts`:

```ts
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
```

Add package scripts:

```json
{
  "db:format": "prisma format",
  "db:validate": "prisma validate",
  "db:generate": "prisma generate",
  "db:migrate": "prisma migrate dev",
  "db:migrate:deploy": "prisma migrate deploy",
  "db:seed": "prisma db seed",
  "db:verify": "tsx database/run-sql.ts database/verify-database.sql",
  "test:db": "vitest run --config vitest.database.config.ts"
}
```

Add to `server/.env.example`:

```env
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/Sistema_kpiGS?schema=public
DATABASE_TEST_URL=postgresql://USER:PASSWORD@localhost:5432/Sistema_kpiGS?schema=test
```

Add `server/generated/` to `.gitignore`.

- [ ] **Step 6: Create safe pgAdmin bootstrap scripts**

`server/database/create-database.sql`:

```sql
-- Ejecutar desde el Query Tool conectado a la base administrativa postgres.
-- Esta sentencia falla sin alterar nada cuando la base ya existe.
CREATE DATABASE "Sistema_kpiGS"
    WITH
    ENCODING = 'UTF8'
    TEMPLATE = template0;
```

`server/database/create-test-schema.sql`:

```sql
-- Ejecutar conectado a "Sistema_kpiGS".
CREATE SCHEMA IF NOT EXISTS test;
```

- [ ] **Step 7: Verify Task 1**

Run:

```powershell
cd server
npm run test -- tests/env.test.ts
npm run typecheck
npm run lint
npm audit --audit-level=moderate
git diff --check
```

Expected: all commands exit `0`. Review `git diff -- server/package.json
server/src/config/env.ts server/.env.example .gitignore`; do not commit.

---

### Task 2: Complete Prisma Schema

**Files:**
- Create: `server/prisma/schema.prisma`

**Interfaces:**
- Consumes: PostgreSQL datasource from `server/prisma.config.ts`.
- Produces: all enums and models consumed by migration, generated client, seed, and database tests.

- [ ] **Step 1: Create a generated-client contract test**

Create `server/tests/database/schema-contract.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { Prisma } from "../../generated/prisma/client.js";

const requiredModels = [
  "Usuario",
  "Rol",
  "Permiso",
  "UsuarioRol",
  "RolPermiso",
  "Tecnico",
  "Cliente",
  "SucursalCliente",
  "ContactoCliente",
  "TipoServicio",
  "TipoActividad",
  "OrdenTrabajo",
  "OrdenTecnico",
  "HistorialOrden",
  "OrdenRelacionada",
  "Actividad",
  "ActividadTecnico",
  "PausaActividad",
  "Material",
  "MaterialUtilizado",
  "CausaReincidencia",
  "Reincidencia",
  "ReincidenciaOrden",
  "ReincidenciaTecnico",
  "Evidencia",
  "ConfiguracionKPI",
  "MetaTecnico",
  "ResultadoKPI",
  "Auditoria",
  "Notificacion",
] as const;

describe("Prisma schema contract", () => {
  it("generates a client for every approved relational model", () => {
    for (const model of requiredModels) {
      expect(Object.values(Prisma.ModelName)).toContain(model);
    }
  });
});
```

- [ ] **Step 2: Run the inventory test and verify RED**

Run:

```powershell
cd server
npm run test -- tests/database/schema-contract.test.ts
```

Expected: FAIL because the generated Prisma client does not exist.

- [ ] **Step 3: Define generator, datasource, and enums**

Start `server/prisma/schema.prisma` with:

```prisma
generator client {
  provider = "prisma-client"
  output   = "../generated/prisma"
}

datasource db {
  provider = "postgresql"
}
```

Declare these exact enums:

```text
UsuarioEstado: PENDING ACTIVE BLOCKED INACTIVE
EstadoTecnico: AVAILABLE BUSY ON_ROUTE INACTIVE
PrioridadOrden: LOW MEDIUM HIGH CRITICAL
EstadoOrden: PENDING ASSIGNED ON_ROUTE IN_PROGRESS PAUSED COMPLETED CANCELLED
RolOrdenTecnico: PRIMARY SUPPORT
TipoRelacionOrden: RECURRENCE FOLLOW_UP REPLACEMENT RELATED
EstadoActividad: PENDING IN_PROGRESS PAUSED COMPLETED CANCELLED
RolActividadTecnico: RESPONSIBLE PARTICIPANT
NivelAccesoEvidencia: INTERNAL TECHNICIAN CLIENT
EstadoReincidencia: OPEN ANALYSIS CORRECTION CLOSED
ImpactoReincidencia: LOW MEDIUM HIGH
ResponsabilidadReincidencia: TECHNICAL_WORK EQUIPMENT CLIENT THIRD_PARTY UNDETERMINED
ParticipacionReincidencia: ORIGINAL_RESPONSIBLE ORIGINAL_PARTICIPANT CORRECTION_PARTICIPANT
```

Map every enum and enum value to explicit `snake_case` database names.

- [ ] **Step 4: Define identity and organization models**

Implement `Usuario`, `Rol`, `Permiso`, `UsuarioRol`, `RolPermiso`, `Tecnico`,
`Cliente`, `SucursalCliente`, and `ContactoCliente` exactly as specified in:

`docs/superpowers/specs/2026-07-29-persistence-relational-model-design.md`.

Use these relation and uniqueness signatures:

```prisma
model UsuarioRol {
  usuarioId String @db.Uuid @map("usuario_id")
  rolId     String @db.Uuid @map("rol_id")

  @@id([usuarioId, rolId])
  @@map("usuario_rol")
}

model RolPermiso {
  rolId     String @db.Uuid @map("rol_id")
  permisoId String @db.Uuid @map("permiso_id")

  @@id([rolId, permisoId])
  @@map("rol_permiso")
}
```

`Tecnico.userId` must be `String? @unique @db.Uuid`; the relation to `Usuario`
must be optional with `onDelete: SetNull`.

- [ ] **Step 5: Define operations models**

Implement the exact fields and relations for:

```text
TipoServicio
TipoActividad
OrdenTrabajo
OrdenTecnico
HistorialOrden
OrdenRelacionada
Actividad
ActividadTecnico
PausaActividad
Material
MaterialUtilizado
Evidencia
```

Use explicit join keys:

```prisma
@@unique([ordenId, tecnicoId])
@@unique([actividadId, tecnicoId])
@@unique([ordenOriginalId, ordenRelacionadaId, tipo])
```

`Actividad.ordenId`, both targets of `MaterialUtilizado`, and all three targets
of `Evidencia` are nullable. Their exclusive ownership is enforced in the SQL
migration, not with application defaults.

- [ ] **Step 6: Define quality, KPI, audit, and notification models**

Implement:

```text
CausaReincidencia
Reincidencia
ReincidenciaOrden
ReincidenciaTecnico
ConfiguracionKPI
MetaTecnico
ResultadoKPI
Auditoria
Notificacion
```

Critical exact types:

```text
Reincidencia.estimatedCost            Decimal @db.Decimal(12, 2)
ConfiguracionKPI.*Weight              Decimal @db.Decimal(5, 4)
ResultadoKPI component scores         Decimal @db.Decimal(5, 2)
Material.referenceCost                Decimal @db.Decimal(12, 2)
MaterialUtilizado.quantity             Decimal @db.Decimal(12, 3)
MaterialUtilizado.historicalUnitCost   Decimal @db.Decimal(12, 2)
```

Use `Json? @db.JsonB` for historical snapshots and audit values. Do not add a
foreign key from `Auditoria.entityId`, because it can identify different
entity types.

- [ ] **Step 7: Format, validate, and generate**

Run:

```powershell
cd server
npm run db:format
npm run db:validate
npm run db:generate
npm run test -- tests/database/schema-contract.test.ts
npm run typecheck
npm run lint
```

Expected: all commands exit `0`; generated TypeScript exists under
`server/generated/prisma/` and remains ignored by Git.

- [ ] **Step 8: Checkpoint**

Run `git diff --check` and inspect the complete schema against every model and
enum in the approved spec. Do not commit.

---

### Task 3: Initial Migration and PostgreSQL-Specific Integrity

**Files:**
- Create: `server/prisma/migrations/<timestamp>_initial_schema/migration.sql`
- Create: `server/database/verify-database.sql`
- Create: `server/database/run-sql.ts`

**Interfaces:**
- Consumes: `server/prisma/schema.prisma` and `DATABASE_URL`.
- Produces: a reviewable migration, critical PostgreSQL constraints, and a read-only verification command.

- [ ] **Step 1: Confirm the target before mutation**

Run a read-only connection check through `pg` that prints only:

```text
current_database
current_schema
server_version
existing_table_count
```

Proceed only when the database is exactly `Sistema_kpiGS`, the schema is
`public`, and there are no application tables. Never print the connection URL
or password.

If the base does not exist, stop and ask the user to execute
`server/database/create-database.sql` in pgAdmin.

- [ ] **Step 2: Generate the initial migration without applying it**

Run:

```powershell
cd server
npx prisma migrate dev --name initial_schema --create-only
```

Expected: one new migration directory and no application tables in `public`.

- [ ] **Step 3: Add exact custom constraints**

Append named PostgreSQL constraints and partial indexes:

```sql
CREATE UNIQUE INDEX "uq_contacto_principal_sucursal"
ON "contacto_cliente" ("sucursal_id")
WHERE "es_principal" = true
  AND "sucursal_id" IS NOT NULL
  AND "deleted_at" IS NULL;

CREATE UNIQUE INDEX "uq_orden_tecnico_principal_activo"
ON "orden_tecnico" ("orden_id")
WHERE "rol" = 'primary' AND "unassigned_at" IS NULL;

CREATE UNIQUE INDEX "uq_actividad_tecnico_responsable"
ON "actividad_tecnico" ("actividad_id")
WHERE "rol" = 'responsible';

CREATE UNIQUE INDEX "uq_pausa_actividad_abierta"
ON "pausa_actividad" ("actividad_id")
WHERE "ended_at" IS NULL;

ALTER TABLE "orden_relacionada"
ADD CONSTRAINT "ck_orden_relacionada_distinta"
CHECK ("orden_original_id" <> "orden_relacionada_id");

ALTER TABLE "material_utilizado"
ADD CONSTRAINT "ck_material_destino_exclusivo"
CHECK (num_nonnulls("orden_id", "actividad_id") = 1);

ALTER TABLE "evidencia"
ADD CONSTRAINT "ck_evidencia_recurso_exclusivo"
CHECK (num_nonnulls("orden_id", "actividad_id", "reincidencia_id") = 1);

ALTER TABLE "reincidencia_tecnico"
ADD CONSTRAINT "ck_reincidencia_calidad_justificada"
CHECK (
  "affects_quality" = false
  OR length(btrim(coalesce("justification", ''))) > 0
);

ALTER TABLE "configuracion_kpi"
ADD CONSTRAINT "ck_kpi_pesos_rango"
CHECK (
  "productivity_weight" BETWEEN 0 AND 1
  AND "compliance_weight" BETWEEN 0 AND 1
  AND "efficiency_weight" BETWEEN 0 AND 1
  AND "quality_weight" BETWEEN 0 AND 1
);

ALTER TABLE "configuracion_kpi"
ADD CONSTRAINT "ck_kpi_pesos_total"
CHECK (
  "productivity_weight"
  + "compliance_weight"
  + "efficiency_weight"
  + "quality_weight" = 1.0000
);
```

Add the remaining checks using the generated column names:

```sql
ALTER TABLE "orden_trabajo"
ADD CONSTRAINT "ck_orden_fechas"
CHECK ("ended_at" IS NULL OR "started_at" IS NULL OR "ended_at" >= "started_at"),
ADD CONSTRAINT "ck_orden_minutos"
CHECK (
  coalesce("estimated_minutes", 0) >= 0
  AND coalesce("total_minutes", 0) >= 0
);

ALTER TABLE "actividad"
ADD CONSTRAINT "ck_actividad_fechas"
CHECK ("ended_at" IS NULL OR "started_at" IS NULL OR "ended_at" >= "started_at"),
ADD CONSTRAINT "ck_actividad_minutos"
CHECK (
  coalesce("paused_minutes", 0) >= 0
  AND coalesce("productive_minutes", 0) >= 0
);

ALTER TABLE "actividad_tecnico"
ADD CONSTRAINT "ck_actividad_participacion"
CHECK ("participation_percentage" BETWEEN 0 AND 100),
ADD CONSTRAINT "ck_actividad_tecnico_fechas"
CHECK ("ended_at" IS NULL OR "started_at" IS NULL OR "ended_at" >= "started_at");

ALTER TABLE "pausa_actividad"
ADD CONSTRAINT "ck_pausa_fechas"
CHECK ("ended_at" IS NULL OR "ended_at" >= "started_at");

ALTER TABLE "material"
ADD CONSTRAINT "ck_material_costo"
CHECK (coalesce("reference_cost", 0) >= 0);

ALTER TABLE "material_utilizado"
ADD CONSTRAINT "ck_material_cantidad_costo"
CHECK ("quantity" > 0 AND "historical_unit_cost" >= 0);

ALTER TABLE "evidencia"
ADD CONSTRAINT "ck_evidencia_tamano"
CHECK ("size_bytes" >= 0);

ALTER TABLE "reincidencia"
ADD CONSTRAINT "ck_reincidencia_fechas"
CHECK ("closed_at" IS NULL OR "closed_at" >= "detected_at"),
ADD CONSTRAINT "ck_reincidencia_recursos"
CHECK (
  coalesce("additional_minutes", 0) >= 0
  AND coalesce("estimated_cost", 0) >= 0
);

ALTER TABLE "reincidencia_orden"
ADD CONSTRAINT "ck_reincidencia_visita"
CHECK ("visit_number" > 0 AND coalesce("additional_minutes", 0) >= 0);

ALTER TABLE "configuracion_kpi"
ADD CONSTRAINT "ck_kpi_vigencia"
CHECK ("valid_to" IS NULL OR "valid_to" >= "valid_from");

ALTER TABLE "meta_tecnico"
ADD CONSTRAINT "ck_meta_periodo"
CHECK ("period_end" >= "period_start"),
ADD CONSTRAINT "ck_meta_valores"
CHECK (
  "target_jobs" >= 0
  AND "target_productive_minutes" >= 0
);

ALTER TABLE "resultado_kpi"
ADD CONSTRAINT "ck_resultado_periodo"
CHECK ("period_end" >= "period_start"),
ADD CONSTRAINT "ck_resultado_contadores"
CHECK (
  "completed_jobs" >= 0
  AND "applied_target" >= 0
  AND "registered_minutes" >= 0
  AND "productive_minutes" >= 0
  AND "on_time_jobs" >= 0
  AND "attributable_recurrences" >= 0
),
ADD CONSTRAINT "ck_resultado_puntajes"
CHECK (
  "productivity_score" BETWEEN 0 AND 100
  AND "compliance_score" BETWEEN 0 AND 100
  AND "efficiency_score" BETWEEN 0 AND 100
  AND "quality_score" BETWEEN 0 AND 100
  AND "overall_score" BETWEEN 0 AND 100
);
```

If Prisma generates a different column name, update both the schema mapping and
this SQL before applying the migration; do not silently omit the constraint.

- [ ] **Step 4: Review migration safety**

Search the migration:

```powershell
rg -n "DROP DATABASE|DROP SCHEMA|TRUNCATE|CASCADE" prisma/migrations
```

Expected: no destructive statements. Inspect all `ON DELETE` actions and keep
historical relations restrictive unless the approved spec explicitly requires
`SET NULL`.

- [ ] **Step 5: Apply migration to development**

Only after the target confirmation:

```powershell
cd server
npm run db:migrate
npx prisma migrate status
```

Expected: migration applied once and schema up to date.

- [ ] **Step 6: Add read-only verification**

`verify-database.sql` must select:

```sql
SELECT current_database() AS database_name,
       current_schema() AS schema_name,
       current_setting('server_version') AS server_version;

SELECT table_name
FROM information_schema.tables
WHERE table_schema = current_schema()
ORDER BY table_name;

SELECT indexname
FROM pg_indexes
WHERE schemaname = current_schema()
  AND indexname IN (
    'uq_contacto_principal_sucursal',
    'uq_orden_tecnico_principal_activo',
    'uq_actividad_tecnico_responsable',
    'uq_pausa_actividad_abierta'
  )
ORDER BY indexname;

SELECT conname
FROM pg_constraint
WHERE conname LIKE 'ck_%'
ORDER BY conname;
```

`run-sql.ts` must read the path from `process.argv[2]`, reject a missing path,
connect using `env.DATABASE_URL`, execute the SQL, print result rows without the
URL, and always close the `pg.Client` in `finally`.

- [ ] **Step 7: Verify Task 3**

Run:

```powershell
cd server
npm run db:verify
npm run db:validate
npm run typecheck
npm run lint
npx prisma migrate status
git diff --check
```

Expected: all commands exit `0`, all four partial indexes and named checks are
listed, and migration status is current. Do not commit.

---

### Task 4: Reusable Prisma Client and Controlled Shutdown

**Files:**
- Create: `server/src/config/database.ts`
- Create: `server/tests/database-client.test.ts`
- Modify: `server/src/server.ts`

**Interfaces:**
- Consumes: generated `PrismaClient`, `Environment.DATABASE_URL`, and `PrismaPg`.
- Produces: `createDatabaseClient(connectionString: string): PrismaClient` and
  `getDatabaseClient(connectionString: string): PrismaClient`.

- [ ] **Step 1: Write the failing client factory test**

Create `server/tests/database-client.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createDatabaseClient } from "../src/config/database.js";

describe("createDatabaseClient", () => {
  it("rejects a non-PostgreSQL connection string", () => {
    expect(() => createDatabaseClient("file:./local.db")).toThrow(
      "La conexión debe utilizar PostgreSQL",
    );
  });

  it("creates a disconnectable Prisma client", async () => {
    const client = createDatabaseClient(
      "postgresql://user:password@localhost:5432/Sistema_kpiGS?schema=test",
    );

    expect(client.$disconnect).toBeTypeOf("function");
    await client.$disconnect();
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
cd server
npm run test -- tests/database-client.test.ts
```

Expected: FAIL because `src/config/database.ts` does not exist.

- [ ] **Step 3: Implement the client factory**

Create:

```ts
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client.js";

let singleton: PrismaClient | undefined;

export function createDatabaseClient(connectionString: string): PrismaClient {
  const url = new URL(connectionString);
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new Error("La conexión debe utilizar PostgreSQL");
  }

  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

export function getDatabaseClient(connectionString: string): PrismaClient {
  singleton ??= createDatabaseClient(connectionString);
  return singleton;
}
```

Do not import `env` or create a connection at module load time. Do not enable
query logging and do not include the connection string in errors.

- [ ] **Step 4: Add controlled disconnect**

Refactor the direct execution branch in `server/src/server.ts` so `SIGINT` and
`SIGTERM` close the HTTP server, call `database.$disconnect()`, and then set the
process exit code. Keep `startServer()` import-safe for existing tests.

Inside the direct execution branch, create the singleton with
`getDatabaseClient(env.DATABASE_URL)`. Use one idempotent shutdown function:

```ts
let shuttingDown = false;

async function shutdown(signal: NodeJS.Signals) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "API shutting down");
  server.close(async (error) => {
    await database.$disconnect();
    process.exitCode = error ? 1 : 0;
  });
}
```

Register the two signals only inside the direct execution branch.

- [ ] **Step 5: Verify Task 4**

Run:

```powershell
cd server
npm run test -- tests/database-client.test.ts tests/server.test.ts
npm run typecheck
npm run lint
npm run build
git diff --check
```

Expected: all commands exit `0`. Do not commit.

---

### Task 5: Idempotent Fictitious Seed

**Files:**
- Create: `server/prisma/seed/constants.ts`
- Create: `server/prisma/seed/catalogs.ts`
- Create: `server/prisma/seed/identity.ts`
- Create: `server/prisma/seed/organization.ts`
- Create: `server/prisma/seed/operations.ts`
- Create: `server/prisma/seed/quality.ts`
- Create: `server/prisma/seed.ts`
- Create: `server/tests/database/seed.test.ts`

**Interfaces:**
- Consumes: generated Prisma enums/types and `createDatabaseClient`.
- Produces: `seedDatabase(client: PrismaClient): Promise<void>` and stable fictitious records keyed by natural unique values.

- [ ] **Step 1: Write the failing seed contract test**

Create `seed.test.ts` against the test client:

```ts
it("seeds twice without duplicating natural keys", async () => {
  await seedDatabase(database);
  const first = {
    roles: await database.rol.count(),
    technicians: await database.tecnico.count(),
    recurrences: await database.reincidencia.count(),
  };

  await seedDatabase(database);
  const second = {
    roles: await database.rol.count(),
    technicians: await database.tecnico.count(),
    recurrences: await database.reincidencia.count(),
  };

  expect(second).toEqual(first);
});

it("keeps demo users unable to authenticate", async () => {
  await seedDatabase(database);
  expect(await database.usuario.count({ where: { passwordHash: null } })).toBe(
    await database.usuario.count(),
  );
});
```

The test context must reject any URL whose `schema` is not `test`.

- [ ] **Step 2: Run the seed test and verify RED**

Run:

```powershell
cd server
npm run test:db -- tests/database/seed.test.ts
```

Expected: FAIL because `seedDatabase` and the database test context do not exist.

- [ ] **Step 3: Implement stable seed constants**

Use fixed UUIDs generated exclusively for this repository and natural codes:

```ts
export const seedCodes = {
  roles: ["ADMIN", "SUPERVISOR", "TECHNICIAN"],
  technicians: ["TEC-001", "TEC-002", "TEC-003"],
  clients: ["CLI-001", "CLI-002"],
  orders: ["GS-2026-0001", "GS-2026-0002", "GS-2026-0003"],
  kpiVersion: 1,
} as const;
```

Names, emails, telephone numbers and addresses must use clearly fictitious
values and reserved domains such as `example.test`.

- [ ] **Step 4: Seed catalogs and identity**

`catalogs.ts` upserts:

- 3 roles and a concrete permission matrix
- service types
- 9 approved activity types
- 8 recurrence causes
- example materials

`identity.ts` upserts pending users with `passwordHash: null`, assigns roles,
and never logs email-password pairs.

- [ ] **Step 5: Seed organization and operations**

`organization.ts` upserts:

- 3 technicians, at least one with `userId: null`
- 2 clients
- at least one branch per client
- contacts with only one principal per branch

`operations.ts` upserts:

- 3 work orders with different states
- unique primary/support assignments
- related order history
- activities with and without work order
- technician participation
- one completed pause
- material usage with exactly one target

Use the natural codes above to resolve foreign keys; do not rely on insertion
order-generated IDs.

- [ ] **Step 6: Seed quality and KPI foundations**

`quality.ts` upserts:

- one technical recurrence with one justified `affectsQuality: true`
- one equipment or third-party recurrence with `affectsQuality: false`
- related visits
- technician goals
- KPI configuration version `1` with `0.30`, `0.25`, `0.20`, `0.25`

Do not create calculated `ResultadoKPI` rows; real calculation is outside this
stage.

- [ ] **Step 7: Compose the entry point**

Export:

```ts
export async function seedDatabase(client: PrismaClient): Promise<void> {
  await client.$transaction(async (transaction) => {
    const catalogs = await seedCatalogs(transaction);
    const identity = await seedIdentity(transaction, catalogs);
    const organization = await seedOrganization(transaction, identity);
    const operations = await seedOperations(
      transaction,
      catalogs,
      identity,
      organization,
    );
    await seedQuality(
      transaction,
      catalogs,
      identity,
      organization,
      operations,
    );
  });
}
```

The executable branch creates a client from `env.DATABASE_URL`, invokes
`seedDatabase`, prints only aggregate counts, and disconnects in `finally`.

- [ ] **Step 8: Apply and verify seed**

After confirming `DATABASE_URL` targets `public`:

```powershell
cd server
npm run db:seed
npm run db:seed
npm run db:verify
npm run test:db -- tests/database/seed.test.ts
```

Expected: both seed runs succeed, counts remain stable, and all seed tests pass.

- [ ] **Step 9: Static checkpoint**

Run:

```powershell
cd server
npm run typecheck
npm run lint
git diff --check
```

Inspect seed files for real personal data, passwords, tokens, and connection
strings. Do not commit.

---

### Task 6: Database Constraint and Relation Integration Tests

**Files:**
- Create: `server/tests/database/database-test-context.ts`
- Create: `server/tests/database/constraints.test.ts`
- Create: `server/tests/database/relations.test.ts`
- Create: `server/vitest.database.config.ts`

**Interfaces:**
- Consumes: `DATABASE_TEST_URL`, generated Prisma Client, migrated test schema, and seed helpers.
- Produces: isolated integration coverage proving database-level integrity.

- [ ] **Step 1: Create a test-only database context**

The helper must:

```ts
const url = new URL(process.env.DATABASE_TEST_URL ?? "");
if (url.searchParams.get("schema") !== "test") {
  throw new Error("Las pruebas de base solo pueden usar el esquema test");
}
```

Export a Prisma client for that URL and helpers that create unique fixtures with
`crypto.randomUUID()`. `afterAll` must disconnect. No helper may reference
`env.DATABASE_URL`.

- [ ] **Step 2: Configure the database suite**

Create `vitest.database.config.ts` with:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/database/**/*.test.ts"],
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 20_000,
  },
});
```

- [ ] **Step 3: Write constraint tests**

Write concrete tests expecting Prisma rejection for:

- duplicate work order number
- second active primary technician on one order
- self-related work order
- evidence with zero or two targets
- material usage with zero or two targets
- second open pause for one activity
- negative quantities, costs, minutes, and file size
- invalid participation or scores
- KPI weights outside range or not summing to one
- quality impact without justification
- end timestamps before start timestamps

Each test creates only its own UUID fixtures and deletes only those exact rows
in `finally` when an insertion succeeds unexpectedly.

- [ ] **Step 4: Write relation tests**

Prove:

```ts
expect(await database.tecnico.count({ where: { userId: null } })).toBeGreaterThan(0);
expect(
  await database.reincidenciaTecnico.count({
    where: { affectsQuality: true },
  }),
).toBeGreaterThan(0);
expect(
  await database.reincidenciaTecnico.count({
    where: { affectsQuality: false },
  }),
).toBeGreaterThan(0);
```

Also verify client-through-branch, order participants, activities with and
without orders, recurrence visits, and KPI configuration weights.

- [ ] **Step 5: Prepare the isolated test schema**

Execute `create-test-schema.sql` against `"Sistema_kpiGS"`, then apply the same
migrations by temporarily providing `DATABASE_URL=$env:DATABASE_TEST_URL` only
for the command process. Never change the persisted development URL.

Run `prisma migrate deploy` and invoke `seedDatabase` with the test client.

- [ ] **Step 6: Run integration tests**

Run:

```powershell
cd server
npm run test:db
```

Expected: all database tests pass serially. Confirm from test output that the
schema is `test`.

- [ ] **Step 7: Full backend checkpoint**

Run:

```powershell
cd server
npm run db:validate
npm run db:generate
npm run typecheck
npm run lint
npm run test
npm run test:db
npm run build
npm audit --audit-level=moderate
git diff --check
```

Expected: every command exits `0`. Do not commit.

---

### Task 7: Documentation and Final Cross-Project Verification

**Files:**
- Modify: `README.md`
- Modify: `docs/architecture/current-state.md`
- Modify: `docs/plans/implementation-plan.md`
- Modify: `server/.env.example`

**Interfaces:**
- Consumes: verified commands, actual package versions, migration name, test counts, and database scripts.
- Produces: reproducible operator instructions and an accurate Stage 4 status.

- [ ] **Step 1: Document local PostgreSQL setup**

Add exact instructions:

1. Open pgAdmin Query Tool connected to `postgres`.
2. Execute `server/database/create-database.sql` once.
3. Connect to `"Sistema_kpiGS"` and execute `create-test-schema.sql`.
4. Copy `server/.env.example` to `server/.env`.
5. Replace only local `USER` and `PASSWORD`.
6. Run validation, migration, generation, and seed commands.
7. Run `db:verify`.

State clearly that `create-database.sql` is not idempotent and that an
already-existing database error does not mean tables were altered.

- [ ] **Step 2: Document migration and seed commands**

Document:

```powershell
cd server
npm run db:validate
npm run db:migrate
npm run db:generate
npm run db:seed
npm run db:verify
```

Add test-schema preparation and `npm run test:db`. Do not document `db push` or
destructive reset commands.

- [ ] **Step 3: Record actual architecture and limitations**

Update current-state documentation with:

- Prisma/PostgreSQL persistence now present
- exact model boundaries
- frontend still uses mocks
- no authentication or business CRUD yet
- seed users cannot log in
- KPI rows are foundations, not calculated results

Mark Stage 4 complete only after the migration, seed, database tests, frontend
tests, and backend tests have actually passed.

- [ ] **Step 4: Run final backend verification**

Run:

```powershell
cd server
npm run db:validate
npm run db:generate
npm run typecheck
npm run lint
npm run test
npm run test:db
npm run build
npm run db:verify
npx prisma migrate status
npm audit --audit-level=moderate
```

Record exact test counts and all warnings.

- [ ] **Step 5: Run final frontend verification**

Run from the repository root:

```powershell
npm run lint
npm run test -- --run
npm run build
npm audit --audit-level=moderate
```

Expected: existing frontend behavior remains unchanged.

- [ ] **Step 6: Security and diff review**

Run:

```powershell
rg -n --hidden --glob '!.git/**' --glob '!node_modules/**' --glob '!server/node_modules/**' --glob '!.env' "postgresql://[^U]|passwordHash\\s*[:=]\\s*[\"'][^\"']+|BEGIN .*PRIVATE KEY|sk-[A-Za-z0-9]{20,}" .
git diff --check
git status --short
```

Review every match manually. Expected: no real credentials, passwords, tokens,
private keys, personal data, generated client, or build output in versionable
changes.

- [ ] **Step 7: Final checkpoint**

Summarize:

- files created and modified
- migration applied
- seed counts
- backend/unit/database/frontend test counts
- audit results
- remaining warnings
- exact next stage: authentication and authorization

Do not commit or push. Ask for explicit authorization if the user wants the
changes committed.
