import { notFound, permanentRedirect } from "next/navigation";

import { getArtistHandleById } from "@/domains/directory/services/getArtistHandleById";

interface LegacyBookPageProps {
  params: Promise<{ artistId: string }>;
}

// Legacy booking URL (pre-54.1): 308s to the canonical `/@handle/book`
// (54.1.6.2) so existing links keep working. Unknown id -> 404. DB
// failures log a non-PII context and become a generic 500; notFound()
// and the redirect stay outside the catch so their throws aren't
// swallowed.
export default async function LegacyBookPage({ params }: LegacyBookPageProps) {
  const { artistId } = await params;

  const handle = await getArtistHandleById(artistId).catch(() => {
    console.error("redirectLegacyBookPage failed", {
      reason: "HANDLE_LOOKUP_FAILED",
      artistId,
    });
    throw new Error("Booking page unavailable");
  });
  if (!handle) {
    notFound();
  }

  permanentRedirect(`/@${handle}/book`);
}
