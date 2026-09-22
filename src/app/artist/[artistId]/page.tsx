import { RequestCard } from "@/domains/booking/components/RequestCard";
import { getPendingBookingRequests } from "@/domains/booking/services/getPendingBookingRequests";

interface ArtistDashboardPageProps {
  params: Promise<{ artistId: string }>;
}

export default async function ArtistDashboardPage({
  params,
}: ArtistDashboardPageProps) {
  const { artistId } = await params;
  const pendingRequests = await getPendingBookingRequests(artistId);

  if (pendingRequests.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-center">
        <p className="text-sm font-medium">Nothing needs your attention</p>
        <p className="text-sm text-muted-foreground">
          New booking requests from clients, and any awaiting your booking
          confirmation, will show up here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {pendingRequests.map((request) => (
        <RequestCard key={request.id} request={request} />
      ))}
    </div>
  );
}
