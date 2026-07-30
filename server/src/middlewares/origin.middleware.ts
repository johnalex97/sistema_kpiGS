import type { RequestHandler } from "express";
import { ApiError } from "../utils/api-error.js";

export function requireAllowedOrigin(
  allowedOrigins: readonly string[],
): RequestHandler {
  return (request, _response, next) => {
    const origin = request.header("origin");
    if (!origin) {
      next(
        new ApiError(
          403,
          "La solicitud debe incluir un origen",
          "ORIGIN_REQUIRED",
        ),
      );
      return;
    }
    if (!allowedOrigins.includes(origin)) {
      next(
        new ApiError(
          403,
          "El origen de la solicitud no está permitido",
          "ORIGIN_NOT_ALLOWED",
        ),
      );
      return;
    }
    next();
  };
}
