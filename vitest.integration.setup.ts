import { config } from "dotenv";

import { assertSafeDatabaseUrl } from "@/testUtils/assertSafeDatabaseUrl";

// Same reasoning as vitest.setup.ts: runs before any test file's imports
// resolve, so `@/lib/prisma` sees DATABASE_URL. Then refuse to proceed
// unless it points somewhere safe to write to (28.3).
config();
assertSafeDatabaseUrl(process.env.DATABASE_URL);
