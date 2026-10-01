import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { requireProductionApiBaseUrl } from "../config/production-env";

describe("frontend production container", () => {
  it("rejects a production build without the public API URL", () => {
    expect(() => requireProductionApiBaseUrl(undefined)).toThrow(
      "VITE_API_BASE_URL es obligatoria",
    );
  });

  it("keeps the declared API URL for the production build", () => {
    expect(requireProductionApiBaseUrl("https://api.example.com/api/v1")).toBe(
      "https://api.example.com/api/v1",
    );
  });

  it("passes the build argument to the static image and excludes environment files", async () => {
    const [dockerfile, dockerignore] = await Promise.all([
      readFile(resolve(process.cwd(), "Dockerfile"), "utf8"),
      readFile(resolve(process.cwd(), ".dockerignore"), "utf8"),
    ]);

    expect(dockerfile).toContain("ARG VITE_API_BASE_URL");
    expect(dockerfile).toContain("VITE_API_BASE_URL=${VITE_API_BASE_URL}");
    expect(dockerfile).toContain("nginx");
    expect(dockerignore).toMatch(/^\.env/m);
  });
});
