import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import { REQUEST_NOT_FOUND_ERROR_MESSAGE } from "../constants";
import { updateBookingPaymentMethod } from "./updateBookingPaymentMethod";

describe("updateBookingPaymentMethod", () => {
  let artistId: string;
  let otherArtistId: string;
  let clientId: string;
  let requestId: string;

  beforeEach(async () => {
    artistId = randomUUID();
    otherArtistId = randomUUID();
    clientId = randomUUID();
    await prisma.artist.createMany({
      data: [
        {
          id: artistId,
          name: "Payment Method Test Artist",
          instagramHandle: `test_artist_${artistId.slice(0, 8)}`,
          email: `${artistId}@example.com`,
        },
        {
          id: otherArtistId,
          name: "Other Test Artist",
          instagramHandle: `test_artist_${otherArtistId.slice(0, 8)}`,
          email: `${otherArtistId}@example.com`,
        },
      ],
    });
    await prisma.clientProfile.create({
      data: {
        id: clientId,
        instagramHandle: `test_client_${clientId.slice(0, 8)}`,
        email: `test_client_${clientId.slice(0, 8)}@example.com`,
      },
    });
    const request = await prisma.bookingRequest.create({
      data: {
        clientId,
        artistId,
        tier: "TIER_2",
        minPrice: 100,
        maxPrice: 200,
        status: "APPROVED",
        paymentMethod: "CASH",
      },
    });
    requestId = request.id;
  });

  afterEach(async () => {
    await prisma.bookingRequest.deleteMany({
      where: { artistId: { in: [artistId, otherArtistId] } },
    });
    await prisma.clientProfile.delete({ where: { id: clientId } });
    await prisma.artist.deleteMany({
      where: { id: { in: [artistId, otherArtistId] } },
    });
  });

  it("overrides the payment method for the owning artist", async () => {
    const result = await updateBookingPaymentMethod({
      bookingRequestId: requestId,
      artistId,
      paymentMethod: "CARD",
    });

    expect(result).toEqual({ success: true });
    const updated = await prisma.bookingRequest.findUnique({
      where: { id: requestId },
    });
    expect(updated?.paymentMethod).toBe("CARD");
  });

  it("rejects an artist who does not own the request", async () => {
    const result = await updateBookingPaymentMethod({
      bookingRequestId: requestId,
      artistId: otherArtistId,
      paymentMethod: "CARD",
    });

    expect(result).toEqual({
      success: false,
      error: REQUEST_NOT_FOUND_ERROR_MESSAGE,
    });
    const unchanged = await prisma.bookingRequest.findUnique({
      where: { id: requestId },
    });
    expect(unchanged?.paymentMethod).toBe("CASH");
  });

  it("rejects a request id that does not exist", async () => {
    const result = await updateBookingPaymentMethod({
      bookingRequestId: randomUUID(),
      artistId,
      paymentMethod: "CARD",
    });

    expect(result).toEqual({
      success: false,
      error: REQUEST_NOT_FOUND_ERROR_MESSAGE,
    });
  });
});
