"use client";

import { ClientSignInForm } from "@/domains/auth/components/ClientSignInForm";
import { useClientSignIn } from "@/domains/auth/hooks/useClientSignIn";

// Data orchestration wrapper (54.3.6.1): the server page can't call the
// hook, so this hosts it -- step/email/code state, the resend countdown and
// the request/verify actions are useClientSignIn's job, same split as
// VerifyEmailCodeContainer wrapping useVerifyEmailCode. Needs a <Suspense>
// above it, since the hook reads redirectTo via useSearchParams.
export function ClientSignInContainer() {
  return <ClientSignInForm {...useClientSignIn()} />;
}
