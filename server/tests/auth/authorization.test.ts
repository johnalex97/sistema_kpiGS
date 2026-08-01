import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import type { AuthService } from "../../src/auth/auth.service.js";
import type { AuthPrincipal } from "../../src/auth/auth.types.js";
import { parseEnvironment } from "../../src/config/env.js";
import { createAuthenticationMiddleware } from "../../src/middlewares/authentication.middleware.js";
import { requireAllowedOrigin } from "../../src/middlewares/origin.middleware.js";
import {
  requireAnyPermission,
  requirePasswordChanged,
  requirePermission,
} from "../../src/middlewares/permission.middleware.js";
import { silentLogger } from "../../src/utils/logger.js";

const allowedOrigin = "https://allowed.example.com";
const disallowedOrigin = "https://disallowed.example.com";
const env = parseEnvironment({
  NODE_ENV: "test",
  LOG_LEVEL: "silent",
  CORS_ORIGIN: `${allowedOrigin},${disallowedOrigin}`,
  DATABASE_URL:
    "postgresql://user:password@localhost:5432/Sistema_kpiGS?schema=public",
  DATABASE_TEST_URL:
    "postgresql://user:password@localhost:5432/Sistema_kpiGS?schema=test",
});

const basePrincipal: AuthPrincipal = {
  id: "10000000-0000-4000-8000-000000000001",
  userId: "10000000-0000-4000-8000-000000000001",
  sessionId: "20000000-0000-4000-8000-000000000001",
  email: "admin@geeksolution.example.test",
  displayName: "Administrador",
  mustChangePassword: false,
  technicianId: null,
  roles: ["ADMIN"],
  permissions: ["USERS_MANAGE"],
};

let principal: AuthPrincipal | null;

const authService: AuthService = {
  login: async () => {
    throw new Error("No usado en esta prueba");
  },
  authenticate: async () => principal,
  logout: async () => undefined,
  changePassword: async () => {
    throw new Error("No usado en esta prueba");
  },
};

function testApp() {
  return createApp({
    env,
    logger: silentLogger,
    registerRoutes(app) {
      app.post(
        "/test/protected",
        requireAllowedOrigin([allowedOrigin]),
        createAuthenticationMiddleware(authService),
        requirePasswordChanged,
        requirePermission("USERS_MANAGE"),
        (_req, response) => response.status(204).end(),
      );
    },
  });
}

function protectedRequest(origin?: string) {
  const operation = request(testApp())
    .post("/test/protected")
    .set("Cookie", "gs_session=opaque-token");
  return origin ? operation.set("Origin", origin) : operation;
}

function anyPermissionTestApp() {
  return createApp({
    env,
    logger: silentLogger,
    registerRoutes(app) {
      app.post(
        "/test/any-permission",
        (request, _response, next) => {
          if (principal) request.auth = principal;
          next();
        },
        requireAnyPermission("ORDERS_MANAGE", "ORDERS_OPERATE_OWN"),
        (_request, response) => response.status(204).end(),
      );
    },
  });
}

function anyPermissionRequest() {
  return request(anyPermissionTestApp()).post("/test/any-permission");
}

beforeEach(() => {
  principal = basePrincipal;
});

describe("authentication and authorization middleware", () => {
  it("requires an Origin on mutable requests", async () => {
    const response = await protectedRequest().expect(403);
    expect(response.body.errors[0].code).toBe("ORIGIN_REQUIRED");
  });

  it("rejects an Origin outside the middleware allowlist", async () => {
    const response = await protectedRequest(disallowedOrigin).expect(403);
    expect(response.body.errors[0].code).toBe("ORIGIN_NOT_ALLOWED");
  });

  it("requires a valid session cookie", async () => {
    principal = null;
    const response = await protectedRequest(allowedOrigin).expect(401);
    expect(response.body.errors[0].code).toBe("AUTHENTICATION_REQUIRED");
  });

  it("requires the provisional password to be changed", async () => {
    principal = { ...basePrincipal, mustChangePassword: true };
    const response = await protectedRequest(allowedOrigin).expect(403);
    expect(response.body.errors[0].code).toBe("PASSWORD_CHANGE_REQUIRED");
  });

  it("denies a missing permission", async () => {
    principal = { ...basePrincipal, permissions: [] };
    const response = await protectedRequest(allowedOrigin).expect(403);
    expect(response.body.errors[0].code).toBe("FORBIDDEN");
  });

  it("allows a changed password and persisted permission", async () => {
    await protectedRequest(allowedOrigin).expect(204);
  });

  it("creates an any-permission request handler", () => {
    expect(requireAnyPermission("ORDERS_MANAGE", "ORDERS_OPERATE_OWN"))
      .toBeTypeOf("function");
  });

  it.each(["ORDERS_MANAGE", "ORDERS_OPERATE_OWN"])(
    "allows either listed permission",
    async (permission) => {
      principal = { ...basePrincipal, permissions: [permission] };

      await anyPermissionRequest().expect(204);
    },
  );

  it("denies when no listed permission is granted", async () => {
    principal = { ...basePrincipal, permissions: ["USERS_MANAGE"] };

    const response = await anyPermissionRequest();

    expect(response.status).toBe(403);
    expect(response.body.errors[0].code).toBe("FORBIDDEN");
  });

  it("denies an absent principal", async () => {
    principal = null;

    const response = await anyPermissionRequest();

    expect(response.status).toBe(403);
    expect(response.body.errors[0].code).toBe("FORBIDDEN");
  });
});
