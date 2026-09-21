import Link from "next/link";
import { redirect } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import { getCurrentSession } from "@/domains/auth/actions";

// Root landing page (CLAUDE.md 5.3.3). A signed-in visitor skips the
// choice entirely -- straight to their own dashboard, session-derived
// for a client or artistId-scoped for an artist. A signed-out visitor
// picks one of three explicit paths; direct /book/[artistId] links
// (e.g. an artist's Instagram bio) still bypass this page entirely,
// this is only a fallback for organic traffic landing on the bare
// domain.
export default async function Home() {
  const session = await getCurrentSession();

  if (session?.role === "CLIENT") {
    redirect("/client");
  }
  if (session?.role === "ARTIST" && session.artistId) {
    redirect(`/artist/${session.artistId}`);
  }

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-4 px-4 py-4 pb-[env(safe-area-inset-bottom)]">
      <h1 className="text-lg font-semibold">Vettr</h1>
      <div className="flex w-full flex-col gap-3">
        <Link href="/artists" className={buttonVariants({ className: "w-full" })}>
          I want to book an artist
        </Link>
        <Link
          href="/client/login"
          className={buttonVariants({ variant: "outline", className: "w-full" })}
        >
          I have an existing or past booking
        </Link>
        <Link
          href="/artist/login"
          className={buttonVariants({ variant: "outline", className: "w-full" })}
        >
          I&apos;m an artist
        </Link>
      </div>
    </main>
  );
}
