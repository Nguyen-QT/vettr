import net from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import { isPortListening } from "./isPortListening";

function listen(server: net.Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    // No host, so it binds the way a dev server does (all interfaces).
    server.listen(0, () => {
      const address = server.address();
      if (address && typeof address === "object") resolve(address.port);
      else reject(new Error("server has no port"));
    });
  });
}

function close(server: net.Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

describe("isPortListening", () => {
  let server: net.Server | null = null;

  afterEach(async () => {
    if (server?.listening) await close(server);
    server = null;
  });

  it("is true while a server listens on the port", async () => {
    server = net.createServer((socket) => socket.destroy());
    const port = await listen(server);

    await expect(isPortListening(port)).resolves.toBe(true);
  });

  it("is false once nothing listens on the port", async () => {
    server = net.createServer();
    const port = await listen(server);
    await close(server);

    await expect(isPortListening(port)).resolves.toBe(false);
  });
});
