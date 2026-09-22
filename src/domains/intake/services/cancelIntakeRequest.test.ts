import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import {
  CANCELLATION_WINDOW_ERROR_MESSAGE,
  REQUEST_ALREADY_RESOLVED_ERROR_MESSAGE,
  REQUEST_NOT_FOUND_ERROR_MESSAGE,
} from "../constants";
import type { RequestStatus } from "../types";
import { cancelIntakeRequest } from "./cancelIntakeRequest";

describe("cancelIntakeRequest", () => {
  let artistId: string;
  let clientId: string;

  beforeEach(async () => {
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
    await prisma.intakeRequest.deleteMany({ where: { artistId } });
    await prisma.clientProfile.delete({ where: { id: clientId } });
    await prisma.artist.delete({ where: { id: artistId } });
  });

  async function createRequest(
    status: RequestStatus,
    timeSlots: { startTime: Date; endTime: Date }[] = []
  ): Promise<string> {
    const request = await prisma.intakeRequest.create({
      data: {
        clientId,
        artistId,
        tier: "TIER_2",
        minPrice: 100,
        maxPrice: 200,
        status,
      },
    });
    for (const slot of timeSlots) {
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

  it("cancels a PENDING request with no locked slot", async () => {
    const requestId = await createRequest("PENDING");

    const result = await cancelIntakeRequest({
      intakeRequestId: requestId,
      clientProfileId: clientId,
    });

    expect(result).toEqual({ success: true });
    const updated = await prisma.intakeRequest.findUnique({
      where: { id: requestId },
    });
    expect(updated?.status).toBe("CANCELLED_BY_CLIENT");
  });

  it("cancels an APPROVED request outside the window and releases its slot", async () => {
    const farFuture = new Date(Date.now() + 30 * 24 * 60 * 60_000);
    const requestId = await createRequest("APPROVED", [
      { startTime: farFuture, endTime: new Date(farFuture.getTime() + 60 * 60_000) },
    ]);

    const result = await cancelIntakeRequest({
      intakeRequestId: requestId,
      clientProfileId: clientId,
    });

    expect(result).toEqual({ success: true });
    const updated = await prisma.intakeRequest.findUnique({
      where: { id: requestId },
      include: { timeSlots: true },
    });
    expect(updated?.status).toBe("CANCELLED_BY_CLIENT");
    expect(updated?.timeSlots[0]?.status).toBe("RELEASED");
  });

  it("rejects cancelling an APPROVED request inside the 48-hour window", async () => {
    const soon = new Date(Date.now() + 10 * 60 * 60_000);
    const requestId = await createRequest("APPROVED", [
      { startTime: soon, endTime: new Date(soon.getTime() + 60 * 60_000) },
    ]);

    const result = await cancelIntakeRequest({
      intakeRequestId: requestId,
      clientProfileId: clientId,
    });

    expect(result).toEqual({
      success: false,
      error: CANCELLATION_WINDOW_ERROR_MESSAGE,
    });
    const updated = await prisma.intakeRequest.findUnique({
      where: { id: requestId },
    });
    expect(updated?.status).toBe("APPROVED");
  });

  it("rejects cancelling an already-CANCELLED request", async () => {
    const requestId = await createRequest("CANCELLED_BY_CLIENT");

    const result = await cancelIntakeRequest({
      intakeRequestId: requestId,
      clientProfileId: clientId,
    });

    expect(result).toEqual({
      success: false,
      error: REQUEST_ALREADY_RESOLVED_ERROR_MESSAGE,
    });
  });

  it("rejects cancelling a request that belongs to a different client", async () => {
    const requestId = await createRequest("PENDING");

    const result = await cancelIntakeRequest({
      intakeRequestId: requestId,
      clientProfileId: randomUUID(),
    });

    expect(result).toEqual({
      success: false,
      error: REQUEST_NOT_FOUND_ERROR_MESSAGE,
    });
    const updated = await prisma.intakeRequest.findUnique({
      where: { id: requestId },
    });
    expect(updated?.status).toBe("PENDING");
  });

  it("rejects a request id that does not exist", async () => {
    const result = await cancelIntakeRequest({
      intakeRequestId: randomUUID(),
      clientProfileId: clientId,
    });

    expect(result).toEqual({
      success: false,
      error: REQUEST_NOT_FOUND_ERROR_MESSAGE,
    });
  });
});
