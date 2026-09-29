import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { getCurrentSession, logoutAction } from "@/domains/auth/actions";
import { RoleSwitcherContainer } from "@/domains/auth/components/RoleSwitcherContainer";

// View & Route (25.1.3): mirrors ArtistDashboardLayout's shell --
// wordmark link back to the portal root, logout form. Client portal
// has no tab nav (unlike the artist dashboard), so this is just the
// shared chrome `/client/page.tsx` used to hand-roll inline.
export default async function ClientLayout({ children }: LayoutProps<"/client">) {
  const session = await getCurrentSession();
  const isDualRole = !!session?.artistId && !!session?.clientProfileId;

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 bg-background">
        <div className="mx-auto flex w-full max-w-lg items-baseline justify-between px-4 py-3">
          <Link href="/client" className="text-base font-semibold">
            Vettr
          </Link>
          <div className="flex items-baseline gap-3">
            <RoleSwitcherContainer
              activeRole={session?.activeRole ?? "CLIENT"}
              isVisible={isDualRole}
            />
            <form action={logoutAction}>
              <Button type="submit" variant="link" className="h-auto p-0 text-sm">
                Log out
              </Button>
            </form>
          </div>
        </div>
        <Separator />
      </header>
      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-4 pb-[env(safe-area-inset-bottom)]">
        {children}
      </main>
    </div>
  );
}
