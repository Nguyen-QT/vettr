import { prismaMock } from "@/testUtils/prismaMock";

import { describe, expect, it } from "vitest";

import { releaseBookedTimeSlots } from "./releaseBookedTimeSlots";

// Mocked-Prisma unit test (architecture.md §7): the service's whole
// behaviour is the updateMany filter + data. "Other request's slot / an
// already-RELEASED slot is untouched" is guaranteed by the `where` below;
// proving it against real rows is a 28.3 integration-tier candidate.
describe("releaseBookedTimeSlots", () => {
  it("releases only BOOKED slots belonging to the given request", async () => {
    prismaMock.timeSlot.updateMany.mockResolvedValue({ count: 1 });

    await releaseBookedTimeSlots(prismaMock, "request-1");

    expect(prismaMock.timeSlot.updateMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.timeSlot.updateMany).toHaveBeenCalledWith({
      where: { bookingRequestId: "request-1", status: "BOOKED" },
      data: { status: "RELEASED" },
    });
  });

  it("releases every slot of a two-slot booking in one bulk update", async () => {
    prismaMock.timeSlot.updateMany.mockResolvedValue({ count: 2 });

    await releaseBookedTimeSlots(prismaMock, "request-2");

    expect(prismaMock.timeSlot.updateMany).toHaveBeenCalledTimes(1);
  });

  it("scopes the update to the given request id, never another request's slots", async () => {
    prismaMock.timeSlot.updateMany.mockResolvedValue({ count: 0 });

    await releaseBookedTimeSlots(prismaMock, "request-3");

    const [args] = prismaMock.timeSlot.updateMany.mock.calls[0];
    expect(args.where).toEqual({ bookingRequestId: "request-3", status: "BOOKED" });
  });

  it("resolves without erroring when nothing matches (already RELEASED / none booked)", async () => {
    prismaMock.timeSlot.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      releaseBookedTimeSlots(prismaMock, "request-4")
    ).resolves.toBeUndefined();
  });
});
