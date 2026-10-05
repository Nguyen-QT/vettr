import path from "node:path";

import { defineConfig } from "vitest/config";

// CLAUDE.md 28.3: a separate vitest project from vitest.config.mts's mocked
// unit suite. Files here use the real Prisma client against a real
// Postgres (no `vi.mock("@/lib/prisma")`), so `npm run test`'s default run
// must never include them -- vitest.config.mts excludes the same pattern.
// Run via `npm run test:integration`.
//
// fileParallelism is off because every file shares one database and the
// concurrency tests in this tier need to own the DB timeline.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    setupFiles: ["./vitest.integration.setup.ts"],
    include: ["**/*.integration.test.ts"],
    exclude: ["node_modules/**", "e2e/**", "**/*.stripe-integration.test.ts"],
    fileParallelism: false,
  },
});
