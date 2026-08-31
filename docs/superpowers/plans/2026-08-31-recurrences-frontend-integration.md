# Recurrences Frontend Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sustituir la pantalla mock de Reincidencias por un módulo completo conectado a la API, con resumen filtrado, reporte, evidencia y todo el ciclo de revisión autorizado.

**Architecture:** El backend añade un agregado de resumen bajo el mismo alcance del listado. El frontend separa modelos, transporte, helpers, workspace y componentes; sincroniza filtros/selección con la URL y coordina lecturas independientes con abortos y generaciones. Las mutaciones usan la versión vigente y nunca se reintentan automáticamente.

**Tech Stack:** React 18, TypeScript estricto, Vite, Vitest, React Testing Library, Express 5, Zod 4, Prisma 7 y PostgreSQL 18.

**Spec:** `docs/superpowers/specs/2026-08-31-recurrences-frontend-integration-design.md`

## Global Constraints

- Mantener la sesión en cookie opaca `HttpOnly`; no usar `localStorage`, `sessionStorage`, `document.cookie` ni bearer manual.
- Usar `credentials: "include"` y conservar el flujo global de `401`.
- La zona de negocio es `America/Tegucigalpa`, suministrada por `KPI_TIME_ZONE` en backend.
- No añadir dependencias ni React Router.
- No cambiar las transiciones ni invariantes actuales de Reincidencias.
- No cargar listados completos en memoria para calcular el resumen.
- No exponer rutas físicas, claves de almacenamiento, hashes de contraseña ni otros campos privados.
- Las escrituras versionadas conservan el formulario ante `409` y no se reenvían automáticamente.
- Las acciones se ocultan sin permiso, pero la API sigue siendo la autoridad.
- Objetivos táctiles mínimos de 44 por 44 píxeles y operación completa por teclado.
- Escritorio usa tabla/panel lateral; móvil usa tarjetas/overlay de pantalla completa.
- Mantener `recurrenceJobs` sólo hasta que la tarea final demuestre que ningún consumidor real lo necesita.
- Commits y comentarios de entrega en español.

---

### Task 1: Contrato y servicio del resumen de Reincidencias

**Files:**
- Modify: `server/src/recurrences/recurrences.types.ts`
- Modify: `server/src/recurrences/recurrences.repository.types.ts`
- Modify: `server/src/recurrences/recurrences.schemas.ts`
- Modify: `server/src/recurrences/recurrences.service.ts`
- Modify: `server/tests/recurrences/recurrences-schemas.test.ts`
- Modify: `server/tests/recurrences/recurrences-service.test.ts`

**Interfaces:**
- Consumes: `RecurrenceListFilters`, `RecurrenceAccessScope`, `RecurrenceActorContext`.
- Produces: `RecurrenceSummaryFilters`, `PublicRecurrenceSummaryMetrics`, `recurrenceSummaryQuerySchema`, `RecurrenceService.summary()` y `RecurrencesRepository.summarizeRecurrences()`.

- [ ] **Step 1: Añadir pruebas de esquema y alcance que fallen**

Añadir casos que acepten filtros repetidos y fechas con offset, rechacen `page`, `pageSize`, fechas invertidas y claves desconocidas, y comprueben que el servicio pasa alcance `ALL` o `TECHNICIAN` al repositorio.

```ts
expect(recurrenceSummaryQuerySchema.safeParse({
  status: ["OPEN", "ANALYSIS"],
  detectedFrom: "2026-08-01T00:00:00-06:00",
  detectedTo: "2026-08-31T23:59:59.999-06:00",
}).success).toBe(true);
expect(recurrenceSummaryQuerySchema.safeParse({ page: "1" }).success).toBe(false);

await service.summary(filters, actor(["RECURRENCES_VIEW_OWN"], technicianId));
expect(repository.summarizeRecurrences).toHaveBeenCalledWith(
  filters,
  { kind: "TECHNICIAN", technicianId },
);
```

- [ ] **Step 2: Ejecutar RED focal**

Run desde `server/`:

```bash
npm test -- tests/recurrences/recurrences-schemas.test.ts tests/recurrences/recurrences-service.test.ts
```

Expected: FAIL porque el esquema, los tipos y `summary` no existen.

- [ ] **Step 3: Definir contratos explícitos**

Añadir en `recurrences.types.ts`:

```ts
export type RecurrenceSummaryFilters = Omit<RecurrenceListFilters, "page" | "pageSize">;

export interface PublicRecurrenceSummaryMetrics {
  totalCases: number;
  openCases: number;
  highImpactCases: number;
  additionalVisits: number;
  additionalMinutes: number;
  estimatedCost: string;
  completedBaseOrders: number;
  recurrenceRate: string;
}
```

En `RecurrencesRepository`:

```ts
summarizeRecurrences(
  filters: RecurrenceSummaryFilters,
  scope: RecurrenceAccessScope,
): Promise<PublicRecurrenceSummaryMetrics>;
```

En `RecurrenceService`:

```ts
summary(
  filters: RecurrenceSummaryFilters,
  actor: RecurrenceActorContext,
): Promise<PublicRecurrenceSummaryMetrics>;
```

- [ ] **Step 4: Implementar esquema y servicio mínimos**

Definir `recurrenceSummaryQuerySchema` con los mismos filtros del listado excepto paginación. Reutilizar los enums y la validación de rango. En el servicio resolver `accessScope(actor)` y llamar al repositorio dentro de `publicOperation`.

```ts
async summary(filters, actor) {
  return publicOperation(() => repository.summarizeRecurrences(filters, accessScope(actor)));
}
```

- [ ] **Step 5: Ejecutar GREEN focal y controles de servidor**

```bash
npm test -- tests/recurrences/recurrences-schemas.test.ts tests/recurrences/recurrences-service.test.ts
npm run typecheck
npm run lint
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/recurrences server/tests/recurrences/recurrences-schemas.test.ts server/tests/recurrences/recurrences-service.test.ts
git commit -m "feat(reincidencias): definir resumen operativo"
```

---

### Task 2: Agregados PostgreSQL y endpoint HTTP de resumen

**Files:**
- Create: `server/src/recurrences/recurrences.summary.repository.ts`
- Modify: `server/src/recurrences/recurrences.read.repository.ts`
- Modify: `server/src/recurrences/recurrences.controller.ts`
- Modify: `server/src/recurrences/recurrences.routes.ts`
- Modify: `server/tests/database/recurrences-read-persistence.test.ts`
- Modify: `server/tests/recurrences/recurrences-http.test.ts`

**Interfaces:**
- Consumes: `RecurrenceSummaryFilters`, `PublicRecurrenceSummaryMetrics`, `recurrenceSummaryQuerySchema`.
- Produces: `createRecurrencesSummaryRepository(database)` y `GET /api/v1/recurrences/summary`.

- [ ] **Step 1: Escribir pruebas PostgreSQL y HTTP que fallen**

La prueba de persistencia debe crear casos con distintas fechas, impactos, clientes y técnicos, y verificar cifras exactas. La prueba HTTP debe comprobar permiso, contraseña provisional, filtros repetidos y que `/summary` no sea interpretado como UUID.

```ts
expect(await repository.summarizeRecurrences({
  status: ["OPEN", "ANALYSIS"],
  detectedFrom: new Date("2026-08-01T00:00:00-06:00"),
  detectedTo: new Date("2026-08-31T23:59:59.999-06:00"),
}, { kind: "ALL" })).toEqual({
  totalCases: 2,
  openCases: 2,
  highImpactCases: 1,
  additionalVisits: 3,
  additionalMinutes: 180,
  estimatedCost: "6240.00",
  completedBaseOrders: 10,
  recurrenceRate: "20.00",
});
```

- [ ] **Step 2: Ejecutar RED de persistencia y HTTP**

```bash
npm run test:db -- tests/database/recurrences-read-persistence.test.ts tests/recurrences/recurrences-http.test.ts
```

Expected: FAIL porque el repositorio y la ruta no existen.

- [ ] **Step 3: Extraer un constructor de filtros reutilizable**

Mover la construcción del `Prisma.ReincidenciaWhereInput` desde `recurrences.read.repository.ts` a una función exportada dentro del mismo archivo o a un helper enfocado si supera 80 líneas:

```ts
export function recurrenceWhere(
  filters: RecurrenceSummaryFilters,
  scope: RecurrenceAccessScope,
): Prisma.ReincidenciaWhereInput;
```

El listado seguirá usando exactamente esa función. Añadir una prueba de regresión que confirme que sus resultados no cambian.

- [ ] **Step 4: Implementar agregados sin hidratar filas**

`createRecurrencesSummaryRepository` debe ejecutar operaciones agregadas de Prisma dentro de una transacción de lectura:

```ts
const [totals, openCases, highImpactCases, additionalVisits, completedBaseOrders] =
  await database.$transaction([
    database.reincidencia.aggregate({ where, _count: { _all: true }, _sum: { additionalMinutes: true, estimatedCost: true } }),
    database.reincidencia.count({ where: { AND: [where, { status: { in: ["OPEN", "ANALYSIS", "CORRECTION"] } }] } }),
    database.reincidencia.count({ where: { AND: [where, { impact: "HIGH" }] } }),
    database.reincidenciaOrden.count({ where: { reincidencia: where } }),
    database.ordenTrabajo.count({ where: baseOrderWhere(filters, scope) }),
  ]);
```

`baseOrderWhere` aplicará estado `COMPLETED`, `endedAt` bajo el rango detectado, cliente, sucursal, técnico y alcance propio. No aplicará búsqueda, estado de reincidencia, impacto, responsabilidad ni `originalOrderId`.

Formatear costo y tasa con dos decimales mediante `Prisma.Decimal`; no convertir valores monetarios a `number`. Cuando `completedBaseOrders === 0`, retornar `"0.00"`.

- [ ] **Step 5: Exponer controlador y ruta antes de `/:recurrenceId`**

```ts
summary: async (request, response, next) => {
  try {
    const query = parse(recurrenceSummaryQuerySchema.safeParse(request.query));
    success(request, response, 200, "Resumen de reincidencias obtenido", await service.summary(query, actor(request)));
  } catch (error) { next(error); }
},
```

Registrar:

```ts
router.get("/summary", ...readSecurity, controller.summary);
router.get("/:recurrenceId", ...readSecurity, controller.detail);
```

Combinar `createRecurrencesSummaryRepository(database)` al construir el servicio.

- [ ] **Step 6: Ejecutar GREEN y matriz backend**

```bash
npm run test:db -- tests/database/recurrences-read-persistence.test.ts tests/recurrences/recurrences-http.test.ts
npm test -- tests/recurrences
npm run typecheck
npm run lint
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/src/recurrences server/tests/database/recurrences-read-persistence.test.ts server/tests/recurrences/recurrences-http.test.ts
git commit -m "feat(reincidencias): calcular resumen filtrado"
```

---

### Task 3: Modelos y cliente frontend tipado de Reincidencias

**Files:**
- Create: `src/models/recurrence.ts`
- Create: `src/api/recurrences.ts`
- Create: `src/api/recurrences.test.ts`

**Interfaces:**
- Consumes: contratos públicos del backend documentados en la especificación.
- Produces: `RecurrenceApi`, `createRecurrenceApi()`, modelos de catálogo, listado, resumen, detalle y entradas de mutación.

- [ ] **Step 1: Escribir pruebas de transporte que fallen**

Cubrir serialización de arrays repetidos, fechas ISO, omisión de texto vacío, paginación, señal de aborto y cada ruta de mutación.

```ts
await api.list({ status: ["OPEN", "ANALYSIS"], page: 2, pageSize: 20 });
expect(fetch).toHaveBeenCalledWith(
  expect.stringContaining("status=OPEN&status=ANALYSIS&page=2&pageSize=20"),
  expect.objectContaining({ credentials: "include" }),
);

await api.analyze("rec-1", { version: 1, causeId: "cause-1", impact: "HIGH", responsibility: "TECHNICAL_WORK", analysis: "Diagnóstico", qualityDecisions: [] });
expect(requestBody()).toMatchObject({ version: 1, impact: "HIGH" });
```

- [ ] **Step 2: Ejecutar RED**

```bash
npm test -- src/api/recurrences.test.ts
```

Expected: FAIL porque los archivos no existen.

- [ ] **Step 3: Definir modelos completos**

Definir unions literales para estados, impacto, responsabilidad, participación y comandos. Copiar las formas públicas de `PublicRecurrenceSummary`, `PublicRecurrenceDetail`, `PublicRecurrenceCatalog` y `PublicRecurrenceSummaryMetrics` sin campos de persistencia privada.

```ts
export interface RecurrenceListFilters {
  search?: string;
  status?: RecurrenceStatus[];
  impact?: RecurrenceImpact[];
  responsibility?: RecurrenceResponsibility[];
  originalOrderId?: string;
  technicianId?: string;
  clientId?: string;
  branchId?: string;
  detectedFrom?: string;
  detectedTo?: string;
  page: number;
  pageSize: number;
}

export type RecurrenceSummaryFilters = Omit<RecurrenceListFilters, "page" | "pageSize">;
```

- [ ] **Step 4: Implementar `RecurrenceApi`**

```ts
export interface RecurrenceApi {
  catalog(signal?: AbortSignal): Promise<RecurrenceCatalog>;
  list(filters: RecurrenceListFilters, signal?: AbortSignal): Promise<RecurrencePage>;
  summary(filters: RecurrenceSummaryFilters, signal?: AbortSignal): Promise<RecurrenceSummaryMetrics>;
  detail(id: string, signal?: AbortSignal): Promise<RecurrenceDetail>;
  report(input: ReportRecurrenceInput): Promise<RecurrenceDetail>;
  analyze(id: string, input: AnalyzeRecurrenceInput): Promise<RecurrenceDetail>;
  correct(id: string, input: CorrectRecurrenceInput): Promise<RecurrenceDetail>;
  addVisit(id: string, input: AddRecurrenceVisitInput): Promise<RecurrenceDetail>;
  addNote(id: string, input: AddRecurrenceNoteInput): Promise<RecurrenceDetail>;
  dismiss(id: string, input: DismissRecurrenceInput): Promise<RecurrenceDetail>;
  close(id: string, input: CloseRecurrenceInput): Promise<RecurrenceDetail>;
  adjust(id: string, input: AdjustRecurrenceInput): Promise<RecurrenceDetail>;
}
```

Usar `requestJson`; `POST /recurrences` debe conservar el cuerpo sin campos `undefined` y todas las rutas dinámicas deben aplicar `encodeURIComponent`.

- [ ] **Step 5: Ejecutar GREEN, lint y build**

```bash
npm test -- src/api/recurrences.test.ts
npm run lint
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/models/recurrence.ts src/api/recurrences.ts src/api/recurrences.test.ts
git commit -m "feat(reincidencias): agregar cliente frontend tipado"
```

---

### Task 4: Transporte multipart/binario y clientes auxiliares

**Files:**
- Modify: `src/api/http.ts`
- Modify: `src/api/http.test.ts`
- Create: `src/models/order-lookup.ts`
- Create: `src/models/evidence.ts`
- Create: `src/api/recurrence-lookups.ts`
- Create: `src/api/recurrence-lookups.test.ts`
- Create: `src/api/evidences.ts`
- Create: `src/api/evidences.test.ts`

**Interfaces:**
- Consumes: endpoints existentes de Órdenes y Evidencias.
- Produces: `requestFormData`, `requestBlob`, `RecurrenceLookupApi` y `EvidenceApi`.

- [ ] **Step 1: Escribir pruebas RED para formulario, blob y búsquedas**

Comprobar que multipart no fija `Content-Type`, que las cookies se incluyen, que `401` notifica sesión expirada, que la descarga conserva nombre/MIME y que las búsquedas de órdenes usan alcance del backend.

```ts
const form = new FormData();
form.set("file", new File(["%PDF-1.7"], "prueba.pdf", { type: "application/pdf" }));
await requestFormData<Evidence>("/recurrences/r-1/evidences", form);
expect(fetchInit().headers).not.toHaveProperty("Content-Type");

await lookups.orders("OT-18", ["COMPLETED"], 1);
expect(fetchUrl()).toContain("/orders?search=OT-18&status=COMPLETED&page=1&pageSize=20");
```

- [ ] **Step 2: Ejecutar RED**

```bash
npm test -- src/api/http.test.ts src/api/recurrence-lookups.test.ts src/api/evidences.test.ts
```

Expected: FAIL por interfaces ausentes.

- [ ] **Step 3: Extraer procesamiento común de respuestas**

Mantener `requestJson` compatible. Añadir:

```ts
export function requestFormData<T>(path: string, form: FormData, init?: Omit<RequestInit, "body">): Promise<T>;
export function requestBlob(path: string, signal?: AbortSignal): Promise<{ blob: Blob; filename: string | null }>;
```

Ambas funciones usan la misma traducción de `ApiClientError`/`ApiNetworkError` y notifican `401`. `requestBlob` obtiene el nombre de `Content-Disposition` sin insertar HTML.

- [ ] **Step 4: Implementar búsquedas de órdenes y entidades**

```ts
export interface RecurrenceLookupApi {
  orders(search: string, statuses: OrderStatus[], page: number, signal?: AbortSignal): Promise<OrderLookupPage>;
  technicians(search: string, page: number, signal?: AbortSignal): Promise<TechnicianPage>;
  clients(search: string, page: number, signal?: AbortSignal): Promise<ClientLookupPage>;
  branches(clientId: string, search: string, page: number, signal?: AbortSignal): Promise<BranchLookupPage>;
}
```

Reutilizar `TechnicianApi.list`. Para clientes y sucursales mapear sólo `id`, código y nombre desde sus endpoints existentes. El selector de orden original envía `COMPLETED`; el correctivo envía todos los estados salvo `CANCELLED`.

- [ ] **Step 5: Implementar cliente de evidencias**

```ts
export interface EvidenceApi {
  listRecurrence(recurrenceId: string, page: number, signal?: AbortSignal): Promise<EvidencePage>;
  uploadRecurrence(recurrenceId: string, input: EvidenceUploadInput): Promise<Evidence>;
  download(id: string, signal?: AbortSignal): Promise<{ blob: Blob; filename: string | null }>;
  archive(id: string, input: { version: number; reason: string }): Promise<Evidence>;
}
```

El formulario contiene `file`, `accessLevel` y `description` únicamente cuando su valor normalizado no está vacío. No aceptar `CLIENT` en el modelo frontend.

- [ ] **Step 6: Ejecutar GREEN y matriz frontend focal**

```bash
npm test -- src/api/http.test.ts src/api/recurrence-lookups.test.ts src/api/evidences.test.ts
npm run lint
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/api/http.ts src/api/http.test.ts src/api/recurrence-lookups.ts src/api/recurrence-lookups.test.ts src/api/evidences.ts src/api/evidences.test.ts src/models/order-lookup.ts src/models/evidence.ts
git commit -m "feat(reincidencias): preparar órdenes y evidencias"
```

---

### Task 5: Helpers de URL, periodo y reconciliación

**Files:**
- Create: `src/hooks/recurrence-workspace.helpers.ts`
- Create: `src/hooks/recurrence-workspace.helpers.test.ts`

**Interfaces:**
- Consumes: `RecurrenceListFilters`, `RecurrenceDetail`.
- Produces: `RecurrenceQueryState`, `parseRecurrenceSearch`, `serializeRecurrenceSearch`, `currentRecurrenceMonth`, `reconcileRecurrence`.

- [ ] **Step 1: Escribir pruebas RED de URL y zona horaria**

Cubrir parámetros repetidos, valores inválidos, preservación de parámetros ajenos, selección, página, mes de Honduras y frontera UTC.

```ts
expect(currentRecurrenceMonth(new Date("2026-09-01T03:00:00Z"))).toEqual({
  detectedFrom: "2026-08-01T00:00:00-06:00",
  detectedTo: "2026-08-31T23:59:59.999-06:00",
});

const parsed = parseRecurrenceSearch("?recurrenceStatus=OPEN&recurrenceStatus=ANALYSIS&recurrencePage=2");
expect(parsed.filters.status).toEqual(["OPEN", "ANALYSIS"]);
expect(parsed.filters.page).toBe(2);
```

- [ ] **Step 2: Ejecutar RED**

```bash
npm test -- src/hooks/recurrence-workspace.helpers.test.ts
```

Expected: FAIL porque el helper no existe.

- [ ] **Step 3: Implementar helpers puros**

Usar prefijo `recurrence` para parámetros propios. Materializar siempre `recurrenceFrom` y `recurrenceTo`; omitir filtros vacíos. `serializeRecurrenceSearch` debe conservar parámetros de otros módulos.

```ts
export interface RecurrenceQueryState {
  filters: RecurrenceListFilters;
  selectedId: string | null;
}

export function reconcileRecurrence(current: RecurrenceDetail | null, incoming: RecurrenceDetail): RecurrenceDetail {
  return current && current.id === incoming.id && current.version > incoming.version ? current : incoming;
}
```

- [ ] **Step 4: Ejecutar GREEN**

```bash
npm test -- src/hooks/recurrence-workspace.helpers.test.ts
npm run lint
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/recurrence-workspace.helpers.ts src/hooks/recurrence-workspace.helpers.test.ts
git commit -m "feat(reincidencias): sincronizar filtros con la URL"
```

---

### Task 6: Workspace de lectura y permisos

**Files:**
- Create: `src/hooks/useRecurrencesWorkspace.ts`
- Create: `src/hooks/useRecurrencesWorkspace.test.tsx`

**Interfaces:**
- Consumes: `RecurrenceApi`, `EvidenceApi`, `RecurrenceLookupApi`, helpers de Task 5 y permisos de sesión.
- Produces: `RecurrencesWorkspace` con catálogo, página, resumen, detalle, estados independientes, filtros, selección, reintentos y punto único de mutación para tareas posteriores.

- [ ] **Step 1: Escribir pruebas RED del ciclo de lectura**

Cubrir carga paralela de catálogo/listado/resumen, error independiente, datos stale, aborto, generaciones, selección por URL, `404`, back/forward, búsqueda externa y página fuera de rango.

```ts
const { result } = renderHook(() => useRecurrencesWorkspace(options));
expect(api.list).toHaveBeenCalledWith(expect.objectContaining({ page: 1 }), expect.any(AbortSignal));
expect(api.summary).toHaveBeenCalledWith(expect.not.objectContaining({ page: expect.anything() }), expect.any(AbortSignal));

resolveOldList(oldPage);
expect(result.current.page).not.toBe(oldPage);
```

- [ ] **Step 2: Ejecutar RED**

```bash
npm test -- src/hooks/useRecurrencesWorkspace.test.tsx
```

Expected: FAIL porque el hook no existe.

- [ ] **Step 3: Definir interfaz del workspace**

```ts
export interface RecurrencesWorkspace {
  query: RecurrenceQueryState;
  catalog: RecurrenceCatalog | null;
  page: RecurrencePage | null;
  summary: RecurrenceSummaryMetrics | null;
  selected: RecurrenceDetail | null;
  catalogState: LoadState;
  listState: LoadState;
  summaryState: LoadState;
  detailState: LoadState;
  listStale: boolean;
  mutation: RecurrenceMutationState | null;
  setFilters(patch: Partial<RecurrenceListFilters>): void;
  select(id: string): void;
  closeDetail(): void;
  retryCatalog(): void;
  retryList(): void;
  retrySummary(): void;
  retryDetail(): void;
  clearMutationError(): void;
}
```

Definir los estados usados por esa interfaz:

```ts
export type LoadState = "idle" | "loading" | "ready" | "empty" | "error";

export interface RecurrenceMutationState {
  name: "report" | "evidence" | "analyze" | "correct" | "visit" | "note" | "dismiss" | "close" | "adjust";
  pending: boolean;
  error: string | null;
  conflict: boolean;
}
```

- [ ] **Step 4: Implementar lecturas aisladas**

Cada recurso usa su propio `AbortController`, generación y error. Listado y resumen comparten una referencia inmutable de filtros. Si `requestedPage > max(1,totalPages)`, actualizar URL a la última página y dejar que el efecto haga una sola recarga.

Escuchar `popstate`. Sincronizar la búsqueda global de `AppShell` como filtro de página 1 sin eliminar filtros locales.

- [ ] **Step 5: Exponer capacidades derivadas**

Las opciones reciben `permissions: readonly string[]` y derivan:

```ts
canReport = has("RECURRENCES_REPORT_OWN") || has("RECURRENCES_REVIEW");
canReview = has("RECURRENCES_REVIEW");
canViewAll = has("RECURRENCES_VIEW_ALL") || has("RECURRENCES_REVIEW");
canUploadEvidence = has("EVIDENCES_UPLOAD");
canViewEvidence = has("EVIDENCES_VIEW");
canManageEvidence = has("EVIDENCES_MANAGE");
```

Un cambio de permisos incrementa generaciones de lookups, cierra el modo de acción no autorizado y no borra el detalle permitido.

- [ ] **Step 6: Ejecutar GREEN y regresión de navegación**

```bash
npm test -- src/hooks/useRecurrencesWorkspace.test.tsx src/layouts/AppShell.test.tsx
npm run lint
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useRecurrencesWorkspace.ts src/hooks/useRecurrencesWorkspace.test.tsx
git commit -m "feat(reincidencias): administrar lectura persistente"
```

---

### Task 7: Resumen, filtros, listado y detalle de sólo lectura

**Files:**
- Create: `src/components/recurrences/RecurrenceSummaryCards.tsx`
- Create: `src/components/recurrences/RecurrenceFilters.tsx`
- Create: `src/components/recurrences/RecurrenceTable.tsx`
- Create: `src/components/recurrences/RecurrenceDetail.tsx`
- Create: `src/components/recurrences/RecurrenceReadView.test.tsx`
- Modify: `src/pages/RecurrencesPage.tsx`
- Create: `src/pages/RecurrencesPage.test.tsx`
- Modify: `src/layouts/AppShell.tsx`
- Modify: `src/layouts/AppShell.test.tsx`

**Interfaces:**
- Consumes: `RecurrencesWorkspace` de Task 6.
- Produces: pantalla real de consulta, selección y reintento; `RecurrencesPage({ search })`.

- [ ] **Step 1: Cargar la skill visual antes de diseñar CSS/componentes**

Leer completamente `frontend-design/SKILL.md`. Mantener la dirección visual existente de Geek Solution: tinta azul, teal, coral y ámbar; Bahnschrift/Segoe UI/Consolas; registro operativo con señal vertical de impacto.

- [ ] **Step 2: Escribir pruebas RED de lectura y permisos**

Cubrir métricas reales, filtros accesibles, tabla, estados vacíos/error/stale, detalle, técnicos, evidencia visible, cierre del panel, ausencia de acciones sin permiso, ocultamiento de filtros globales sin `canViewAll` y paso de búsqueda desde `AppShell`.

```tsx
expect(screen.getByText("8.60%")).toBeInTheDocument();
await user.selectOptions(screen.getByLabelText("Estado"), "ANALYSIS");
expect(workspace.setFilters).toHaveBeenCalledWith({ status: ["ANALYSIS"], page: 1 });
await user.click(screen.getByRole("button", { name: "Ver RI-2026-0001" }));
expect(workspace.select).toHaveBeenCalledWith("rec-1");
```

- [ ] **Step 3: Ejecutar RED**

```bash
npm test -- src/components/recurrences/RecurrenceReadView.test.tsx src/pages/RecurrencesPage.test.tsx src/layouts/AppShell.test.tsx
```

Expected: FAIL por componentes ausentes y pantalla aún mock.

- [ ] **Step 4: Implementar componentes presentacionales**

`RecurrenceSummaryCards` recibe sólo métricas/estado/retry. `RecurrenceFilters` emite parches. Tabla y tarjetas comparten los mismos datos y nombres accesibles. `RecurrenceDetail` no ejecuta transporte; recibe detalle, capacidades y callbacks.

Formatear minutos como horas/minutos, costo como `L` y porcentaje sin aritmética de persistencia. Incluir texto además de color para impacto y estado.

- [ ] **Step 5: Integrar página y AppShell**

```tsx
case "Reincidencias": return <RecurrencesPage search={search} />;
```

`RecurrencesPage` obtiene permisos mediante `useAuth`, crea el workspace y renderiza acciones sólo según capacidades. No renderizar el botón de reporte hasta Task 8, para que esta entrega no exponga una acción inerte.

- [ ] **Step 6: Ejecutar GREEN, frontend completo y build**

```bash
npm test -- src/components/recurrences/RecurrenceReadView.test.tsx src/pages/RecurrencesPage.test.tsx src/layouts/AppShell.test.tsx
npm test -- --pool=threads --maxWorkers=1
npm run lint
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/recurrences src/pages/RecurrencesPage.tsx src/pages/RecurrencesPage.test.tsx src/layouts/AppShell.tsx src/layouts/AppShell.test.tsx
git commit -m "feat(reincidencias): mostrar casos y resumen reales"
```

---

### Task 8: Reporte con selectores de órdenes y evidencia inmediata

**Files:**
- Create: `src/components/recurrences/OrderLookupCombobox.tsx`
- Create: `src/components/recurrences/RecurrenceReportForm.tsx`
- Create: `src/components/recurrences/RecurrenceEvidencePanel.tsx`
- Create: `src/components/recurrences/RecurrenceReportForm.test.tsx`
- Create: `src/components/recurrences/RecurrenceEvidencePanel.test.tsx`
- Modify: `src/hooks/useRecurrencesWorkspace.ts`
- Modify: `src/hooks/useRecurrencesWorkspace.test.tsx`
- Modify: `src/pages/RecurrencesPage.tsx`
- Modify: `src/pages/RecurrencesPage.test.tsx`

**Interfaces:**
- Consumes: `RecurrenceLookupApi`, `EvidenceApi`, `RecurrenceApi.report`.
- Produces: `reportRecurrence`, `uploadEvidence`, `downloadEvidence`, `archiveEvidence` y flujo de evidencia pendiente.

- [ ] **Step 1: Escribir pruebas RED del recorrido de reporte**

Cubrir búsqueda paginada con debounce, aborto, teclado del combobox, órdenes distintas, selección fuera de alcance, doble envío, creación versión 1, apertura de detalle y evidencia inmediata.

```tsx
await user.selectOptions(screen.getByLabelText("Orden original"), original.id);
await user.selectOptions(screen.getByLabelText("Orden correctiva"), correction.id);
await user.type(screen.getByLabelText("Problema detectado"), "La conexión volvió a fallar");
await user.click(screen.getByRole("button", { name: "Reportar reincidencia" }));
expect(api.report).toHaveBeenCalledWith({
  originalOrderId: original.id,
  correctionOrderId: correction.id,
  detectedProblem: "La conexión volvió a fallar",
});
expect(screen.getByRole("heading", { name: "Agregar evidencia" })).toBeInTheDocument();
```

- [ ] **Step 2: Ejecutar RED**

```bash
npm test -- src/components/recurrences/RecurrenceReportForm.test.tsx src/components/recurrences/RecurrenceEvidencePanel.test.tsx src/hooks/useRecurrencesWorkspace.test.tsx src/pages/RecurrencesPage.test.tsx
```

Expected: FAIL por formularios y métodos ausentes.

- [ ] **Step 3: Implementar combobox de órdenes accesible**

Soportar `ArrowDown`, `ArrowUp`, `Enter`, `Escape`, opción activa y `aria-activedescendant`. `Escape` consumido no debe cerrar el formulario padre. El original busca `COMPLETED`; el correctivo excluye `CANCELLED`. Reiniciar la búsqueda correctiva cuando cambia la orden original.

- [ ] **Step 4: Implementar reporte en workspace**

```ts
reportRecurrence(input: ReportRecurrenceInput): Promise<boolean>;
```

Bloquear doble envío. En éxito: publicar detalle, seleccionar su ID en URL, refrescar lista/resumen y establecer `evidencePromptForId`. En error: conservar el formulario y traducir `RECURRENCE_DUPLICATE`, `RECURRENCE_ORDER_MISMATCH` y `ORDER_NOT_FOUND`.

- [ ] **Step 5: Implementar panel de evidencia**

Validar anticipadamente JPEG, PNG, WebP o PDF hasta 10 MiB. Permitir `TECHNICIAN` a cualquier actor con `EVIDENCES_UPLOAD`; permitir `INTERNAL` únicamente con `EVIDENCES_MANAGE`, igual que `accessLevelForUpload` en backend. Tras fallo, conservar el caso y archivo seleccionado; mostrar “Caso creado · evidencia pendiente” y reintento.

Extender `RecurrencesWorkspace` con:

```ts
evidencePromptForId: string | null;
uploadEvidence(input: EvidenceUploadInput): Promise<boolean>;
downloadEvidence(evidence: Evidence): Promise<boolean>;
archiveEvidence(evidence: Evidence, reason: string): Promise<boolean>;
clearEvidencePrompt(): void;
```

La descarga debe crear un `objectURL`, activar un enlace con nombre seguro y revocarlo. Archivar exige razón y versión.

- [ ] **Step 6: Ejecutar GREEN y matrices focales**

```bash
npm test -- src/components/recurrences/RecurrenceReportForm.test.tsx src/components/recurrences/RecurrenceEvidencePanel.test.tsx src/hooks/useRecurrencesWorkspace.test.tsx src/pages/RecurrencesPage.test.tsx
npm run lint
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/recurrences src/hooks/useRecurrencesWorkspace.ts src/hooks/useRecurrencesWorkspace.test.tsx src/pages/RecurrencesPage.tsx src/pages/RecurrencesPage.test.tsx
git commit -m "feat(reincidencias): reportar casos con evidencia"
```

---

### Task 9: Análisis y decisiones de calidad

**Files:**
- Create: `src/components/recurrences/RecurrenceAnalysisForm.tsx`
- Create: `src/components/recurrences/RecurrenceAnalysisForm.test.tsx`
- Modify: `src/hooks/useRecurrencesWorkspace.ts`
- Modify: `src/hooks/useRecurrencesWorkspace.test.tsx`
- Modify: `src/components/recurrences/RecurrenceDetail.tsx`
- Modify: `src/pages/RecurrencesPage.tsx`

**Interfaces:**
- Consumes: catálogo, técnicos originales del detalle, `RecurrenceApi.analyze`.
- Produces: `analyzeRecurrence(input: Omit<AnalyzeRecurrenceInput, "version">): Promise<boolean>` y transición `OPEN → ANALYSIS`.

- [ ] **Step 1: Escribir pruebas RED de reglas de análisis**

Cubrir causa, impacto, responsabilidad, análisis, costo/razón emparejados, antigüedad, decisiones completas y justificación de calidad.

```tsx
await user.selectOptions(screen.getByLabelText("Responsabilidad"), "TECHNICAL_WORK");
await user.click(screen.getByLabelText(`Afecta calidad de ${technician.fullName}`));
await user.type(screen.getByLabelText(`Justificación para ${technician.fullName}`), "Intervención original incompleta");
await user.click(screen.getByRole("button", { name: "Guardar análisis" }));
expect(api.analyze).toHaveBeenCalledWith(recurrence.id, expect.objectContaining({ version: recurrence.version }));
```

- [ ] **Step 2: Ejecutar RED**

```bash
npm test -- src/components/recurrences/RecurrenceAnalysisForm.test.tsx src/hooks/useRecurrencesWorkspace.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implementar formulario y validación**

Construir una decisión por cada participante original. Si responsabilidad es distinta de `TECHNICAL_WORK`, todas usan `affectsQuality: false` y no envían justificación. Si es técnica, exigir al menos una afectación justificada. Enviar `estimatedCost` sólo junto con `costReason`.

- [ ] **Step 4: Implementar mutación versionada**

Usar la versión del `selectedRef` en el instante de envío. En `409 VERSION_CONFLICT`, conservar entradas, marcar conflicto y recargar detalle sin sobrescribir el formulario. En éxito refrescar detalle/listado/resumen.

- [ ] **Step 5: Ejecutar GREEN**

```bash
npm test -- src/components/recurrences/RecurrenceAnalysisForm.test.tsx src/hooks/useRecurrencesWorkspace.test.tsx src/pages/RecurrencesPage.test.tsx
npm run lint
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/recurrences/RecurrenceAnalysisForm.tsx src/components/recurrences/RecurrenceAnalysisForm.test.tsx src/components/recurrences/RecurrenceDetail.tsx src/hooks/useRecurrencesWorkspace.ts src/hooks/useRecurrencesWorkspace.test.tsx src/pages/RecurrencesPage.tsx
git commit -m "feat(reincidencias): registrar análisis y calidad"
```

---

### Task 10: Corrección, visitas y notas

**Files:**
- Create: `src/components/recurrences/RecurrenceCorrectionForm.tsx`
- Create: `src/components/recurrences/RecurrenceVisitForm.tsx`
- Create: `src/components/recurrences/RecurrenceNoteForm.tsx`
- Create: `src/components/recurrences/RecurrenceWorkflowForms.test.tsx`
- Modify: `src/hooks/useRecurrencesWorkspace.ts`
- Modify: `src/hooks/useRecurrencesWorkspace.test.tsx`
- Modify: `src/components/recurrences/RecurrenceDetail.tsx`
- Modify: `src/pages/RecurrencesPage.tsx`

**Interfaces:**
- Consumes: `correct`, `addVisit`, `addNote`, selector de órdenes.
- Produces: transición `ANALYSIS → CORRECTION`, visitas adicionales y notas cronológicas.

- [ ] **Step 1: Escribir pruebas RED de las tres operaciones**

Comprobar acciones correctiva/preventiva, costo emparejado, visita no duplicada, observación opcional, nota sin versión y permisos de nota propia.

```tsx
await user.type(screen.getByLabelText("Acción correctiva"), "Reemplazar conector y certificar enlace");
await user.click(screen.getByRole("button", { name: "Iniciar corrección" }));
expect(api.correct).toHaveBeenCalledWith(recurrence.id, expect.objectContaining({ version: recurrence.version }));

await user.type(screen.getByLabelText("Nota"), "Cliente confirma estabilidad durante 24 horas");
expect(api.addNote).toHaveBeenCalledWith(recurrence.id, { content: "Cliente confirma estabilidad durante 24 horas" });
```

- [ ] **Step 2: Ejecutar RED**

```bash
npm test -- src/components/recurrences/RecurrenceWorkflowForms.test.tsx src/hooks/useRecurrencesWorkspace.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implementar formularios enfocados**

Cada formulario controla su estado, validación y foco. El selector de visita excluye todas las órdenes ya presentes en `selected.visits` y la orden original. La nota está disponible para `RECURRENCES_VIEW_OWN` o `RECURRENCES_REVIEW`; corrección y visita sólo para revisión.

- [ ] **Step 4: Implementar métodos del workspace**

```ts
correctRecurrence(input: Omit<CorrectRecurrenceInput, "version">): Promise<boolean>;
addVisit(input: Omit<AddRecurrenceVisitInput, "version">): Promise<boolean>;
addNote(input: AddRecurrenceNoteInput): Promise<boolean>;
```

Aplicar el mismo control de doble envío, versión, conflicto y reconciliación. `addNote` no debe inventar una versión.

- [ ] **Step 5: Ejecutar GREEN**

```bash
npm test -- src/components/recurrences/RecurrenceWorkflowForms.test.tsx src/hooks/useRecurrencesWorkspace.test.tsx src/pages/RecurrencesPage.test.tsx
npm run lint
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/recurrences src/hooks/useRecurrencesWorkspace.ts src/hooks/useRecurrencesWorkspace.test.tsx src/pages/RecurrencesPage.tsx
git commit -m "feat(reincidencias): operar correcciones y seguimiento"
```

---

### Task 11: Descarte, cierre y ajuste posterior

**Files:**
- Create: `src/components/recurrences/RecurrenceTerminalDialog.tsx`
- Create: `src/components/recurrences/RecurrenceAdjustmentForm.tsx`
- Create: `src/components/recurrences/RecurrenceTerminalActions.test.tsx`
- Modify: `src/hooks/useRecurrencesWorkspace.ts`
- Modify: `src/hooks/useRecurrencesWorkspace.test.tsx`
- Modify: `src/components/recurrences/RecurrenceDetail.tsx`
- Modify: `src/pages/RecurrencesPage.tsx`

**Interfaces:**
- Consumes: `dismiss`, `close`, `adjust`.
- Produces: terminales `DISMISSED`/`CLOSED`, ajuste auditado y mensajes de prerrequisitos.

- [ ] **Step 1: Escribir pruebas RED terminales**

Cubrir motivo mínimo de descarte, cierre con versión, error de evidencia/documentación, ajuste con razón y al menos un campo, y ausencia completa de acciones sin `RECURRENCES_REVIEW`.

```tsx
await user.click(screen.getByRole("button", { name: "Cerrar caso" }));
await user.click(screen.getByRole("button", { name: "Confirmar cierre" }));
expect(api.close).toHaveBeenCalledWith(recurrence.id, { version: recurrence.version });

rejectClose(new ApiClientError(422, "RECURRENCE_EVIDENCE_REQUIRED", "La reincidencia requiere evidencia"));
expect(await screen.findByRole("alert")).toHaveTextContent("evidencia activa");
```

- [ ] **Step 2: Ejecutar RED**

```bash
npm test -- src/components/recurrences/RecurrenceTerminalActions.test.tsx src/hooks/useRecurrencesWorkspace.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implementar descarte y cierre**

Mostrar descarte sólo en `OPEN`/`ANALYSIS`; cierre sólo en `CORRECTION`. El diálogo confirma número de caso y consecuencias. Traducir `RECURRENCE_EVIDENCE_REQUIRED`, `RECURRENCE_DOCUMENTATION_INCOMPLETE` e `INVALID_RECURRENCE_TRANSITION` sin ocultar el código del dominio en tests.

- [ ] **Step 4: Implementar ajuste cerrado**

Precargar valores ajustables del detalle. Enviar siempre `version` y `reason`; enviar únicamente campos modificados. Las decisiones de calidad deben volver a ser completas cuando se cambie responsabilidad o afectación.

- [ ] **Step 5: Implementar métodos del workspace y GREEN**

```ts
dismissRecurrence(reason: string): Promise<boolean>;
closeRecurrence(): Promise<boolean>;
adjustRecurrence(input: Omit<AdjustRecurrenceInput, "version">): Promise<boolean>;
```

Run:

```bash
npm test -- src/components/recurrences/RecurrenceTerminalActions.test.tsx src/hooks/useRecurrencesWorkspace.test.tsx src/pages/RecurrencesPage.test.tsx
npm run lint
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/recurrences src/hooks/useRecurrencesWorkspace.ts src/hooks/useRecurrencesWorkspace.test.tsx src/pages/RecurrencesPage.tsx
git commit -m "feat(reincidencias): completar ciclo de revisión"
```

---

### Task 12: Flujo integrado, responsive, documentación y cierre

**Files:**
- Create: `src/recurrences-flow.integration.test.tsx`
- Modify: `src/styles.css`
- Modify: `src/mocks/data.ts`
- Modify: `src/models/app.ts`
- Modify: `src/layouts/Sidebar.tsx`
- Create: `src/layouts/Sidebar.test.tsx`
- Modify: `README.md`
- Modify: `docs/architecture/current-state.md`
- Modify: `docs/plans/implementation-plan.md`

**Interfaces:**
- Consumes: módulo completo de Tasks 1–11.
- Produces: recorrido integrado, diseño adaptable, retiro del mock real y documentación verificable.

- [ ] **Step 1: Escribir prueba integrada RED**

Usar un servidor fetch controlado y sesión con permisos completos. Recorrer:

```text
listar/resumir → filtrar → reportar → subir evidencia → analizar
→ iniciar corrección → agregar visita → agregar nota → cerrar → ajustar
```

Comprobar versiones `1 → 2 → 3 → 4 → 5 → 6` para reporte, análisis, corrección, visita, cierre y ajuste. Nota y evidencia no deben inventar incrementos si la API no los devuelve. Verificar cuerpos, URL, refresco de listado/resumen y descarga binaria.

- [ ] **Step 2: Ejecutar RED y registrar causa**

```bash
npm test -- src/recurrences-flow.integration.test.tsx
```

Expected: FAIL hasta conectar las últimas fronteras de AppShell, mocks y estilos.

- [ ] **Step 3: Completar estilos responsive y accesibilidad**

Escritorio: tarjetas métricas, toolbar, tabla y panel lateral fijo. Tableta: scroll horizontal controlado y objetivos 44×44. Móvil: tarjetas con `data-label`, filtros apilados y formularios/diálogos con `height: 100vh; height: 100dvh`.

Añadir `overscroll-behavior`, cuerpos desplazables, `overflow-wrap`, foco visible y `@media (prefers-reduced-motion: reduce)`. No ocultar información esencial sólo por breakpoint.

- [ ] **Step 4: Retirar mock y contador ficticio**

Eliminar `recurrenceJobs` y su tipo `RecurrenceJob` sólo después de confirmar:

```bash
rg -n "recurrenceJobs|RecurrenceJob" src
```

Expected antes de borrar: únicamente declaraciones mock/modelo; después: sin coincidencias. Reemplazar el contador fijo de Sidebar por ausencia de badge hasta que exista un contador real compartido; no mostrar `4` ficticio.

- [ ] **Step 5: Actualizar documentación**

Documentar endpoint `/recurrences/summary`, permisos, filtros, zona, evidencia inmediata, flujo frontend, mocks retirados, limitaciones y comandos exactos. Marcar el subbloque Reincidencias de fase 12 como completado, sin afirmar que Evidencias global, Órdenes, Clientes, reportes o despliegue estén completos.

- [ ] **Step 6: Ejecutar matriz frontend completa**

```bash
npm test -- --pool=threads --maxWorkers=1
npm run lint
npm run build
```

Expected: todas las pruebas PASS; lint y build con código 0.

- [ ] **Step 7: Ejecutar matriz backend focal y PostgreSQL**

Desde `server/`:

```bash
npm test -- tests/recurrences
npm run test:db -- tests/database/recurrences-read-persistence.test.ts tests/recurrences/recurrences-http.test.ts
npm run typecheck
npm run lint
npm run build
```

Expected: PASS contra `schema=test`.

- [ ] **Step 8: Ejecutar controles de seguridad y diff**

Desde la raíz:

```bash
rg -n "localStorage|sessionStorage|document\.cookie|Authorization.*Bearer" src
rg -n "from .*mocks/data" src/pages/RecurrencesPage.tsx src/components/recurrences src/hooks/useRecurrencesWorkspace.ts
git diff --check
```

Expected: los dos escaneos sin coincidencias; diff sin errores.

- [ ] **Step 9: Commit**

```bash
git add src/recurrences-flow.integration.test.tsx src/styles.css src/mocks/data.ts src/models/app.ts src/layouts/Sidebar.tsx src/layouts/Sidebar.test.tsx README.md docs/architecture/current-state.md docs/plans/implementation-plan.md
git commit -m "feat(reincidencias): conectar flujo completo a la API"
```

---

## Final Review Gate

Después de Task 12:

1. Revisar cada tarea contra este plan y la especificación.
2. Corregir todos los hallazgos Critical e Important.
3. Ejecutar una revisión integral del rango desde el commit base hasta `HEAD`.
4. Ejecutar nuevamente las matrices frontend, backend, PostgreSQL, seguridad y `git diff --check` desde el árbol exacto que se integrará.
5. Presentar al usuario las opciones de fusión local, push/PR o conservación de rama; no integrar automáticamente.
