import { defineConfig } from "@playwright/test";

if (process.env.RUN_PRODUCTION_ACCEPTANCE !== "1") throw new Error("Production acceptance requires explicit opt-in");
export default defineConfig({
  testDir: "tests/e2e", testMatch: "production-game.spec.ts", timeout: 1_200_000, workers: 1,
  expect: { timeout: 30_000 }, reporter: [["list"]], outputDir: "test-results/production-full",
  use: { baseURL: "https://werewolf-web-v2.vercel.app", viewport: { width: 390, height: 844 },
    actionTimeout: 20_000, navigationTimeout: 40_000, screenshot: "only-on-failure", trace: "off" },
  projects: [{ name: "production-chromium", use: { browserName: "chromium" } }],
});
