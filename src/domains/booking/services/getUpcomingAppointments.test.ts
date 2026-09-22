import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import { getUpcomingAppointments } from "./getUpcomingAppointments";

// Hits the real local Postgres database, same as the other booking
// service tests.
describe("getUpcomingAppointments", () => {
  let artistId: string;

  beforeEach(async () => {
    artistId = randomUUID();
    await prisma.artist.create({
      data: {
        id: artistId,
        name: "Upcoming Appointments Test Artist",
        instagramHandle: `test_artist_${artistId.slice(0, 8)}`,
        email: `${artistId}@example.com`,
      },
    });
  });

  afterEach(async () => {
    await prisma.bookingRequest.deleteMany({ where: { artistId } });
    await prisma.artist.delete({ where: { id: artistId } });
  });

  async function createApprovedRequest(
    slots: { startTime: Date; endTime: Date }[],
    overrides: { status?: "PENDING" | "APPROVED"; estimatedPrice?: number } = {}
  ): Promise<string> {
    const clientId = randomUUID();
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
        status: overrides.status ?? "APPROVED",
        estimatedPrice: overrides.estimatedPrice ?? 150,
      },
    });
    for (const slot of slots) {
      await prisma.timeSlot.create({
        data: {
          artistId,
          bookingRequestId: request.id,
          startTime: slot.startTime,
          endTime: slot.endTime,
          status: "BOOKED",
        },
      });
    }
    return request.id;
  }

  it("returns an APPROVED request with a future single slot", async () => {
    const startTime = new Date("2099-05-01T11:00:00.000Z");
    const endTime = new Date("2099-05-01T12:00:00.000Z");
    const requestId = await createApprovedRequest([{ startTime, endTime }]);

    const result = await getUpcomingAppointments(artistId);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(requestId);
    expect(result[0].startTime).toEqual(startTime);
    expect(result[0].endTime).toEqual(endTime);
    expect(result[0].estimatedPrice).toBe(150);
  });

  it("spans the earliest start and latest end across two adjacent slots", async () => {
    const startTime = new Date("2099-05-02T11:00:00.000Z");
    const middleTime = new Date("2099-05-02T14:00:00.000Z");
    const endTime = new Date("2099-05-02T17:00:00.000Z");
    await createApprovedRequest([
      { startTime, endTime: middleTime },
      { startTime: middleTime, endTime },
    ]);

    const result = await getUpcomingAppointments(artistId);

    expect(result).toHaveLength(1);
    expect(result[0].startTime).toEqual(startTime);
    expect(result[0].endTime).toEqual(endTime);
  });

  it("excludes a request that is not APPROVED", async () => {
    await createApprovedRequest(
      [
        {
          startTime: new Date("2099-05-03T11:00:00.000Z"),
          endTime: new Date("2099-05-03T12:00:00.000Z"),
        },
      ],
      { status: "PENDING" }
    );

    const result = await getUpcomingAppointments(artistId);

    expect(result).toHaveLength(0);
  });

  it("excludes an APPROVED request whose slot is in the past", async () => {
    await createApprovedRequest([
      {
        startTime: new Date("2020-01-01T11:00:00.000Z"),
        endTime: new Date("2020-01-01T12:00:00.000Z"),
      },
    ]);

    const result = await getUpcomingAppointments(artistId);

    expect(result).toHaveLength(0);
  });

  it("does not let another artist's appointment show up", async () => {
    const otherArtistId = randomUUID();
    await prisma.artist.create({
      data: {
        id: otherArtistId,
        name: "Other Artist",
        instagramHandle: `test_artist_${otherArtistId.slice(0, 8)}`,
        email: `${otherArtistId}@example.com`,
      },
    });
    const otherClientId = randomUUID();
    await prisma.clientProfile.create({
      data: {
        id: otherClientId,
        instagramHandle: `test_client_${otherClientId.slice(0, 8)}`,
        email: `test_client_${otherClientId.slice(0, 8)}@example.com`,
      },
    });
    const otherRequest = await prisma.bookingRequest.create({
      data: {
        clientId: otherClientId,
        artistId: otherArtistId,
        tier: "TIER_2",
        minPrice: 100,
        maxPrice: 200,
        status: "APPROVED",
        estimatedPrice: 150,
      },
    });
    await prisma.timeSlot.create({
      data: {
        artistId: otherArtistId,
        bookingRequestId: otherRequest.id,
        startTime: new Date("2099-05-04T11:00:00.000Z"),
        endTime: new Date("2099-05-04T12:00:00.000Z"),
        status: "BOOKED",
      },
    });

    const result = await getUpcomingAppointments(artistId);

    expect(result).toHaveLength(0);

    await prisma.bookingRequest.deleteMany({ where: { artistId: otherArtistId } });
    await prisma.artist.delete({ where: { id: otherArtistId } });
  });

  it("orders multiple upcoming appointments by start time ascending", async () => {
    const laterId = await createApprovedRequest([
      {
        startTime: new Date("2099-05-10T11:00:00.000Z"),
        endTime: new Date("2099-05-10T12:00:00.000Z"),
      },
    ]);
    const soonerId = await createApprovedRequest([
      {
        startTime: new Date("2099-05-06T11:00:00.000Z"),
        endTime: new Date("2099-05-06T12:00:00.000Z"),
      },
    ]);

    const result = await getUpcomingAppointments(artistId);

    expect(result.map((appointment) => appointment.id)).toEqual([
      soonerId,
      laterId,
    ]);
  });

  it("ignores a RELEASED slot left behind by a reschedule, using only the current BOOKED one", async () => {
    const requestId = await createApprovedRequest([
      {
        startTime: new Date("2099-05-12T14:00:00.000Z"),
        endTime: new Date("2099-05-12T15:00:00.000Z"),
      },
    ]);
    // Simulates rescheduleApprovedBooking (5.5.1): the old slot is
    // released, not deleted, and a new one is booked in its place.
    await prisma.timeSlot.updateMany({
      where: { bookingRequestId: requestId },
      data: { status: "RELEASED" },
    });
    await prisma.timeSlot.create({
      data: {
        artistId,
        bookingRequestId: requestId,
        startTime: new Date("2099-05-20T11:00:00.000Z"),
        endTime: new Date("2099-05-20T12:00:00.000Z"),
        status: "BOOKED",
      },
    });

    const result = await getUpcomingAppointments(artistId);

    expect(result).toHaveLength(1);
    expect(result[0].startTime).toEqual(new Date("2099-05-20T11:00:00.000Z"));
    expect(result[0].endTime).toEqual(new Date("2099-05-20T12:00:00.000Z"));
  });
});
