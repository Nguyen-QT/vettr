import { VisualIntakeForm } from "@/domains/intake/components/VisualIntakeForm";
import { getTierReferenceImages } from "@/domains/intake/services/getTierReferenceImages";

interface BookPageProps {
  params: Promise<{ artistId: string }>;
}

export default async function BookPage({ params }: BookPageProps) {
  const { artistId } = await params;
  const tierReferenceImages = await getTierReferenceImages(artistId);

  return (
    <main>
      <h1>Request a booking</h1>
      <VisualIntakeForm
        artistId={artistId}
        tierReferenceImages={tierReferenceImages}
      />
    </main>
  );
}
