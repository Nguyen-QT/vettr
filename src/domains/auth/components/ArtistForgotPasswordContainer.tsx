"use client";

import { ArtistForgotPasswordForm } from "@/domains/auth/components/ArtistForgotPasswordForm";
import { useArtistForgotPassword } from "@/domains/auth/hooks/useArtistForgotPassword";

// Data orchestration wrapper (71.1.6.1): the server page can't call the
// hook, so this hosts it -- step/email/error state and the request action are
// useArtistForgotPassword's job, same split as ClientSignInContainer.
export function ArtistForgotPasswordContainer() {
  return <ArtistForgotPasswordForm {...useArtistForgotPassword()} />;
}
