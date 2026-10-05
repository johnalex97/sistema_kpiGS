import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { Prisma, type PrismaClient } from "../../generated/prisma/client.js";
import type { AuthService } from "../auth/auth.service.js";
import { hashPassword, validatePassword } from "../auth/password.js";
import type { Environment } from "../config/env.js";
import { createAuthenticationMiddleware } from "../middlewares/authentication.middleware.js";
import { requireAllowedOrigin } from "../middlewares/origin.middleware.js";
import { requirePasswordChanged, requirePermission } from "../middlewares/permission.middleware.js";
import { ApiError } from "../utils/api-error.js";

const createSchema = z.object({
  displayName: z.string().trim().min(2).max(160),
  email: z.string().trim().toLowerCase().email().max(254),
  temporaryPassword: z.string().max(128).superRefine((password, context) => {
    if (!validatePassword(password).valid) {
      context.addIssue({ code: "custom", message: "Usa al menos 12 caracteres con mayúsculas, minúsculas, números y símbolos" });
    }
  }),
}).strict();

const querySchema = z.object({
  search: z.string().trim().max(160).default(""),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
}).strict();

const userSelect = {
  id: true, email: true, displayName: true, status: true,
  mustChangePassword: true, createdAt: true,
  roles: { select: { rol: { select: { code: true } } } },
  tecnico: { select: { id: true, fullName: true } },
} satisfies Prisma.UsuarioSelect;

function publicUser(user: Prisma.UsuarioGetPayload<{ select: typeof userSelect }>) {
  return { ...user, roles: user.roles.map(item => item.rol.code).sort() };
}

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ApiError(400, "Revisa los datos del usuario", "VALIDATION_ERROR",
      result.error.issues.map(issue => ({ field: issue.path.join("."), code: "VALIDATION_ERROR", message: issue.message })));
  }
  return result.data;
}

function respond(req: Request, res: Response, status: number, message: string, data: unknown) {
  res.status(status).json({ success: true, message, data, errors: [], meta: { requestId: req.requestId } });
}

export function createUsersRouter(env: Environment, database: PrismaClient, authService: AuthService) {
  const router = Router();
  const security = [createAuthenticationMiddleware(authService), requirePasswordChanged, requirePermission("USERS_MANAGE")];

  router.get("/", ...security, async (req, res, next) => {
    try {
      const { search, page, pageSize } = parse(querySchema, req.query);
      const where: Prisma.UsuarioWhereInput = {
        deletedAt: null,
        ...(search ? { OR: [
          { email: { contains: search, mode: "insensitive" } },
          { displayName: { contains: search, mode: "insensitive" } },
        ] } : {}),
      };
      const [users, totalItems] = await database.$transaction([
        database.usuario.findMany({ where, select: userSelect, skip: (page - 1) * pageSize, take: pageSize,
          orderBy: [{ createdAt: "desc" }, { id: "asc" }] }),
        database.usuario.count({ where }),
      ]);
      respond(req, res, 200, "Usuarios consultados", {
        items: users.map(publicUser),
        pagination: { page, pageSize, totalItems, totalPages: Math.ceil(totalItems / pageSize) },
      });
    } catch (error) { next(error); }
  });

  router.post("/", requireAllowedOrigin(env.CORS_ORIGINS), ...security, async (req, res, next) => {
    try {
      const input = parse(createSchema, req.body);
      const passwordHash = await hashPassword(input.temporaryPassword);
      const user = await database.$transaction(async tx => {
        const role = await tx.rol.findUnique({ where: { code: "TECHNICIAN" } });
        if (!role?.isActive || role.deletedAt !== null) {
          throw new ApiError(409, "El rol Técnico no está disponible; revisa los catálogos del sistema", "TECHNICIAN_ROLE_UNAVAILABLE");
        }
        const created = await tx.usuario.create({
          data: { email: input.email, displayName: input.displayName, passwordHash,
            status: "ACTIVE", mustChangePassword: true, roles: { create: { rolId: role.id } } },
          select: userSelect,
        });
        await tx.auditoria.create({ data: {
          userId: req.auth!.userId, action: "USER_CREATED", entity: "usuario", entityId: created.id,
          requestId: req.requestId, ipAddress: req.ip || null, userAgent: req.header("user-agent")?.slice(0, 500) ?? null,
          afterData: { email: created.email, displayName: created.displayName, role: "TECHNICIAN", mustChangePassword: true },
        } });
        return created;
      });
      respond(req, res, 201, "Cuenta de técnico creada", publicUser(user));
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        next(new ApiError(409, "Ya existe una cuenta con ese correo", "USER_EMAIL_EXISTS"));
      } else { next(error); }
    }
  });
  return router;
}
