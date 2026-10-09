import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { SLOT_CONFLICT_ERROR_MESSAGE } from "@/domains/scheduling/constants";
import { prisma } from "@/lib/prisma";
import { createBookingRequest, createIntegrationTracker, uniqueSuffix } from "@/testUtils/integrationDb";

import { combineRequestedDateAndTime } from "../booking.schema";
import {
  APPOINTMENT_NOT_YET_DUE_ERROR_MESSAGE,
  INSTAGRAM_HANDLE_TAKEN_ERROR_MESSAGE,
} from "../constants";
import { cancelApprovedBookingAsArtist } from "./cancelApprovedBookingAsArtist";
import { cancelBookingRequest } from "./cancelBookingRequest";
import { getPendingBookingRequests } from "./getPendingBookingRequests";
import { markAppointmentNoShow } from "./markAppointmentNoShow";
import { rescheduleApprovedBooking } from "./rescheduleApprovedBooking";
import { updateClientProfile } from "./updateClientProfile";
import { updatePendingBookingRequest } from "./updatePendingBookingRequest";

// Stripe has no network access (or secrets) in the integration CI job; the
// refund path is covered by billing's own integration tests (28.3.2.5.1) and
// these fixtures keep depositPaid false, so the SDK is only mocked to keep the
// import graph free of secrets.
vi.mock("@/lib/stripe", () => ({
  stripe: { refunds: { create: vi.fn() } },
}));

// Lets one test force the strike step to fail inside the real transaction;
// every other test runs the real implementation.
const strikeControl = vi.hoisted(() => ({ failNext: false }));
vi.mock("./applyCancellationStrike", async () => {
  const actual =
    await vi.importActual<typeof import("./applyCancellationStrike")>(
      "./applyCancellationStrike"
    );
  return {
    applyCancellationStrike: async (
      ...args: Parameters<typeof actual.applyCancellationStrike>
    ): Promise<void> => {
      if (strikeControl.failNext) {
        strikeControl.failNext = false;
        throw new Error("forced strike failure");
      }
      return actual.applyCancellationStrike(...args);
    },
  };
});

// Real-database booking tests (28.3.2.5.2): the strike atomicity, rollback,
// slot-release and unique-constraint behaviour the mocked unit tier cannot
// prove.
const tracker = createIntegrationTracker();

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * MINUTE_MS);
}

// Far enough out to be beyond CANCELLATION_WINDOW_HOURS; offset keeps each
// slot in a test distinct.
function futureStart(offsetDays = 0): Date {
  return new Date(new Date("2040-01-01T11:00:00.000Z").getTime() + offsetDays * DAY_MS);
}

async function setup(): Promise<{ artistId: string; clientId: string }> {
  const artist = await tracker.createArtist();
  const client = await tracker.createClientProfile();
  return { artistId: artist.id, clientId: client.id };
}

async function createApprovedWithSlot(
  artistId: string,
  clientId: string,
  start: Date,
  minutes = 180
): Promise<{ id: string }> {
  const request = await createBookingRequest({
    artistId,
    clientId,
    requestedStartTime: start,
    status: "APPROVED",
  });
  await prisma.timeSlot.create({
    data: {
      bookingRequestId: request.id,
      artistId,
      startTime: start,
      endTime: addMinutes(start, minutes),
      status: "BOOKED",
    },
  });
  return request;
}

async function getClient(id: string) {
  return prisma.clientProfile.findUniqueOrThrow({ where: { id } });
}

describe("booking deposits-and-strikes integration", () => {
  beforeEach(async () => {
    strikeControl.failNext = false;
    await tracker.wipe();
  });

  afterAll(async () => {
    await tracker.wipe();
    await prisma.$disconnect();
  });

  describe("cancelBookingRequest", () => {
    it("releases the slot, cancels the request and strikes the client", async () => {
      const { artistId, clientId } = await setup();
      const request = await createApprovedWithSlot(artistId, clientId, futureStart());

      const result = await cancelBookingRequest({
        bookingRequestId: request.id,
        clientProfileId: clientId,
      });

      expect(result).toEqual({ success: true });
      const slots = await prisma.timeSlot.findMany({ where: { bookingRequestId: request.id } });
      expect(slots.map((s) => s.status)).toEqual(["RELEASED"]);
      const after = await prisma.bookingRequest.findUniqueOrThrow({ where: { id: request.id } });
      expect(after.status).toBe("CANCELLED_BY_CLIENT");
      const client = await getClient(clientId);
      expect(client.cancellationCount).toBe(1);
      expect(client.enforcePrecharge).toBe(true);
    });

    it("cancelling a PENDING request applies no strike", async () => {
      const { artistId, clientId } = await setup();
      const request = await createBookingRequest({
        artistId,
        clientId,
        requestedStartTime: futureStart(),
      });

      const result = await cancelBookingRequest({
        bookingRequestId: request.id,
        clientProfileId: clientId,
      });

      expect(result).toEqual({ success: true });
      const client = await getClient(clientId);
      expect(client.cancellationCount).toBe(0);
      expect(client.enforcePrecharge).toBe(false);
    });

    it("a failing strike rolls back the slot release and status change", async () => {
      const { artistId, clientId } = await setup();
      const request = await createApprovedWithSlot(artistId, clientId, futureStart());

      strikeControl.failNext = true;
      await expect(
        cancelBookingRequest({ bookingRequestId: request.id, clientProfileId: clientId })
      ).rejects.toThrow("forced strike failure");

      const slots = await prisma.timeSlot.findMany({ where: { bookingRequestId: request.id } });
      expect(slots.map((s) => s.status)).toEqual(["BOOKED"]);
      const after = await prisma.bookingRequest.findUniqueOrThrow({ where: { id: request.id } });
      expect(after.status).toBe("APPROVED");
      expect((await getClient(clientId)).cancellationCount).toBe(0);
    });

    it("concurrent cancellations by one client lose no strikes", async () => {
      const { artistId, clientId } = await setup();
      const count = 5;
      const requests = await Promise.all(
        Array.from({ length: count }, (_, i) =>
          createApprovedWithSlot(artistId, clientId, futureStart(i))
        )
      );

      const results = await Promise.all(
        requests.map((r) =>
          cancelBookingRequest({ bookingRequestId: r.id, clientProfileId: clientId })
        )
      );

      expect(results.every((r) => r.success)).toBe(true);
      const client = await getClient(clientId);
      expect(client.cancellationCount).toBe(count);
      expect(client.enforcePrecharge).toBe(true);
    });
  });

  describe("markAppointmentNoShow", () => {
    it("marks a past appointment NO_SHOW, keeps the slot BOOKED and strikes the client", async () => {
      const { artistId, clientId } = await setup();
      const request = await createApprovedWithSlot(
        artistId,
        clientId,
        new Date("2020-01-01T11:00:00.000Z")
      );

      const result = await markAppointmentNoShow({ bookingRequestId: request.id });

      expect(result).toEqual({ success: true });
      const after = await prisma.bookingRequest.findUniqueOrThrow({ where: { id: request.id } });
      expect(after.status).toBe("NO_SHOW");
      const slots = await prisma.timeSlot.findMany({ where: { bookingRequestId: request.id } });
      expect(slots.map((s) => s.status)).toEqual(["BOOKED"]);
      const client = await getClient(clientId);
      expect(client.cancellationCount).toBe(1);
      expect(client.enforcePrecharge).toBe(true);
    });

    it("rejects a future appointment without changing anything", async () => {
      const { artistId, clientId } = await setup();
      const request = await createApprovedWithSlot(artistId, clientId, futureStart());

      const result = await markAppointmentNoShow({ bookingRequestId: request.id });

      expect(result).toEqual({
        success: false,
        error: APPOINTMENT_NOT_YET_DUE_ERROR_MESSAGE,
      });
      const after = await prisma.bookingRequest.findUniqueOrThrow({ where: { id: request.id } });
      expect(after.status).toBe("APPROVED");
      expect((await getClient(clientId)).cancellationCount).toBe(0);
    });
  });

  describe("cancelApprovedBookingAsArtist", () => {
    it("releases the slot and cancels without striking the client", async () => {
      const { artistId, clientId } = await setup();
      const request = await createApprovedWithSlot(artistId, clientId, futureStart());

      const result = await cancelApprovedBookingAsArtist({ bookingRequestId: request.id });

      expect(result).toEqual({ success: true });
      const after = await prisma.bookingRequest.findUniqueOrThrow({ where: { id: request.id } });
      expect(after.status).toBe("CANCELLED_BY_ARTIST");
      const slots = await prisma.timeSlot.findMany({ where: { bookingRequestId: request.id } });
      expect(slots.map((s) => s.status)).toEqual(["RELEASED"]);
      const client = await getClient(clientId);
      expect(client.cancellationCount).toBe(0);
      expect(client.enforcePrecharge).toBe(false);
    });
  });

  describe("rescheduleApprovedBooking", () => {
    it("moves the booking: old slot released, new slot booked, start time updated", async () => {
      const { artistId, clientId } = await setup();
      const start = futureStart();
      const request = await createApprovedWithSlot(artistId, clientId, start);
      const newStart = futureStart(3);

      const result = await rescheduleApprovedBooking({
        bookingRequestId: request.id,
        newStartTime: newStart,
        durationMinutes: 120,
      });

      expect(result).toEqual({ success: true });
      const booked = await prisma.timeSlot.findMany({
        where: { bookingRequestId: request.id, status: "BOOKED" },
      });
      expect(booked).toHaveLength(1);
      expect(booked[0].startTime).toEqual(newStart);
      const released = await prisma.timeSlot.count({
        where: { bookingRequestId: request.id, status: "RELEASED" },
      });
      expect(released).toBe(1);
      const after = await prisma.bookingRequest.findUniqueOrThrow({ where: { id: request.id } });
      expect(after.requestedStartTime).toEqual(newStart);
    });

    it("a conflicting target rolls back, leaving the original slot booked", async () => {
      const { artistId, clientId } = await setup();
      const start = futureStart();
      const request = await createApprovedWithSlot(artistId, clientId, start);
      const targetStart = futureStart(3);
      await createApprovedWithSlot(artistId, clientId, targetStart);

      const result = await rescheduleApprovedBooking({
        bookingRequestId: request.id,
        newStartTime: targetStart,
        durationMinutes: 120,
      });

      expect(result).toEqual({ success: false, error: SLOT_CONFLICT_ERROR_MESSAGE });
      const slots = await prisma.timeSlot.findMany({ where: { bookingRequestId: request.id } });
      expect(slots).toHaveLength(1);
      expect(slots[0].status).toBe("BOOKED");
      expect(slots[0].startTime).toEqual(start);
      const after = await prisma.bookingRequest.findUniqueOrThrow({ where: { id: request.id } });
      expect(after.requestedStartTime).toEqual(start);
    });

    it("a duration over one slot books exactly two adjacent slots", async () => {
      const { artistId, clientId } = await setup();
      const request = await createApprovedWithSlot(artistId, clientId, futureStart());
      const newStart = futureStart(3);

      const result = await rescheduleApprovedBooking({
        bookingRequestId: request.id,
        newStartTime: newStart,
        durationMinutes: 300,
      });

      expect(result).toEqual({ success: true });
      const booked = await prisma.timeSlot.findMany({
        where: { bookingRequestId: request.id, status: "BOOKED" },
        orderBy: { startTime: "asc" },
      });
      expect(booked).toHaveLength(2);
      expect(booked[0].startTime).toEqual(newStart);
      expect(booked[0].endTime).toEqual(booked[1].startTime);
      expect(booked[1].endTime).toEqual(addMinutes(newStart, 300));
    });
  });

  describe("updateClientProfile", () => {
    const profile = {
      firstName: "Test",
      lastName: "Client",
      dateOfBirth: "1990-05-17",
    };

    it("translates a taken Instagram handle instead of throwing a raw P2002", async () => {
      const { clientId } = await setup();
      const other = await tracker.createClientProfile();
      const before = await getClient(clientId);

      const result = await updateClientProfile({
        clientProfileId: clientId,
        instagramHandle: other.instagramHandle,
        email: before.email,
        ...profile,
      });

      expect(result).toEqual({ success: false, error: INSTAGRAM_HANDLE_TAKEN_ERROR_MESSAGE });
      const after = await getClient(clientId);
      expect(after.instagramHandle).toBe(before.instagramHandle);
      expect(after.firstName).toBeNull();
    });

    it("persists the update, storing dateOfBirth as a UTC calendar date", async () => {
      const { clientId } = await setup();
      const suffix = uniqueSuffix();

      const result = await updateClientProfile({
        clientProfileId: clientId,
        instagramHandle: `it_client_new_${suffix}`,
        email: `it_client_new_${suffix}@example.com`,
        ...profile,
      });

      expect(result).toEqual({ success: true });
      const after = await getClient(clientId);
      expect(after.instagramHandle).toBe(`it_client_new_${suffix}`);
      expect(after.dateOfBirth?.toISOString()).toBe("1990-05-17T00:00:00.000Z");
    });
  });

  describe("updatePendingBookingRequest", () => {
    const requestedDate = "2040-03-05";

    async function pendingWithReferences(): Promise<{
      artistId: string;
      clientId: string;
      requestId: string;
    }> {
      const { artistId, clientId } = await setup();
      const request = await createBookingRequest({
        artistId,
        clientId,
        requestedStartTime: futureStart(),
      });
      await prisma.designReference.createMany({
        data: [
          { bookingRequestId: request.id, imageUrl: "https://example.com/old-1.png" },
          { bookingRequestId: request.id, imageUrl: "https://example.com/old-2.png" },
        ],
      });
      return { artistId, clientId, requestId: request.id };
    }

    it("replaces the design-reference set and updates the request fields", async () => {
      const { clientId, requestId } = await pendingWithReferences();

      const result = await updatePendingBookingRequest({
        bookingRequestId: requestId,
        clientProfileId: clientId,
        clientNotes: "updated notes",
        clientBudgetRange: { minPrice: 120, maxPrice: 240 },
        requestedDate,
        requestedTime: "11:00",
        designReferenceImageUrls: ["https://example.com/new.png"],
      });

      expect(result).toEqual({ success: true });
      const refs = await prisma.designReference.findMany({
        where: { bookingRequestId: requestId },
      });
      expect(refs.map((r) => r.imageUrl)).toEqual(["https://example.com/new.png"]);
      const after = await prisma.bookingRequest.findUniqueOrThrow({ where: { id: requestId } });
      expect(after.clientNotes).toBe("updated notes");
      expect(Number(after.minPrice)).toBe(120);
      expect(Number(after.maxPrice)).toBe(240);
      expect(after.requestedStartTime).toEqual(combineRequestedDateAndTime(requestedDate, "11:00"));
    });

    it("a conflicting time is rejected and leaves the references untouched", async () => {
      const { artistId, clientId, requestId } = await pendingWithReferences();
      const blockerStart = combineRequestedDateAndTime(requestedDate, "11:00");
      const blocker = await createBookingRequest({
        artistId,
        clientId,
        requestedStartTime: blockerStart,
        status: "APPROVED",
      });
      await prisma.timeSlot.create({
        data: {
          bookingRequestId: blocker.id,
          artistId,
          startTime: blockerStart,
          endTime: addMinutes(blockerStart, 180),
          status: "BOOKED",
        },
      });

      const result = await updatePendingBookingRequest({
        bookingRequestId: requestId,
        clientProfileId: clientId,
        clientBudgetRange: { minPrice: 120, maxPrice: 240 },
        requestedDate,
        requestedTime: "11:00",
        designReferenceImageUrls: ["https://example.com/new.png"],
      });

      expect(result).toEqual({ success: false, error: SLOT_CONFLICT_ERROR_MESSAGE });
      expect(await prisma.designReference.count({ where: { bookingRequestId: requestId } })).toBe(2);
    });
  });

  describe("getPendingBookingRequests", () => {
    it("returns PENDING and AWAITING_SLOT_CONFIRMATION oldest first, with real client defaults", async () => {
      const { artistId, clientId } = await setup();
      const first = await createBookingRequest({
        artistId,
        clientId,
        requestedStartTime: futureStart(),
      });
      const second = await createBookingRequest({
        artistId,
        clientId,
        requestedStartTime: futureStart(1),
        status: "AWAITING_SLOT_CONFIRMATION",
        proposedDurationMinutes: 300,
      });
      await createBookingRequest({
        artistId,
        clientId,
        requestedStartTime: futureStart(2),
        status: "APPROVED",
      });

      const summaries = await getPendingBookingRequests(artistId);

      expect(summaries.map((s) => s.id)).toEqual([first.id, second.id]);
      expect(summaries.every((s) => s.clientCancellationCount === 0)).toBe(true);
      expect(summaries.every((s) => s.clientEnforcePrecharge === false)).toBe(true);
    });
  });
});
