import { chmod, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prepareEvidenceStorageRoot } from "../../src/evidences/evidences.prepare-root.js";
import { LocalEvidenceStorage } from "../../src/evidences/evidences.local-storage.js";

describe("preparación del volumen de evidencias", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "evidences-prepare-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("prepara una raíz existente sin perder sus archivos y permite iniciar almacenamiento de producción", async () => {
    await writeFile(path.join(root, "existing.txt"), "evidencia existente");
    await prepareEvidenceStorageRoot(root);
    await expect(new LocalEvidenceStorage(root, { requireExistingRoot: true }).initialize(new Date(), 60)).resolves.toEqual({ removedTemporaries: 0 });
    expect(await readFile(path.join(root, "existing.txt"), "utf8")).toBe("evidencia existente");
  });

  it.skipIf(process.platform === "win32")("convierte permisos abiertos de un volumen nuevo en permisos privados", async () => {
    await chmod(root, 0o755);
    await prepareEvidenceStorageRoot(root);
    expect((await stat(root)).mode & 0o777).toBe(0o700);
    await expect(new LocalEvidenceStorage(root, { requireExistingRoot: true }).initialize(new Date(), 60)).resolves.toEqual({ removedTemporaries: 0 });
  });

  it("rechaza una raíz ausente sin crear almacenamiento efímero", async () => {
    const missing = path.join(root, "missing");
    await expect(prepareEvidenceStorageRoot(missing)).rejects.toThrow();
    await expect(stat(missing)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rechaza archivos como raíz", async () => {
    const file = path.join(root, "file");
    await writeFile(file, "contenido");
    await expect(prepareEvidenceStorageRoot(file)).rejects.toThrow();
    expect(await readFile(file, "utf8")).toBe("contenido");
  });

  it("rechaza enlaces simbólicos como raíz", async () => {
    const link = path.join(root, "link");
    await symlink(root, link, process.platform === "win32" ? "junction" : "dir");
    await expect(prepareEvidenceStorageRoot(link)).rejects.toThrow();
  });

  it("rechaza rutas relativas y la raíz del sistema", async () => {
    await expect(prepareEvidenceStorageRoot("storage/evidences")).rejects.toThrow();
    await expect(prepareEvidenceStorageRoot(path.parse(root).root)).rejects.toThrow();
  });
});
