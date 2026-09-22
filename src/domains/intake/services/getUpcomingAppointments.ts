import { prisma } from "@/lib/prisma";

import type { UpcomingAppointmentSummary } from "../types";

// Data Gateway -> Domain Service boundary (CLAUDE.md 4.5): shapes
// APPROVED IntakeRequest rows with a future-dated TimeSlot into the
// read-only summary the upcoming-appointments view renders. Purely a
// query + mapping, same spirit as getPendingIntakeRequests -- no
// business rules here.
//
// Filters to BOOKED TimeSlots specifically, not just "any TimeSlot
// row" -- since rescheduleApprovedBooking (5.5.1) started leaving a
// RELEASED row behind on an otherwise-still-APPROVED request, an
// unfiltered read would span from the old (released) slot's start to
// the new (booked) slot's end, a bogus mixed range.
export async function getUpcomingAppointments(
  artistId: string
): Promise<UpcomingAppointmentSummary[]> {
  const requests = await prisma.intakeRequest.findMany({
    where: {
      artistId,
      status: "APPROVED",
      timeSlots: { some: { status: "BOOKED", startTime: { gte: new Date() } } },
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
      };
    })
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
}
