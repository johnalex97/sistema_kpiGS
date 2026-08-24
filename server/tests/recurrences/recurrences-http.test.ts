import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedDatabase } from "../../prisma/seed.js";
import { createApp } from "../../src/app.js";
import { hashPassword } from "../../src/auth/password.js";
import { parseEnvironment, type Environment } from "../../src/config/env.js";
import { LocalEvidenceStorage } from "../../src/evidences/evidences.local-storage.js";
import { silentLogger } from "../../src/utils/logger.js";
import {
  database,
  disconnectTestDatabase,
} from "../database/database-test-context.js";

const allowedOrigin = "http://localhost:5173";
const password = "GeekRecurrencesHttp-2026!";
const suffix = randomUUID().slice(0, 8);
const users = {
  admin: {
    id: randomUUID(),
    email: `recurrences.http.admin.${randomUUID()}@example.test`,
  },
  supervisor: {
    id: randomUUID(),
    email: `recurrences.http.supervisor.${randomUUID()}@example.test`,
  },
  reporter: {
    id: randomUUID(),
    email: `recurrences.http.reporter.${randomUUID()}@example.test`,
  },
  foreign: {
    id: randomUUID(),
    email: `recurrences.http.foreign.${randomUUID()}@example.test`,
  },
  provisional: {
    id: randomUUID(),
    email: `recurrences.http.provisional.${randomUUID()}@example.test`,
  },
} as const;
const ids = {
  supervisorTechnician: randomUUID(),
  reporterTechnician: randomUUID(),
  originalParticipant: randomUUID(),
  foreignTechnician: randomUUID(),
  client: randomUUID(),
  branch: randomUUID(),
  otherBranch: randomUUID(),
  serviceType: randomUUID(),
  cause: randomUUID(),
  originalMain: randomUUID(),
  correctionMain: randomUUID(),
  visitMain: randomUUID(),
  originalDismiss: randomUUID(),
  correctionDismiss: randomUUID(),
  mismatchCorrection: randomUUID(),
  privacyRecurrence: randomUUID(),
  hiddenOriginal: randomUUID(),
  hiddenCorrection: randomUUID(),
  hiddenRecurrence: randomUUID(),
  deletedOriginal: randomUUID(),
  deletedCorrection: randomUUID(),
  deletedRecurrence: randomUUID(),
} as const;
const orderIds = [
  ids.originalMain,
  ids.correctionMain,
  ids.visitMain,
  ids.originalDismiss,
  ids.correctionDismiss,
  ids.mismatchCorrection,
  ids.hiddenOriginal,
  ids.hiddenCorrection,
  ids.deletedOriginal,
  ids.deletedCorrection,
] as const;

let app: ReturnType<typeof createApp>;
let env: Environment;
let storage: LocalEvidenceStorage;
let storageRoot = "";
let sequenceBefore: number | null = null;

type User = (typeof users)[keyof typeof users];
type Agent = ReturnType<typeof request.agent>;

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1_000);
}

function errorCode(response: request.Response): string | undefined {
  return response.body.errors[0]?.code;
}

function withoutRequestId(response: request.Response) {
  return {
    status: response.status,
    body: { ...response.body, meta: { requestId: "" } },
  };
}

function assertNoPrivateRecurrenceFields(body: unknown): void {
  const serialized = JSON.stringify(body);
  for (const field of [
    "storageKey",
    "reportedById",
    "reviewedById",
    "closedById",
    "dismissedById",
    "passwordHash",
  ]) {
    expect(serialized).not.toContain(field);
  }
}

async function authenticatedAgent(user: User): Promise<Agent> {
  const agent = request.agent(app);
  await agent
    .post("/api/v1/auth/login")
    .set("Origin", allowedOrigin)
    .send({ email: user.email, password })
    .expect(200);
  return agent;
}

function uploadEvidence(
  agent: Agent,
  recurrenceId: string,
  filename = "recurrence-proof.pdf",
) {
  return agent
    .post(`/api/v1/recurrences/${recurrenceId}/evidences`)
    .set("Origin", allowedOrigin)
    .field("description", "Evidencia HTTP de reincidencia")
    .field("accessLevel", "INTERNAL")
    .attach("file", Buffer.from("%PDF-1.7\nrecurrence proof\n", "utf8"), {
      filename,
      contentType: "application/pdf",
    });
}

async function finalStorageKeys(): Promise<string[]> {
  const keys: string[] = [];
  for await (const key of storage.listFinalKeys()) keys.push(key);
  return keys.sort();
}

async function cleanupFixture(): Promise<void> {
  const recurrences = await database.reincidencia.findMany({
    where: {
      originalOrderId: {
        in: [ids.originalMain, ids.originalDismiss, ids.hiddenOriginal, ids.deletedOriginal],
      },
    },
    select: { id: true },
  });
  const recurrenceIds = recurrences.map(({ id }) => id);
  const evidences = await database.evidencia.findMany({
    where: { reincidenciaId: { in: recurrenceIds } },
    select: { id: true },
  });
  const evidenceIds = evidences.map(({ id }) => id);

  await database.auditoria.deleteMany({
    where: {
      OR: [
        { entityId: { in: recurrenceIds } },
        { entityId: { in: evidenceIds } },
        { entity: "usuario", entityId: { in: Object.values(users).map(({ id }) => id) } },
      ],
    },
  });
  await database.evidencia.deleteMany({ where: { id: { in: evidenceIds } } });
  await database.reincidenciaNota.deleteMany({ where: { reincidenciaId: { in: recurrenceIds } } });
  await database.reincidenciaTecnico.deleteMany({ where: { reincidenciaId: { in: recurrenceIds } } });
  await database.reincidenciaOrden.deleteMany({ where: { reincidenciaId: { in: recurrenceIds } } });
  await database.solicitudRevisionKPI.deleteMany({ where: { reincidenciaId: { in: recurrenceIds } } });
  await database.reincidencia.deleteMany({ where: { id: { in: recurrenceIds } } });
  await database.ordenTecnico.deleteMany({ where: { ordenId: { in: [...orderIds] } } });
  await database.ordenTrabajo.deleteMany({ where: { id: { in: [...orderIds] } } });
  await database.causaReincidencia.deleteMany({ where: { id: ids.cause } });
  await database.tecnico.deleteMany({
    where: {
      id: {
        in: [
          ids.supervisorTechnician,
          ids.reporterTechnician,
          ids.originalParticipant,
          ids.foreignTechnician,
        ],
      },
    },
  });
  await database.tipoServicio.deleteMany({ where: { id: ids.serviceType } });
  await database.sucursalCliente.deleteMany({ where: { id: { in: [ids.branch, ids.otherBranch] } } });
  await database.cliente.deleteMany({ where: { id: ids.client } });

  const userIds = Object.values(users).map(({ id }) => id);
  await database.sesion.deleteMany({ where: { userId: { in: userIds } } });
  await database.usuarioRol.deleteMany({ where: { usuarioId: { in: userIds } } });
  await database.usuario.deleteMany({ where: { id: { in: userIds } } });
}

beforeAll(async () => {
  await seedDatabase(database);
  sequenceBefore = (
    await database.secuenciaReincidencia.findUnique({
      where: { year: new Date().getUTCFullYear() },
      select: { lastNumber: true },
    })
  )?.lastNumber ?? null;
  await cleanupFixture();

  const [roles, passwordHash] = await Promise.all([
    database.rol.findMany({
      where: { code: { in: ["ADMIN", "SUPERVISOR", "TECHNICIAN"] } },
      select: { id: true, code: true },
    }),
    hashPassword(password, {
      N: 1024,
      r: 8,
      p: 1,
      maxmem: 16 * 1024 * 1024,
    }),
  ]);
  const roleIds = Object.fromEntries(roles.map(({ id, code }) => [code, id]));

  await database.usuario.createMany({
    data: [
      { ...users.admin, displayName: "Administrador HTTP reincidencias", status: "ACTIVE", mustChangePassword: false, passwordHash },
      { ...users.supervisor, displayName: "Supervisor HTTP reincidencias", status: "ACTIVE", mustChangePassword: false, passwordHash },
      { ...users.reporter, displayName: "Técnico reportante HTTP", status: "ACTIVE", mustChangePassword: false, passwordHash },
      { ...users.foreign, displayName: "Técnico ajeno HTTP", status: "ACTIVE", mustChangePassword: false, passwordHash },
      { ...users.provisional, displayName: "Usuario provisional HTTP", status: "ACTIVE", mustChangePassword: true, passwordHash },
    ],
  });
  await database.usuarioRol.createMany({
    data: [
      { usuarioId: users.admin.id, rolId: roleIds.ADMIN! },
      { usuarioId: users.supervisor.id, rolId: roleIds.SUPERVISOR! },
      { usuarioId: users.reporter.id, rolId: roleIds.TECHNICIAN! },
      { usuarioId: users.foreign.id, rolId: roleIds.TECHNICIAN! },
      { usuarioId: users.provisional.id, rolId: roleIds.ADMIN! },
    ],
  });
  await database.tecnico.createMany({
    data: [
      { id: ids.supervisorTechnician, userId: users.supervisor.id, code: `RHM-${suffix}`, fullName: "Supervisor con perfil técnico" },
      { id: ids.reporterTechnician, userId: users.reporter.id, code: `RHR-${suffix}`, fullName: "Técnico reportante" },
      { id: ids.originalParticipant, code: `RHP-${suffix}`, fullName: "Participante original" },
      { id: ids.foreignTechnician, userId: users.foreign.id, code: `RHF-${suffix}`, fullName: "Técnico ajeno" },
    ],
  });
  await database.cliente.create({
    data: { id: ids.client, code: `RH-C-${suffix}`, tradeName: "Cliente HTTP reincidencias" },
  });
  await database.sucursalCliente.createMany({
    data: [
      { id: ids.branch, clienteId: ids.client, code: `RH-B-${suffix}`, name: "Sucursal HTTP principal", address: "Dirección principal" },
      { id: ids.otherBranch, clienteId: ids.client, code: `RH-X-${suffix}`, name: "Sucursal HTTP distinta", address: "Dirección distinta" },
    ],
  });
  await database.tipoServicio.create({
    data: { id: ids.serviceType, code: `RH-S-${suffix}`, name: "Servicio HTTP reincidencias" },
  });
  await database.causaReincidencia.create({
    data: { id: ids.cause, code: `RH-CAUSE-${suffix}`, name: "Causa HTTP activa", displayOrder: 1 },
  });
  await database.ordenTrabajo.createMany({
    data: [
      { id: ids.originalMain, orderNumber: `OT-RH-${suffix}-01`, sucursalId: ids.branch, tipoServicioId: ids.serviceType, status: "COMPLETED", endedAt: daysAgo(7), reportedProblem: "Trabajo original principal" },
      { id: ids.correctionMain, orderNumber: `OT-RH-${suffix}-02`, sucursalId: ids.branch, tipoServicioId: ids.serviceType, status: "COMPLETED", endedAt: daysAgo(2), reportedProblem: "Corrección principal" },
      { id: ids.visitMain, orderNumber: `OT-RH-${suffix}-03`, sucursalId: ids.branch, tipoServicioId: ids.serviceType, status: "COMPLETED", endedAt: daysAgo(1), reportedProblem: "Visita correctiva adicional" },
      { id: ids.originalDismiss, orderNumber: `OT-RH-${suffix}-04`, sucursalId: ids.branch, tipoServicioId: ids.serviceType, status: "COMPLETED", endedAt: daysAgo(6), reportedProblem: "Trabajo original descartable" },
      { id: ids.correctionDismiss, orderNumber: `OT-RH-${suffix}-05`, sucursalId: ids.branch, tipoServicioId: ids.serviceType, status: "COMPLETED", endedAt: daysAgo(1), reportedProblem: "Corrección descartable" },
      { id: ids.mismatchCorrection, orderNumber: `OT-RH-${suffix}-06`, sucursalId: ids.otherBranch, tipoServicioId: ids.serviceType, status: "COMPLETED", endedAt: daysAgo(1), reportedProblem: "Corrección en otra sucursal" },
      { id: ids.hiddenOriginal, orderNumber: `OT-RH-${suffix}-07`, sucursalId: ids.branch, tipoServicioId: ids.serviceType, status: "COMPLETED", endedAt: daysAgo(6), reportedProblem: "Hidden original work" },
      { id: ids.hiddenCorrection, orderNumber: `OT-RH-${suffix}-08`, sucursalId: ids.branch, tipoServicioId: ids.serviceType, status: "COMPLETED", endedAt: daysAgo(1), reportedProblem: "Correction outside technician scope" },
      { id: ids.deletedOriginal, orderNumber: `OT-RH-${suffix}-09`, sucursalId: ids.branch, tipoServicioId: ids.serviceType, status: "COMPLETED", endedAt: daysAgo(6), reportedProblem: "Original work for soft-delete case" },
      { id: ids.deletedCorrection, orderNumber: `OT-RH-${suffix}-10`, sucursalId: ids.branch, tipoServicioId: ids.serviceType, status: "COMPLETED", endedAt: daysAgo(1), deletedAt: daysAgo(0.25), reportedProblem: "Soft-deleted correction" },
    ],
  });
  await database.ordenTecnico.createMany({
    data: [
      { ordenId: ids.originalMain, tecnicoId: ids.reporterTechnician, role: "PRIMARY", assignedAt: daysAgo(10), unassignedAt: daysAgo(6) },
      { ordenId: ids.originalMain, tecnicoId: ids.originalParticipant, role: "SUPPORT", assignedAt: daysAgo(9), unassignedAt: daysAgo(8) },
      { ordenId: ids.correctionMain, tecnicoId: ids.reporterTechnician, role: "PRIMARY", assignedAt: daysAgo(5), unassignedAt: daysAgo(1) },
      { ordenId: ids.visitMain, tecnicoId: ids.originalParticipant, role: "PRIMARY", assignedAt: daysAgo(3), unassignedAt: daysAgo(0.5) },
      { ordenId: ids.originalDismiss, tecnicoId: ids.reporterTechnician, role: "PRIMARY", assignedAt: daysAgo(9), unassignedAt: daysAgo(5) },
      { ordenId: ids.correctionDismiss, tecnicoId: ids.foreignTechnician, role: "PRIMARY", assignedAt: daysAgo(3), unassignedAt: daysAgo(0.5) },
      { ordenId: ids.mismatchCorrection, tecnicoId: ids.reporterTechnician, role: "PRIMARY", assignedAt: daysAgo(3), unassignedAt: daysAgo(0.5) },
      { ordenId: ids.hiddenOriginal, tecnicoId: ids.reporterTechnician, role: "PRIMARY", assignedAt: daysAgo(9), unassignedAt: daysAgo(5) },
      { ordenId: ids.hiddenCorrection, tecnicoId: ids.foreignTechnician, role: "PRIMARY", assignedAt: daysAgo(3), unassignedAt: daysAgo(0.5) },
      { ordenId: ids.deletedOriginal, tecnicoId: ids.reporterTechnician, role: "PRIMARY", assignedAt: daysAgo(9), unassignedAt: daysAgo(5) },
      { ordenId: ids.deletedCorrection, tecnicoId: ids.reporterTechnician, role: "PRIMARY", assignedAt: daysAgo(3), unassignedAt: daysAgo(0.5) },
    ],
  });
  await database.reincidencia.createMany({
    data: [
      {
        id: ids.hiddenRecurrence,
        recurrenceNumber: `RI-2995-${String(parseInt(suffix, 16) % 10_000).padStart(4, "0")}`,
        originalOrderId: ids.hiddenOriginal,
        reportedById: users.supervisor.id,
        status: "OPEN",
        detectedProblem: "Existing hidden-pair report",
      },
      {
        id: ids.deletedRecurrence,
        recurrenceNumber: `RI-2996-${String(parseInt(suffix, 16) % 10_000).padStart(4, "0")}`,
        originalOrderId: ids.deletedOriginal,
        reportedById: users.supervisor.id,
        status: "OPEN",
        detectedProblem: "Existing soft-deleted-pair report",
      },
    ],
  });
  await database.reincidenciaOrden.createMany({
    data: [
      { reincidenciaId: ids.hiddenRecurrence, ordenId: ids.hiddenCorrection, visitNumber: 1 },
      { reincidenciaId: ids.deletedRecurrence, ordenId: ids.deletedCorrection, visitNumber: 1 },
    ],
  });

  storageRoot = await mkdtemp(path.join(os.tmpdir(), "recurrences-http-"));
  storage = new LocalEvidenceStorage(storageRoot);
  await storage.initialize(new Date(), 60);
  env = parseEnvironment({
    NODE_ENV: "test",
    LOG_LEVEL: "silent",
    CORS_ORIGIN: allowedOrigin,
    DATABASE_URL: "postgresql://user:password@localhost:5432/Sistema_kpiGS?schema=public",
    DATABASE_TEST_URL: "postgresql://user:password@localhost:5432/Sistema_kpiGS?schema=test",
    EVIDENCE_STORAGE_PATH: storageRoot,
    RECURRENCE_WARNING_DAYS: "30",
  });
  app = createApp({ env, logger: silentLogger, database, evidenceStorage: storage });
});

afterAll(async () => {
  await cleanupFixture();
  const year = new Date().getUTCFullYear();
  if (sequenceBefore === null) {
    await database.secuenciaReincidencia.deleteMany({ where: { year } });
  } else {
    await database.secuenciaReincidencia.upsert({
      where: { year },
      create: { year, lastNumber: sequenceBefore },
      update: { lastNumber: sequenceBefore },
    });
  }
  if (storageRoot !== "") {
    await rm(storageRoot, { recursive: true, force: true });
  }
  await disconnectTestDatabase();
});

describe("recurrences HTTP security", () => {
  it("applies origin before authentication on writes and protects reads and provisional sessions", async () => {
    const noOrigin = await request(app)
      .post("/api/v1/recurrences")
      .send({
        originalOrderId: ids.originalMain,
        correctionOrderId: ids.correctionMain,
        detectedProblem: "Reporte sin origen permitido",
      })
      .expect(403);
    expect(errorCode(noOrigin)).toBe("ORIGIN_REQUIRED");

    const unauthenticatedWrite = await request(app)
      .post("/api/v1/recurrences")
      .set("Origin", allowedOrigin)
      .send({
        originalOrderId: ids.originalMain,
        correctionOrderId: ids.correctionMain,
        detectedProblem: "Reporte sin sesión",
      })
      .expect(401);
    expect(errorCode(unauthenticatedWrite)).toBe("AUTHENTICATION_REQUIRED");

    const unauthenticatedRead = await request(app)
      .get("/api/v1/recurrences")
      .expect(401);
    expect(errorCode(unauthenticatedRead)).toBe("AUTHENTICATION_REQUIRED");

    const provisional = await authenticatedAgent(users.provisional);
    const provisionalRead = await provisional.get("/api/v1/recurrences").expect(403);
    expect(errorCode(provisionalRead)).toBe("PASSWORD_CHANGE_REQUIRED");
    const provisionalWrite = await provisional
      .post("/api/v1/recurrences")
      .set("Origin", allowedOrigin)
      .send({
        originalOrderId: ids.originalMain,
        correctionOrderId: ids.correctionMain,
        detectedProblem: "Reporte con contraseña provisional",
      })
      .expect(403);
    expect(errorCode(provisionalWrite)).toBe("PASSWORD_CHANGE_REQUIRED");
  });
});

describe("recurrences DB-backed HTTP contract", () => {
  // Mutation caught: checking pair duplication or business compatibility before
  // order visibility lets a report endpoint disclose hidden order existence.
  it("conceals absent, nonparticipant, and soft-deleted orders without report mutations", async () => {
    const reporter = await authenticatedAgent(users.reporter);
    const year = new Date().getUTCFullYear();
    const before = {
      recurrences: await database.reincidencia.count(),
      audits: await database.auditoria.count({ where: { action: "RECURRENCE_REPORTED" } }),
      sequence: await database.secuenciaReincidencia.findUnique({ where: { year } }),
    };
    const report = (originalOrderId: string, correctionOrderId: string) => reporter
      .post("/api/v1/recurrences")
      .set("Origin", allowedOrigin)
      .send({
        originalOrderId,
        correctionOrderId,
        detectedProblem: "Concealed order report attempt",
      });

    const absent = await report(ids.hiddenOriginal, randomUUID()).expect(404);
    const nonparticipant = await report(ids.hiddenOriginal, ids.hiddenCorrection).expect(404);
    const softDeleted = await report(ids.deletedOriginal, ids.deletedCorrection).expect(404);

    expect(withoutRequestId(nonparticipant)).toEqual(withoutRequestId(absent));
    expect(withoutRequestId(softDeleted)).toEqual(withoutRequestId(absent));
    expect(errorCode(absent)).toBe("ORDER_NOT_FOUND");
    await expect(database.reincidencia.count()).resolves.toBe(before.recurrences);
    await expect(database.auditoria.count({ where: { action: "RECURRENCE_REPORTED" } }))
      .resolves.toBe(before.audits);
    await expect(database.secuenciaReincidencia.findUnique({ where: { year } }))
      .resolves.toEqual(before.sequence);
  });

  it("reports, reviews, corrects, documents, closes and adjusts a visible case", async () => {
    const reporter = await authenticatedAgent(users.reporter);
    const foreign = await authenticatedAgent(users.foreign);
    const supervisor = await authenticatedAgent(users.supervisor);

    const catalog = await reporter.get("/api/v1/recurrences/catalog").expect(200);
    expect(catalog.body).toMatchObject({
      success: true,
      errors: [],
      meta: { requestId: expect.any(String) },
    });
    expect(catalog.body.data.causes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: ids.cause, code: `RH-CAUSE-${suffix}` }),
    ]));
    expect(catalog.body.data).toMatchObject({
      states: ["OPEN", "ANALYSIS", "CORRECTION", "CLOSED", "DISMISSED"],
      impacts: ["LOW", "MEDIUM", "HIGH"],
      responsibilities: ["TECHNICAL_WORK", "EQUIPMENT", "CLIENT", "THIRD_PARTY", "UNDETERMINED"],
      transitions: [
        { command: "ANALYZE", from: "OPEN", to: "ANALYSIS" },
        { command: "START_CORRECTION", from: "ANALYSIS", to: "CORRECTION" },
        { command: "CLOSE", from: "CORRECTION", to: "CLOSED" },
        { command: "DISMISS", from: "OPEN", to: "DISMISSED" },
        { command: "DISMISS", from: "ANALYSIS", to: "DISMISSED" },
      ],
    });

    const mismatch = await reporter
      .post("/api/v1/recurrences")
      .set("Origin", allowedOrigin)
      .send({
        originalOrderId: ids.originalMain,
        correctionOrderId: ids.mismatchCorrection,
        detectedProblem: "La corrección pertenece a otra sucursal",
      })
      .expect(409);
    expect(errorCode(mismatch)).toBe("RECURRENCE_ORDER_MISMATCH");

    const created = await reporter
      .post("/api/v1/recurrences")
      .set("Origin", allowedOrigin)
      .send({
        originalOrderId: ids.originalMain,
        correctionOrderId: ids.correctionMain,
        detectedProblem: "El enlace volvió a fallar después del cierre",
      })
      .expect(201);
    const recurrenceId = created.body.data.id as string;
    expect(created.headers.location).toBe(`/api/v1/recurrences/${recurrenceId}`);
    expect(created.body).toMatchObject({
      success: true,
      errors: [],
      data: {
        id: recurrenceId,
        recurrenceNumber: expect.stringMatching(/^RI-\d{4}-\d{4}$/),
        status: "OPEN",
        version: 1,
        originalOrder: { id: ids.originalMain },
        visits: [{ visitNumber: 1, order: { id: ids.correctionMain } }],
      },
      meta: { requestId: expect.any(String) },
    });
    assertNoPrivateRecurrenceFields(created.body);

    const reportAudit = await database.auditoria.findFirstOrThrow({
      where: { entity: "Reincidencia", entityId: recurrenceId, action: "RECURRENCE_REPORTED" },
      select: { requestId: true },
    });
    expect(reportAudit.requestId).toBe(created.body.meta.requestId);

    const duplicate = await reporter
      .post("/api/v1/recurrences")
      .set("Origin", allowedOrigin)
      .send({
        originalOrderId: ids.originalMain,
        correctionOrderId: ids.correctionMain,
        detectedProblem: "Intento de duplicar la pareja abierta",
      })
      .expect(409);
    expect(errorCode(duplicate)).toBe("RECURRENCE_DUPLICATE");

    const ownList = await reporter
      .get("/api/v1/recurrences?status=OPEN&page=1&pageSize=10")
      .expect(200);
    expect(ownList.body.data).toMatchObject({
      items: [expect.objectContaining({ id: recurrenceId, status: "OPEN" })],
      pagination: { page: 1, pageSize: 10, totalItems: 1, totalPages: 1 },
    });
    const byClient = await reporter
      .get(`/api/v1/recurrences?clientId=${ids.client}`)
      .expect(200);
    const byBranch = await reporter
      .get(`/api/v1/recurrences?branchId=${ids.branch}`)
      .expect(200);
    const byForeignClient = await reporter
      .get(`/api/v1/recurrences?clientId=${randomUUID()}`)
      .expect(200);
    const byForeignBranch = await reporter
      .get(`/api/v1/recurrences?branchId=${ids.otherBranch}`)
      .expect(200);
    expect(byClient.body.data.items.map(({ id }: { id: string }) => id)).toContain(recurrenceId);
    expect(byBranch.body.data.items.map(({ id }: { id: string }) => id)).toContain(recurrenceId);
    expect(byForeignClient.body.data).toMatchObject({ items: [], pagination: { totalItems: 0 } });
    expect(byForeignBranch.body.data).toMatchObject({ items: [], pagination: { totalItems: 0 } });
    const ownDetail = await reporter.get(`/api/v1/recurrences/${recurrenceId}`).expect(200);
    expect(ownDetail.body.data.id).toBe(recurrenceId);

    const managementList = await supervisor
      .get(`/api/v1/recurrences?search=${encodeURIComponent(created.body.data.recurrenceNumber)}`)
      .expect(200);
    expect(managementList.body.data.items).toEqual([
      expect.objectContaining({ id: recurrenceId }),
    ]);
    expect(managementList.body.data.pagination.totalItems).toBe(1);

    const foreignDetail = await foreign.get(`/api/v1/recurrences/${recurrenceId}`).expect(404);
    const absentDetail = await foreign.get(`/api/v1/recurrences/${randomUUID()}`).expect(404);
    expect(withoutRequestId(foreignDetail)).toEqual(withoutRequestId(absentDetail));
    expect(errorCode(foreignDetail)).toBe("RECURRENCE_NOT_FOUND");

    const forbiddenReview = await reporter
      .post(`/api/v1/recurrences/${recurrenceId}/analysis`)
      .set("Origin", allowedOrigin)
      .send({ version: 1 })
      .expect(403);
    expect(errorCode(forbiddenReview)).toBe("FORBIDDEN");

    const invalidTransition = await supervisor
      .post(`/api/v1/recurrences/${recurrenceId}/correction`)
      .set("Origin", allowedOrigin)
      .send({ version: 1, correctiveAction: "Corregir la terminación defectuosa" })
      .expect(409);
    expect(errorCode(invalidTransition)).toBe("INVALID_RECURRENCE_TRANSITION");

    const staleAnalysis = await supervisor
      .post(`/api/v1/recurrences/${recurrenceId}/analysis`)
      .set("Origin", allowedOrigin)
      .send({
        version: 99,
        causeId: ids.cause,
        impact: "HIGH",
        responsibility: "TECHNICAL_WORK",
        analysis: "La terminación original quedó sin asegurar.",
        qualityDecisions: [
          { technicianId: ids.reporterTechnician, affectsQuality: true, justification: "Omitió la prueba de tracción final." },
          { technicianId: ids.originalParticipant, affectsQuality: false },
        ],
      })
      .expect(409);
    expect(errorCode(staleAnalysis)).toBe("VERSION_CONFLICT");

    const analyzed = await supervisor
      .post(`/api/v1/recurrences/${recurrenceId}/analysis`)
      .set("Origin", allowedOrigin)
      .send({
        version: 1,
        causeId: ids.cause,
        impact: "HIGH",
        responsibility: "TECHNICAL_WORK",
        analysis: "La terminación original quedó sin asegurar.",
        qualityDecisions: [
          { technicianId: ids.reporterTechnician, affectsQuality: true, justification: "Omitió la prueba de tracción final." },
          { technicianId: ids.originalParticipant, affectsQuality: false },
        ],
      })
      .expect(200);
    expect(analyzed.body.data).toMatchObject({ status: "ANALYSIS", version: 2 });

    const correction = await supervisor
      .post(`/api/v1/recurrences/${recurrenceId}/correction`)
      .set("Origin", allowedOrigin)
      .send({
        version: 2,
        correctiveAction: "Rehacer y certificar la terminación.",
      })
      .expect(200);
    expect(correction.body.data).toMatchObject({ status: "CORRECTION", version: 3 });

    const visit = await supervisor
      .post(`/api/v1/recurrences/${recurrenceId}/visits`)
      .set("Origin", allowedOrigin)
      .send({ version: 3, orderId: ids.visitMain, observation: "Visita adicional validada" })
      .expect(200);
    expect(visit.body.data).toMatchObject({ status: "CORRECTION", version: 4 });
    expect(visit.body.data.visits).toEqual(expect.arrayContaining([
      expect.objectContaining({
        visitNumber: 2,
        order: expect.objectContaining({ id: ids.visitMain }),
      }),
    ]));

    const note = await reporter
      .post(`/api/v1/recurrences/${recurrenceId}/notes`)
      .set("Origin", allowedOrigin)
      .send({ content: "Se verificó la estabilidad del enlace durante una hora." })
      .expect(200);
    expect(note.body.data).toMatchObject({ status: "CORRECTION", version: 4 });
    expect(note.body.data.notes).toEqual(expect.arrayContaining([
      expect.objectContaining({ content: "Se verificó la estabilidad del enlace durante una hora." }),
    ]));

    const incomplete = await supervisor
      .post(`/api/v1/recurrences/${recurrenceId}/close`)
      .set("Origin", allowedOrigin)
      .send({ version: 4 })
      .expect(422);
    expect(errorCode(incomplete)).toBe("RECURRENCE_DOCUMENTATION_INCOMPLETE");

    const corrected = await supervisor
      .post(`/api/v1/recurrences/${recurrenceId}/correction`)
      .set("Origin", allowedOrigin)
      .send({
        version: 4,
        correctiveAction: "Rehacer y certificar la terminación.",
        preventiveAction: "Incorporar una prueba de tracción obligatoria.",
        observations: "Acciones verificadas por supervisión.",
      })
      .expect(200);
    expect(corrected.body.data).toMatchObject({ status: "CORRECTION", version: 5 });

    const evidenceRequired = await supervisor
      .post(`/api/v1/recurrences/${recurrenceId}/close`)
      .set("Origin", allowedOrigin)
      .send({ version: 5 })
      .expect(422);
    expect(errorCode(evidenceRequired)).toBe("RECURRENCE_EVIDENCE_REQUIRED");

    const beforeForeignKeys = await finalStorageKeys();
    const beforeForeignMetadata = await database.evidencia.count();
    const foreignUpload = await uploadEvidence(foreign, recurrenceId, "foreign.pdf").expect(404);
    const absentUpload = await uploadEvidence(foreign, randomUUID(), "absent.pdf").expect(404);
    expect(withoutRequestId(foreignUpload)).toEqual(withoutRequestId(absentUpload));
    expect(errorCode(foreignUpload)).toBe("RESOURCE_NOT_FOUND");
    expect(await finalStorageKeys()).toEqual(beforeForeignKeys);
    await expect(database.evidencia.count())
      .resolves.toBe(beforeForeignMetadata);

    const uploaded = await uploadEvidence(reporter, recurrenceId).expect(201);
    expect(uploaded.body.data).toMatchObject({
      resourceType: "RECURRENCE",
      resourceId: recurrenceId,
      accessLevel: "TECHNICIAN",
    });
    assertNoPrivateRecurrenceFields(uploaded.body);

    const evidenceList = await reporter
      .get(`/api/v1/recurrences/${recurrenceId}/evidences`)
      .expect(200);
    expect(evidenceList.body.data.items).toEqual([
      expect.objectContaining({ id: uploaded.body.data.id, resourceType: "RECURRENCE" }),
    ]);
    const downloaded = await reporter
      .get(`/api/v1/evidences/${uploaded.body.data.id}/download`)
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        response.on("end", () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(downloaded.body).toEqual(Buffer.from("%PDF-1.7\nrecurrence proof\n", "utf8"));

    const closed = await supervisor
      .post(`/api/v1/recurrences/${recurrenceId}/close`)
      .set("Origin", allowedOrigin)
      .send({ version: 5 })
      .expect(200);
    expect(closed.body.data).toMatchObject({ status: "CLOSED", version: 6 });
    assertNoPrivateRecurrenceFields(closed.body);

    const adjustmentAuditsBeforeRejectedField = await database.auditoria.count({
      where: { entity: "Reincidencia", entityId: recurrenceId, action: "RECURRENCE_ADJUSTED" },
    });
    const rejectedAgeOverride = await supervisor
      .post(`/api/v1/recurrences/${recurrenceId}/adjust`)
      .set("Origin", allowedOrigin)
      .send({
        version: 6,
        reason: "Attempt to modify a field outside the adjustment allowlist.",
        ageOverrideReason: "Age can only be justified while analyzing the case.",
      })
      .expect(400);
    expect(errorCode(rejectedAgeOverride)).toBe("VALIDATION_ERROR");
    await expect(database.reincidencia.findUniqueOrThrow({
      where: { id: recurrenceId },
      select: { version: true, ageOverrideReason: true },
    })).resolves.toEqual({ version: 6, ageOverrideReason: null });
    await expect(database.auditoria.count({
      where: { entity: "Reincidencia", entityId: recurrenceId, action: "RECURRENCE_ADJUSTED" },
    })).resolves.toBe(adjustmentAuditsBeforeRejectedField);

    const adjusted = await supervisor
      .post(`/api/v1/recurrences/${recurrenceId}/adjust`)
      .set("Origin", allowedOrigin)
      .send({
        version: 6,
        reason: "Ajuste validado después del cierre documental.",
        observations: "Caso confirmado por control de calidad.",
        estimatedCost: "25.50",
        costReason: "Costo final confirmado por supervisión.",
      })
      .expect(200);
    expect(adjusted.body.data).toMatchObject({
      status: "CLOSED",
      version: 7,
      observations: "Caso confirmado por control de calidad.",
      estimatedCost: "25.50",
    });
    assertNoPrivateRecurrenceFields(adjusted.body);
  });

  it("dismisses an analyzed technical-work case and keeps its post-read quality-neutral", async () => {
    const supervisor = await authenticatedAgent(users.supervisor);
    const reported = await supervisor
      .post("/api/v1/recurrences")
      .set("Origin", allowedOrigin)
      .send({
        originalOrderId: ids.originalDismiss,
        correctionOrderId: ids.correctionDismiss,
        detectedProblem: "Reporte administrativo que debe descartarse",
      })
      .expect(201);
    expect(reported.body.data).toMatchObject({ status: "OPEN", version: 1 });

    const analyzed = await supervisor
      .post(`/api/v1/recurrences/${reported.body.data.id}/analysis`)
      .set("Origin", allowedOrigin)
      .send({
        version: 1,
        causeId: ids.cause,
        impact: "MEDIUM",
        responsibility: "TECHNICAL_WORK",
        analysis: "The report was classified before supervision identified the duplicate.",
        qualityDecisions: [{
          technicianId: ids.reporterTechnician,
          affectsQuality: true,
          justification: "The preliminary classification attributed the original work.",
        }],
      })
      .expect(200);
    expect(analyzed.body.data).toMatchObject({ status: "ANALYSIS", version: 2 });

    const dismissed = await supervisor
      .post(`/api/v1/recurrences/${reported.body.data.id}/dismiss`)
      .set("Origin", allowedOrigin)
      .send({ version: 2, reason: "El reporte fue confirmado como un incidente duplicado." })
      .expect(200);
    expect(dismissed.body.data).toMatchObject({
      id: reported.body.data.id,
      status: "DISMISSED",
      version: 3,
      dismissalReason: "El reporte fue confirmado como un incidente duplicado.",
      technicians: expect.arrayContaining([
        expect.objectContaining({ affectsQuality: false, justification: null }),
      ]),
    });
    const postRead = await supervisor
      .get(`/api/v1/recurrences/${reported.body.data.id}`)
      .expect(200);
    expect(postRead.body.data).toMatchObject({
      id: reported.body.data.id,
      status: "DISMISSED",
      version: 3,
      technicians: expect.arrayContaining([
        expect.objectContaining({ affectsQuality: false, justification: null }),
      ]),
    });
    await expect(database.reincidenciaTecnico.count({
      where: { reincidenciaId: reported.body.data.id, affectsQuality: true },
    })).resolves.toBe(0);
    assertNoPrivateRecurrenceFields(dismissed.body);
    assertNoPrivateRecurrenceFields(postRead.body);
  });

  it("hides management INTERNAL evidence from technician detail and note hydration", async () => {
    await database.reincidencia.create({
      data: {
        id: ids.privacyRecurrence,
        recurrenceNumber: `RI-2997-${String(parseInt(suffix, 16) % 10_000).padStart(4, "0")}`,
        originalOrderId: ids.originalMain,
        reportedById: users.reporter.id,
        status: "OPEN",
        impact: "MEDIUM",
        responsibility: "UNDETERMINED",
        detectedProblem: "Caso de privacidad de evidencia interna",
        tecnicos: {
          create: {
            tecnicoId: ids.reporterTechnician,
            participation: "ORIGINAL_RESPONSIBLE",
          },
        },
      },
    });
    const supervisor = await authenticatedAgent(users.supervisor);
    const reporter = await authenticatedAgent(users.reporter);
    const uploaded = await uploadEvidence(
      supervisor,
      ids.privacyRecurrence,
      "management-internal.pdf",
    ).expect(201);
    expect(uploaded.body.data.accessLevel).toBe("INTERNAL");

    const managementDetail = await supervisor
      .get(`/api/v1/recurrences/${ids.privacyRecurrence}`)
      .expect(200);
    const technicianDetail = await reporter
      .get(`/api/v1/recurrences/${ids.privacyRecurrence}`)
      .expect(200);
    const technicianNote = await reporter
      .post(`/api/v1/recurrences/${ids.privacyRecurrence}/notes`)
      .set("Origin", allowedOrigin)
      .send({ content: "Nota sin exposición de evidencia interna." })
      .expect(200);

    expect(managementDetail.body.data.evidences.map(({ id }: { id: string }) => id))
      .toContain(uploaded.body.data.id);
    expect(technicianDetail.body.data.evidences.map(({ id }: { id: string }) => id))
      .not.toContain(uploaded.body.data.id);
    expect(technicianNote.body.data.evidences.map(({ id }: { id: string }) => id))
      .not.toContain(uploaded.body.data.id);
  });
});
