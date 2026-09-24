import { prisma } from "@/lib/prisma";

import type { UpcomingAppointmentSummary } from "../types";

// Data Gateway -> Domain Service boundary (CLAUDE.md 5.6): APPROVED
// requests whose booked appointment time has fully passed with no
// resolution yet (mark completed, no-show, or artist-cancel) -- the
// counterpart to getUpcomingAppointments, which only ever shows
// future-dated bookings and so silently drops an appointment the
// moment its time passes, with nothing surfaced for the artist to act
// on. "Fully passed" means every BOOKED TimeSlot has already started
// (not just some), the mirror image of getUpcomingAppointments' "some
// slot is still upcoming" check -- keeps the two lists mutually
// exclusive for a two-slot booking that's currently mid-appointment.
export async function getPastDueAppointments(
  artistId: string
): Promise<UpcomingAppointmentSummary[]> {
  const requests = await prisma.bookingRequest.findMany({
    where: {
      artistId,
      status: "APPROVED",
      AND: [
        { timeSlots: { some: { status: "BOOKED" } } },
        { timeSlots: { none: { status: "BOOKED", startTime: { gte: new Date() } } } },
      ],
    },
    include: {
      client: true,
      designReferences: true,
      timeSlots: { where: { status: "BOOKED" } },
    },
  });

  return requests
    .map((request) => {
      const startTime = request.timeSlots.reduce(
        (earliest, slot) => (slot.startTime < earliest ? slot.startTime : earliest),
        request.timeSlots[0].startTime
      );
      const endTime = request.timeSlots.reduce(
        (latest, slot) => (slot.endTime > latest ? slot.endTime : latest),
        request.timeSlots[0].endTime
      );

      return {
        id: request.id,
        clientInstagramHandle: request.client.instagramHandle,
        clientEmail: request.client.email,
        clientPhone: request.client.phone,
        tier: request.tier,
        estimatedPrice:
          request.estimatedPrice === null ? null : Number(request.estimatedPrice),
        designTags: request.designTags,
        aestheticTags: request.aestheticTags,
        clientNotes: request.clientNotes,
        designReferenceImageUrls: request.designReferences.map(
          (reference) => reference.imageUrl
        ),
        startTime,
        endTime,
        paymentMethod: request.paymentMethod,
      };
    })
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
}
