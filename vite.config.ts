import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { requireProductionApiBaseUrl } from "./src/config/production-env";

export default defineConfig(({ mode }) => {
  if (mode === "production") {
    requireProductionApiBaseUrl(loadEnv(mode, process.cwd(), "").VITE_API_BASE_URL);
  }

  return {
    plugins: [react()],
    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: "./src/test/setup.ts",
      css: true,
      include: ["src/**/*.test.{ts,tsx}"],
    },
  };
});
