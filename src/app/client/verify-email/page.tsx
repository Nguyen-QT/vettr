import { redirect } from "next/navigation";

import { BackNav } from "@/components/ui/back-nav";
import { VerifyEmailCodeContainer } from "@/domains/auth/components/VerifyEmailCodeContainer";

interface ClientVerifyEmailPageProps {
  searchParams: Promise<{ email?: string | string[] }>;
}

export default async function ClientVerifyEmailPage({
  searchParams,
}: ClientVerifyEmailPageProps) {
  const { email } = await searchParams;

  // Signup/login always route here with ?email=... -- without it there's
  // nothing to verify, so send the visitor back to the start.
  if (typeof email !== "string" || email.length === 0) {
    redirect("/client/signup");
  }

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-4 px-4 py-4">
      <BackNav href="/client/signup" />
      <h1>Verify your email</h1>
      <p className="text-muted-foreground">We sent a 6-digit code to {email}.</p>
      <VerifyEmailCodeContainer email={email} />
    </main>
  );
}
