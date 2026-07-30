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
    ],
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 20_000,
  },
});
