import { ApiError } from "../utils/api-error.js";
import {
  createSessionToken,
  hashSessionToken,
  isSessionUsable,
  shouldTouchSession,
} from "./session-token.js";
import {
  hashPassword,
  validatePassword,
  verifyPassword,
} from "./password.js";
import {
  mapStoredPrincipal,
  type AuthRepository,
} from "./auth.repository.js";
import type {
  AuthConfig,
  AuthPrincipal,
  AuthRequestContext,
  ChangePasswordInput,
  LoginInput,
  PublicUser,
} from "./auth.types.js";

const dummyPasswordHash =
  "scrypt$v1$131072$8$1$oWVH7IAuZJnKvfXNLPXHxQ==$uTfs7ai01RXygGsOi49E5nIKRxg2WNwCiKNqRlLF/sSe/RPWcVxkBf9et2uGBrVyaKWjbu//JXZ1Y5oO6U4DKg==";

export interface AuthService {
  login(
    input: LoginInput,
    context: AuthRequestContext,
  ): Promise<{ user: PublicUser; rawToken: string }>;
  authenticate(rawToken: string): Promise<AuthPrincipal | null>;
  logout(
    rawToken: string | null,
    context: AuthRequestContext,
  ): Promise<void>;
  changePassword(
    principal: AuthPrincipal,
    input: ChangePasswordInput,
    context: AuthRequestContext,
  ): Promise<{ user: PublicUser; rawToken: string }>;
}

interface AuthServiceDependencies {
  repository: AuthRepository;
  now: () => Date;
  config: AuthConfig;
}

function invalidCredentials(): ApiError {
  return new ApiError(
    401,
    "Credenciales inválidas o cuenta no disponible",
    "INVALID_CREDENTIALS",
  );
}

export function createAuthService({
  repository,
  now,
  config,
}: AuthServiceDependencies): AuthService {
  return {
    async login(input, context) {
      const currentTime = now();
      const email = input.email.trim().toLowerCase();
      const account = await repository.findLoginAccount(email);
      const available =
        account?.status === "ACTIVE" &&
        account.deletedAt === null &&
        account.passwordHash !== null &&
        (!account.lockedUntil ||
          account.lockedUntil.getTime() <= currentTime.getTime());
      const passwordMatches = await verifyPassword(
        input.password,
        available && account?.passwordHash
          ? account.passwordHash
          : dummyPasswordHash,
      );

      if (!available || !account || !passwordMatches) {
        if (
          account &&
          account.status === "ACTIVE" &&
          account.deletedAt === null &&
          account.passwordHash &&
          (!account.lockedUntil ||
            account.lockedUntil.getTime() <= currentTime.getTime())
        ) {
          await repository.recordFailedLogin(
            account,
            currentTime,
            config.maxFailedAttempts,
            config.lockMinutes,
            context,
          );
        }
        throw invalidCredentials();
      }

      const token = createSessionToken();
      const result = await repository.completeLogin({
        userId: account.id,
        tokenHash: token.tokenHash,
        now: currentTime,
        expiresAt: new Date(
          currentTime.getTime() + config.sessionTtlMinutes * 60 * 1000,
        ),
        context,
      });
      return { user: result.user, rawToken: token.rawToken };
    },

    async authenticate(rawToken) {
      const currentTime = now();
      const session = await repository.findSessionPrincipal(
        hashSessionToken(rawToken),
      );
      if (
        !session ||
        session.usuario.status !== "ACTIVE" ||
        session.usuario.deletedAt !== null ||
        !isSessionUsable(session, currentTime, config.sessionIdleMinutes)
      ) {
        return null;
      }
      if (shouldTouchSession(session.lastSeenAt, currentTime)) {
        await repository.touchSession(session.id, currentTime);
      }
      return mapStoredPrincipal(session);
    },

    async logout(rawToken, context) {
      if (!rawToken) return;
      await repository.revokeSession(
        hashSessionToken(rawToken),
        now(),
        context,
      );
    },

    async changePassword(principal, input, context) {
      const account = await repository.findLoginAccount(principal.email);
      if (
        !account?.passwordHash ||
        !(await verifyPassword(input.currentPassword, account.passwordHash))
      ) {
        throw invalidCredentials();
      }
      if (await verifyPassword(input.newPassword, account.passwordHash)) {
        throw new ApiError(
          400,
          "La contraseña nueva debe ser diferente",
          "VALIDATION_ERROR",
        );
      }
      const validation = validatePassword(input.newPassword);
      if (!validation.valid) {
        throw new ApiError(
          400,
          "La contraseña nueva no cumple la política",
          "VALIDATION_ERROR",
          [{ code: validation.code, message: validation.code }],
        );
      }

      const currentTime = now();
      const passwordHash = await hashPassword(input.newPassword);
      const token = createSessionToken();
      const result = await repository.changePasswordAndRotateSession({
        userId: principal.userId,
        passwordHash,
        tokenHash: token.tokenHash,
        now: currentTime,
        expiresAt: new Date(
          currentTime.getTime() + config.sessionTtlMinutes * 60 * 1000,
        ),
        context,
      });
      return { user: result.user, rawToken: token.rawToken };
    },
  };
}
