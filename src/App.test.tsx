import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import App from "./App";
import { adminUser } from "./test/auth-test-utils";

afterEach(() => {
  cleanup();
  vi.mocked(fetch).mockReset();
  window.history.replaceState({}, "", "/resumen");
});

it("restaura la sesión antes de mostrar el shell", async () => {
  vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ data: { user: adminUser } }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  }));

  render(<App />);

  expect(screen.getByText("Comprobando sesión")).toBeInTheDocument();
  expect(await screen.findByText(adminUser.displayName)).toBeInTheDocument();
});
