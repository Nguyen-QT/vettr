import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { waitForPostgres } from "./waitForPostgres";

describe("waitForPostgres", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves straight away when the first probe succeeds", async () => {
    const probe = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

    await waitForPostgres({ probe, timeoutMs: 1_000, intervalMs: 100 });

    expect(probe).toHaveBeenCalledTimes(1);
  });

  it("retries every interval until a probe succeeds", async () => {
    const probe = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("ECONNREFUSED"))
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValue(undefined);

    const ready = waitForPostgres({ probe, timeoutMs: 1_000, intervalMs: 100 });
    await vi.advanceTimersByTimeAsync(200);

    await expect(ready).resolves.toBeUndefined();
    expect(probe).toHaveBeenCalledTimes(3);
  });

  it("gives up once the deadline has passed", async () => {
    const probe = vi
      .fn<() => Promise<void>>()
      .mockRejectedValue(new Error("ECONNREFUSED"));

    const ready = waitForPostgres({ probe, timeoutMs: 1_000, intervalMs: 100 });
    const rejection = expect(ready).rejects.toThrow(/not ready within 1s/);
    await vi.advanceTimersByTimeAsync(1_100);

    await rejection;
    // t=0, 100, ..., 1000: the probe at the deadline still gets its chance.
    expect(probe).toHaveBeenCalledTimes(11);
  });
});
