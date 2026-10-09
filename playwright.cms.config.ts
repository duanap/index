import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: [
    "cms.spec.ts",
    "fork-admin.spec.ts",
    "features.spec.ts",
    "member-auth.spec.ts",
    "member-profile.spec.ts",
    "member-activity.spec.ts",
    "message-board.spec.ts",
    "site-settings.spec.ts",
  ],
  workers: 1,
  timeout: 60_000,
  use: {
    baseURL: "http://127.0.0.1:4174",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: process.env.PLAYWRIGHT_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
      : {},
  },
  projects: [{ name: "cms", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "node --env-file-if-exists=.env scripts/test-server.mjs",
    url: "http://127.0.0.1:4174/_emdash/api/setup/status",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
