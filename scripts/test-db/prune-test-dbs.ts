import { spawnSync } from "node:child_process";

import { TEST_DB_LABEL } from "./constants";

// Escape hatch for a hard-killed run (28.9). with-test-db.ts removes its
// container on success, failure and Ctrl+C, but a killed process can't.
// This removes every labelled container, including any that another
// worktree's run is still using.
const listed = spawnSync(
  "docker",
  ["ps", "--all", "--quiet", "--filter", `label=${TEST_DB_LABEL}`],
  { encoding: "utf8" },
);
if (listed.status !== 0) {
  console.error("[test-db] Docker isn't running. Start Docker Desktop and try again.");
  process.exit(1);
}

const containerIds = (listed.stdout ?? "").split(/\s+/).filter(Boolean);
if (containerIds.length === 0) {
  console.log("[test-db] No test database containers to remove.");
  process.exit(0);
}

const removed = spawnSync("docker", ["rm", "--force", ...containerIds], {
  stdio: "inherit",
});
process.exit(removed.status ?? 1);
