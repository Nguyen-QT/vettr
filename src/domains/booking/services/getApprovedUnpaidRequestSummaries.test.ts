import { prismaMock } from "@/testUtils/prismaMock";

import { describe, expect, it } from "vitest";

import { getApprovedUnpaidRequestSummaries } from "./getApprovedUnpaidRequestSummaries";

// Mocked-Prisma unit test (architecture.md §7). The status / depositPaid /
// client filters live in the `where` clause, so they are asserted there
// rather than by seeding rows that should be excluded.
describe("getApprovedUnpaidRequestSummaries", () => {
  const clientId = "client-1";

  it("returns the projected rows for an APPROVED, unpaid request", async () => {
    prismaMock.bookingRequest.findMany.mockResolvedValue([
      { id: "request-1", artistId: "artist-1", tier: "TIER_2" },
    ] as never);

    const result = await getApprovedUnpaidRequestSummaries(clientId);

    expect(result).toEqual([
      { id: "request-1", artistId: "artist-1", tier: "TIER_2" },
    ]);
  });

  it("only queries APPROVED requests with an unpaid deposit for this client, projecting narrow fields", async () => {
    prismaMock.bookingRequest.findMany.mockResolvedValue([]);

    const result = await getApprovedUnpaidRequestSummaries(clientId);

    expect(result).toEqual([]);
    expect(prismaMock.bookingRequest.findMany).toHaveBeenCalledWith({
      where: { clientId, status: "APPROVED", depositPaid: false },
      select: { id: true, artistId: true, tier: true },
    });
  });
});
