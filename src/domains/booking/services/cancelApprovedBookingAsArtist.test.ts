import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/prisma";

import { REQUEST_NOT_FOUND_ERROR_MESSAGE } from "../constants";
import type { RequestStatus } from "../types";
import { cancelApprovedBookingAsArtist } from "./cancelApprovedBookingAsArtist";

const createRefundMock = vi.fn();

// vi.mock calls are hoisted above imports by vitest's transform, so
// this replaces the real Stripe client before refundDeposit (called
// from cancelApprovedBookingAsArtist) ever sees it (CLAUDE.md 7.3.4).
vi.mock("@/lib/stripe", () => ({
  stripe: {
    refunds: {
      create: (...args: unknown[]) => createRefundMock(...args),
    },
  },
}));

describe("cancelApprovedBookingAsArtist", () => {
  let artistId: string;
  let clientId: string;

  beforeEach(async () => {
    createRefundMock.mockReset();
    artistId = randomUUID();
    clientId = randomUUID();
    await prisma.artist.create({
      data: {
        id: artistId,
        name: "Artist Cancel Test Artist",
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
    await prisma.timeSlot.deleteMany({ where: { artistId } });
    await prisma.bookingRequest.deleteMany({ where: { artistId } });
    await prisma.clientProfile.delete({ where: { id: clientId } });
    await prisma.artist.delete({ where: { id: artistId } });
  });

  async function createRequest(
    status: RequestStatus,
    timeSlots: { startTime: Date; endTime: Date }[] = [],
    depositOverrides: { depositPaid?: boolean; stripePaymentIntentId?: string } = {}
  ): Promise<string> {
    const request = await prisma.bookingRequest.create({
      data: {
        clientId,
        artistId,
        tier: "TIER_2",
        minPrice: 100,
        maxPrice: 200,
        status,
        depositPaid: depositOverrides.depositPaid ?? false,
        stripePaymentIntentId: depositOverrides.stripePaymentIntentId,
      },
    });
    for (const slot of timeSlots) {
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

  it("cancels an APPROVED booking and releases its slot", async () => {
    const startTime = new Date("2099-06-10T11:00:00");
    const requestId = await createRequest("APPROVED", [
      { startTime, endTime: new Date(startTime.getTime() + 60 * 60_000) },
    ]);

    const result = await cancelApprovedBookingAsArtist({ bookingRequestId: requestId });

    expect(result).toEqual({ success: true });
    const updated = await prisma.bookingRequest.findUnique({
      where: { id: requestId },
      include: { timeSlots: true },
    });
    expect(updated?.status).toBe("CANCELLED_BY_ARTIST");
    expect(updated?.timeSlots[0]?.status).toBe("RELEASED");
  });

  it("refunds a paid deposit in full", async () => {
    const startTime = new Date("2099-06-12T11:00:00");
    const requestId = await createRequest(
      "APPROVED",
      [{ startTime, endTime: new Date(startTime.getTime() + 60 * 60_000) }],
      { depositPaid: true, stripePaymentIntentId: "pi_artist_cancel_refund" }
    );
    createRefundMock.mockResolvedValue({ id: "re_artist_cancel_refund" });

    const result = await cancelApprovedBookingAsArtist({ bookingRequestId: requestId });

    expect(result).toEqual({ success: true });
    expect(createRefundMock).toHaveBeenCalledWith({
      payment_intent: "pi_artist_cancel_refund",
    });
    const updated = await prisma.bookingRequest.findUnique({
      where: { id: requestId },
    });
    expect(updated?.depositRefunded).toBe(true);
  });

  it("does not attempt a refund when the deposit was never paid", async () => {
    const startTime = new Date("2099-06-13T11:00:00");
    const requestId = await createRequest("APPROVED", [
      { startTime, endTime: new Date(startTime.getTime() + 60 * 60_000) },
    ]);

    await cancelApprovedBookingAsArtist({ bookingRequestId: requestId });

    expect(createRefundMock).not.toHaveBeenCalled();
  });

  it("never applies a cancellation strike to the client", async () => {
    const startTime = new Date("2099-06-11T11:00:00");
    const requestId = await createRequest("APPROVED", [
      { startTime, endTime: new Date(startTime.getTime() + 60 * 60_000) },
    ]);

    await cancelApprovedBookingAsArtist({ bookingRequestId: requestId });

    const client = await prisma.clientProfile.findUnique({ where: { id: clientId } });
    expect(client?.cancellationCount).toBe(0);
    expect(client?.enforcePrecharge).toBe(false);
  });

  it("rejects cancelling a request that is not APPROVED", async () => {
    const requestId = await createRequest("PENDING");

    const result = await cancelApprovedBookingAsArtist({ bookingRequestId: requestId });

    expect(result).toEqual({
      success: false,
      error: "Only an approved booking can be cancelled.",
    });
  });

  it("rejects a request id that does not exist", async () => {
    const result = await cancelApprovedBookingAsArtist({
      bookingRequestId: randomUUID(),
    });

    expect(result).toEqual({
      success: false,
      error: REQUEST_NOT_FOUND_ERROR_MESSAGE,
    });
  });
});
