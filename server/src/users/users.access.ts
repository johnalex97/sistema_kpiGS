import type { Prisma } from "../../generated/prisma/client.js";
import type { AuthRequestContext } from "../auth/auth.types.js";
import { ApiError } from "../utils/api-error.js";

export type UserAccessChange =
  | { action: "status"; status: "ACTIVE" | "INACTIVE"; version: number }
  | { action: "unlock"; version: number }
  | { action: "reset-password"; passwordHash: string; version: number };

export async function changeUserAccess(
  tx: Prisma.TransactionClient,
  userId: string,
  input: UserAccessChange,
  actor: AuthRequestContext & { userId: string },
): Promise<void> {
  const activeAdmin = { code: "ADMIN", isActive: true, deletedAt: null } as const;
  const administrator = await tx.usuario.findFirst({ where: {
    id: actor.userId, status: "ACTIVE", deletedAt: null, mustChangePassword: false,
    roles: { some: { rol: activeAdmin } },
  }, select: { id: true } });
  if (!administrator) throw new ApiError(403, "Solo un administrador puede gestionar accesos", "FORBIDDEN");
  const user = await tx.usuario.findUnique({ where: { id: userId }, include: { roles: { include: { rol: true } } } });
  if (!user || user.deletedAt !== null) throw new ApiError(404, "Usuario no encontrado", "USER_NOT_FOUND");
  if (user.version !== input.version) throw new ApiError(409, "La cuenta cambió. Actualiza el listado antes de continuar", "USER_VERSION_CONFLICT");
  if (input.action === "status" && input.status === "INACTIVE" && user.status === "ACTIVE" && user.passwordHash !== null &&
    user.roles.some(item => item.rol.code === "ADMIN" && item.rol.isActive && item.rol.deletedAt === null)) {
    const count = await tx.usuario.count({ where: {
      status: "ACTIVE", deletedAt: null, passwordHash: { not: null }, roles: { some: { rol: activeAdmin } },
    } });
    if (count <= 1) throw new ApiError(409, "Debe permanecer al menos un administrador activo", "LAST_ACTIVE_ADMIN");
  }
  if (userId === actor.userId) throw new ApiError(409, "Otro administrador debe gestionar el acceso de tu cuenta. Para cambiar tu contraseña, utiliza Mi cuenta", "SELF_ACCESS_CHANGE_FORBIDDEN");
  if (input.action === "status" && input.status === "ACTIVE" && user.passwordHash === null) {
    throw new ApiError(409, "Restablece una contraseña antes de activar esta cuenta", "USER_PASSWORD_REQUIRED");
  }

  const now = new Date();
  const patch: Prisma.UsuarioUpdateManyMutationInput = { version: { increment: 1 } };
  let action: string;
  let beforeData: Prisma.InputJsonObject;
  let afterData: Prisma.InputJsonObject;
  if (input.action === "status") {
    patch.status = input.status;
    action = "USER_STATUS_CHANGED";
    beforeData = { status: user.status, version: user.version };
    afterData = { status: input.status, version: user.version + 1 };
  } else if (input.action === "unlock") {
    patch.failedLoginAttempts = 0;
    patch.lockedUntil = null;
    action = "USER_UNLOCKED";
    beforeData = { failedLoginAttempts: user.failedLoginAttempts, lockedUntil: user.lockedUntil?.toISOString() ?? null, version: user.version };
    afterData = { failedLoginAttempts: 0, lockedUntil: null, version: user.version + 1 };
  } else {
    patch.passwordHash = input.passwordHash;
    patch.passwordChangedAt = now;
    patch.mustChangePassword = true;
    action = "USER_PASSWORD_RESET";
    beforeData = { mustChangePassword: user.mustChangePassword, version: user.version };
    afterData = { mustChangePassword: true, version: user.version + 1 };
  }
  const changed = await tx.usuario.updateMany({ where: { id: userId, version: input.version, deletedAt: null }, data: patch });
  if (changed.count !== 1) throw new ApiError(409, "La cuenta cambió. Actualiza el listado antes de continuar", "USER_VERSION_CONFLICT");
  if (input.action !== "unlock") {
    await tx.sesion.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } });
  }
  await tx.auditoria.create({ data: {
    userId: actor.userId, action, entity: "usuario", entityId: userId,
    requestId: actor.requestId, ipAddress: actor.ipAddress, userAgent: actor.userAgent,
    beforeData, afterData,
  } });
}
