import Link from "next/link";

import { Separator } from "@/components/ui/separator";

interface ArtistSettingsLayoutProps {
  params: Promise<{ artistId: string }>;
  children: React.ReactNode;
}

// View & Route (CLAUDE.md 20.1): shared nav for the settings sub-views
// that used to live together on one combined page. Plain links with no
// active-state highlighting, same convention as the parent dashboard
// nav (src/app/artist/[artistId]/layout.tsx).
export default async function ArtistSettingsLayout({
  params,
  children,
}: ArtistSettingsLayoutProps) {
  const { artistId } = await params;

  return (
    <div className="flex flex-col gap-4">
      <nav className="flex flex-wrap gap-3 text-sm text-muted-foreground">
        <Link href={`/artist/${artistId}/settings/hours`}>
          Business hours
        </Link>
        <Link href={`/artist/${artistId}/settings/blackout-dates`}>
          Blackout dates
        </Link>
        <Link href={`/artist/${artistId}/settings/deposits`}>
          Deposit amounts
        </Link>
      </nav>
      <Separator />
      {children}
    </div>
  );
}
