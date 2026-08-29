import { defineConfig } from "@playwright/test";

export default defineConfig({
  outputDir: process.env["PLAYWRIGHT_OUTPUT_DIR"] ?? "test-results",
  testDir: "./tests/e2e",
  retries: process.env["CI"] === "true" ? 2 : 0,
  reporter: process.env["CI"] === "true" ? [["line"], ["json", { outputFile: "test-results/results.json" }]] : "list",
  use: {
    baseURL: "http://127.0.0.1:4311",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm --filter @nexora/mission-control dev",
    reuseExistingServer: true,
    timeout: 120_000,
    url: "http://127.0.0.1:4311/",
  },
});
