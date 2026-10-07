import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/game/**/*.ts", "src/server/**/*.ts", "src/app/api/health/route.ts"],
      exclude: ["src/game/types.ts", "src/server/types.ts"],
      reporter: ["text", "json-summary", "html"],
      thresholds: { statements: 90, branches: 85, functions: 90, lines: 90 },
    },
  },
});
