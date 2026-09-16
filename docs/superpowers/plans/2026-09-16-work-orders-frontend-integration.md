# Integración frontend de Órdenes de trabajo — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir el centro operativo completo de Órdenes conectado a PostgreSQL, con catálogo, consulta, creación, asignaciones, transiciones, materiales, evidencias, historial y ajustes autorizados.

**Architecture:** El backend añade una lectura mínima de catálogo bajo el módulo de Órdenes. El frontend separa contratos, transporte, búsquedas auxiliares, helpers, workspace y componentes; la URL conserva filtros y selección, mientras las mutaciones usan la versión confirmada por el servidor y nunca se reintentan automáticamente.

**Tech Stack:** React 18, TypeScript estricto, Vite, Vitest, React Testing Library, Express 5, Zod 4, Prisma 7 y PostgreSQL 18.

**Spec:** `docs/superpowers/specs/2026-09-16-work-orders-frontend-integration-design.md`

## Global Constraints

- Mantener la sesión en cookie opaca `HttpOnly`; no usar `localStorage`, `sessionStorage`, `document.cookie` ni bearer manual.
- Usar `credentials: "include"` y conservar el flujo global de `401`.
- La zona de negocio es `America/Tegucigalpa`.
- No añadir dependencias ni React Router.
- No duplicar ni relajar la máquina de estados del backend.
- No inventar versiones en el cliente ni reintentar escrituras automáticamente.
- Conservar borradores ante errores recuperables y eliminarlos al perder autorización.
- No exponer borrado lógico, rutas físicas, claves de almacenamiento, hashes ni registros Prisma crudos.
- Escritorio usa tabla y detalle lateral; móvil usa tarjetas y detalle de pantalla completa.
- Objetivos táctiles mínimos de 44 por 44 píxeles y operación completa por teclado.
- El backend continúa como autoridad de permisos, propiedad y validaciones.
- Commits y comentarios de entrega en español.

---

### Task 1: Contrato del catálogo de Órdenes

**Files:**
- Modify: `server/src/orders/orders.types.ts`
- Modify: `server/src/orders/orders.repository.types.ts`
- Modify: `server/src/orders/orders.service.ts`
- Modify: `server/tests/orders/orders-service.test.ts`

**Interfaces:**
- Consumes: `OrderActorContext` y permisos `ORDERS_VIEW_ALL`, `ORDERS_VIEW_OWN`, `ORDERS_MANAGE`, `ORDERS_OPERATE_OWN`.
- Produces: `PublicOrderCatalog`, `PublicServiceTypeOption`, `PublicMaterialOption`, `OrdersRepository.listOrderCatalog()` y `OrdersService.catalog()`.

- [ ] **Step 1: Escribir la prueba de servicio que falle**

Añadir un caso que exija al servicio delegar la lectura y otro que rechace a un actor sin permisos de Órdenes.

```ts
await expect(service.catalog(actor(["ORDERS_VIEW_OWN"])))
  .resolves.toEqual(catalog);
expect(repository.listOrderCatalog).toHaveBeenCalledOnce();

await expect(service.catalog(actor([]))).rejects.toMatchObject({
  status: 403,
  code: "FORBIDDEN",
});
```

- [ ] **Step 2: Ejecutar RED focal**

Desde `server/`:

```bash
npm test -- tests/orders/orders-service.test.ts
```

Expected: FAIL porque `catalog`, los tipos y el método de repositorio no existen.

- [ ] **Step 3: Definir contratos explícitos**

```ts
export interface PublicServiceTypeOption {
  id: string;
  code: string;
  name: string;
}

export interface PublicMaterialOption {
  id: string;
  code: string;
  name: string;
  unit: string;
  referenceCost: string;
}

export interface PublicOrderCatalog {
  serviceTypes: PublicServiceTypeOption[];
  materials: PublicMaterialOption[];
}
```

Agregar a repositorio y servicio:

```ts
listOrderCatalog(): Promise<PublicOrderCatalog>;
catalog(actor: OrderActorContext): Promise<PublicOrderCatalog>;
```

- [ ] **Step 4: Implementar autorización mínima**

`catalog()` aceptará cualquiera de los cuatro permisos del módulo y llamará a `listOrderCatalog()`. No resolverá propiedad porque el catálogo no contiene órdenes.

- [ ] **Step 5: Ejecutar GREEN y controles estáticos**

```bash
npm test -- tests/orders/orders-service.test.ts
npm run typecheck
npm run lint
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/orders/orders.types.ts server/src/orders/orders.repository.types.ts server/src/orders/orders.service.ts server/tests/orders/orders-service.test.ts
git commit -m "feat(ordenes): definir catálogo operativo"
```

---

### Task 2: Persistencia y endpoint HTTP del catálogo

**Files:**
- Modify: `server/src/orders/orders.read.repository.ts`
- Modify: `server/src/orders/orders.controller.ts`
- Modify: `server/src/orders/orders.routes.ts`
- Modify: `server/tests/database/orders-read-persistence.test.ts`
- Modify: `server/tests/orders/orders-http.test.ts`

**Interfaces:**
- Consumes: `PublicOrderCatalog` y `OrdersService.catalog()`.
- Produces: `GET /api/v1/orders/catalog`, declarado antes de `/:orderId`.

- [ ] **Step 1: Escribir pruebas PostgreSQL y HTTP que fallen**

Sembrar tipos/materiales activos, inactivos, eliminados y materiales sin costo. Esperar únicamente opciones elegibles, ordenadas por `name asc, id asc`. Probar `200`, `401`, contraseña pendiente y `403`.

```ts
expect(result.serviceTypes.map(({ name }) => name)).toEqual(["Entrega", "Soporte"]);
expect(result.materials.map(({ name }) => name)).toEqual(["Cable UTP"]);

await request(app).get("/api/v1/orders/catalog")
  .set("Cookie", authorizedCookie)
  .expect(200);
```

- [ ] **Step 2: Ejecutar RED focal**

```bash
npm run test:db -- tests/database/orders-read-persistence.test.ts tests/orders/orders-http.test.ts
```

Expected: FAIL porque el repositorio y la ruta no existen.

- [ ] **Step 3: Implementar consulta proyectada**

Usar `tipoServicio.findMany` y `material.findMany` con `active: true`, `deletedAt: null`; materiales además requieren `referenceCost: { not: null }`. Convertir decimales a string y devolver solo campos públicos.

- [ ] **Step 4: Exponer controlador y ruta**

```ts
catalog: asyncHandler(async (req, res) => {
  success(req, res, 200, "Catálogo de órdenes consultado", await service.catalog(actor(req)));
})
```

Montar `router.get("/catalog", ...catalogSecurity, controller.catalog)` antes de `router.get("/:orderId", ...)`.

- [ ] **Step 5: Ejecutar GREEN y regresión de Órdenes**

```bash
npm test -- tests/orders
npm run test:db -- tests/database/orders-read-persistence.test.ts tests/orders/orders-http.test.ts
npm run typecheck
npm run lint
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/orders server/tests/database/orders-read-persistence.test.ts server/tests/orders/orders-http.test.ts
git commit -m "feat(ordenes): exponer catálogo protegido"
```

---

### Task 3: Modelos y cliente HTTP de Órdenes

**Files:**
- Create: `src/models/order.ts`
- Create: `src/api/orders.ts`
- Create: `src/api/orders.test.ts`

**Interfaces:**
- Consumes: `requestJson`, contratos públicos de la API y estados `PENDING | ASSIGNED | ON_ROUTE | IN_PROGRESS | PAUSED | COMPLETED | CANCELLED`.
- Produces: `Order`, `OrderDetail`, `OrderHistoryEntry`, `OrderFilters`, entradas de mutación y `OrdersApi`.

- [ ] **Step 1: Escribir pruebas del transporte que fallen**

Cubrir filtros repetidos, fechas ISO, detalle, historial y las 14 mutaciones. Verificar método, URL y cuerpo versionado.

```ts
await api.list({
  search: "GS-2026",
  statuses: ["ASSIGNED", "IN_PROGRESS"],
  priorities: ["HIGH"],
  overdue: true,
  page: 2,
  pageSize: 20,
});
expect(fetchUrl()).toContain("status=ASSIGNED&status=IN_PROGRESS");

await api.pause("order-1", { version: 4, comment: "Esperando acceso" });
expect(fetchInit()).toMatchObject({ method: "POST" });
```

- [ ] **Step 2: Ejecutar RED focal**

```bash
npm test -- src/api/orders.test.ts
```

Expected: FAIL porque los módulos no existen.

- [ ] **Step 3: Definir `OrdersApi` completo**

```ts
export interface OrdersApi {
  list(filters: OrderFilters, signal?: AbortSignal): Promise<OrderPage>;
  detail(id: string, signal?: AbortSignal): Promise<OrderDetail>;
  history(id: string, page: number, signal?: AbortSignal): Promise<OrderHistoryPage>;
  create(input: CreateOrderInput): Promise<OrderDetail>;
  update(id: string, input: UpdateOrderInput): Promise<OrderDetail>;
  assign(id: string, input: AssignmentInput): Promise<OrderDetail>;
  unassign(id: string, technicianId: string, input: UnassignmentInput): Promise<OrderDetail>;
  onRoute(id: string, input: VersionInput): Promise<OrderDetail>;
  start(id: string, input: VersionInput): Promise<OrderDetail>;
  pause(id: string, input: PauseOrderInput): Promise<OrderDetail>;
  resume(id: string, input: VersionInput): Promise<OrderDetail>;
  complete(id: string, input: CompleteOrderInput): Promise<OrderDetail>;
  cancel(id: string, input: CancelOrderInput): Promise<OrderDetail>;
  adjust(id: string, input: AdjustOrderInput): Promise<OrderDetail>;
  addMaterial(id: string, input: MaterialInput): Promise<OrderDetail>;
  updateMaterial(id: string, usageId: string, input: UpdateMaterialInput): Promise<OrderDetail>;
  removeMaterial(id: string, usageId: string, input: VersionInput): Promise<OrderDetail>;
}
```

- [ ] **Step 4: Implementar serialización y métodos**

Usar `encodeURIComponent` para IDs, `URLSearchParams.append` para arrays y `requestJson` para todas las lecturas/escrituras.

- [ ] **Step 5: Ejecutar GREEN**

```bash
npm test -- src/api/orders.test.ts
npm run lint
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/models/order.ts src/api/orders.ts src/api/orders.test.ts
git commit -m "feat(ordenes): crear contratos y cliente HTTP"
```

---

### Task 4: Búsquedas auxiliares y catálogo frontend

**Files:**
- Create: `src/api/order-lookups.ts`
- Create: `src/api/order-lookups.test.ts`
- Modify: `src/models/order.ts`

**Interfaces:**
- Consumes: `/orders/catalog`, `/clients`, `/clients/:id` y `/technicians`.
- Produces: `OrderLookupApi.catalog()`, `clients()`, `branches()` y `technicians()`.

- [ ] **Step 1: Escribir pruebas que fallen**

Comprobar normalización de búsqueda, `pageSize=20`, señales de aborto y mapeo mínimo de resultados.

```ts
await lookups.clients("  Acme  ", 1, signal);
expect(fetchUrl()).toContain("/clients?search=Acme&page=1&pageSize=20");

await lookups.branches("client-1", signal);
expect(fetchUrl()).toContain("/clients/client-1");
```

- [ ] **Step 2: Ejecutar RED**

```bash
npm test -- src/api/order-lookups.test.ts
```

- [ ] **Step 3: Implementar interfaz y adaptadores**

```ts
export interface OrderLookupApi {
  catalog(signal?: AbortSignal): Promise<OrderCatalog>;
  clients(search: string, page: number, signal?: AbortSignal): Promise<OrderClientPage>;
  branches(clientId: string, signal?: AbortSignal): Promise<OrderBranchOption[]>;
  technicians(search: string, page: number, signal?: AbortSignal): Promise<OrderTechnicianPage>;
}
```

No devolver contratos completos de Clientes o Técnicos: mapear solo IDs, códigos, nombres y estado necesarios.

- [ ] **Step 4: Ejecutar GREEN y commit**

```bash
npm test -- src/api/order-lookups.test.ts
npm run lint
npm run build
git add src/api/order-lookups.ts src/api/order-lookups.test.ts src/models/order.ts
git commit -m "feat(ordenes): conectar catálogos y búsquedas"
```

---

### Task 5: Helpers de URL, fechas y capacidades

**Files:**
- Create: `src/hooks/order-workspace.helpers.ts`
- Create: `src/hooks/order-workspace.helpers.test.ts`

**Interfaces:**
- Consumes: `OrderFilters`, permisos y `America/Tegucigalpa`.
- Produces: `readOrderUrlState()`, `writeOrderUrlState()`, `deriveOrderCapabilities()`, `allowedOrderActions()` y formateadores.

- [ ] **Step 1: Escribir pruebas que fallen**

Cubrir arrays repetidos, parámetros inválidos, página mínima, selección, atrás/adelante y fechas con `-06:00`.

```ts
expect(readOrderUrlState("?status=ASSIGNED&status=PAUSED&page=2&orderId=o1"))
  .toMatchObject({ filters: { statuses: ["ASSIGNED", "PAUSED"], page: 2 }, orderId: "o1" });

expect(deriveOrderCapabilities(["ORDERS_VIEW_OWN", "ORDERS_OPERATE_OWN"]))
  .toMatchObject({ canView: true, canManage: false, canOperateOwn: true });
```

- [ ] **Step 2: Ejecutar RED**

```bash
npm test -- src/hooks/order-workspace.helpers.test.ts
```

- [ ] **Step 3: Implementar helpers puros**

`allowedOrderActions(detail, capabilities, currentTechnicianId)` devolverá acciones de presentación, pero nunca sustituirá la autorización del servidor. No permitirá transición desde estados terminales.

- [ ] **Step 4: Ejecutar GREEN y commit**

```bash
npm test -- src/hooks/order-workspace.helpers.test.ts
npm run lint
git add src/hooks/order-workspace.helpers.ts src/hooks/order-workspace.helpers.test.ts
git commit -m "feat(ordenes): definir estado URL y capacidades"
```

---

### Task 6: Workspace de lectura y selección

**Files:**
- Create: `src/hooks/useOrdersWorkspace.ts`
- Create: `src/hooks/useOrdersWorkspace.test.tsx`

**Interfaces:**
- Consumes: `OrdersApi`, `OrderLookupApi`, permisos de `useAuth` y helpers de Task 5.
- Produces: `OrdersWorkspace` con lista, detalle, filtros, selección, catálogo y métodos de refresco.

- [ ] **Step 1: Escribir pruebas RED de lectura**

Probar carga inicial, debounce de búsqueda, cancelación, paginación, selección por URL, `popstate`, detalle obsoleto y cambio de permisos.

```tsx
const { result } = renderHook(() => useOrdersWorkspace({ api, lookupApi }));
await waitFor(() => expect(result.current.list.status).toBe("success"));
act(() => result.current.selectOrder("order-1"));
await waitFor(() => expect(api.detail).toHaveBeenCalledWith("order-1", expect.any(AbortSignal)));
```

- [ ] **Step 2: Ejecutar RED**

```bash
npm test -- src/hooks/useOrdersWorkspace.test.tsx
```

- [ ] **Step 3: Implementar estado de lectura**

Separar estados `list`, `detail`, `catalog` e `history`; usar controladores y generaciones independientes. No limpiar un resultado vigente mientras se refresca.

- [ ] **Step 4: Implementar URL y polling visible**

Escuchar `popstate`; usar `replaceState` para búsqueda debounced y `pushState` para selección. Refrescar lista cada 30 segundos solo con `document.visibilityState === "visible"` y sin formulario activo.

- [ ] **Step 5: Ejecutar GREEN y commit**

```bash
npm test -- src/hooks/useOrdersWorkspace.test.tsx
npm run lint
npm run build
git add src/hooks/useOrdersWorkspace.ts src/hooks/useOrdersWorkspace.test.tsx
git commit -m "feat(ordenes): coordinar consulta y selección"
```

---

### Task 7: Navegación, filtros, lista y detalle base

**Files:**
- Modify: `src/models/app.ts`
- Modify: `src/routes/appRoutes.ts`
- Modify: `src/hooks/useAppRoute.ts`
- Modify: `src/mocks/data.ts`
- Modify: `src/layouts/AppShell.tsx`
- Modify: `src/layouts/AppShell.test.tsx`
- Modify: `src/layouts/Sidebar.test.tsx`
- Create: `src/pages/OrdersPage.tsx`
- Create: `src/pages/OrdersPage.test.tsx`
- Create: `src/components/orders/OrderFilters.tsx`
- Create: `src/components/orders/OrderTable.tsx`
- Create: `src/components/orders/OrderDetail.tsx`
- Create: `src/components/orders/OrderRoute.tsx`
- Create: `src/components/orders/orders.css`

**Interfaces:**
- Consumes: `OrdersWorkspace` de Task 6.
- Produces: página `/ordenes`, tabla/tarjetas, detalle y ruta operativa accesible.

- [ ] **Step 1: Escribir pruebas de navegación y permisos**

```tsx
expect(getPathFromPage("Órdenes")).toBe("/ordenes");
expect(canAccessPage("Órdenes", ["ORDERS_VIEW_OWN"])).toBe(true);
expect(canAccessPage("Órdenes", [])).toBe(false);
```

- [ ] **Step 2: Escribir pruebas de interfaz que fallen**

Probar filtros, fila seleccionada, estado atrasado con texto, detalle, ruta operativa, vacío, error y versión móvil sin tabla horizontal.

- [ ] **Step 3: Ejecutar RED focal**

```bash
npm test -- src/layouts/AppShell.test.tsx src/layouts/Sidebar.test.tsx src/pages/OrdersPage.test.tsx
```

- [ ] **Step 4: Implementar navegación y composición**

Añadir `Órdenes`/`/ordenes`, descripción y permisos; renderizar `OrdersPage` en `AppShell`. El buscador superior alimentará `search` del workspace.

- [ ] **Step 5: Implementar tabla, tarjetas y detalle base**

La ruta operativa usará texto e iconos para cada estado. El detalle tendrá áreas navegables `Resumen`, `Equipo`, `Materiales`, `Evidencias`, `Historial`, aunque las tres últimas se completarán en tareas posteriores.

- [ ] **Step 6: Ejecutar GREEN, lint, build y commit**

```bash
npm test -- src/layouts/AppShell.test.tsx src/layouts/Sidebar.test.tsx src/pages/OrdersPage.test.tsx
npm run lint
npm run build
git add src/models/app.ts src/routes src/hooks/useAppRoute.ts src/mocks/data.ts src/layouts src/pages/OrdersPage.tsx src/pages/OrdersPage.test.tsx src/components/orders
git commit -m "feat(ordenes): añadir centro operativo de lectura"
```

---

### Task 8: Creación y edición administrativa

**Files:**
- Create: `src/components/orders/OrderForm.tsx`
- Create: `src/components/orders/OrderForm.test.tsx`
- Modify: `src/hooks/useOrdersWorkspace.ts`
- Modify: `src/hooks/useOrdersWorkspace.test.tsx`
- Modify: `src/pages/OrdersPage.tsx`
- Modify: `src/pages/OrdersPage.test.tsx`

**Interfaces:**
- Consumes: `OrdersApi.create`, `OrdersApi.update`, búsquedas de cliente/sucursal y catálogo.
- Produces: `openCreate()`, `openEdit()`, `submitOrder()` y borrador validado.

- [ ] **Step 1: Escribir pruebas RED**

Probar permiso `ORDERS_MANAGE`, dependencia cliente→sucursal, fechas locales, estimación 1–10080, campos permitidos por estado, errores por campo y reemplazo con respuesta del servidor.

- [ ] **Step 2: Ejecutar RED**

```bash
npm test -- src/components/orders/OrderForm.test.tsx src/hooks/useOrdersWorkspace.test.tsx src/pages/OrdersPage.test.tsx
```

- [ ] **Step 3: Implementar formulario accesible**

Crear selección remota de cliente, sucursal, servicio y prioridad. Al cambiar cliente, borrar sucursal. Convertir `datetime-local` a ISO con offset de Honduras antes de enviar.

- [ ] **Step 4: Implementar mutación y recuperación**

Conservar borrador ante red, `422` y `409`; cerrarlo en éxito; cerrarlo y limpiar lookups ante `403`.

- [ ] **Step 5: Ejecutar GREEN y commit**

```bash
npm test -- src/components/orders/OrderForm.test.tsx src/hooks/useOrdersWorkspace.test.tsx src/pages/OrdersPage.test.tsx
npm run lint
npm run build
git add src/components/orders/OrderForm* src/hooks/useOrdersWorkspace* src/pages/OrdersPage*
git commit -m "feat(ordenes): integrar creación y edición"
```

---

### Task 9: Gestión de asignaciones

**Files:**
- Create: `src/components/orders/OrderAssignments.tsx`
- Create: `src/components/orders/OrderAssignments.test.tsx`
- Modify: `src/hooks/useOrdersWorkspace.ts`
- Modify: `src/hooks/useOrdersWorkspace.test.tsx`
- Modify: `src/pages/OrdersPage.tsx`

**Interfaces:**
- Consumes: `OrdersApi.assign`, `OrdersApi.unassign` y `OrderLookupApi.technicians`.
- Produces: asignación `PRIMARY | SUPPORT` y retiro con motivo.

- [ ] **Step 1: Escribir pruebas RED**

Cubrir reemplazo de principal, apoyos, participantes históricos, búsqueda abortable, motivo de retiro, versión exacta y ausencia completa sin `ORDERS_MANAGE`.

- [ ] **Step 2: Ejecutar RED**

```bash
npm test -- src/components/orders/OrderAssignments.test.tsx src/hooks/useOrdersWorkspace.test.tsx
```

- [ ] **Step 3: Implementar editor y diálogo de retiro**

Mostrar participantes activos primero e históricos después. No inferir que el técnico está disponible: enviar selección y presentar el error estable del backend si cambió.

- [ ] **Step 4: Ejecutar GREEN y commit**

```bash
npm test -- src/components/orders/OrderAssignments.test.tsx src/hooks/useOrdersWorkspace.test.tsx
npm run lint
git add src/components/orders/OrderAssignments* src/hooks/useOrdersWorkspace* src/pages/OrdersPage.tsx
git commit -m "feat(ordenes): administrar equipo asignado"
```

---

### Task 10: Transiciones operativas y acciones terminales

**Files:**
- Create: `src/components/orders/OrderActionDialog.tsx`
- Create: `src/components/orders/OrderActionDialog.test.tsx`
- Modify: `src/components/orders/OrderDetail.tsx`
- Modify: `src/hooks/useOrdersWorkspace.ts`
- Modify: `src/hooks/useOrdersWorkspace.test.tsx`
- Modify: `src/pages/OrdersPage.test.tsx`

**Interfaces:**
- Consumes: `onRoute`, `start`, `pause`, `resume`, `complete`, `cancel`, `adjust` y `allowedOrderActions()`.
- Produces: acción principal fija y diálogos con campos específicos.

- [ ] **Step 1: Escribir pruebas RED por transición**

```ts
expect(allowedOrderActions(assignedPrimaryOrder, technicianCaps, technicianId))
  .toContain("ON_ROUTE");
expect(allowedOrderActions(completedOrder, managerCaps, null))
  .toEqual(["ADJUST"]);
```

Comprobar comentario de pausa, diagnóstico/resultado, motivo de cancelación y motivo + cambio de ajuste.

- [ ] **Step 2: Ejecutar RED**

```bash
npm test -- src/components/orders/OrderActionDialog.test.tsx src/hooks/useOrdersWorkspace.test.tsx src/pages/OrdersPage.test.tsx
```

- [ ] **Step 3: Implementar acciones sin transición optimista**

Deshabilitar durante envío; en éxito sustituir detalle/lista con respuesta real. Acciones inválidas no deben renderizarse aunque el usuario tenga permiso.

- [ ] **Step 4: Ejecutar GREEN y commit**

```bash
npm test -- src/components/orders/OrderActionDialog.test.tsx src/hooks/useOrdersWorkspace.test.tsx src/pages/OrdersPage.test.tsx
npm run lint
npm run build
git add src/components/orders/OrderActionDialog* src/components/orders/OrderDetail.tsx src/hooks/useOrdersWorkspace* src/pages/OrdersPage.test.tsx
git commit -m "feat(ordenes): conectar ciclo operativo completo"
```

---

### Task 11: Materiales utilizados

**Files:**
- Create: `src/components/orders/OrderMaterials.tsx`
- Create: `src/components/orders/OrderMaterials.test.tsx`
- Modify: `src/hooks/useOrdersWorkspace.ts`
- Modify: `src/hooks/useOrdersWorkspace.test.tsx`
- Modify: `src/components/orders/OrderDetail.tsx`

**Interfaces:**
- Consumes: catálogo de materiales y mutaciones `addMaterial`, `updateMaterial`, `removeMaterial`.
- Produces: gestión de material solo en `IN_PROGRESS` o `PAUSED`.

- [ ] **Step 1: Escribir pruebas RED**

Cubrir cantidad decimal positiva de hasta tres decimales, costo histórico de solo lectura, observación opcional, edición, retiro confirmado, permisos y estados cerrados.

- [ ] **Step 2: Ejecutar RED**

```bash
npm test -- src/components/orders/OrderMaterials.test.tsx src/hooks/useOrdersWorkspace.test.tsx
```

- [ ] **Step 3: Implementar panel y mutaciones**

Presentar costos en lempiras sin recalcular el histórico. El retiro enviará exclusivamente `{ version }` y nunca eliminará el material del catálogo.

- [ ] **Step 4: Ejecutar GREEN y commit**

```bash
npm test -- src/components/orders/OrderMaterials.test.tsx src/hooks/useOrdersWorkspace.test.tsx
npm run lint
git add src/components/orders/OrderMaterials* src/components/orders/OrderDetail.tsx src/hooks/useOrdersWorkspace*
git commit -m "feat(ordenes): gestionar materiales utilizados"
```

---

### Task 12: Evidencias e historial paginado

**Files:**
- Create: `src/components/orders/OrderEvidencePanel.tsx`
- Create: `src/components/orders/OrderEvidencePanel.test.tsx`
- Create: `src/components/orders/OrderHistory.tsx`
- Create: `src/components/orders/OrderHistory.test.tsx`
- Modify: `src/api/evidences.ts`
- Modify: `src/api/evidences.test.ts`
- Modify: `src/hooks/useOrdersWorkspace.ts`
- Modify: `src/hooks/useOrdersWorkspace.test.tsx`
- Modify: `src/components/orders/OrderDetail.tsx`

**Interfaces:**
- Consumes: cliente binario existente, endpoints de evidencias de orden y `OrdersApi.history`.
- Produces: carga/listado/descarga autorizada y línea de tiempo paginada.

- [ ] **Step 1: Extender pruebas del cliente de evidencias**

Añadir métodos de orden con rutas `/orders/:orderId/evidences`, conservar `FormData` sin `Content-Type` manual y descarga con nombre seguro.

- [ ] **Step 2: Escribir pruebas RED de paneles**

Cubrir permisos independientes, carga inmediata, archivo rechazado, descarga binaria, carga diferida del historial, paginación y cambio de autorización con panel abierto.

- [ ] **Step 3: Ejecutar RED**

```bash
npm test -- src/api/evidences.test.ts src/components/orders/OrderEvidencePanel.test.tsx src/components/orders/OrderHistory.test.tsx src/hooks/useOrdersWorkspace.test.tsx
```

- [ ] **Step 4: Implementar paneles**

No cargar evidencia ni historial hasta activar su área. Invalidar evidencia al perder `EVIDENCES_VIEW`; cerrar carga/edición al perder sus permisos, sin cerrar el resto del detalle.

- [ ] **Step 5: Ejecutar GREEN y commit**

```bash
npm test -- src/api/evidences.test.ts src/components/orders/OrderEvidencePanel.test.tsx src/components/orders/OrderHistory.test.tsx src/hooks/useOrdersWorkspace.test.tsx
npm run lint
npm run build
git add src/api/evidences* src/components/orders src/hooks/useOrdersWorkspace*
git commit -m "feat(ordenes): integrar evidencias e historial"
```

---

### Task 13: Conflictos, respuestas tardías y pérdida de permisos

**Files:**
- Modify: `src/hooks/useOrdersWorkspace.ts`
- Modify: `src/hooks/useOrdersWorkspace.test.tsx`
- Modify: `src/pages/OrdersPage.tsx`
- Modify: `src/pages/OrdersPage.test.tsx`

**Interfaces:**
- Consumes: `ApiClientError`, generaciones de petición y permisos vigentes.
- Produces: recuperación uniforme para `401`, `403`, `404`, `409`, `422`, red y `5xx`.

- [ ] **Step 1: Escribir matriz RED de carreras y errores**

Probar búsqueda lenta vs rápida, detalle A vs B, `popstate`, cierre de sesión, mutación tardía después de perder permiso, `409` con borrador y `404` que retira `orderId`.

```tsx
permissions = [];
rerender();
lateMutation.resolve(updatedOrder);
await waitFor(() => expect(result.current.detail.data).toBeNull());
```

- [ ] **Step 2: Ejecutar RED**

```bash
npm test -- src/hooks/useOrdersWorkspace.test.tsx src/pages/OrdersPage.test.tsx
```

- [ ] **Step 3: Implementar invalidación centralizada**

Cada publicación validará generación, ID seleccionado y capacidad vigente. `409` recargará sin cerrar borrador; `403` borrará datos no autorizados; `404` cerrará el detalle; red/`5xx` ofrecerán reintento manual.

- [ ] **Step 4: Ejecutar GREEN y commit**

```bash
npm test -- src/hooks/useOrdersWorkspace.test.tsx src/pages/OrdersPage.test.tsx
npm run lint
npm run build
git add src/hooks/useOrdersWorkspace* src/pages/OrdersPage*
git commit -m "fix(ordenes): robustecer autorización y concurrencia"
```

---

### Task 14: Flujo integrado, responsive, documentación y verificación final

**Files:**
- Create: `src/orders-flow.integration.test.tsx`
- Modify: `src/components/orders/orders.css`
- Modify: `src/styles.css`
- Modify: `README.md`
- Modify: `docs/architecture/current-state.md`
- Modify: `docs/plans/implementation-plan.md`

**Interfaces:**
- Consumes: módulo completo de Tasks 1–13.
- Produces: flujo de aceptación, responsive final y documentación exacta.

- [ ] **Step 1: Escribir flujo integrado que falle**

Simular sesión administrativa para crear, editar, asignar, cancelar o ajustar; y sesión técnica principal para ejecutar `ASSIGNED → ON_ROUTE → IN_PROGRESS → PAUSED → IN_PROGRESS → COMPLETED`, agregar material, evidencia y consultar historial. Cada respuesta debe avanzar versión solo según la API simulada.

- [ ] **Step 2: Ejecutar RED focal**

```bash
npm test -- src/orders-flow.integration.test.tsx
```

- [ ] **Step 3: Cerrar responsive y accesibilidad**

Verificar tabla/panel desde 1024 px, tarjetas/overlay debajo, controles de 44 px, foco restaurado, `aria-live`, ruta operativa con texto y `prefers-reduced-motion`.

- [ ] **Step 4: Ejecutar GREEN focal y suite frontend**

```bash
npm test -- src/orders-flow.integration.test.tsx
npm test -- --pool=threads --maxWorkers=1
npm run lint
npm run build
```

Expected: todas las pruebas, lint y build en verde.

- [ ] **Step 5: Ejecutar suite backend completa del alcance**

Desde `server/`, cargando `server/.env` solo en el proceso y usando `DATABASE_TEST_URL`:

```bash
npm test -- tests/orders
npm run test:db -- tests/database/orders-read-persistence.test.ts tests/database/orders-mutation-persistence.test.ts tests/database/orders-operation-persistence.test.ts tests/orders/orders-http.test.ts
npm run typecheck
npm run lint
npm run build
```

Expected: PASS; cualquier advertencia conocida se documenta sin ocultar fallos.

- [ ] **Step 6: Ejecutar escaneos de seguridad y diff**

```bash
rg -n "localStorage|sessionStorage|document.cookie|Authorization.*Bearer" src server/src
rg -n "from .*mocks" src/api/orders.ts src/hooks/useOrdersWorkspace.ts src/components/orders src/pages/OrdersPage.tsx
git diff --check
```

Expected: ninguna coincidencia sensible ni importación de mocks en Órdenes; `git diff --check` sin salida.

- [ ] **Step 7: Actualizar documentación**

Documentar `/ordenes`, catálogo, permisos, filtros URL, flujo por estado, materiales, evidencias, conflictos y comandos de prueba. Marcar solo el subbloque de Órdenes de la fase 12 como completado.

- [ ] **Step 8: Commit final**

```bash
git add src README.md docs/architecture/current-state.md docs/plans/implementation-plan.md
git commit -m "docs(ordenes): cerrar integración frontend"
```

- [ ] **Step 9: Revisión final**

Aplicar revisión de requisitos y calidad sobre todo el rango de commits; corregir únicamente hallazgos reproducibles y repetir la matriz completa antes de fusionar.
