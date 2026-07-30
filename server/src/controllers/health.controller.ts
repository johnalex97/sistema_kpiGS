import type { Request, Response } from "express";
import type { Environment } from "../config/env.js";
import type { ApiResponse } from "../types/api.js";

interface HealthData {
  status: "ok";
  service: string;
  version: string;
  environment: Environment["NODE_ENV"];
  timestamp: string;
}

export function createHealthController(env: Environment) {
  return (req: Request, res: Response<ApiResponse<HealthData>>) => {
    res.status(200).json({
      success: true,
      message: "Servicio disponible",
      data: {
        status: "ok",
        service: "geek-solution-service-control-api",
        version: "0.1.0",
        environment: env.NODE_ENV,
        timestamp: new Date().toISOString(),
      },
      errors: [],
      meta: { requestId: req.requestId },
    });
  };
}
