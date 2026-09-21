import { prisma } from "@/lib/prisma";

import type { UpcomingAppointmentSummary } from "../types";

// Data Gateway -> Domain Service boundary (CLAUDE.md 4.5): shapes
// APPROVED IntakeRequest rows with a future-dated TimeSlot into the
// read-only summary the upcoming-appointments view renders. Purely a
// query + mapping, same spirit as getPendingIntakeRequests -- no
// business rules here.
export async function getUpcomingAppointments(
  artistId: string
): Promise<UpcomingAppointmentSummary[]> {
  const requests = await prisma.intakeRequest.findMany({
    where: {
      artistId,
      status: "APPROVED",
      timeSlots: { some: { startTime: { gte: new Date() } } },
    },
    include: { client: true, designReferences: true, timeSlots: true },
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
