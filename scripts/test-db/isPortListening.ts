import net from "node:net";

const CONNECT_TIMEOUT_MS = 1_000;

// True if something accepts TCP connections on host:port. Playwright reuses
// whatever already listens on its webServer port locally, and a dev server
// there reads the dev database, so E2E runs check this first.
export function isPortListening(
  port: number,
  host = "localhost",
): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host });
    socket.setTimeout(CONNECT_TIMEOUT_MS);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => resolve(false));
  });
}
