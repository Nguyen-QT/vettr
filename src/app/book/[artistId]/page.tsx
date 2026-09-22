import { getCurrentSession } from "@/domains/auth/actions";
import { VisualIntakeForm } from "@/domains/intake/components/VisualIntakeForm";
import { getClientProfileContactDetails } from "@/domains/intake/services/getClientProfileContactDetails";
import { getTierReferenceImages } from "@/domains/intake/services/getTierReferenceImages";

interface BookPageProps {
  params: Promise<{ artistId: string }>;
}

export default async function BookPage({ params }: BookPageProps) {
  const { artistId } = await params;
  const tierReferenceImages = await getTierReferenceImages(artistId);

  // Prefills the form for a signed-in client (CLAUDE.md 6.1) instead
  // of asking them to retype what's already on file -- this route was
  // never actually session-gated (src/proxy.ts's matcher only covers
  // /artist/:path*/client/:path*), so a signed-out/guest visitor still
  // reaches this same page unaffected.
  const session = await getCurrentSession();
  const initialClientDetails =
    session?.role === "CLIENT" && session.clientProfileId
      ? await getClientProfileContactDetails(session.clientProfileId)
      : null;

  return (
    <main>
      <h1>Request a booking</h1>
      <VisualIntakeForm
        artistId={artistId}
        tierReferenceImages={tierReferenceImages}
        initialClientDetails={initialClientDetails ?? undefined}
      />
    </main>
  );
}
