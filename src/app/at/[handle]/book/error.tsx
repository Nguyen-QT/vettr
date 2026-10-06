"use client";

import { Button } from "@/components/ui/button";

interface ArtistBookErrorProps {
  error: Error & { digest?: string };
  retry: () => void;
}

// Themed boundary for `/@handle/book` (54.1.6.2) -- without it the
// profile's boundary above would catch these with profile copy. The page
// throws a generic error on transient DB failures; retry() re-fetches the
// server component. `error.message` is never rendered.
export default function ArtistBookError({ retry }: ArtistBookErrorProps) {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center gap-6 px-4 py-4 pb-[env(safe-area-inset-bottom)]">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Something went wrong
        </h1>
        <p className="text-base text-muted-foreground">
          We couldn&apos;t load this booking page. Please try again.
        </p>
      </div>
      <Button className="w-full" onClick={() => retry()}>
        Try again
      </Button>
    </main>
  );
}
