import path from "node:path";

import { defineConfig } from "vitest/config";

// CLAUDE.md 14.1.1: a separate vitest project from vitest.config.mts's
// mocked unit suite. Files here make real, unmocked calls against
// Stripe's test-mode API (no `vi.mock("@/lib/stripe")`), so they need
// a real STRIPE_SECRET_KEY and network access that `npm run test`'s
// default run must never depend on. Run via `npm run test:stripe`,
// picking up only `*.stripe-integration.test.ts` -- vitest.config.mts
// excludes that same pattern so the two suites never overlap.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    include: ["**/*.stripe-integration.test.ts"],
    exclude: ["node_modules/**", "e2e/**"],
  },
});
