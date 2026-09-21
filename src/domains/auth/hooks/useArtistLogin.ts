"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { loginAction } from "@/domains/auth/actions";
import { loginInputSchema } from "@/domains/auth/auth.schema";

// Data orchestration (CLAUDE.md): the login page only renders whatever
// this hook decides is the submission/error state -- it makes no
// decisions of its own. On success, redirects to wherever the
// route-protection proxy (5.1.4) originally sent the user from, via
// the redirectTo query param, falling back to their own dashboard.
export function useArtistLogin() {
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

    const result = await loginAction(data);

    if (!result.success) {
      setIsSubmitting(false);
      setServerError(result.error);
      return;
    }

    const redirectTo = searchParams.get("redirectTo");
    router.push(redirectTo || `/artist/${result.artistId}`);
  });

  return { form, onSubmit, isSubmitting, serverError };
}
