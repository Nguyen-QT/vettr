import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import { SESSION_DURATION_MS } from "../constants";
import { createSession } from "./createSession";

describe("createSession", () => {
  let artistId: string;
  let accountId: string;

  beforeEach(async () => {
    artistId = randomUUID();
    await prisma.artist.create({
      data: {
        id: artistId,
        name: "Create Session Test Artist",
        instagramHandle: `test_artist_${artistId.slice(0, 8)}`,
        email: `${artistId}@example.com`,
      },
    });
    const account = await prisma.account.create({
      data: {
        email: `${artistId}-account@example.com`,
        passwordHash: "irrelevant-for-this-test",
        role: "ARTIST",
        artistId,
      },
    });
    accountId = account.id;
  });

  afterEach(async () => {
    await prisma.session.deleteMany({ where: { accountId } });
    await prisma.account.delete({ where: { id: accountId } });
    await prisma.artist.delete({ where: { id: artistId } });
  });

  it("creates a session row tied to the account with a future expiry", async () => {
    const before = Date.now();
    const session = await createSession(accountId);

    expect(session.accountId).toBe(accountId);
    expect(session.expiresAt.getTime()).toBeGreaterThan(before);
    expect(session.expiresAt.getTime()).toBeLessThanOrEqual(
      before + SESSION_DURATION_MS + 1000
    );
  });
});
