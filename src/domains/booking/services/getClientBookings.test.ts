import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import { getClientBookings } from "./getClientBookings";

// Hits the real local Postgres database, same as the other booking
// service tests.
describe("getClientBookings", () => {
  let clientId: string;
  const artistIds: string[] = [];

  beforeEach(async () => {
    clientId = randomUUID();
    await prisma.clientProfile.create({
      data: {
        id: clientId,
        instagramHandle: `test_client_${clientId.slice(0, 8)}`,
        email: `test_client_${clientId.slice(0, 8)}@example.com`,
      },
    });
  });

  afterEach(async () => {
    await prisma.bookingRequest.deleteMany({ where: { clientId } });
    await prisma.clientProfile.delete({ where: { id: clientId } });
    await prisma.bookingRequest.deleteMany({
      where: { artistId: { in: artistIds } },
    });
    await prisma.artist.deleteMany({ where: { id: { in: artistIds } } });
    artistIds.length = 0;
  });

  async function createArtist(name: string): Promise<string> {
    const artistId = randomUUID();
    await prisma.artist.create({
      data: {
        id: artistId,
        name,
        instagramHandle: `test_artist_${artistId.slice(0, 8)}`,
        email: `${artistId}@example.com`,
      },
    });
    artistIds.push(artistId);
    return artistId;
  }

  it("returns a booking with the artist's name and handle attached", async () => {
    const artistId = await createArtist("Booking Test Artist");

    const request = await prisma.bookingRequest.create({
      data: {
        clientId,
        artistId,
        tier: "TIER_2",
        minPrice: 100,
        maxPrice: 200,
        status: "PENDING",
      },
    });

    const result = await getClientBookings(clientId);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: request.id,
      status: "PENDING",
      tier: "TIER_2",
      minPrice: 100,
      maxPrice: 200,
    });
    expect(result[0].artistInstagramHandle).toMatch(/^test_artist_/);
  });

  it("returns the deposit status fields", async () => {
    const artistId = await createArtist("Deposit Status Test Artist");
    const paid = await prisma.bookingRequest.create({
      data: {
        clientId,
        artistId,
        tier: "TIER_2",
        minPrice: 100,
        maxPrice: 200,
        status: "APPROVED",
        depositPaid: true,
      },
    });
    const refunded = await prisma.bookingRequest.create({
      data: {
        clientId,
        artistId,
        tier: "TIER_3",
        minPrice: 100,
        maxPrice: 200,
        status: "CANCELLED_BY_CLIENT",
        depositPaid: true,
        depositRefunded: true,
      },
    });

    const result = await getClientBookings(clientId);

    expect(result.find((booking) => booking.id === paid.id)).toMatchObject({
      depositPaid: true,
      depositRefunded: false,
    });
    expect(result.find((booking) => booking.id === refunded.id)).toMatchObject({
      depositPaid: true,
      depositRefunded: true,
    });
  });

  it("returns the request's existing design reference image URLs", async () => {
    const artistId = await createArtist("Design Reference Test Artist");
    const request = await prisma.bookingRequest.create({
      data: {
        clientId,
        artistId,
        tier: "TIER_2",
        minPrice: 100,
        maxPrice: 200,
        status: "PENDING",
        designReferences: {
          create: [
            { imageUrl: "https://example.com/one.jpg" },
            { imageUrl: "https://example.com/two.jpg" },
          ],
        },
      },
    });

    const result = await getClientBookings(clientId);

    expect(
      result.find((booking) => booking.id === request.id)
        ?.designReferenceImageUrls
    ).toEqual(
      expect.arrayContaining([
        "https://example.com/one.jpg",
        "https://example.com/two.jpg",
      ])
    );
  });

  it("spans bookings across multiple artists for the same client", async () => {
    const firstArtistId = await createArtist("First Artist");
    const secondArtistId = await createArtist("Second Artist");

    await prisma.bookingRequest.create({
      data: {
        clientId,
        artistId: firstArtistId,
        tier: "TIER_2",
        minPrice: 100,
        maxPrice: 200,
        status: "PENDING",
      },
    });
    await prisma.bookingRequest.create({
      data: {
        clientId,
        artistId: secondArtistId,
        tier: "TIER_3",
        minPrice: 200,
        maxPrice: 300,
        status: "APPROVED",
      },
    });

    const result = await getClientBookings(clientId);

    expect(result).toHaveLength(2);
    expect(result.map((booking) => booking.artistName).sort()).toEqual([
      "First Artist",
      "Second Artist",
    ]);
  });

  it("does not include another client's booking", async () => {
    const artistId = await createArtist("Isolation Test Artist");
    const otherClientId = randomUUID();
    await prisma.clientProfile.create({
      data: {
        id: otherClientId,
        instagramHandle: `test_client_${otherClientId.slice(0, 8)}`,
        email: `test_client_${otherClientId.slice(0, 8)}@example.com`,
      },
    });
    await prisma.bookingRequest.create({
      data: {
        clientId: otherClientId,
        artistId,
        tier: "TIER_2",
        minPrice: 100,
        maxPrice: 200,
        status: "PENDING",
      },
    });

    const result = await getClientBookings(clientId);

    expect(result).toHaveLength(0);

    await prisma.bookingRequest.deleteMany({ where: { clientId: otherClientId } });
    await prisma.clientProfile.delete({ where: { id: otherClientId } });
  });

  it("orders bookings by createdAt descending", async () => {
    const artistId = await createArtist("Ordering Test Artist");

    const older = await prisma.bookingRequest.create({
      data: {
        clientId,
        artistId,
        tier: "TIER_2",
        minPrice: 100,
        maxPrice: 200,
        status: "PENDING",
        createdAt: new Date("2099-01-01T00:00:00.000Z"),
      },
    });
    const newer = await prisma.bookingRequest.create({
      data: {
        clientId,
        artistId,
        tier: "TIER_2",
        minPrice: 100,
        maxPrice: 200,
        status: "PENDING",
        createdAt: new Date("2099-01-02T00:00:00.000Z"),
      },
    });

    const result = await getClientBookings(clientId);

    expect(result.map((booking) => booking.id)).toEqual([newer.id, older.id]);
  });
});
