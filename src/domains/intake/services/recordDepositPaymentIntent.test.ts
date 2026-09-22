import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import { recordDepositPaymentIntent } from "./recordDepositPaymentIntent";

// Hits the real local Postgres database, same as the other intake
// service tests.
describe("recordDepositPaymentIntent", () => {
  let artistId: string;
  let clientId: string;

  beforeEach(async () => {
    artistId = randomUUID();
    clientId = randomUUID();
    await prisma.artist.create({
      data: {
        id: artistId,
        name: "Record Deposit Test Artist",
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

  it("persists the deposit amount and PaymentIntent id", async () => {
    const request = await prisma.intakeRequest.create({
      data: {
        clientId,
        artistId,
        tier: "TIER_2",
        minPrice: 100,
        maxPrice: 200,
        status: "APPROVED",
      },
    });

    await recordDepositPaymentIntent(request.id, {
      depositAmount: 30,
      stripePaymentIntentId: "pi_record_123",
    });

    const updated = await prisma.intakeRequest.findUnique({
      where: { id: request.id },
    });
    expect(Number(updated?.depositAmount)).toBe(30);
    expect(updated?.stripePaymentIntentId).toBe("pi_record_123");
  });
});
