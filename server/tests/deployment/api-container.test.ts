import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("API production container", () => {
  it("runs migrations before starting and keeps environment files outside the image", async () => {
    const [dockerfile, entrypoint, dockerignore, packageFile] = await Promise.all([
      readFile(new URL("../../Dockerfile", import.meta.url), "utf8"),
      readFile(new URL("../../docker-entrypoint.sh", import.meta.url), "utf8"),
      readFile(new URL("../../.dockerignore", import.meta.url), "utf8"),
      readFile(new URL("../../package.json", import.meta.url), "utf8"),
    ]);
    const packageJson = JSON.parse(packageFile) as {
      dependencies: Record<string, string>;
    };
    expect(dockerfile).toContain("node:20");
    expect(dockerfile).toContain("docker-entrypoint.sh");
    expect(dockerfile).toContain("ARG DATABASE_URL=");
    expect(entrypoint).toContain("set -e");
    expect(entrypoint).toContain("DATABASE_URL");
    expect(entrypoint).toContain("./node_modules/.bin/prisma migrate deploy");
    expect(packageJson.dependencies.prisma).toMatch(/^\^7\.9\.1$/);
    expect(dockerignore).toMatch(/^\.env/m);
  });
});
