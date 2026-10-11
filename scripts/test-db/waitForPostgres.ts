export interface WaitForPostgresOptions {
  // One bounded connection attempt; rejects while the server isn't ready.
  probe: () => Promise<void>;
  timeoutMs: number;
  intervalMs: number;
}

// Retries `probe` until it resolves or `timeoutMs` has passed. The postgres
// image runs a socket-only temporary server while it initialises, so a TCP
// probe only succeeds once the real server is accepting connections.
export async function waitForPostgres({
  probe,
  timeoutMs,
  intervalMs,
}: WaitForPostgresOptions): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    try {
      await probe();
      return;
    } catch {
      if (Date.now() >= deadline) {
        throw new Error(
          `The test database was not ready within ${timeoutMs / 1000}s.`,
        );
      }
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
