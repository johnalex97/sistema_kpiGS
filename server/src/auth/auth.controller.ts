import type {
  CookieOptions,
  NextFunction,
  Request,
  Response,
} from "express";
import type { ZodError } from "zod";
import type { Environment } from "../config/env.js";
import type { ApiResponse } from "../types/api.js";
import { ApiError } from "../utils/api-error.js";
import {
  readSessionCookie,
  sessionCookieName,
} from "../middlewares/authentication.middleware.js";
import {
  changePasswordSchema,
  loginSchema,
} from "./auth.schemas.js";
import type { AuthService } from "./auth.service.js";
import type {
  AuthRequestContext,
  PublicUser,
} from "./auth.types.js";

interface AuthResponseData {
  user: PublicUser;
}

export function authCookieOptions(env: Environment): CookieOptions {
  return {
    httpOnly: true,
    secure: env.AUTH_COOKIE_SECURE,
    sameSite: "lax",
    path: "/",
  };
}

function requestContext(request: Request): AuthRequestContext {
  const userAgent = request.header("user-agent");
  return {
    ipAddress: request.ip || null,
    userAgent: userAgent ? userAgent.slice(0, 500) : null,
    requestId: request.requestId,
  };
}

function validationError(error: ZodError): ApiError {
  return new ApiError(
    400,
    "Los datos enviados no son válidos",
    "VALIDATION_ERROR",
    error.issues.map((issue) => ({
      field: issue.path.join("."),
      code: "VALIDATION_ERROR",
      message: issue.message,
    })),
  );
}

export function createAuthController(
  env: Environment,
  authService: AuthService,
) {
  return {
    login: async (
      request: Request,
      response: Response<ApiResponse<AuthResponseData>>,
      next: NextFunction,
    ) => {
      const parsed = loginSchema.safeParse(request.body);
      if (!parsed.success) {
        next(validationError(parsed.error));
        return;
      }

      try {
        const result = await authService.login(
          parsed.data,
          requestContext(request),
        );
        response.setHeader("Cache-Control", "no-store");
        response.cookie(
          sessionCookieName,
          result.rawToken,
          authCookieOptions(env),
        );
        response.status(200).json({
          success: true,
          message: "Sesión iniciada correctamente",
          data: { user: result.user },
          errors: [],
          meta: { requestId: request.requestId },
        });
      } catch (error) {
        next(error);
      }
    },

    me: (
      request: Request,
      response: Response<ApiResponse<AuthResponseData>>,
    ) => {
      const principal = request.auth!;
      response.setHeader("Cache-Control", "no-store");
      response.status(200).json({
        success: true,
        message: "Sesión activa",
        data: {
          user: {
            id: principal.id,
            email: principal.email,
            displayName: principal.displayName,
            mustChangePassword: principal.mustChangePassword,
            technicianId: principal.technicianId,
            roles: principal.roles,
            permissions: principal.permissions,
          },
        },
        errors: [],
        meta: { requestId: request.requestId },
      });
    },

    changePassword: async (
      request: Request,
      response: Response<ApiResponse<AuthResponseData>>,
      next: NextFunction,
    ) => {
      const parsed = changePasswordSchema.safeParse(request.body);
      if (!parsed.success) {
        next(validationError(parsed.error));
        return;
      }

      try {
        const result = await authService.changePassword(
          request.auth!,
          parsed.data,
          requestContext(request),
        );
        response.setHeader("Cache-Control", "no-store");
        response.cookie(
          sessionCookieName,
          result.rawToken,
          authCookieOptions(env),
        );
        response.status(200).json({
          success: true,
          message: "Contraseña actualizada correctamente",
          data: { user: result.user },
          errors: [],
          meta: { requestId: request.requestId },
        });
      } catch (error) {
        next(error);
      }
    },

    logout: async (
      request: Request,
      response: Response,
      next: NextFunction,
    ) => {
      try {
        const rawToken = readSessionCookie(request.header("cookie"));
        await authService.logout(rawToken, requestContext(request));
        response.setHeader("Cache-Control", "no-store");
        response.cookie(sessionCookieName, "", {
          ...authCookieOptions(env),
          maxAge: 0,
        });
        response.status(204).end();
      } catch (error) {
        next(error);
      }
    },
  };
}
