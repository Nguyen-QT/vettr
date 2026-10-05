import { prismaMock } from "@/testUtils/prismaMock";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getPastDueAppointments } from "./getPastDueAppointments";

// Mocked-Prisma unit test (architecture.md §7). The "fully passed" /
// APPROVED / own-artist filters are DB-side, so they are asserted on the
// `where` payload (with the clock pinned); mapping and ordering are
// asserted on stubbed rows.
describe("getPastDueAppointments", () => {
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
      estimatedPrice: "150",
      designTags: ["floral"],
      aestheticTags: ["fine-line"],
      clientNotes: "notes",
      paymentMethod: overrides.paymentMethod ?? null,
      client: {
        instagramHandle: "test_client",
        email: "test_client@example.com",
        phone: null,
      },
      designReferences: [{ imageUrl: "https://utfs.io/f/a.jpg" }],
      timeSlots: overrides.timeSlots ?? [
        slot("2026-10-04T10:00:00.000Z", "2026-10-04T12:00:00.000Z"),
      ],
    } as never;
  }

  it("returns an APPROVED request whose slot has fully passed", async () => {
    prismaMock.bookingRequest.findMany.mockResolvedValue([row()]);

    const [result] = await getPastDueAppointments(artistId);

    expect(result).toEqual({
      id: "request-1",
      clientInstagramHandle: "test_client",
      clientEmail: "test_client@example.com",
      clientPhone: null,
      tier: "TIER_2",
      estimatedPrice: 150,
      designTags: ["floral"],
      aestheticTags: ["fine-line"],
      clientNotes: "notes",
      designReferenceImageUrls: ["https://utfs.io/f/a.jpg"],
      startTime: new Date("2026-10-04T10:00:00.000Z"),
      endTime: new Date("2026-10-04T12:00:00.000Z"),
      paymentMethod: null,
    });
  });

  it("surfaces the client's payment method preference", async () => {
    prismaMock.bookingRequest.findMany.mockResolvedValue([
      row({ paymentMethod: "CASH" }),
    ]);

    const [result] = await getPastDueAppointments(artistId);

    expect(result?.paymentMethod).toBe("CASH");
  });

  it("spans the earliest start and latest end across two adjacent slots", async () => {
    prismaMock.bookingRequest.findMany.mockResolvedValue([
      row({
        timeSlots: [
          slot("2026-10-04T12:00:00.000Z", "2026-10-04T14:00:00.000Z"),
          slot("2026-10-04T10:00:00.000Z", "2026-10-04T12:00:00.000Z"),
        ],
      }),
    ]);

    const [result] = await getPastDueAppointments(artistId);

    expect(result?.startTime).toEqual(new Date("2026-10-04T10:00:00.000Z"));
    expect(result?.endTime).toEqual(new Date("2026-10-04T14:00:00.000Z"));
  });

  it("orders multiple past-due appointments by start time ascending", async () => {
    prismaMock.bookingRequest.findMany.mockResolvedValue([
      row({
        id: "later",
        timeSlots: [slot("2026-10-04T10:00:00.000Z", "2026-10-04T12:00:00.000Z")],
      }),
      row({
        id: "earlier",
        timeSlots: [slot("2026-10-02T10:00:00.000Z", "2026-10-02T12:00:00.000Z")],
      }),
    ]);

    const result = await getPastDueAppointments(artistId);

    expect(result.map((appointment) => appointment.id)).toEqual([
      "earlier",
      "later",
    ]);
  });

  it("filters to APPROVED requests whose BOOKED slots have all already started (excludes upcoming and mid-appointment two-slot bookings, other statuses)", async () => {
    prismaMock.bookingRequest.findMany.mockResolvedValue([]);

    const result = await getPastDueAppointments(artistId);

    expect(result).toEqual([]);
    expect(prismaMock.bookingRequest.findMany).toHaveBeenCalledWith({
      where: {
        artistId,
        status: "APPROVED",
        AND: [
          { timeSlots: { some: { status: "BOOKED" } } },
          { timeSlots: { none: { status: "BOOKED", startTime: { gte: now } } } },
        ],
      },
      include: {
        client: true,
        designReferences: true,
        timeSlots: { where: { status: "BOOKED" } },
      },
    });
  });
});
