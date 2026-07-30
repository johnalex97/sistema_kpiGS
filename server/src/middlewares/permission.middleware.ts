import type { RequestHandler } from "express";
import { ApiError } from "../utils/api-error.js";

export const requirePasswordChanged: RequestHandler = (
  request,
  _response,
  next,
) => {
  if (!request.auth || request.auth.mustChangePassword) {
    next(
      new ApiError(
        403,
        "Debe cambiar la contraseña provisional para continuar",
        "PASSWORD_CHANGE_REQUIRED",
      ),
    );
    return;
  }
  next();
};

export function requirePermission(code: string): RequestHandler {
  return (request, _response, next) => {
    if (!request.auth?.permissions.includes(code)) {
      next(
        new ApiError(
          403,
          "No tiene permiso para realizar esta acción",
          "FORBIDDEN",
        ),
      );
      return;
    }
    next();
  };
}
