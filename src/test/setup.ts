import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

Object.defineProperty(globalThis, "fetch", {
  configurable: true,
  writable: true,
  value: vi.fn(async () => new Response(JSON.stringify({
    data: { status: "PREVIEW", items: [], warnings: [], capabilities: {} },
  }), { status: 200, headers: { "Content-Type": "application/json" } })),
});

Object.defineProperty(window, "scrollTo", {
  value: () => undefined,
  writable: true,
});
