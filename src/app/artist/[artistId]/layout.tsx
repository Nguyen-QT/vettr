import { Separator } from "@/components/ui/separator";

export default function ArtistDashboardLayout({
  children,
}: LayoutProps<"/artist/[artistId]">) {
  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 bg-background">
        <div className="mx-auto flex w-full max-w-lg items-baseline justify-between px-4 py-3">
          <span className="text-base font-semibold">Vettr</span>
          <span className="text-sm text-muted-foreground">Dashboard</span>
        </div>
        <Separator />
      </header>
      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-4 pb-[env(safe-area-inset-bottom)]">
        {children}
      </main>
    </div>
  );
}
