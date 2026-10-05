import type { PrismaClient } from "../../generated/prisma/client.js";
import { ApiError } from "../utils/api-error.js";
import type {
  AuthPrincipal,
  AuthRequestContext,
  PublicUser,
} from "./auth.types.js";

const authorizationInclude = {
  roles: {
    where: { rol: { isActive: true, deletedAt: null } },
    include: {
      rol: {
        include: {
          permissions: { include: { permiso: true } },
        },
      },
    },
  },
  tecnico: true,
} as const;

interface AuthorizationUser {
  id: string;
  email: string;
  displayName: string;
  mustChangePassword: boolean;
  tecnico: { id: string; deletedAt: Date | null } | null;
  roles: Array<{
    rol: {
      code: string;
      permissions: Array<{ permiso: { code: string } }>;
    };
  }>;
}

export interface LoginAccount extends AuthorizationUser {
  version: number;
  status: string;
  passwordHash: string | null;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
  deletedAt: Date | null;
}

export interface StoredSessionPrincipal {
  id: string;
  tokenHash: string;
  revokedAt: Date | null;
  expiresAt: Date;
  lastSeenAt: Date;
  usuario: AuthorizationUser & {
    status: string;
    deletedAt: Date | null;
  };
}

function mapPublicUser(user: AuthorizationUser): PublicUser {
  const roles = user.roles.map(({ rol }) => rol.code).sort();
  const permissions = [
    ...new Set(
      user.roles.flatMap(({ rol }) =>
        rol.permissions.map(({ permiso }) => permiso.code),
      ),
    ),
  ].sort();

  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    mustChangePassword: user.mustChangePassword,
    technicianId: user.tecnico?.deletedAt ? null : (user.tecnico?.id ?? null),
    roles,
    permissions,
  };
}

export interface AuthRepository {
  findLoginAccount(email: string): Promise<LoginAccount | null>;
  recordFailedLogin(
    account: LoginAccount,
    now: Date,
    maxAttempts: number,
    lockMinutes: number,
    context: AuthRequestContext,
  ): Promise<void>;
  completeLogin(input: {
    userId: string;
    expectedPasswordHash: string;
    expectedVersion: number;
    tokenHash: string;
    now: Date;
    expiresAt: Date;
    context: AuthRequestContext;
  }): Promise<{ sessionId: string; user: PublicUser }>;
  findSessionPrincipal(
    tokenHash: string,
  ): Promise<StoredSessionPrincipal | null>;
  touchSession(sessionId: string, now: Date): Promise<void>;
  revokeSession(
    tokenHash: string,
    now: Date,
    context: AuthRequestContext,
  ): Promise<void>;
  changePasswordAndRotateSession(input: {
    userId: string;
    sessionId: string;
    expectedPasswordHash: string;
    expectedVersion: number;
    passwordHash: string;
    tokenHash: string;
    now: Date;
    expiresAt: Date;
    context: AuthRequestContext;
  }): Promise<{ sessionId: string; user: PublicUser }>;
}

export function createAuthRepository(database: PrismaClient): AuthRepository {
  return {
    async findLoginAccount(email) {
      return database.usuario.findUnique({
        where: { email },
        include: authorizationInclude,
      });
    },

    async recordFailedLogin(
      account,
      now,
      maxAttempts,
      lockMinutes,
      context,
    ) {
      const previousLockExpired =
        account.lockedUntil && account.lockedUntil.getTime() <= now.getTime();
      const attempts = previousLockExpired
        ? 1
        : account.failedLoginAttempts + 1;
      const lockedUntil =
        attempts >= maxAttempts
          ? new Date(now.getTime() + lockMinutes * 60 * 1000)
          : null;

      await database.$transaction(async (transaction) => {
        const changed = await transaction.usuario.updateMany({
          where: { id: account.id, version: account.version, passwordHash: account.passwordHash,
            status: "ACTIVE", deletedAt: null,
          },
          data: { failedLoginAttempts: attempts, lockedUntil },
        });
        if (changed.count === 1 && lockedUntil) {
          await transaction.auditoria.create({
            data: {
              userId: account.id,
              action: "AUTH_ACCOUNT_LOCKED",
              entity: "usuario",
              entityId: account.id,
              occurredAt: now,
              ipAddress: context.ipAddress,
              userAgent: context.userAgent,
              requestId: context.requestId,
            },
          });
        }
      });
    },

    async completeLogin({ userId, expectedPasswordHash, expectedVersion, tokenHash, now, expiresAt, context }) {
      return database.$transaction(async (transaction) => {
        // La comprobación y el bloqueo de fila ocurren antes de emitir la sesión.
        const changed = await transaction.usuario.updateMany({
          where: { id: userId, status: "ACTIVE", deletedAt: null,
            passwordHash: expectedPasswordHash, version: expectedVersion,
            OR: [{ lockedUntil: null }, { lockedUntil: { lte: now } }],
          },
          data: {
            failedLoginAttempts: 0,
            lockedUntil: null,
            lastLoginAt: now,
          },
        });
        if (changed.count !== 1) throw new ApiError(401, "Credenciales inválidas o cuenta no disponible", "INVALID_CREDENTIALS");
        const user = await transaction.usuario.findUniqueOrThrow({ where: { id: userId }, include: authorizationInclude });
        const session = await transaction.sesion.create({
          data: {
            userId,
            tokenHash,
            lastSeenAt: now,
            expiresAt,
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
          },
        });
        await transaction.auditoria.create({
          data: {
            userId,
            action: "AUTH_LOGIN_SUCCEEDED",
            entity: "usuario",
            entityId: userId,
            occurredAt: now,
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
            requestId: context.requestId,
          },
        });
        return { sessionId: session.id, user: mapPublicUser(user) };
      });
    },

    async findSessionPrincipal(tokenHash) {
      return database.sesion.findUnique({
        where: { tokenHash },
        include: {
          usuario: { include: authorizationInclude },
        },
      });
    },

    async touchSession(sessionId, now) {
      await database.sesion.update({
        where: { id: sessionId },
        data: { lastSeenAt: now },
      });
    },

    async revokeSession(tokenHash, now, context) {
      await database.$transaction(async (transaction) => {
        const session = await transaction.sesion.findUnique({
          where: { tokenHash },
          select: { id: true, userId: true, revokedAt: true },
        });
        if (!session || session.revokedAt) return;

        await transaction.sesion.update({
          where: { id: session.id },
          data: { revokedAt: now },
        });
        await transaction.auditoria.create({
          data: {
            userId: session.userId,
            action: "AUTH_LOGOUT",
            entity: "usuario",
            entityId: session.userId,
            occurredAt: now,
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
            requestId: context.requestId,
          },
        });
      });
    },

    async changePasswordAndRotateSession({
      userId,
      sessionId,
      expectedPasswordHash,
      expectedVersion,
      passwordHash,
      tokenHash,
      now,
      expiresAt,
      context,
    }) {
      return database.$transaction(async (transaction) => {
        const changed = await transaction.usuario.updateMany({
          where: { id: userId, status: "ACTIVE", deletedAt: null, passwordHash: expectedPasswordHash, version: expectedVersion },
          data: {
            passwordHash,
            passwordChangedAt: now,
            mustChangePassword: false,
            failedLoginAttempts: 0,
            lockedUntil: null,
            version: { increment: 1 },
          },
        });
        if (changed.count !== 1) throw new ApiError(401, "Credenciales inválidas o cuenta no disponible", "INVALID_CREDENTIALS");
        const currentSession = await transaction.sesion.findFirst({ where: { id: sessionId, userId, revokedAt: null, expiresAt: { gt: now } }, select: { id: true } });
        if (!currentSession) throw new ApiError(401, "La sesión ya no está disponible. Inicia sesión nuevamente", "INVALID_CREDENTIALS");
        const user = await transaction.usuario.findUniqueOrThrow({ where: { id: userId }, include: authorizationInclude });
        await transaction.sesion.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: now },
        });
        const session = await transaction.sesion.create({
          data: {
            userId,
            tokenHash,
            lastSeenAt: now,
            expiresAt,
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
          },
        });
        await transaction.auditoria.create({
          data: {
            userId,
            action: "AUTH_PASSWORD_CHANGED",
            entity: "usuario",
            entityId: userId,
            occurredAt: now,
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
            requestId: context.requestId,
          },
        });
        return { sessionId: session.id, user: mapPublicUser(user) };
      });
    },
  };
}

export function mapStoredPrincipal(
  session: StoredSessionPrincipal,
): AuthPrincipal {
  const user = mapPublicUser(session.usuario);
  return {
    ...user,
    userId: user.id,
    sessionId: session.id,
  };
}
