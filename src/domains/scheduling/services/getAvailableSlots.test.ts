import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import { getAvailableSlots } from "./getAvailableSlots";

// Hits the real local Postgres database, same as confirmTimeSlot.test.ts.
describe("getAvailableSlots", () => {
  let artistId: string;
  let intakeRequestId: string;

  beforeEach(async () => {
    artistId = randomUUID();
    await prisma.artist.create({
      data: {
        id: artistId,
        name: "Availability Test Artist",
        instagramHandle: `test_artist_${artistId.slice(0, 8)}`,
        email: `${artistId}@example.com`,
      },
    });

    const clientId = randomUUID();
    await prisma.clientProfile.create({
      data: {
        id: clientId,
        instagramHandle: `test_client_${clientId.slice(0, 8)}`,
      },
    });
    const request = await prisma.intakeRequest.create({
      data: {
        clientId,
        artistId,
        tier: "TIER_2",
        minPrice: 100,
        maxPrice: 200,
      },
    });
    intakeRequestId = request.id;
  });

  afterEach(async () => {
    await prisma.intakeRequest.deleteMany({ where: { artistId } });
    await prisma.artist.delete({ where: { id: artistId } });
  });

  async function bookSlot(startTime: Date, endTime: Date) {
    await prisma.timeSlot.create({
      data: { artistId, intakeRequestId, startTime, endTime, status: "BOOKED" },
    });
  }

  it("marks every fixed time available with no existing bookings", async () => {
    const result = await getAvailableSlots(artistId, "2027-02-01");

    expect(result).toEqual([
      { time: "11:00", available: true },
      { time: "14:00", available: true },
      { time: "17:30", available: true },
    ]);
  });

  it("marks only the booked time unavailable, leaving adjacent non-overlapping times free", async () => {
    await bookSlot(
      new Date("2027-02-02T11:00:00.000Z"),
      new Date("2027-02-02T14:00:00.000Z")
    );

    const result = await getAvailableSlots(artistId, "2027-02-02");

    expect(result).toEqual([
      { time: "11:00", available: false },
      { time: "14:00", available: true },
      { time: "17:30", available: true },
    ]);
  });

  it("marks both times unavailable when a two-slot booking spans them", async () => {
    await bookSlot(
      new Date("2027-02-03T11:00:00.000Z"),
      new Date("2027-02-03T14:00:00.000Z")
    );
    await bookSlot(
      new Date("2027-02-03T14:00:00.000Z"),
      new Date("2027-02-03T16:00:00.000Z")
    );

    const result = await getAvailableSlots(artistId, "2027-02-03");

    expect(result).toEqual([
      { time: "11:00", available: false },
      { time: "14:00", available: false },
      { time: "17:30", available: true },
    ]);
  });

  it("does not let a booking on a different date affect availability", async () => {
    await bookSlot(
      new Date("2027-02-04T11:00:00.000Z"),
      new Date("2027-02-04T14:00:00.000Z")
    );

    const result = await getAvailableSlots(artistId, "2027-02-05");

    expect(result.every((slot) => slot.available)).toBe(true);
  });

  it("does not let another artist's booking affect availability", async () => {
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
      },
    });
    const otherRequest = await prisma.intakeRequest.create({
      data: {
        clientId: otherClientId,
        artistId: otherArtistId,
        tier: "TIER_2",
        minPrice: 100,
        maxPrice: 200,
      },
    });
    await prisma.timeSlot.create({
      data: {
        artistId: otherArtistId,
        intakeRequestId: otherRequest.id,
        startTime: new Date("2027-02-06T11:00:00.000Z"),
        endTime: new Date("2027-02-06T14:00:00.000Z"),
        status: "BOOKED",
      },
    });

    const result = await getAvailableSlots(artistId, "2027-02-06");

    expect(result.every((slot) => slot.available)).toBe(true);

    await prisma.intakeRequest.deleteMany({ where: { artistId: otherArtistId } });
    await prisma.artist.delete({ where: { id: otherArtistId } });
  });
});
