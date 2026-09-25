import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import { deleteSession } from "./deleteSession";

describe("deleteSession", () => {
  let artistId: string;
  let accountId: string;

  beforeEach(async () => {
    artistId = randomUUID();
    await prisma.artist.create({
      data: {
        id: artistId,
        name: "Delete Session Test Artist",
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

  it("removes the session row so it can no longer be found", async () => {
    const session = await prisma.session.create({
      data: { accountId, expiresAt: new Date(Date.now() + 60_000), activeRole: "ARTIST" },
    });

    await deleteSession(session.id);

    const found = await prisma.session.findUnique({ where: { id: session.id } });
    expect(found).toBeNull();
  });

  it("does not throw when the session id does not exist", async () => {
    await expect(deleteSession(randomUUID())).resolves.not.toThrow();
  });
});
