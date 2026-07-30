import type { RequestHandler } from "express";
import type { AuthService } from "../auth/auth.service.js";
import { ApiError } from "../utils/api-error.js";

export const sessionCookieName = "gs_session";

export function readSessionCookie(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const name = part.slice(0, separator).trim();
    if (name !== sessionCookieName) continue;
    const value = part.slice(separator + 1).trim();
    try {
      return value ? decodeURIComponent(value) : null;
    } catch {
      return null;
    }
  }
  return null;
}

export function createAuthenticationMiddleware(
  authService: AuthService,
): RequestHandler {
  return async (request, _response, next) => {
    try {
      const rawToken = readSessionCookie(request.header("cookie"));
      const principal = rawToken
        ? await authService.authenticate(rawToken)
        : null;
      if (!principal) {
        next(
          new ApiError(
            401,
            "Debe iniciar sesión para continuar",
            "AUTHENTICATION_REQUIRED",
          ),
        );
        return;
      }
      request.auth = principal;
      next();
    } catch (error) {
      next(error);
    }
  };
}
