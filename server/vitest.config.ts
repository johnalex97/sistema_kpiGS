import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    restoreMocks: true,
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/tests/database/**",
      "**/tests/auth/auth-service.test.ts",
      "**/tests/auth/auth-http.test.ts",
      "**/tests/technicians/technicians-http.test.ts",
      "**/tests/clients/clients-http.test.ts",
      "**/tests/orders/orders-http.test.ts",
    ],
    env: {
      DATABASE_URL:
        "postgresql://user:password@localhost:5432/Sistema_kpiGS?schema=public",
      DATABASE_TEST_URL:
        "postgresql://user:password@localhost:5432/Sistema_kpiGS?schema=test",
      AUTH_SESSION_TTL_MINUTES: "480",
      AUTH_SESSION_IDLE_MINUTES: "30",
      AUTH_COOKIE_SECURE: "false",
      AUTH_MAX_FAILED_ATTEMPTS: "5",
      AUTH_LOCK_MINUTES: "15",
    },
  },
});
