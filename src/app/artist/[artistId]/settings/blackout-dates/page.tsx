import { BlackoutDateSettings } from "@/domains/scheduling/components/BlackoutDateSettings";

interface ArtistSettingsBlackoutDatesPageProps {
  params: Promise<{ artistId: string }>;
}

export default async function ArtistSettingsBlackoutDatesPage({
  params,
}: ArtistSettingsBlackoutDatesPageProps) {
  const { artistId } = await params;

  return <BlackoutDateSettings artistId={artistId} />;
}
