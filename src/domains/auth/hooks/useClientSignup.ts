"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { signupClientAction } from "@/domains/auth/actions";
import { signupInputSchema } from "@/domains/auth/auth.schema";

// Mirrors useClientLogin.ts. No redirectTo handling here -- signup
// isn't a route-protection redirect target the way login is, a client
// only ever arrives at /client/signup directly (CLAUDE.md 5.2.4).
export function useClientSignup() {
  const router = useRouter();

  const form = useForm({
    resolver: zodResolver(signupInputSchema),
    defaultValues: { email: "", password: "" },
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const onSubmit = form.handleSubmit(async (data) => {
    setIsSubmitting(true);
    setServerError(null);

    const result = await signupClientAction(data);

    if (!result.success) {
      setIsSubmitting(false);
      setServerError(result.error);
      return;
    }

    router.push("/client");
  });

  return { form, onSubmit, isSubmitting, serverError };
}
