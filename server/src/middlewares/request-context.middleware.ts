import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function requestContext(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const supplied = req.header("x-request-id");
  req.requestId = supplied && uuidPattern.test(supplied) ? supplied : randomUUID();
  res.setHeader("x-request-id", req.requestId);
  next();
}
