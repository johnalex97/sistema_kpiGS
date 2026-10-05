import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { Prisma, type PrismaClient } from "../../generated/prisma/client.js";
import type { AuthService } from "../auth/auth.service.js";
import type { Environment } from "../config/env.js";
import { createAuthenticationMiddleware } from "../middlewares/authentication.middleware.js";
import { requireAllowedOrigin } from "../middlewares/origin.middleware.js";
import { requirePasswordChanged, requirePermission } from "../middlewares/permission.middleware.js";
import { ApiError } from "../utils/api-error.js";
import { catalogEntities, catalogModel, catalogSnapshot, type CatalogKind } from "./catalogs.repository.js";

const kindSchema = z.enum(["services", "activities", "recurrence-causes"]);
const idSchema = z.string().uuid();
const querySchema = z.object({ search: z.string().trim().max(160).default(""), page: z.coerce.number().int().min(1).max(100000).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20) }).strict();
function fields(kind: CatalogKind) {
  return z.object({ name: z.string().trim().min(1).max(kind === "recurrence-causes" ? 160 : 120),
    description: z.string().trim().max(500).nullable(), displayOrder: z.number().int().min(0).max(100000), isActive: z.boolean() });
}
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new ApiError(400, "Revisa los datos del catálogo", "VALIDATION_ERROR", result.error.issues.map(issue => ({ field: issue.path.join("."), code: "VALIDATION_ERROR", message: issue.message })));
  return result.data;
}
function respond(req: Request, res: Response, status: number, message: string, data: unknown) {
  res.status(status).json({ success: true, message, data, errors: [], meta: { requestId: req.requestId } });
}
async function requireLiveAdministrator(tx: Prisma.TransactionClient, userId: string) {
  const admin = await tx.usuario.findFirst({ where: { id: userId, status: "ACTIVE", deletedAt: null,
    roles: { some: { rol: { code: "ADMIN", isActive: true, deletedAt: null } } } }, select: { id: true } });
  if (!admin) throw new ApiError(403, "Solo un administrador puede gestionar catálogos", "FORBIDDEN");
}
async function writeCatalog<T>(database: PrismaClient, operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try { return await database.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); }
    catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ApiError(409, "Ya existe una opción con ese código", "CATALOG_CODE_EXISTS");
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
        if (attempt < 3) continue;
        throw new ApiError(409, "El catálogo cambió. Actualiza el listado y vuelve a editar", "CATALOG_VERSION_CONFLICT");
      }
      throw error;
    }
  }
}
export function createCatalogsRouter(env: Environment, database: PrismaClient, authService: AuthService) {
  const router = Router();
  router.use(createAuthenticationMiddleware(authService), requirePasswordChanged, requirePermission("USERS_MANAGE"), (req, _res, next) => {
    if (!req.auth?.roles.includes("ADMIN")) return next(new ApiError(403, "Solo un administrador puede gestionar catálogos", "FORBIDDEN"));
    next();
  });
  router.get("/:kind", async (req, res, next) => {
    try {
      const kind = parse(kindSchema, req.params.kind);
      const { search, page, pageSize } = parse(querySchema, req.query);
      const where = { deletedAt: null, ...(search ? { OR: [{ name: { contains: search, mode: "insensitive" as const } }, { code: { contains: search, mode: "insensitive" as const } }] } : {}) };
      const data = await database.$transaction(async tx => {
        const model = catalogModel(tx, kind);
        const items = await model.findMany({ where, skip: (page - 1) * pageSize, take: pageSize, orderBy: [{ displayOrder: "asc" }, { name: "asc" }, { id: "asc" }] });
        const totalItems = await model.count({ where });
        return { items, pagination: { page, pageSize, totalItems, totalPages: Math.ceil(totalItems / pageSize) } };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
      respond(req, res, 200, "Catálogo consultado", data);
    } catch (error) { next(error); }
  });
  router.get("/:kind/:id/history", async (req, res, next) => {
    try {
      const kind = parse(kindSchema, req.params.kind);
      const id = parse(idSchema, req.params.id);
      const { page, pageSize } = parse(querySchema, req.query);
      const data = await database.$transaction(async tx => {
        const item = await catalogModel(tx, kind).findFirst({ where: { id, deletedAt: null } });
        if (!item) throw new ApiError(404, "La opción no existe", "CATALOG_NOT_FOUND");
        const where = { entity: catalogEntities[kind], entityId: id, action: { in: ["CATALOG_CREATED", "CATALOG_UPDATED"] } };
        const items = await tx.auditoria.findMany({ where, skip: (page - 1) * pageSize, take: pageSize,
          select: { id: true, action: true, occurredAt: true, beforeData: true, afterData: true, usuario: { select: { id: true, displayName: true } } }, orderBy: [{ occurredAt: "desc" }, { id: "desc" }] });
        const totalItems = await tx.auditoria.count({ where });
        return { items: items.map(({ usuario, ...entry }) => ({ ...entry, actor: usuario })), pagination: { page, pageSize, totalItems, totalPages: Math.ceil(totalItems / pageSize) } };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
      respond(req, res, 200, "Historial consultado", data);
    } catch (error) { next(error); }
  });
  router.post("/:kind", requireAllowedOrigin(env.CORS_ORIGINS), async (req, res, next) => {
    try {
      const kind = parse(kindSchema, req.params.kind);
      const input = parse(fields(kind).extend({ code: z.string().trim().toUpperCase().min(1).max(50).regex(/^[A-Z][A-Z0-9_-]*$/), description: fields(kind).shape.description.default(null), displayOrder: fields(kind).shape.displayOrder.default(0), isActive: z.boolean().default(true) }).strict(), req.body);
      const item = await writeCatalog(database, async tx => {
        await requireLiveAdministrator(tx, req.auth!.userId);
        const created = await catalogModel(tx, kind).create({ data: input });
        await tx.auditoria.create({ data: { userId: req.auth!.userId, action: "CATALOG_CREATED", entity: catalogEntities[kind], entityId: created.id,
          requestId: req.requestId, afterData: catalogSnapshot(created) } });
        return created;
      });
      respond(req, res, 201, "Opción creada", item);
    } catch (error) { next(error); }
  });
  router.patch("/:kind/:id", requireAllowedOrigin(env.CORS_ORIGINS), async (req, res, next) => {
    try {
      const kind = parse(kindSchema, req.params.kind);
      const id = parse(idSchema, req.params.id);
      const input = parse(fields(kind).partial().extend({ updatedAt: z.string().datetime({ offset: true }) }).strict().refine(value => Object.keys(value).length > 1, "Indica un cambio"), req.body);
      const item = await writeCatalog(database, async tx => {
        await requireLiveAdministrator(tx, req.auth!.userId);
        const model = catalogModel(tx, kind);
        const before = await model.findFirst({ where: { id, deletedAt: null } });
        if (!before) throw new ApiError(404, "La opción no existe", "CATALOG_NOT_FOUND");
        const { updatedAt, ...changes } = input;
        const data = { ...(changes.name !== undefined && { name: changes.name }), ...(changes.description !== undefined && { description: changes.description }),
          ...(changes.isActive !== undefined && { isActive: changes.isActive }), ...(changes.displayOrder !== undefined && { displayOrder: changes.displayOrder }),
          updatedAt: new Date(Math.max(Date.now(), before.updatedAt.getTime() + 1)) };
        const result = await model.updateMany({ where: { id, deletedAt: null, updatedAt: new Date(updatedAt) }, data });
        if (result.count !== 1) throw new ApiError(409, "La opción cambió. Actualiza el listado y vuelve a editar", "CATALOG_VERSION_CONFLICT");
        const after = await model.findFirst({ where: { id } });
        if (!after) throw new Error("No se encontró la opción actualizada");
        await tx.auditoria.create({ data: { userId: req.auth!.userId, action: "CATALOG_UPDATED", entity: catalogEntities[kind], entityId: id,
          requestId: req.requestId, beforeData: catalogSnapshot(before), afterData: catalogSnapshot(after) } });
        return after;
      });
      respond(req, res, 200, "Opción actualizada", item);
    } catch (error) { next(error); }
  });
  return router;
}
