# Activities Frontend API Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar las actividades simuladas por el ciclo diario completo y persistente de la API para técnicos, supervisores y administradores.

**Architecture:** Un cliente HTTP tipado y un workspace React aislado concentran consultas, filtros, polling, reloj, selección y mutaciones. La página compone componentes accesibles; `AppShell` sólo entrega navegación, búsqueda y permisos, mientras PostgreSQL permanece como fuente de verdad.

**Tech Stack:** React 18, TypeScript estricto, History API, Fetch, Vitest, React Testing Library, Express/Prisma/PostgreSQL existentes.

**Spec:** `docs/superpowers/specs/2026-08-26-activities-frontend-integration-design.md`

## Global Constraints

- No añadir dependencias npm ni una librería de caché.
- No modificar fórmulas KPI, contratos backend ni migraciones salvo defecto bloqueante demostrado y aprobado.
- No usar `localStorage`, `sessionStorage`, `document.cookie` ni tokens Bearer.
- Toda petición usa `requestJson`, cookie HttpOnly implícita y `credentials: "include"`.
- El backend sigue siendo la única autoridad; los permisos frontend son affordances visuales.
- No repetir automáticamente mutaciones; `409 VERSION_CONFLICT` exige recargar y revisar.
- El polling es de 30 segundos sólo con documento visible; el reloj visual actualiza cada segundo sin escribir.
- Fechas manuales usan hora local `America/Tegucigalpa`, se envían como ISO con offset y abarcan de 1 minuto a 24 horas sin futuro.
- Equipos administrativos tienen exactamente un responsable, técnicos únicos y suma decimal `100.00`; el técnico registra trabajo propio.
- El flujo de reincidencias permanece fuera de Actividades; eliminar su checkbox simulado.
- Mantener accesibilidad por teclado, foco, `aria-live`, `role="alert"`, 320/768/1440 px y `prefers-reduced-motion`.
- Las pruebas mockean sólo las fronteras HTTP/API; no redefinen la lógica interna del workspace.

---

### Task 1: Contratos tipados y cliente HTTP de Actividades

**Files:**
- Create: `src/models/activity.ts`
- Create: `src/api/activities.ts`
- Create: `src/api/activities.test.ts`

**Interfaces:**
- Consumes: `requestJson<T>(path, init?, options?)`, `ApiClientError`, `ApiNetworkError`.
- Produces: `ActivityApi`, `createActivityApi()`, DTOs, filtros y entradas de comandos usados por Tasks 3–8.

- [ ] **Step 1: Escribir pruebas fallidas de listado y catálogo**

Crear `src/api/activities.test.ts` con un `fetch` stub que responda envolturas `{ data }` y verificar la URL real:

```ts
function jsonResponse<T>(data: T, status = 200) {
  return new Response(JSON.stringify({ data }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const pagination = { page: 1, pageSize: 25, totalItems: 0, totalPages: 0 };

it("serializa estados repetidos, fechas y paginación", async () => {
  const fetchMock = vi.fn(async () => jsonResponse({ items: [], pagination }));
  vi.stubGlobal("fetch", fetchMock);
  await createActivityApi().list({
    status: ["PENDING", "IN_PROGRESS"],
    search: "router central",
    startedFrom: "2026-08-26T06:00:00.000-06:00",
    page: 2,
    pageSize: 25,
  });
  const [url, init] = fetchMock.mock.calls[0]!;
  expect(String(url)).toContain("status=PENDING");
  expect(String(url)).toContain("status=IN_PROGRESS");
  expect(String(url)).toContain("search=router+central");
  expect(String(url)).toContain("page=2&pageSize=25");
  expect(init).toEqual(expect.objectContaining({ credentials: "include" }));
});

it("consulta catálogo y detalle sin alterar identificadores", async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(jsonResponse([activityType]))
    .mockResolvedValueOnce(jsonResponse(activityDetail));
  vi.stubGlobal("fetch", fetchMock);
  const api = createActivityApi();
  await expect(api.listTypes()).resolves.toEqual([activityType]);
  await expect(api.detail(activityDetail.id)).resolves.toEqual(activityDetail);
  expect(fetchMock.mock.calls[1]?.[0]).toContain(`/activities/${activityDetail.id}`);
});
```

Definir en el test fixtures completas con UUID, `version`, branch/client, tipo,
responsable, fechas y paginación.

- [ ] **Step 2: Ejecutar RED del cliente de lectura**

Run: `npm test -- src/api/activities.test.ts`

Expected: FAIL porque `src/api/activities.ts` y `src/models/activity.ts` no existen.

- [ ] **Step 3: Implementar DTOs y filtros exactos**

En `src/models/activity.ts` definir:

```ts
export type ActivityStatus = "PENDING" | "IN_PROGRESS" | "PAUSED" | "COMPLETED" | "CANCELLED";
export type ActivityTeamRole = "RESPONSIBLE" | "PARTICIPANT";
export type ActivityActionCommand =
  | { type: "start" }
  | { type: "pause"; reason: string }
  | { type: "resume" }
  | { type: "complete"; result: string; observations?: string | null }
  | { type: "cancel"; reason: string }
  | { type: "adjust"; input: Omit<AdjustActivityInput, "version"> };
export type ActivityDetailAction = ActivityActionCommand["type"] | "edit" | "team";

export interface ActivityType { id: string; code: string; name: string; description: string | null; displayOrder: number }
export interface ActivityTechnician { id: string; code: string; fullName: string }
export interface ActivityTeamMember {
  technician: ActivityTechnician;
  role: ActivityTeamRole;
  participationPercentage: string;
  startedAt: string | null;
  endedAt: string | null;
}
export interface ActivityPause { id: string; startedAt: string; endedAt: string | null; reason: string }
export interface ActivitySummary {
  id: string;
  branch: { id: string; code: string; name: string; client: { id: string; code: string; tradeName: string } };
  order: { id: string; orderNumber: string } | null;
  activityType: ActivityType;
  status: ActivityStatus;
  description: string;
  result: string | null;
  responsible: ActivityTechnician | null;
  startedAt: string | null;
  endedAt: string | null;
  pausedMinutes: number;
  productiveMinutes: number | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}
export interface ActivityDetail extends ActivitySummary { observations: string | null; team: ActivityTeamMember[]; pauses: ActivityPause[] }
export interface ActivityPagination { page: number; pageSize: number; totalItems: number; totalPages: number }
export interface ActivityPage { items: ActivitySummary[]; pagination: ActivityPagination }
export interface ActivityListFilters {
  search?: string; status?: ActivityStatus[]; activityTypeId?: string; clientId?: string;
  branchId?: string; orderId?: string; technicianId?: string; startedFrom?: string; startedTo?: string;
  page: number; pageSize: number;
}
export interface ActivityTeamInput { technicianId: string; role: ActivityTeamRole; participationPercentage: string }
export interface CreateActivityInput {
  branchId?: string; orderId?: string; activityTypeId: string; description: string;
  observations?: string; team?: ActivityTeamInput[];
}
export interface ManualActivityInput extends CreateActivityInput {
  startedAt: string; endedAt: string; result: string; justification: string;
}
```

Añadir tipos `UpdateActivityInput`, `PauseActivityInput`,
`CompleteActivityInput`, `CancelActivityInput` y `AdjustActivityInput` con
`version` y los campos exactos del backend.

- [ ] **Step 4: Implementar lectura y serialización**

En `src/api/activities.ts` producir:

```ts
export interface ActivityApi {
  listTypes(signal?: AbortSignal): Promise<ActivityType[]>;
  list(filters: ActivityListFilters, signal?: AbortSignal): Promise<ActivityPage>;
  detail(id: string, signal?: AbortSignal): Promise<ActivityDetail>;
  create(input: CreateActivityInput): Promise<ActivityDetail>;
  createManual(input: ManualActivityInput): Promise<ActivityDetail>;
  update(id: string, input: UpdateActivityInput): Promise<ActivityDetail>;
  replaceTeam(id: string, version: number, team: ActivityTeamInput[]): Promise<ActivityDetail>;
  start(id: string, version: number): Promise<ActivityDetail>;
  pause(id: string, input: PauseActivityInput): Promise<ActivityDetail>;
  resume(id: string, version: number): Promise<ActivityDetail>;
  complete(id: string, input: CompleteActivityInput): Promise<ActivityDetail>;
  cancel(id: string, input: CancelActivityInput): Promise<ActivityDetail>;
  adjust(id: string, input: AdjustActivityInput): Promise<ActivityDetail>;
}

function activityQuery(filters: ActivityListFilters) {
  const query = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (Array.isArray(value)) value.forEach((item) => query.append(key, item));
    else if (value !== undefined && value !== "") query.set(key, String(value));
  });
  return query.toString();
}
```

Usar `encodeURIComponent(id)` en paths y `JSON.stringify` en mutaciones.

- [ ] **Step 5: Añadir pruebas fallidas de cada mutación**

Probar al menos una tabla de casos con método, ruta y cuerpo:

```ts
it("envía versión y motivo al pausar", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(activityDetail)));
  await createActivityApi().pause("a1", { version: 4, reason: "Almuerzo" });
  expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/activities/a1/pause"), expect.objectContaining({
    method: "POST",
    body: JSON.stringify({ version: 4, reason: "Almuerzo" }),
    credentials: "include",
  }));
});

it("envía resultado al completar", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(activityDetail)));
  await createActivityApi().complete("a1", { version: 5, result: "Operativo" });
  expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/activities/a1/complete"), expect.objectContaining({
    method: "POST",
    body: JSON.stringify({ version: 5, result: "Operativo" }),
  }));
});
```

Repetir aserciones directas para `create`, `createManual`, `update`,
`replaceTeam`, `start`, `resume`, `cancel` y `adjust`; cada caso verifica path,
método y cuerpo exactos.

- [ ] **Step 6: Ejecutar GREEN y commit**

Run: `npm test -- src/api/activities.test.ts`

Expected: PASS.

```bash
git add src/models/activity.ts src/api/activities.ts src/api/activities.test.ts
git commit -m "feat(activities): add typed frontend API client"
```

---

### Task 2: APIs de catálogos auxiliares

**Files:**
- Create: `src/api/activity-lookups.ts`
- Create: `src/api/activity-lookups.test.ts`
- Modify: `src/models/activity.ts`

**Interfaces:**
- Consumes: `requestJson`, paginación común y contratos públicos existentes.
- Produces: `ActivityLookupApi`, `createActivityLookupApi()`, `OrderOption`, `ClientOption`, `BranchOption`, `TechnicianOption`.

- [ ] **Step 1: Escribir pruebas fallidas de búsqueda paginada**

En `activity-lookups.test.ts`, definir `lookupFetch(payload)` como una fábrica local
de `vi.fn()` que devuelve `Response(JSON.stringify(payload))`, además de fixtures
tipados `orderPage` y `branchPage` con una sola opción y metadatos de paginación.

```ts
it("busca órdenes activas sin descargar el catálogo completo", async () => {
  vi.stubGlobal("fetch", lookupFetch(orderPage));
  await createActivityLookupApi().orders("OT-2026", 1);
  expect(fetch).toHaveBeenCalledWith(
    expect.stringMatching(/\/orders\?.*search=OT-2026.*page=1.*pageSize=20/),
    expect.objectContaining({ credentials: "include" }),
  );
});

it("carga sucursales activas del cliente seleccionado", async () => {
  vi.stubGlobal("fetch", lookupFetch(branchPage));
  await createActivityLookupApi().branches("client-1", "Centro", 1);
  expect(fetch).toHaveBeenCalledWith(
    expect.stringContaining("/clients/client-1/branches?search=Centro"),
    expect.any(Object),
  );
});
```

- [ ] **Step 2: Ejecutar RED**

Run: `npm test -- src/api/activity-lookups.test.ts`

Expected: FAIL por módulo ausente.

- [ ] **Step 3: Definir opciones mínimas y cliente**

Añadir al modelo:

```ts
export interface LookupPage<T> { items: T[]; pagination: ActivityPagination }
export interface OrderOption { id: string; orderNumber: string; clientName: string; branchName: string; status: string }
export interface ClientOption { id: string; code: string; tradeName: string }
export interface BranchOption { id: string; code: string; name: string; address: string; isEffectivelyActive: boolean }
export interface TechnicianOption { id: string; code: string; fullName: string; status: "AVAILABLE" | "BUSY" | "ON_ROUTE" }
```

En `activity-lookups.ts` definir:

```ts
export interface ActivityLookupApi {
  orders(search: string, page: number, signal?: AbortSignal): Promise<LookupPage<OrderOption>>;
  clients(search: string, page: number, signal?: AbortSignal): Promise<LookupPage<ClientOption>>;
  branches(clientId: string, search: string, page: number, signal?: AbortSignal): Promise<LookupPage<BranchOption>>;
  technicians(search: string, page: number, signal?: AbortSignal): Promise<LookupPage<TechnicianOption>>;
}
```

Mapear DTOs para que los formularios no dependan de campos administrativos.
Órdenes envían estados repetidos `PENDING`, `ASSIGNED`, `ON_ROUTE`,
`IN_PROGRESS`, `PAUSED` y `COMPLETED`, nunca `CANCELLED`;
clientes/sucursales/técnicos usan `includeInactive=false` y conservan la
paginación del servidor.

- [ ] **Step 4: Probar mapeo, aborto y errores**

Añadir casos que verifiquen `signal`, caracteres codificados, exclusión de
inactivos y propagación de `ApiClientError` sin convertir mensajes crudos.

Run: `npm test -- src/api/activity-lookups.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/models/activity.ts src/api/activity-lookups.ts src/api/activity-lookups.test.ts
git commit -m "feat(activities): add paginated form lookups"
```

---

### Task 3: Utilidades puras de filtros, URL y reloj

**Files:**
- Create: `src/hooks/activity-workspace.helpers.ts`
- Create: `src/hooks/activity-workspace.helpers.test.ts`

**Interfaces:**
- Consumes: `ActivityDetail`, `ActivityListFilters`, `ActivityStatus`.
- Produces: `ActivityView`, `defaultActivityFilters`, `parseActivitySearch`, `serializeActivitySearch`, `activityElapsedMs`, `formatActivityDuration`, `tegucigalpaDayRange`.

- [ ] **Step 1: Escribir pruebas fallidas de URL segura**

```ts
it("normaliza vista, página y estados inválidos", () => {
  expect(parseActivitySearch("?activityView=unknown&activityPage=-4&activityStatus=HACKED"))
    .toMatchObject({ view: "open", filters: { page: 1, pageSize: 25, status: ["PENDING", "IN_PROGRESS", "PAUSED"] } });
});

it("serializa filtros repetidos y conserva parámetros ajenos", () => {
  const query = serializeActivitySearch("?source=shell", {
    view: "history", filters: { page: 2, pageSize: 25, status: ["COMPLETED", "CANCELLED"] },
  });
  expect(query.get("source")).toBe("shell");
  expect(query.getAll("activityStatus")).toEqual(["COMPLETED", "CANCELLED"]);
});
```

- [ ] **Step 2: Ejecutar RED**

Run: `npm test -- src/hooks/activity-workspace.helpers.test.ts`

Expected: FAIL por helper ausente.

- [ ] **Step 3: Implementar parser/serializer y rango local**

```ts
export type ActivityView = "open" | "history";
export interface ActivityQueryState { view: ActivityView; filters: ActivityListFilters }

export function tegucigalpaDayRange(now: Date): { startedFrom: string; startedTo: string } {
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Tegucigalpa", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
  return {
    startedFrom: `${date}T00:00:00.000-06:00`,
    startedTo: `${date}T23:59:59.999-06:00`,
  };
}
```

Aceptar sólo estados conocidos, enteros positivos y `pageSize=25`. En Historial
aplicar hoy por defecto; “Todas las fechas” elimina ambos extremos.

- [ ] **Step 4: Escribir RED del reloj con pausa abierta**

Definir `activity(overrides)` en este test como una fábrica de `ActivityDetail`
válido que aplica los campos recibidos sobre un fixture base completo.

```ts
it("descuenta pausas cerradas y congela una pausa abierta", () => {
  const detail = activity({
    startedAt: "2026-08-26T08:00:00.000Z",
    pauses: [
      { id: "p1", startedAt: "2026-08-26T08:30:00.000Z", endedAt: "2026-08-26T08:40:00.000Z", reason: "Traslado" },
      { id: "p2", startedAt: "2026-08-26T09:00:00.000Z", endedAt: null, reason: "Espera" },
    ],
  });
  expect(activityElapsedMs(detail, new Date("2026-08-26T09:30:00.000Z"))).toBe(50 * 60_000);
  expect(formatActivityDuration(50 * 60_000)).toBe("00:50:00");
});
```

- [ ] **Step 5: Implementar reloj y GREEN**

Calcular el final efectivo como `endedAt`, inicio de pausa abierta o `now`; restar
pausas cerradas y nunca devolver negativo.

Run: `npm test -- src/hooks/activity-workspace.helpers.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/activity-workspace.helpers.ts src/hooks/activity-workspace.helpers.test.ts
git commit -m "feat(activities): add query and timer primitives"
```

---

### Task 4: Workspace de lectura, selección y sincronización

**Files:**
- Create: `src/hooks/useActivitiesWorkspace.ts`
- Create: `src/hooks/useActivitiesWorkspace.test.tsx`
- Modify: `src/hooks/activity-workspace.helpers.ts`

**Interfaces:**
- Consumes: `ActivityApi`, helpers de Task 3, `window.history`, `document.visibilityState`.
- Produces: `ActivitiesWorkspace`, `useActivitiesWorkspace(options)`; Tasks 5–8 consumen este contrato.

- [ ] **Step 1: Definir el contrato y prueba RED inicial**

En el test, definir `resolved(value)` como `vi.fn().mockResolvedValue(value)` y
`activityApiMock(overrides)` como una implementación completa de `ActivityApi`
con defaults tipados y las operaciones indicadas en `overrides`.

```ts
export interface ActivitiesWorkspace {
  query: ActivityQueryState;
  page: ActivityPage | null;
  selected: ActivityDetail | null;
  listState: "loading" | "ready" | "empty" | "error";
  stale: boolean;
  listError: string | null;
  detailState: "idle" | "loading" | "ready" | "error";
  setView(view: ActivityView): void;
  setFilters(patch: Partial<ActivityListFilters>): void;
  retryList(): void;
  select(id: string): void;
  closeDetail(): void;
  refresh(): Promise<void>;
}

export interface UseActivitiesWorkspaceOptions {
  api: ActivityApi;
  search: string;
  pollIntervalMs?: number;
  now?: () => Date;
}

it("carga la consulta inicial y selecciona detalle real", async () => {
  const api = activityApiMock({ list: resolved(page), detail: resolved(detail) });
  const { result } = renderHook(() => useActivitiesWorkspace({ api, search: "router", pollIntervalMs: 30_000 }));
  await waitFor(() => expect(result.current.listState).toBe("ready"));
  act(() => result.current.select(detail.id));
  await waitFor(() => expect(result.current.selected).toEqual(detail));
});
```

- [ ] **Step 2: Ejecutar RED**

Run: `npm test -- src/hooks/useActivitiesWorkspace.test.tsx`

Expected: FAIL por hook ausente.

- [ ] **Step 3: Implementar carga con generaciones y aborto**

Crear `AbortController` por listado/detalle, abortar al cambiar filtros o desmontar
y usar un contador de generación antes de aplicar resultados. `AbortError` no
produce mensaje. Error de red con página previa conserva datos y marca `stale`;
sin página previa produce `error`.

- [ ] **Step 4: Probar filtros, debounce y URL**

Con fake timers verificar:

Definir dentro del test `controlledActivityApi()` con promesas diferidas separadas
por solicitud y métodos `resolveOld`/`resolveLatest`; `pageWith(description)` debe
crear un `ActivityPage` mínimo con una actividad cuya descripción sea la recibida.

```ts
it("debouncea búsqueda y descarta la respuesta anterior", async () => {
  vi.useFakeTimers();
  const api = controlledActivityApi();
  const { result, rerender } = renderHook(({ search }) => useActivitiesWorkspace({ api, search, pollIntervalMs: 30_000 }), { initialProps: { search: "rou" } });
  rerender({ search: "router" });
  await act(() => vi.advanceTimersByTimeAsync(300));
  expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({ search: "router", page: 1 }), expect.any(AbortSignal));
  api.resolveOld(pageWith("obsoleto"));
  expect(result.current.page?.items.some((item) => item.description === "obsoleto")).toBe(false);
});
```

- [ ] **Step 5: Probar polling visible y detalle no intrusivo**

Cambiar `document.visibilityState` mediante descriptor configurable. Verificar una
consulta a los 30 segundos visible, ninguna mientras está oculto y una al volver.
El polling no cambia `listState` a `loading` ni cierra `selected`.

- [ ] **Step 6: GREEN y commit**

Run: `npm test -- src/hooks/useActivitiesWorkspace.test.tsx src/hooks/activity-workspace.helpers.test.ts`

Expected: PASS.

```bash
git add src/hooks/useActivitiesWorkspace.ts src/hooks/useActivitiesWorkspace.test.tsx src/hooks/activity-workspace.helpers.ts
git commit -m "feat(activities): add synchronized read workspace"
```

---

### Task 5: Pantalla real de consulta y detalle

**Files:**
- Create: `src/components/activities/ActivityTable.tsx`
- Create: `src/components/activities/ActivityDetail.tsx`
- Create: `src/pages/ActivitiesPage.test.tsx`
- Modify: `src/pages/ActivitiesPage.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `ActivitiesWorkspace`, `ActivitySummary`, `ActivityDetail`, `formatActivityDuration`, `useAuth().hasPermission`.
- Produces: `ActivitiesPage({ search, api?, lookupApi?, workspace? })`, tabla/tarjetas y panel de detalle accesibles.

- [ ] **Step 1: Escribir RED de estados de página**

En `ActivitiesPage.test.tsx`, crear fixtures tipados para `loadingState`,
`emptyState`, `errorState` y `staleState`. `workspaceSequence(states)` será un helper
local que expone el primer estado en `current` y avanza determinísticamente con
`next()`, sin timers ni estado global.

```tsx
it("muestra carga, vacío, error recuperable y datos obsoletos", async () => {
  const workspace = workspaceSequence([loadingState, emptyState, errorState, staleState]);
  const view = render(<ActivitiesPage search="" workspace={workspace.current} />);
  expect(screen.getByRole("status")).toHaveTextContent("Cargando actividades");
  view.rerender(<ActivitiesPage search="" workspace={workspace.next()} />);
  expect(screen.getByText("No hay actividades para estos filtros")).toBeInTheDocument();
  view.rerender(<ActivitiesPage search="" workspace={workspace.next()} />);
  expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  view.rerender(<ActivitiesPage search="" workspace={workspace.next()} />);
  expect(screen.getByRole("status")).toHaveTextContent("Los datos pueden estar desactualizados");
});
```

Permitir una prop `workspace` sólo como seam de prueba; producción la omite y
crea el hook real con `createActivityApi()`.

- [ ] **Step 2: Ejecutar RED**

Run: `npm test -- src/pages/ActivitiesPage.test.tsx`

Expected: FAIL porque la página aún recibe `works` simulados.

- [ ] **Step 3: Implementar toolbar, tabs, filtros y paginación**

Mostrar conteos desde `pagination.totalItems`, tabs Abiertas/Historial, filtros
tipados y controles anterior/siguiente. En Historial explicar que cancelaciones
sin inicio requieren “Todas las fechas”. Cada cambio llama `setFilters` y vuelve
a página 1 mediante el workspace.

- [ ] **Step 4: Implementar tabla/tarjetas y detalle**

`ActivityTable` usa encabezados semánticos, botones de fila con nombre “Ver
actividad …”, estado textual y tiempo tabular. `ActivityDetail` recibe:

```ts
interface ActivityDetailProps {
  activity: ActivityDetail;
  now: Date;
  onClose(): void;
  onAction(action: ActivityDetailAction): void;
}
```

Cerrar por Escape, restaurar foco al botón de fila y no anunciar ticks del reloj
con `aria-live`.

- [ ] **Step 5: Añadir pruebas de permisos y foco**

Probar técnico/admin, estados de cada fila, apertura/cierre por teclado, detalle
con equipo/pausas y ausencia de acciones no concedidas.

Run: `npm test -- src/pages/ActivitiesPage.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/activities/ActivityTable.tsx src/components/activities/ActivityDetail.tsx src/pages/ActivitiesPage.tsx src/pages/ActivitiesPage.test.tsx src/styles.css
git commit -m "feat(activities): render persistent daily workspace"
```

---

### Task 6: Formulario programado/manual y editor de equipo

**Files:**
- Create: `src/components/activities/ActivityForm.tsx`
- Create: `src/components/activities/ActivityForm.test.tsx`
- Create: `src/components/activities/ActivityTeamEditor.tsx`
- Create: `src/components/activities/ActivityTeamEditor.test.tsx`
- Modify: `src/models/activity.ts`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `ActivityLookupApi`, `ActivityType[]`, usuario/permisos de AuthContext.
- Produces: `ActivityFormActor`, `ActivityFormValue`, `ActivityForm({ mode, activityTypes, lookupApi, actor, onSubmit, onCancel })`, `ActivityTeamEditor`.

- [ ] **Step 1: Escribir RED de modos y origen exclusivo**

En `ActivityForm.test.tsx`, definir fixtures tipados `lookupApi` y `actor`.
`renderForm` debe renderizar el formulario con esos defaults y permitir overrides;
`selectOrder(label)` abre el combobox, escribe el término y elige por nombre
accesible la opción esperada usando `userEvent`.

```tsx
it("crea una programada vinculada a orden", async () => {
  const onSubmit = vi.fn(async () => undefined);
  renderForm({ onSubmit, lookupApi });
  await user.click(screen.getByRole("radio", { name: "Orden existente" }));
  await selectOrder("OT-2026-0042");
  await user.selectOptions(screen.getByLabelText("Tipo de actividad"), "type-1");
  await user.type(screen.getByLabelText("Descripción"), "Configurar firewall");
  await user.click(screen.getByRole("button", { name: "Crear actividad" }));
  expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
    mode: "scheduled", orderId: "order-1", branchId: undefined,
    activityTypeId: "type-1", description: "Configurar firewall",
  }));
});
```

- [ ] **Step 2: Ejecutar RED**

Run: `npm test -- src/components/activities/ActivityForm.test.tsx`

Expected: FAIL por formulario ausente.

- [ ] **Step 3: Implementar formulario y lookups cancelables**

Definir:

```ts
export type ActivityFormValue =
  | ({ mode: "scheduled" } & CreateActivityInput)
  | ({ mode: "manual" } & ManualActivityInput);

export interface ActivityFormActor {
  technicianId: string | null;
  canManage: boolean;
}
```

Orden y cliente usan combobox accesible con búsqueda paginada. Elegir orden
limpia `branchId`; elegir sucursal limpia `orderId`. Cerrar formulario aborta
lookups. Inputs tienen `name`, label, autocomplete y errores por campo.

- [ ] **Step 4: Escribir RED y GREEN de carga manual**

Probar inicio/fin local, resultado, justificación, rango menor de un minuto,
mayor de 24 horas y futuro. Implementar conversión con offset `-06:00`, sin usar
`toISOString()` sobre una cadena interpretada ambiguamente.

- [ ] **Step 5: Escribir RED del equipo administrativo**

```tsx
it("exige responsable único y exactamente 100.00", async () => {
  render(<ActivityTeamEditor members={twoMembersAt40} technicians={options} onChange={onChange} />);
  expect(screen.getByRole("alert")).toHaveTextContent("La participación suma 80.00%; debe sumar 100.00%.");
  expect(screen.getByRole("button", { name: "Confirmar equipo" })).toBeDisabled();
});
```

Calcular centésimas como enteros. Impedir IDs repetidos y más de un responsable.
Para técnico, ocultar editor y omitir `team` para que backend aplique equipo
propio.

- [ ] **Step 6: Verificar accesibilidad y commit**

Run: `npm test -- src/components/activities/ActivityForm.test.tsx src/components/activities/ActivityTeamEditor.test.tsx`

Expected: PASS.

```bash
git add src/components/activities/ActivityForm.tsx src/components/activities/ActivityForm.test.tsx src/components/activities/ActivityTeamEditor.tsx src/components/activities/ActivityTeamEditor.test.tsx src/models/activity.ts src/styles.css
git commit -m "feat(activities): add scheduled and manual entry forms"
```

---

### Task 7: Mutaciones, comandos y conflictos recuperables

**Files:**
- Create: `src/components/activities/ActivityActionDialog.tsx`
- Create: `src/components/activities/ActivityActionDialog.test.tsx`
- Modify: `src/hooks/useActivitiesWorkspace.ts`
- Modify: `src/hooks/useActivitiesWorkspace.test.tsx`
- Modify: `src/components/activities/ActivityDetail.tsx`
- Modify: `src/components/activities/ActivityForm.tsx`
- Modify: `src/components/activities/ActivityForm.test.tsx`
- Modify: `src/components/activities/ActivityTeamEditor.tsx`
- Modify: `src/components/activities/ActivityTeamEditor.test.tsx`
- Modify: `src/pages/ActivitiesPage.tsx`
- Modify: `src/models/activity.ts`

**Interfaces:**
- Consumes: métodos mutables de `ActivityApi`, formulario de Task 6, `ApiClientError`.
- Produces: acciones `create`, `update`, `replaceTeam`, `start`, `pause`, `resume`, `complete`, `cancel`, `adjust` dentro de `ActivitiesWorkspace`.

- [ ] **Step 1: Extender contrato y escribir RED de reconciliación**

Reutilizar la fábrica tipada `activityApiMock` y definir en este archivo
`renderWorkspace(api, initialState)` como wrapper de `renderHook` que inicializa el
workspace con el detalle/página proporcionados. `detailReadyState`, `startedDetail`
y `newerDetail` deben ser DTOs completos y tener versiones monotónicamente crecientes.

Añadir al workspace:

```ts
export type ActivityMutationName = "create" | "update" | "team" | "start" | "pause" | "resume" | "complete" | "cancel" | "adjust";
export interface ActivityMutationState { name: ActivityMutationName; pending: boolean; error: string | null; conflict: boolean }

createActivity(value: ActivityFormValue): Promise<boolean>;
updateActivity(input: Omit<UpdateActivityInput, "version">): Promise<boolean>;
replaceActivityTeam(team: ActivityTeamInput[]): Promise<boolean>;
runAction(command: ActivityActionCommand): Promise<boolean>;
clearMutationError(): void;
```

```ts
it("reemplaza listado y detalle con el DTO mutado", async () => {
  const api = activityApiMock({ start: resolved(startedDetail) });
  const { result } = renderWorkspace(api, detailReadyState);
  await act(() => result.current.runAction({ type: "start" }));
  expect(result.current.selected).toEqual(startedDetail);
  expect(result.current.page?.items[0]).toMatchObject({ status: "IN_PROGRESS", version: startedDetail.version });
});
```

- [ ] **Step 2: Ejecutar RED**

Run: `npm test -- src/hooks/useActivitiesWorkspace.test.tsx`

Expected: FAIL por acciones ausentes.

- [ ] **Step 3: Implementar mutaciones sin repetición**

Usar un estado pending por acción. Si ya está pendiente, devolver `false` sin
segunda llamada. Aplicar DTO exitoso y luego `refresh()` silencioso. Al crear,
insertar si coincide con filtros o refrescar sin inventar coincidencia.

- [ ] **Step 4: Escribir RED de red, 403, 404 y conflicto**

```ts
it("recarga conflicto sin repetir la mutación", async () => {
  api.complete.mockRejectedValueOnce(new ApiClientError(409, "VERSION_CONFLICT", "conflict"));
  api.detail.mockResolvedValueOnce(newerDetail);
  const ok = await result.current.runAction({ type: "complete", result: "Listo" });
  expect(ok).toBe(false);
  expect(api.complete).toHaveBeenCalledTimes(1);
  expect(result.current.selected).toEqual(newerDetail);
  expect(result.current.mutation).toMatchObject({ conflict: true });
});
```

Mapear mensajes seguros por código. Red conserva estado; 403 informa sin cerrar
sesión; 404 cierra selección y refresca; 409 conserva input en el diálogo y
actualiza versión visible.

- [ ] **Step 5: Implementar edición pendiente y reemplazo de equipo**

Extender `ActivityForm` con una variante tipada de edición que recibe
`ActivityDetail` inicial y sólo expone `activityTypeId`, `description` y
`observations`; no permite cambiar origen ni convertir una programada en manual.
`ActivityTeamEditor` recibe el equipo actual y confirma mediante
`replaceActivityTeam`. Ambos métodos toman `selected.version` dentro del
workspace, se bloquean fuera de `PENDING` y siguen la misma reconciliación de
conflicto.

Añadir pruebas que abren “Editar actividad” y “Editar equipo”, preservan valores,
envían versión vigente una vez y mantienen el formulario abierto ante 409.

- [ ] **Step 6: Implementar diálogo de acciones**

`ActivityActionDialog` recibe `action`, `activity`, `pending`, `error`,
`onConfirm(input)` y `onCancel`. Pausa/cancelación piden motivo; completar pide
resultado/observaciones; ajuste pide motivo y al menos un cambio. Cancelar y
ajustar incluyen confirmación textual. Escape no cierra durante submit.

- [ ] **Step 7: Probar matriz de estados/permisos**

Cubrir botones y payloads para PENDING, IN_PROGRESS, PAUSED, COMPLETED y
CANCELLED; técnico sin `ACTIVITIES_MANAGE` no ve equipo/ajuste. Verificar pending,
reintento y error `role="alert"`.

Run: `npm test -- src/hooks/useActivitiesWorkspace.test.tsx src/components/activities/ActivityActionDialog.test.tsx src/pages/ActivitiesPage.test.tsx`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/hooks/useActivitiesWorkspace.ts src/hooks/useActivitiesWorkspace.test.tsx src/components/activities/ActivityActionDialog.tsx src/components/activities/ActivityActionDialog.test.tsx src/components/activities/ActivityDetail.tsx src/components/activities/ActivityForm.tsx src/components/activities/ActivityForm.test.tsx src/components/activities/ActivityTeamEditor.tsx src/components/activities/ActivityTeamEditor.test.tsx src/pages/ActivitiesPage.tsx src/models/activity.ts
git commit -m "feat(activities): operate and reconcile daily work"
```

---

### Task 8: Integración del shell, regresión completa y documentación

**Files:**
- Create: `src/activities-flow.integration.test.tsx`
- Modify: `src/layouts/AppShell.tsx`
- Modify: `src/layouts/AppShell.test.tsx`
- Modify: `src/pages/ActivitiesPage.tsx`
- Modify: `src/styles.css`
- Modify: `src/mocks/data.ts`
- Modify: `src/models/app.ts`
- Modify: `README.md`
- Modify: `docs/plans/implementation-plan.md`
- Modify: `docs/architecture/current-state.md`
- Delete: `src/components/activities/ActivityModal.tsx`
- Delete: `src/components/activities/WorkTable.tsx`

**Interfaces:**
- Consumes: flujo completo Tasks 1–7 y sesión Tasks auth.
- Produces: Actividades persistentes montadas en `AppShell`, sin mocks del módulo.

- [ ] **Step 1: Escribir integración RED del ciclo técnico**

Crear un test con `fetch` secuencial y `AppShell` autenticado:

Mantener los helpers en el mismo archivo de integración: `mockActivityJourneyFetch`
debe despachar respuestas por método y ruta y registrar el orden; `fillScheduledOwnActivity`
rellena modo, origen, tipo y descripción; `openActivity`, `fillReason` y `fillResult`
usan exclusivamente consultas accesibles de Testing Library. Cada ruta del mock debe
devolver DTOs completos con versiones crecientes para detectar reconciliaciones falsas.

```tsx
it("crea, inicia, pausa, reanuda, completa y recarga desde la API", async () => {
  mockActivityJourneyFetch();
  window.history.replaceState({}, "", "/actividades");
  renderWithAuth(<AppShell />, { user: technicianWithActivityPermissions });
  await screen.findByText("Sincronizar router de bodega");
  await user.click(screen.getByRole("button", { name: "Nueva actividad" }));
  await fillScheduledOwnActivity();
  await user.click(screen.getByRole("button", { name: "Crear actividad" }));
  await openActivity("Revisar enlace principal");
  await user.click(screen.getByRole("button", { name: "Iniciar" }));
  await user.click(screen.getByRole("button", { name: "Pausar" }));
  await fillReason("Esperando acceso");
  await user.click(screen.getByRole("button", { name: "Confirmar pausa" }));
  await user.click(screen.getByRole("button", { name: "Reanudar" }));
  await user.click(screen.getByRole("button", { name: "Completar" }));
  await fillResult("Enlace estable");
  await user.click(screen.getByRole("button", { name: "Confirmar finalización" }));
  expect(await screen.findByText("Completada")).toBeInTheDocument();
  expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/activities"), expect.any(Object));
});
```

- [ ] **Step 2: Ejecutar RED**

Run: `npm test -- src/activities-flow.integration.test.tsx`

Expected: FAIL porque `AppShell` aún usa `initialWorks` y el modal simulado.

- [ ] **Step 3: Simplificar AppShell y montar módulo real**

Eliminar estado `works`, `modalOpen`, `saveActivity`, toast simulado y filtrado
local. `PageContent` recibe `search`; Actividades monta `<ActivitiesPage
search={search} />`. Dashboard conserva temporalmente `initialWorks` directamente
en su frontera hasta su migración, sin compartirlos con Actividades.

Mover el botón “Nueva actividad” dentro de `ActivitiesPage`, donde el workspace
posee tipos, formularios y mutaciones. `AppShell` sólo conserva la búsqueda.

- [ ] **Step 4: Eliminar mocks y componentes obsoletos del flujo**

Eliminar `ActivityModal` y `WorkTable`. Retirar el checkbox de reincidencia.
Conservar `Work`/`initialWorks` sólo si Dashboard todavía los consume; documentar
ese consumidor explícito y asegurar con `rg` que Actividades no los importe:

Run: `rg -n "initialWorks|technicians|ActivityModal|WorkTable" src/pages/ActivitiesPage.tsx src/components/activities src/hooks/useActivitiesWorkspace.ts`

Expected: sin coincidencias.

- [ ] **Step 5: Actualizar pruebas históricas y documentación**

Reemplazar tests de creación temporal por carga/error/navegación real con
`ActivityApi` mockeada en frontera. README debe declarar Actividades real y los
módulos aún mock. `implementation-plan.md` marca el subbloque Actividades/Jornada
completo sin cerrar toda fase 12. `current-state.md` actualiza árbol, consumidores
de mocks, endpoints y verificación.

- [ ] **Step 6: Auditoría visual y accesible focalizada**

Revisar archivos de Actividades contra Web Interface Guidelines frescas. Verificar
320, 768 y 1440 px; teclado; foco de formulario/detalle/diálogos; reduced motion;
overflow de tablas/tarjetas; números tabulares; `aria-live` sin ticks repetidos.
Registrar hallazgos corregidos en el reporte de la tarea, no en archivos de
producto.

- [ ] **Step 7: Ejecutar matriz frontend**

```bash
npm test -- src/api/activities.test.ts src/api/activity-lookups.test.ts src/hooks/activity-workspace.helpers.test.ts src/hooks/useActivitiesWorkspace.test.tsx src/pages/ActivitiesPage.test.tsx src/components/activities/ActivityForm.test.tsx src/components/activities/ActivityTeamEditor.test.tsx src/components/activities/ActivityActionDialog.test.tsx src/activities-flow.integration.test.tsx src/layouts/AppShell.test.tsx
npm test
npm run lint
npm run build
git diff --check
rg -n "localStorage|sessionStorage|document\.cookie|Authorization.*Bearer" src
```

Expected: pruebas, lint, build y diff-check pasan; el scan no encuentra secretos
o sesión persistida.

- [ ] **Step 8: Ejecutar matriz backend**

Desde `server/`, con cliente Prisma generado y el esquema `test` configurado:

```bash
npm test -- tests/activities/activities-schemas.test.ts tests/activities/activities-state-machine.test.ts tests/activities/activities-time.test.ts tests/activities/activities-service.test.ts tests/activities/activities-mapper.test.ts tests/auth/authorization.test.ts
npm run test:db -- tests/activities/activities-http.test.ts tests/database/activities-read-persistence.test.ts tests/database/activities-mutation-persistence.test.ts tests/database/activities-operation-persistence.test.ts
npm run typecheck
npm run lint
npm run build
```

Expected: todas las suites pasan contra `test`; no ejecutar `migrate reset`,
`db push` ni limpieza sobre `public`.

- [ ] **Step 9: Commit**

```bash
git add src README.md docs/plans/implementation-plan.md docs/architecture/current-state.md
git commit -m "feat(activities): connect daily workflow to API"
```

---

## Definition of Done

- Los ocho tasks tienen evidencia RED/GREEN y revisión independiente.
- Actividades no consume datos simulados ni guarda trabajo en memoria como fuente de verdad.
- Creación programada/manual, equipos, operaciones, edición y ajustes persisten.
- Filtros, URL, paginación, polling, reloj y conflictos cumplen la especificación.
- Técnico, supervisor y administrador reciben alcance y affordances correctos.
- La experiencia funciona por teclado y en 320/768/1440 px.
- Frontend y backend terminan pruebas, lint, typecheck y build sin errores.
- La documentación distingue claramente módulos reales y módulos aún simulados.
