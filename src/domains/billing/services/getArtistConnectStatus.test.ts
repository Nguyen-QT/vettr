import { prismaMock } from "@/testUtils/prismaMock";

import { describe, expect, it } from "vitest";

import { getArtistConnectStatus } from "./getArtistConnectStatus";

// Mocked-Prisma unit test (architecture.md §7).
describe("getArtistConnectStatus", () => {
  const artistId = "artist-1";

  it("reports not connected for an artist who never started onboarding", async () => {
    prismaMock.artist.findUnique.mockResolvedValue({
      stripeConnectAccountId: null,
      stripeConnectChargesEnabled: false,
      stripeConnectPayoutsEnabled: false,
    } as never);

    const status = await getArtistConnectStatus(artistId);

    expect(status).toEqual({
      connected: false,
      chargesEnabled: false,
      payoutsEnabled: false,
    });
    expect(prismaMock.artist.findUnique).toHaveBeenCalledWith({
      where: { id: artistId },
      select: {
        stripeConnectAccountId: true,
        stripeConnectChargesEnabled: true,
        stripeConnectPayoutsEnabled: true,
      },
    });
  });

  it("reports connected but not yet enabled for an artist mid-onboarding", async () => {
    prismaMock.artist.findUnique.mockResolvedValue({
      stripeConnectAccountId: "acct_pending",
      stripeConnectChargesEnabled: false,
      stripeConnectPayoutsEnabled: false,
    } as never);

    const status = await getArtistConnectStatus(artistId);

    expect(status).toEqual({
      connected: true,
      chargesEnabled: false,
      payoutsEnabled: false,
    });
  });

  it("reports both capabilities once Stripe has enabled them", async () => {
    prismaMock.artist.findUnique.mockResolvedValue({
      stripeConnectAccountId: "acct_live",
      stripeConnectChargesEnabled: true,
      stripeConnectPayoutsEnabled: true,
    } as never);

    const status = await getArtistConnectStatus(artistId);

    expect(status).toEqual({
      connected: true,
      chargesEnabled: true,
      payoutsEnabled: true,
    });
  });

  it("reports not connected for an artist that does not exist", async () => {
    prismaMock.artist.findUnique.mockResolvedValue(null);

    const status = await getArtistConnectStatus(artistId);

    expect(status).toEqual({
      connected: false,
      chargesEnabled: false,
      payoutsEnabled: false,
    });
  });
});
