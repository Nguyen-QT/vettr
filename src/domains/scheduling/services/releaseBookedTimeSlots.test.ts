import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import { releaseBookedTimeSlots } from "./releaseBookedTimeSlots";

// Hits the real local Postgres database, same as the other scheduling
// service tests.
describe("releaseBookedTimeSlots", () => {
  let artistId: string;

  beforeEach(async () => {
    artistId = randomUUID();
    await prisma.artist.create({
      data: {
        id: artistId,
        name: "Release Slots Test Artist",
        instagramHandle: `test_artist_${artistId.slice(0, 8)}`,
        email: `${artistId}@example.com`,
      },
    });
  });

  afterEach(async () => {
    await prisma.bookingRequest.deleteMany({ where: { artistId } });
    await prisma.artist.delete({ where: { id: artistId } });
  });

  async function createBookingRequest(): Promise<string> {
    const clientId = randomUUID();
    await prisma.clientProfile.create({
      data: {
        id: clientId,
        instagramHandle: `test_client_${clientId.slice(0, 8)}`,
        email: `test_client_${clientId.slice(0, 8)}@example.com`,
      },
    });
    const request = await prisma.bookingRequest.create({
      data: { clientId, artistId, tier: "TIER_2", minPrice: 100, maxPrice: 200 },
    });
    return request.id;
  }

  it("releases a BOOKED slot to RELEASED", async () => {
    const bookingRequestId = await createBookingRequest();
    const slot = await prisma.timeSlot.create({
      data: {
        artistId,
        bookingRequestId,
        startTime: new Date("2026-11-10T11:00:00.000Z"),
        endTime: new Date("2026-11-10T12:00:00.000Z"),
        status: "BOOKED",
      },
    });

    await prisma.$transaction((tx) => releaseBookedTimeSlots(tx, bookingRequestId));

    const updated = await prisma.timeSlot.findUnique({ where: { id: slot.id } });
    expect(updated?.status).toBe("RELEASED");
  });

  it("releases both slots of a two-slot booking", async () => {
    const bookingRequestId = await createBookingRequest();
    const slotA = await prisma.timeSlot.create({
      data: {
        artistId,
        bookingRequestId,
        startTime: new Date("2026-11-11T11:00:00.000Z"),
        endTime: new Date("2026-11-11T12:00:00.000Z"),
        status: "BOOKED",
      },
    });
    const slotB = await prisma.timeSlot.create({
      data: {
        artistId,
        bookingRequestId,
        startTime: new Date("2026-11-11T12:00:00.000Z"),
        endTime: new Date("2026-11-11T13:00:00.000Z"),
        status: "BOOKED",
      },
    });

    await prisma.$transaction((tx) => releaseBookedTimeSlots(tx, bookingRequestId));

    const updated = await prisma.timeSlot.findMany({
      where: { id: { in: [slotA.id, slotB.id] } },
    });
    expect(updated.every((slot) => slot.status === "RELEASED")).toBe(true);
  });

  it("does not touch a different request's BOOKED slot", async () => {
    const bookingRequestId = await createBookingRequest();
    const otherRequestId = await createBookingRequest();
    const otherSlot = await prisma.timeSlot.create({
      data: {
        artistId,
        bookingRequestId: otherRequestId,
        startTime: new Date("2026-11-12T11:00:00.000Z"),
        endTime: new Date("2026-11-12T12:00:00.000Z"),
        status: "BOOKED",
      },
    });

    await prisma.$transaction((tx) => releaseBookedTimeSlots(tx, bookingRequestId));

    const untouched = await prisma.timeSlot.findUnique({
      where: { id: otherSlot.id },
    });
    expect(untouched?.status).toBe("BOOKED");
  });

  it("leaves an already-RELEASED slot alone without erroring", async () => {
    const bookingRequestId = await createBookingRequest();
    const slot = await prisma.timeSlot.create({
      data: {
        artistId,
        bookingRequestId,
        startTime: new Date("2026-11-13T11:00:00.000Z"),
        endTime: new Date("2026-11-13T12:00:00.000Z"),
        status: "RELEASED",
      },
    });

    await expect(
      prisma.$transaction((tx) => releaseBookedTimeSlots(tx, bookingRequestId))
    ).resolves.not.toThrow();

    const unchanged = await prisma.timeSlot.findUnique({ where: { id: slot.id } });
    expect(unchanged?.status).toBe("RELEASED");
  });
});
