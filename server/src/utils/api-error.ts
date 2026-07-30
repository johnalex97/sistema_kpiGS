import type { ApiErrorDetail } from "../types/api.js";

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code: string,
    public readonly errors: ApiErrorDetail[] = [],
  ) {
    super(message);
    this.name = "ApiError";
  }
}
