"use client";

import { FindArtistForm } from "@/domains/directory/components/FindArtistForm";
import { useFindArtist } from "@/domains/directory/hooks/useFindArtist";

// Data orchestration wrapper (54.4.6.1): the server page can't call the
// hook, so this hosts it -- handle state, validation and the `/@handle`
// navigation are useFindArtist's job, same split as ClientSignInContainer
// wrapping useClientSignIn. No <Suspense> needed: the hook reads no search
// params.
export function FindArtistContainer() {
  return <FindArtistForm {...useFindArtist()} />;
}
