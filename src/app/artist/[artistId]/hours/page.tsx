import { BusinessHoursSettings } from "@/domains/scheduling/components/BusinessHoursSettings";

interface ArtistHoursPageProps {
  params: Promise<{ artistId: string }>;
}

export default async function ArtistHoursPage({ params }: ArtistHoursPageProps) {
  const { artistId } = await params;

  return <BusinessHoursSettings artistId={artistId} />;
}
