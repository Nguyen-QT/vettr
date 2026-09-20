import { VisualIntakeForm } from "@/domains/intake/components/VisualIntakeForm";

interface BookPageProps {
  params: Promise<{ artistId: string }>;
}

export default async function BookPage({ params }: BookPageProps) {
  const { artistId } = await params;

  return (
    <main>
      <h1>Request a booking</h1>
      <VisualIntakeForm artistId={artistId} />
    </main>
  );
}
