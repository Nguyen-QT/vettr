"use client";

import { ArtistResetPasswordForm } from "@/domains/auth/components/ArtistResetPasswordForm";
import { useArtistResetPassword } from "@/domains/auth/hooks/useArtistResetPassword";

interface ArtistResetPasswordContainerProps {
  token: string | undefined;
}

// Data orchestration wrapper (71.1.6.1): the server page reads the token from
// the URL, and this hosts the hook that owns it -- the form never receives the
// token, so it can't reach the DOM. A missing or malformed token starts on the
// "invalid" step inside the hook.
export function ArtistResetPasswordContainer({ token }: ArtistResetPasswordContainerProps) {
  return <ArtistResetPasswordForm {...useArtistResetPassword(token)} />;
}
