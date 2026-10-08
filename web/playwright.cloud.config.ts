import { defineConfig } from "@playwright/test";
import { readFileSync, statSync } from "node:fs";

const baseURL = process.env.CLOUD_SMOKE_URL;
if (!baseURL || !/^https:\/\/werewolf-web-v2(?:-[a-z0-9]+-barrylius-projects-d58e2788)?\.vercel\.app$/.test(baseURL)) throw new Error("Use only the approved web-v2 deployment URL");
const authPath = process.env.CLOUD_SMOKE_AUTH;
if (authPath && (statSync(authPath).mode & 0o077)) throw new Error("Authentication file must be private");
const headers: Record<string, string> = authPath ? { "x-vercel-protection-bypass": JSON.parse(readFileSync(authPath, "utf8")).secret } : {};
export default defineConfig({
  testDir: "tests/e2e", testMatch: "cloud-smoke.spec.ts", timeout: 180_000, workers: 1,
  expect: { timeout: 30_000 }, reporter: [["list"]], outputDir: "test-results/cloud-smoke",
  use: { baseURL, extraHTTPHeaders: headers, viewport: { width: 390, height: 844 }, actionTimeout: 20_000, navigationTimeout: 30_000 },
  projects: [{ name: "cloud-chromium", use: { browserName: "chromium" } }],
});
