import { PassThrough } from "node:stream";
import type { Request } from "express";
import { describe, expect, it, vi } from "vitest";
import { createEvidenceMultipartParser } from "../../src/evidences/evidences.multipart.js";
import { EvidenceSizeLimitError, type EvidenceStorage } from "../../src/evidences/evidences.storage.js";

const maxBytes = 10;

interface MultipartPart {
  kind: "field" | "file";
  name: string;
  value: string | Buffer;
  filename?: string;
  mimeType?: string;
}

function multipart(
  parts: MultipartPart[],
  close = true,
  boundary = "----evidence-test-boundary",
): { body: Buffer; contentType: string } {
  const lines: Buffer[] = [];

  for (const part of parts) {
    lines.push(Buffer.from(`--${boundary}\r\n`));
    if (part.kind === "file") {
      lines.push(Buffer.from(`Content-Disposition: form-data; name="${part.name}"; filename="${part.filename ?? "evidence.jpg"}"\r\n`));
      lines.push(Buffer.from(`Content-Type: ${part.mimeType ?? "image/jpeg"}\r\n\r\n`));
      lines.push(Buffer.isBuffer(part.value) ? part.value : Buffer.from(part.value));
      lines.push(Buffer.from("\r\n"));
    } else {
      lines.push(Buffer.from(`Content-Disposition: form-data; name="${part.name}"\r\n\r\n${part.value}\r\n`));
    }
  }
  if (close) lines.push(Buffer.from(`--${boundary}--\r\n`));
  return { body: Buffer.concat(lines), contentType: `multipart/form-data; boundary=${boundary}` };
}

function requestFor(payload: { body: Buffer; contentType: string }): PassThrough & Request {
  const request = new PassThrough() as PassThrough & Request;
  Object.assign(request, { headers: { "content-type": payload.contentType } });
  return request;
}

function storage(overrides: Partial<EvidenceStorage> = {}): EvidenceStorage {
  return {
    initialize: vi.fn(async () => ({ removedTemporaries: 0 })),
    writeTemporary: vi.fn(async (source) => {
      let sizeBytes = 0;
      for await (const chunk of source) sizeBytes += Buffer.byteLength(chunk);
      return { tempKey: "tmp/upload.upload", sizeBytes, checksumSha256: "a".repeat(64) };
    }),
    readHead: vi.fn(),
    promote: vi.fn(),
    open: vi.fn(),
    remove: vi.fn(async () => undefined),
    exists: vi.fn(),
    async *listFinalKeys() {},
    ...overrides,
  };
}

function parserFor(fileStorage: EvidenceStorage, logOperationalError?: (event: "EVIDENCE_STORAGE_CLEANUP_FAILED", requestId: string) => void) {
  return createEvidenceMultipartParser({
    storage: fileStorage,
    maxBytes,
    requestId: "request-9",
    ...(logOperationalError === undefined ? {} : { logOperationalError }),
  });
}

async function parsePayload(fileStorage: EvidenceStorage, payload: { body: Buffer; contentType: string }) {
  const request = requestFor(payload);
  const result = parserFor(fileStorage).parse(request);
  request.end(payload.body);
  return result;
}

describe("evidence multipart parser", () => {
  it("streams exactly one file and returns validated metadata after Busboy closes", async () => {
    const fileStorage = storage();
    const result = await parsePayload(fileStorage, multipart([
      { kind: "field", name: "description", value: " Evidencia final " },
      { kind: "field", name: "accessLevel", value: "INTERNAL" },
      { kind: "file", name: "file", value: Buffer.from("jpeg"), filename: "photo.jpg" },
    ]));

    expect(result).toEqual({
      file: {
        tempKey: "tmp/upload.upload",
        sizeBytes: 4,
        checksumSha256: "a".repeat(64),
        originalName: "photo.jpg",
        declaredMimeType: "image/jpeg",
      },
      description: "Evidencia final",
      accessLevel: "INTERNAL",
    });
    expect(fileStorage.writeTemporary).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["no file", multipart([{ kind: "field", name: "description", value: "sin archivo" }])],
    ["unknown text field", multipart([
      { kind: "file", name: "file", value: "jpeg" },
      { kind: "field", name: "unexpected", value: "value" },
    ])],
    ["duplicate text field", multipart([
      { kind: "field", name: "description", value: "uno" },
      { kind: "field", name: "description", value: "dos" },
      { kind: "file", name: "file", value: "jpeg" },
    ])],
    ["CLIENT access", multipart([
      { kind: "field", name: "accessLevel", value: "CLIENT" },
      { kind: "file", name: "file", value: "jpeg" },
    ])],
    ["truncated request", multipart([{ kind: "file", name: "file", value: "jpeg" }], false)],
  ] as const)("rejects %s", async (_name, payload) => {
    const fileStorage = storage();

    await expect(parsePayload(fileStorage, payload)).rejects.toMatchObject({ statusCode: 400, code: "INVALID_EVIDENCE_MULTIPART" });
  });

  it.each([
    ["a second file", multipart([
      { kind: "file", name: "file", value: "jpeg" },
      { kind: "file", name: "file", value: "png" },
    ])],
    ["a file using the wrong field name", multipart([{ kind: "file", name: "attachment", value: "jpeg" }])],
  ] as const)("rejects %s", async (_name, payload) => {
    const fileStorage = storage();

    await expect(parsePayload(fileStorage, payload)).rejects.toMatchObject({ statusCode: 400, code: "INVALID_EVIDENCE_MULTIPART" });
  });

  it("maps Busboy's file-size limit to 413 and cleans the temporary upload", async () => {
    const fileStorage = storage();

    await expect(parsePayload(fileStorage, multipart([{ kind: "file", name: "file", value: Buffer.alloc(maxBytes + 1) }]))).rejects
      .toMatchObject({ statusCode: 413, code: "EVIDENCE_TOO_LARGE" });
  });

  it("rejects Busboy's fields limit", async () => {
    const fileStorage = storage();

    await expect(parsePayload(fileStorage, multipart([
      { kind: "field", name: "description", value: "uno" },
      { kind: "field", name: "accessLevel", value: "TECHNICIAN" },
      { kind: "field", name: "description", value: "tres" },
    ]))).rejects.toMatchObject({ statusCode: 400, code: "INVALID_EVIDENCE_MULTIPART" });
  });

  it("rejects a fourth part after Busboy signals the configured parts ceiling", async () => {
    const fileStorage = storage();

    await expect(parsePayload(fileStorage, multipart([
      { kind: "file", name: "file", value: "jpeg" },
      { kind: "field", name: "description", value: "uno" },
      { kind: "field", name: "accessLevel", value: "TECHNICIAN" },
      { kind: "field", name: "description", value: "cuatro" },
    ]))).rejects.toMatchObject({ statusCode: 400, code: "INVALID_EVIDENCE_MULTIPART" });
  });

  it("rejects and cleans once when a quoted escaped boundary carries a fourth part", async () => {
    const boundary = "----evidence-\\escaped";
    const payload = multipart([
      { kind: "file", name: "file", value: "jpeg" },
      { kind: "field", name: "description", value: "uno" },
      { kind: "field", name: "accessLevel", value: "TECHNICIAN" },
      { kind: "field", name: "unexpected", value: "cuatro" },
    ], true, boundary);
    payload.contentType = `multipart/form-data; boundary="${boundary.replace(/\\/g, "\\\\")}"`;
    const fileStorage = storage({
      writeTemporary: vi.fn(async (source) => {
        source.resume();
        return {
          tempKey: "tmp/upload.upload",
          sizeBytes: 4,
          checksumSha256: "a".repeat(64),
        };
      }),
    });

    const request = requestFor(payload);
    const operation = parserFor(fileStorage).parse(request);
    for (let offset = 0; offset < payload.body.length; offset += 7) {
      request.write(payload.body.subarray(offset, offset + 7));
    }
    request.end();

    await expect(operation).rejects
      .toMatchObject({ statusCode: 400, code: "INVALID_EVIDENCE_MULTIPART" });
    expect(fileStorage.remove).toHaveBeenCalledTimes(1);
    expect(fileStorage.remove).toHaveBeenCalledWith("tmp/upload.upload");
  });

  it("maps a storage size error to 413", async () => {
    const fileStorage = storage({
      writeTemporary: vi.fn(async () => {
        throw new EvidenceSizeLimitError();
      }),
    });

    await expect(parsePayload(fileStorage, multipart([{ kind: "file", name: "file", value: "jpeg" }]))).rejects
      .toMatchObject({ statusCode: 413, code: "EVIDENCE_TOO_LARGE" });
    expect(fileStorage.remove).not.toHaveBeenCalled();
  });

  it("rejects a client abort, destroys the in-flight parser, and cleans exactly once after storage resolves", async () => {
    let resolveWrite: ((value: { tempKey: string; sizeBytes: number; checksumSha256: string }) => void) | undefined;
    const writeTemporary = vi.fn(() => new Promise<{ tempKey: string; sizeBytes: number; checksumSha256: string }>((resolve) => {
      resolveWrite = resolve;
    }));
    const fileStorage = storage({ writeTemporary });
    const request = requestFor(multipart([{ kind: "file", name: "file", value: "jpeg" }]));
    const operation = parserFor(fileStorage).parse(request);

    request.write(multipart([{ kind: "file", name: "file", value: "jpeg" }], false).body);
    await vi.waitFor(() => expect(writeTemporary).toHaveBeenCalledTimes(1));
    request.emit("aborted");
    resolveWrite?.({ tempKey: "tmp/upload.upload", sizeBytes: 4, checksumSha256: "a".repeat(64) });

    await expect(operation).rejects.toMatchObject({ statusCode: 400, code: "MULTIPART_REQUEST_ABORTED" });
    expect(fileStorage.remove).toHaveBeenCalledTimes(1);
    expect(fileStorage.remove).toHaveBeenCalledWith("tmp/upload.upload");
  });

  it("removes exactly once after a temporary upload exists and a later field is invalid", async () => {
    const fileStorage = storage();
    const payload = multipart([
      { kind: "file", name: "file", value: "jpeg" },
      { kind: "field", name: "unexpected", value: "x" },
    ]);
    const marker = Buffer.from('Content-Disposition: form-data; name="unexpected"');
    const secondHeader = payload.body.indexOf(marker);
    const request = requestFor(payload);
    const operation = parserFor(fileStorage).parse(request);

    request.write(payload.body.subarray(0, secondHeader));
    await vi.waitFor(() => expect(fileStorage.writeTemporary).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(fileStorage.writeTemporary).toHaveResolved());
    request.end(payload.body.subarray(secondHeader));

    await expect(operation).rejects.toMatchObject({ statusCode: 400, code: "INVALID_EVIDENCE_MULTIPART" });
    expect(fileStorage.remove).toHaveBeenCalledTimes(1);
    expect(fileStorage.remove).toHaveBeenCalledWith("tmp/upload.upload");
  });

  it("keeps the original parser failure when cleanup and cleanup logging fail", async () => {
    const logOperationalError = vi.fn(() => {
      throw new Error("must not change the multipart error");
    });
    const fileStorage = storage({ remove: vi.fn(async () => { throw new Error("tmp/upload.upload"); }) });
    const payload = multipart([
      { kind: "file", name: "file", value: "jpeg" },
      { kind: "field", name: "unexpected", value: "x" },
    ]);
    const marker = Buffer.from('Content-Disposition: form-data; name="unexpected"');
    const secondHeader = payload.body.indexOf(marker);
    const request = requestFor(payload);
    const operation = parserFor(fileStorage, logOperationalError).parse(request);

    request.write(payload.body.subarray(0, secondHeader));
    await vi.waitFor(() => expect(fileStorage.writeTemporary).toHaveResolved());
    request.end(payload.body.subarray(secondHeader));

    await expect(operation).rejects
      .toMatchObject({ statusCode: 400, code: "INVALID_EVIDENCE_MULTIPART" });
    expect(logOperationalError).toHaveBeenCalledWith("EVIDENCE_STORAGE_CLEANUP_FAILED", "request-9");
    expect(JSON.stringify(logOperationalError.mock.calls)).not.toContain("tmp/upload.upload");
  });
});
