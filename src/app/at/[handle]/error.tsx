"use client";

import { Button } from "@/components/ui/button";

interface ArtistProfileErrorProps {
  error: Error & { digest?: string };
  retry: () => void;
}

// Themed boundary for the `/@handle` profile (54.1.6.1). The page throws
// a generic error on transient DB failures; retry() re-fetches the server
// component. `error.message` is never rendered, so nothing internal
// reaches the screen.
export default function ArtistProfileError({ retry }: ArtistProfileErrorProps) {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center gap-6 px-4 py-4 pb-[env(safe-area-inset-bottom)]">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Something went wrong
        </h1>
        <p className="text-base text-muted-foreground">
          We couldn&apos;t load this profile. Please try again.
        </p>
      </div>
      <Button className="w-full" onClick={() => retry()}>
        Try again
      </Button>
    </main>
  );
}
