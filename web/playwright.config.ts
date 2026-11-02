import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";

const port = Number(process.env.E2E_PORT ?? 3117);
const baseURL = `http://127.0.0.1:${port}`;
const database = resolve(process.env.E2E_DB_PATH ?? "test-results/browser.sqlite");
export default defineConfig({
  testIgnore: ["**/cloud-smoke.spec.ts", "**/production-game.spec.ts"],
  testDir: "./tests/e2e", timeout: 300_000, expect: { timeout: 15_000 }, workers: 1,
  reporter: [["list"], ["json", { outputFile: "test-results/browser-report.json" }]],
  use: { baseURL, viewport: { width: 390, height: 844 }, screenshot: "only-on-failure", actionTimeout: 15_000, navigationTimeout: 20_000 },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }, { name: "webkit", use: { browserName: "webkit" } }],
  webServer: { command: `npm run start -- --hostname 127.0.0.1 --port ${port}`, url: `${baseURL}/api/health`, reuseExistingServer: false,
    env: { WEREWOLF_STORAGE: "sqlite", WEREWOLF_DB_PATH: database, WEREWOLF_ORIGIN: baseURL, NEXT_TELEMETRY_DISABLED: "1" } },
});
