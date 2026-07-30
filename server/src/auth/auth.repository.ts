import type { PrismaClient } from "../../generated/prisma/client.js";
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
        await transaction.usuario.update({
          where: { id: account.id },
          data: { failedLoginAttempts: attempts, lockedUntil },
        });
        if (lockedUntil) {
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

    async completeLogin({ userId, tokenHash, now, expiresAt, context }) {
      return database.$transaction(async (transaction) => {
        const user = await transaction.usuario.update({
          where: { id: userId },
          data: {
            failedLoginAttempts: 0,
            lockedUntil: null,
            lastLoginAt: now,
          },
          include: authorizationInclude,
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
      passwordHash,
      tokenHash,
      now,
      expiresAt,
      context,
    }) {
      return database.$transaction(async (transaction) => {
        const user = await transaction.usuario.update({
          where: { id: userId },
          data: {
            passwordHash,
            passwordChangedAt: now,
            mustChangePassword: false,
            failedLoginAttempts: 0,
            lockedUntil: null,
          },
          include: authorizationInclude,
        });
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
