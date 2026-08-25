import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AuthContext, type AuthStatus } from "./AuthContext";
import { AuthGate } from "./AuthGate";
import { authContext, provisionalUser } from "../test/auth-test-utils";

describe("AuthGate", () => {
  it.each([
    ["checking", "Comprobando sesión"],
    ["unavailable", "No pudimos conectar"],
    ["anonymous", "Iniciar sesión"],
  ])("bloquea contenido privado mientras el estado es %s", (status, label) => {
    render(
      <AuthContext.Provider value={authContext({ status: status as AuthStatus, user: null })}>
        <AuthGate><div>Privado</div></AuthGate>
      </AuthContext.Provider>,
    );

    if (status === "checking") {
      expect(screen.getByRole("status")).toHaveTextContent(label);
    } else {
      expect(screen.getByRole("heading", { name: label })).toBeInTheDocument();
    }
    expect(screen.queryByText("Privado")).not.toBeInTheDocument();
  });

  it("obliga el cambio antes de mostrar contenido privado", () => {
    render(
      <AuthContext.Provider value={authContext({ status: "authenticated", user: provisionalUser })}>
        <AuthGate><div>Privado</div></AuthGate>
      </AuthContext.Provider>,
    );

    expect(screen.getByRole("heading", { name: "Protege tu cuenta" })).toBeInTheDocument();
    expect(screen.queryByText("Privado")).not.toBeInTheDocument();
  });

  it("no entrega contenido privado si un estado autenticado carece de usuario", () => {
    render(
      <AuthContext.Provider value={authContext({ status: "authenticated", user: null })}>
        <AuthGate><div>Privado</div></AuthGate>
      </AuthContext.Provider>,
    );

    expect(screen.getByRole("heading", { name: "Iniciar sesión" })).toBeInTheDocument();
    expect(screen.queryByText("Privado")).not.toBeInTheDocument();
  });

  it("entrega el contenido solo a una sesión definitiva autenticada", () => {
    render(
      <AuthContext.Provider value={authContext()}>
        <AuthGate><div>Privado</div></AuthGate>
      </AuthContext.Provider>,
    );

    expect(screen.getByText("Privado")).toBeInTheDocument();
  });
});
