import Link from "next/link";
import { redirect, unstable_rethrow } from "next/navigation";
import { Suspense } from "react";

import { PortalGateSection } from "@/components/ui/portal-gate-section";
import { Separator } from "@/components/ui/separator";
import { getCurrentSession } from "@/domains/auth/actions";
import { ClientSignInContainer } from "@/domains/auth/components/ClientSignInContainer";
import { ARTIST_LOGIN_PATH, CLIENT_DASHBOARD_PATH } from "@/domains/auth/constants";
import type { SessionWithAccount } from "@/domains/auth/types";
import { FindArtistContainer } from "@/domains/directory/components/FindArtistContainer";

// Fails open: the gate is public and the proxy still guards /client and
// /artist, so a session-lookup outage just shows the signed-out gate.
// unstable_rethrow comes first so cookies()'s dynamic-usage signal (and
// any other Next control flow) is never swallowed -- otherwise `next
// build` would prerender `/` as static with no redirect. Logs a non-PII
// context only, never the raw driver error.
async function getGateSession(): Promise<SessionWithAccount | null> {
  try {
    return await getCurrentSession();
  } catch (error) {
    unstable_rethrow(error);
    console.error("renderPortalGate failed", { reason: "SESSION_LOOKUP_FAILED" });
    return null;
  }
}

// Private Portal Gate (54.4.6.1). No public directory: artists share
// `/@handle` links, so a signed-out visitor finds their artist by handle,
// signs in as a client by email code, or follows the artist sign-in link.
export default async function PortalGatePage() {
  const session = await getGateSession();

  // Keyed on activeRole (the session's current view), not the account's
  // home role, so a dual-role account in client view lands on /client.
  // Outside the catch so redirect()'s control-flow throw stays uncaught.
  // An ARTIST view with no artistId falls through to the gate -- the
  // proxy would only bounce it to the login page.
  if (session?.activeRole === "CLIENT") {
    redirect(CLIENT_DASHBOARD_PATH);
  }
  if (session?.activeRole === "ARTIST" && session.artistId) {
    redirect(`/artist/${session.artistId}`);
  }

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-8 px-4 py-4 pb-[env(safe-area-inset-bottom)]">
      <div className="flex flex-col gap-2 pt-8">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Vettr</h1>
        <p className="text-base text-muted-foreground">
          A private booking portal. Find your artist by their handle, or sign in
          to see your bookings.
        </p>
      </div>

      <PortalGateSection title="Find your artist">
        <FindArtistContainer />
      </PortalGateSection>

      <PortalGateSection title="Client sign in">
        {/* useClientSignIn reads redirectTo via useSearchParams. */}
        <Suspense>
          <ClientSignInContainer />
        </Suspense>
      </PortalGateSection>

      <Separator />

      <p className="text-sm text-muted-foreground">
        Are you an artist?{" "}
        <Link
          href={ARTIST_LOGIN_PATH}
          className="font-medium text-foreground underline underline-offset-4"
        >
          Artist sign in
        </Link>
      </p>
    </main>
  );
}
