import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import { getPastDueAppointments } from "./getPastDueAppointments";

describe("getPastDueAppointments", () => {
  let artistId: string;

  beforeEach(async () => {
    artistId = randomUUID();
    await prisma.artist.create({
      data: {
        id: artistId,
        name: "Past Due Test Artist",
        instagramHandle: `test_artist_${artistId.slice(0, 8)}`,
        email: `${artistId}@example.com`,
      },
    });
  });

  afterEach(async () => {
    await prisma.intakeRequest.deleteMany({ where: { artistId } });
    await prisma.artist.delete({ where: { id: artistId } });
  });

  async function createApprovedRequest(
    slots: { startTime: Date; endTime: Date }[],
    status: "APPROVED" | "PENDING" = "APPROVED"
  ): Promise<string> {
    const clientId = randomUUID();
    await prisma.clientProfile.create({
      data: {
        id: clientId,
        instagramHandle: `test_client_${clientId.slice(0, 8)}`,
        email: `test_client_${clientId.slice(0, 8)}@example.com`,
      },
    });
    const request = await prisma.intakeRequest.create({
      data: { clientId, artistId, tier: "TIER_2", minPrice: 100, maxPrice: 200, status },
    });
    for (const slot of slots) {
      await prisma.timeSlot.create({
        data: {
          artistId,
          intakeRequestId: request.id,
          startTime: slot.startTime,
          endTime: slot.endTime,
          status: "BOOKED",
        },
      });
    }
    return request.id;
  }

  it("returns an APPROVED request whose slot has fully passed", async () => {
    const pastStart = new Date(Date.now() - 48 * 60 * 60_000);
    const requestId = await createApprovedRequest([
      { startTime: pastStart, endTime: new Date(pastStart.getTime() + 60 * 60_000) },
    ]);

    const result = await getPastDueAppointments(artistId);

    expect(result.map((appointment) => appointment.id)).toContain(requestId);
  });

  it("excludes an APPROVED request whose slot is still upcoming", async () => {
    const futureStart = new Date(Date.now() + 48 * 60 * 60_000);
    await createApprovedRequest([
      { startTime: futureStart, endTime: new Date(futureStart.getTime() + 60 * 60_000) },
    ]);

    const result = await getPastDueAppointments(artistId);

    expect(result).toHaveLength(0);
  });

  it("excludes a two-slot booking where one slot is still upcoming", async () => {
    const pastStart = new Date(Date.now() - 60 * 60_000);
    const futureStart = new Date(Date.now() + 60 * 60_000);
    await createApprovedRequest([
      { startTime: pastStart, endTime: new Date(pastStart.getTime() + 60 * 60_000) },
      { startTime: futureStart, endTime: new Date(futureStart.getTime() + 60 * 60_000) },
    ]);

    const result = await getPastDueAppointments(artistId);

    expect(result).toHaveLength(0);
  });

  it("excludes a request that is not APPROVED", async () => {
    const pastStart = new Date(Date.now() - 48 * 60 * 60_000);
    await createApprovedRequest(
      [{ startTime: pastStart, endTime: new Date(pastStart.getTime() + 60 * 60_000) }],
      "PENDING"
    );

    const result = await getPastDueAppointments(artistId);

    expect(result).toHaveLength(0);
  });
});
