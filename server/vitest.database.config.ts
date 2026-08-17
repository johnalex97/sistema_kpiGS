import "dotenv/config";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "tests/database/**/*.test.ts",
      "tests/auth/auth-service.test.ts",
      "tests/auth/auth-http.test.ts",
      "tests/technicians/technicians-http.test.ts",
      "tests/clients/clients-http.test.ts",
      "tests/orders/orders-http.test.ts",
      "tests/activities/activities-http.test.ts",
      "tests/evidences/evidences-http.test.ts",
    ],
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 20_000,
  },
});
