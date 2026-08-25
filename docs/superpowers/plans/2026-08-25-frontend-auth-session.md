# Frontend Authentication and Session Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Conectar la SPA con la sesión persistente del backend para iniciar, restaurar, renovar y cerrar sesiones reales con permisos y cambio obligatorio de contraseña.

**Architecture:** Un cliente HTTP tipado normaliza red, JSON, `204` y errores de API. Un `AuthProvider` conserva exclusivamente en memoria el usuario y el estado de sesión; `AuthGate` selecciona carga, error recuperable, acceso, cambio obligatorio o aplicación autenticada. El shell operativo queda separado de la raíz de autenticación y usa la identidad y permisos reales.

**Tech Stack:** React 18, TypeScript estricto, Context API, History API, Fetch, Vitest, React Testing Library, CSS personalizado.

**Spec:** `docs/superpowers/specs/2026-08-25-frontend-auth-session-design.md`

## Global Constraints

- La cookie `gs_session` permanece `HttpOnly`; no guardar tokens, usuario ni credenciales en `localStorage` o `sessionStorage`.
- Toda petición al API usa `credentials: "include"` y el backend conserva la autoridad final de permisos.
- No agregar Redux, Zustand, React Router ni otra dependencia de estado o navegación.
- `401` invalida la sesión; `403` conserva la sesión; un fallo de red en `/auth/me` produce un estado recuperable, no una sesión anónima.
- `mustChangePassword` bloquea toda la aplicación salvo cambio de contraseña y logout.
- Sólo se conserva una ruta interna conocida para regresar tras login; nunca URLs absolutas ni datos de formularios.
- Mantener el lenguaje visual actual de Geek Solution y soporte responsive desde 320 px.
- Aplicar TDD: observar cada prueba fallar por la ausencia del comportamiento antes de implementar.

---

### Task 1: Contrato HTTP y API de autenticación

**Files:**
- Create: `src/models/auth.ts`
- Create: `src/api/auth.ts`
- Create: `src/api/http.test.ts`
- Create: `src/api/auth.test.ts`
- Modify: `src/api/http.ts`
- Modify: `src/test/setup.ts`

**Interfaces:**
- Produces: `AuthUser`, `LoginInput`, `ChangePasswordInput`, `AuthApi`.
- Produces: `requestJson<T>(path, init?, options?)`, `ApiClientError`, `ApiNetworkError`, `subscribeUnauthorized(listener)`.
- Consumes: respuestas `{ data: T }` y errores uniformes del backend existente.

- [ ] **Step 1: Escribir pruebas fallidas del cliente HTTP**

Crear `src/api/http.test.ts` con casos reales de Fetch para `204`, red, validación y notificación única:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiClientError,
  ApiNetworkError,
  requestJson,
  subscribeUnauthorized,
} from "./http";

afterEach(() => vi.mocked(fetch).mockReset());

describe("requestJson", () => {
  it("acepta respuestas 204 sin decodificar JSON", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 204 }));
    await expect(requestJson<void>("/auth/logout", { method: "POST" })).resolves.toBeUndefined();
  });

  it("distingue una falla de red", async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(requestJson("/auth/me")).rejects.toBeInstanceOf(ApiNetworkError);
  });

  it("conserva errores por campo", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
      message: "Datos inválidos",
      errors: [{ field: "email", code: "VALIDATION_ERROR", message: "Correo inválido" }],
    }), { status: 400, headers: { "Content-Type": "application/json" } }));
    await expect(requestJson("/auth/login", { method: "POST" })).rejects.toMatchObject({
      status: 400,
      fieldErrors: [{ field: "email", message: "Correo inválido" }],
    });
  });

  it("notifica 401 salvo que se desactive explícitamente", async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeUnauthorized(listener);
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
      errors: [{ code: "UNAUTHORIZED", message: "Sesión requerida" }],
    }), { status: 401, headers: { "Content-Type": "application/json" } }));
    await requestJson("/private").catch(() => undefined);
    await requestJson("/auth/me", {}, { notifyUnauthorized: false }).catch(() => undefined);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});
```

- [ ] **Step 2: Ejecutar la prueba y comprobar RED**

Run: `npm test -- src/api/http.test.ts`

Expected: FAIL porque `ApiNetworkError`, `fieldErrors`, `subscribeUnauthorized` y el manejo `204` no existen.

- [ ] **Step 3: Implementar el contrato HTTP mínimo**

Reemplazar `src/api/http.ts` con tipos compatibles con los consumidores KPI actuales:

```ts
export interface ApiFieldError { field?: string; code: string; message: string }
export interface RequestOptions { notifyUnauthorized?: boolean }

export class ApiClientError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fieldErrors: ApiFieldError[] = [],
  ) { super(message); this.name = "ApiClientError"; }
}

export class ApiNetworkError extends Error {
  constructor() { super("No fue posible conectar con el servidor"); this.name = "ApiNetworkError"; }
}

const unauthorizedListeners = new Set<() => void>();
export function subscribeUnauthorized(listener: () => void) {
  unauthorizedListeners.add(listener);
  return () => { unauthorizedListeners.delete(listener); };
}

export async function requestJson<T>(
  path: string,
  init: RequestInit = {},
  options: RequestOptions = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api/v1"}${path}`, {
      ...init,
      credentials: "include",
      headers: { "Content-Type": "application/json", ...init.headers },
    });
  } catch { throw new ApiNetworkError(); }
  if (response.status === 204) return undefined as T;
  const body = await response.json() as {
    data?: T;
    error?: ApiFieldError;
    errors?: ApiFieldError[];
    message?: string;
  };
  if (!response.ok) {
    const errors = body.errors ?? (body.error ? [body.error] : []);
    const detail = errors[0];
    if (response.status === 401 && options.notifyUnauthorized !== false) {
      unauthorizedListeners.forEach((listener) => listener());
    }
    throw new ApiClientError(
      response.status,
      detail?.code ?? "HTTP_ERROR",
      detail?.message ?? body.message ?? "No fue posible completar la solicitud",
      errors,
    );
  }
  return body.data as T;
}
```

- [ ] **Step 4: Definir modelos y escribir pruebas fallidas de `authApi`**

Crear `src/models/auth.ts`:

```ts
export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  mustChangePassword: boolean;
  technicianId: string | null;
  roles: string[];
  permissions: string[];
}
export interface LoginInput { email: string; password: string }
export interface ChangePasswordInput { currentPassword: string; newPassword: string }
```

Crear `src/api/auth.test.ts` y comprobar rutas, cuerpo y `notifyUnauthorized: false` en login/me:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { authApi } from "./auth";

beforeEach(() => vi.mocked(fetch).mockReset());

it("normaliza el correo y envía login con cookies", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ data: { user: {
    id: "u1", email: "admin@geek.test", displayName: "Admin", mustChangePassword: false,
    technicianId: null, roles: ["ADMIN"], permissions: ["KPI_VIEW_ALL"],
  } } }), { status: 200, headers: { "Content-Type": "application/json" } }));
  await authApi.login({ email: " ADMIN@GEEK.TEST ", password: "secret" });
  expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/auth/login"), expect.objectContaining({
    method: "POST",
    body: JSON.stringify({ email: "admin@geek.test", password: "secret" }),
  }));
});
```

Run: `npm test -- src/api/auth.test.ts`

Expected: FAIL porque `src/api/auth.ts` no existe.

- [ ] **Step 5: Implementar `authApi` y ejecutar ambas pruebas**

Crear `src/api/auth.ts`:

```ts
import { requestJson } from "./http";
import type { AuthUser, ChangePasswordInput, LoginInput } from "../models/auth";

interface UserEnvelope { user: AuthUser }
export interface AuthApi {
  login(input: LoginInput): Promise<AuthUser>;
  me(): Promise<AuthUser>;
  changePassword(input: ChangePasswordInput): Promise<AuthUser>;
  logout(): Promise<void>;
}
export const authApi: AuthApi = {
  async login(input) {
    const result = await requestJson<UserEnvelope>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ ...input, email: input.email.trim().toLowerCase() }),
    }, { notifyUnauthorized: false });
    return result.user;
  },
  async me() {
    return (await requestJson<UserEnvelope>("/auth/me", {}, { notifyUnauthorized: false })).user;
  },
  async changePassword(input) {
    return (await requestJson<UserEnvelope>("/auth/change-password", {
      method: "POST", body: JSON.stringify(input),
    })).user;
  },
  logout() { return requestJson<void>("/auth/logout", { method: "POST" }); },
};
```

Run: `npm test -- src/api/http.test.ts src/api/auth.test.ts src/api/kpis.test.ts`

Expected: PASS; KPI conserva compatibilidad.

- [ ] **Step 6: Commit**

```bash
git add src/api src/models/auth.ts src/test/setup.ts
git commit -m "feat(auth): add typed frontend API contract"
```

---

### Task 2: Proveedor centralizado de sesión

**Files:**
- Create: `src/auth/AuthContext.ts`
- Create: `src/auth/AuthProvider.tsx`
- Create: `src/auth/useAuth.ts`
- Create: `src/auth/AuthProvider.test.tsx`
- Create: `src/test/auth-test-utils.tsx`
- Modify: `src/routes/appRoutes.ts`

**Interfaces:**
- Consumes: `AuthApi`, `AuthUser`, `subscribeUnauthorized` de Task 1.
- Produces: `AuthStatus`, `AuthNotice`, `AuthContextValue`, `AuthProvider`, `useAuth`, `isKnownInternalPath`.

- [ ] **Step 1: Definir el contexto y escribir pruebas fallidas del proveedor**

Crear `src/auth/AuthContext.ts`:

```ts
import { createContext } from "react";
import type { AuthUser, ChangePasswordInput, LoginInput } from "../models/auth";

export type AuthStatus = "checking" | "anonymous" | "authenticated" | "unavailable";
export type AuthNotice = "SESSION_EXPIRED" | "LOGGED_OUT" | null;
export interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  notice: AuthNotice;
  returnPath: string | null;
  login(input: LoginInput): Promise<void>;
  changePassword(input: ChangePasswordInput): Promise<void>;
  logout(): Promise<void>;
  retry(): Promise<void>;
  hasPermission(...permissions: string[]): boolean;
}
export const AuthContext = createContext<AuthContextValue | null>(null);
```

Crear `src/auth/AuthProvider.test.tsx` con una API inyectada:

```tsx
const user = { id: "u1", email: "admin@geek.test", displayName: "Ada", mustChangePassword: false,
  technicianId: null, roles: ["ADMIN"], permissions: ["KPI_VIEW_ALL"] };
const api: AuthApi = { login: vi.fn(), me: vi.fn(), changePassword: vi.fn(), logout: vi.fn() };

function Probe() {
  const auth = useAuth();
  return <div>{auth.status}:{auth.user?.displayName ?? "none"}:{String(auth.hasPermission("KPI_VIEW_ALL"))}</div>;
}

it("restaura una sesión y expone permisos", async () => {
  vi.mocked(api.me).mockResolvedValue(user);
  render(<AuthProvider api={api}><Probe /></AuthProvider>);
  expect(screen.getByText("checking:none:false")).toBeInTheDocument();
  expect(await screen.findByText("authenticated:Ada:true")).toBeInTheDocument();
});

it("distingue 401 de una falla de red", async () => {
  vi.mocked(api.me).mockRejectedValueOnce(new ApiClientError(401, "UNAUTHORIZED", "Sesión requerida"));
  const { unmount } = render(<AuthProvider api={api}><Probe /></AuthProvider>);
  expect(await screen.findByText("anonymous:none:false")).toBeInTheDocument();
  unmount();
  vi.mocked(api.me).mockRejectedValueOnce(new ApiNetworkError());
  render(<AuthProvider api={api}><Probe /></AuthProvider>);
  expect(await screen.findByText("unavailable:none:false")).toBeInTheDocument();
});
```

- [ ] **Step 2: Ejecutar y comprobar RED**

Run: `npm test -- src/auth/AuthProvider.test.tsx`

Expected: FAIL porque `AuthProvider` y `useAuth` no existen.

- [ ] **Step 3: Implementar rutas internas seguras, restauración, acciones y permisos**

Crear `src/auth/useAuth.ts`:

```ts
import { useContext } from "react";
import { AuthContext } from "./AuthContext";
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return value;
}
```

Crear `src/test/auth-test-utils.tsx` para que las pruebas posteriores compartan
datos completos y un contexto válido:

```tsx
import type { ReactElement } from "react";
import { render } from "@testing-library/react";
import { vi } from "vitest";
import { AuthContext, type AuthContextValue } from "../auth/AuthContext";
import type { AuthUser } from "../models/auth";

export const adminUser: AuthUser = {
  id: "u1", email: "admin@geek.test", displayName: "Ada Admin",
  mustChangePassword: false, technicianId: null, roles: ["ADMIN"],
  permissions: ["KPI_VIEW_ALL", "ACTIVITIES_VIEW_ALL", "TECHNICIANS_VIEW", "RECURRENCES_VIEW_ALL"],
};
export const provisionalUser: AuthUser = { ...adminUser, mustChangePassword: true };
export const limitedUser: AuthUser = {
  ...adminUser, id: "u2", displayName: "Tania Técnica", roles: ["TECHNICIAN"],
  permissions: ["KPI_VIEW_OWN", "ACTIVITIES_CREATE_OWN"],
};
export function authContext(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    status: "authenticated", user: adminUser, notice: null, returnPath: null,
    login: vi.fn(), changePassword: vi.fn(), logout: vi.fn(), retry: vi.fn(),
    hasPermission: (...codes) => Boolean((overrides.user ?? adminUser)
      && codes.some((code) => (overrides.user ?? adminUser)!.permissions.includes(code))),
    ...overrides,
  };
}
export function renderWithAuth(ui: ReactElement, overrides: Partial<AuthContextValue> = {}) {
  return render(<AuthContext.Provider value={authContext(overrides)}>{ui}</AuthContext.Provider>);
}
```

Agregar a `src/routes/appRoutes.ts` una comprobación que no convierta rutas
desconocidas o absolutas en destinos válidos:

```ts
export function isKnownInternalPath(path: string): path is PagePath {
  return Object.hasOwn(pageByPath, path);
}
```

Crear `src/auth/AuthProvider.tsx` con `api?: AuthApi`, restauración única incluso
bajo Strict Mode, acciones memorizadas y suscripción a `401`:

```tsx
import { type PropsWithChildren, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { authApi, type AuthApi } from "../api/auth";
import { ApiClientError, subscribeUnauthorized } from "../api/http";
import type { AuthUser, ChangePasswordInput, LoginInput } from "../models/auth";
import { isKnownInternalPath } from "../routes/appRoutes";
import { AuthContext, type AuthNotice, type AuthStatus } from "./AuthContext";

export function AuthProvider({ children, api = authApi }: PropsWithChildren<{ api?: AuthApi }>) {
  const [status, setStatus] = useState<AuthStatus>("checking");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [notice, setNotice] = useState<AuthNotice>(null);
  const [returnPath, setReturnPath] = useState<string | null>(null);
  const expired = useRef(false);
  const restoreStarted = useRef(false);

  const applyUser = useCallback((nextUser: AuthUser) => {
    expired.current = false;
    setUser(nextUser);
    setNotice(null);
    setStatus("authenticated");
  }, []);

  const expire = useCallback(() => {
    if (expired.current) return;
    expired.current = true;
    setReturnPath(isKnownInternalPath(window.location.pathname) ? window.location.pathname : "/resumen");
    setUser(null); setNotice("SESSION_EXPIRED"); setStatus("anonymous");
  }, []);

  useEffect(() => subscribeUnauthorized(expire), [expire]);

  const restore = useCallback(async () => {
    setStatus("checking");
    try { applyUser(await api.me()); }
    catch (error) {
      setUser(null);
      setStatus(error instanceof ApiClientError && error.status === 401 ? "anonymous" : "unavailable");
    }
  }, [api, applyUser]);

  useEffect(() => {
    if (restoreStarted.current) return;
    restoreStarted.current = true;
    void restore();
  }, [restore]);

  const login = useCallback(async (input: LoginInput) => {
    const nextUser = await api.login(input);
    applyUser(nextUser);
    if (returnPath && isKnownInternalPath(returnPath)) {
      window.history.replaceState({}, "", returnPath);
      setReturnPath(null);
    }
  }, [api, applyUser, returnPath]);

  const changePassword = useCallback(async (input: ChangePasswordInput) => {
    applyUser(await api.changePassword(input));
  }, [api, applyUser]);

  const logout = useCallback(async () => {
    try { await api.logout(); }
    catch (error) {
      if (!(error instanceof ApiClientError && error.status === 401)) throw error;
    }
    expired.current = false;
    setUser(null); setReturnPath(null); setNotice("LOGGED_OUT"); setStatus("anonymous");
  }, [api]);

  const hasPermission = useCallback((...permissions: string[]) =>
    Boolean(user && permissions.some((permission) => user.permissions.includes(permission))), [user]);

  const value = useMemo(() => ({
    status, user, notice, returnPath, login, changePassword, logout,
    retry: restore, hasPermission,
  }), [status, user, notice, returnPath, login, changePassword, logout, restore, hasPermission]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
```

Añadir pruebas de login, cambio de contraseña, retry, expiración repetida y logout
fallido. Para logout fallido esperar que `status` continúe `authenticated`; para
logout `401`, esperar `anonymous`.

- [ ] **Step 4: Ejecutar pruebas del proveedor**

Run: `npm test -- src/auth/AuthProvider.test.tsx`

Expected: PASS con restauración, acciones, permisos y fallos recuperables.

- [ ] **Step 5: Ejecutar typecheck mediante build y commit**

Run: `npm run build`

Expected: PASS.

```bash
git add src/auth src/routes/appRoutes.ts src/test/auth-test-utils.tsx
git commit -m "feat(auth): centralize browser session state"
```

---

### Task 3: Compuerta y pantallas de autenticación

**Files:**
- Create: `src/auth/AuthGate.tsx`
- Create: `src/auth/AuthGate.test.tsx`
- Create: `src/components/auth/AuthLayout.tsx`
- Create: `src/components/auth/PasswordField.tsx`
- Create: `src/components/auth/PasswordChangeForm.tsx`
- Create: `src/pages/LoginPage.tsx`
- Create: `src/pages/ForcedPasswordChangePage.tsx`
- Create: `src/pages/SessionUnavailablePage.tsx`
- Create: `src/pages/auth-pages.test.tsx`

**Interfaces:**
- Consumes: `useAuth()` y los estados de Task 2.
- Produces: `AuthGate({ children })`, login accesible, cambio obligatorio y reintento.

- [ ] **Step 1: Escribir pruebas fallidas de selección de vista**

En `src/auth/AuthGate.test.tsx`, envolver con un proveedor de contexto controlado:

```tsx
it.each([
  ["checking", "Comprobando sesión"],
  ["unavailable", "No pudimos conectar"],
  ["anonymous", "Iniciar sesión"],
])("muestra %s", (status, label) => {
  render(<AuthContext.Provider value={authContext({ status: status as AuthStatus, user: null })}>
    <AuthGate><div>Privado</div></AuthGate>
  </AuthContext.Provider>);
  expect(screen.getByText(label)).toBeInTheDocument();
  expect(screen.queryByText("Privado")).not.toBeInTheDocument();
});

it("obliga el cambio antes de mostrar contenido privado", () => {
  render(<AuthContext.Provider value={authContext({ status: "authenticated", user: provisionalUser })}>
    <AuthGate><div>Privado</div></AuthGate>
  </AuthContext.Provider>);
  expect(screen.getByRole("heading", { name: "Protege tu cuenta" })).toBeInTheDocument();
});
```

Run: `npm test -- src/auth/AuthGate.test.tsx`

Expected: FAIL porque las vistas no existen.

- [ ] **Step 2: Implementar la compuerta mínima**

```tsx
export function AuthGate({ children }: PropsWithChildren) {
  const { status, user } = useAuth();
  if (status === "checking") return <AuthLayout><p role="status">Comprobando sesión</p></AuthLayout>;
  if (status === "unavailable") return <SessionUnavailablePage />;
  if (status === "anonymous") return <LoginPage />;
  if (user?.mustChangePassword) return <ForcedPasswordChangePage />;
  return children;
}
```

- [ ] **Step 3: Escribir pruebas fallidas de formularios**

En `src/pages/auth-pages.test.tsx`, probar:

```tsx
it("envía correo y contraseña una sola vez", async () => {
  const login = vi.fn(async () => undefined);
  renderWithAuth(<LoginPage />, { status: "anonymous", user: null, login });
  await userEvent.type(screen.getByLabelText("Correo electrónico"), "ADMIN@GEEK.TEST");
  await userEvent.type(screen.getByLabelText("Contraseña"), "Temporal123!");
  await userEvent.click(screen.getByRole("button", { name: "Iniciar sesión" }));
  expect(login).toHaveBeenCalledWith({ email: "ADMIN@GEEK.TEST", password: "Temporal123!" });
  expect(login).toHaveBeenCalledTimes(1);
});

it("valida confirmación antes de cambiar contraseña", async () => {
  const changePassword = vi.fn();
  renderWithAuth(<ForcedPasswordChangePage />, { changePassword, user: provisionalUser });
  await userEvent.type(screen.getByLabelText("Contraseña actual"), "Actual123!xxx");
  await userEvent.type(screen.getByLabelText("Nueva contraseña"), "Nueva123!xxxx");
  await userEvent.type(screen.getByLabelText("Confirmar contraseña"), "Distinta123!");
  await userEvent.click(screen.getByRole("button", { name: "Actualizar contraseña" }));
  expect(screen.getByRole("alert")).toHaveTextContent("Las contraseñas no coinciden");
  expect(changePassword).not.toHaveBeenCalled();
});
```

Run: `npm test -- src/pages/auth-pages.test.tsx`

Expected: FAIL por componentes ausentes.

- [ ] **Step 4: Implementar layout y formularios accesibles**

`PasswordField` debe generar un botón con `aria-label="Mostrar contraseña"` o
`"Ocultar contraseña"`. `LoginPage` traduce `ApiClientError` mediante una tabla
explícita:

```ts
const loginMessages: Record<string, string> = {
  INVALID_CREDENTIALS: "El correo o la contraseña no son correctos.",
  ACCOUNT_LOCKED: "La cuenta está bloqueada temporalmente. Intenta más tarde.",
  TOO_MANY_REQUESTS: "Demasiados intentos. Espera antes de volver a intentar.",
};
```

`PasswordChangeForm` recibe `mode: "forced" | "voluntary"`, `onSubmit` y
`onCancel?`; contiene estado, confirmación, reglas y traducción de errores.
`ForcedPasswordChangePage` lo usa con `mode="forced"`, sin `onCancel`, y muestra
reglas: mínimo 12, mayúscula, minúscula,
número y carácter especial. Traduce los seis códigos `PASSWORD_*` del backend,
asocia errores con `aria-describedby`, deshabilita el envío pendiente y mantiene
disponible el botón “Cerrar sesión”.

- [ ] **Step 5: Ejecutar pruebas y commit**

Run: `npm test -- src/auth/AuthGate.test.tsx src/pages/auth-pages.test.tsx`

Expected: PASS.

```bash
git add src/auth/AuthGate.tsx src/auth/AuthGate.test.tsx src/components/auth src/pages/LoginPage.tsx src/pages/ForcedPasswordChangePage.tsx src/pages/SessionUnavailablePage.tsx src/pages/auth-pages.test.tsx
git commit -m "feat(auth): add login and mandatory password flows"
```

---

### Task 4: Integración del shell, perfil y autorización visual

**Files:**
- Create: `src/layouts/AppShell.tsx`
- Create: `src/layouts/AppShell.test.tsx`
- Create: `src/components/auth/ProfileMenu.tsx`
- Create: `src/components/auth/ProfileMenu.test.tsx`
- Create: `src/pages/AccessDeniedPage.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/layouts/Sidebar.tsx`
- Modify: `src/routes/appRoutes.ts`
- Modify: `src/hooks/useAppRoute.ts`

**Interfaces:**
- Consumes: `AuthProvider`, `AuthGate`, `useAuth`.
- Produces: `AppShell`, navegación filtrada, retorno interno seguro y perfil real.

- [ ] **Step 1: Escribir prueba fallida de integración raíz**

Actualizar `src/App.test.tsx` para que la raíz restaure sesión y muestre identidad
real; trasladar las pruebas puramente operativas existentes a `AppShell.test.tsx`:

```tsx
it("restaura la sesión antes de mostrar el shell", async () => {
  vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ data: { user: adminUser } }), {
    status: 200, headers: { "Content-Type": "application/json" },
  }));
  render(<App />);
  expect(screen.getByText("Comprobando sesión")).toBeInTheDocument();
  expect(await screen.findByText(adminUser.displayName)).toBeInTheDocument();
});
```

Run: `npm test -- src/App.test.tsx`

Expected: FAIL porque `App` aún muestra el shell directamente y el perfil es fijo.

- [ ] **Step 2: Separar el shell y conectar la raíz**

Mover el contenido actual de `App.tsx` sin cambios funcionales a
`src/layouts/AppShell.tsx`. Dejar la raíz pequeña:

```tsx
export default function App() {
  return (
    <AuthProvider>
      <AuthGate><AppShell /></AuthGate>
    </AuthProvider>
  );
}
```

Las pruebas históricas renderizan `<AppShell />` dentro de un
`AuthContext.Provider` autenticado para no depender de red.

- [ ] **Step 3: Escribir pruebas fallidas de perfil, logout y permisos**

```tsx
it("muestra usuario real y cierra sesión", async () => {
  const logout = vi.fn(async () => undefined);
  renderWithAuth(<ProfileMenu />, { user: adminUser, logout });
  await userEvent.click(screen.getByRole("button", { name: "Abrir perfil" }));
  expect(screen.getByText("Administrador")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Cerrar sesión" }));
  expect(logout).toHaveBeenCalledTimes(1);
});

it("oculta módulos sin permiso y conserva la sesión en 403", () => {
  const first = renderWithAuth(<AppShell />, { user: limitedUser });
  expect(screen.queryByRole("button", { name: "Reincidencias" })).not.toBeInTheDocument();
  first.unmount();
  window.history.replaceState({}, "", "/reincidencias");
  renderWithAuth(<AppShell />, { user: limitedUser });
  expect(screen.getByRole("heading", { name: "Acceso denegado" })).toBeInTheDocument();
});
```

- [ ] **Step 4: Implementar catálogo de permisos y ruta segura**

En `src/routes/appRoutes.ts` agregar el catálogo sobre
`isKnownInternalPath` creado en Task 2:

```ts
export const pagePermissions: Record<Page, string[]> = {
  Resumen: ["KPI_VIEW_ALL", "KPI_VIEW_OWN"],
  Actividades: ["ACTIVITIES_VIEW_ALL", "ACTIVITIES_CREATE_OWN"],
  Técnicos: ["TECHNICIANS_VIEW"],
  Reincidencias: ["RECURRENCES_VIEW_ALL", "RECURRENCES_VIEW_OWN"],
};
export function canAccessPage(page: Page, permissions: string[]) {
  return pagePermissions[page].some((permission) => permissions.includes(permission));
}
```

`Sidebar` recibe `visiblePages`; `AppShell` deriva páginas desde permisos. Si la
ruta solicitada no es accesible muestra `AccessDeniedPage`, conserva el perfil y
permite ir al primer módulo accesible. Después de login, `AuthProvider` usa
`isKnownInternalPath` antes de restaurar `returnPath`.

- [ ] **Step 5: Implementar perfil y cambio voluntario**

`ProfileMenu` usa `displayName`, primer rol y sus iniciales. El menú incluye
“Cambiar contraseña” y “Cerrar sesión”. Reutilizar el formulario de Task 3 en
modo voluntario dentro de un diálogo con foco inicial, Escape y restauración de
foco; no duplicar validación.

Run: `npm test -- src/App.test.tsx src/layouts/AppShell.test.tsx src/components/auth/ProfileMenu.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/App.test.tsx src/layouts src/components/auth/ProfileMenu.tsx src/components/auth/ProfileMenu.test.tsx src/pages/AccessDeniedPage.tsx src/routes/appRoutes.ts src/hooks/useAppRoute.ts
git commit -m "feat(auth): protect shell with identity and permissions"
```

---

### Task 5: Cierre visual, accesibilidad y verificación integral

**Files:**
- Create: `src/auth/auth-flow.integration.test.tsx`
- Modify: `src/styles.css`
- Modify: `src/test/setup.ts`
- Modify: `README.md`
- Modify: `docs/plans/implementation-plan.md`

**Interfaces:**
- Consumes: flujo completo de Tasks 1–4.
- Produces: experiencia responsive terminada, regresión integral y documentación actual.

- [ ] **Step 1: Escribir prueba de integración fallida del recorrido completo**

Crear `src/auth/auth-flow.integration.test.tsx` con Fetch secuencial:

```tsx
function apiUser(user: AuthUser) {
  return new Response(JSON.stringify({ data: { user } }), {
    status: 200, headers: { "Content-Type": "application/json" },
  });
}
function apiError(status: number, code: string) {
  return new Response(JSON.stringify({ errors: [{ code, message: "Solicitud rechazada" }] }), {
    status, headers: { "Content-Type": "application/json" },
  });
}

it("entra, cambia contraseña obligatoria, recarga y cierra sesión", async () => {
  const user = userEvent.setup();
  vi.mocked(fetch)
    .mockResolvedValueOnce(apiError(401, "UNAUTHORIZED"))
    .mockResolvedValueOnce(apiUser(provisionalUser))
    .mockResolvedValueOnce(apiUser({ ...provisionalUser, mustChangePassword: false }))
    .mockResolvedValueOnce(new Response(null, { status: 204 }));
  render(<App />);
  await screen.findByRole("heading", { name: "Iniciar sesión" });
  await user.type(screen.getByLabelText("Correo electrónico"), "admin@geek.test");
  await user.type(screen.getByLabelText("Contraseña"), "Temporal123!");
  await user.click(screen.getByRole("button", { name: "Iniciar sesión" }));
  await screen.findByRole("heading", { name: "Protege tu cuenta" });
  await user.type(screen.getByLabelText("Contraseña actual"), "Temporal123!");
  await user.type(screen.getByLabelText("Nueva contraseña"), "NuevaSegura123!");
  await user.type(screen.getByLabelText("Confirmar contraseña"), "NuevaSegura123!");
  await user.click(screen.getByRole("button", { name: "Actualizar contraseña" }));
  expect(await screen.findByText(provisionalUser.displayName)).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Abrir perfil" }));
  await user.click(screen.getByRole("button", { name: "Cerrar sesión" }));
  expect(await screen.findByRole("heading", { name: "Iniciar sesión" })).toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("Tu sesión se cerró correctamente");
});
```

Run: `npm test -- src/auth/auth-flow.integration.test.tsx`

Expected: FAIL porque `LoginPage` todavía no presenta el aviso `LOGGED_OUT`.

- [ ] **Step 2: Aplicar dirección visual Geek Solution**

Agregar a `src/styles.css` clases `auth-shell`, `auth-pulse`, `auth-card`,
`auth-field`, `password-control`, `auth-alert`, `profile-menu` y
`access-denied`. Usar las variables existentes; el fondo azul tinta y el pulso
cian serán la firma visual. Incluir:

```css
.auth-shell { min-height: 100dvh; display: grid; place-items: center; padding: 24px; background: #102d49; }
.auth-card { width: min(100%, 430px); background: #fff; border-radius: 18px; padding: clamp(24px, 5vw, 40px); }
.auth-field:focus-within { outline: 3px solid color-mix(in srgb, var(--blue) 25%, transparent); }
@media (max-width: 480px) { .auth-shell { padding: 0; } .auth-card { min-height: 100dvh; border-radius: 0; } }
@media (prefers-reduced-motion: reduce) { .auth-pulse { animation: none; } }
```

Verificar manualmente a 320, 768 y 1440 px, navegación sólo con teclado, foco
del diálogo y que los mensajes `role="alert"` sean anunciables.

- [ ] **Step 3: Presentar avisos de sesión y ejecutar pruebas focales**

En `LoginPage`, traducir el estado ya producido por `AuthProvider` sin añadir
persistencia ni otro estado global:

```tsx
const noticeMessages: Record<Exclude<AuthNotice, null>, string> = {
  SESSION_EXPIRED: "Tu sesión terminó; inicia nuevamente.",
  LOGGED_OUT: "Tu sesión se cerró correctamente.",
};
// Dentro del formulario, antes del error de envío:
{notice && <p className="auth-notice" role="status">{noticeMessages[notice]}</p>}
```

El `login` exitoso ya limpia `notice` mediante `applyUser`, por lo que el aviso no
reaparece dentro del shell. No cambiar los contratos aprobados.

Run: `npm test -- src/api/http.test.ts src/api/auth.test.ts src/auth src/pages/auth-pages.test.tsx src/layouts/AppShell.test.tsx src/components/auth/ProfileMenu.test.tsx`

Expected: PASS.

- [ ] **Step 4: Actualizar documentación**

En `README.md`, reemplazar la afirmación de que falta pantalla de acceso por:

```md
La SPA restaura sesiones con `GET /api/v1/auth/me`, usa la cookie opaca
`gs_session` y obliga el cambio de contraseña provisional. Los módulos
operativos distintos del dashboard KPI siguen migrándose gradualmente en la
fase 12.
```

En `docs/plans/implementation-plan.md`, registrar el subbloque de autenticación
del frontend como completado sin marcar completa toda la fase 12.

- [ ] **Step 5: Ejecutar matriz final**

Run:

```bash
npm test
npm run lint
npm run build
cd server
npm test -- tests/auth/auth-http.test.ts tests/auth/auth-service.test.ts tests/auth/authorization.test.ts
npm run typecheck
```

Expected: todas las pruebas pasan, ESLint termina con cero advertencias, ambos
typechecks pasan y Vite genera `dist/`.

- [ ] **Step 6: Revisar seguridad del navegador**

Run desde la raíz:

```bash
rg -n "localStorage|sessionStorage|document\.cookie|Authorization.*Bearer" src
```

Expected: sin coincidencias en el código de autenticación. Cualquier coincidencia
preexistente debe revisarse y documentarse; no debe contener sesión o credenciales.

- [ ] **Step 7: Commit**

```bash
git add src/styles.css src/auth/auth-flow.integration.test.tsx src/test/setup.ts README.md docs/plans/implementation-plan.md
git commit -m "test(auth): verify secure frontend session flow"
```

---

## Definition of Done

- Los cinco commits del plan existen y cada tarea pasó su ciclo rojo-verde.
- Login, restauración, cambio obligatorio/voluntario, expiración, permisos y
  logout usan exclusivamente la sesión real del backend.
- No se persisten tokens, cookies, usuario ni contraseñas desde JavaScript.
- La aplicación no muestra contenido privado durante la comprobación inicial.
- Los mocks operativos permanecen sólo fuera del bloque de autenticación y KPI.
- Pruebas frontend, pruebas de contrato auth del backend, lint, typecheck y build
  terminan correctamente.
