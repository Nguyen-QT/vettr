import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { logoutAction } from "@/domains/auth/actions";

export default async function ArtistDashboardLayout({
  params,
  children,
}: LayoutProps<"/artist/[artistId]">) {
  const { artistId } = await params;

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 bg-background">
        <div className="mx-auto flex w-full max-w-lg items-baseline justify-between px-4 py-3 lg:max-w-6xl">
          <span className="text-base font-semibold">Vettr</span>
          <nav className="flex items-baseline gap-3 text-sm text-muted-foreground">
            <Link href={`/artist/${artistId}`}>Requests</Link>
            <Link href={`/artist/${artistId}/appointments`}>Upcoming</Link>
            <Link href={`/artist/${artistId}/calendar`}>Calendar</Link>
            <Link href={`/artist/${artistId}/hours`}>Business hours</Link>
            <form action={logoutAction}>
              <Button type="submit" variant="link" className="h-auto p-0 text-sm">
                Log out
              </Button>
            </form>
          </nav>
        </div>
        <Separator />
      </header>
      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-4 pb-[env(safe-area-inset-bottom)] lg:max-w-6xl">
        {children}
      </main>
    </div>
  );
}
