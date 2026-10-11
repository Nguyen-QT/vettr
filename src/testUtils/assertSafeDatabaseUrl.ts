// Guard for every tier that writes to a real database -- the integration
// tier (28.3) and E2E global setup/teardown: throws unless the connection
// string's database name contains "test", so a mis-set DATABASE_URL can
// never point a test wipe at a real environment. Localhost is not exempt
// (28.9): `.env`'s dev database is local too. Only the URL path counts --
// "test" in the host, user or query string does not. The error message
// never echoes the URL -- it carries credentials.
export function assertSafeDatabaseUrl(databaseUrl: string | undefined): void {
  if (!databaseUrl) {
    throw new Error("Tests require DATABASE_URL to be set (refusing to run).");
  }

  let databaseName: string;
  try {
    const parsed = new URL(databaseUrl);
    databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  } catch {
    throw new Error(
      "Tests require DATABASE_URL to be a valid connection string (refusing to run).",
    );
  }

  if (!databaseName.toLowerCase().includes("test")) {
    throw new Error(
      "Tests only run against a database whose name contains 'test' (refusing to run). Run DB-backed suites locally with the npm run *:local scripts.",
    );
  }
}
