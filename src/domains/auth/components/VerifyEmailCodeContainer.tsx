"use client";

import { VerifyEmailCodeForm } from "@/domains/auth/components/VerifyEmailCodeForm";
import { useVerifyEmailCode } from "@/domains/auth/hooks/useVerifyEmailCode";

interface VerifyEmailCodeContainerProps {
  email: string;
}

// Data orchestration wrapper (CLAUDE.md 27.3.6.1): the server page only
// knows the email from the URL -- form state, resend cooldown and the
// verify/resend actions are the hook's job, same split as
// RoleSwitcherContainer wrapping useSwitchActiveRole.
export function VerifyEmailCodeContainer({ email }: VerifyEmailCodeContainerProps) {
  const verification = useVerifyEmailCode({ email });
  return <VerifyEmailCodeForm {...verification} />;
}
