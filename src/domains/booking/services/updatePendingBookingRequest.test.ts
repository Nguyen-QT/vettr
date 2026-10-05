import { prismaMock } from "@/testUtils/prismaMock";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { SLOT_CONFLICT_ERROR_MESSAGE } from "@/domains/scheduling/constants";
import { getAvailableSlots } from "@/domains/scheduling/services/getAvailableSlots";

import {
  REQUEST_NOT_EDITABLE_ERROR_MESSAGE,
  REQUEST_NOT_FOUND_ERROR_MESSAGE,
} from "../constants";
import { combineRequestedDateAndTime } from "../booking.schema";
import { updatePendingBookingRequest } from "./updatePendingBookingRequest";

vi.mock("@/domains/scheduling/services/getAvailableSlots", () => ({
  getAvailableSlots: vi.fn(),
}));

// Mocked-Prisma unit test (architecture.md §7): scheduling's availability
// read is mocked at its public contract. The nested deleteMany/create
// atomicity of the design-reference replacement is Prisma's own guarantee
// -> asserted here as the exact payload, with real behaviour a 28.3
// integration-tier candidate.
describe("updatePendingBookingRequest", () => {
  const clientId = "client-1";
  const requestId = "request-1";

  const baseInput = {
    bookingRequestId: requestId,
    clientProfileId: clientId,
    clientBudgetRange: { minPrice: 150, maxPrice: 250 },
    requestedDate: "2099-08-01",
    requestedTime: "14:00" as const,
    designReferenceImageUrls: ["https://example.com/existing.jpg"],
  };

  beforeEach(() => {
    vi.mocked(getAvailableSlots).mockReset();
  });

  function stubRequest(status = "PENDING", ownerId = clientId): void {
    prismaMock.bookingRequest.findUnique.mockResolvedValue({
      id: requestId,
      artistId: "artist-1",
      clientId: ownerId,
      status,
    } as never);
    prismaMock.bookingRequest.update.mockResolvedValue({} as never);
  }

  function stubAvailability(available: boolean): void {
    vi.mocked(getAvailableSlots).mockResolvedValue([
      { time: "14:00", available },
    ] as never);
  }

  it("updates notes, budget, and requested time for a PENDING request", async () => {
    stubRequest();
    stubAvailability(true);

    const result = await updatePendingBookingRequest({
      ...baseInput,
      clientNotes: "Updated notes",
    });

    expect(result).toEqual({ success: true });
    expect(getAvailableSlots).toHaveBeenCalledWith("artist-1", "2099-08-01");
    expect(prismaMock.bookingRequest.update).toHaveBeenCalledWith({
      where: { id: requestId },
      data: {
        clientNotes: "Updated notes",
        minPrice: 150,
        maxPrice: 250,
        requestedStartTime: combineRequestedDateAndTime("2099-08-01", "14:00"),
        designReferences: {
          deleteMany: {},
          create: [{ imageUrl: "https://example.com/existing.jpg" }],
        },
      },
    });
  });

  it("replaces the request's design reference images wholesale", async () => {
    stubRequest();
    stubAvailability(true);

    const result = await updatePendingBookingRequest({
      ...baseInput,
      designReferenceImageUrls: [
        "https://example.com/new-1.jpg",
        "https://example.com/new-2.jpg",
      ],
    });

    expect(result).toEqual({ success: true });
    expect(prismaMock.bookingRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          designReferences: {
            deleteMany: {},
            create: [
              { imageUrl: "https://example.com/new-1.jpg" },
              { imageUrl: "https://example.com/new-2.jpg" },
            ],
          },
        }),
      })
    );
  });

  it("rejects a requested time that is no longer available", async () => {
    stubRequest();
    stubAvailability(false);

    const result = await updatePendingBookingRequest(baseInput);

    expect(result).toEqual({
      success: false,
      error: SLOT_CONFLICT_ERROR_MESSAGE,
    });
    expect(prismaMock.bookingRequest.update).not.toHaveBeenCalled();
  });

  it("rejects a requested time that is absent from the available slots", async () => {
    stubRequest();
    vi.mocked(getAvailableSlots).mockResolvedValue([
      { time: "11:00", available: true },
    ] as never);

    const result = await updatePendingBookingRequest(baseInput);

    expect(result).toEqual({
      success: false,
      error: SLOT_CONFLICT_ERROR_MESSAGE,
    });
    expect(prismaMock.bookingRequest.update).not.toHaveBeenCalled();
  });

  it("rejects editing a request that is not PENDING", async () => {
    stubRequest("APPROVED");

    const result = await updatePendingBookingRequest(baseInput);

    expect(result).toEqual({
      success: false,
      error: REQUEST_NOT_EDITABLE_ERROR_MESSAGE,
    });
    expect(getAvailableSlots).not.toHaveBeenCalled();
    expect(prismaMock.bookingRequest.update).not.toHaveBeenCalled();
  });

  it("rejects editing a request that belongs to a different client", async () => {
    stubRequest("PENDING", "someone-else");

    const result = await updatePendingBookingRequest(baseInput);

    expect(result).toEqual({
      success: false,
      error: REQUEST_NOT_FOUND_ERROR_MESSAGE,
    });
    expect(prismaMock.bookingRequest.update).not.toHaveBeenCalled();
  });

  it("rejects a request id that does not exist", async () => {
    prismaMock.bookingRequest.findUnique.mockResolvedValue(null);

    const result = await updatePendingBookingRequest(baseInput);

    expect(result).toEqual({
      success: false,
      error: REQUEST_NOT_FOUND_ERROR_MESSAGE,
    });
    expect(prismaMock.bookingRequest.update).not.toHaveBeenCalled();
  });
});
