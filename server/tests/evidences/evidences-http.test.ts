import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Writable } from "node:stream";
import pino from "pino";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedDatabase } from "../../prisma/seed.js";
import { createApp } from "../../src/app.js";
import { hashPassword } from "../../src/auth/password.js";
import { parseEnvironment } from "../../src/config/env.js";
import { LocalEvidenceStorage } from "../../src/evidences/evidences.local-storage.js";
import type { EvidenceStorage } from "../../src/evidences/evidences.storage.js";
import { silentLogger } from "../../src/utils/logger.js";
import { createEvidencesReadFixture, removeEvidencesReadFixture, type EvidencesReadFixture } from "../database/evidences-test-data.js";
import { database, disconnectTestDatabase } from "../database/database-test-context.js";

const allowedOrigin = "http://localhost:5173";
const password = "GeekEvidencesHttp-2026!";
const users = {
  admin: { id: randomUUID(), email: `evidence.http.admin.${randomUUID()}@example.test` },
  technician: { id: randomUUID(), email: `evidence.http.technician.${randomUUID()}@example.test` },
  provisional: { id: randomUUID(), email: `evidence.http.provisional.${randomUUID()}@example.test` },
} as const;
let fixture: EvidencesReadFixture;
let storageRoot = "";
let lazyStorageRoot = "";
let storage: LocalEvidenceStorage;
let app: ReturnType<typeof createApp>;
let appWithoutInjectedStorage: ReturnType<typeof createApp>;
type Agent = ReturnType<typeof request.agent>;
const fixtureUserIds = [
  "60000000-0000-4000-8000-000000000001",
  "60000000-0000-4000-8000-000000000002",
  "60000000-0000-4000-8000-000000000003",
  "60000000-0000-4000-8000-000000000004",
  "60000000-0000-4000-8000-000000000005",
  "60000000-0000-4000-8000-000000000006",
] as const;

function envFor(storagePath: string) {
  return parseEnvironment({
    NODE_ENV: "test", LOG_LEVEL: "silent", CORS_ORIGIN: allowedOrigin,
    DATABASE_URL: "postgresql://user:password@localhost:5432/Sistema_kpiGS?schema=public",
    DATABASE_TEST_URL: "postgresql://user:password@localhost:5432/Sistema_kpiGS?schema=test",
    EVIDENCE_STORAGE_PATH: storagePath,
  });
}

const pdf = Buffer.from("%PDF-1.7\nHTTP evidence\n", "utf8");
const disguised = Buffer.from("not a PDF", "utf8");

async function agentFor(user: { email: string }, targetApp = app) {
  const agent = request.agent(targetApp);
  await agent.post("/api/v1/auth/login").set("Origin", allowedOrigin).send({ email: user.email, password }).expect(200);
  return agent;
}

function upload(agent: Agent, target: string, body: Buffer = pdf, name = "proof.pdf") {
  return agent.post(target).set("Origin", allowedOrigin).field("description", "HTTP evidence").field("accessLevel", "TECHNICIAN").attach("file", body, { filename: name, contentType: "application/pdf" });
}

function errorCode(response: request.Response) {
  return response.body.errors[0]?.code;
}

beforeAll(async () => {
  await seedDatabase(database);
  await database.sesion.deleteMany({ where: { userId: { in: [...fixtureUserIds] } } });
  fixture = await createEvidencesReadFixture(database);
  const [roles, passwordHash] = await Promise.all([
    database.rol.findMany({ where: { code: { in: ["ADMIN", "TECHNICIAN"] } } }),
    hashPassword(password, { N: 1024, r: 8, p: 1, maxmem: 16 * 1024 * 1024 }),
  ]);
  const roleIds = Object.fromEntries(roles.map((role) => [role.code, role.id]));
  await database.usuario.createMany({ data: [
    { ...users.admin, displayName: "Evidence HTTP admin", status: "ACTIVE", mustChangePassword: false, passwordHash },
    { ...users.technician, displayName: "Evidence HTTP technician", status: "ACTIVE", mustChangePassword: false, passwordHash },
    { ...users.provisional, displayName: "Evidence HTTP provisional", status: "ACTIVE", mustChangePassword: true, passwordHash },
  ] });
  await database.usuarioRol.createMany({ data: [
    { usuarioId: users.admin.id, rolId: roleIds.ADMIN! },
    { usuarioId: users.technician.id, rolId: roleIds.TECHNICIAN! },
    { usuarioId: users.provisional.id, rolId: roleIds.ADMIN! },
    { usuarioId: fixture.formerUserId, rolId: roleIds.TECHNICIAN! },
    { usuarioId: fixture.historicalActivityUserId, rolId: roleIds.TECHNICIAN! },
    { usuarioId: fixture.supervisorUserId, rolId: roleIds.ADMIN! },
  ] });
  await database.usuario.updateMany({
    where: { id: { in: [fixture.formerUserId, fixture.historicalActivityUserId, fixture.supervisorUserId] } },
    data: { passwordHash, mustChangePassword: false },
  });
  await database.tecnico.update({ where: { id: fixture.assignedTechnicianId }, data: { userId: users.technician.id } });
  storageRoot = await mkdtemp(path.join(os.tmpdir(), "evidences-http-"));
  storage = new LocalEvidenceStorage(storageRoot);
  await storage.initialize(new Date(), 60);
  app = createApp({ env: envFor(storageRoot), logger: silentLogger, database, evidenceStorage: storage });
  lazyStorageRoot = await mkdtemp(path.join(os.tmpdir(), "evidences-http-lazy-"));
  appWithoutInjectedStorage = createApp({ env: envFor(lazyStorageRoot), logger: silentLogger, database });
});

afterAll(async () => {
  if (fixture === undefined) {
    await disconnectTestDatabase();
    return;
  }
  const userIds = Object.values(users).map(({ id }) => id);
  const created = await database.evidencia.findMany({ where: { uploadedById: { in: userIds } }, select: { id: true } });
  await database.auditoria.deleteMany({ where: { entity: "Evidencia", entityId: { in: created.map(({ id }) => id) } } });
  await database.evidencia.deleteMany({ where: { id: { in: created.map(({ id }) => id) } } });
  await database.sesion.deleteMany({ where: { userId: { in: [...userIds, fixture.formerUserId, fixture.historicalActivityUserId, fixture.supervisorUserId] } } });
  await database.usuarioRol.deleteMany({ where: { usuarioId: { in: userIds } } });
  await database.usuarioRol.deleteMany({ where: { usuarioId: { in: [fixture.formerUserId, fixture.historicalActivityUserId, fixture.supervisorUserId] } } });
  await database.usuario.deleteMany({ where: { id: { in: userIds } } });
  await removeEvidencesReadFixture(database);
  await rm(storageRoot, { recursive: true, force: true });
  await rm(lazyStorageRoot, { recursive: true, force: true });
  await disconnectTestDatabase();
});

describe("evidences HTTP", () => {
  it("lazily initializes the process-local storage when createApp receives no adapter", async () => {
    const admin = await agentFor(users.admin, appWithoutInjectedStorage);
    const response = await upload(admin, `/api/v1/orders/${fixture.activeOrderId}/evidences`).expect(201);
    const persisted = await database.evidencia.findUniqueOrThrow({ where: { id: response.body.data.id }, select: { storageKey: true } });
    expect(await new LocalEvidenceStorage(lazyStorageRoot).exists(persisted.storageKey)).toBe(true);
  });

  it("exposes protected uploads, listings, download, update and archive with public envelopes", async () => {
    const admin = await agentFor(users.admin);
    const created = await upload(admin, `/api/v1/orders/${fixture.activeOrderId}/evidences`, pdf, "proof safe.pdf").expect(201);
    expect(created.body).toMatchObject({ success: true, message: "Evidencia cargada", errors: [], data: { id: expect.any(String), originalName: "proof safe.pdf", resourceType: "ORDER", resourceId: fixture.activeOrderId, sizeBytes: pdf.length, accessLevel: "TECHNICIAN", version: 1 }, meta: { requestId: expect.any(String) } });
    expect(created.headers.location).toBe(`/api/v1/evidences/${created.body.data.id}`);
    expect(JSON.stringify(created.body)).not.toContain("storageKey");
    const activityUpload = await upload(admin, `/api/v1/activities/${fixture.currentActivityId}/evidences`).expect(201);
    expect(activityUpload.body.data).toMatchObject({ id: expect.any(String), resourceType: "ACTIVITY", resourceId: fixture.currentActivityId, accessLevel: "TECHNICIAN" });
    const listed = await admin.get(`/api/v1/orders/${fixture.activeOrderId}/evidences?page=1&pageSize=1`).expect(200);
    expect(listed.body).toMatchObject({ success: true, message: "Evidencias consultadas", errors: [], data: { items: [{ id: created.body.data.id }], pagination: { page: 1, pageSize: 1, totalItems: 5, totalPages: 5 } }, meta: { requestId: expect.any(String) } });
    const activityList = await admin.get(`/api/v1/activities/${fixture.currentActivityId}/evidences`).expect(200);
    expect(activityList.body.data).toMatchObject({ items: [{ id: activityUpload.body.data.id, accessLevel: "TECHNICIAN" }, { id: fixture.currentActivityTechnicianEvidenceId, accessLevel: "TECHNICIAN" }], pagination: { page: 1, pageSize: 20, totalItems: 2, totalPages: 1 } });
    await database.evidencia.update({ where: { id: created.body.data.id }, data: { originalName: "proof ñ.pdf" } });
    const downloaded = await admin.get(`/api/v1/evidences/${created.body.data.id}/download`).buffer(true).parse((res, cb) => { const chunks: Buffer[] = []; res.on("data", (chunk) => chunks.push(Buffer.from(chunk))); res.on("end", () => cb(null, Buffer.concat(chunks))); }).expect(200);
    expect(downloaded.body).toEqual(pdf);
    expect(downloaded.headers).toMatchObject({ "content-type": "application/pdf", "content-length": String(pdf.length), "x-content-type-options": "nosniff", "cache-control": "private, no-store", "content-disposition": "attachment; filename=\"proof _.pdf\"; filename*=UTF-8''proof%20%C3%B1.pdf" });
    const updated = await admin.patch(`/api/v1/evidences/${created.body.data.id}`).set("Origin", allowedOrigin).send({ version: 1, description: "Updated HTTP evidence", accessLevel: "INTERNAL" }).expect(200);
    expect(updated.body).toMatchObject({ success: true, message: "Evidencia actualizada", errors: [], data: { ...created.body.data, originalName: "proof ñ.pdf", description: "Updated HTTP evidence", accessLevel: "INTERNAL", version: 2, updatedAt: expect.any(String) }, meta: { requestId: expect.any(String) } });
    const archivedResponse = await admin.post(`/api/v1/evidences/${created.body.data.id}/archive`).set("Origin", allowedOrigin).send({ version: 2, reason: "Archive HTTP evidence without deleting its protected file" }).expect(200);
    expect(archivedResponse.body).toMatchObject({ success: true, message: "Evidencia archivada", errors: [], data: { ...updated.body.data, version: 3, updatedAt: expect.any(String) }, meta: { requestId: expect.any(String) } });
    await admin.get(`/api/v1/evidences/${created.body.data.id}/download`).expect(404);
    const archived = await database.evidencia.findUniqueOrThrow({ where: { id: created.body.data.id }, select: { storageKey: true } });
    expect(await storage.exists(archived.storageKey)).toBe(true);
  });

  it("shares lazy storage initialization across concurrent first operations", async () => {
    const raceRoot = await mkdtemp(path.join(os.tmpdir(), "evidences-http-race-"));
    try {
      const raceApp = createApp({ env: envFor(raceRoot), logger: silentLogger, database });
      const [first, second] = await Promise.all([agentFor(users.admin, raceApp), agentFor(users.admin, raceApp)]);
      const responses = await Promise.all([
        upload(first, `/api/v1/orders/${fixture.activeOrderId}/evidences`, pdf, "race-one.pdf"),
        upload(second, `/api/v1/orders/${fixture.activeOrderId}/evidences`, pdf, "race-two.pdf"),
      ]);
      expect(responses.map(({ status }) => status)).toEqual([201, 201]);
    } finally {
      await rm(raceRoot, { recursive: true, force: true });
    }
  });

  it("keeps technician visibility scoped to current and historical work and hides internal/foreign records", async () => {
    const technician = await agentFor(users.technician);
    const current = await technician.get(`/api/v1/orders/${fixture.activeOrderId}/evidences`).expect(200);
    expect(current.body.data.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: fixture.orderTechnicianEvidenceId, accessLevel: "TECHNICIAN" }),
    ]));
    const currentActivity = await technician.get(`/api/v1/activities/${fixture.currentActivityId}/evidences`).expect(200);
    expect(currentActivity.body.data.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: fixture.currentActivityTechnicianEvidenceId, accessLevel: "TECHNICIAN" }),
    ]));
    await technician.get(`/api/v1/orders/${fixture.completedOrderId}/evidences`).expect(404);
    const former = await agentFor({ email: "evidence-former@example.test" });
    const historicalOrder = await former.get(`/api/v1/orders/${fixture.completedOrderId}/evidences`).expect(200);
    expect(historicalOrder.body.data).toMatchObject({ items: [{ id: fixture.completedTechnicianEvidenceId, accessLevel: "TECHNICIAN" }], pagination: { totalItems: 1, totalPages: 1 } });
    const historicalActivity = await (await agentFor({ email: "evidence-history@example.test" })).get(`/api/v1/activities/${fixture.historicalActivityId}/evidences`).expect(200);
    expect(historicalActivity.body.data).toMatchObject({ items: [{ id: fixture.historicalActivityTechnicianEvidenceId, accessLevel: "TECHNICIAN" }], pagination: { totalItems: 1, totalPages: 1 } });
    const managerWithTechnician = await agentFor({ email: "evidence-supervisor@example.test" });
    const managementList = await managerWithTechnician.get(`/api/v1/orders/${fixture.activeOrderId}/evidences`).expect(200);
    expect(managementList.body.data.items.some((item: { accessLevel: string }) => item.accessLevel === "INTERNAL")).toBe(true);
    const internal = await technician.get(`/api/v1/evidences/${fixture.orderInternalEvidenceId}/download`).expect(404);
    const foreign = await technician.get(`/api/v1/evidences/${fixture.cancelledForeignEvidenceId}/download`).expect(404);
    const absent = await technician.get(`/api/v1/evidences/${randomUUID()}/download`).expect(404);
    expect(internal.body).toMatchObject({ success: false, data: null });
    expect({ status: foreign.status, body: { ...foreign.body, meta: { requestId: "" } } }).toEqual({ status: absent.status, body: { ...absent.body, meta: { requestId: "" } } });
  });

  it("rejects invalid state, origin, body and version without revealing protected resources", async () => {
    const admin = await agentFor(users.admin);
    const provisional = await agentFor(users.provisional);
    await upload(admin, `/api/v1/orders/${fixture.cancelledOrderId}/evidences`).expect(409);
    await admin.post(`/api/v1/orders/${fixture.activeOrderId}/evidences`).set("Origin", allowedOrigin).field("accessLevel", "CLIENT").attach("file", pdf, { filename: "client.pdf", contentType: "application/pdf" }).expect(400);
    await admin.patch(`/api/v1/evidences/${fixture.orderTechnicianEvidenceId}`).set("Origin", allowedOrigin).send({ version: 1, accessLevel: "CLIENT" }).expect(400);
    await upload(admin, `/api/v1/orders/${fixture.activeOrderId}/evidences`, disguised).expect(422);
    await upload(admin, `/api/v1/orders/${fixture.activeOrderId}/evidences`, Buffer.alloc(10_485_761)).expect(413);
    const noOrigin = await admin.post(`/api/v1/evidences/${fixture.orderTechnicianEvidenceId}/archive`).send({ version: 1, reason: "Archive requires an explicit approved origin" }).expect(403);
    expect(errorCode(noOrigin)).toBe("ORIGIN_REQUIRED");
    await provisional.get(`/api/v1/orders/${fixture.activeOrderId}/evidences`).expect(403);
    await admin.patch(`/api/v1/evidences/${fixture.orderTechnicianEvidenceId}`).set("Origin", allowedOrigin).send({ version: 999, description: "Stale version" }).expect(409);
    const absent = await admin.get(`/api/v1/evidences/${randomUUID()}/download`).expect(404);
    const archived = await admin.get(`/api/v1/evidences/${fixture.orderArchivedEvidenceId}/download`).expect(404);
    expect({ status: absent.status, body: { ...absent.body, meta: { requestId: "" } } }).toEqual({ status: archived.status, body: { ...archived.body, meta: { requestId: "" } } });
  });

  it("correlates a cleanup failure after validation without mutating the public response or logging storage details", async () => {
    const logLines: string[] = [];
    const destination = new Writable({
      write(chunk, _encoding, callback) {
        logLines.push(String(chunk));
        callback();
      },
    });
    const logger = pino({ level: "error", base: null, timestamp: false }, destination);
    const temporaryKey = "tmp/secret-upload.upload";
    const cleanupStorage: EvidenceStorage = {
      initialize: async () => ({ removedTemporaries: 0 }),
      writeTemporary: async (source) => {
        for await (const chunk of source) {
          void chunk;
        }
        return { tempKey: temporaryKey, sizeBytes: disguised.length, checksumSha256: "a".repeat(64) };
      },
      readHead: async () => disguised,
      promote: async () => undefined,
      open: async () => { throw new Error("not used"); },
      remove: async () => { throw new Error(`cannot remove C:/private/evidences/${temporaryKey}`); },
      exists: async () => false,
      async *listFinalKeys() {},
    };
    const loggingApp = createApp({ env: envFor(storageRoot), logger, database, evidenceStorage: cleanupStorage });
    const admin = await agentFor(users.admin, loggingApp);
    const requestId = "70000000-0000-4000-8000-000000000099";

    const response = await admin
      .post(`/api/v1/orders/${fixture.activeOrderId}/evidences`)
      .set("Origin", allowedOrigin)
      .set("X-Request-Id", requestId)
      .attach("file", disguised, { filename: "disguised.pdf", contentType: "application/pdf" })
      .expect(422);

    expect(response.body).toMatchObject({
      success: false,
      errors: [{ code: "INVALID_EVIDENCE_FILE" }],
      meta: { requestId },
    });
    const operationalLog = logLines
      .flatMap((line) => line.trim().split("\n"))
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Record<string, unknown>)
      .find((entry) => entry.code === "EVIDENCE_STORAGE_CLEANUP_FAILED");
    expect(operationalLog).toMatchObject({
      event: "EVIDENCE_STORAGE_CLEANUP_FAILED",
      code: "EVIDENCE_STORAGE_CLEANUP_FAILED",
      requestId,
    });
    expect(operationalLog).not.toHaveProperty("err");
    expect(operationalLog).not.toHaveProperty("cause");
    expect(JSON.stringify(operationalLog)).not.toContain(temporaryKey);
    expect(JSON.stringify(operationalLog)).not.toContain("C:/private/evidences");
  });
});
