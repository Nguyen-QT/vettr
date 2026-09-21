import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SLOT_CONFLICT_ERROR_MESSAGE } from "@/domains/scheduling/constants";
import { prisma } from "@/lib/prisma";

import {
  REQUEST_NOT_EDITABLE_ERROR_MESSAGE,
  REQUEST_NOT_FOUND_ERROR_MESSAGE,
} from "../constants";
import { combineRequestedDateAndTime } from "../intake.schema";
import type { RequestStatus } from "../types";
import { updatePendingIntakeRequest } from "./updatePendingIntakeRequest";

describe("updatePendingIntakeRequest", () => {
  let artistId: string;
  let clientId: string;

  beforeEach(async () => {
    artistId = randomUUID();
    clientId = randomUUID();
    await prisma.artist.create({
      data: {
        id: artistId,
        name: "Update Test Artist",
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

  async function createRequest(status: RequestStatus): Promise<string> {
    const request = await prisma.intakeRequest.create({
      data: {
        clientId,
        artistId,
        tier: "TIER_2",
        minPrice: 100,
        maxPrice: 200,
        status,
        requestedStartTime: new Date("2099-08-01T11:00:00.000Z"),
      },
    });
    return request.id;
  }

  it("updates notes, budget, and requested time for a PENDING request", async () => {
    const requestId = await createRequest("PENDING");

    const result = await updatePendingIntakeRequest({
      intakeRequestId: requestId,
      clientProfileId: clientId,
      clientNotes: "Updated notes",
      clientBudgetRange: { minPrice: 150, maxPrice: 250 },
      requestedDate: "2099-08-01",
      requestedTime: "14:00",
    });

    expect(result).toEqual({ success: true });
    const updated = await prisma.intakeRequest.findUnique({
      where: { id: requestId },
    });
    expect(updated?.clientNotes).toBe("Updated notes");
    expect(Number(updated?.minPrice)).toBe(150);
    expect(Number(updated?.maxPrice)).toBe(250);
    expect(updated?.requestedStartTime).toEqual(
      combineRequestedDateAndTime("2099-08-01", "14:00")
    );
  });

  it("rejects a requested time that is no longer available", async () => {
    await prisma.timeSlot.create({
      data: {
        artistId,
        intakeRequestId: await createRequest("APPROVED"),
        // Local time, matching getAvailableSlots' own slotWindow()
        // construction -- not UTC.
        startTime: new Date("2099-08-01T14:00:00"),
        endTime: new Date("2099-08-01T17:00:00"),
        status: "BOOKED",
      },
    });
    const requestId = await createRequest("PENDING");

    const result = await updatePendingIntakeRequest({
      intakeRequestId: requestId,
      clientProfileId: clientId,
      clientBudgetRange: { minPrice: 100, maxPrice: 200 },
      requestedDate: "2099-08-01",
      requestedTime: "14:00",
    });

    expect(result).toEqual({
      success: false,
      error: SLOT_CONFLICT_ERROR_MESSAGE,
    });
  });

  it("rejects editing a request that is not PENDING", async () => {
    const requestId = await createRequest("APPROVED");

    const result = await updatePendingIntakeRequest({
      intakeRequestId: requestId,
      clientProfileId: clientId,
      clientBudgetRange: { minPrice: 100, maxPrice: 200 },
      requestedDate: "2099-08-02",
      requestedTime: "11:00",
    });

    expect(result).toEqual({
      success: false,
      error: REQUEST_NOT_EDITABLE_ERROR_MESSAGE,
    });
  });

  it("rejects editing a request that belongs to a different client", async () => {
    const requestId = await createRequest("PENDING");

    const result = await updatePendingIntakeRequest({
      intakeRequestId: requestId,
      clientProfileId: randomUUID(),
      clientBudgetRange: { minPrice: 100, maxPrice: 200 },
      requestedDate: "2099-08-02",
      requestedTime: "11:00",
    });

    expect(result).toEqual({
      success: false,
      error: REQUEST_NOT_FOUND_ERROR_MESSAGE,
    });
  });

  it("rejects a request id that does not exist", async () => {
    const result = await updatePendingIntakeRequest({
      intakeRequestId: randomUUID(),
      clientProfileId: clientId,
      clientBudgetRange: { minPrice: 100, maxPrice: 200 },
      requestedDate: "2099-08-02",
      requestedTime: "11:00",
    });

    expect(result).toEqual({
      success: false,
      error: REQUEST_NOT_FOUND_ERROR_MESSAGE,
    });
  });
});
