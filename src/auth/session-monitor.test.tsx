import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { AuthApi } from "../api/auth";
import { ApiClientError, ApiNetworkError } from "../api/http";
import type { AuthUser } from "../models/auth";
import { AuthProvider } from "./AuthProvider";
import { AuthGate } from "./AuthGate";
import { useAuth } from "./useAuth";

const user: AuthUser = { id: "u1", email: "a@test.example", displayName: "Ada", mustChangePassword: false, technicianId: null, roles: [], permissions: [] };
function Probe() {
  const auth = useAuth();
  return <><output>{auth.status}:{auth.notice ?? "none"}</output><input aria-label="Borrador" /><button onClick={() => void auth.login({ email: user.email, password: "secret" })}>Login</button><button onClick={() => void auth.changePassword({ currentPassword: "old", newPassword: "new" })}>Password</button><button onClick={() => void auth.logout()}>Logout</button></>;
}
async function setup() {
  vi.useFakeTimers();
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  const api: AuthApi = { me: vi.fn().mockResolvedValue(user), login: vi.fn().mockResolvedValue(user), logout: vi.fn(), changePassword: vi.fn() };
  const view = render(<AuthProvider api={api}><Probe /></AuthProvider>);
  await act(async () => {});
  return { api, ...view };
}
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.mocked(fetch).mockReset(); });

it("muestra el inicio de sesión al revocar el acceso sin recargar la página", async () => {
  vi.useFakeTimers();
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ data: { user } }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ errors: [{ code: "AUTHENTICATION_REQUIRED", message: "Sesión requerida" }] }), { status: 401 }));
  render(<AuthProvider><AuthGate><p>Área privada</p></AuthGate></AuthProvider>);
  await act(async () => {});
  expect(screen.getByText("Área privada")).toBeInTheDocument();
  await act(() => vi.advanceTimersByTimeAsync(30_000));
  expect(screen.getByRole("heading", { name: "Iniciar sesión" })).toBeInTheDocument();
  expect(screen.queryByText("Área privada")).not.toBeInTheDocument();
  expect(fetch).toHaveBeenLastCalledWith(expect.stringContaining("/auth/session"), expect.objectContaining({ credentials: "include" }));
});

it("expira una sesión revocada después de 30 segundos sin interacción", async () => {
  const { api } = await setup();
  vi.mocked(api.me).mockRejectedValue(new ApiClientError(401, "AUTHENTICATION_REQUIRED", "Sesión requerida"));
  await act(() => vi.advanceTimersByTimeAsync(30_000));
  expect(screen.getByRole("status")).toHaveTextContent("anonymous:SESSION_EXPIRED");
  expect(api.me).toHaveBeenLastCalledWith(expect.objectContaining({ passive: true }));
});

it("conserva el acceso ante fallas de red y errores de servidor", async () => {
  const { api } = await setup();
  fireEvent.change(screen.getByLabelText("Borrador"), { target: { value: "Trabajo en curso" } });
  vi.mocked(api.me).mockRejectedValueOnce(new ApiNetworkError()).mockRejectedValueOnce(new ApiClientError(503, "UNAVAILABLE", "No disponible"));
  await act(() => vi.advanceTimersByTimeAsync(60_000));
  expect(api.me).toHaveBeenCalledTimes(3);
  expect(screen.getByRole("status")).toHaveTextContent("authenticated:none");
  expect(screen.getByLabelText("Borrador")).toHaveValue("Trabajo en curso");
});

it("no consulta oculta y verifica al volver a la pestaña", async () => {
  const { api } = await setup();
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
  await act(() => vi.advanceTimersByTimeAsync(60_000));
  expect(api.me).toHaveBeenCalledTimes(1);
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
  expect(api.me).toHaveBeenCalledTimes(2);
});

it("evita consultas simultáneas y descarta respuestas de una sesión anterior", async () => {
  const { api, unmount } = await setup();
  let reject!: (error: Error) => void;
  vi.mocked(api.me).mockImplementation(() => new Promise((_resolve, rejectPromise) => { reject = rejectPromise; }));
  await act(async () => { window.dispatchEvent(new Event("focus")); window.dispatchEvent(new Event("focus")); });
  expect(api.me).toHaveBeenCalledTimes(2);
  await act(async () => { fireEvent.click(screen.getByText("Login")); });
  await act(async () => { reject(new ApiClientError(401, "AUTHENTICATION_REQUIRED", "Sesión anterior")); });
  expect(screen.getByRole("status")).toHaveTextContent("authenticated:none");
  unmount();
  await act(() => vi.advanceTimersByTimeAsync(60_000));
  expect(api.me).toHaveBeenCalledTimes(2);
});

it("pausa la comprobación durante la rotación de contraseña", async () => {
  const { api } = await setup();
  let resolve!: (user: AuthUser) => void;
  vi.mocked(api.changePassword).mockImplementation(() => new Promise((done) => { resolve = done; }));
  await act(async () => { fireEvent.click(screen.getByText("Password")); window.dispatchEvent(new Event("focus")); });
  expect(api.me).toHaveBeenCalledTimes(1);
  await act(async () => { resolve({ ...user }); });
  await act(async () => { window.dispatchEvent(new Event("focus")); });
  expect(api.me).toHaveBeenCalledTimes(2);
  expect(screen.getByRole("status")).toHaveTextContent("authenticated:none");
});

it("pausa la comprobación durante logout y conserva el aviso de salida voluntaria", async () => {
  const { api } = await setup();
  let resolve!: () => void;
  vi.mocked(api.logout).mockImplementation(() => new Promise((done) => { resolve = done; }));
  await act(async () => { fireEvent.click(screen.getByText("Logout")); window.dispatchEvent(new Event("focus")); });
  await act(() => vi.advanceTimersByTimeAsync(30_000));
  expect(api.me).toHaveBeenCalledTimes(1);
  await act(async () => { resolve(); });
  expect(screen.getByRole("status")).toHaveTextContent("anonymous:LOGGED_OUT");
});

it("cancela la consulta pendiente y limpia temporizadores al desmontar", async () => {
  const { api, unmount } = await setup();
  vi.mocked(api.me).mockImplementation(() => new Promise(() => {}));
  await act(async () => { window.dispatchEvent(new Event("focus")); });
  const options = vi.mocked(api.me).mock.calls[1]?.[0];
  expect(options?.signal?.aborted).toBe(false);
  unmount();
  expect(options?.signal?.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});
