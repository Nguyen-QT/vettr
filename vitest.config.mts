import path from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    // e2e/*.spec.ts are Playwright specs (npm run test:e2e), not vitest's.
    // *.stripe-integration.test.ts (CLAUDE.md 14.1.1) is this suite's own
    // separate project (npm run test:stripe) -- it makes real, unmocked
    // Stripe test-mode API calls, which this default run must never do.
    exclude: ["node_modules/**", "e2e/**", "**/*.stripe-integration.test.ts"],
  },
});
