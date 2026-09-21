import { prisma } from "@/lib/prisma";

import type { ClientBookingSummary } from "../types";

// Data Gateway -> Domain Service boundary (CLAUDE.md 5.2): every
// IntakeRequest a client has across every artist they've booked with,
// for the client dashboard -- purely a query + mapping, same spirit as
// getPendingIntakeRequests/getUpcomingAppointments, just scoped by
// clientId instead of artistId and spanning all statuses.
export async function getClientBookings(
  clientProfileId: string
): Promise<ClientBookingSummary[]> {
  const requests = await prisma.intakeRequest.findMany({
    where: { clientId: clientProfileId },
    include: { artist: true },
    orderBy: { createdAt: "desc" },
  });

  return requests.map((request) => ({
    id: request.id,
    status: request.status,
    artistName: request.artist.name,
    artistInstagramHandle: request.artist.instagramHandle,
    tier: request.tier,
    minPrice: Number(request.minPrice),
    maxPrice: Number(request.maxPrice),
    estimatedPrice:
      request.estimatedPrice === null ? null : Number(request.estimatedPrice),
    clientNotes: request.clientNotes,
    requestedStartTime: request.requestedStartTime,
    createdAt: request.createdAt,
  }));
}
