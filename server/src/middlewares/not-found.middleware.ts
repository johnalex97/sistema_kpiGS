import type { NextFunction, Request, Response } from "express";
import { ApiError } from "../utils/api-error.js";

export function notFoundHandler(
  _req: Request,
  _res: Response,
  next: NextFunction,
) {
  next(
    new ApiError(
      404,
      "Recurso no encontrado",
      "RESOURCE_NOT_FOUND",
      [
        {
          code: "RESOURCE_NOT_FOUND",
          message: "La ruta solicitada no existe",
        },
      ],
    ),
  );
}
