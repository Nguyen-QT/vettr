import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

// Themed root 404 (54.1.6.1): rendered for notFound() anywhere in the app
// (e.g. an unknown `/@handle`) and for every unmatched URL.
export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center gap-6 px-4 py-4 pb-[env(safe-area-inset-bottom)]">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Page not found
        </h1>
        <p className="text-base text-muted-foreground">
          This link may be wrong, or the artist may have moved.
        </p>
      </div>
      <Link href="/" className={buttonVariants({ className: "w-full" })}>
        Go home
      </Link>
    </main>
  );
}
