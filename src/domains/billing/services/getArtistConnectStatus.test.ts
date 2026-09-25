import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import { getArtistConnectStatus } from "./getArtistConnectStatus";

describe("getArtistConnectStatus", () => {
  let artistId: string;

  beforeEach(async () => {
    artistId = randomUUID();
    await prisma.artist.create({
      data: {
        id: artistId,
        name: "Connect Status Test Artist",
        instagramHandle: `test_artist_${artistId.slice(0, 8)}`,
        email: `${artistId}@example.com`,
      },
    });
  });

  afterEach(async () => {
    await prisma.artist.delete({ where: { id: artistId } });
  });

  it("reports not connected for an artist who never started onboarding", async () => {
    const status = await getArtistConnectStatus(artistId);

    expect(status).toEqual({
      connected: false,
      chargesEnabled: false,
      payoutsEnabled: false,
    });
  });

  it("reports connected but not yet enabled for an artist mid-onboarding", async () => {
    await prisma.artist.update({
      where: { id: artistId },
      data: { stripeConnectAccountId: "acct_pending" },
    });

    const status = await getArtistConnectStatus(artistId);

    expect(status).toEqual({
      connected: true,
      chargesEnabled: false,
      payoutsEnabled: false,
    });
  });

  it("reports both capabilities once Stripe has enabled them", async () => {
    await prisma.artist.update({
      where: { id: artistId },
      data: {
        stripeConnectAccountId: "acct_live",
        stripeConnectChargesEnabled: true,
        stripeConnectPayoutsEnabled: true,
      },
    });

    const status = await getArtistConnectStatus(artistId);

    expect(status).toEqual({
      connected: true,
      chargesEnabled: true,
      payoutsEnabled: true,
    });
  });

  it("reports not connected for an artist that does not exist", async () => {
    const status = await getArtistConnectStatus(randomUUID());

    expect(status).toEqual({
      connected: false,
      chargesEnabled: false,
      payoutsEnabled: false,
    });
  });
});
