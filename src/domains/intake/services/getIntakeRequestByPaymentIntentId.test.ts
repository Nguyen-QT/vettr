import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import { getIntakeRequestByPaymentIntentId } from "./getIntakeRequestByPaymentIntentId";

// Hits the real local Postgres database, same as the other intake
// service tests.
describe("getIntakeRequestByPaymentIntentId", () => {
  let artistId: string;
  let clientId: string;

  beforeEach(async () => {
    artistId = randomUUID();
    clientId = randomUUID();
    await prisma.artist.create({
      data: {
        id: artistId,
        name: "Deposit View Test Artist",
        instagramHandle: `test_artist_${artistId.slice(0, 8)}`,
        email: `${artistId}@example.com`,
      },
    });
    await prisma.clientProfile.create({
      data: {
        id: clientId,
        instagramHandle: `test_client_${clientId.slice(0, 8)}`,
        email: `test_client_${clientId.slice(0, 8)}@example.com`,
      },
    });
  });

  afterEach(async () => {
    await prisma.intakeRequest.deleteMany({ where: { artistId } });
    await prisma.clientProfile.delete({ where: { id: clientId } });
    await prisma.artist.delete({ where: { id: artistId } });
  });

  it("returns the narrow view for the request matching the PaymentIntent id", async () => {
    const request = await prisma.intakeRequest.create({
      data: {
        clientId,
        artistId,
        tier: "TIER_3",
        minPrice: 100,
        maxPrice: 200,
        status: "APPROVED",
        depositPaid: false,
        stripePaymentIntentId: "pi_lookup_123",
      },
    });

    const result = await getIntakeRequestByPaymentIntentId("pi_lookup_123");

    expect(result).toEqual({
      id: request.id,
      clientId,
      artistId,
      tier: "TIER_3",
      status: "APPROVED",
      depositPaid: false,
    });
  });

  it("returns null for a PaymentIntent id that matches no request", async () => {
    const result = await getIntakeRequestByPaymentIntentId("pi_unknown");

    expect(result).toBeNull();
  });
});
