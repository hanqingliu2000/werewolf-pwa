import { defineConfig } from "@playwright/test";
import { readFileSync, statSync } from "node:fs";

if (process.env.RUN_PRODUCTION_ACCEPTANCE !== "1") throw new Error("Production acceptance requires explicit opt-in");
const baseURL = process.env.FULL_GAME_URL ?? "https://werewolf-web-v2.vercel.app";
if (!/^https:\/\/werewolf-web-v2(?:-[a-z0-9]+-barrylius-projects-d58e2788)?\.vercel\.app$/.test(baseURL)
  && baseURL !== "http://127.0.0.1:3030") throw new Error("Use only the approved local or web-v2 deployment URL");
const authPath = process.env.FULL_GAME_AUTH;
if (authPath && (statSync(authPath).mode & 0o077)) throw new Error("Authentication file must be private");
const headers: Record<string, string> = authPath ? { "x-vercel-protection-bypass": JSON.parse(readFileSync(authPath, "utf8")).secret } : {};
export default defineConfig({
  testDir: "tests/e2e", testMatch: "production-game.spec.ts", timeout: 1_200_000, workers: 1,
  expect: { timeout: 30_000 }, reporter: [["list"]], outputDir: "test-results/production-full",
  use: { baseURL, extraHTTPHeaders: headers, viewport: { width: 390, height: 844 },
    actionTimeout: 20_000, navigationTimeout: 40_000, screenshot: "only-on-failure", trace: "off" },
  projects: [{ name: "production-chromium", use: { browserName: "chromium" } }],
});
