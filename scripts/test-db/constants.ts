// Throwaway local test database (28.9). Mirrors the `postgres` service
// container every job in .github/workflows/ci.yml runs -- keep the image,
// credentials and database name in sync with it, so a local pass means the
// same thing as a CI pass.
export const TEST_DB_IMAGE = "postgres:16";
export const TEST_DB_USER = "postgres";
export const TEST_DB_PASSWORD = "postgres";
// Contains "test", which is what assertSafeDatabaseUrl looks for.
export const TEST_DB_NAME = "vettr_test";
export const TEST_DB_CONTAINER_PORT = 5432;

// Every container with-test-db.ts starts carries this label, so
// prune-test-dbs.ts can find the ones a hard-killed run left behind.
export const TEST_DB_LABEL = "vettr.test-db";
export const TEST_DB_CONTAINER_PREFIX = "vettr-test-db-";

export const READY_TIMEOUT_MS = 30_000;
export const READY_POLL_INTERVAL_MS = 250;
