import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  EvidenceSizeLimitError,
  EvidenceStorageUnavailableError,
} from "../../src/evidences/evidences.storage.js";
import { LocalEvidenceStorage } from "../../src/evidences/evidences.local-storage.js";

let fixtureRoot: string;
let storage: LocalEvidenceStorage;

beforeEach(async () => {
  fixtureRoot = await mkdtemp(path.join(tmpdir(), "evidences-local-storage-"));
  storage = new LocalEvidenceStorage(fixtureRoot);
});

afterEach(async () => {
  await rm(fixtureRoot, { recursive: true, force: true });
});

async function collect(source: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of source) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

describe("LocalEvidenceStorage", () => {
  it("creates the private temporary and final directories", async () => {
    await storage.initialize(new Date("2026-08-17T00:00:00.000Z"), 30);

    expect((await stat(path.join(fixtureRoot, "tmp"))).isDirectory()).toBe(true);
    expect((await stat(path.join(fixtureRoot, "files"))).isDirectory()).toBe(true);
  });

  it("writes a same-volume temporary file with its exact byte count and SHA-256", async () => {
    await storage.initialize(new Date(), 30);
    const content = Buffer.from("streamed evidence");

    const temporary = await storage.writeTemporary(Readable.from(content), content.length);

    expect(temporary.tempKey).toMatch(/^tmp\/[0-9a-f-]+\.upload$/u);
    expect(temporary.sizeBytes).toBe(17);
    expect(temporary.checksumSha256).toBe(createHash("sha256").update(content).digest("hex"));
    expect(path.dirname(path.resolve(fixtureRoot, ...temporary.tempKey.split("/")))).toBe(
      path.join(fixtureRoot, "tmp"),
    );
    await expect(readFile(path.join(fixtureRoot, ...temporary.tempKey.split("/")))).resolves.toEqual(content);
  });

  it("accepts a temporary upload exactly at the byte limit", async () => {
    await storage.initialize(new Date(), 30);

    await expect(storage.writeTemporary(Readable.from(Buffer.alloc(10)), 10)).resolves.toMatchObject({
      sizeBytes: 10,
    });
  });

  it("removes a temporary file when an upload exceeds the byte limit", async () => {
    await storage.initialize(new Date(), 30);

    await expect(storage.writeTemporary(Readable.from(Buffer.alloc(11)), 10)).rejects.toBeInstanceOf(
      EvidenceSizeLimitError,
    );

    await expect(readdir(path.join(fixtureRoot, "tmp"))).resolves.toEqual([]);
  });

  it("removes a partially written temporary file when the upload stream fails", async () => {
    await storage.initialize(new Date(), 30);
    const source = Readable.from(
      (async function* () {
        yield Buffer.from("partial");
        throw new Error("source failed");
      })(),
    );

    await expect(storage.writeTemporary(source, 100)).rejects.toThrow("source failed");

    await expect(readdir(path.join(fixtureRoot, "tmp"))).resolves.toEqual([]);
  });

  it("atomically promotes a temporary key and opens byte-identical final content", async () => {
    await storage.initialize(new Date(), 30);
    const content = Buffer.from("evidence content");
    const temporary = await storage.writeTemporary(Readable.from(content), 100);
    const finalKey = "files/2026-08/evidence.pdf";

    await storage.promote(temporary.tempKey, finalKey);

    await expect(storage.exists(temporary.tempKey)).resolves.toBe(false);
    await expect(storage.exists(finalKey)).resolves.toBe(true);
    await expect(collect(await storage.open(finalKey))).resolves.toEqual(content);
  });

  it("reads only the requested head bytes", async () => {
    await storage.initialize(new Date(), 30);
    await mkdir(path.join(fixtureRoot, "files"), { recursive: true });
    await writeFile(path.join(fixtureRoot, "files", "head.pdf"), "evidence");

    await expect(storage.readHead("files/head.pdf", 4)).resolves.toEqual(Buffer.from("evid"));
  });

  it("removes a key idempotently for compensation", async () => {
    await storage.initialize(new Date(), 30);
    const finalKey = "files/2026-08/remove-me.pdf";
    await mkdir(path.join(fixtureRoot, "files", "2026-08"), { recursive: true });
    await writeFile(path.join(fixtureRoot, "files", "2026-08", "remove-me.pdf"), "content");

    await storage.remove(finalKey);
    await storage.remove(finalKey);

    await expect(storage.exists(finalKey)).resolves.toBe(false);
  });

  it("removes only expired temporary uploads during initialization", async () => {
    const now = new Date("2026-08-17T12:00:00.000Z");
    await mkdir(path.join(fixtureRoot, "tmp"), { recursive: true });
    await writeFile(path.join(fixtureRoot, "tmp", "expired.upload"), "old");
    await writeFile(path.join(fixtureRoot, "tmp", "fresh.upload"), "new");
    await utimes(path.join(fixtureRoot, "tmp", "expired.upload"), now, new Date("2026-08-17T11:29:59.999Z"));
    await utimes(path.join(fixtureRoot, "tmp", "fresh.upload"), now, new Date("2026-08-17T11:30:00.000Z"));

    await expect(storage.initialize(now, 30)).resolves.toEqual({ removedTemporaries: 1 });
    await expect(storage.exists("tmp/expired.upload")).resolves.toBe(false);
    await expect(storage.exists("tmp/fresh.upload")).resolves.toBe(true);
  });

  it("enumerates final keys as relative POSIX paths", async () => {
    await storage.initialize(new Date(), 30);
    await mkdir(path.join(fixtureRoot, "files", "2026-08"), { recursive: true });
    await writeFile(path.join(fixtureRoot, "files", "2026-08", "one.pdf"), "one");
    await writeFile(path.join(fixtureRoot, "files", "two.jpg"), "two");

    const keys: string[] = [];
    for await (const key of storage.listFinalKeys()) {
      keys.push(key);
    }

    expect(keys.sort()).toEqual(["files/2026-08/one.pdf", "files/two.jpg"]);
  });

  it.each([
    "/secret.txt",
    "../secret.txt",
    "files/../secret.txt",
    "files\\secret.txt",
    "C:\\secret.txt",
  ])("rejects an escaping storage key: %s", async (key) => {
    await storage.initialize(new Date(), 30);

    await expect(storage.open(key)).rejects.toBeInstanceOf(EvidenceStorageUnavailableError);
  });

  it("rejects promotion outside the temporary and final key namespaces", async () => {
    await storage.initialize(new Date(), 30);
    const temporary = await storage.writeTemporary(Readable.from("content"), 100);

    await expect(storage.promote("files/not-temporary", "files/2026-08/file.pdf")).rejects.toBeInstanceOf(
      EvidenceStorageUnavailableError,
    );
    await expect(storage.promote(temporary.tempKey, `tmp/${randomUUID()}.upload`)).rejects.toBeInstanceOf(
      EvidenceStorageUnavailableError,
    );
  });
});
