import { defineConfig } from "@playwright/test";

const baseURL = process.env.UI_REVIEW_TEST_URL ?? "http://127.0.0.1:3010";
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(baseURL)) throw new Error("Review checks are local only");
export default defineConfig({ testDir: "tests/ui-review", timeout: 120_000, workers: 1, expect: { timeout: 20_000 },
  reporter: "list", outputDir: "test-results/ui-review", use: { baseURL, viewport: { width: 1440, height: 1000 }, screenshot: "only-on-failure" },
  projects: [{ name: "review-chromium", use: { browserName: "chromium" } }, { name: "review-webkit", use: { browserName: "webkit" } }],
});
