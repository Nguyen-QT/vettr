import type { Metadata } from "next";

import { BackNav } from "@/components/ui/back-nav";
import { ArtistResetPasswordContainer } from "@/domains/auth/components/ArtistResetPasswordContainer";
import { ARTIST_LOGIN_PATH } from "@/domains/auth/constants";

interface ArtistResetPasswordPageProps {
  searchParams: Promise<{ token?: string | string[] }>;
}

// The link carries its token in the query string, so the page must never leak
// it in a Referer header to anything it loads or links to (71.1).
export const metadata: Metadata = { referrer: "no-referrer" };

// Where an emailed reset link lands (71.1.6.1). Rendering never redeems the
// link -- only the form's submit does -- so email link scanners are harmless.
// A missing or repeated `?token` is passed as undefined, which starts the form
// on its invalid step without sending a request.
export default async function ArtistResetPasswordPage({
  searchParams,
}: ArtistResetPasswordPageProps) {
  const { token } = await searchParams;

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-4 px-4 py-4">
      <BackNav href={ARTIST_LOGIN_PATH} />
      <h1>Choose a new password</h1>
      <ArtistResetPasswordContainer token={typeof token === "string" ? token : undefined} />
    </main>
  );
}
