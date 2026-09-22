"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";

import { submitIntakeRequest } from "@/domains/intake/actions";
import {
  AESTHETIC_TAG_OPTIONS,
  DESIGN_TAG_OPTIONS,
  TIER_BASELINE_BUDGETS,
} from "@/domains/intake/constants";
import { clientIntakeInputSchema } from "@/domains/intake/intake.schema";
import type { ClientProfileContactDetails } from "@/domains/intake/types";
import { getAvailableSlotsAction } from "@/domains/scheduling/actions";
import { DAILY_SLOT_TIME_OPTIONS } from "@/domains/scheduling/constants";
import type { AvailableSlot } from "@/domains/scheduling/services/getAvailableSlots";

interface UseVisualIntakeFormArgs {
  artistId: string;
  // A signed-in client's known contact details (CLAUDE.md 6.1), for
  // prefilling the form instead of asking them to retype what's
  // already on file. Undefined for a signed-out/guest visitor, same
  // as today.
  initialClientDetails?: ClientProfileContactDetails;
}

// Data orchestration (CLAUDE.md): the component below only renders
// whatever this hook decides is the active tag category/options and
// submission state — it makes no decisions of its own.
export function useVisualIntakeForm({
  artistId,
  initialClientDetails,
}: UseVisualIntakeFormArgs) {
  const form = useForm({
    resolver: zodResolver(clientIntakeInputSchema),
    defaultValues: {
      instagramHandle: initialClientDetails?.instagramHandle ?? "",
      designReferenceImageUrls: [] as string[],
      tier: "TIER_2" as const,
      clientBudgetRange: TIER_BASELINE_BUDGETS.TIER_2,
      designTags: [],
      aestheticTags: [],
      email: initialClientDetails?.email ?? "",
      phone: initialClientDetails?.phone ?? "",
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
  const [availableSlots, setAvailableSlots] = useState<AvailableSlot[] | null>(
    null
  );
  const [isLoadingAvailability, setIsLoadingAvailability] = useState(false);

  const requestedDate = form.watch("requestedDate");
  // Guards against a stale response landing after the date has since
  // changed again -- each effect run captures its own requestedDate
  // closure and compares it against whichever run fired last.
  const latestRequestedDateRef = useRef(requestedDate);

  useEffect(() => {
    latestRequestedDateRef.current = requestedDate;

    if (!requestedDate) {
      setAvailableSlots(null);
      return;
    }

    setIsLoadingAvailability(true);
    getAvailableSlotsAction({ artistId, date: requestedDate }).then((result) => {
      if (latestRequestedDateRef.current !== requestedDate) return;
      setIsLoadingAvailability(false);
      setAvailableSlots(result.success ? result.slots : null);
    });
  }, [artistId, requestedDate]);

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
    availableSlots,
    isLoadingAvailability,
  };
}
