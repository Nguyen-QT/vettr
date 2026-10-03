import { defineConfig, devices } from "@playwright/test";

import { EMAIL_CAPTURE_SINK_PATH } from "./e2e/authHelpers";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "html",
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    // Diverts verification emails to a local file the specs read back
    // (27.3.2.3 capture sink); never reaches Resend.
    env: { EMAIL_CAPTURE_SINK_PATH },
    timeout: 120_000,
  },
});
