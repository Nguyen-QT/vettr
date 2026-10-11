// Reads the host port out of `docker port <container> 5432/tcp`, which
// prints one "<host-ip>:<port>" line per binding: "127.0.0.1:55012",
// "0.0.0.0:55012" or "[::]:55012" depending on the bind address.
export function parseDockerPort(output: string): number {
  for (const line of output.split(/\r?\n/)) {
    const match = /:(\d+)$/.exec(line.trim());
    if (!match) continue;

    const port = Number(match[1]);
    if (port >= 1 && port <= 65535) return port;
  }

  throw new Error(
    "Could not read the test database's host port from `docker port`.",
  );
}
