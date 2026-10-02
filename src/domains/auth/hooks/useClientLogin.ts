"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { loginClientAction } from "@/domains/auth/actions";
import { loginInputSchema } from "@/domains/auth/auth.schema";
import { CLIENT_VERIFY_EMAIL_PATH } from "@/domains/auth/constants";

// Mirrors useArtistLogin.ts, redirecting to the session-derived client
// dashboard (/client, no clientProfileId param) instead of an
// artist-specific URL (CLAUDE.md 5.2.4).
export function useClientLogin() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const form = useForm({
    resolver: zodResolver(loginInputSchema),
    defaultValues: { email: "", password: "" },
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const onSubmit = form.handleSubmit(async (data) => {
    setIsSubmitting(true);
    setServerError(null);

    const result = await loginClientAction(data);

    if (!result.success) {
      setIsSubmitting(false);
      setServerError(result.error);
      return;
    }

    // An unverified account has no session -- redirectTo is deliberately
    // not forwarded to the verify step.
    if ("pendingVerification" in result) {
      router.push(`${CLIENT_VERIFY_EMAIL_PATH}?email=${encodeURIComponent(data.email)}`);
      return;
    }

    const redirectTo = searchParams.get("redirectTo");
    router.push(redirectTo || "/client");
  });

  return { form, onSubmit, isSubmitting, serverError };
}
