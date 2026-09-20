import { config } from "dotenv";

// Runs before any test file's own imports resolve, unlike an inline
// `config()` call inside a test file -- ESM import hoisting means a test
// file's `import { prisma } from "@/lib/prisma"` would otherwise
// evaluate (and read process.env.DATABASE_URL) before its own top-level
// `config()` call ever ran.
config();
