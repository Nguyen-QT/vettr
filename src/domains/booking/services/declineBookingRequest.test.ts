import { prismaMock } from "@/testUtils/prismaMock";

import { describe, expect, it } from "vitest";

import { REQUEST_ALREADY_RESOLVED_ERROR_MESSAGE } from "../constants";
import { declineBookingRequest } from "./declineBookingRequest";
import { generateResponseMessage } from "./generateResponseMessage";

// Mocked-Prisma unit test (architecture.md §7). The status filter itself
// is proven against a real database in
// booking.deposits-and-strikes.integration.test.ts.
describe("declineBookingRequest", () => {
  it("declines only from PENDING or AWAITING_SLOT_CONFIRMATION, in one conditional update", async () => {
    prismaMock.bookingRequest.updateMany.mockResolvedValue({ count: 1 });

    const result = await declineBookingRequest({ bookingRequestId: "request-1" });

    expect(result).toEqual({
      success: true,
      responseMessage: generateResponseMessage("DECLINED"),
    });
    expect(prismaMock.bookingRequest.updateMany).toHaveBeenCalledWith({
      where: {
        id: "request-1",
        status: { in: ["PENDING", "AWAITING_SLOT_CONFIRMATION"] },
      },
      data: { status: "DECLINED" },
    });
  });

  it("refuses a request whose status is not declinable", async () => {
    prismaMock.bookingRequest.updateMany.mockResolvedValue({ count: 0 });

    const result = await declineBookingRequest({ bookingRequestId: "request-1" });

    expect(result).toEqual({
      success: false,
      error: REQUEST_ALREADY_RESOLVED_ERROR_MESSAGE,
    });
  });

  it("never reads the status before writing it", async () => {
    prismaMock.bookingRequest.updateMany.mockResolvedValue({ count: 1 });

    await declineBookingRequest({ bookingRequestId: "request-1" });

    expect(prismaMock.bookingRequest.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.bookingRequest.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});
