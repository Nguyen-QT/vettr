import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import { getSessionWithAccount } from "./getSessionWithAccount";

describe("getSessionWithAccount", () => {
  let artistId: string;
  let accountId: string;

  beforeEach(async () => {
    artistId = randomUUID();
    await prisma.artist.create({
      data: {
        id: artistId,
        name: "Get Session Test Artist",
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

  it("returns the session and linked account details for a valid session", async () => {
    const session = await prisma.session.create({
      data: { accountId, expiresAt: new Date(Date.now() + 60_000), activeRole: "ARTIST" },
    });

    const result = await getSessionWithAccount(session.id);

    expect(result).toEqual({
      sessionId: session.id,
      expiresAt: session.expiresAt,
      accountId,
      role: "ARTIST",
      activeRole: "ARTIST",
      artistId,
      clientProfileId: null,
    });
  });

  it("returns null for an expired session", async () => {
    const session = await prisma.session.create({
      data: { accountId, expiresAt: new Date(Date.now() - 60_000), activeRole: "ARTIST" },
    });

    await expect(getSessionWithAccount(session.id)).resolves.toBeNull();
  });

  it("returns null for a session id that does not exist", async () => {
    await expect(getSessionWithAccount(randomUUID())).resolves.toBeNull();
  });
});
