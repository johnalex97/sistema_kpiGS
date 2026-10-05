import type { Prisma } from "../../generated/prisma/client.js";
import type { AuthRequestContext } from "../auth/auth.types.js";
import { ApiError } from "../utils/api-error.js";

export async function changeUserRole(
  tx: Prisma.TransactionClient,
  userId: string,
  input: { role: "ADMIN" | "SUPERVISOR" | "TECHNICIAN"; version: number },
  actor: AuthRequestContext & { userId: string },
): Promise<void> {
  const activeAdmin = { code: "ADMIN", isActive: true, deletedAt: null } as const;
  const administrator = await tx.usuario.findFirst({ where: {
    id: actor.userId, status: "ACTIVE", deletedAt: null,
    roles: { some: { rol: activeAdmin } },
  }, select: { id: true } });
  if (!administrator) throw new ApiError(403, "Solo un administrador puede cambiar roles", "FORBIDDEN");

  const user = await tx.usuario.findUnique({ where: { id: userId }, include: { roles: { include: { rol: true } } } });
  if (!user || user.deletedAt !== null) throw new ApiError(404, "Usuario no encontrado", "USER_NOT_FOUND");
  if (user.version !== input.version) throw new ApiError(409, "La cuenta cambió. Actualiza el listado antes de cambiar su rol", "USER_VERSION_CONFLICT");
  const role = await tx.rol.findUnique({ where: { code: input.role } });
  if (!role?.isActive || role.deletedAt !== null) throw new ApiError(409, "El rol seleccionado no está disponible", "ROLE_UNAVAILABLE");
  const previousRoles = user.roles.map(item => item.rol.code).sort();
  if (previousRoles.length === 1 && previousRoles[0] === input.role) return;

  if (previousRoles.includes("ADMIN") && input.role !== "ADMIN" && user.status === "ACTIVE" && user.passwordHash !== null) {
    const administrators = await tx.usuario.count({ where: {
      status: "ACTIVE", deletedAt: null, passwordHash: { not: null }, roles: { some: { rol: activeAdmin } },
    } });
    if (administrators <= 1) throw new ApiError(409, "Debe permanecer al menos un administrador activo", "LAST_ACTIVE_ADMIN");
  }
  if (userId === actor.userId) throw new ApiError(409, "Otro administrador debe cambiar el rol de tu cuenta", "SELF_ROLE_CHANGE_FORBIDDEN");

  // Reemplaza las asignaciones de rol, conservando la cuenta y su perfil laboral.
  await tx.usuarioRol.deleteMany({ where: { usuarioId: userId } });
  await tx.usuarioRol.create({ data: { usuarioId: userId, rolId: role.id } });
  await tx.usuario.update({ where: { id: userId }, data: { version: { increment: 1 } } });
  const now = new Date();
  await tx.sesion.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } });
  await tx.auditoria.create({ data: {
    userId: actor.userId, action: "USER_ROLE_CHANGED", entity: "usuario", entityId: userId,
    requestId: actor.requestId, ipAddress: actor.ipAddress, userAgent: actor.userAgent,
    beforeData: { roles: previousRoles, version: user.version },
    afterData: { roles: [input.role], version: user.version + 1 },
  } });
}
