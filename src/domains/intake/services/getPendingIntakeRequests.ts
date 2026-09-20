import { prisma } from "@/lib/prisma";

import type { PendingIntakeRequestSummary } from "../types";

// Data Gateway -> Domain Service boundary (CLAUDE.md): shapes raw
// IntakeRequest rows into the read-only summary the dashboard renders.
// No business rules here, purely a query + mapping — validateComplexity
// remains the only place complexity/content rules are evaluated.
export async function getPendingIntakeRequests(
  artistId: string
): Promise<PendingIntakeRequestSummary[]> {
  const requests = await prisma.intakeRequest.findMany({
    where: { artistId, status: "PENDING" },
    include: { client: true, designReferences: true },
    orderBy: { createdAt: "asc" },
  });

  return requests.map((request) => ({
    id: request.id,
    clientInstagramHandle: request.client.instagramHandle,
    tier: request.tier,
    minPrice: Number(request.minPrice),
    maxPrice: Number(request.maxPrice),
    designTags: request.designTags,
    aestheticTags: request.aestheticTags,
    clientNotes: request.clientNotes,
    designReferenceImageUrls: request.designReferences.map(
      (reference) => reference.imageUrl
    ),
    createdAt: request.createdAt,
  }));
}
