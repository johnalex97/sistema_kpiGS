import type { NextFunction, Request, Response } from "express";
import type { Logger } from "pino";
import { ApiError } from "../utils/api-error.js";

interface BodyParserError extends Error {
  status?: number;
  type?: string;
}

export function createErrorHandler(logger: Logger) {
  return (
    error: unknown,
    req: Request,
    res: Response,
    _next: NextFunction,
  ) => {
    const parserError = error as BodyParserError;
    let apiError: ApiError;

    if (error instanceof ApiError) {
      apiError = error;
    } else if (parserError.type === "entity.parse.failed") {
      apiError = new ApiError(
        400,
        "El JSON enviado no es válido",
        "INVALID_JSON",
      );
    } else if (parserError.type === "entity.too.large") {
      apiError = new ApiError(
        413,
        "El cuerpo de la solicitud excede el límite permitido",
        "PAYLOAD_TOO_LARGE",
      );
    } else if ((error as { code?: string }).code === "CORS_ORIGIN_DENIED") {
      apiError = new ApiError(403, "Origen no permitido", "CORS_ORIGIN_DENIED");
    } else {
      logger.error(
        { err: error, requestId: req.requestId },
        "Unhandled request error",
      );
      apiError = new ApiError(
        500,
        "Ocurrió un error interno",
        "INTERNAL_ERROR",
      );
    }

    const errors =
      apiError.errors.length > 0
        ? apiError.errors
        : [{ code: apiError.code, message: apiError.message }];

    res.status(apiError.statusCode).json({
      success: false,
      message: apiError.message,
      data: null,
      errors,
      meta: { requestId: req.requestId },
    });
  };
}
