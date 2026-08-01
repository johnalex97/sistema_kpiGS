# Work Orders API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar los 17 endpoints protegidos de órdenes de trabajo con persistencia PostgreSQL, propiedad por técnico, control de concurrencia, historial y auditoría atómicos.

**Architecture:** El módulo seguirá `route → middleware → controller → service → repository → Prisma/PostgreSQL`. Lecturas, mutaciones administrativas y operaciones se separan en repositorios enfocados, mientras el servicio traduce resultados discriminados, aplica autorización contextual y entrega únicamente modelos públicos.

**Tech Stack:** Node.js 20+, TypeScript 6 estricto, Express 5, Prisma 7, PostgreSQL 18, Zod 4, Vitest 4 y Supertest.

## Global Constraints

- La base local se llama exactamente `Sistema_kpiGS`; las pruebas PostgreSQL usan exclusivamente `?schema=test`.
- No usar `prisma db push`; toda modificación persistente debe quedar en una migración incremental.
- No modificar migraciones aplicadas ni guardar contraseñas, cookies, tokens, hashes, sesiones o permisos en historial/auditoría.
- El frontend React y sus mocks no cambian en esta fase.
- El número de orden es inmutable y sigue `GS-AAAA-NNNN`, con año de `America/Tegucigalpa`.
- Toda mutación requiere sesión vigente, contraseña definitiva, `Origin` permitido y una versión positiva exacta.
- Una mutación válida incrementa `OrdenTrabajo.version` exactamente una vez y escribe historial y auditoría en la misma transacción.
- `COMPLETED` y `CANCELLED` son terminales; una orden cerrada solo admite la ruta auditada de ajustes.
- Un técnico principal puede tener muchas órdenes asignadas o pausadas, pero solo una en `ON_ROUTE` o `IN_PROGRESS`.
- Las duraciones de esta fase son minutos brutos; no se descuentan pausas.
- Fuente funcional: `docs/superpowers/specs/2026-08-01-work-orders-api-design.md`.

---

## File map

### Database and shared security

- Modify `server/prisma/seed/catalogs.ts`: permisos `ORDERS_VIEW_ALL` y `ORDERS_OPERATE_OWN`, y matriz por rol.
- Create `server/prisma/migrations/20260801170000_orders_api_constraints/migration.sql`: índices parciales para listado, propiedad, técnico ocupado e historial.
- Modify `server/src/middlewares/permission.middleware.ts`: autorización por cualquiera de varios permisos.
- Modify `server/tests/auth/authorization.test.ts`: contrato de `requireAnyPermission`.
- Modify `server/tests/database/schema-contract.test.ts`: índices de órdenes.
- Modify `server/tests/database/seed.test.ts`: permisos y asignaciones idempotentes.

### Orders domain

- Create `server/src/orders/orders.types.ts`: entradas, filtros, actores y respuestas públicas.
- Create `server/src/orders/orders.schemas.ts`: validación estricta y normalización HTTP.
- Create `server/src/orders/orders.state-machine.ts`: transiciones y cálculos puros.
- Create `server/src/orders/orders.mapper.ts`: conversión segura de registros persistentes.
- Create `server/src/orders/orders.repository.types.ts`: selects compartidos, registros, resultados discriminados e interfaz agregada.
- Create `server/src/orders/orders.read.repository.ts`: búsqueda, detalle, historial y propiedad de lectura.
- Create `server/src/orders/orders.mutation.repository.ts`: numeración, creación, edición y asignaciones.
- Create `server/src/orders/orders.operation.repository.ts`: estados, materiales, ajustes, bloqueos e historial/auditoría.
- Create `server/src/orders/orders.service.ts`: autorización contextual y traducción a `ApiError`.
- Create `server/src/orders/orders.controller.ts`: adaptación HTTP.
- Create `server/src/orders/orders.routes.ts`: composición de repositorios, seguridad y 17 rutas.
- Modify `server/src/routes/index.ts`: montar `/orders`.

### Tests and documentation

- Create `server/tests/orders/orders-schemas.test.ts`.
- Create `server/tests/orders/orders-state-machine.test.ts`.
- Create `server/tests/orders/orders-mapper.test.ts`.
- Create `server/tests/orders/orders-service.test.ts`.
- Create `server/tests/orders/orders-http.test.ts`.
- Create `server/tests/database/orders-test-data.ts`: fixtures aisladas y reutilizables.
- Create `server/tests/database/orders-read-persistence.test.ts`.
- Create `server/tests/database/orders-mutation-persistence.test.ts`.
- Create `server/tests/database/orders-operation-persistence.test.ts`.
- Modify `server/database/verify-database.sql`: comprobar permisos, índices y conteos.
- Modify `README.md`: documentar rutas, permisos, estados y comandos de prueba.
- Modify `docs/architecture/current-state.md`: registrar la API de órdenes como capacidad persistente.

---

### Task 1: Database indexes, permissions, and multi-permission middleware

**Files:**
- Create: `server/prisma/migrations/20260801170000_orders_api_constraints/migration.sql`
- Modify: `server/prisma/seed/catalogs.ts`
- Modify: `server/src/middlewares/permission.middleware.ts`
- Modify: `server/tests/auth/authorization.test.ts`
- Modify: `server/tests/database/schema-contract.test.ts`
- Modify: `server/tests/database/seed.test.ts`

**Interfaces:**
- Produces: `requireAnyPermission(...codes: readonly string[]): RequestHandler`.
- Produces: permisos `ORDERS_VIEW_ALL`, `ORDERS_MANAGE`, `ORDERS_VIEW_OWN`, `ORDERS_OPERATE_OWN`.
- Produces: índices `idx_order_open_schedule`, `idx_order_technician_visibility`, `idx_order_active_primary` y `idx_order_history_page`.

- [ ] **Step 1: Write failing middleware, schema, and seed tests**

Add cases with these exact assertions:

```ts
expect(requireAnyPermission("ORDERS_MANAGE", "ORDERS_OPERATE_OWN"))
  .toBeTypeOf("function");

expect(response.status).toBe(403);
expect(response.body.errors[0].code).toBe("FORBIDDEN");
```

The authorization test must prove that either listed permission calls `next`, no listed permission yields 403, and an absent principal also yields 403. The database tests must query `pg_indexes` for all four index names, run the seed twice, and assert:

```ts
expect(supervisorPermissions).toEqual(
  expect.arrayContaining(["ORDERS_VIEW_ALL", "ORDERS_MANAGE"]),
);
expect(technicianPermissions).toEqual(
  expect.arrayContaining(["ORDERS_VIEW_OWN", "ORDERS_OPERATE_OWN"]),
);
```

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```powershell
Set-Location server
npm test -- tests/auth/authorization.test.ts
npm run test:db -- tests/database/schema-contract.test.ts tests/database/seed.test.ts
```

Expected: unit failure because `requireAnyPermission` does not exist; database failures because permissions and indexes do not exist.

- [ ] **Step 3: Add the incremental indexes**

Create the migration with these statements:

```sql
CREATE INDEX "idx_order_open_schedule"
ON "orden_trabajo" ("scheduled_for", "created_at" DESC, "id")
WHERE "deleted_at" IS NULL
  AND "status" NOT IN ('completed', 'cancelled');

CREATE INDEX "idx_order_technician_visibility"
ON "orden_tecnico" ("tecnico_id", "orden_id", "assigned_at" DESC);

CREATE INDEX "idx_order_active_primary"
ON "orden_tecnico" ("tecnico_id", "orden_id")
WHERE "role" = 'primary' AND "unassigned_at" IS NULL;

CREATE INDEX "idx_order_history_page"
ON "historial_orden" ("orden_id", "occurred_at" DESC, "id" DESC);
```

Do not duplicate the already-applied `uq_orden_tecnico_principal_activo` or `ck_material_destino_exclusivo`.

- [ ] **Step 4: Add idempotent permission data**

Extend `permissionData` with:

```ts
{ code: "ORDERS_VIEW_ALL", resource: "orders", action: "view_all" },
{ code: "ORDERS_OPERATE_OWN", resource: "orders", action: "operate_own" },
```

Assign `ORDERS_VIEW_ALL` and `ORDERS_MANAGE` to SUPERVISOR; assign `ORDERS_VIEW_OWN` and `ORDERS_OPERATE_OWN` to TECHNICIAN. ADMIN continues receiving `permissionData.map(...)`.

- [ ] **Step 5: Implement `requireAnyPermission`**

```ts
export function requireAnyPermission(
  ...codes: readonly string[]
): RequestHandler {
  return (request, _response, next) => {
    const granted = request.auth?.permissions ?? [];
    if (!codes.some((code) => granted.includes(code))) {
      next(new ApiError(
        403,
        "No tiene permiso para realizar esta acción",
        "FORBIDDEN",
      ));
      return;
    }
    next();
  };
}
```

- [ ] **Step 6: Apply and verify both schemas**

Run:

```powershell
Set-Location server
npx prisma migrate deploy
$ordersPublicDatabaseUrl = $env:DATABASE_URL
$env:DATABASE_URL=$env:DATABASE_TEST_URL
npx prisma migrate deploy
$env:DATABASE_URL=$ordersPublicDatabaseUrl
npm run db:generate
npm run db:seed
npm run db:seed
npm test -- tests/auth/authorization.test.ts
npm run test:db -- tests/database/schema-contract.test.ts tests/database/seed.test.ts
```

Expected: all focused tests pass and the second seed adds no duplicate role-permission rows.

- [ ] **Step 7: Commit**

```bash
git add server/prisma/migrations/20260801170000_orders_api_constraints/migration.sql server/prisma/seed/catalogs.ts server/src/middlewares/permission.middleware.ts server/tests/auth/authorization.test.ts server/tests/database/schema-contract.test.ts server/tests/database/seed.test.ts
git commit -m "feat(orders): add permissions and database indexes"
```

---

### Task 2: Public contracts, schemas, and pure state machine

**Files:**
- Create: `server/src/orders/orders.types.ts`
- Create: `server/src/orders/orders.schemas.ts`
- Create: `server/src/orders/orders.state-machine.ts`
- Create: `server/tests/orders/orders-schemas.test.ts`
- Create: `server/tests/orders/orders-state-machine.test.ts`

**Interfaces:**
- Produces: `OrderActorContext`, `OrderAccessScope`, all command input and public response types.
- Produces: schemas `orderIdSchema`, `assignmentParamsSchema`, `materialParamsSchema`, `orderListQuerySchema`, `historyQuerySchema`, `createOrderSchema`, `updateOrderSchema`, `assignmentSchema`, `unassignmentSchema`, `versionCommandSchema`, `pauseOrderSchema`, `completeOrderSchema`, `cancelOrderSchema`, `addMaterialSchema`, `updateMaterialSchema`, `removeMaterialSchema`, `adjustOrderSchema`.
- Produces: `transitionOrder(status, command)`, `calculateGrossMinutes(startedAt, endedAt)`, `isOrderOverdue(...)`.

- [ ] **Step 1: Define the exact public contracts**

Use Prisma enum types and these input boundaries:

```ts
export type OrderCommand =
  | "ON_ROUTE"
  | "START"
  | "PAUSE"
  | "RESUME"
  | "COMPLETE"
  | "CANCEL";

export interface OrderActorContext {
  userId: string;
  technicianId: string | null;
  permissions: readonly string[];
  requestId: string;
  ipAddress: string | null;
  userAgent: string | null;
}

export type OrderAccessScope =
  | { kind: "ALL" }
  | { kind: "TECHNICIAN"; technicianId: string };

export interface VersionInput { version: number }
export interface CreateOrderInput {
  branchId: string;
  serviceTypeId: string;
  priority: PrioridadOrden;
  reportedProblem: string;
  description?: string | null;
  scheduledFor?: Date | null;
  estimatedMinutes?: number | null;
}
export interface AssignmentInput extends VersionInput {
  technicianId: string;
  role: RolOrdenTecnico;
}
export interface CompleteOrderInput extends VersionInput {
  diagnosis: string;
  result: string;
}
export interface MaterialInput extends VersionInput {
  materialId: string;
  quantity: string;
  observation?: string | null;
}
```

Complete the input and query contracts without implicit fields:

```ts
export interface UpdateOrderInput extends VersionInput {
  branchId?: string;
  serviceTypeId?: string;
  priority?: PrioridadOrden;
  reportedProblem?: string;
  description?: string | null;
  scheduledFor?: Date | null;
  estimatedMinutes?: number | null;
}
export interface UnassignmentInput extends VersionInput { reason: string }
export interface PauseOrderInput extends VersionInput { comment: string }
export interface CancelOrderInput extends VersionInput {
  cancellationReason: string;
}
export interface UpdateMaterialInput extends VersionInput {
  quantity?: string;
  observation?: string | null;
}
export type RemoveMaterialInput = VersionInput;
export interface AdjustOrderInput extends VersionInput {
  reason: string;
  description?: string | null;
  scheduledFor?: Date | null;
  startedAt?: Date | null;
  endedAt?: Date | null;
  diagnosis?: string | null;
  result?: string | null;
  cancellationReason?: string | null;
  estimatedMinutes?: number | null;
}
export interface OrderListFilters {
  search?: string;
  clientId?: string;
  branchId?: string;
  technicianId?: string;
  serviceTypeId?: string;
  status?: EstadoOrden[];
  priority?: PrioridadOrden[];
  scheduledFrom?: Date;
  scheduledTo?: Date;
  overdue?: boolean;
  page: number;
  pageSize: number;
}
export interface HistoryFilters { page: number; pageSize: number }
export interface Pagination {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}
export interface PaginatedResult<T> {
  items: T[];
  pagination: Pagination;
}
```

Define the public response shapes exactly:

```ts
export interface PublicOrderTechnician {
  id: string;
  code: string;
  fullName: string;
}
export interface PublicOrderParticipant extends PublicOrderTechnician {
  role: RolOrdenTecnico;
  assignedAt: string;
  unassignedAt: string | null;
  active: boolean;
}
export interface PublicOrderMaterial {
  id: string;
  material: { id: string; code: string; name: string; unit: string };
  quantity: string;
  historicalUnitCost: string;
  observation: string | null;
  createdAt: string;
}
export interface PublicOrderSummary {
  id: string;
  orderNumber: string;
  client: { id: string; code: string; tradeName: string };
  branch: { id: string; code: string; name: string };
  serviceType: { id: string; code: string; name: string };
  priority: PrioridadOrden;
  status: EstadoOrden;
  reportedProblem: string;
  scheduledFor: string | null;
  primaryTechnician: PublicOrderTechnician | null;
  supportCount: number;
  overdue: boolean;
  startedAt: string | null;
  endedAt: string | null;
  estimatedMinutes: number | null;
  totalMinutes: number | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}
export interface PublicOrderDetail extends PublicOrderSummary {
  description: string | null;
  diagnosis: string | null;
  result: string | null;
  cancellationReason: string | null;
  participants: PublicOrderParticipant[];
  materials: PublicOrderMaterial[];
}
export interface PublicOrderHistory {
  id: string;
  previousStatus: EstadoOrden | null;
  newStatus: EstadoOrden | null;
  action: string;
  comment: string | null;
  occurredAt: string;
  user: { id: string; displayName: string } | null;
  metadata: Record<string, unknown> | null;
}
```

- [ ] **Step 2: Write failing schema tests**

Cover strict-object rejection, defaults and normalization:

```ts
expect(createOrderSchema.parse({
  branchId,
  serviceTypeId,
  reportedProblem: "  Falla de enlace  ",
}).priority).toBe("MEDIUM");

expect(createOrderSchema.parse({
  branchId,
  serviceTypeId,
  reportedProblem: "Falla",
  description: "   ",
}).description).toBeNull();

expect(() => pauseOrderSchema.parse({ version: 2, comment: "corto" }))
  .toThrow();
expect(() => addMaterialSchema.parse({
  version: 2,
  materialId,
  quantity: "1.0001",
})).toThrow();
```

Test repeated query keys for `status` and `priority`, ISO date transformation to `Date`, `pageSize <= 100`, `estimatedMinutes <= 10080`, diagnosis/result lengths, cancellation/adjustment reasons, positive version, and at least one adjustment field.

- [ ] **Step 3: Write failing state-machine tests**

Express the complete matrix:

```ts
expect(transitionOrder("ASSIGNED", "ON_ROUTE")).toBe("ON_ROUTE");
expect(transitionOrder("ASSIGNED", "START")).toBe("IN_PROGRESS");
expect(transitionOrder("ON_ROUTE", "START")).toBe("IN_PROGRESS");
expect(transitionOrder("IN_PROGRESS", "PAUSE")).toBe("PAUSED");
expect(transitionOrder("PAUSED", "RESUME")).toBe("IN_PROGRESS");
expect(transitionOrder("IN_PROGRESS", "COMPLETE")).toBe("COMPLETED");
expect(transitionOrder("COMPLETED", "START")).toBeNull();
expect(calculateGrossMinutes(
  new Date("2026-08-01T14:00:00Z"),
  new Date("2026-08-01T15:30:59Z"),
)).toBe(90);
```

Test cancel from every open state, reject cancel from both terminal states, overdue only for scheduled open orders, and throw/reject negative temporal intervals.

- [ ] **Step 4: Implement strict schemas**

Use shared helpers `normalizeOptionalString`, `nullableTrimmed(max)`, `positiveVersion`, `isoDateOrNull`, and a decimal refinement matching `/^(?:0|[1-9]\d*)(?:\.\d{1,3})?$/`. All exported object schemas must call `.strict()`; update schemas must reject an empty patch.

For array-like query values, accept a single string or an array and normalize to unique enum arrays:

```ts
const repeated = <T extends z.ZodTypeAny>(item: T) =>
  z.union([item, z.array(item)])
    .transform((value) => [...new Set(Array.isArray(value) ? value : [value])]);
```

- [ ] **Step 5: Implement pure state helpers**

```ts
const transitions: Record<OrderCommand, Partial<Record<EstadoOrden, EstadoOrden>>> = {
  ON_ROUTE: { ASSIGNED: "ON_ROUTE" },
  START: { ASSIGNED: "IN_PROGRESS", ON_ROUTE: "IN_PROGRESS" },
  PAUSE: { IN_PROGRESS: "PAUSED" },
  RESUME: { PAUSED: "IN_PROGRESS" },
  COMPLETE: { IN_PROGRESS: "COMPLETED" },
  CANCEL: {
    PENDING: "CANCELLED",
    ASSIGNED: "CANCELLED",
    ON_ROUTE: "CANCELLED",
    IN_PROGRESS: "CANCELLED",
    PAUSED: "CANCELLED",
  },
};
```

`calculateGrossMinutes` returns `Math.floor((endedAt.getTime() - startedAt.getTime()) / 60_000)` and rejects `endedAt < startedAt`. `isOrderOverdue` requires a non-null schedule, an open status, and `scheduledFor < now`.

- [ ] **Step 6: Verify and commit**

```powershell
Set-Location server
npm test -- tests/orders/orders-schemas.test.ts tests/orders/orders-state-machine.test.ts
npm run typecheck
npm run lint
```

Expected: all commands exit 0.

```bash
git add server/src/orders/orders.types.ts server/src/orders/orders.schemas.ts server/src/orders/orders.state-machine.ts server/tests/orders/orders-schemas.test.ts server/tests/orders/orders-state-machine.test.ts
git commit -m "feat(orders): define contracts and state machine"
```

---

### Task 3: Repository contracts, safe mapping, and scoped reads

**Files:**
- Create: `server/src/orders/orders.repository.types.ts`
- Create: `server/src/orders/orders.mapper.ts`
- Create: `server/src/orders/orders.read.repository.ts`
- Create: `server/tests/orders/orders-mapper.test.ts`
- Create: `server/tests/database/orders-test-data.ts`
- Create: `server/tests/database/orders-read-persistence.test.ts`

**Interfaces:**
- Consumes: `OrderAccessScope`, `OrderListFilters`, `HistoryFilters`, public types and `isOrderOverdue`.
- Produces: `orderSummarySelect`, `orderDetailSelect`, `OrderSummaryRecord`, `OrderDetailRecord`, `OrderHistoryRecord`.
- Produces: `OrdersReadRepository.listOrders(filters, scope, now)`, `findOrderById(id, scope)`, `listOrderHistory(id, filters, scope)`.
- Produces: `mapPublicOrderSummary(record, now)`, `mapPublicOrderDetail(record, now)`, `mapPublicOrderHistory(record)`.

- [ ] **Step 1: Define repository payloads and discriminated results**

The shared repository contract must include:

```ts
export interface PageRecord<T> {
  items: T[];
  totalItems: number;
}

export interface OrdersReadRepository {
  listOrders(
    filters: OrderListFilters,
    scope: OrderAccessScope,
    now: Date,
  ): Promise<PageRecord<OrderSummaryRecord>>;
  findOrderById(
    id: string,
    scope: OrderAccessScope,
  ): Promise<OrderDetailRecord | null>;
  listOrderHistory(
    id: string,
    filters: HistoryFilters,
    scope: OrderAccessScope,
  ): Promise<PageRecord<OrderHistoryRecord> | null>;
}
```

Define `OrderFailureKind` exactly as:

```ts
export type OrderFailureKind =
  | "ORDER_NOT_FOUND"
  | "ASSIGNMENT_NOT_FOUND"
  | "MATERIAL_USAGE_NOT_FOUND"
  | "MATERIAL_NOT_FOUND"
  | "VERSION_CONFLICT"
  | "INVALID_ORDER_TRANSITION"
  | "PRIMARY_TECHNICIAN_REQUIRED"
  | "TECHNICIAN_NOT_ASSIGNED"
  | "TECHNICIAN_BUSY"
  | "RESOURCE_INACTIVE"
  | "ORDER_CLOSED"
  | "MATERIAL_COST_UNAVAILABLE";
```

Define the success union and the complete repository boundaries in the same
file so later tasks use identical signatures:

```ts
export type OrderMutationResult =
  | { kind: "CREATED" | "UPDATED"; order: OrderDetailRecord }
  | { kind: OrderFailureKind };

export interface OrdersMutationRepository {
  createOrder(input: CreateOrderInput, actor: OrderActorContext, now: Date): Promise<OrderMutationResult>;
  updateOrder(id: string, input: UpdateOrderInput, actor: OrderActorContext, now: Date): Promise<OrderMutationResult>;
  assignTechnician(id: string, input: AssignmentInput, actor: OrderActorContext, now: Date): Promise<OrderMutationResult>;
  unassignTechnician(id: string, technicianId: string, input: UnassignmentInput, actor: OrderActorContext, now: Date): Promise<OrderMutationResult>;
}

export interface OrdersOperationRepository {
  moveOnRoute(id: string, input: VersionInput, actor: OrderActorContext, now: Date): Promise<OrderMutationResult>;
  startOrder(id: string, input: VersionInput, actor: OrderActorContext, now: Date): Promise<OrderMutationResult>;
  pauseOrder(id: string, input: PauseOrderInput, actor: OrderActorContext, now: Date): Promise<OrderMutationResult>;
  resumeOrder(id: string, input: VersionInput, actor: OrderActorContext, now: Date): Promise<OrderMutationResult>;
  completeOrder(id: string, input: CompleteOrderInput, actor: OrderActorContext, now: Date): Promise<OrderMutationResult>;
  cancelOrder(id: string, input: CancelOrderInput, actor: OrderActorContext, now: Date): Promise<OrderMutationResult>;
  addOrderMaterial(id: string, input: MaterialInput, actor: OrderActorContext, now: Date): Promise<OrderMutationResult>;
  updateOrderMaterial(id: string, usageId: string, input: UpdateMaterialInput, actor: OrderActorContext, now: Date): Promise<OrderMutationResult>;
  removeOrderMaterial(id: string, usageId: string, input: RemoveMaterialInput, actor: OrderActorContext, now: Date): Promise<OrderMutationResult>;
  adjustClosedOrder(id: string, input: AdjustOrderInput, actor: OrderActorContext, now: Date): Promise<OrderMutationResult>;
}

export type OrdersRepository =
  & OrdersReadRepository
  & OrdersMutationRepository
  & OrdersOperationRepository;
```

- [ ] **Step 2: Write mapper tests before mapping code**

Use explicit fixtures with Prisma `Decimal` and dates. Assert ISO output, decimal strings, current and historical participants, support count, computed `overdue`, and absence of `deletedAt`, `passwordHash`, `permissions`, `sessions` and raw Prisma relation names.

```ts
const result = mapPublicOrderDetail(record, now);
expect(result.materials[0]).toMatchObject({
  quantity: "12.500",
  historicalUnitCost: "25.00",
});
expect(result).not.toHaveProperty("deletedAt");
```

- [ ] **Step 3: Implement selects and mappers**

`orderSummarySelect` must select order public fields, branch with client identity, service type, active PRIMARY technician, and active SUPPORT count. `orderDetailSelect` adds description, diagnosis, result, cancellation, all assignment rows with technician public identity, and order materials with material code/name/unit. Never select user hashes, sessions, roles or permissions.

- [ ] **Step 4: Write failing PostgreSQL read tests**

Seed isolated orders with two technicians and assert:

```ts
expect(allPage.totalItems).toBe(3);
expect(ownPage.items.map((item) => item.id)).toEqual(
  expect.arrayContaining([activeOrderId, historicalOrderId]),
);
expect(otherPage.items).toHaveLength(0);
```

Cover search by order number/problem/client/branch, every ID filter, repeated status/priority, schedule range, overdue, stable null-last order, pagination, soft-delete exclusion, detail ownership and paginated history ownership.

- [ ] **Step 5: Implement scoped reads**

For technician scope, apply:

```ts
tecnicos: { some: { tecnicoId: scope.technicianId } }
```

Do not filter by `unassignedAt` because historical participants retain visibility. Use Prisma's exact stable ordering:

```ts
orderBy: [
  { scheduledFor: { sort: "asc", nulls: "last" } },
  { createdAt: "desc" },
  { id: "asc" },
]
```

A missing or unauthorized detail/history returns `null`, preventing existence disclosure.

- [ ] **Step 6: Verify and commit**

```powershell
Set-Location server
npm test -- tests/orders/orders-mapper.test.ts
npm run test:db -- tests/database/orders-read-persistence.test.ts
npm run typecheck
```

```bash
git add server/src/orders/orders.repository.types.ts server/src/orders/orders.mapper.ts server/src/orders/orders.read.repository.ts server/tests/orders/orders-mapper.test.ts server/tests/database/orders-test-data.ts server/tests/database/orders-read-persistence.test.ts
git commit -m "feat(orders): add scoped order queries"
```

---

### Task 4: Atomic order creation and administrative editing

**Files:**
- Modify: `server/src/orders/orders.repository.types.ts`
- Create: `server/src/orders/orders.mutation.repository.ts`
- Create: `server/tests/database/orders-mutation-persistence.test.ts`

**Interfaces:**
- Consumes: `CreateOrderInput`, `UpdateOrderInput`, `OrderActorContext`, `OrderDetailRecord`.
- Produces: `OrdersMutationRepository.createOrder(input, actor, now)` and `updateOrder(id, input, actor, now)`.
- Produces result: `{ kind: "CREATED" | "UPDATED"; order: OrderDetailRecord } | { kind: OrderFailureKind }`.

- [ ] **Step 1: Write failing creation tests**

Test active parent validation, inactive client/branch/service rejection, version 1, PENDING status, no participants, and audit/history atomicity:

```ts
expect(result.kind).toBe("CREATED");
if (result.kind === "CREATED") {
  expect(result.order).toMatchObject({
    orderNumber: "GS-2026-0004",
    status: "PENDING",
    version: 1,
  });
}
expect(await historyActions(orderId)).toContain("ORDER_CREATED");
expect(await auditActions(orderId)).toContain("ORDER_CREATED");
```

Run two creations concurrently and assert two distinct sequential numbers. Force history insertion to fail inside a test transaction and assert no order remains.

- [ ] **Step 2: Verify creation tests are RED**

```powershell
Set-Location server
npm run test:db -- tests/database/orders-mutation-persistence.test.ts
```

Expected: failure because `createOrdersMutationRepository` is absent.

- [ ] **Step 3: Implement annual numbering and creation**

Inside one serializable transaction:

```ts
const year = Number(
  new Intl.DateTimeFormat("en", {
    timeZone: "America/Tegucigalpa",
    year: "numeric",
  }).format(now),
);
await tx.$executeRaw`SELECT pg_advisory_xact_lock(1196575044, ${year})`;
```

Read only values matching `^GS-<year>-[0-9]+$`, parse the maximum numeric suffix, and format the next value with `padStart(4, "0")`. Validate `Cliente.isActive/deletedAt`, `SucursalCliente.isActive/deletedAt`, and `TipoServicio.isActive/deletedAt` before insert. Add `HistorialOrden(action="ORDER_CREATED")` and `Auditoria(action="ORDER_CREATED", entity="OrdenTrabajo")` with the actor request metadata.

- [ ] **Step 4: Write failing administrative edit tests**

Cover exact state-dependent fields:

```ts
expect(await update(pendingId, {
  version: 1,
  branchId: otherActiveBranchId,
})).toMatchObject({ kind: "UPDATED" });

expect(await update(assignedId, {
  version: 2,
  branchId: otherActiveBranchId,
})).toEqual({ kind: "INVALID_ORDER_TRANSITION" });
```

Also test allowed ASSIGNED priority/problem/description/schedule/estimate edits, all edits rejected from ON_ROUTE onward, exact version conflict, inactive replacement parents, empty patch rejected by Zod, one version increment, `ORDER_UPDATED` history and redacted audit.

- [ ] **Step 5: Implement locked editing**

Use `SELECT ... FOR UPDATE`, compare version before any mutation, derive allowed keys from current state, revalidate a changed branch/service, and finish with:

```ts
const changed = await tx.ordenTrabajo.updateMany({
  where: { id, version: input.version },
  data: { ...patch, version: { increment: 1 } },
});
if (changed.count !== 1) return { kind: "VERSION_CONFLICT" } as const;
```

Write history/audit in the same transaction and re-read with `orderDetailSelect`.

- [ ] **Step 6: Verify and commit**

```powershell
Set-Location server
npm run test:db -- tests/database/orders-mutation-persistence.test.ts
npm run typecheck
npm run lint
```

```bash
git add server/src/orders/orders.repository.types.ts server/src/orders/orders.mutation.repository.ts server/tests/database/orders-mutation-persistence.test.ts
git commit -m "feat(orders): create and edit work orders"
```

---

### Task 5: Primary and support assignments

**Files:**
- Modify: `server/src/orders/orders.repository.types.ts`
- Modify: `server/src/orders/orders.mutation.repository.ts`
- Modify: `server/tests/database/orders-mutation-persistence.test.ts`

**Interfaces:**
- Produces: `assignTechnician(orderId, input, actor, now)`.
- Produces: `unassignTechnician(orderId, technicianId, input, actor, now)`.
- Both return `OrderMutationResult` and re-read `OrderDetailRecord`.

- [ ] **Step 1: Write failing assignment lifecycle tests**

Cover:

```ts
expect(await assign(orderId, primaryInput)).toMatchObject({
  kind: "UPDATED",
  order: { status: "ASSIGNED", version: 2 },
});
expect(await assign(orderId, supportInput)).toMatchObject({
  kind: "UPDATED",
  order: { status: "ASSIGNED", version: 3 },
});
```

Test supports before primary leave PENDING; inactive/deleted technicians yield `RESOURCE_INACTIVE`; second PRIMARY in ASSIGNED atomically retires the first; removing PRIMARY returns ASSIGNED to PENDING; support removal does not change status; removed rows can reactivate with refreshed role/timestamps; assignment changes are rejected once ON_ROUTE except support add/remove until closure; closed orders reject all assignment changes.

- [ ] **Step 2: Implement locked assignment**

Within one transaction lock the order and technician, check exact version, and use the existing unique `(ordenId, tecnicoId)` row:

```ts
await tx.ordenTecnico.upsert({
  where: { ordenId_tecnicoId: { ordenId: orderId, tecnicoId: input.technicianId } },
  create: {
    ordenId: orderId,
    tecnicoId: input.technicianId,
    role: input.role,
    assignedAt: now,
    assignedById: actor.userId,
  },
  update: {
    role: input.role,
    assignedAt: now,
    assignedById: actor.userId,
    unassignedAt: null,
  },
});
```

When assigning PRIMARY in ASSIGNED, retire any other active PRIMARY first. Increment the order version once, not once per child row. Use `ORDER_ASSIGNED` or `ORDER_PRIMARY_REPLACED` with technician IDs and roles in metadata.

- [ ] **Step 3: Implement unassignment**

Require a 10–500 character reason from the schema, locate the nested assignment by both order and technician, and set `unassignedAt=now`. Reject PRIMARY retirement outside PENDING/ASSIGNED. If the active PRIMARY is removed from ASSIGNED, set order status PENDING in the same single version update. Record `ORDER_UNASSIGNED`.

- [ ] **Step 4: Prove database constraints and concurrency**

Run two PRIMARY assignments against the same version and assert one succeeds, one returns `VERSION_CONFLICT`, and exactly one active PRIMARY remains. Assert a forced audit failure rolls back assignment, status and version.

- [ ] **Step 5: Verify and commit**

```powershell
Set-Location server
npm run test:db -- tests/database/orders-mutation-persistence.test.ts
npm run typecheck
```

```bash
git add server/src/orders/orders.repository.types.ts server/src/orders/orders.mutation.repository.ts server/tests/database/orders-mutation-persistence.test.ts
git commit -m "feat(orders): manage technician assignments"
```

---

### Task 6: Operational transitions and technician overlap prevention

**Files:**
- Modify: `server/src/orders/orders.repository.types.ts`
- Create: `server/src/orders/orders.operation.repository.ts`
- Create: `server/tests/database/orders-operation-persistence.test.ts`

**Interfaces:**
- Produces: `moveOnRoute(orderId, input, actor, now)`.
- Produces: `startOrder(orderId, input, actor, now)`.
- Produces: `pauseOrder(orderId, input, actor, now)`.
- Produces: `resumeOrder(orderId, input, actor, now)`.
- Each returns `OrderMutationResult`.

- [ ] **Step 1: Write failing transition and ownership tests**

Test the normal paths:

```ts
expect(await onRoute(assignedId, { version: 2 }, primaryActor))
  .toMatchObject({ kind: "UPDATED", order: { status: "ON_ROUTE", version: 3 } });
expect(await start(assignedRemoteId, { version: 2 }, primaryActor))
  .toMatchObject({
    kind: "UPDATED",
    order: { status: "IN_PROGRESS", version: 3 },
  });
```

Cover ON_ROUTE→IN_PROGRESS, IN_PROGRESS→PAUSED with comment, PAUSED→IN_PROGRESS, invalid states, no primary, SUPPORT actor, unrelated actor, actor without linked technician, stale version, unchanged original `startedAt` after resume, and all four history/audit actions.

- [ ] **Step 2: Write failing overlap tests**

Create two ASSIGNED orders for one PRIMARY. Assert:

```ts
expect(await start(firstId, { version: 2 }, actor)).toMatchObject({
  kind: "UPDATED",
});
expect(await start(secondId, { version: 2 }, actor)).toEqual({
  kind: "TECHNICIAN_BUSY",
});
```

Pause the first and start the second successfully; then assert resuming the first yields `TECHNICIAN_BUSY`. Run two starts concurrently and prove only one reaches an operational state.

- [ ] **Step 3: Implement a shared locked transition runner**

Create a private helper with this shape:

```ts
async function runTransition(
  orderId: string,
  expectedVersion: number,
  command: "ON_ROUTE" | "START" | "PAUSE" | "RESUME",
  actor: OrderActorContext,
  now: Date,
  comment?: string,
): Promise<OrderMutationResult>
```

Inside the transaction: lock order; verify version and state via `transitionOrder`; load active PRIMARY; verify `actor.technicianId === primary.tecnicoId`; lock the technician row; for ON_ROUTE/START/RESUME acquire `pg_advisory_xact_lock(hashtextextended(technicianId, 0))`; query another active PRIMARY assignment whose order is ON_ROUTE/IN_PROGRESS; apply timestamps/status; update version once; write history/audit; re-read detail.

- [ ] **Step 4: Preserve temporal rules**

`START` sets `startedAt=now` only when null. `PAUSE` leaves it intact and uses the required comment in history. `RESUME` never replaces it. No operational transition writes `endedAt` or `totalMinutes`.

- [ ] **Step 5: Verify and commit**

```powershell
Set-Location server
npm run test:db -- tests/database/orders-operation-persistence.test.ts
npm run typecheck
npm run lint
```

```bash
git add server/src/orders/orders.repository.types.ts server/src/orders/orders.operation.repository.ts server/tests/database/orders-operation-persistence.test.ts
git commit -m "feat(orders): operate assigned work safely"
```

---

### Task 7: Completion and cancellation

**Files:**
- Modify: `server/src/orders/orders.repository.types.ts`
- Modify: `server/src/orders/orders.operation.repository.ts`
- Modify: `server/tests/database/orders-operation-persistence.test.ts`

**Interfaces:**
- Produces: `completeOrder(orderId, input, actor, now)`.
- Produces: `cancelOrder(orderId, input, actor, now)`.
- Completion is owned by PRIMARY; cancellation is administrative and does not check technician ownership.

- [ ] **Step 1: Write failing completion tests**

Assert that only IN_PROGRESS with PRIMARY ownership and existing `startedAt` completes:

```ts
expect(await complete(orderId, {
  version: 4,
  diagnosis: "Conector principal dañado",
  result: "Conector reemplazado y enlace estable",
}, primaryActor, endedAt)).toMatchObject({
  kind: "UPDATED",
  order: {
    status: "COMPLETED",
    totalMinutes: 90,
    version: 5,
  },
});
```

Reject SUPPORT/unrelated actors, invalid state, missing start, stale version and second completion. Verify diagnosis/result persistence, server-owned `endedAt`, `ORDER_COMPLETED`, and atomic audit.

- [ ] **Step 2: Implement completion**

Reuse the transition/ownership lock path. Set `status=COMPLETED`, `endedAt=now`, diagnosis, result and `totalMinutes=calculateGrossMinutes(startedAt, now)`; increment once and record previous/new states.

- [ ] **Step 3: Write failing cancellation tests**

Test ADMIN/SUPERVISOR repository calls from PENDING, ASSIGNED, ON_ROUTE, IN_PROGRESS and PAUSED. For pre-start cancellation assert `endedAt=null` and `totalMinutes=null`; for post-start cancellation assert server time and gross minutes. Reject COMPLETED/CANCELLED, short reason and stale version.

- [ ] **Step 4: Implement cancellation**

```ts
const endedAt = order.startedAt === null ? null : now;
const totalMinutes =
  order.startedAt === null ? null : calculateGrossMinutes(order.startedAt, now);
```

Set status CANCELLED and `cancellationReason`; do not retire participant history. Record `ORDER_CANCELLED` atomically.

- [ ] **Step 5: Verify and commit**

```powershell
Set-Location server
npm run test:db -- tests/database/orders-operation-persistence.test.ts
npm run typecheck
```

```bash
git add server/src/orders/orders.repository.types.ts server/src/orders/orders.operation.repository.ts server/tests/database/orders-operation-persistence.test.ts
git commit -m "feat(orders): complete and cancel work orders"
```

---

### Task 8: Order material usage with historical costs

**Files:**
- Modify: `server/src/orders/orders.repository.types.ts`
- Modify: `server/src/orders/orders.operation.repository.ts`
- Modify: `server/tests/database/orders-operation-persistence.test.ts`

**Interfaces:**
- Produces: `addOrderMaterial(orderId, input, actor, now)`.
- Produces: `updateOrderMaterial(orderId, usageId, input, actor, now)`.
- Produces: `removeOrderMaterial(orderId, usageId, input, actor, now)`.
- All return `OrderMutationResult`; actor authorization is checked before repository invocation by the service and PRIMARY ownership is rechecked transactionally for technicians.

- [ ] **Step 1: Write failing material tests**

Cover ADMIN, SUPERVISOR and active PRIMARY success in IN_PROGRESS and PAUSED. Cover SUPPORT/unrelated technician rejection, wrong state, closed order, inactive/deleted material, null cost, nested usage from another order, stale version, zero/negative/over-precision quantity, and atomic rollback.

```ts
expect(await addMaterial(orderId, {
  version: 4,
  materialId,
  quantity: "12.500",
  observation: "Cable del enlace",
}, actor)).toMatchObject({
  kind: "UPDATED",
  order: {
    version: 5,
    materials: [
      expect.objectContaining({
        quantity: "12.500",
        historicalUnitCost: "25.00",
      }),
    ],
  },
});
```

After changing `Material.referenceCost`, update quantity and prove `historicalUnitCost` remains `25.00`.

- [ ] **Step 2: Implement actor eligibility inside the transaction**

If actor has `ORDERS_MANAGE`, allow material changes without technician ownership. Otherwise require `ORDERS_OPERATE_OWN`, a non-null `technicianId`, and an active PRIMARY assignment matching that technician. This duplicates the contextual service decision deliberately at the consistency boundary.

- [ ] **Step 3: Implement material creation**

Lock order and material, verify IN_PROGRESS/PAUSED and exact version, require active material with non-null `referenceCost`, then create:

```ts
await tx.materialUtilizado.create({
  data: {
    ordenId: orderId,
    actividadId: null,
    materialId: input.materialId,
    quantity: new Prisma.Decimal(input.quantity),
    historicalUnitCost: material.referenceCost,
    observation: input.observation ?? null,
  },
});
```

Increment the order version once and record `ORDER_MATERIAL_ADDED`.

- [ ] **Step 4: Implement material update and removal**

Resolve usage by `id + ordenId`; otherwise return `MATERIAL_USAGE_NOT_FOUND`. Update only quantity/observation and never historical cost. Removal hard-deletes only `MaterialUtilizado`; history/audit must contain a safe before snapshot. Use `ORDER_MATERIAL_UPDATED` and `ORDER_MATERIAL_REMOVED`.

- [ ] **Step 5: Verify and commit**

```powershell
Set-Location server
npm run test:db -- tests/database/orders-operation-persistence.test.ts
npm run typecheck
npm run lint
```

```bash
git add server/src/orders/orders.repository.types.ts server/src/orders/orders.operation.repository.ts server/tests/database/orders-operation-persistence.test.ts
git commit -m "feat(orders): track materials and historical costs"
```

---

### Task 9: Audited adjustments for closed orders

**Files:**
- Modify: `server/src/orders/orders.repository.types.ts`
- Modify: `server/src/orders/orders.operation.repository.ts`
- Modify: `server/tests/database/orders-operation-persistence.test.ts`

**Interfaces:**
- Produces: `adjustClosedOrder(orderId, input, actor, now)`.
- Returns `OrderMutationResult`.
- Accepts only `description`, `scheduledFor`, `startedAt`, `endedAt`, `diagnosis`, `result`, `cancellationReason`, `estimatedMinutes`, plus `version` and `reason`.

- [ ] **Step 1: Write failing adjustment tests**

Test COMPLETED and CANCELLED adjustments, exact version, at least one change, reason length, forbidden open orders, and no ability to pass status/order number/branch/service/priority/assignments/materials.

```ts
expect(await adjust(completedId, {
  version: 5,
  reason: "Corrección confirmada por supervisión",
  startedAt: new Date("2026-08-01T14:00:00Z"),
  endedAt: new Date("2026-08-01T15:45:00Z"),
}, supervisorActor)).toMatchObject({
  kind: "UPDATED",
  order: { status: "COMPLETED", totalMinutes: 105, version: 6 },
});
```

Reject `endedAt < startedAt`. For a CANCELLED order without start, allow both temporal fields to remain null and keep total null. Prove `ORDER_ADJUSTED` history/audit include reason plus before/after public fields.

- [ ] **Step 2: Implement closed-state and temporal validation**

Lock and require status COMPLETED or CANCELLED. Merge submitted temporal fields with stored values, require consistent pair ordering, and calculate:

```ts
const totalMinutes =
  nextStartedAt === null || nextEndedAt === null
    ? null
    : calculateGrossMinutes(nextStartedAt, nextEndedAt);
```

Never read `totalMinutes` from input. Update only the allowed keys, preserve terminal status, increment once, and write `ORDER_ADJUSTED`.

- [ ] **Step 3: Verify and commit**

```powershell
Set-Location server
npm run test:db -- tests/database/orders-operation-persistence.test.ts
npm run typecheck
```

```bash
git add server/src/orders/orders.repository.types.ts server/src/orders/orders.operation.repository.ts server/tests/database/orders-operation-persistence.test.ts
git commit -m "feat(orders): audit closed order adjustments"
```

---

### Task 10: Service authorization and public error translation

**Files:**
- Modify: `server/src/orders/orders.repository.types.ts`
- Create: `server/src/orders/orders.service.ts`
- Create: `server/tests/orders/orders-service.test.ts`

**Interfaces:**
- Consumes: one `OrdersRepository` composed from the three focused repositories.
- Produces: `OrdersService` with the exact methods declared in Step 4.
- Produces: `createOrdersService(repository, now?)`.

- [ ] **Step 1: Complete the aggregate repository interface**

```ts
export type OrdersRepository =
  & OrdersReadRepository
  & OrdersMutationRepository
  & OrdersOperationRepository;
```

Ensure the three factory results have non-overlapping method names so routes can compose:

```ts
const repository: OrdersRepository = {
  ...createOrdersReadRepository(database),
  ...createOrdersMutationRepository(database),
  ...createOrdersOperationRepository(database),
};
```

- [ ] **Step 2: Write failing service authorization tests**

Mock `OrdersRepository` and prove:

```ts
await expect(service.listOrders(filters, technicianActor))
  .resolves.toBeDefined();
expect(repository.listOrders).toHaveBeenCalledWith(
  filters,
  { kind: "TECHNICIAN", technicianId: technicianActor.technicianId },
  now,
);
```

Cover ADMIN/SUPERVISOR `{kind:"ALL"}`; technician without linked `technicianId` denied; support/unrelated outcomes translated safely; operational methods require `ORDERS_OPERATE_OWN`; create/edit/assign/cancel/adjust require `ORDERS_MANAGE`; materials accept MANAGE or OPERATE_OWN.

- [ ] **Step 3: Implement exact public error mapping**

Create one exhaustive mapping:

```ts
const errors: Record<OrderFailureKind, () => ApiError> = {
  ORDER_NOT_FOUND: () => new ApiError(404, "La orden solicitada no existe", "ORDER_NOT_FOUND"),
  ASSIGNMENT_NOT_FOUND: () => new ApiError(404, "La asignación solicitada no existe", "ASSIGNMENT_NOT_FOUND"),
  MATERIAL_USAGE_NOT_FOUND: () => new ApiError(404, "El material utilizado no existe", "MATERIAL_USAGE_NOT_FOUND"),
  MATERIAL_NOT_FOUND: () => new ApiError(404, "El material solicitado no existe", "MATERIAL_NOT_FOUND"),
  VERSION_CONFLICT: () => new ApiError(409, "La orden fue modificada por otro usuario", "VERSION_CONFLICT"),
  INVALID_ORDER_TRANSITION: () => new ApiError(409, "La transición de estado no es válida", "INVALID_ORDER_TRANSITION"),
  PRIMARY_TECHNICIAN_REQUIRED: () => new ApiError(409, "La orden requiere un técnico principal", "PRIMARY_TECHNICIAN_REQUIRED"),
  TECHNICIAN_NOT_ASSIGNED: () => new ApiError(409, "El técnico no puede operar esta orden", "TECHNICIAN_NOT_ASSIGNED"),
  TECHNICIAN_BUSY: () => new ApiError(409, "El técnico ya tiene otro trabajo operativo", "TECHNICIAN_BUSY"),
  RESOURCE_INACTIVE: () => new ApiError(409, "El recurso relacionado está inactivo", "RESOURCE_INACTIVE"),
  ORDER_CLOSED: () => new ApiError(409, "La orden está cerrada", "ORDER_CLOSED"),
  MATERIAL_COST_UNAVAILABLE: () => new ApiError(409, "El material no tiene costo de referencia", "MATERIAL_COST_UNAVAILABLE"),
};
```

Use a `never` exhaustiveness assertion if implemented as a switch.

- [ ] **Step 4: Implement read, mutation, and mapping methods**

The service builds access scope from actor permissions, invokes repositories, throws mapped errors for non-success results, maps records with `orders.mapper.ts`, and adds pagination:

```ts
pagination: {
  page,
  pageSize,
  totalItems,
  totalPages: totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize),
}
```

Expose the full service contract and never return raw repository records:

```ts
export interface OrdersService {
  listOrders(filters: OrderListFilters, actor: OrderActorContext): Promise<PaginatedResult<PublicOrderSummary>>;
  getOrder(id: string, actor: OrderActorContext): Promise<PublicOrderDetail>;
  listOrderHistory(id: string, filters: HistoryFilters, actor: OrderActorContext): Promise<PaginatedResult<PublicOrderHistory>>;
  createOrder(input: CreateOrderInput, actor: OrderActorContext): Promise<PublicOrderDetail>;
  updateOrder(id: string, input: UpdateOrderInput, actor: OrderActorContext): Promise<PublicOrderDetail>;
  assignTechnician(id: string, input: AssignmentInput, actor: OrderActorContext): Promise<PublicOrderDetail>;
  unassignTechnician(id: string, technicianId: string, input: UnassignmentInput, actor: OrderActorContext): Promise<PublicOrderDetail>;
  moveOnRoute(id: string, input: VersionInput, actor: OrderActorContext): Promise<PublicOrderDetail>;
  startOrder(id: string, input: VersionInput, actor: OrderActorContext): Promise<PublicOrderDetail>;
  pauseOrder(id: string, input: PauseOrderInput, actor: OrderActorContext): Promise<PublicOrderDetail>;
  resumeOrder(id: string, input: VersionInput, actor: OrderActorContext): Promise<PublicOrderDetail>;
  completeOrder(id: string, input: CompleteOrderInput, actor: OrderActorContext): Promise<PublicOrderDetail>;
  cancelOrder(id: string, input: CancelOrderInput, actor: OrderActorContext): Promise<PublicOrderDetail>;
  adjustClosedOrder(id: string, input: AdjustOrderInput, actor: OrderActorContext): Promise<PublicOrderDetail>;
  addOrderMaterial(id: string, input: MaterialInput, actor: OrderActorContext): Promise<PublicOrderDetail>;
  updateOrderMaterial(id: string, usageId: string, input: UpdateMaterialInput, actor: OrderActorContext): Promise<PublicOrderDetail>;
  removeOrderMaterial(id: string, usageId: string, input: RemoveMaterialInput, actor: OrderActorContext): Promise<PublicOrderDetail>;
}
```

- [ ] **Step 5: Verify and commit**

```powershell
Set-Location server
npm test -- tests/orders/orders-service.test.ts tests/orders/orders-mapper.test.ts
npm run typecheck
npm run lint
```

```bash
git add server/src/orders/orders.repository.types.ts server/src/orders/orders.service.ts server/tests/orders/orders-service.test.ts
git commit -m "feat(orders): add authorized order service"
```

---

### Task 11: HTTP controllers, routes, full regression, and documentation

**Files:**
- Create: `server/src/orders/orders.controller.ts`
- Create: `server/src/orders/orders.routes.ts`
- Modify: `server/src/routes/index.ts`
- Create: `server/tests/orders/orders-http.test.ts`
- Modify: `server/database/verify-database.sql`
- Modify: `README.md`
- Modify: `docs/architecture/current-state.md`

**Interfaces:**
- Consumes: all schemas and `OrdersService`.
- Produces: `createOrdersController(service)`.
- Produces: `createOrdersRouter(env, database, authService)`.
- Produces mounted `/api/v1/orders` API with the 17 specified endpoints.

- [ ] **Step 1: Write failing HTTP security tests**

Test 401 without session, 403 with provisional password, 403 without allowed Origin on every mutation family, and role permissions. Use authenticated cookies from the existing auth helpers. Verify validation errors use:

```json
{
  "success": false,
  "message": "Los datos enviados no son válidos",
  "errors": [
    { "field": "version", "code": "VALIDATION_ERROR" }
  ]
}
```

Prove a technician sees only current/historical assigned orders, SUPPORT cannot operate, PRIMARY can operate their own order, and an unauthorized nested order/material ID does not reveal another resource.

- [ ] **Step 2: Implement controller parsing and actor construction**

Use the existing response envelope. Build actor exactly from authenticated request:

```ts
function actor(request: Request): OrderActorContext {
  return {
    userId: request.auth!.userId,
    technicianId: request.auth!.technicianId,
    permissions: request.auth!.permissions,
    requestId: request.requestId,
    ipAddress: request.ip || null,
    userAgent: request.header("user-agent")?.slice(0, 500) ?? null,
  };
}
```

Parse params, query and body with the named strict schemas. Return 201 only for order and material creation; return 200 for reads, edits and commands. Every success includes `meta.requestId`.

Use these response messages so controller and HTTP assertions stay aligned:

```ts
const messages = {
  list: "Órdenes consultadas",
  detail: "Orden consultada",
  history: "Historial consultado",
  create: "Orden creada",
  update: "Orden actualizada",
  assign: "Técnico asignado",
  unassign: "Técnico retirado",
  onRoute: "Traslado iniciado",
  start: "Trabajo iniciado",
  pause: "Orden pausada",
  resume: "Orden reanudada",
  complete: "Orden completada",
  cancel: "Orden cancelada",
  adjust: "Orden ajustada",
  materialAdd: "Material registrado",
  materialUpdate: "Material actualizado",
  materialRemove: "Material retirado",
} as const;
```

- [ ] **Step 3: Compose routes in exact order**

Reads use `createAuthenticationMiddleware(authService)`, then `requirePasswordChanged`, then `requireAnyPermission("ORDERS_VIEW_ALL", "ORDERS_VIEW_OWN")`. Every mutation follows the existing CSRF order: `requireAllowedOrigin(env.CORS_ORIGINS)`, authentication, `requirePasswordChanged`, then its permission middleware. Administrative mutations require `ORDERS_MANAGE`; operational commands require `ORDERS_OPERATE_OWN`; material routes accept either `ORDERS_MANAGE` or `ORDERS_OPERATE_OWN`.

Register static command paths before any competing parameterized child route and expose exactly:

```text
GET    /
GET    /:orderId
GET    /:orderId/history
POST   /
PATCH  /:orderId
POST   /:orderId/assignments
DELETE /:orderId/assignments/:technicianId
POST   /:orderId/on-route
POST   /:orderId/start
POST   /:orderId/pause
POST   /:orderId/resume
POST   /:orderId/complete
POST   /:orderId/cancel
POST   /:orderId/adjustments
POST   /:orderId/materials
PATCH  /:orderId/materials/:usageId
DELETE /:orderId/materials/:usageId
```

Mount with `router.use("/orders", createOrdersRouter(env, database, authService))`.

- [ ] **Step 4: Test complete HTTP lifecycles**

Exercise:

1. ADMIN creates PENDING.
2. ADMIN assigns PRIMARY and SUPPORT.
3. PRIMARY optionally moves ON_ROUTE, starts, pauses and resumes.
4. PRIMARY or ADMIN adds/updates/removes a material.
5. PRIMARY completes with diagnosis/result.
6. SUPERVISOR adjusts a closed field with reason.
7. A second order is cancelled.

At every step send the returned version and assert the next exact version. Also test list filters, detail, history pagination, direct ASSIGNED→IN_PROGRESS for remote support, conflict from stale versions, and `TECHNICIAN_BUSY`.

- [ ] **Step 5: Run focused HTTP and database suites**

```powershell
Set-Location server
npm test -- tests/orders
npm run test:db -- tests/database/orders-read-persistence.test.ts tests/database/orders-mutation-persistence.test.ts tests/database/orders-operation-persistence.test.ts tests/orders/orders-http.test.ts
```

Expected: all focused tests pass with no open handles.

- [ ] **Step 6: Update verification SQL and documentation**

`verify-database.sql` must assert the two new permissions, their role assignments, four new indexes, seven order statuses and the existing exclusive-material/active-primary constraints. Update README with all 17 routes, the four permissions, annual numbering, state flow, version rule, test commands and the statement that React still uses mocks. Update current-state counts from actual command output, not predicted values.

- [ ] **Step 7: Run every regression gate**

```powershell
Set-Location server
npm run db:format
npm run db:validate
npm run db:generate
npm run typecheck
npm run lint
npm test
npm run test:db
npm run build
npm run db:seed
npm run db:seed
npm run db:verify
npx prisma migrate status
Set-Location ..
npm run lint
npm test
npm run build
```

Expected: every command exits 0; both seeds are idempotent; migrations are current; frontend remains functionally unchanged.

- [ ] **Step 8: Run a compiled-server authenticated smoke flow**

Start `server/dist/src/server.js` on a disposable local port with the normal local database, log in with a disposable ADMIN test account, change a provisional password if necessary, and call health plus create/list/detail/update/assign/start/pause/resume/material/complete/history. Delete only the disposable rows created by the smoke flow inside one explicitly scoped SQL transaction. Do not delete seeded or user-owned data.

Expected: health and reads return 200, creation/material return 201, commands return 200, forbidden ownership returns 403 or the safe documented conflict, and no response contains secrets.

- [ ] **Step 9: Inspect scope and commit the final checkpoint**

```powershell
git status --short
git diff --check
git diff --stat main...HEAD
```

Confirm there are no frontend source changes, no `.env`, generated Prisma client, logs or build outputs staged, and no unrelated user changes.

```bash
git add server/src/orders server/src/routes/index.ts server/tests/orders server/database/verify-database.sql README.md docs/architecture/current-state.md
git commit -m "feat(orders): expose protected work orders API"
```

---

## Plan self-review checklist

- Every section of the approved design maps to at least one task.
- All 17 endpoints appear exactly once in the HTTP task.
- Repository method names and result unions match across Tasks 3–10.
- Permission ownership rules match across middleware, service, repository and HTTP tests.
- Every mutation has a RED test, minimal implementation, GREEN verification and checkpoint commit.
- Numbering, versioning, locks, history and audit are tested under concurrency or rollback.
- No placeholder text, unspecified “error handling”, frontend integration, activities, evidence, recurrence or KPI work entered the plan.
- Final verification includes Prisma, backend, database, frontend regression and compiled smoke tests.
