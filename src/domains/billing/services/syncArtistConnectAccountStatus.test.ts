import { prismaMock } from "@/testUtils/prismaMock";

import { describe, expect, it } from "vitest";

import { syncArtistConnectAccountStatus } from "./syncArtistConnectAccountStatus";

// Mocked-Prisma unit test (architecture.md §7). Which rows actually match
// the where clause is Postgres's job; here we assert the exact updateMany
// payload.
describe("syncArtistConnectAccountStatus", () => {
  it("syncs both capability flags to true", async () => {
    prismaMock.artist.updateMany.mockResolvedValue({ count: 1 });

    await syncArtistConnectAccountStatus("acct_sync_test", true, true);

    expect(prismaMock.artist.updateMany).toHaveBeenCalledWith({
      where: { stripeConnectAccountId: "acct_sync_test" },
      data: {
        stripeConnectChargesEnabled: true,
        stripeConnectPayoutsEnabled: true,
      },
    });
  });

  it("can flip a previously-enabled flag back to false, e.g. a Stripe risk review", async () => {
    prismaMock.artist.updateMany.mockResolvedValue({ count: 1 });

    await syncArtistConnectAccountStatus("acct_sync_test", true, false);

    expect(prismaMock.artist.updateMany).toHaveBeenCalledWith({
      where: { stripeConnectAccountId: "acct_sync_test" },
      data: {
        stripeConnectChargesEnabled: true,
        stripeConnectPayoutsEnabled: false,
      },
    });
  });

  it("is a no-op for a Stripe account id that matches no artist", async () => {
    prismaMock.artist.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      syncArtistConnectAccountStatus("acct_unknown", true, true)
    ).resolves.toBeUndefined();
  });
});
