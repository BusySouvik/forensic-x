import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@shared": path.resolve(import.meta.dirname, "shared"),
    },
  },
  test: {
    environment: "node",
    include: ["server/**/*.test.ts"],
    env: {
      NODE_ENV: "test",
      JWT_SECRET: "test-jwt-secret-do-not-use-in-prod",
    },
  },
});
