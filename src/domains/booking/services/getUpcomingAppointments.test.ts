import { prismaMock } from "@/testUtils/prismaMock";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getUpcomingAppointments } from "./getUpcomingAppointments";

// Mocked-Prisma unit test (architecture.md §7). The APPROVED / own-artist /
// future-slot / BOOKED-only filters are DB-side, so they are asserted on
// the query payload (with the clock pinned); mapping and ordering are
// asserted on stubbed rows.
describe("getUpcomingAppointments", () => {
  const artistId = "artist-1";
  const now = new Date("2026-10-05T12:00:00.000Z");

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function slot(startIso: string, endIso: string) {
    return { startTime: new Date(startIso), endTime: new Date(endIso) };
  }

  function row(
    overrides: Partial<{
      id: string;
      paymentMethod: "CASH" | "CARD" | null;
      timeSlots: { startTime: Date; endTime: Date }[];
    }> = {}
  ) {
    return {
      id: overrides.id ?? "request-1",
      tier: "TIER_2",
      estimatedPrice: null,
      designTags: ["floral"],
      aestheticTags: ["fine-line"],
      clientNotes: "notes",
      paymentMethod: overrides.paymentMethod ?? null,
      client: {
        instagramHandle: "test_client",
        email: "test_client@example.com",
        phone: "555-0100",
      },
      designReferences: [{ imageUrl: "https://utfs.io/f/a.jpg" }],
      timeSlots: overrides.timeSlots ?? [
        slot("2026-10-06T10:00:00.000Z", "2026-10-06T12:00:00.000Z"),
      ],
    } as never;
  }

  it("returns an APPROVED request with a future single slot", async () => {
    prismaMock.bookingRequest.findMany.mockResolvedValue([row()]);

    const [result] = await getUpcomingAppointments(artistId);

    expect(result).toEqual({
      id: "request-1",
      clientInstagramHandle: "test_client",
      clientEmail: "test_client@example.com",
      clientPhone: "555-0100",
      tier: "TIER_2",
      estimatedPrice: null,
      designTags: ["floral"],
      aestheticTags: ["fine-line"],
      clientNotes: "notes",
      designReferenceImageUrls: ["https://utfs.io/f/a.jpg"],
      startTime: new Date("2026-10-06T10:00:00.000Z"),
      endTime: new Date("2026-10-06T12:00:00.000Z"),
      paymentMethod: null,
    });
  });

  it("surfaces the client's payment method preference", async () => {
    prismaMock.bookingRequest.findMany.mockResolvedValue([
      row({ paymentMethod: "CARD" }),
    ]);

    const [result] = await getUpcomingAppointments(artistId);

    expect(result?.paymentMethod).toBe("CARD");
  });

  it("spans the earliest start and latest end across two adjacent slots", async () => {
    prismaMock.bookingRequest.findMany.mockResolvedValue([
      row({
        timeSlots: [
          slot("2026-10-06T12:00:00.000Z", "2026-10-06T14:00:00.000Z"),
          slot("2026-10-06T10:00:00.000Z", "2026-10-06T12:00:00.000Z"),
        ],
      }),
    ]);

    const [result] = await getUpcomingAppointments(artistId);

    expect(result?.startTime).toEqual(new Date("2026-10-06T10:00:00.000Z"));
    expect(result?.endTime).toEqual(new Date("2026-10-06T14:00:00.000Z"));
  });

  it("orders multiple upcoming appointments by start time ascending", async () => {
    prismaMock.bookingRequest.findMany.mockResolvedValue([
      row({
        id: "later",
        timeSlots: [slot("2026-10-08T10:00:00.000Z", "2026-10-08T12:00:00.000Z")],
      }),
      row({
        id: "earlier",
        timeSlots: [slot("2026-10-06T10:00:00.000Z", "2026-10-06T12:00:00.000Z")],
      }),
    ]);

    const result = await getUpcomingAppointments(artistId);

    expect(result.map((appointment) => appointment.id)).toEqual([
      "earlier",
      "later",
    ]);
  });

  // Excludes non-APPROVED requests, past slots, and other artists'
  // appointments; reads only BOOKED slots so a RELEASED slot left behind
  // by rescheduleApprovedBooking (5.5.1) can't widen the range.
  it("filters to this artist's APPROVED requests with a future BOOKED slot, and includes only BOOKED slots", async () => {
    prismaMock.bookingRequest.findMany.mockResolvedValue([]);

    const result = await getUpcomingAppointments(artistId);

    expect(result).toEqual([]);
    expect(prismaMock.bookingRequest.findMany).toHaveBeenCalledWith({
      where: {
        artistId,
        status: "APPROVED",
        timeSlots: { some: { status: "BOOKED", startTime: { gte: now } } },
      },
      include: {
        client: true,
        designReferences: true,
        timeSlots: { where: { status: "BOOKED" } },
      },
    });
  });
});
