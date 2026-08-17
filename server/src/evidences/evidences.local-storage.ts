import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream, type Stats } from "node:fs";
import { lstat, mkdir, open as openFile, readdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { PassThrough, Readable, Transform, type TransformCallback } from "node:stream";
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
    key.split("/").some((part) => part === "." || part === "..")
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

function unavailable(error: unknown): Error {
  if (error instanceof EvidenceSizeLimitError || error instanceof EvidenceStorageUnavailableError) {
    return error;
  }
  return new EvidenceStorageUnavailableError();
}

function isMissing(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
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
    return this.#withStorageError(async () => {
      await this.#ensureRoot();
      await this.#ensureDirectory(this.#temporaryRoot);
      await this.#ensureDirectory(this.#finalRoot);

      const expiresAt = now.getTime() - tempMaxAgeMinutes * 60_000;
      const entries = await readdir(this.#temporaryRoot, { withFileTypes: true });
      let removedTemporaries = 0;

      for (const entry of entries) {
        const filePath = resolveKey(this.#root, `tmp/${entry.name}`);
        const metadata = await this.#assertExistingPath(filePath);
        if (!metadata.isFile() || !entry.name.endsWith(".upload")) {
          continue;
        }

        if (metadata.mtimeMs < expiresAt) {
          await rm(filePath, { force: true });
          removedTemporaries += 1;
        }
      }

      return { removedTemporaries };
    });
  }

  async writeTemporary(source: Readable, maxBytes: number): Promise<TemporaryEvidence> {
    assertMaximum(maxBytes);
    const tempKey = `tmp/${randomUUID()}.upload`;
    const temporaryPath = resolveKey(this.#root, tempKey);
    const counter = new CountingHashTransform(maxBytes);
    let sourceError: unknown;
    const rememberSourceError = (error: unknown): void => {
      sourceError = error;
    };
    source.once("error", rememberSourceError);

    try {
      await this.#assertDirectory(this.#temporaryRoot);
      const existing = await this.#assertSafePath(temporaryPath, true);
      if (existing !== undefined) {
        throw new EvidenceStorageUnavailableError();
      }
      await pipeline(source, counter, createWriteStream(temporaryPath, { flags: "wx" }));
      return {
        tempKey,
        sizeBytes: counter.sizeBytes,
        checksumSha256: counter.checksum(),
      };
    } catch (error) {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
      if (error === sourceError || error instanceof EvidenceSizeLimitError) {
        throw error;
      }
      throw unavailable(error);
    } finally {
      source.off("error", rememberSourceError);
    }
  }

  async readHead(key: string, maxBytes: number): Promise<Buffer> {
    assertMaximum(maxBytes);
    const filePath = resolveKey(this.#root, key);
    return this.#withStorageError(async () => {
      const metadata = await this.#assertExistingPath(filePath);
      const handle = await openFile(filePath, "r");
      try {
        const head = Buffer.alloc(Math.min(metadata.size, maxBytes));
        const { bytesRead } = await handle.read(head, 0, head.length, 0);
        return head.subarray(0, bytesRead);
      } finally {
        await handle.close();
      }
    });
  }

  async promote(tempKey: string, finalKey: string): Promise<void> {
    assertNamespace(tempKey, "tmp");
    assertNamespace(finalKey, "files");
    const temporaryPath = resolveKey(this.#root, tempKey);
    const finalPath = resolveKey(this.#root, finalKey);
    await this.#withStorageError(async () => {
      await this.#assertExistingPath(temporaryPath);
      await this.#ensureFinalParent(finalPath);
      await this.#assertSafePath(finalPath, true);
      await rename(temporaryPath, finalPath);
    });
  }

  async open(finalKey: string): Promise<Readable> {
    assertNamespace(finalKey, "files");
    const filePath = resolveKey(this.#root, finalKey);
    return this.#withStorageError(async () => {
      await this.#assertExistingPath(filePath);
      const file = createReadStream(filePath);
      const output = new PassThrough();
      file.once("error", () => output.destroy(new EvidenceStorageUnavailableError()));
      file.pipe(output);
      return output;
    });
  }

  async remove(key: string): Promise<void> {
    const filePath = resolveKey(this.#root, key);
    await this.#withStorageError(async () => {
      await this.#assertSafePath(filePath, true);
      await rm(filePath, { force: true });
    });
  }

  async exists(key: string): Promise<boolean> {
    const filePath = resolveKey(this.#root, key);
    return this.#withStorageError(async () => (await this.#assertSafePath(filePath, true)) !== undefined);
  }

  async *listFinalKeys(): AsyncIterable<string> {
    try {
      await this.#assertDirectory(this.#finalRoot);
      yield* this.#listFiles(this.#finalRoot);
    } catch (error) {
      throw unavailable(error);
    }
  }

  async *#listFiles(directory: string): AsyncIterable<string> {
    await this.#assertDirectory(directory);
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name);
      const metadata = await this.#assertExistingPath(entryPath);
      if (metadata.isDirectory()) {
        yield* this.#listFiles(entryPath);
      } else if (metadata.isFile()) {
        yield path.relative(this.#root, entryPath).split(path.sep).join("/");
      }
    }
  }

  async #withStorageError<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      throw unavailable(error);
    }
  }

  async #ensureRoot(): Promise<void> {
    try {
      await this.#assertDirectory(this.#root);
    } catch (error) {
      if (!isMissing(error)) {
        throw error;
      }
      await mkdir(this.#root, { recursive: true });
      await this.#assertDirectory(this.#root);
    }
  }

  async #ensureDirectory(directory: string): Promise<void> {
    try {
      await this.#assertDirectory(directory);
    } catch (error) {
      if (!isMissing(error)) {
        throw error;
      }
      await mkdir(directory);
      await this.#assertDirectory(directory);
    }
  }

  async #ensureFinalParent(finalPath: string): Promise<void> {
    await this.#assertDirectory(this.#finalRoot);
    const relativeParent = path.relative(this.#finalRoot, path.dirname(finalPath));
    let directory = this.#finalRoot;
    for (const segment of relativeParent === "" ? [] : relativeParent.split(path.sep)) {
      directory = path.join(directory, segment);
      await this.#ensureDirectory(directory);
    }
  }

  async #assertSafePath(filePath: string, allowMissing: boolean): Promise<Stats | undefined> {
    await this.#assertDirectory(this.#root);
    const relativePath = path.relative(this.#root, filePath);
    let current = this.#root;
    const segments = relativePath === "" ? [] : relativePath.split(path.sep);
    for (const [index, segment] of segments.entries()) {
      current = path.join(current, segment);
      let metadata: Stats;
      try {
        metadata = await lstat(current);
      } catch (error) {
        if (allowMissing && isMissing(error)) {
          return undefined;
        }
        throw error;
      }
      if (metadata.isSymbolicLink() || (index < segments.length - 1 && !metadata.isDirectory())) {
        throw new EvidenceStorageUnavailableError();
      }
      if (index === segments.length - 1) {
        return metadata;
      }
    }
    return lstat(this.#root);
  }

  async #assertExistingPath(filePath: string): Promise<Stats> {
    const metadata = await this.#assertSafePath(filePath, false);
    if (metadata === undefined) {
      throw new EvidenceStorageUnavailableError();
    }
    return metadata;
  }

  async #assertDirectory(directory: string): Promise<Stats> {
    const metadata = await lstat(directory);
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
      throw new EvidenceStorageUnavailableError();
    }
    return metadata;
  }
}

function assertMaximum(maxBytes: number): void {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw new EvidenceStorageUnavailableError("Evidence storage byte limit is invalid");
  }
}
