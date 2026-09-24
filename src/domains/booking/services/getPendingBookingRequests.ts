import { prisma } from "@/lib/prisma";

import type { PendingBookingRequestSummary } from "../types";

// Data Gateway -> Domain Service boundary (CLAUDE.md): shapes raw
// BookingRequest rows into the read-only summary the dashboard renders.
// No business rules here, purely a query + mapping — validateComplexity
// remains the only place complexity/content rules are evaluated.
// Includes AWAITING_SLOT_CONFIRMATION alongside PENDING (4.1i) so a
// proposed double-slot booking stays visible for the artist to confirm,
// not just brand-new requests.
export async function getPendingBookingRequests(
  artistId: string
): Promise<PendingBookingRequestSummary[]> {
  const requests = await prisma.bookingRequest.findMany({
    where: {
      artistId,
      status: { in: ["PENDING", "AWAITING_SLOT_CONFIRMATION"] },
    },
    include: { client: true, designReferences: true },
    orderBy: { createdAt: "asc" },
  });

  return requests.map((request) => ({
    id: request.id,
    status: request.status as "PENDING" | "AWAITING_SLOT_CONFIRMATION",
    clientInstagramHandle: request.client.instagramHandle,
    clientEmail: request.client.email,
    clientPhone: request.client.phone,
    tier: request.tier,
    minPrice: Number(request.minPrice),
    maxPrice: Number(request.maxPrice),
    designTags: request.designTags,
    aestheticTags: request.aestheticTags,
    clientNotes: request.clientNotes,
    designReferenceImageUrls: request.designReferences.map(
      (reference) => reference.imageUrl
    ),
    requestedStartTime: request.requestedStartTime,
    clientMaxEndTime: request.clientMaxEndTime,
    createdAt: request.createdAt,
    clientCancellationCount: request.client.cancellationCount,
    clientEnforcePrecharge: request.client.enforcePrecharge,
    paymentMethod: request.paymentMethod,
  }));
}
