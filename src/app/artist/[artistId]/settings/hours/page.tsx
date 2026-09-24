import { WeeklyHoursSettings } from "@/domains/scheduling/components/WeeklyHoursSettings";

interface ArtistSettingsHoursPageProps {
  params: Promise<{ artistId: string }>;
}

export default async function ArtistSettingsHoursPage({
  params,
}: ArtistSettingsHoursPageProps) {
  const { artistId } = await params;

  return <WeeklyHoursSettings artistId={artistId} />;
}
