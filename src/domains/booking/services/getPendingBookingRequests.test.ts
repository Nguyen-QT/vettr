import { prismaMock } from "@/testUtils/prismaMock";

import { describe, expect, it } from "vitest";

import { getPendingBookingRequests } from "./getPendingBookingRequests";

// Mocked-Prisma unit test (architecture.md §7). DB-defaulted columns
// (cancellationCount = 0, enforcePrecharge = false) are supplied by the
// stubbed rows; the real @default population is a 28.3 integration-tier
// candidate.
describe("getPendingBookingRequests", () => {
  const artistId = "artist-1";

  function row(
    overrides: {
      client?: Partial<{
        cancellationCount: number;
        enforcePrecharge: boolean;
      }>;
      paymentMethod?: "CASH" | "CARD" | null;
    } = {}
  ) {
    return {
      id: "request-1",
      status: "PENDING",
      tier: "TIER_2",
      minPrice: "100",
      maxPrice: "200",
      designTags: ["floral"],
      aestheticTags: ["fine-line"],
      clientNotes: "notes",
      designReferences: [
        { imageUrl: "https://utfs.io/f/a.jpg" },
        { imageUrl: "https://utfs.io/f/b.jpg" },
      ],
      requestedStartTime: new Date("2026-11-01T10:00:00.000Z"),
      clientMaxEndTime: new Date("2026-11-01T14:00:00.000Z"),
      createdAt: new Date("2026-10-01T10:00:00.000Z"),
      paymentMethod: overrides.paymentMethod ?? null,
      client: {
        instagramHandle: "test_client",
        email: "test_client@example.com",
        phone: null,
        cancellationCount: 0,
        enforcePrecharge: false,
        ...overrides.client,
      },
    } as never;
  }

  it("queries PENDING and AWAITING_SLOT_CONFIRMATION requests for the artist, oldest first", async () => {
    prismaMock.bookingRequest.findMany.mockResolvedValue([]);

    const result = await getPendingBookingRequests(artistId);

    expect(result).toEqual([]);
    expect(prismaMock.bookingRequest.findMany).toHaveBeenCalledWith({
      where: {
        artistId,
        status: { in: ["PENDING", "AWAITING_SLOT_CONFIRMATION"] },
      },
      include: { client: true, designReferences: true },
      orderBy: { createdAt: "asc" },
    });
  });

  it("maps a row into the dashboard summary", async () => {
    prismaMock.bookingRequest.findMany.mockResolvedValue([row()]);

    const [result] = await getPendingBookingRequests(artistId);

    expect(result).toEqual({
      id: "request-1",
      status: "PENDING",
      clientInstagramHandle: "test_client",
      clientEmail: "test_client@example.com",
      clientPhone: null,
      tier: "TIER_2",
      minPrice: 100,
      maxPrice: 200,
      designTags: ["floral"],
      aestheticTags: ["fine-line"],
      clientNotes: "notes",
      designReferenceImageUrls: [
        "https://utfs.io/f/a.jpg",
        "https://utfs.io/f/b.jpg",
      ],
      requestedStartTime: new Date("2026-11-01T10:00:00.000Z"),
      clientMaxEndTime: new Date("2026-11-01T14:00:00.000Z"),
      createdAt: new Date("2026-10-01T10:00:00.000Z"),
      clientCancellationCount: 0,
      clientEnforcePrecharge: false,
      paymentMethod: null,
    });
  });

  it("surfaces a client's cancellation count and precharge flag", async () => {
    prismaMock.bookingRequest.findMany.mockResolvedValue([
      row({ client: { cancellationCount: 2, enforcePrecharge: true } }),
    ]);

    const [result] = await getPendingBookingRequests(artistId);

    expect(result?.clientCancellationCount).toBe(2);
    expect(result?.clientEnforcePrecharge).toBe(true);
  });

  it("defaults to zero/false for a client with no cancellation history", async () => {
    prismaMock.bookingRequest.findMany.mockResolvedValue([row()]);

    const [result] = await getPendingBookingRequests(artistId);

    expect(result?.clientCancellationCount).toBe(0);
    expect(result?.clientEnforcePrecharge).toBe(false);
  });

  it("surfaces the client's payment method preference", async () => {
    prismaMock.bookingRequest.findMany.mockResolvedValue([
      row({ paymentMethod: "CASH" }),
    ]);

    const [result] = await getPendingBookingRequests(artistId);

    expect(result?.paymentMethod).toBe("CASH");
  });

  it("reports null payment method for a request that predates the field", async () => {
    prismaMock.bookingRequest.findMany.mockResolvedValue([row()]);

    const [result] = await getPendingBookingRequests(artistId);

    expect(result?.paymentMethod).toBeNull();
  });
});
