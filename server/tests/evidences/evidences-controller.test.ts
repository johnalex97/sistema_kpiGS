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
  const response = new Writable({ write(chunk, _encoding, callback) { chunks.push(Buffer.from(chunk)); callback(); } }) as unknown as Response & { chunks: Buffer[]; destroy: ReturnType<typeof vi.fn>; removeHeader: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn>; status: ReturnType<typeof vi.fn> };
  Object.assign(response, {
    chunks,
    headersSent,
    status: vi.fn(() => response),
    set: vi.fn(() => response),
    removeHeader: vi.fn(() => response),
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
    const logOperationalError = vi.fn();
    const controller = createEvidencesController(service, { parse: vi.fn() }, logOperationalError);
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
    expect(logOperationalError).toHaveBeenCalledWith(
      "EVIDENCE_DOWNLOAD_AUDIT_FAILED",
      "request-1",
    );
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

  it("clears staged evidence headers and forwards a redacted 503 when the stream errors before headers are sent", async () => {
    const stream = new PassThrough();
    const service = { getDownload: vi.fn().mockResolvedValue({ evidence, stream }), recordDownload: vi.fn().mockResolvedValue(undefined) } as unknown as EvidenceService;
    const response = responseForDownload(false);
    const next = vi.fn();
    const logOperationalError = vi.fn();
    const loggingController = createEvidencesController(service, { parse: vi.fn() }, logOperationalError);

    await loggingController.download(requestForDownload(), response, next);
    stream.destroy(new Error("read failed at C:/private/evidences/files/secret.pdf"));
    await flush();

    expect(response.removeHeader.mock.calls.map(([name]) => name)).toEqual([
      "Content-Type",
      "Content-Length",
      "Content-Disposition",
      "X-Content-Type-Options",
      "Cache-Control",
    ]);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({
      statusCode: 503,
      code: "EVIDENCE_STORAGE_UNAVAILABLE",
    }));
    expect(JSON.stringify(next.mock.calls)).not.toContain("secret.pdf");
    expect(response.destroy).not.toHaveBeenCalledWith(expect.any(Error));
    expect(logOperationalError).toHaveBeenCalledWith(
      "EVIDENCE_STORAGE_UNAVAILABLE",
      "request-1",
    );
  });

  it("normalizes legacy hostile names into an injection-safe RFC 5987 attachment header", async () => {
    const stream = new PassThrough();
    const hostileEvidence = { ...evidence, originalName: "../quo\"te\\legacy\r\n'()*.pdf" };
    const service = { getDownload: vi.fn().mockResolvedValue({ evidence: hostileEvidence, stream }), recordDownload: vi.fn().mockResolvedValue(undefined) } as unknown as EvidenceService;
    const controller = createEvidencesController(service, { parse: vi.fn() });
    const response = responseForDownload();

    await controller.download(requestForDownload(), response, vi.fn());
    stream.end(Buffer.from("bytes"));
    await flush();

    const contentDisposition = response.set.mock.calls[0]?.[0]["Content-Disposition"] as string;
    expect(contentDisposition).toBe("attachment; filename=\"..quo_telegacy'()*.pdf\"; filename*=UTF-8''..quo%22telegacy%27%28%29%2A.pdf");
    expect(contentDisposition).not.toMatch(/[\r\n]/);
    expect(contentDisposition).not.toContain("/");
    expect(contentDisposition).not.toContain("\\");
  });

  it("uses a safe legacy fallback without leaking an already-open stream when metadata has no filename stem", async () => {
    const stream = new PassThrough();
    const legacyEvidence = { ...evidence, originalName: ".pdf" };
    const service = { getDownload: vi.fn().mockResolvedValue({ evidence: legacyEvidence, stream }), recordDownload: vi.fn().mockResolvedValue(undefined) } as unknown as EvidenceService;
    const controller = createEvidencesController(service, { parse: vi.fn() });
    const response = responseForDownload();
    const next = vi.fn();

    await controller.download(requestForDownload(), response, next);
    stream.end(Buffer.from("bytes"));
    await flush();

    expect(Buffer.concat(response.chunks)).toEqual(Buffer.from("bytes"));
    expect(response.set).toHaveBeenCalledWith(expect.objectContaining({
      "Content-Disposition": "attachment; filename=\"evidence.pdf\"; filename*=UTF-8''evidence.pdf",
    }));
    expect(next).not.toHaveBeenCalled();
  });
});
