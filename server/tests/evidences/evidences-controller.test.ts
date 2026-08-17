import { PassThrough, Writable } from "node:stream";
import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { createEvidencesController } from "../../src/evidences/evidences.controller.js";
import type { EvidenceService } from "../../src/evidences/evidences.service.js";

const evidence = {
  id: "70000000-0000-4000-8000-000000000001", originalName: "report ñ.pdf",
  mimeType: "application/pdf" as const, fileExtension: "pdf" as const, sizeBytes: 5,
  description: null, accessLevel: "TECHNICIAN" as const,
  uploadedBy: { id: "70000000-0000-4000-8000-000000000002", displayName: "Admin" },
  resourceType: "ORDER" as const, resourceId: "70000000-0000-4000-8000-000000000003",
  checksumSha256: "a".repeat(64), version: 1,
  createdAt: "2026-08-17T00:00:00.000Z", updatedAt: "2026-08-17T00:00:00.000Z",
};

function requestForDownload(): Request {
  return {
    params: { evidenceId: evidence.id }, requestId: "request-1",
    auth: { userId: "70000000-0000-4000-8000-000000000002", technicianId: null, permissions: ["EVIDENCES_VIEW", "EVIDENCES_MANAGE"], mustChangePassword: false, id: "70000000-0000-4000-8000-000000000002", email: "admin@example.test", displayName: "Admin", roles: ["ADMIN"], sessionId: "session" },
    log: { error: vi.fn() },
  } as unknown as Request;
}

function responseForDownload(headersSent = false) {
  const chunks: Buffer[] = [];
  const response = new Writable({ write(chunk, _encoding, callback) { chunks.push(Buffer.from(chunk)); callback(); } }) as unknown as Response & { chunks: Buffer[]; destroy: ReturnType<typeof vi.fn> };
  Object.assign(response, {
    chunks,
    headersSent,
    status: vi.fn(() => response),
    set: vi.fn(() => response),
    destroy: vi.fn(),
  });
  return response;
}

async function flush(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

describe("evidences download controller", () => {
  it("keeps the authorized byte response intact when administrative download auditing fails", async () => {
    const stream = new PassThrough();
    const recordDownload = vi.fn().mockRejectedValue(new Error("audit unavailable"));
    const service = { getDownload: vi.fn().mockResolvedValue({ evidence, stream }), recordDownload } as unknown as EvidenceService;
    const controller = createEvidencesController(service, { parse: vi.fn() });
    const response = responseForDownload();
    const next = vi.fn();

    await controller.download(requestForDownload(), response, next);
    stream.end(Buffer.from("bytes"));
    await flush();

    expect(Buffer.concat(response.chunks)).toEqual(Buffer.from("bytes"));
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.set).toHaveBeenCalledWith(expect.objectContaining({ "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" }));
    expect(response.destroy.mock.calls).toEqual([[]]);
    expect(next).not.toHaveBeenCalled();
  });

  it("destroys a response when the stream errors after private headers are sent", async () => {
    const stream = new PassThrough();
    const service = { getDownload: vi.fn().mockResolvedValue({ evidence, stream }), recordDownload: vi.fn().mockResolvedValue(undefined) } as unknown as EvidenceService;
    const controller = createEvidencesController(service, { parse: vi.fn() });
    const response = responseForDownload(true);
    const next = vi.fn();

    await controller.download(requestForDownload(), response, next);
    const failure = new Error("stream read failed");
    stream.destroy(failure);
    await flush();

    expect(response.destroy).toHaveBeenCalledWith(failure);
    expect(next).not.toHaveBeenCalled();
  });
});
