import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import { syncArtistConnectAccountStatus } from "./syncArtistConnectAccountStatus";

describe("syncArtistConnectAccountStatus", () => {
  let artistId: string;

  beforeEach(async () => {
    artistId = randomUUID();
    await prisma.artist.create({
      data: {
        id: artistId,
        name: "Sync Status Test Artist",
        instagramHandle: `test_artist_${artistId.slice(0, 8)}`,
        email: `${artistId}@example.com`,
        stripeConnectAccountId: "acct_sync_test",
      },
    });
  });

  afterEach(async () => {
    await prisma.artist.delete({ where: { id: artistId } });
  });

  it("syncs both capability flags to true", async () => {
    await syncArtistConnectAccountStatus("acct_sync_test", true, true);

    const updated = await prisma.artist.findUnique({ where: { id: artistId } });
    expect(updated?.stripeConnectChargesEnabled).toBe(true);
    expect(updated?.stripeConnectPayoutsEnabled).toBe(true);
  });

  it("can flip a previously-enabled flag back to false, e.g. a Stripe risk review", async () => {
    await prisma.artist.update({
      where: { id: artistId },
      data: { stripeConnectChargesEnabled: true, stripeConnectPayoutsEnabled: true },
    });

    await syncArtistConnectAccountStatus("acct_sync_test", true, false);

    const updated = await prisma.artist.findUnique({ where: { id: artistId } });
    expect(updated?.stripeConnectChargesEnabled).toBe(true);
    expect(updated?.stripeConnectPayoutsEnabled).toBe(false);
  });

  it("is a no-op for a Stripe account id that matches no artist", async () => {
    await expect(
      syncArtistConnectAccountStatus("acct_unknown", true, true)
    ).resolves.toBeUndefined();
  });
});
