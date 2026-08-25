import { StrictMode } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthApi } from "../api/auth";
import { ApiClientError, ApiNetworkError, requestJson } from "../api/http";
import type { AuthUser } from "../models/auth";
import { isKnownInternalPath } from "../routes/appRoutes";
import { AuthProvider } from "./AuthProvider";
import { useAuth } from "./useAuth";

const user: AuthUser = {
  id: "u1",
  email: "admin@geek.test",
  displayName: "Ada",
  mustChangePassword: false,
  technicianId: null,
  roles: ["ADMIN"],
  permissions: ["KPI_VIEW_ALL"],
};

function createApi(): AuthApi {
  return {
    login: vi.fn(),
    me: vi.fn(),
    changePassword: vi.fn(),
    logout: vi.fn(),
  };
}

function Probe() {
  const auth = useAuth();

  return (
    <div>
      <output aria-label="session">
        {auth.status}:{auth.user?.displayName ?? "none"}:{String(auth.hasPermission("KPI_VIEW_ALL"))}:{auth.notice ?? "none"}:{auth.returnPath ?? "none"}
      </output>
      <button onClick={() => void auth.login({ email: "admin@geek.test", password: "secret" })}>Login</button>
      <button onClick={() => void auth.changePassword({ currentPassword: "old", newPassword: "new" })}>Change password</button>
      <button onClick={() => void auth.retry()}>Retry</button>
      <button onClick={() => void auth.logout().catch(() => undefined)}>Logout</button>
    </div>
  );
}

afterEach(() => {
  vi.mocked(fetch).mockReset();
  window.history.replaceState({}, "", "/");
});

describe("AuthProvider", () => {
  it("restaura una sesión y expone permisos", async () => {
    const api = createApi();
    vi.mocked(api.me).mockResolvedValue(user);

    render(<AuthProvider api={api}><Probe /></AuthProvider>);

    expect(screen.getByRole("status")).toHaveTextContent("checking:none:false:none:none");
    expect(await screen.findByText("authenticated:Ada:true:none:none")).toBeInTheDocument();
  });

  it("distingue 401 de una falla de red", async () => {
    const api = createApi();
    vi.mocked(api.me).mockRejectedValueOnce(new ApiClientError(401, "UNAUTHORIZED", "Sesión requerida"));
    const { unmount } = render(<AuthProvider api={api}><Probe /></AuthProvider>);

    expect(await screen.findByText("anonymous:none:false:none:none")).toBeInTheDocument();
    unmount();

    vi.mocked(api.me).mockRejectedValueOnce(new ApiNetworkError());
    render(<AuthProvider api={api}><Probe /></AuthProvider>);

    expect(await screen.findByText("unavailable:none:false:none:none")).toBeInTheDocument();
  });

  it("restaura solo una vez bajo Strict Mode", async () => {
    const api = createApi();
    vi.mocked(api.me).mockResolvedValue(user);

    render(<StrictMode><AuthProvider api={api}><Probe /></AuthProvider></StrictMode>);

    expect(await screen.findByText("authenticated:Ada:true:none:none")).toBeInTheDocument();
    expect(api.me).toHaveBeenCalledTimes(1);
  });

  it("inicia sesión y actualiza el usuario visible", async () => {
    const api = createApi();
    vi.mocked(api.me).mockRejectedValue(new ApiClientError(401, "UNAUTHORIZED", "Sesión requerida"));
    vi.mocked(api.login).mockResolvedValue(user);
    render(<AuthProvider api={api}><Probe /></AuthProvider>);

    await screen.findByText("anonymous:none:false:none:none");
    fireEvent.click(screen.getByRole("button", { name: "Login" }));

    expect(await screen.findByText("authenticated:Ada:true:none:none")).toBeInTheDocument();
  });

  it("actualiza la sesión después de cambiar la contraseña", async () => {
    const api = createApi();
    const renamedUser = { ...user, displayName: "Ada Segura" };
    vi.mocked(api.me).mockResolvedValue(user);
    vi.mocked(api.changePassword).mockResolvedValue(renamedUser);
    render(<AuthProvider api={api}><Probe /></AuthProvider>);

    await screen.findByText("authenticated:Ada:true:none:none");
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));

    expect(await screen.findByText("authenticated:Ada Segura:true:none:none")).toBeInTheDocument();
  });

  it("vuelve a comprobar la sesión al reintentar", async () => {
    const api = createApi();
    vi.mocked(api.me)
      .mockRejectedValueOnce(new ApiNetworkError())
      .mockResolvedValueOnce(user);
    render(<AuthProvider api={api}><Probe /></AuthProvider>);

    await screen.findByText("unavailable:none:false:none:none");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("authenticated:Ada:true:none:none")).toBeInTheDocument();
  });

  it("conserva una sesión autenticada cuando retry recibe 403", async () => {
    const api = createApi();
    let rejectRetry: (reason: Error) => void = () => undefined;
    vi.mocked(api.me)
      .mockResolvedValueOnce(user)
      .mockImplementationOnce(() => new Promise<AuthUser>((_, reject) => {
        rejectRetry = reject;
      }));
    render(<AuthProvider api={api}><Probe /></AuthProvider>);

    await screen.findByText("authenticated:Ada:true:none:none");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("checking:Ada:true:none:none")).toBeInTheDocument();
    await act(async () => {
      rejectRetry(new ApiClientError(403, "FORBIDDEN", "No autorizado"));
      await Promise.resolve();
    });

    expect(screen.getByRole("status")).toHaveTextContent("authenticated:Ada:true:none:none");
  });

  it("mantiene la sesión cuando logout falla fuera de 401", async () => {
    const api = createApi();
    vi.mocked(api.me).mockResolvedValue(user);
    vi.mocked(api.logout).mockRejectedValue(new ApiNetworkError());
    render(<AuthProvider api={api}><Probe /></AuthProvider>);

    await screen.findByText("authenticated:Ada:true:none:none");
    fireEvent.click(screen.getByRole("button", { name: "Logout" }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("authenticated:Ada:true:none:none"));
  });

  it("no deja que una restauración pendiente reabra una sesión cerrada", async () => {
    const api = createApi();
    let resolveSession: (nextUser: AuthUser) => void = () => undefined;
    vi.mocked(api.me).mockImplementation(() => new Promise<AuthUser>((resolve) => {
      resolveSession = resolve;
    }));
    vi.mocked(api.logout).mockResolvedValue(undefined);
    render(<AuthProvider api={api}><Probe /></AuthProvider>);

    fireEvent.click(screen.getByRole("button", { name: "Logout" }));
    expect(await screen.findByText("anonymous:none:false:LOGGED_OUT:none")).toBeInTheDocument();
    await act(async () => {
      resolveSession(user);
      await Promise.resolve();
    });

    expect(screen.getByRole("status")).toHaveTextContent("anonymous:none:false:LOGGED_OUT:none");
  });

  it("convierte logout 401 en estado anónimo", async () => {
    const api = createApi();
    vi.mocked(api.me).mockResolvedValue(user);
    vi.mocked(api.logout).mockRejectedValue(new ApiClientError(401, "UNAUTHORIZED", "Sesión requerida"));
    render(<AuthProvider api={api}><Probe /></AuthProvider>);

    await screen.findByText("authenticated:Ada:true:none:none");
    fireEvent.click(screen.getByRole("button", { name: "Logout" }));

    expect(await screen.findByText("anonymous:none:false:LOGGED_OUT:none")).toBeInTheDocument();
  });

  it("no deja que un logout obsoleto sobrescriba una expiración externa", async () => {
    const api = createApi();
    let resolveLogout: () => void = () => undefined;
    vi.mocked(api.me).mockResolvedValue(user);
    vi.mocked(api.logout).mockImplementation(() => new Promise<void>((resolve) => {
      resolveLogout = resolve;
    }));
    window.history.replaceState({}, "", "/actividades");
    render(<AuthProvider api={api}><Probe /></AuthProvider>);

    await screen.findByText("authenticated:Ada:true:none:none");
    fireEvent.click(screen.getByRole("button", { name: "Logout" }));
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
      errors: [{ code: "UNAUTHORIZED", message: "Sesión requerida" }],
    }), { status: 401, headers: { "Content-Type": "application/json" } }));
    await act(async () => {
      await requestJson("/protected-resource").catch(() => undefined);
    });
    expect(await screen.findByText("anonymous:none:false:SESSION_EXPIRED:/actividades")).toBeInTheDocument();
    await act(async () => {
      resolveLogout();
      await Promise.resolve();
    });

    expect(screen.getByRole("status")).toHaveTextContent("anonymous:none:false:SESSION_EXPIRED:/actividades");
  });

  it("conserva el destino interno inicial durante expiraciones repetidas", async () => {
    const api = createApi();
    vi.mocked(api.me).mockResolvedValue(user);
    window.history.replaceState({}, "", "/actividades");
    render(<AuthProvider api={api}><Probe /></AuthProvider>);

    await screen.findByText("authenticated:Ada:true:none:none");
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
      errors: [{ code: "UNAUTHORIZED", message: "Sesión requerida" }],
    }), { status: 401, headers: { "Content-Type": "application/json" } }));
    await requestJson("/protected-resource").catch(() => undefined);
    window.history.replaceState({}, "", "/tecnicos");
    await requestJson("/protected-resource").catch(() => undefined);

    expect(await screen.findByText("anonymous:none:false:SESSION_EXPIRED:/actividades")).toBeInTheDocument();
  });

  it("solo reconoce rutas internas conocidas", () => {
    expect(isKnownInternalPath("/resumen")).toBe(true);
    expect(isKnownInternalPath("/does-not-exist")).toBe(false);
    expect(isKnownInternalPath("https://attacker.test")).toBe(false);
  });
});
