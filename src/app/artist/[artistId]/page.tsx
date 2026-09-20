import { RequestCard } from "@/domains/intake/components/RequestCard";
import { getPendingIntakeRequests } from "@/domains/intake/services/getPendingIntakeRequests";

interface ArtistDashboardPageProps {
  params: Promise<{ artistId: string }>;
}

export default async function ArtistDashboardPage({
  params,
}: ArtistDashboardPageProps) {
  const { artistId } = await params;
  const pendingRequests = await getPendingIntakeRequests(artistId);

  if (pendingRequests.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-center">
        <p className="text-sm font-medium">No pending requests yet</p>
        <p className="text-sm text-muted-foreground">
          New booking requests from clients will show up here for you to review.
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
