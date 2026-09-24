# Clients Frontend Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar el módulo frontend completo de Clientes, sucursales y contactos sobre la API persistente existente de Geek Solution.

**Architecture:** Un workspace maestro-detalle especializado mantiene lista, selección, pestañas, colecciones hijas, URL, permisos y concurrencia. Contratos, cliente HTTP, helpers puros, hook y componentes visuales permanecen separados; el backend conserva autoridad sobre permisos, invariantes y versiones.

**Tech Stack:** React 18, TypeScript estricto, Vite, History API, Vitest, React Testing Library, CSS existente, Express/Zod/PostgreSQL como contrato backend ya implementado.

**Spec:** `docs/superpowers/specs/2026-09-24-clients-frontend-integration-design.md`

## Global Constraints

- La ruta será `/clientes` y exigirá `CLIENTS_VIEW`; sólo `CLIENTS_MANAGE` habilita mutaciones.
- Consumir exactamente los 16 endpoints actuales bajo `/api/v1/clients`; no ampliar backend salvo que una prueba demuestre un defecto contractual real.
- Usar el cliente HTTP compartido con `credentials: "include"`; nunca `localStorage`, `sessionStorage`, tokens legibles ni encabezados `Bearer`.
- No agregar dependencias ni React Router; navegación, filtros y selección usan History API.
- El backend es la única autoridad de permisos, estado efectivo, invariantes y versiones.
- Toda mutación posterior a creación usa la versión base del recurso; nunca inventar incrementos ni reintentar mutaciones automáticamente.
- Conservar borradores ante errores recuperables; invalidarlos cuando se pierda autenticación o el permiso que los autoriza.
- Contactos `CLIENT` no envían `branchId`; contactos `BRANCH` exigen una sucursal del cliente actual.
- Latitud y longitud son opcionales pero siempre se envían juntas; país predeterminado `HN`.
- Desactivar o reactivar exige motivo recortado de 10 a 500 caracteres.
- Escritorio usa maestro-detalle; móvil usa tarjetas y detalle/formularios a pantalla completa sin scroll horizontal obligatorio.
- Diálogos y pestañas funcionan con teclado, foco contenido/restaurado, Escape seguro y objetivos táctiles mínimos de 44 × 44 px.
- Toda interfaz y commit visible para el proyecto se redacta en español.

## Review Focus

- Selección rápida A→B mientras detalle, sucursales o contactos de A siguen pendientes: ninguna respuesta de A puede publicarse sobre B; Task 4 añade la regresión.
- Borrador abierto con versión 3 mientras una lectura recibe versión 9: guardar debe seguir usando 3 hasta una adopción explícita; Task 7 añade la regresión.
- Cliente inactivo con hijos internamente activos: la UI debe diferenciar `isActive` de `isEffectivelyActive`; Tasks 5, 8 y 10 lo prueban.
- Cambio o reactivación de contacto principal con conflicto en otro ámbito: sólo el ámbito exacto se afecta y el borrador permanece; Task 11 lo prueba.
- Escape durante una mutación pendiente dentro del detalle móvil: no puede cerrar el diálogo ni el detalle exterior; Task 12 lo prueba con componentes reales.

---

### Task 1: Contratos de dominio y cliente HTTP completo

**Files:**
- Create: `src/models/client.ts`
- Create: `src/api/clients.ts`
- Create: `src/api/clients.test.ts`

**Interfaces:**
- Consumes: `requestJson<T>(path, init)` de `src/api/http.ts`; contratos públicos de `server/src/clients/clients.types.ts`.
- Produces: `ClientsApi`, `ClientSummary`, `ClientDetail`, `ClientBranch`, `ClientContact`, filtros, páginas y entradas de las 16 operaciones.

- [ ] **Step 1: Escribir pruebas fallidas de consultas y mutaciones**

Crear pruebas que intercepten `fetch`, respondan con `{ data }` y comprueben método, URL, `credentials: "include"` heredado y cuerpo. La tabla mínima de rutas será:

```ts
const mutationCases = [
  ["createClient", "/clients", "POST"],
  ["updateClient", "/clients/client-1", "PATCH"],
  ["deactivateClient", "/clients/client-1", "DELETE"],
  ["reactivateClient", "/clients/client-1/reactivate", "POST"],
  ["createBranch", "/clients/client-1/branches", "POST"],
  ["updateBranch", "/clients/client-1/branches/branch-1", "PATCH"],
  ["deactivateBranch", "/clients/client-1/branches/branch-1", "DELETE"],
  ["reactivateBranch", "/clients/client-1/branches/branch-1/reactivate", "POST"],
  ["createContact", "/clients/client-1/contacts", "POST"],
  ["updateContact", "/clients/client-1/contacts/contact-1", "PATCH"],
  ["deactivateContact", "/clients/client-1/contacts/contact-1", "DELETE"],
  ["reactivateContact", "/clients/client-1/contacts/contact-1/reactivate", "POST"],
] as const;
```

Añadir casos exactos usando `fetchMock.mock.calls.at(-1)` para leer URL e
inicialización de la última solicitud:

```ts
const [url, init] = fetchMock.mock.calls.at(-1)!;
expect(String(url)).toBe("http://localhost:4000/api/v1/clients?search=Acme&isActive=false&includeInactive=true&page=2&pageSize=20");
expect(init).toMatchObject({ method: "GET", credentials: "include" });

const [, lifecycleInit] = fetchMock.mock.calls.at(-1)!;
expect(JSON.parse(String(lifecycleInit?.body))).toEqual({ version: 9, reason: "Cierre solicitado" });
```

En pruebas independientes de sucursales y contactos, inspeccionar la URL de la
misma forma y verificar respectivamente
`city=Tegucigalpa&region=Francisco+Moraz%C3%A1n` y
`branchId=branch-1&scope=BRANCH`.

- [ ] **Step 2: Ejecutar las pruebas y observar RED**

Run: `npm test -- src/api/clients.test.ts`

Expected: FAIL porque `src/api/clients.ts` y los contratos aún no existen.

- [ ] **Step 3: Crear los contratos públicos exactos**

Definir en `src/models/client.ts` los tipos del backend y estas interfaces base:

```ts
export type ContactScope = "CLIENT" | "BRANCH";
export type InitialContactScope = "CLIENT" | "MAIN_BRANCH";
export type ClientTab = "summary" | "branches" | "contacts";

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

export interface ClientListFilters {
  search?: string;
  isActive?: boolean;
  includeInactive: boolean;
  page: number;
  pageSize: number;
}

export interface BranchListFilters extends ClientListFilters {
  city?: string;
  region?: string;
}

export interface ContactListFilters extends ClientListFilters {
  branchId?: string;
  scope?: ContactScope;
}

export interface LifecycleInput {
  version: number;
  reason: string;
}
```

Trasladar sin renombrar campos los contratos `PublicClientSummary`,
`PublicClientDetail`, `PublicBranch`, `PublicContact`, `CreateClientInput`,
`UpdateClientInput`, `CreateBranchInput`, `UpdateBranchInput`,
`CreateContactInput` y `UpdateContactInput`, usando nombres frontend
`ClientSummary`, `ClientDetail`, `ClientBranch` y `ClientContact`.

Después de declarar esas entidades, definir los resultados paginados usados por
la interfaz HTTP:

```ts
export type ClientPage = PaginatedResult<ClientSummary>;
export type BranchPage = PaginatedResult<ClientBranch>;
export type ContactPage = PaginatedResult<ClientContact>;
```

- [ ] **Step 4: Implementar `ClientsApi` y serialización HTTP**

La interfaz tendrá exactamente:

```ts
export interface ClientsApi {
  listClients(filters: ClientListFilters, signal?: AbortSignal): Promise<ClientPage>;
  getClient(id: string, includeInactive: boolean, signal?: AbortSignal): Promise<ClientDetail>;
  createClient(input: CreateClientInput): Promise<ClientDetail>;
  updateClient(id: string, input: UpdateClientInput): Promise<ClientDetail>;
  deactivateClient(id: string, input: LifecycleInput): Promise<ClientDetail>;
  reactivateClient(id: string, input: LifecycleInput): Promise<ClientDetail>;
  listBranches(clientId: string, filters: BranchListFilters, signal?: AbortSignal): Promise<BranchPage>;
  createBranch(clientId: string, input: CreateBranchInput): Promise<ClientBranch>;
  updateBranch(clientId: string, branchId: string, input: UpdateBranchInput): Promise<ClientBranch>;
  deactivateBranch(clientId: string, branchId: string, input: LifecycleInput): Promise<ClientBranch>;
  reactivateBranch(clientId: string, branchId: string, input: LifecycleInput): Promise<ClientBranch>;
  listContacts(clientId: string, filters: ContactListFilters, signal?: AbortSignal): Promise<ContactPage>;
  createContact(clientId: string, input: CreateContactInput): Promise<ClientContact>;
  updateContact(clientId: string, contactId: string, input: UpdateContactInput): Promise<ClientContact>;
  deactivateContact(clientId: string, contactId: string, input: LifecycleInput): Promise<ClientContact>;
  reactivateContact(clientId: string, contactId: string, input: LifecycleInput): Promise<ClientContact>;
}
```

Usar `encodeURIComponent` en cada ID, omitir filtros `undefined`, recortar textos
y forzar `includeInactive=true` cuando `isActive === false`.

- [ ] **Step 5: Verificar GREEN y commit**

Run: `npm test -- src/api/clients.test.ts`

Expected: PASS en todos los contratos y rutas.

```bash
git add src/models/client.ts src/api/clients.ts src/api/clients.test.ts
git commit -m "feat(clientes): agregar contratos y cliente HTTP"
```

### Task 2: Estado URL, capacidades y reconciliación pura

**Files:**
- Create: `src/hooks/client-workspace.helpers.ts`
- Create: `src/hooks/client-workspace.helpers.test.ts`

**Interfaces:**
- Consumes: tipos de `src/models/client.ts`.
- Produces: `ClientQueryState`, `parseClientSearch`, `serializeClientSearch`, `deriveClientCapabilities`, `reconcileClient`, `reconcileBranch`, `reconcileContact`.

- [ ] **Step 1: Escribir pruebas fallidas para los 20 parámetros URL**

```ts
const parsed = parseClientSearch("?search=Acme&isActive=false&includeInactive=false&page=2&clientId=c1&clientTab=contacts&contactScope=BRANCH&contactPage=3");
expect(parsed.clients.includeInactive).toBe(true);
expect(parsed.clientId).toBe("c1");
expect(parsed.tab).toBe("contacts");
expect(parsed.contacts.scope).toBe("BRANCH");
expect(parsed.contacts.page).toBe(3);
```

Añadir pruebas para booleanos inválidos, texto vacío, páginas negativas,
`clientTab=unknown`, cambio de cliente que limpia filtros hijos y serialización
que conserva parámetros ajenos al módulo.

- [ ] **Step 2: Ejecutar RED**

Run: `npm test -- src/hooks/client-workspace.helpers.test.ts`

Expected: FAIL por módulo inexistente.

- [ ] **Step 3: Implementar estado y capacidades**

```ts
export interface ClientQueryState {
  clients: ClientListFilters;
  clientId: string | null;
  tab: ClientTab;
  branches: BranchListFilters;
  contacts: ContactListFilters;
}

export interface ClientCapabilities {
  canView: boolean;
  canManage: boolean;
}

export function deriveClientCapabilities(permissions: string[]): ClientCapabilities {
  return {
    canView: permissions.includes("CLIENTS_VIEW"),
    canManage: permissions.includes("CLIENTS_MANAGE"),
  };
}
```

Defaults exactos: páginas 1, `pageSize=20`, `includeInactive=false`, pestaña
`summary`, `clientId=null`. `reconcile*` devuelve siempre el recurso de mayor
versión y acepta saltos como 3→9→17.

- [ ] **Step 4: Ejecutar GREEN y mutation check**

Run: `npm test -- src/hooks/client-workspace.helpers.test.ts`

Expected: PASS; cambiar una reconciliación de `>=` a `<=` debe romper la prueba
de versión no consecutiva.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/client-workspace.helpers.ts src/hooks/client-workspace.helpers.test.ts
git commit -m "feat(clientes): definir estado URL y capacidades"
```

### Task 3: Workspace de lectura para lista y detalle

**Files:**
- Create: `src/hooks/useClientsWorkspace.ts`
- Create: `src/hooks/useClientsWorkspace.test.tsx`

**Interfaces:**
- Consumes: `ClientsApi`, helpers y modelos de Tasks 1–2; `permissions: string[]`; búsqueda superior.
- Produces: `ClientsWorkspace` con lista, detalle, query, estados y comandos de navegación.

- [ ] **Step 1: Escribir pruebas fallidas de carga y navegación**

Usar `renderHook` con un API controlable y probar:

```ts
expect(result.current.list.status).toBe("loading");
await act(async () => resolveList(clientPage([clientA])));
expect(result.current.list.data?.items).toEqual([clientA]);

act(() => result.current.selectClient("client-a"));
expect(window.location.search).toContain("clientId=client-a");
await act(async () => resolveDetail(clientDetailA));
expect(result.current.detail.data?.id).toBe("client-a");
```

Agregar el Review Focus A→B: resolver detalle A después de seleccionar B y
comprobar que nunca se publica A. Probar `popstate` con el mismo `clientId`,
desmontaje, reintento y datos anteriores marcados `stale` ante error temporal.

- [ ] **Step 2: Ejecutar RED**

Run: `npm test -- src/hooks/useClientsWorkspace.test.tsx`

Expected: FAIL porque el hook no existe.

- [ ] **Step 3: Implementar la interfaz mínima del workspace**

```ts
export interface AsyncState<T> {
  status: "idle" | "loading" | "success" | "error";
  data: T | null;
  error: string | null;
  stale: boolean;
}

export interface ClientsWorkspace {
  query: ClientQueryState;
  capabilities: ClientCapabilities;
  list: AsyncState<ClientPage>;
  detail: AsyncState<ClientDetail>;
  setClientFilters(patch: Partial<ClientListFilters>): void;
  selectClient(id: string): void;
  closeDetail(): void;
  setTab(tab: ClientTab): void;
  refreshList(): Promise<void>;
  refreshDetail(): Promise<void>;
  refresh(): Promise<void>;
}
```

Usar un `AbortController` y una generación independientes para lista y detalle.
La URL se actualiza con `replaceState` para filtros y `pushState` para abrir o
cerrar detalle; `popstate` reconstruye el estado y recarga incluso si el ID no
cambia.

- [ ] **Step 4: Verificar GREEN**

Run: `npm test -- src/hooks/useClientsWorkspace.test.tsx`

Expected: PASS para carga, selección A→B, histórico, desmontaje, stale y retry.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useClientsWorkspace.ts src/hooks/useClientsWorkspace.test.tsx
git commit -m "feat(clientes): agregar workspace de consulta"
```

### Task 4: Lista, detalle base y navegación protegida

**Files:**
- Create: `src/pages/ClientsPage.tsx`
- Create: `src/pages/ClientsPage.test.tsx`
- Create: `src/components/clients/ClientTable.tsx`
- Create: `src/components/clients/ClientDetail.tsx`
- Create: `src/components/clients/clients.css`
- Modify: `src/models/app.ts`
- Modify: `src/routes/appRoutes.ts`
- Modify: `src/routes/appRoutes.test.ts`
- Modify: `src/mocks/data.ts`
- Modify: `src/layouts/AppShell.tsx`
- Modify: `src/layouts/AppShell.test.tsx`
- Modify: `src/layouts/Sidebar.test.tsx`

**Interfaces:**
- Consumes: `ClientsWorkspace` de Task 3 y `CLIENTS_VIEW`.
- Produces: página `/clientes`, tabla/tarjetas y detalle con pestaña Resumen.

- [ ] **Step 1: Escribir pruebas fallidas de ruta y permisos**

```ts
expect(getPageFromPath("/clientes")).toBe("Clientes");
expect(getPathFromPage("Clientes")).toBe("/clientes");
expect(canAccessPage("Clientes", ["CLIENTS_VIEW"])).toBe(true);
expect(canAccessPage("Clientes", ["ORDERS_VIEW_ALL"])).toBe(false);
```

En `ClientsPage.test.tsx`, renderizar un workspace de sólo lectura y afirmar
tabla, total, apertura de detalle, pestañas y ausencia de `Nuevo cliente`.

- [ ] **Step 2: Ejecutar RED**

Run: `npm test -- src/routes/appRoutes.test.ts src/layouts/AppShell.test.tsx src/layouts/Sidebar.test.tsx src/pages/ClientsPage.test.tsx`

Expected: FAIL porque `Clientes` y sus componentes no existen.

- [ ] **Step 3: Implementar navegación y composición base**

Añadir `Clientes` y `/clientes` a `Page`, `PagePath`, `pageByPath`,
`pageDescriptions`, `pagePermissions` y `navItems`, usando `Building2` de
Lucide. `AppShell` renderiza:

```tsx
case "Clientes":
  return <ClientsPage search={search} onClearSearch={onClearSearch} />;
```

`ClientTable` muestra código, nombre, RTN/razón social, conteos y estado.
`ClientDetail` muestra Resumen y tabs con roles `tablist`, `tab` y `tabpanel`.
El botón `Nuevo cliente` sólo aparece con `canManage`.

- [ ] **Step 4: Estilos responsive mínimos y GREEN**

En `clients.css`, usar tabla/panel desde 1024 px y tarjetas/detalle fijo a
pantalla completa por debajo. Ningún contenedor tendrá `min-width` que obligue
scroll horizontal móvil.

Run: `npm test -- src/routes/appRoutes.test.ts src/layouts/AppShell.test.tsx src/layouts/Sidebar.test.tsx src/pages/ClientsPage.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/ClientsPage.tsx src/pages/ClientsPage.test.tsx src/components/clients src/models/app.ts src/routes src/mocks/data.ts src/layouts/AppShell.tsx src/layouts/AppShell.test.tsx src/layouts/Sidebar.test.tsx
git commit -m "feat(clientes): integrar navegación y vista principal"
```

### Task 5: Filtros, paginación y estados operativos del listado

**Files:**
- Create: `src/components/clients/ClientFilters.tsx`
- Create: `src/components/clients/ClientFilters.test.tsx`
- Modify: `src/pages/ClientsPage.tsx`
- Modify: `src/pages/ClientsPage.test.tsx`
- Modify: `src/hooks/useClientsWorkspace.ts`
- Modify: `src/hooks/useClientsWorkspace.test.tsx`
- Modify: `src/components/clients/clients.css`

**Interfaces:**
- Consumes: `setClientFilters`, `refreshList`, `list` y búsqueda externa.
- Produces: filtros completos, estados loading/empty/error/stale y paginación.

- [ ] **Step 1: Escribir pruebas fallidas de filtros y estados efectivos**

Probar búsqueda con debounce de 300 ms, `isActive=false` que activa
`includeInactive`, cambio de filtro que vuelve a página 1, limpiar filtros que
invoca `onClearSearch`, y tarjeta inactiva que conserva conteos sin presentarlos
como activos efectivos.

```tsx
await user.selectOptions(screen.getByLabelText("Estado del cliente"), "inactive");
expect(onChange).toHaveBeenCalledWith({ isActive: false, includeInactive: true, page: 1 });
```

- [ ] **Step 2: Ejecutar RED**

Run: `npm test -- src/components/clients/ClientFilters.test.tsx src/pages/ClientsPage.test.tsx src/hooks/useClientsWorkspace.test.tsx`

Expected: FAIL por controles/estados ausentes.

- [ ] **Step 3: Implementar filtros y estados**

Opciones visibles: `Activos`, `Inactivos`, `Todos`; checkbox `Incluir
inactivos`; botones `Actualizar`, `Anterior`, `Siguiente`. Mantener datos previos
durante refresh y mostrar `role=status`; error inicial usa `role=alert` con
`Reintentar`; vacío explica cómo ampliar la consulta.

- [ ] **Step 4: Verificar GREEN**

Run: `npm test -- src/components/clients/ClientFilters.test.tsx src/pages/ClientsPage.test.tsx src/hooks/useClientsWorkspace.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/clients/ClientFilters.tsx src/components/clients/ClientFilters.test.tsx src/components/clients/clients.css src/pages/ClientsPage.tsx src/pages/ClientsPage.test.tsx src/hooks/useClientsWorkspace.ts src/hooks/useClientsWorkspace.test.tsx
git commit -m "feat(clientes): completar filtros y estados del listado"
```

### Task 6: Asistente de creación atómica

**Files:**
- Create: `src/components/clients/ClientWizard.tsx`
- Create: `src/components/clients/ClientWizard.test.tsx`
- Modify: `src/pages/ClientsPage.tsx`
- Modify: `src/hooks/useClientsWorkspace.ts`
- Modify: `src/hooks/useClientsWorkspace.test.tsx`
- Modify: `src/components/clients/clients.css`

**Interfaces:**
- Consumes: `ClientsApi.createClient(CreateClientInput)` y `canManage`.
- Produces: `openCreate`, `closeForm`, `submitCreate`, borrador de tres pasos y selección del cliente creado.

- [ ] **Step 1: Escribir RED para los tres pasos**

Probar que Empresa impide avanzar sin `tradeName`; Sucursal exige nombre y
dirección; coordenadas deben aparecer ambas; Contacto es opcional y, si se
activa, exige nombre y scope.

```ts
expect(onSubmit).toHaveBeenCalledWith({
  tradeName: "Acme",
  legalName: "Acme Honduras",
  taxId: "0801-1999-000001",
  phone: null,
  email: "contacto@acme.test",
  notes: null,
  mainBranch: {
    name: "Principal",
    address: "Colonia Palmira",
    city: "Tegucigalpa",
    region: "Francisco Morazán",
    country: "HN",
    lat: "14.0723",
    long: "-87.1921",
    locationReference: null,
  },
  primaryContact: {
    scope: "MAIN_BRANCH",
    fullName: "Ada Reyes",
    position: "Gerencia",
    phone: "9999-0000",
    email: "ada@acme.test",
  },
});
```

- [ ] **Step 2: Ejecutar RED**

Run: `npm test -- src/components/clients/ClientWizard.test.tsx src/hooks/useClientsWorkspace.test.tsx`

Expected: FAIL por wizard y mutación inexistentes.

- [ ] **Step 3: Implementar wizard y mutación**

Conservar borrador al ir Atrás/Siguiente. Enviar una sola vez; deshabilitar
todos los controles de navegación durante pending. Tras éxito, reconciliar la
lista, seleccionar el `id` retornado y mostrar versión exacta del servidor.
Mapear errores de campos `mainBranch.*` y `primaryContact.*` al paso correcto.

- [ ] **Step 4: Verificar GREEN**

Run: `npm test -- src/components/clients/ClientWizard.test.tsx src/hooks/useClientsWorkspace.test.tsx`

Expected: PASS con y sin contacto opcional, doble envío bloqueado y versión no
consecutiva publicada.

- [ ] **Step 5: Commit**

```bash
git add src/components/clients/ClientWizard.tsx src/components/clients/ClientWizard.test.tsx src/components/clients/clients.css src/pages/ClientsPage.tsx src/hooks/useClientsWorkspace.ts src/hooks/useClientsWorkspace.test.tsx
git commit -m "feat(clientes): agregar creación guiada y atómica"
```

### Task 7: Edición y ciclo de vida del cliente con conflicto explícito

**Files:**
- Create: `src/components/clients/ClientForm.tsx`
- Create: `src/components/clients/ClientForm.test.tsx`
- Create: `src/components/clients/ClientLifecycleDialog.tsx`
- Create: `src/components/clients/ClientLifecycleDialog.test.tsx`
- Modify: `src/components/clients/ClientDetail.tsx`
- Modify: `src/pages/ClientsPage.tsx`
- Modify: `src/hooks/useClientsWorkspace.ts`
- Modify: `src/hooks/useClientsWorkspace.test.tsx`

**Interfaces:**
- Consumes: update/deactivate/reactivate de `ClientsApi`.
- Produces: edición con versión base, motivo auditado y recuperación explícita de `VERSION_CONFLICT`.

- [ ] **Step 1: Escribir RED de versión base y lifecycle**

Escenario obligatorio del Review Focus:

```ts
act(() => result.current.openEdit()); // borrador sobre v3
await act(async () => resolveBackgroundDetail({ ...client, version: 9, tradeName: "Servidor" }));
await act(async () => result.current.submitClientEdit({ tradeName: "Borrador" }));
expect(api.updateClient).toHaveBeenCalledWith(client.id, { version: 3, tradeName: "Borrador" });
```

Probar motivo con 9 y 501 caracteres, doble envío, `CLIENT_HAS_ACTIVE_WORK`,
`TAX_ID_ALREADY_EXISTS`, `RESOURCE_INACTIVE`, `404` y adopción explícita de una
versión de conflicto sin sustituir campos del borrador.

- [ ] **Step 2: Ejecutar RED**

Run: `npm test -- src/components/clients/ClientForm.test.tsx src/components/clients/ClientLifecycleDialog.test.tsx src/hooks/useClientsWorkspace.test.tsx`

Expected: FAIL.

- [ ] **Step 3: Implementar formularios y estado de conflicto**

```ts
export interface ClientEditDraft {
  clientId: string;
  baseVersion: number;
  values: Omit<UpdateClientInput, "version">;
  conflict: ClientDetail | null;
}
```

`reviewClientConflict` carga la versión vigente; `adoptClientConflict` cambia
únicamente `baseVersion` después de confirmación y mantiene `values`. No cerrar
el diálogo ante error recuperable. Un 404 cierra sólo el recurso afectado y
refresca lista.

- [ ] **Step 4: Verificar GREEN**

Run: `npm test -- src/components/clients/ClientForm.test.tsx src/components/clients/ClientLifecycleDialog.test.tsx src/hooks/useClientsWorkspace.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/clients/ClientForm.tsx src/components/clients/ClientForm.test.tsx src/components/clients/ClientLifecycleDialog.tsx src/components/clients/ClientLifecycleDialog.test.tsx src/components/clients/ClientDetail.tsx src/pages/ClientsPage.tsx src/hooks/useClientsWorkspace.ts src/hooks/useClientsWorkspace.test.tsx
git commit -m "feat(clientes): integrar edición y ciclo de vida"
```

### Task 8: Consulta paginada y presentación de sucursales

**Files:**
- Create: `src/components/clients/ClientBranches.tsx`
- Create: `src/components/clients/ClientBranches.test.tsx`
- Modify: `src/components/clients/ClientDetail.tsx`
- Modify: `src/hooks/useClientsWorkspace.ts`
- Modify: `src/hooks/useClientsWorkspace.test.tsx`
- Modify: `src/components/clients/clients.css`

**Interfaces:**
- Consumes: `listBranches` y filtros URL de Task 2.
- Produces: `branches: AsyncState<BranchPage>`, filtros, paginación y vista de estados interno/efectivo.

- [ ] **Step 1: Escribir RED de lazy loading, A→B y estado efectivo**

Probar que no consulta antes de abrir `branches`; cambiar a Contactos aborta la
lectura; seleccionar B descarta respuesta de A; cliente inactivo muestra una
sucursal `isActive=true` como `No disponible por cliente inactivo`, no como
desactivada internamente.

- [ ] **Step 2: Ejecutar RED**

Run: `npm test -- src/components/clients/ClientBranches.test.tsx src/hooks/useClientsWorkspace.test.tsx`

Expected: FAIL.

- [ ] **Step 3: Implementar colección y UI**

Filtros: búsqueda, ciudad, región, estado e inactivos. Mostrar código, nombre,
dirección, ciudad/región, estado interno, estado efectivo y enlace de ubicación
sólo cuando lat/long sean numéricos finitos. Usar `target="_blank"` y
`rel="noreferrer"`.

- [ ] **Step 4: Verificar GREEN**

Run: `npm test -- src/components/clients/ClientBranches.test.tsx src/hooks/useClientsWorkspace.test.tsx`

Expected: PASS para lazy loading, filtros URL, paginación, stale y retry.

- [ ] **Step 5: Commit**

```bash
git add src/components/clients/ClientBranches.tsx src/components/clients/ClientBranches.test.tsx src/components/clients/ClientDetail.tsx src/components/clients/clients.css src/hooks/useClientsWorkspace.ts src/hooks/useClientsWorkspace.test.tsx
git commit -m "feat(clientes): agregar consulta de sucursales"
```

### Task 9: Mutaciones y ciclo de vida de sucursales

**Files:**
- Create: `src/components/clients/BranchForm.tsx`
- Create: `src/components/clients/BranchForm.test.tsx`
- Modify: `src/components/clients/ClientBranches.tsx`
- Modify: `src/components/clients/ClientBranches.test.tsx`
- Modify: `src/components/clients/ClientLifecycleDialog.tsx`
- Modify: `src/hooks/useClientsWorkspace.ts`
- Modify: `src/hooks/useClientsWorkspace.test.tsx`

**Interfaces:**
- Consumes: create/update/deactivate/reactivate branch y `canManage`.
- Produces: formularios de sucursal, lifecycle, mensajes visibles de dominio y reconciliación de colección/detalle.

- [ ] **Step 1: Escribir RED de reglas de sucursal**

Probar par de coordenadas, país `HN`, versión base, cliente inactivo que oculta
mutaciones, y que los errores del servidor se presentan dentro del diálogo:

```ts
api.deactivateBranch.mockRejectedValueOnce(
  new ApiClientError(409, "BRANCH_HAS_ACTIVE_WORK", "conflict"),
);
await user.click(screen.getByRole("button", { name: "Desactivar sucursal" }));
await user.click(screen.getByRole("button", { name: "Confirmar" }));
expect(await screen.findByRole("alert")).toHaveTextContent(
  "La sucursal tiene trabajo activo y no puede desactivarse.",
);
```

Repetir con `CLIENT_REQUIRES_ACTIVE_BRANCH` y esperar `El cliente debe conservar
al menos una sucursal activa.`.

Probar que `MAIN` puede desactivarse cuando la API responde éxito y que no se
cambia el estado interno de otras sucursales.

- [ ] **Step 2: Ejecutar RED**

Run: `npm test -- src/components/clients/BranchForm.test.tsx src/components/clients/ClientBranches.test.tsx src/hooks/useClientsWorkspace.test.tsx`

Expected: FAIL.

- [ ] **Step 3: Implementar mutaciones**

Cada edición/lifecycle captura versión de la sucursal, invalida lecturas previas
tras éxito y vuelve a cargar detalle y colección con filtros vigentes. Crear no
envía versión. Conflicto preserva formulario y adopta versión sólo tras revisión
explícita, igual que el cliente.

- [ ] **Step 4: Verificar GREEN**

Run: `npm test -- src/components/clients/BranchForm.test.tsx src/components/clients/ClientBranches.test.tsx src/hooks/useClientsWorkspace.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/clients/BranchForm.tsx src/components/clients/BranchForm.test.tsx src/components/clients/ClientBranches.tsx src/components/clients/ClientBranches.test.tsx src/components/clients/ClientLifecycleDialog.tsx src/hooks/useClientsWorkspace.ts src/hooks/useClientsWorkspace.test.tsx
git commit -m "feat(clientes): administrar sucursales"
```

### Task 10: Consulta unificada de contactos

**Files:**
- Create: `src/components/clients/ClientContacts.tsx`
- Create: `src/components/clients/ClientContacts.test.tsx`
- Modify: `src/components/clients/ClientDetail.tsx`
- Modify: `src/hooks/useClientsWorkspace.ts`
- Modify: `src/hooks/useClientsWorkspace.test.tsx`
- Modify: `src/components/clients/clients.css`

**Interfaces:**
- Consumes: `listContacts`, filtros URL y sucursales del cliente.
- Produces: `contacts: AsyncState<ContactPage>`, agrupación visual, filtros y principalidad legible.

- [ ] **Step 1: Escribir RED de filtros, ámbitos y estado efectivo**

Probar lazy loading, cambio A→B, filtros `CLIENT`/`BRANCH`, `branchId`, búsqueda,
paginación, agrupación y un contacto internamente activo pero no efectivo por
cliente inactivo.

```tsx
expect(screen.getByRole("heading", { name: "Contactos generales" })).toBeVisible();
expect(screen.getByRole("heading", { name: "Sucursal Principal" })).toBeVisible();
expect(screen.getByText("Principal general")).toBeVisible();
```

- [ ] **Step 2: Ejecutar RED**

Run: `npm test -- src/components/clients/ClientContacts.test.tsx src/hooks/useClientsWorkspace.test.tsx`

Expected: FAIL.

- [ ] **Step 3: Implementar colección unificada**

Mantener el orden del API dentro de cada grupo. Mostrar nombre, cargo, teléfono,
correo, ámbito, sucursal, principal y estados. Crear `mailto:` sólo para correo
válido y `tel:` tras retirar caracteres no permitidos; texto siempre permanece
visible aunque no se cree enlace.

- [ ] **Step 4: Verificar GREEN**

Run: `npm test -- src/components/clients/ClientContacts.test.tsx src/hooks/useClientsWorkspace.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/clients/ClientContacts.tsx src/components/clients/ClientContacts.test.tsx src/components/clients/ClientDetail.tsx src/components/clients/clients.css src/hooks/useClientsWorkspace.ts src/hooks/useClientsWorkspace.test.tsx
git commit -m "feat(clientes): agregar consulta unificada de contactos"
```

### Task 11: Mutaciones, ámbitos y contactos principales

**Files:**
- Create: `src/components/clients/ContactForm.tsx`
- Create: `src/components/clients/ContactForm.test.tsx`
- Modify: `src/components/clients/ClientContacts.tsx`
- Modify: `src/components/clients/ClientContacts.test.tsx`
- Modify: `src/components/clients/ClientLifecycleDialog.tsx`
- Modify: `src/hooks/useClientsWorkspace.ts`
- Modify: `src/hooks/useClientsWorkspace.test.tsx`

**Interfaces:**
- Consumes: create/update/deactivate/reactivate contact, sucursales vigentes y `canManage`.
- Produces: administración completa, cambio de ámbito, principalidad por alcance y `toContactInput(values)` para normalizar el formulario antes del envío.

- [ ] **Step 1: Escribir RED de invariantes y conflicto de principal**

```ts
expect(toContactInput({ scope: "CLIENT", branchId: "branch-1", fullName: "Ada", isPrimary: true })).toEqual({
  scope: "CLIENT",
  fullName: "Ada",
  position: null,
  phone: null,
  email: null,
  isPrimary: true,
});
```

Probar que `BRANCH` sin sucursal no envía; cambiar principal general no altera
los de sucursal; desactivar principal no promueve otro; `PRIMARY_CONTACT_CONFLICT`
al reactivar conserva motivo/formulario; mover contacto exige versión base y
sucursal del cliente actual.

- [ ] **Step 2: Ejecutar RED**

Run: `npm test -- src/components/clients/ContactForm.test.tsx src/components/clients/ClientContacts.test.tsx src/hooks/useClientsWorkspace.test.tsx`

Expected: FAIL.

- [ ] **Step 3: Implementar mutaciones y confirmación de principalidad**

Implementar `toContactInput` en `ContactForm.tsx`: elimina `branchId` cuando el
ámbito es `CLIENT`, exige una sucursal vigente cuando es `BRANCH`, recorta textos
y convierte opcionales vacíos en `null`.

Cuando `isPrimary=true`, mostrar: `Este contacto reemplazará al principal activo
del mismo ámbito.` La respuesta del servidor reconcilia el contacto mutado y se
recargan colección/detalle para recoger la desmarcación transaccional del
principal anterior. No modificar contactos de otro ámbito de forma optimista.

- [ ] **Step 4: Verificar GREEN**

Run: `npm test -- src/components/clients/ContactForm.test.tsx src/components/clients/ClientContacts.test.tsx src/hooks/useClientsWorkspace.test.tsx`

Expected: PASS con versiones 3→9→17 y sin incremento local.

- [ ] **Step 5: Commit**

```bash
git add src/components/clients/ContactForm.tsx src/components/clients/ContactForm.test.tsx src/components/clients/ClientContacts.tsx src/components/clients/ClientContacts.test.tsx src/components/clients/ClientLifecycleDialog.tsx src/hooks/useClientsWorkspace.ts src/hooks/useClientsWorkspace.test.tsx
git commit -m "feat(clientes): administrar contactos y principales"
```

### Task 12: Autorización dinámica, foco y aceptación integrada

**Files:**
- Create: `src/components/clients/ClientDialogFrame.tsx`
- Create: `src/components/clients/ClientDialogFrame.test.tsx`
- Create: `src/clients-flow.integration.test.tsx`
- Modify: `src/pages/ClientsPage.tsx`
- Modify: `src/pages/ClientsPage.test.tsx`
- Modify: `src/components/clients/ClientWizard.tsx`
- Modify: `src/components/clients/ClientForm.tsx`
- Modify: `src/components/clients/BranchForm.tsx`
- Modify: `src/components/clients/ContactForm.tsx`
- Modify: `src/components/clients/ClientLifecycleDialog.tsx`
- Modify: `src/components/clients/clients.css`
- Modify: `src/hooks/useClientsWorkspace.ts`
- Modify: `src/hooks/useClientsWorkspace.test.tsx`
- Modify: `docs/architecture/current-state.md`
- Modify: `docs/plans/implementation-plan.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: módulo completo de Tasks 1–11 y `useAuth`.
- Produces: flujo accesible, seguro, documentado y verificado de extremo a extremo.

- [ ] **Step 1: Escribir RED de revocación, foco y flujo integrado**

Probar con componentes reales:

1. `CLIENTS_MANAGE` desaparece con wizard abierto: se aborta/cierra el formulario,
   se descarta el borrador autorizado y quedan lecturas.
2. `CLIENTS_VIEW` desaparece: se abortan lista/detalle/hijos y AppShell muestra
   acceso denegado sin conservar nombres/contactos.
3. Tab y Shift+Tab permanecen dentro de cada diálogo; Escape cierra y restaura
   foco cuando idle.
4. Durante submit pendiente, Escape se consume y no cierra diálogo ni detalle
   móvil.
5. Tabs responden ArrowLeft/ArrowRight/Home/End y trasladan foco.
6. Flujo integrado: entrar `/clientes`, filtrar, abrir cliente, navegar
   sucursales/contactos, crear contacto principal y recibir versión 17.

```ts
fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
expect(screen.getByRole("dialog", { name: "Desactivar cliente" })).toBeVisible();
expect(screen.getByRole("dialog", { name: /Detalle de Acme/ })).toBeVisible();
```

- [ ] **Step 2: Ejecutar RED**

Run: `npm test -- src/components/clients/ClientDialogFrame.test.tsx src/pages/ClientsPage.test.tsx src/hooks/useClientsWorkspace.test.tsx src/clients-flow.integration.test.tsx`

Expected: FAIL por foco/revocación/integración incompletos.

- [ ] **Step 3: Implementar marco de diálogo y revocación**

`ClientDialogFrame` recibe `open`, `pending`, `label`, `onClose`, `returnFocus` y
niños. Captura `keydown` en fase apropiada, mantiene un destino enfocable aun
cuando botones estén disabled y restaura foco sólo si el destino sigue conectado.

El workspace observa capacidades actuales: perder manage invalida mutaciones y
borradores; perder view invalida todo el módulo. Un `403` aplica la misma regla
según el endpoint, sin convertirlo en lista vacía.

- [ ] **Step 4: Completar responsive y documentación**

Garantizar 44 px efectivos mediante estilos aplicados a controles reales.
Actualizar arquitectura, fase 12 y README con `/clientes`, permisos, matrices y
pendientes restantes: Evidencias globales, Dashboard visual, Reportes y VPS.

- [ ] **Step 5: Ejecutar focales y suite completa**

Run:

```bash
npm test -- src/components/clients src/pages/ClientsPage.test.tsx src/hooks/useClientsWorkspace.test.tsx src/clients-flow.integration.test.tsx src/api/clients.test.ts
npm test -- --pool=threads --maxWorkers=1
npm run lint
npm run build
```

Expected: todos PASS, lint con cero advertencias y build exitoso. Los únicos
avisos permitidos serán los ya documentados de `act(...)`, jsdom o tamaño de
chunk, sin fallos.

- [ ] **Step 6: Ejecutar compatibilidad backend y escaneos**

Desde `server/`, con el `.env` local cargado sólo en el proceso:

```bash
npm test -- tests/clients
npm run test:db -- tests/database/clients-persistence.test.ts tests/clients/clients-http.test.ts
npm run typecheck
npm run lint
npm run build
```

Desde la raíz, comprobar que producción del módulo no contiene
`localStorage`, `sessionStorage`, `Bearer` ni imports desde `mocks`, y ejecutar
`git diff --check`.

- [ ] **Step 7: Commit de cierre**

```bash
git add src/components/clients src/pages/ClientsPage.tsx src/pages/ClientsPage.test.tsx src/hooks/useClientsWorkspace.ts src/hooks/useClientsWorkspace.test.tsx src/clients-flow.integration.test.tsx docs/architecture/current-state.md docs/plans/implementation-plan.md README.md
git commit -m "feat(clientes): cerrar integración frontend"
```

---

## Matriz final esperada

El cierre del plan exige evidencia fresca de:

- focales de contratos, helpers, workspace, componentes y flujo integrado;
- suite frontend completa;
- lint y build frontend;
- unitarias backend de Clientes;
- persistencia y HTTP de Clientes con PostgreSQL de pruebas;
- typecheck, lint y build backend;
- `git diff --check`;
- escaneos sin almacenamiento de tokens, Bearer ni mocks de producción;
- revisión integral de toda la rama antes de fusionar.
