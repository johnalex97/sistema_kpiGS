# Integración frontend de Técnicos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir `/tecnicos` en un módulo administrativo persistente con ciclo laboral completo, selector de usuarios elegibles y KPI semanal real.

**Architecture:** Una frontera frontend vertical (`models → api → helpers → workspace → components → page`) consumirá la API existente de técnicos y el dashboard KPI sin mezclar contratos laborales con métricas. El backend añadirá una única lectura paginada de usuarios elegibles reutilizando las reglas de vinculación existentes; todas las mutaciones conservarán control optimista por `version`.

**Tech Stack:** React 18, TypeScript estricto, Vitest, React Testing Library, Express 5, Zod 4, Prisma 7 y PostgreSQL.

**Spec:** `docs/superpowers/specs/2026-08-27-technicians-frontend-integration-design.md`

## Global Constraints

- No añadir dependencias de producción ni reemplazar History API.
- Mantener `credentials: "include"` y la envoltura HTTP común de `src/api/http.ts`.
- Lecturas exigen `TECHNICIANS_VIEW`; mutaciones y usuarios elegibles exigen `TECHNICIANS_MANAGE`.
- KPI del equipo se consulta sólo con `KPI_VIEW_ALL`; su error nunca bloquea el catálogo laboral.
- Toda mutación posterior a crear envía una `version` positiva y nunca se reintenta automáticamente tras `VERSION_CONFLICT`.
- No crear usuarios, cambiar fórmulas KPI, automatizar estados ni migrar la jornada visual del Dashboard.
- Mantener mensajes visibles y commits en español.
- Verificar teclado, foco y layouts de 320, 768 y 1440 píxeles.

---

### Task 1: Contrato backend para usuarios elegibles

**Files:**
- Modify: `server/src/technicians/technicians.types.ts`
- Modify: `server/src/technicians/technicians.schemas.ts`
- Modify: `server/src/technicians/technicians.repository.ts`
- Modify: `server/src/technicians/technicians.service.ts`
- Test: `server/tests/technicians/technicians-schemas.test.ts`
- Test: `server/tests/technicians/technicians-service.test.ts`
- Test: `server/tests/database/technicians-persistence.test.ts`

**Interfaces:**
- Produces: `EligibleTechnicianUser`, `EligibleUserFilters`, `EligibleUserListResult`.
- Produces: `TechniciansRepository.listEligibleUsers(filters)`.
- Produces: `TechniciansService.listEligibleUsers(filters)`.
- Produces: `eligibleUserListQuerySchema`.

- [ ] **Step 1: Escribir pruebas fallidas del esquema**

Añadir casos que normalicen `search`, apliquen `page=1`, `pageSize=20`, acepten
`technicianId` UUID y rechacen UUID inválido o `pageSize > 50`:

```ts
expect(eligibleUserListQuerySchema.parse({ search: "  Ana  " })).toEqual({
  search: "Ana", page: 1, pageSize: 20,
});
expect(eligibleUserListQuerySchema.parse({
  technicianId: technicianId,
  page: "2",
  pageSize: "10",
})).toEqual({ technicianId, page: 2, pageSize: 10 });
expect(eligibleUserListQuerySchema.safeParse({ pageSize: 51 }).success).toBe(false);
```

- [ ] **Step 2: Ejecutar el esquema para comprobar RED**

Run: `npm test -- tests/technicians/technicians-schemas.test.ts` desde `server/`  
Expected: FAIL porque `eligibleUserListQuerySchema` no existe.

- [ ] **Step 3: Definir contratos y esquema mínimo**

Añadir en `technicians.types.ts`:

```ts
export interface EligibleTechnicianUser {
  id: string;
  email: string;
  displayName: string;
}
export interface EligibleUserFilters {
  search?: string | undefined;
  technicianId?: string | undefined;
  page: number;
  pageSize: number;
}
export interface EligibleUserListResult {
  items: EligibleTechnicianUser[];
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
}
```

Definir en `technicians.schemas.ts` un objeto estricto con búsqueda opcional,
UUID opcional, coerción numérica y máximo 50.

- [ ] **Step 4: Escribir pruebas fallidas de servicio y persistencia**

En servicio, comprobar que la paginación se calcula con cero páginas para cero
resultados. En PostgreSQL crear usuarios elegible, inactivo, eliminado, rol
incorrecto y vinculado; afirmar:

```ts
const page = await repository.listEligibleUsers({
  search: suffix, page: 1, pageSize: 20,
});
expect(page.items.map(({ id }) => id)).toEqual([eligibleId]);

const editing = await repository.listEligibleUsers({
  search: suffix, technicianId: linkedTechnicianId, page: 1, pageSize: 20,
});
expect(editing.items.map(({ id }) => id)).toEqual([eligibleId, linkedId]);
expect(JSON.stringify(editing.items)).not.toContain("password");
```

Ordenar los nombres de fixtures para que la expectativa sea estable.

- [ ] **Step 5: Ejecutar pruebas para comprobar RED**

Run: `npm test -- tests/technicians/technicians-service.test.ts` desde `server/`  
Expected: FAIL porque el servicio no expone `listEligibleUsers`.

Run: `npm run test:db -- tests/database/technicians-persistence.test.ts` desde `server/`  
Expected: FAIL porque el repositorio no implementa la consulta.

- [ ] **Step 6: Implementar consulta, mapeo y paginación**

Agregar al repositorio una consulta `usuario.findMany` y un `usuario.count` en
transacción. El `where` debe exigir usuario activo/no eliminado, rol
`TECHNICIAN` activo/no eliminado y:

```ts
OR: [
  { tecnico: null },
  ...(filters.technicianId
    ? [{ tecnico: { is: { id: filters.technicianId } } }]
    : []),
]
```

Buscar `displayName` o `email` sin distinguir mayúsculas, seleccionar solamente
`id`, `email`, `displayName` y ordenar por `displayName`, luego `id`. El servicio
debe devolver `items` y `pagination` con `Math.ceil(totalItems / pageSize)`.

- [ ] **Step 7: Verificar GREEN y regresión del módulo**

Run: `npm test -- tests/technicians/technicians-schemas.test.ts tests/technicians/technicians-service.test.ts` desde `server/`  
Expected: PASS.

Run: `npm run test:db -- tests/database/technicians-persistence.test.ts` desde `server/`  
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add server/src/technicians server/tests/technicians server/tests/database/technicians-persistence.test.ts
git commit -m "feat(técnicos): consultar usuarios elegibles"
```

---

### Task 2: Endpoint HTTP protegido de usuarios elegibles

**Files:**
- Modify: `server/src/technicians/technicians.controller.ts`
- Modify: `server/src/technicians/technicians.routes.ts`
- Test: `server/tests/technicians/technicians-http.test.ts`

**Interfaces:**
- Consumes: `eligibleUserListQuerySchema` y `service.listEligibleUsers` de Task 1.
- Produces: `GET /api/v1/technicians/eligible-users`.

- [ ] **Step 1: Escribir pruebas HTTP fallidas**

Añadir pruebas que verifiquen:

```ts
await request(app).get("/api/v1/technicians/eligible-users").expect(401);

const forbidden = await readOnlyAgent
  .get("/api/v1/technicians/eligible-users")
  .expect(403);
expect(forbidden.body.error.code).toBe("FORBIDDEN");

const response = await managerAgent
  .get("/api/v1/technicians/eligible-users?page=1&pageSize=20")
  .expect(200);
expect(response.body.data).toEqual(expect.objectContaining({
  items: expect.any(Array),
  pagination: expect.objectContaining({ page: 1, pageSize: 20 }),
}));
expect(JSON.stringify(response.body)).not.toContain("passwordHash");
```

También comprobar `search`, `technicianId` inválido y contraseña provisional.

- [ ] **Step 2: Ejecutar HTTP para comprobar RED**

Run: `npm test -- tests/technicians/technicians-http.test.ts` desde `server/`  
Expected: FAIL con 400/404 porque `eligible-users` cae en `/:id`.

- [ ] **Step 3: Implementar controller y registrar ruta en orden seguro**

Agregar `controller.eligibleUsers`, parsear la query y responder “Usuarios
elegibles consultados”. Registrar antes de `router.get("/:id", ...)`:

```ts
router.get(
  "/eligible-users",
  authentication,
  requirePasswordChanged,
  requirePermission("TECHNICIANS_MANAGE"),
  controller.eligibleUsers,
);
```

No aplicar `requireAllowedOrigin` a esta lectura.

- [ ] **Step 4: Verificar endpoint y regresión backend**

Run: `npm test -- tests/technicians` desde `server/`  
Expected: PASS.

Run: `npm run typecheck && npm run lint && npm run build` desde `server/`  
Expected: PASS sin advertencias nuevas.

- [ ] **Step 5: Commit**

```bash
git add server/src/technicians/technicians.controller.ts server/src/technicians/technicians.routes.ts server/tests/technicians/technicians-http.test.ts
git commit -m "feat(técnicos): exponer usuarios elegibles"
```

---

### Task 3: Modelos y cliente API frontend

**Files:**
- Create: `src/models/technician.ts`
- Create: `src/api/technicians.ts`
- Create: `src/api/technicians.test.ts`

**Interfaces:**
- Produces: `Technician`, `TechnicianPage`, `TechnicianListFilters`, entradas de mutación y `EligibleUserPage`.
- Produces: `TechnicianApi` y `createTechnicianApi()`.

- [ ] **Step 1: Escribir pruebas fallidas del cliente**

Cubrir serialización de lista, detalle, usuarios elegibles y las cinco
mutaciones. Ejemplo:

```ts
await createTechnicianApi().list({
  search: "Ana López",
  status: "AVAILABLE",
  includeInactive: true,
  page: 2,
  pageSize: 20,
});
expect(fetch).toHaveBeenCalledWith(
  expect.stringContaining("/technicians?search=Ana+L%C3%B3pez&status=AVAILABLE&includeInactive=true&page=2&pageSize=20"),
  expect.objectContaining({ credentials: "include" }),
);

await api.changeStatus("tech-1", { version: 3, status: "ON_ROUTE" });
expect(fetch).toHaveBeenLastCalledWith(
  expect.stringContaining("/technicians/tech-1/status"),
  expect.objectContaining({ method: "PATCH", body: JSON.stringify({ version: 3, status: "ON_ROUTE" }) }),
);
```

- [ ] **Step 2: Ejecutar para comprobar RED**

Run: `npm test -- src/api/technicians.test.ts`  
Expected: FAIL porque no existen los archivos.

- [ ] **Step 3: Definir modelos tipados**

Incluir contratos equivalentes al backend y entradas explícitas:

```ts
export type TechnicianStatus = "AVAILABLE" | "BUSY" | "ON_ROUTE" | "INACTIVE";
export type OperationalTechnicianStatus = Exclude<TechnicianStatus, "INACTIVE">;
export interface Technician {
  id: string; code: string; fullName: string; specialty: string | null;
  workPhone: string | null; workEmail: string | null; status: TechnicianStatus;
  hiredOn: string | null; leftOn: string | null;
  user: { id: string; email: string; displayName: string } | null;
  createdAt: string; updatedAt: string; version: number;
}
```

Definir `CreateTechnicianInput`, `UpdateTechnicianInput`,
`ChangeTechnicianStatusInput`, `DeactivateTechnicianInput` y
`ReactivateTechnicianInput` sin `Record<string, unknown>`.

- [ ] **Step 4: Implementar el cliente API**

Exponer:

```ts
interface TechnicianApi {
  list(filters: TechnicianListFilters, signal?: AbortSignal): Promise<TechnicianPage>;
  detail(id: string, signal?: AbortSignal): Promise<Technician>;
  eligibleUsers(search: string, page: number, technicianId?: string, signal?: AbortSignal): Promise<EligibleUserPage>;
  create(input: CreateTechnicianInput): Promise<Technician>;
  update(id: string, input: UpdateTechnicianInput): Promise<Technician>;
  changeStatus(id: string, input: ChangeTechnicianStatusInput): Promise<Technician>;
  deactivate(id: string, input: DeactivateTechnicianInput): Promise<Technician>;
  reactivate(id: string, input: ReactivateTechnicianInput): Promise<Technician>;
}
```

Usar `requestJson`, `encodeURIComponent`, `URLSearchParams` y `AbortSignal`.

- [ ] **Step 5: Verificar GREEN**

Run: `npm test -- src/api/technicians.test.ts`  
Expected: PASS.

Run: `npm run lint && npm run build`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/models/technician.ts src/api/technicians.ts src/api/technicians.test.ts
git commit -m "feat(técnicos): agregar cliente frontend tipado"
```

---

### Task 4: Estado URL y utilidades puras

**Files:**
- Create: `src/hooks/technician-workspace.helpers.ts`
- Create: `src/hooks/technician-workspace.helpers.test.ts`

**Interfaces:**
- Produces: `TechnicianQueryState`.
- Produces: `parseTechnicianSearch`, `serializeTechnicianSearch`, `currentWeekStart`, `indexTechnicianKpis`, `reconcileTechnician`.

- [ ] **Step 1: Escribir pruebas fallidas de URL y semana**

```ts
expect(parseTechnicianSearch("?technicianStatus=INACTIVE&technicianIncludeInactive=true&technicianPage=3")).toEqual({
  filters: { status: "INACTIVE", includeInactive: true, page: 3, pageSize: 20 },
});
expect(currentWeekStart(new Date("2026-08-27T12:00:00-06:00"))).toBe("2026-08-24");
```

Comprobar que valores inválidos vuelvan a defaults y que serializar preserve
parámetros ajenos como `utm_source`.

- [ ] **Step 2: Escribir pruebas fallidas de KPI y reconciliación**

```ts
const map = indexTechnicianKpis([{ technicianId: "tech-1", overallScore: "91.25" } as KpiDashboardItem]);
expect(map.get("tech-1")?.overallScore).toBe("91.25");
expect(reconcileTechnician(version3, version2)).toBe(version3);
expect(reconcileTechnician(version2, version3)).toBe(version3);
```

- [ ] **Step 3: Ejecutar para comprobar RED**

Run: `npm test -- src/hooks/technician-workspace.helpers.test.ts`  
Expected: FAIL porque las utilidades no existen.

- [ ] **Step 4: Implementar helpers sin efectos**

Usar prefijos `technicianSearch`, `technicianStatus`,
`technicianIncludeInactive`, `technicianPage`; fijar `pageSize: 20`. Calcular el
lunes con operaciones de fecha local y devolver `YYYY-MM-DD`. Reconciliar por
mayor `version`.

- [ ] **Step 5: Verificar GREEN y commit**

Run: `npm test -- src/hooks/technician-workspace.helpers.test.ts`  
Expected: PASS.

```bash
git add src/hooks/technician-workspace.helpers.ts src/hooks/technician-workspace.helpers.test.ts
git commit -m "feat(técnicos): sincronizar filtros y KPI"
```

---

### Task 5: Workspace de consulta y mutación

**Files:**
- Create: `src/hooks/useTechniciansWorkspace.ts`
- Create: `src/hooks/useTechniciansWorkspace.test.tsx`

**Interfaces:**
- Consumes: `TechnicianApi`, `KpiApi` y helpers de Task 4.
- Produces: `TechniciansWorkspace` para la página y componentes.

- [ ] **Step 1: Definir fixture y pruebas RED de lecturas**

Crear APIs falsas con `vi.fn`. Verificar carga paralela, búsqueda con 300 ms,
filtros, URL, paginación, descarte de respuesta obsoleta, aborto al desmontar,
detalle y error KPI no bloqueante:

```ts
const { result } = renderHook(() => useTechniciansWorkspace({
  api, kpiApi, search: "", canViewKpi: true,
  now: () => new Date("2026-08-27T12:00:00-06:00"),
}));
await waitFor(() => expect(result.current.listState).toBe("ready"));
expect(api.list).toHaveBeenCalledWith(expect.objectContaining({ page: 1, pageSize: 20 }), expect.any(AbortSignal));
expect(kpiApi.getDashboard).toHaveBeenCalledWith({ periodStart: "2026-08-24", granularity: "WEEK" }, expect.any(AbortSignal));
```

- [ ] **Step 2: Ejecutar lecturas para comprobar RED**

Run: `npm test -- src/hooks/useTechniciansWorkspace.test.tsx`  
Expected: FAIL porque el hook no existe.

- [ ] **Step 3: Implementar estado de lectura**

El hook debe exponer:

```ts
interface TechniciansWorkspace {
  query: TechnicianQueryState;
  page: TechnicianPage | null;
  selected: Technician | null;
  kpis: Map<string, KpiDashboardItem>;
  kpiState: "idle" | "loading" | "ready" | "error";
  listState: "loading" | "ready" | "empty" | "error";
  stale: boolean;
  listError: string | null;
  detailState: "idle" | "loading" | "ready" | "error";
  mutation: TechnicianMutationState | null;
  setFilters(patch: Partial<TechnicianListFilters>): void;
  retryList(): void;
  select(id: string): void;
  closeDetail(): void;
  createTechnician(input: CreateTechnicianInput): Promise<boolean>;
  updateTechnician(input: Omit<UpdateTechnicianInput, "version">): Promise<boolean>;
  changeStatus(status: OperationalTechnicianStatus): Promise<boolean>;
  deactivate(input: Omit<DeactivateTechnicianInput, "version">): Promise<boolean>;
  reactivate(reason: string): Promise<boolean>;
  clearMutationError(): void;
}
```

Mantener refs de generación/controladores como en `useActivitiesWorkspace`.
No usar polling en esta fase; refrescar después de mutaciones.

- [ ] **Step 4: Escribir pruebas RED de mutaciones y conflictos**

Probar crear, editar, estado, desactivar, reactivar y 409:

```ts
api.update.mockRejectedValueOnce(new ApiClientError(409, "VERSION_CONFLICT", "conflicto"));
const saved = await result.current.updateTechnician({ fullName: "Ana actualizada" });
expect(saved).toBe(false);
expect(result.current.mutation).toMatchObject({ conflict: true, pending: false });
expect(api.detail).toHaveBeenLastCalledWith("tech-1", expect.any(AbortSignal));
```

- [ ] **Step 5: Implementar mutaciones y traducción de errores**

Centralizar ejecución para impedir doble envío. Reconciliar DTOs por versión.
Mapear `WORK_EMAIL_ALREADY_EXISTS`, `USER_NOT_ELIGIBLE_AS_TECHNICIAN`,
`USER_ALREADY_LINKED`, `TECHNICIAN_HAS_ACTIVE_WORK`, `INVALID_TECHNICIAN_STATUS`,
403, 404 y `VERSION_CONFLICT` a mensajes en español. Conservar el editor abierto
cuando el método devuelva `false`.

- [ ] **Step 6: Verificar GREEN y commit**

Run: `npm test -- src/hooks/useTechniciansWorkspace.test.tsx src/hooks/technician-workspace.helpers.test.ts`  
Expected: PASS.

```bash
git add src/hooks/useTechniciansWorkspace.ts src/hooks/useTechniciansWorkspace.test.tsx
git commit -m "feat(técnicos): administrar estado persistente"
```

---

### Task 6: Lectura visual, resumen y detalle

**Files:**
- Create: `src/components/technicians/TechnicianSummary.tsx`
- Create: `src/components/technicians/TechnicianTable.tsx`
- Create: `src/components/technicians/TechnicianDetail.tsx`
- Create: `src/components/technicians/TechnicianReadView.test.tsx`
- Modify: `src/pages/TechniciansPage.tsx`
- Create: `src/pages/TechniciansPage.test.tsx`

**Interfaces:**
- Consumes: `TechniciansWorkspace`, `Technician`, `KpiDashboardItem`.
- Produces: pantalla real de sólo lectura y eventos `onSelect`/`onAction`.

- [ ] **Step 1: Escribir pruebas RED de presentación**

Verificar resumen, etiquetas de estado, KPI opcional, vacío, error, paginación y
detalle:

```tsx
render(<TechnicianTable technicians={[technician]} kpis={new Map([[technician.id, kpi]])} showKpi onSelect={onSelect} />);
expect(screen.getByText("Ana López")).toBeInTheDocument();
expect(screen.getByText("91.25")).toBeInTheDocument();
await user.click(screen.getByRole("button", { name: "Ver técnico Ana López" }));
expect(onSelect).toHaveBeenCalledWith(technician.id);
```

El mismo componente con `showKpi={false}` no debe renderizar encabezados KPI.

- [ ] **Step 2: Ejecutar para comprobar RED**

Run: `npm test -- src/components/technicians/TechnicianReadView.test.tsx src/pages/TechniciansPage.test.tsx`  
Expected: FAIL porque los componentes no existen y la página usa mocks.

- [ ] **Step 3: Implementar resumen, tabla y detalle**

Traducir estados mediante un mapa exhaustivo. Calcular resumen desde todos los
elementos de la página visible, etiquetándolo como “Resultados visibles”. Mostrar
KPI promedio sólo con valores disponibles. Formatear minutos como `6 h 05 min`.

`TechnicianDetail` será `aside role="dialog" aria-modal="false"`, recibirá foco,
cerrará con Escape y expondrá acciones sin decidir permisos internamente.

- [ ] **Step 4: Componer la página de lectura**

Permitir inyección de `api`, `kpiApi` y `now` en tests. Obtener permisos con
`useAuth`, crear el workspace y renderizar filtros con nombres accesibles:

```tsx
<TechniciansPage search={search} api={api} kpiApi={kpiApi} now={now} />
```

- [ ] **Step 5: Verificar GREEN y commit**

Run: `npm test -- src/components/technicians/TechnicianReadView.test.tsx src/pages/TechniciansPage.test.tsx`  
Expected: PASS.

```bash
git add src/components/technicians/TechnicianSummary.tsx src/components/technicians/TechnicianTable.tsx src/components/technicians/TechnicianDetail.tsx src/components/technicians/TechnicianReadView.test.tsx src/pages/TechniciansPage.tsx src/pages/TechniciansPage.test.tsx
git commit -m "feat(técnicos): mostrar catálogo y KPI semanal"
```

---

### Task 7: Formulario y selector de usuario

**Files:**
- Create: `src/components/technicians/EligibleUserCombobox.tsx`
- Create: `src/components/technicians/TechnicianForm.tsx`
- Create: `src/components/technicians/TechnicianForm.test.tsx`
- Modify: `src/pages/TechniciansPage.tsx`
- Modify: `src/pages/TechniciansPage.test.tsx`

**Interfaces:**
- Consumes: `TechnicianApi.eligibleUsers`, `CreateTechnicianInput`, `UpdateTechnicianInput`.
- Produces: formularios crear/editar que llaman al workspace sin incluir estado ni código.

- [ ] **Step 1: Escribir pruebas RED de selector**

Probar debounce, paginación, selección, limpiar, inclusión del usuario actual y
aborto al desmontar. La etiqueta de opción será
`"Ana López · ana@geek.test"`.

- [ ] **Step 2: Escribir pruebas RED del formulario**

```tsx
await user.type(screen.getByLabelText("Nombre completo"), "Ana López");
await user.type(screen.getByLabelText("Correo laboral"), "ANA@GEEK.TEST");
await user.click(screen.getByRole("button", { name: "Crear técnico" }));
expect(onSubmit).toHaveBeenCalledWith({
  fullName: "Ana López",
  specialty: null,
  workPhone: null,
  workEmail: "ana@geek.test",
  hiredOn: null,
  userId: null,
});
```

Probar nombre vacío, correo inválido, fecha futura, máximos y que editar preserve
valores iniciales.

- [ ] **Step 3: Ejecutar para comprobar RED**

Run: `npm test -- src/components/technicians/TechnicianForm.test.tsx`  
Expected: FAIL porque los componentes no existen.

- [ ] **Step 4: Implementar selector y formulario accesibles**

Reutilizar el patrón visual del combobox de Actividades sin importar su contrato
de dominio. El formulario tendrá `role="dialog"`, título, foco inicial, trampa
de foco, Escape, restauración de foco, `autoComplete` coherente (`name`, `email`,
`tel`) y bloqueo durante envío.

Los errores de API de campo permanecerán visibles sin cerrar el formulario.

- [ ] **Step 5: Integrar crear y editar por permiso**

Mostrar “Nuevo técnico” y “Editar” sólo con `TECHNICIANS_MANAGE`. Cerrar el
formulario únicamente cuando el workspace devuelva `true`.

- [ ] **Step 6: Verificar GREEN y commit**

Run: `npm test -- src/components/technicians/TechnicianForm.test.tsx src/pages/TechniciansPage.test.tsx`  
Expected: PASS.

```bash
git add src/components/technicians/EligibleUserCombobox.tsx src/components/technicians/TechnicianForm.tsx src/components/technicians/TechnicianForm.test.tsx src/pages/TechniciansPage.tsx src/pages/TechniciansPage.test.tsx
git commit -m "feat(técnicos): crear y editar perfiles laborales"
```

---

### Task 8: Estados, desactivación, reactivación y conflictos

**Files:**
- Create: `src/components/technicians/TechnicianActionDialog.tsx`
- Create: `src/components/technicians/TechnicianActionDialog.test.tsx`
- Modify: `src/components/technicians/TechnicianDetail.tsx`
- Modify: `src/pages/TechniciansPage.tsx`
- Modify: `src/pages/TechniciansPage.test.tsx`

**Interfaces:**
- Produces: acciones `status`, `deactivate`, `reactivate` con entradas validadas.
- Consumes: métodos de mutación de `TechniciansWorkspace`.

- [ ] **Step 1: Escribir pruebas RED de acciones**

Probar que activos ofrecen editar/cambiar estado/desactivar, inactivos sólo
reactivar, y lectores no reciben acciones administrativas. Validar razón entre
10 y 500, fecha de retiro y estados permitidos.

```tsx
await user.selectOptions(screen.getByLabelText("Nuevo estado"), "ON_ROUTE");
await user.click(screen.getByRole("button", { name: "Guardar estado" }));
expect(onConfirm).toHaveBeenCalledWith({ status: "ON_ROUTE" });
```

- [ ] **Step 2: Ejecutar para comprobar RED**

Run: `npm test -- src/components/technicians/TechnicianActionDialog.test.tsx src/pages/TechniciansPage.test.tsx`  
Expected: FAIL porque no existe el diálogo.

- [ ] **Step 3: Implementar diálogo y flujo de página**

Usar un único componente con unión discriminada:

```ts
type TechnicianAction =
  | { kind: "status"; technician: Technician }
  | { kind: "deactivate"; technician: Technician }
  | { kind: "reactivate"; technician: Technician };
```

Mantener foco atrapado y Escape bloqueado durante envío. Tras éxito, cerrar el
diálogo y conservar el detalle actualizado.

- [ ] **Step 4: Probar recuperación de conflictos en la página**

Simular `VERSION_CONFLICT`, afirmar que el diálogo permanece abierto, conserva
razón/estado, muestra el aviso y el detalle recibe la nueva versión.

- [ ] **Step 5: Verificar GREEN y commit**

Run: `npm test -- src/components/technicians src/pages/TechniciansPage.test.tsx src/hooks/useTechniciansWorkspace.test.tsx`  
Expected: PASS.

```bash
git add src/components/technicians src/pages/TechniciansPage.tsx src/pages/TechniciansPage.test.tsx
git commit -m "feat(técnicos): completar ciclo laboral"
```

---

### Task 9: Integración del shell, responsive y cierre de mocks

**Files:**
- Create: `src/technicians-flow.integration.test.tsx`
- Modify: `src/layouts/AppShell.tsx`
- Modify: `src/layouts/AppShell.test.tsx`
- Modify: `src/test/auth-test-utils.tsx`
- Modify: `src/styles.css`
- Modify: `src/mocks/data.ts`
- Modify: `src/models/app.ts`
- Modify: `README.md`
- Modify: `docs/architecture/current-state.md`
- Modify: `docs/plans/implementation-plan.md`

**Interfaces:**
- Consumes: módulo completo de Tasks 1–8.
- Produces: recorrido real desde `AppShell` y documentación actualizada.

- [ ] **Step 1: Escribir prueba integrada RED**

Montar `AppShell` en `/tecnicos` con `fetch` dirigido por método/ruta. Recorrer:

```text
listar → crear → abrir detalle → editar → cambiar a En ruta
→ desactivar → incluir inactivos → reactivar
```

Afirmar que cada request usa la versión devuelta por la mutación anterior y que
el selector obtiene `/technicians/eligible-users`.

- [ ] **Step 2: Ejecutar para comprobar RED**

Run: `npm test -- src/technicians-flow.integration.test.tsx`  
Expected: FAIL porque `AppShell` no entrega la búsqueda y el flujo aún no está integrado.

- [ ] **Step 3: Integrar el shell y retirar la dependencia mock de la página**

Cambiar la frontera a:

```tsx
case "Técnicos": return <TechniciansPage search={search} />;
```

Añadir `TECHNICIANS_MANAGE` al usuario administrador de pruebas. Retirar el tipo
`Technician` mock sólo si ningún consumidor lo necesita; mantener la colección
`technicians` explícitamente limitada al cronograma del Dashboard hasta su
migración posterior.

- [ ] **Step 4: Aplicar diseño responsive y accesible**

Crear selectores `.technicians-*` con tabla de escritorio, transformación a
tarjetas bajo el breakpoint móvil, panel lateral y formularios. Reutilizar
tokens existentes, `:focus-visible`, `overscroll-behavior`, `overflow-wrap`,
áreas táctiles y `prefers-reduced-motion`.

Auditar por código y, si existe navegador automatizado local, visualizar 320,
768 y 1440. No afirmar prueba visual con navegador si sólo se verificó CSS.

- [ ] **Step 5: Actualizar documentación**

Registrar Técnicos como consumidor de API real, limitar los mocks restantes al
Dashboard/Reincidencias y marcar el nuevo subbloque de fase 12 como completado.
Documentar el endpoint de usuarios elegibles y los permisos.

- [ ] **Step 6: Ejecutar matriz frontend completa**

Run: `npm test`  
Expected: todas las pruebas PASS.

Run: `npm run lint && npm run build`  
Expected: PASS.

- [ ] **Step 7: Ejecutar matriz backend focal y completa**

Run: `npm test -- tests/technicians` desde `server/`  
Expected: PASS.

Run: `npm run test:db -- tests/database/technicians-persistence.test.ts tests/technicians/technicians-http.test.ts` desde `server/`  
Expected: PASS contra `schema=test`.

Run: `npm run typecheck && npm run lint && npm run build` desde `server/`  
Expected: PASS.

- [ ] **Step 8: Revisar seguridad y diff**

Run: `rg -n "localStorage|sessionStorage|document\.cookie|Authorization.*Bearer" src`  
Expected: sin almacenamiento de sesión ni bearer manual.

Run: `rg -n "from .*mocks/data|technicians" src/pages/TechniciansPage.tsx src/components/technicians src/hooks/useTechniciansWorkspace.ts`  
Expected: sin imports de mocks.

Run: `git diff --check`  
Expected: sin errores.

- [ ] **Step 9: Commit**

```bash
git add README.md docs/architecture/current-state.md docs/plans/implementation-plan.md src/technicians-flow.integration.test.tsx src/layouts src/test/auth-test-utils.tsx src/styles.css src/mocks/data.ts src/models/app.ts
git commit -m "feat(técnicos): conectar administración completa a la API"
```

---

## Matriz final de aceptación

- [ ] El backend lista usuarios elegibles sin datos sensibles.
- [ ] `/tecnicos` no usa mocks como fuente laboral o KPI.
- [ ] Búsqueda, filtros, inactivos y paginación sobreviven en la URL.
- [ ] Lectores ven catálogo; administradores completan todo el ciclo laboral.
- [ ] KPI semanal aparece sólo con `KPI_VIEW_ALL` y sus fallos son no bloqueantes.
- [ ] Conflictos preservan entrada y recargan la versión vigente.
- [ ] Teclado, foco y estructura responsive están cubiertos.
- [ ] Frontend y backend pasan pruebas, lint, typecheck y build.

