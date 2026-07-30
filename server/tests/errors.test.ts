import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { parseEnvironment } from "../src/config/env.js";
import { silentLogger } from "../src/utils/logger.js";

const env = parseEnvironment({
  NODE_ENV: "test",
  LOG_LEVEL: "silent",
  DATABASE_URL:
    "postgresql://user:password@localhost:5432/Sistema_kpiGS?schema=public",
  DATABASE_TEST_URL:
    "postgresql://user:password@localhost:5432/Sistema_kpiGS?schema=test",
});

describe("API errors", () => {
  it("returns a consistent 404 response", async () => {
    const response = await request(createApp({ env, logger: silentLogger }))
      .get("/api/v1/unknown")
      .expect(404);

    expect(response.body).toEqual({
      success: false,
      message: "Recurso no encontrado",
      data: null,
      errors: [
        {
          code: "RESOURCE_NOT_FOUND",
          message: "La ruta solicitada no existe",
        },
      ],
      meta: { requestId: response.headers["x-request-id"] },
    });
  });

  it("returns 400 for malformed JSON", async () => {
    const response = await request(
      createApp({
        env,
        logger: silentLogger,
        registerRoutes: (app) =>
          app.post("/input", (_req, res) => res.sendStatus(204)),
      }),
    )
      .post("/input")
      .set("Content-Type", "application/json")
      .send('{"broken":')
      .expect(400);

    expect(response.body.message).toBe("El JSON enviado no es válido");
    expect(JSON.stringify(response.body)).not.toContain("SyntaxError");
  });

  it("hides unexpected error details", async () => {
    const response = await request(
      createApp({
        env,
        logger: silentLogger,
        registerRoutes: (app) => {
          app.get("/failure", () => {
            throw new Error("DATABASE_PASSWORD=super-secret");
          });
        },
      }),
    )
      .get("/failure")
      .expect(500);

    expect(response.body.message).toBe("Ocurrió un error interno");
    expect(JSON.stringify(response.body)).not.toContain("super-secret");
    expect(JSON.stringify(response.body)).not.toContain("stack");
  });

  it("returns 413 using the same error contract", async () => {
    const smallEnv = { ...env, JSON_BODY_LIMIT: "1kb" };
    const response = await request(
      createApp({
        env: smallEnv,
        logger: silentLogger,
        registerRoutes: (app) => {
          app.post("/input", (_req, res) => res.sendStatus(204));
        },
      }),
    )
      .post("/input")
      .send({ content: "x".repeat(2048) })
      .expect(413);

    expect(response.body.errors[0].code).toBe("PAYLOAD_TOO_LARGE");
  });
});
