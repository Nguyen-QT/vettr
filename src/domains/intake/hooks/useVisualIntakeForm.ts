"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { submitIntakeRequest } from "@/domains/intake/actions";
import {
  AESTHETIC_TAG_OPTIONS,
  DESIGN_TAG_OPTIONS,
  TIER_BASELINE_BUDGETS,
} from "@/domains/intake/constants";
import { clientIntakeInputSchema } from "@/domains/intake/intake.schema";
import { DAILY_SLOT_TIME_OPTIONS } from "@/domains/scheduling/constants";

interface UseVisualIntakeFormArgs {
  artistId: string;
}

// Data orchestration (CLAUDE.md): the component below only renders
// whatever this hook decides is the active tag category/options and
// submission state — it makes no decisions of its own.
export function useVisualIntakeForm({ artistId }: UseVisualIntakeFormArgs) {
  const form = useForm({
    resolver: zodResolver(clientIntakeInputSchema),
    defaultValues: {
      instagramHandle: "",
      designReferenceImageUrls: [] as string[],
      tier: "TIER_2" as const,
      clientBudgetRange: TIER_BASELINE_BUDGETS.TIER_2,
      designTags: [],
      aestheticTags: [],
      email: "",
      phone: "",
      clientNotes: "",
      requestedDate: "",
      requestedTime: DAILY_SLOT_TIME_OPTIONS[0],
    },
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [submittedRequestId, setSubmittedRequestId] = useState<string | null>(
    null
  );

  const tier = form.watch("tier");
  const isFreestyle = tier === "FREESTYLE";
  const activeTagField: "designTags" | "aestheticTags" = isFreestyle
    ? "aestheticTags"
    : "designTags";
  const activeTagOptions: readonly string[] = isFreestyle
    ? AESTHETIC_TAG_OPTIONS
    : DESIGN_TAG_OPTIONS;

  function handleUploadComplete(urls: string[]) {
    form.setValue("designReferenceImageUrls", urls, { shouldValidate: true });
  }

  const onSubmit = form.handleSubmit(async (data) => {
    setIsSubmitting(true);
    setServerError(null);

    const result = await submitIntakeRequest(artistId, data);

    setIsSubmitting(false);

    if (!result.success) {
      setServerError(result.error);
      return;
    }

    setSubmittedRequestId(result.intakeRequestId);
  });

  return {
    form,
    isFreestyle,
    activeTagField,
    activeTagOptions,
    handleUploadComplete,
    onSubmit,
    isSubmitting,
    serverError,
    submittedRequestId,
  };
}
