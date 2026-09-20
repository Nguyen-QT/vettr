export default function ArtistDashboardPage() {
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-center">
      <p className="text-sm font-medium">No pending requests yet</p>
      <p className="text-sm text-muted-foreground">
        New booking requests from clients will show up here for you to review.
      </p>
    </div>
  );
}
