import { prismaMock } from "@/testUtils/prismaMock";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Session } from "@/generated/prisma/client";

import { SESSION_DURATION_MS } from "../constants";
import { createSession } from "./createSession";

// Mocked-Prisma unit test (architecture.md §7): assert the exact create
// payload, with the clock pinned so expiresAt is deterministic.
const NOW = new Date("2026-03-01T12:00:00.000Z");

function buildSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "session-1",
    expiresAt: new Date(NOW.getTime() + SESSION_DURATION_MS),
    createdAt: NOW,
    accountId: "account-1",
    activeRole: "ARTIST",
    ...overrides,
  };
}

describe("createSession", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates a session row tied to the account with a future expiry", async () => {
    prismaMock.session.create.mockResolvedValue(buildSession());

    const session = await createSession("account-1", "ARTIST");

    expect(prismaMock.session.create).toHaveBeenCalledWith({
      data: {
        accountId: "account-1",
        activeRole: "ARTIST",
        expiresAt: new Date(NOW.getTime() + SESSION_DURATION_MS),
      },
    });
    expect(session.accountId).toBe("account-1");
    expect(session.activeRole).toBe("ARTIST");
  });

  it("passes the CLIENT role through to the created row", async () => {
    prismaMock.session.create.mockResolvedValue(
      buildSession({ activeRole: "CLIENT" })
    );

    await createSession("account-1", "CLIENT");

    expect(prismaMock.session.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ activeRole: "CLIENT" }),
    });
  });
});
