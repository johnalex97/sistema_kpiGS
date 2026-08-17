import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, open as openFile, readdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform, type TransformCallback } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  EvidenceSizeLimitError,
  EvidenceStorageUnavailableError,
  type EvidenceStorage,
  type TemporaryEvidence,
} from "./evidences.storage.js";

function resolveKey(root: string, key: string): string {
  if (
    key.length === 0 ||
    path.isAbsolute(key) ||
    key.includes("\\") ||
    key.split("/").some((part) => part === "..")
  ) {
    throw new EvidenceStorageUnavailableError("Evidence storage key is invalid");
  }

  const resolved = path.resolve(root, ...key.split("/"));
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new EvidenceStorageUnavailableError("Evidence storage key escapes the configured root");
  }
  return resolved;
}

function assertNamespace(key: string, namespace: "tmp" | "files"): void {
  if (!key.startsWith(`${namespace}/`) || key.length === namespace.length + 1) {
    throw new EvidenceStorageUnavailableError("Evidence storage key is in the wrong namespace");
  }
}

class CountingHashTransform extends Transform {
  readonly #hash = createHash("sha256");
  #sizeBytes = 0;

  constructor(private readonly maxBytes: number) {
    super();
  }

  get sizeBytes(): number {
    return this.#sizeBytes;
  }

  checksum(): string {
    return this.#hash.digest("hex");
  }

  override _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback): void {
    if (this.#sizeBytes + chunk.length > this.maxBytes) {
      callback(new EvidenceSizeLimitError());
      return;
    }

    this.#sizeBytes += chunk.length;
    this.#hash.update(chunk);
    callback(null, chunk);
  }
}

export class LocalEvidenceStorage implements EvidenceStorage {
  readonly #root: string;
  readonly #temporaryRoot: string;
  readonly #finalRoot: string;

  constructor(root: string) {
    this.#root = path.resolve(root);
    this.#temporaryRoot = path.join(this.#root, "tmp");
    this.#finalRoot = path.join(this.#root, "files");
  }

  async initialize(now: Date, tempMaxAgeMinutes: number): Promise<{ removedTemporaries: number }> {
    await Promise.all([mkdir(this.#temporaryRoot, { recursive: true }), mkdir(this.#finalRoot, { recursive: true })]);

    const expiresAt = now.getTime() - tempMaxAgeMinutes * 60_000;
    const entries = await readdir(this.#temporaryRoot, { withFileTypes: true });
    let removedTemporaries = 0;

    await Promise.all(
      entries.map(async (entry) => {
        if (!entry.isFile() || !entry.name.endsWith(".upload")) {
          return;
        }

        const filePath = resolveKey(this.#root, `tmp/${entry.name}`);
        const metadata = await stat(filePath);
        if (metadata.mtimeMs < expiresAt) {
          await rm(filePath, { force: true });
          removedTemporaries += 1;
        }
      }),
    );

    return { removedTemporaries };
  }

  async writeTemporary(source: Readable, maxBytes: number): Promise<TemporaryEvidence> {
    assertMaximum(maxBytes);
    const tempKey = `tmp/${randomUUID()}.upload`;
    const temporaryPath = resolveKey(this.#root, tempKey);
    const counter = new CountingHashTransform(maxBytes);

    try {
      await pipeline(source, counter, createWriteStream(temporaryPath, { flags: "wx" }));
      return {
        tempKey,
        sizeBytes: counter.sizeBytes,
        checksumSha256: counter.checksum(),
      };
    } catch (error) {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  async readHead(key: string, maxBytes: number): Promise<Buffer> {
    assertMaximum(maxBytes);
    const filePath = resolveKey(this.#root, key);
    const handle = await openFile(filePath, "r");
    try {
      const metadata = await handle.stat();
      const head = Buffer.alloc(Math.min(metadata.size, maxBytes));
      const { bytesRead } = await handle.read(head, 0, head.length, 0);
      return head.subarray(0, bytesRead);
    } finally {
      await handle.close();
    }
  }

  async promote(tempKey: string, finalKey: string): Promise<void> {
    assertNamespace(tempKey, "tmp");
    assertNamespace(finalKey, "files");
    const temporaryPath = resolveKey(this.#root, tempKey);
    const finalPath = resolveKey(this.#root, finalKey);

    await mkdir(path.dirname(finalPath), { recursive: true });
    await rename(temporaryPath, finalPath);
  }

  async open(finalKey: string): Promise<Readable> {
    assertNamespace(finalKey, "files");
    return createReadStream(resolveKey(this.#root, finalKey));
  }

  async remove(key: string): Promise<void> {
    const filePath = resolveKey(this.#root, key);
    await rm(filePath, { force: true });
  }

  async exists(key: string): Promise<boolean> {
    try {
      await stat(resolveKey(this.#root, key));
      return true;
    } catch (error: unknown) {
      if (isMissing(error)) {
        return false;
      }
      throw error;
    }
  }

  async *listFinalKeys(): AsyncIterable<string> {
    yield* this.#listFiles(this.#finalRoot);
  }

  async *#listFiles(directory: string): AsyncIterable<string> {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        yield* this.#listFiles(entryPath);
      } else if (entry.isFile()) {
        yield path.relative(this.#root, entryPath).split(path.sep).join("/");
      }
    }
  }
}

function assertMaximum(maxBytes: number): void {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw new EvidenceStorageUnavailableError("Evidence storage byte limit is invalid");
  }
}

function isMissing(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
