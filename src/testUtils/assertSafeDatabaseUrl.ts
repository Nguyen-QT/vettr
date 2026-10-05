const LOCAL_HOSTNAMES: readonly string[] = ["localhost", "127.0.0.1", "[::1]"];

// Guard for the real-database integration tier (28.3): throws unless the
// connection string targets a local Postgres or a database whose name
// contains "test", so a mis-set DATABASE_URL can never point the
// integration tier's wipe at a real environment. The error message never
// echoes the URL -- it carries credentials.
export function assertSafeDatabaseUrl(databaseUrl: string | undefined): void {
  if (!databaseUrl) {
    throw new Error(
      "Integration tests require DATABASE_URL to be set (refusing to run).",
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error(
      "Integration tests require DATABASE_URL to be a valid connection string (refusing to run).",
    );
  }

  const isLocalHost = LOCAL_HOSTNAMES.includes(parsed.hostname);
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  const isTestDatabase = databaseName.toLowerCase().includes("test");

  if (!isLocalHost && !isTestDatabase) {
    throw new Error(
      "Integration tests only run against a local database or one whose name contains 'test' (refusing to run).",
    );
  }
}
