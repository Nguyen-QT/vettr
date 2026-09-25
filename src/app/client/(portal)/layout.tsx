import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { logoutAction } from "@/domains/auth/actions";

// View & Route (25.1.3): mirrors ArtistDashboardLayout's shell --
// wordmark link back to the portal root, logout form. Client portal
// has no tab nav (unlike the artist dashboard), so this is just the
// shared chrome `/client/page.tsx` used to hand-roll inline.
export default function ClientLayout({ children }: LayoutProps<"/client">) {
  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 bg-background">
        <div className="mx-auto flex w-full max-w-lg items-baseline justify-between px-4 py-3">
          <Link href="/client" className="text-base font-semibold">
            Vettr
          </Link>
          <form action={logoutAction}>
            <Button type="submit" variant="link" className="h-auto p-0 text-sm">
              Log out
            </Button>
          </form>
        </div>
        <Separator />
      </header>
      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-4 pb-[env(safe-area-inset-bottom)]">
        {children}
      </main>
    </div>
  );
}
