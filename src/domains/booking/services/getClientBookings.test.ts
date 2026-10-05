import { prismaMock } from "@/testUtils/prismaMock";

import { describe, expect, it } from "vitest";

import { getClientBookings } from "./getClientBookings";

// Mocked-Prisma unit test (architecture.md §7). Row selection (this
// client only) and ordering are asserted on the query payload; the
// mapping is asserted on stubbed rows.
describe("getClientBookings", () => {
  const clientId = "client-1";

  function row(
    overrides: Partial<{
      id: string;
      artistName: string;
      artistHandle: string;
      createdAt: Date;
      estimatedPrice: string | null;
      depositPaid: boolean;
      depositRefunded: boolean;
      imageUrls: string[];
    }> = {}
  ) {
    return {
      id: overrides.id ?? "request-1",
      status: "PENDING",
      tier: "TIER_2",
      minPrice: "100",
      maxPrice: "200",
      estimatedPrice: overrides.estimatedPrice ?? null,
      clientNotes: "notes",
      requestedStartTime: new Date("2026-11-01T10:00:00.000Z"),
      createdAt: overrides.createdAt ?? new Date("2026-10-01T10:00:00.000Z"),
      depositPaid: overrides.depositPaid ?? false,
      depositRefunded: overrides.depositRefunded ?? false,
      artist: {
        name: overrides.artistName ?? "Test Artist",
        instagramHandle: overrides.artistHandle ?? "test_artist",
      },
      designReferences: (overrides.imageUrls ?? []).map((imageUrl) => ({
        imageUrl,
      })),
    } as never;
  }

  it("returns a booking with the artist's name and handle attached", async () => {
    prismaMock.bookingRequest.findMany.mockResolvedValue([row()]);

    const [result] = await getClientBookings(clientId);

    expect(result).toEqual({
      id: "request-1",
      status: "PENDING",
      artistName: "Test Artist",
      artistInstagramHandle: "test_artist",
      tier: "TIER_2",
      minPrice: 100,
      maxPrice: 200,
      estimatedPrice: null,
      clientNotes: "notes",
      requestedStartTime: new Date("2026-11-01T10:00:00.000Z"),
      createdAt: new Date("2026-10-01T10:00:00.000Z"),
      designReferenceImageUrls: [],
      depositPaid: false,
      depositRefunded: false,
    });
  });

  it("returns the deposit status fields and maps a Decimal estimatedPrice to a number", async () => {
    prismaMock.bookingRequest.findMany.mockResolvedValue([
      row({ estimatedPrice: "150", depositPaid: true, depositRefunded: true }),
    ]);

    const [result] = await getClientBookings(clientId);

    expect(result?.estimatedPrice).toBe(150);
    expect(result?.depositPaid).toBe(true);
    expect(result?.depositRefunded).toBe(true);
  });

  it("returns the request's existing design reference image URLs", async () => {
    prismaMock.bookingRequest.findMany.mockResolvedValue([
      row({
        imageUrls: ["https://utfs.io/f/a.jpg", "https://utfs.io/f/b.jpg"],
      }),
    ]);

    const [result] = await getClientBookings(clientId);

    expect(result?.designReferenceImageUrls).toEqual([
      "https://utfs.io/f/a.jpg",
      "https://utfs.io/f/b.jpg",
    ]);
  });

  it("spans bookings across multiple artists for the same client", async () => {
    prismaMock.bookingRequest.findMany.mockResolvedValue([
      row({ id: "request-1", artistName: "Artist A", artistHandle: "artist_a" }),
      row({ id: "request-2", artistName: "Artist B", artistHandle: "artist_b" }),
    ]);

    const result = await getClientBookings(clientId);

    expect(result.map((booking) => booking.artistInstagramHandle)).toEqual([
      "artist_a",
      "artist_b",
    ]);
  });

  it("scopes the query to this client only and orders by createdAt descending", async () => {
    prismaMock.bookingRequest.findMany.mockResolvedValue([]);

    const result = await getClientBookings(clientId);

    expect(result).toEqual([]);
    expect(prismaMock.bookingRequest.findMany).toHaveBeenCalledWith({
      where: { clientId },
      include: { artist: true, designReferences: true },
      orderBy: { createdAt: "desc" },
    });
  });
});
