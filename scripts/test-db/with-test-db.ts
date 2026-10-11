import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { constants as osConstants } from "node:os";

import { Client } from "pg";

import packageJson from "../../package.json";
import {
  READY_POLL_INTERVAL_MS,
  READY_TIMEOUT_MS,
  TEST_DB_CONTAINER_PORT,
  TEST_DB_CONTAINER_PREFIX,
  TEST_DB_IMAGE,
  TEST_DB_LABEL,
  TEST_DB_NAME,
  TEST_DB_PASSWORD,
  TEST_DB_USER,
} from "./constants";
import { isPortListening } from "./isPortListening";
import { parseArgs } from "./parseArgs";
import { parseDockerPort } from "./parseDockerPort";
import { waitForPostgres } from "./waitForPostgres";

// Runs npm scripts against a throwaway Postgres (28.9):
//   tsx scripts/test-db/with-test-db.ts [--require-free-port=<port>] <script>...
// Starts a fresh container on a port Docker picks, migrates it the way CI
// does, runs each script with DATABASE_URL pointing at it, and always
// removes the container. Every .env loader in this repo (dotenv, Prisma's
// config, Next) leaves an already-set DATABASE_URL alone, so nothing reads
// the dev database and no env file is written.

const PROBE_TIMEOUT_MS = 2_000;
const EXIT_SIGNALS = ["SIGINT", "SIGTERM", "SIGHUP"] as const;

interface DockerResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}

function log(message: string): void {
  console.log(`[test-db] ${message}`);
}

function logError(message: string): void {
  console.error(`[test-db] ${message}`);
}

function docker(args: readonly string[]): DockerResult {
  const result = spawnSync("docker", args, { encoding: "utf8" });
  return {
    ok: result.status === 0,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

// Under `npm run`, npm_execpath is npm's own CLI script, so spawning it
// with node needs no shell. Otherwise fall back to a shell, which Windows
// needs for the npm.cmd shim; every arg is a literal or a script name
// parseArgs has already validated.
function runNpm(
  args: readonly string[],
  env: NodeJS.ProcessEnv,
): Promise<number> {
  const npmCli = process.env.npm_execpath;
  const child = npmCli
    ? spawn(process.execPath, [npmCli, ...args], { stdio: "inherit", env })
    : spawn(["npm", ...args].join(" "), { stdio: "inherit", env, shell: true });

  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
}

async function probePostgres(databaseUrl: string): Promise<void> {
  const client = new Client({
    connectionString: databaseUrl,
    connectionTimeoutMillis: PROBE_TIMEOUT_MS,
    query_timeout: PROBE_TIMEOUT_MS,
  });
  await client.connect();
  try {
    await client.query("SELECT 1");
  } finally {
    await client.end();
  }
}

function ensureImage(): boolean {
  if (docker(["image", "inspect", TEST_DB_IMAGE]).ok) return true;

  log(`Pulling ${TEST_DB_IMAGE} (first run only)...`);
  return (
    spawnSync("docker", ["pull", TEST_DB_IMAGE], { stdio: "inherit" })
      .status === 0
  );
}

async function main(): Promise<number> {
  const args = parseArgs(
    process.argv.slice(2),
    new Set(Object.keys(packageJson.scripts)),
  );

  if (
    args.requireFreePort !== null &&
    (await isPortListening(args.requireFreePort))
  ) {
    logError(
      `Something is already listening on port ${args.requireFreePort} (a dev server?). Stop it first: Playwright would reuse it, and it reads the dev database.`,
    );
    return 1;
  }

  if (!docker(["info", "--format", "{{.ServerVersion}}"]).ok) {
    logError("Docker isn't running. Start Docker Desktop and try again.");
    return 1;
  }

  if (!ensureImage()) {
    logError(`Could not pull ${TEST_DB_IMAGE}.`);
    return 1;
  }

  const containerName = `${TEST_DB_CONTAINER_PREFIX}${randomBytes(4).toString("hex")}`;
  let containerRemoved = false;
  const removeContainer = (): void => {
    if (containerRemoved) return;
    containerRemoved = true;
    // --rm on `docker run` already deletes it once stopped; this stops it.
    const removed = docker(["rm", "--force", containerName]);
    if (removed.ok) {
      log(`Removed ${containerName}`);
    } else if (!removed.stderr.includes("No such container")) {
      logError(
        `Could not remove ${containerName}. Run \`npm run test:db:prune\` once Docker is back.`,
      );
    }
  };

  // Registered before the container exists: a signal that arrives while
  // `docker run` blocks is handled once it returns, by name.
  for (const signal of EXIT_SIGNALS) {
    process.on(signal, () => {
      removeContainer();
      process.exit(128 + osConstants.signals[signal]);
    });
  }

  const started = docker([
    "run",
    "--detach",
    "--rm",
    "--name",
    containerName,
    "--label",
    TEST_DB_LABEL,
    "--env",
    `POSTGRES_USER=${TEST_DB_USER}`,
    "--env",
    `POSTGRES_PASSWORD=${TEST_DB_PASSWORD}`,
    "--env",
    `POSTGRES_DB=${TEST_DB_NAME}`,
    // Loopback only, on a host port Docker picks, so it can never clash
    // with a local Postgres or another run.
    "--publish",
    `127.0.0.1::${TEST_DB_CONTAINER_PORT}`,
    // Data lives in memory: nothing to clean up, no volume left behind.
    "--tmpfs",
    "/var/lib/postgresql/data",
    TEST_DB_IMAGE,
  ]);
  if (!started.ok) {
    removeContainer();
    logError(
      `Could not start the test database container.\n${started.stderr.trim()}`,
    );
    return 1;
  }

  try {
    const port = parseDockerPort(
      docker(["port", containerName, `${TEST_DB_CONTAINER_PORT}/tcp`]).stdout,
    );
    // 127.0.0.1, not localhost: on Windows localhost can resolve to ::1,
    // which the container isn't published on.
    const databaseUrl = `postgresql://${TEST_DB_USER}:${TEST_DB_PASSWORD}@127.0.0.1:${port}/${TEST_DB_NAME}?schema=public`;

    log(`Starting ${TEST_DB_IMAGE} on 127.0.0.1:${port} (${containerName})`);
    await waitForPostgres({
      probe: () => probePostgres(databaseUrl),
      timeoutMs: READY_TIMEOUT_MS,
      intervalMs: READY_POLL_INTERVAL_MS,
    });
    log(`Database ${TEST_DB_NAME} is ready`);

    const env: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: databaseUrl };
    // Same order as ci.yml. `migrate deploy`, never `migrate dev`, so no
    // migration files are ever written.
    const steps: string[][] = [
      ["exec", "--", "prisma", "generate"],
      ["exec", "--", "prisma", "migrate", "deploy"],
      ...args.scripts.map((script) => ["run", script]),
    ];
    for (const step of steps) {
      const code = await runNpm(step, env);
      if (code !== 0) return code;
    }
    return 0;
  } finally {
    removeContainer();
  }
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    logError(error instanceof Error ? error.message : String(error));
    process.exit(1);
  },
);
