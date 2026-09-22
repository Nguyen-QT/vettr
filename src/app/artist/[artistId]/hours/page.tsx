import { Separator } from "@/components/ui/separator";
import { DepositAmountsSettings } from "@/domains/billing/components/DepositAmountsSettings";
import { BusinessHoursSettings } from "@/domains/scheduling/components/BusinessHoursSettings";

interface ArtistHoursPageProps {
  params: Promise<{ artistId: string }>;
}

export default async function ArtistHoursPage({ params }: ArtistHoursPageProps) {
  const { artistId } = await params;

  return (
    <div className="flex flex-col gap-8">
      <BusinessHoursSettings artistId={artistId} />
      <Separator />
      <DepositAmountsSettings />
    </div>
  );
}
