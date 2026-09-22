import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/prisma";

import {
  CANCELLATION_WINDOW_ERROR_MESSAGE,
  REQUEST_ALREADY_RESOLVED_ERROR_MESSAGE,
  REQUEST_NOT_FOUND_ERROR_MESSAGE,
} from "../constants";
import type { RequestStatus } from "../types";
import { cancelBookingRequest } from "./cancelBookingRequest";

const createRefundMock = vi.fn();

// vi.mock calls are hoisted above imports by vitest's transform, so
// this replaces the real Stripe client before refundDeposit (called
// from cancelBookingRequest) ever sees it. Everything else -- the
// cancellation itself, recordDepositRefund -- still hits the real
// local Postgres, exercising the actual cross-domain call into
// billing's refundDeposit (CLAUDE.md 7.3.4).
vi.mock("@/lib/stripe", () => ({
  stripe: {
    refunds: {
      create: (...args: unknown[]) => createRefundMock(...args),
    },
  },
}));

describe("cancelBookingRequest", () => {
  let artistId: string;
  let clientId: string;

  beforeEach(async () => {
    createRefundMock.mockReset();
    artistId = randomUUID();
    clientId = randomUUID();
    await prisma.artist.create({
      data: {
        id: artistId,
        name: "Cancel Test Artist",
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

  it("cancels a PENDING request with no locked slot", async () => {
    const requestId = await createRequest("PENDING");

    const result = await cancelBookingRequest({
      bookingRequestId: requestId,
      clientProfileId: clientId,
    });

    expect(result).toEqual({ success: true });
    const updated = await prisma.bookingRequest.findUnique({
      where: { id: requestId },
    });
    expect(updated?.status).toBe("CANCELLED_BY_CLIENT");
  });

  it("does not apply a cancellation strike for a PENDING cancellation", async () => {
    const requestId = await createRequest("PENDING");

    await cancelBookingRequest({ bookingRequestId: requestId, clientProfileId: clientId });

    const client = await prisma.clientProfile.findUnique({ where: { id: clientId } });
    expect(client?.cancellationCount).toBe(0);
    expect(client?.enforcePrecharge).toBe(false);
  });

  it("cancels an APPROVED request outside the window and releases its slot", async () => {
    const farFuture = new Date(Date.now() + 30 * 24 * 60 * 60_000);
    const requestId = await createRequest("APPROVED", [
      { startTime: farFuture, endTime: new Date(farFuture.getTime() + 60 * 60_000) },
    ]);

    const result = await cancelBookingRequest({
      bookingRequestId: requestId,
      clientProfileId: clientId,
    });

    expect(result).toEqual({ success: true });
    const updated = await prisma.bookingRequest.findUnique({
      where: { id: requestId },
      include: { timeSlots: true },
    });
    expect(updated?.status).toBe("CANCELLED_BY_CLIENT");
    expect(updated?.timeSlots[0]?.status).toBe("RELEASED");
  });

  it("refunds a paid deposit in full when cancelling an APPROVED request outside the window", async () => {
    const farFuture = new Date(Date.now() + 30 * 24 * 60 * 60_000);
    const requestId = await createRequest(
      "APPROVED",
      [{ startTime: farFuture, endTime: new Date(farFuture.getTime() + 60 * 60_000) }],
      { depositPaid: true, stripePaymentIntentId: "pi_cancel_refund" }
    );
    createRefundMock.mockResolvedValue({ id: "re_cancel_refund" });

    const result = await cancelBookingRequest({
      bookingRequestId: requestId,
      clientProfileId: clientId,
    });

    expect(result).toEqual({ success: true });
    expect(createRefundMock).toHaveBeenCalledWith({
      payment_intent: "pi_cancel_refund",
    });
    const updated = await prisma.bookingRequest.findUnique({
      where: { id: requestId },
    });
    expect(updated?.depositRefunded).toBe(true);
  });

  it("does not attempt a refund when the deposit was never paid", async () => {
    const farFuture = new Date(Date.now() + 30 * 24 * 60 * 60_000);
    const requestId = await createRequest("APPROVED", [
      { startTime: farFuture, endTime: new Date(farFuture.getTime() + 60 * 60_000) },
    ]);

    await cancelBookingRequest({ bookingRequestId: requestId, clientProfileId: clientId });

    expect(createRefundMock).not.toHaveBeenCalled();
  });

  it("applies a cancellation strike and flags the client for an APPROVED cancellation", async () => {
    const farFuture = new Date(Date.now() + 30 * 24 * 60 * 60_000);
    const requestId = await createRequest("APPROVED", [
      { startTime: farFuture, endTime: new Date(farFuture.getTime() + 60 * 60_000) },
    ]);

    await cancelBookingRequest({ bookingRequestId: requestId, clientProfileId: clientId });

    const client = await prisma.clientProfile.findUnique({ where: { id: clientId } });
    expect(client?.cancellationCount).toBe(1);
    expect(client?.enforcePrecharge).toBe(true);
  });

  it("rejects cancelling an APPROVED request inside the 48-hour window", async () => {
    const soon = new Date(Date.now() + 10 * 60 * 60_000);
    const requestId = await createRequest("APPROVED", [
      { startTime: soon, endTime: new Date(soon.getTime() + 60 * 60_000) },
    ]);

    const result = await cancelBookingRequest({
      bookingRequestId: requestId,
      clientProfileId: clientId,
    });

    expect(result).toEqual({
      success: false,
      error: CANCELLATION_WINDOW_ERROR_MESSAGE,
    });
    const updated = await prisma.bookingRequest.findUnique({
      where: { id: requestId },
    });
    expect(updated?.status).toBe("APPROVED");
  });

  it("rejects cancelling an already-CANCELLED request", async () => {
    const requestId = await createRequest("CANCELLED_BY_CLIENT");

    const result = await cancelBookingRequest({
      bookingRequestId: requestId,
      clientProfileId: clientId,
    });

    expect(result).toEqual({
      success: false,
      error: REQUEST_ALREADY_RESOLVED_ERROR_MESSAGE,
    });
  });

  it("rejects cancelling a request that belongs to a different client", async () => {
    const requestId = await createRequest("PENDING");

    const result = await cancelBookingRequest({
      bookingRequestId: requestId,
      clientProfileId: randomUUID(),
    });

    expect(result).toEqual({
      success: false,
      error: REQUEST_NOT_FOUND_ERROR_MESSAGE,
    });
    const updated = await prisma.bookingRequest.findUnique({
      where: { id: requestId },
    });
    expect(updated?.status).toBe("PENDING");
  });

  it("rejects a request id that does not exist", async () => {
    const result = await cancelBookingRequest({
      bookingRequestId: randomUUID(),
      clientProfileId: clientId,
    });

    expect(result).toEqual({
      success: false,
      error: REQUEST_NOT_FOUND_ERROR_MESSAGE,
    });
  });
});
