export interface WithTestDbArgs {
  // Fail before starting anything if this port already has a listener.
  requireFreePort: number | null;
  // npm script names, run in order against the same database.
  scripts: string[];
}

const REQUIRE_FREE_PORT_FLAG = "--require-free-port=";

// npm script names only. Outside `npm run`, scripts are started through a
// shell (npm is a .cmd shim on Windows), so anything else could inject a
// command.
const SCRIPT_NAME_PATTERN = /^[a-z0-9:_-]+$/i;

export function parseArgs(
  argv: readonly string[],
  knownScripts: ReadonlySet<string>,
): WithTestDbArgs {
  let requireFreePort: number | null = null;
  const scripts: string[] = [];

  for (const arg of argv) {
    if (arg.startsWith(REQUIRE_FREE_PORT_FLAG)) {
      requireFreePort = parsePort(arg.slice(REQUIRE_FREE_PORT_FLAG.length));
      continue;
    }
    if (arg.startsWith("-")) {
      throw new Error(`Unknown option "${arg}".`);
    }
    if (!SCRIPT_NAME_PATTERN.test(arg)) {
      throw new Error(`"${arg}" is not a valid npm script name.`);
    }
    if (!knownScripts.has(arg)) {
      throw new Error(`No npm script named "${arg}" in package.json.`);
    }
    scripts.push(arg);
  }

  if (scripts.length === 0) {
    throw new Error(
      "Name at least one npm script to run against the test database.",
    );
  }

  return { requireFreePort, scripts };
}

function parsePort(raw: string): number {
  const port = Number(raw);
  if (!/^\d+$/.test(raw) || port < 1 || port > 65535) {
    throw new Error(`"${raw}" is not a valid port (1-65535).`);
  }
  return port;
}
