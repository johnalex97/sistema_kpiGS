import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import {
  createEvidencesService,
} from "../../src/evidences/evidences.service.js";
import { EvidenceSizeLimitError, EvidenceStorageUnavailableError } from "../../src/evidences/evidences.storage.js";
import type { EvidenceMutationRepository, EvidenceReadRepository, EvidenceRecord } from "../../src/evidences/evidences.repository.types.js";
import type { EvidenceStorage } from "../../src/evidences/evidences.storage.js";
import type {
  EvidenceActorContext,
  EvidenceOperationalLogger,
  IncomingEvidenceUpload,
} from "../../src/evidences/evidences.types.js";

const fixedNow = new Date("2026-08-17T12:00:00.000Z");
const order = { type: "ORDER" as const, id: "10000000-0000-4000-8000-000000000001" };
const evidenceId = "20000000-0000-4000-8000-000000000001";
const tempKey = "tmp/30000000-0000-4000-8000-000000000001.upload";
const finalKey = "files/2026/08/40000000-0000-4000-8000-000000000001.jpg";

const manager = (): EvidenceActorContext => ({
  userId: "50000000-0000-4000-8000-000000000001",
  technicianId: "60000000-0000-4000-8000-000000000001",
  permissions: ["EVIDENCES_VIEW", "EVIDENCES_UPLOAD", "EVIDENCES_MANAGE"],
  requestId: "70000000-0000-4000-8000-000000000001",
});

const technician = (): EvidenceActorContext => ({
  userId: "50000000-0000-4000-8000-000000000002",
  technicianId: "60000000-0000-4000-8000-000000000002",
  permissions: ["EVIDENCES_VIEW", "EVIDENCES_UPLOAD"],
  requestId: "70000000-0000-4000-8000-000000000002",
});

const upload = (): IncomingEvidenceUpload => ({
  file: {
    tempKey,
    sizeBytes: 4,
    checksumSha256: "a".repeat(64),
    originalName: "photo.jpeg",
    declaredMimeType: "image/jpeg",
  },
  description: "Trabajo terminado",
});

const record = (): EvidenceRecord => ({
  id: evidenceId,
  originalName: "photo.jpeg",
  storedName: "40000000-0000-4000-8000-000000000001.jpg",
  mimeType: "image/jpeg",
  fileExtension: "jpg",
  sizeBytes: 4n,
  storageKey: finalKey,
  checksumSha256: "a".repeat(64),
  description: "Trabajo terminado",
  accessLevel: "TECHNICIAN",
  createdAt: fixedNow,
  updatedAt: fixedNow,
  deletedAt: null,
  deletedById: null,
  deletionReason: null,
  version: 1,
  uploadedBy: { id: "50000000-0000-4000-8000-000000000001", displayName: "Ana" },
  orden: { id: order.id },
  actividad: null,
  reincidencia: null,
}) as EvidenceRecord;

function readRepository(overrides: Partial<EvidenceReadRepository> = {}): EvidenceReadRepository {
  return {
    findUploadTarget: vi.fn(async () => ({ status: "PENDING" as const })),
    listEvidence: vi.fn(async () => ({ items: [record()], totalItems: 1 })),
    findDownloadableEvidence: vi.fn(async () => record()),
    listMetadataStorageKeys: vi.fn(async () => []),
    ...overrides,
  };
}

function mutationRepository(overrides: Partial<EvidenceMutationRepository> = {}): EvidenceMutationRepository {
  return {
    createEvidence: vi.fn(async (_input, _actor, _now, promote) => {
      await promote();
      return { kind: "CREATED" as const, evidence: record() };
    }),
    updateEvidence: vi.fn(async () => ({ kind: "UPDATED" as const, evidence: record() })),
    archiveEvidence: vi.fn(async () => ({ kind: "UPDATED" as const, evidence: record() })),
    recordAdministrativeDownload: vi.fn(async () => undefined),
    ...overrides,
  };
}

function storage(overrides: Partial<EvidenceStorage> = {}): EvidenceStorage {
  return {
    initialize: vi.fn(async () => ({ removedTemporaries: 0 })),
    writeTemporary: vi.fn(),
    readHead: vi.fn(async () => Buffer.from([0xff, 0xd8, 0xff, 0xdb])),
    promote: vi.fn(async () => undefined),
    open: vi.fn(async () => Readable.from(Buffer.from("file"))),
    remove: vi.fn(async () => undefined),
    exists: vi.fn(async () => true),
    async *listFinalKeys() {},
    ...overrides,
  };
}

function serviceWith(options: {
  read?: EvidenceReadRepository;
  mutation?: EvidenceMutationRepository;
  fileStorage?: EvidenceStorage;
  logOperationalError?: EvidenceOperationalLogger;
} = {}) {
  return createEvidencesService({
    readRepository: options.read ?? readRepository(),
    mutationRepository: options.mutation ?? mutationRepository(),
    storage: options.fileStorage ?? storage(),
    now: () => fixedNow,
    createId: () => "40000000-0000-4000-8000-000000000001",
    ...(options.logOperationalError !== undefined && { logOperationalError: options.logOperationalError }),
  });
}

async function expectForbidden(operation: Promise<unknown>) {
  await expect(operation).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
}

describe("evidence service permissions", () => {
  it.each([
    ["view", (service: ReturnType<typeof serviceWith>, actor: EvidenceActorContext) => service.listEvidence(order, { page: 1, pageSize: 20 }, actor)],
    ["upload", (service: ReturnType<typeof serviceWith>, actor: EvidenceActorContext) => service.prepareUpload(order, actor)],
    ["manage", (service: ReturnType<typeof serviceWith>, actor: EvidenceActorContext) => service.updateEvidence(evidenceId, { version: 1, description: "Nueva" }, actor)],
  ] as const)("requires explicit EVIDENCES_%s permission", async (_role, invoke) => {
    await expectForbidden(invoke(serviceWith(), {
      ...technician(),
      permissions: [],
    }));
  });

  it("rejects an unlinked or inactive technician before consulting repositories", async () => {
    const read = readRepository();
    const actor = { ...technician(), technicianId: null };

    await expectForbidden(serviceWith({ read }).prepareUpload(order, actor));
    expect(read.findUploadTarget).not.toHaveBeenCalled();
  });

  it("does not let a technician profile restrict a management actor", async () => {
    const mutation = mutationRepository();
    await serviceWith({ mutation }).createEvidence(order, { ...upload(), accessLevel: "INTERNAL" }, manager());

    expect(mutation.createEvidence).toHaveBeenCalledWith(
      expect.objectContaining({ accessLevel: "INTERNAL" }),
      expect.anything(), expect.any(Date), expect.any(Function),
    );
  });

  it("forces a technician upload to TECHNICIAN", async () => {
    const mutation = mutationRepository();
    await serviceWith({ mutation }).createEvidence(order, upload(), technician());

    expect(mutation.createEvidence).toHaveBeenCalledWith(
      expect.objectContaining({ accessLevel: "TECHNICIAN" }),
      expect.anything(), expect.any(Date), expect.any(Function),
    );
  });

  it("allows management only the TECHNICIAN and INTERNAL access levels", async () => {
    const mutation = mutationRepository();
    const service = serviceWith({ mutation });

    await service.createEvidence(order, { ...upload(), accessLevel: "INTERNAL" }, manager());
    expect(mutation.createEvidence).toHaveBeenLastCalledWith(
      expect.objectContaining({ accessLevel: "INTERNAL" }), expect.anything(), expect.any(Date), expect.any(Function),
    );
    await expect(service.createEvidence(order, { ...upload(), accessLevel: "CLIENT" as never }, manager()))
      .rejects.toMatchObject({ statusCode: 422, code: "INVALID_EVIDENCE_ACCESS_LEVEL" });
  });

  it("makes absent and foreign resources indistinguishable", async () => {
    const absent = serviceWith({ read: readRepository({ listEvidence: async () => null }) });
    const foreign = serviceWith({ read: readRepository({ listEvidence: async () => null }) });

    await expect(absent.listEvidence(order, { page: 1, pageSize: 20 }, manager())).rejects.toMatchObject({ statusCode: 404, code: "RESOURCE_NOT_FOUND" });
    await expect(foreign.listEvidence({ ...order, id: "10000000-0000-4000-8000-000000000099" }, { page: 1, pageSize: 20 }, manager())).rejects.toMatchObject({ statusCode: 404, code: "RESOURCE_NOT_FOUND" });
  });

  it("does not permit a technician to update, archive, or record a download", async () => {
    const service = serviceWith();
    await expectForbidden(service.updateEvidence(evidenceId, { version: 1, description: "Nueva" }, technician()));
    await expectForbidden(service.archiveEvidence(evidenceId, { version: 1, reason: "Archivo administrativo" }, technician()));
    await expectForbidden(service.recordDownload(evidenceId, technician()));
  });
});

describe("evidence service lifecycle", () => {
  it("checks upload authorization before any file body is processed", async () => {
    const fileStorage = storage();
    await expectForbidden(serviceWith({ fileStorage }).createEvidence(order, upload(), { ...technician(), permissions: [] }));
    expect(fileStorage.readHead).not.toHaveBeenCalled();
  });

  it("promotes only the canonical month key after content validation", async () => {
    const fileStorage = storage();
    const mutation = mutationRepository();
    await serviceWith({ fileStorage, mutation }).createEvidence(order, upload(), manager());

    expect(fileStorage.promote).toHaveBeenCalledWith(tempKey, finalKey);
    expect(mutation.createEvidence).toHaveBeenCalledWith(
      expect.objectContaining({ originalName: "photo.jpg", storageKey: finalKey, storedName: "40000000-0000-4000-8000-000000000001.jpg", mimeType: "image/jpeg", fileExtension: "jpg" }),
      expect.anything(), fixedNow, expect.any(Function),
    );
  });

  it("persists and returns the canonical normalized original filename", async () => {
    const mutation = mutationRepository({
      createEvidence: vi.fn(async (input, _actor, _now, promote) => {
        await promote();
        return { kind: "CREATED" as const, evidence: { ...record(), originalName: input.originalName } };
      }),
    });

    const created = await serviceWith({ mutation }).createEvidence(order, upload(), manager());

    expect(created.originalName).toBe("photo.jpg");
    expect(mutation.createEvidence).toHaveBeenCalledWith(
      expect.objectContaining({ originalName: "photo.jpg" }),
      expect.anything(), fixedNow, expect.any(Function),
    );
  });

  it("rejects a filename with no stem before promotion or persistence", async () => {
    const fileStorage = storage({ readHead: vi.fn(async () => Buffer.from("%PDF-1.7\n")) });
    const mutation = mutationRepository();
    const invalidUpload: IncomingEvidenceUpload = {
      ...upload(),
      file: {
        ...upload().file,
        originalName: ".pdf",
        declaredMimeType: "application/pdf",
        sizeBytes: 9,
      },
    };

    await expect(serviceWith({ fileStorage, mutation }).createEvidence(order, invalidUpload, manager()))
      .rejects.toMatchObject({ statusCode: 422, code: "INVALID_EVIDENCE_FILE" });
    expect(fileStorage.promote).not.toHaveBeenCalled();
    expect(mutation.createEvidence).not.toHaveBeenCalled();
    expect(fileStorage.remove).toHaveBeenCalledTimes(1);
    expect(fileStorage.remove).toHaveBeenCalledWith(tempKey);
  });

  it("normalizes an overlong UTF-8 filename before the database boundary", async () => {
    const mutation = mutationRepository({
      createEvidence: vi.fn(async (input, _actor, _now, promote) => {
        if (Buffer.byteLength(input.originalName, "utf8") > 255) {
          throw new Error("database original_name length violation");
        }
        await promote();
        return { kind: "CREATED" as const, evidence: { ...record(), originalName: input.originalName } };
      }),
    });
    const longUpload: IncomingEvidenceUpload = {
      ...upload(),
      file: { ...upload().file, originalName: `${"á".repeat(200)}.jpeg` },
    };

    const created = await serviceWith({ mutation }).createEvidence(order, longUpload, manager());

    expect(Buffer.byteLength(created.originalName, "utf8")).toBeLessThanOrEqual(255);
    expect(created.originalName.endsWith(".jpg")).toBe(true);
  });

  it("rejects invalid content before promotion and always cleans its temporary file", async () => {
    const fileStorage = storage({ readHead: vi.fn(async () => Buffer.from("not an image")) });
    const mutation = mutationRepository();
    const operation = serviceWith({ fileStorage, mutation }).createEvidence(order, upload(), manager());

    await expect(operation).rejects.toMatchObject({ statusCode: 422, code: "INVALID_EVIDENCE_FILE" });
    expect(mutation.createEvidence).not.toHaveBeenCalled();
    expect(fileStorage.remove).toHaveBeenCalledWith(tempKey);
  });

  it("maps a size limit failure to 413 and removes the temporary file", async () => {
    const fileStorage = storage({ readHead: vi.fn(async () => { throw new EvidenceSizeLimitError(); }) });
    const operation = serviceWith({ fileStorage }).createEvidence(order, upload(), manager());

    await expect(operation).rejects.toMatchObject({ statusCode: 413, code: "EVIDENCE_TOO_LARGE" });
    expect(fileStorage.remove).toHaveBeenCalledWith(tempKey);
  });

  it("compensates a promoted final file when metadata or audit persistence fails", async () => {
    const fileStorage = storage();
    const mutation = mutationRepository({
      createEvidence: async (_input, _actor, _now, promote) => {
        await promote();
        throw new Error("database audit failed");
      },
    });
    const operation = serviceWith({ fileStorage, mutation }).createEvidence(order, upload(), manager());

    await expect(operation).rejects.toMatchObject({ statusCode: 503, code: "EVIDENCE_STORAGE_UNAVAILABLE" });
    expect(fileStorage.remove).toHaveBeenCalledWith(finalKey);
    expect(fileStorage.remove).toHaveBeenCalledWith(tempKey);
  });

  it("maps promotion failures to 503 without attempting to delete a final file", async () => {
    const fileStorage = storage({ promote: vi.fn(async () => { throw new EvidenceStorageUnavailableError(); }) });
    const operation = serviceWith({ fileStorage }).createEvidence(order, upload(), manager());

    await expect(operation).rejects.toMatchObject({ statusCode: 503, code: "EVIDENCE_STORAGE_UNAVAILABLE" });
    expect(fileStorage.remove).toHaveBeenCalledWith(tempKey);
    expect(fileStorage.remove).not.toHaveBeenCalledWith(finalKey);
  });

  it("logs a failed cleanup safely without including storage keys", async () => {
    const logOperationalError = vi.fn();
    const fileStorage = storage({
      readHead: vi.fn(async () => Buffer.from("not an image")),
      remove: vi.fn(async () => { throw new Error("cannot remove C:/private/tmp/file"); }),
    });
    await expect(serviceWith({ fileStorage, logOperationalError }).createEvidence(order, upload(), manager()))
      .rejects.toMatchObject({ statusCode: 422 });

    expect(logOperationalError).toHaveBeenCalledWith("EVIDENCE_STORAGE_CLEANUP_FAILED", manager().requestId);
    expect(JSON.stringify(logOperationalError.mock.calls)).not.toContain(tempKey);
    expect(JSON.stringify(logOperationalError.mock.calls)).not.toContain(finalKey);
  });

  it("preserves the public storage failure and cleans both keys when the cleanup logger fails", async () => {
    const logOperationalError = vi.fn(() => {
      throw new Error("logger leaked C:/private/evidences/files/secret.jpg");
    });
    const fileStorage = storage({
      remove: vi.fn(async () => {
        throw new Error("remove leaked C:/private/evidences/files/secret.jpg");
      }),
    });
    const mutation = mutationRepository({
      createEvidence: async (_input, _actor, _now, promote) => {
        await promote();
        throw new Error("database audit failed");
      },
    });

    await expect(serviceWith({ fileStorage, mutation, logOperationalError }).createEvidence(order, upload(), manager()))
      .rejects.toMatchObject({ statusCode: 503, code: "EVIDENCE_STORAGE_UNAVAILABLE" });
    expect(fileStorage.remove).toHaveBeenNthCalledWith(1, finalKey);
    expect(fileStorage.remove).toHaveBeenNthCalledWith(2, tempKey);
    expect(logOperationalError).toHaveBeenCalledTimes(3);
    expect(logOperationalError).toHaveBeenCalledWith(
      "EVIDENCE_STORAGE_UNAVAILABLE",
      manager().requestId,
    );
    expect(JSON.stringify(logOperationalError.mock.calls)).not.toContain(finalKey);
    expect(JSON.stringify(logOperationalError.mock.calls)).not.toContain(tempKey);
  });

  it("authorizes metadata before opening and maps a missing physical file to 503", async () => {
    const fileStorage = storage({ open: vi.fn(async () => { throw new EvidenceStorageUnavailableError(); }) });
    const logOperationalError = vi.fn();
    await expect(serviceWith({ fileStorage, logOperationalError }).getDownload(evidenceId, manager()))
      .rejects.toMatchObject({ statusCode: 503, code: "EVIDENCE_STORAGE_UNAVAILABLE" });
    expect(logOperationalError).toHaveBeenCalledWith(
      "EVIDENCE_STORAGE_UNAVAILABLE",
      manager().requestId,
    );
  });

  it("does not open a file when downloadable metadata is absent or foreign", async () => {
    const fileStorage = storage();
    const service = serviceWith({
      fileStorage,
      read: readRepository({ findDownloadableEvidence: async () => null }),
    });

    await expect(service.getDownload(evidenceId, manager())).rejects.toMatchObject({ statusCode: 404, code: "EVIDENCE_NOT_FOUND" });
    expect(fileStorage.open).not.toHaveBeenCalled();
  });

  it.each([
    ["RESOURCE_CANCELLED", 409],
    ["RESOURCE_INACTIVE", 409],
    ["VERSION_CONFLICT", 409],
    ["RESOURCE_NOT_FOUND", 404],
    ["EVIDENCE_NOT_FOUND", 404],
  ] as const)("maps %s to its public status", async (kind, statusCode) => {
    const mutation = mutationRepository({ updateEvidence: async () => ({ kind }) });
    await expect(serviceWith({ mutation }).updateEvidence(evidenceId, { version: 1, description: "Nueva" }, manager()))
      .rejects.toMatchObject({ statusCode, code: kind });
  });
});
