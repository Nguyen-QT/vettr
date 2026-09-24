"use client";

import { useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import type { z } from "zod";

import type { clientBookingInputSchema } from "@/domains/booking/booking.schema";
import type { ClientProfileContactDetails } from "@/domains/booking/types";

type ClientBookingFormValues = z.infer<typeof clientBookingInputSchema>;

// Labels double as the Stepper primitive's (17.1.1) step labels and as
// this hook's step count/order -- kept together so the two can never
// drift out of sync.
export const BOOKING_WIZARD_STEP_LABELS = [
  "Contact Details",
  "Service & Canvas",
  "Date & Slot",
  "Review & Submit",
] as const;

export const CONTACT_DETAILS_STEP = 0;
export const SERVICE_CANVAS_STEP = 1;
export const DATE_SLOT_STEP = 2;
export const REVIEW_STEP = 3;

const LAST_STEP = BOOKING_WIZARD_STEP_LABELS.length - 1;

// Which form fields each step is responsible for collecting -- used to
// scope react-hook-form's own trigger() validation to just that step's
// fields, per CLAUDE.md 17.1's "per-step Zod validation gating Next".
// The review step re-validates nothing of its own; by the time a client
// reaches it, every prior step has already passed.
const STEP_FIELDS: Record<number, (keyof ClientBookingFormValues)[]> = {
  [CONTACT_DETAILS_STEP]: [
    "firstName",
    "lastName",
    "dateOfBirth",
    "email",
    "phone",
    "instagramHandle",
  ],
  [SERVICE_CANVAS_STEP]: [
    "tier",
    "designTags",
    "aestheticTags",
    "clientNotes",
    "clientBudgetRange",
    "designReferenceImageUrls",
    "paymentMethod",
  ],
  [DATE_SLOT_STEP]: ["requestedDate", "requestedTime", "clientMaxEndTime"],
  [REVIEW_STEP]: [],
};

// Reverse lookup from a field name to the step that owns it, built
// once from STEP_FIELDS -- used by goToFirstInvalidStep to send a
// client back to wherever a final-submit validation failure actually
// lives, since the review step doesn't render every field's own error.
// A safety net for any edge case a step's own gate doesn't already
// catch, not the primary enforcement mechanism for any one field.
const FIELD_STEP = new Map<keyof ClientBookingFormValues, number>();
for (const [step, fields] of Object.entries(STEP_FIELDS)) {
  for (const field of fields) {
    FIELD_STEP.set(field, Number(step));
  }
}

// A signed-in client only skips Step 1 once every field it collects is
// already on file (CLAUDE.md 6.1/6.2's per-field lock/prefill) -- a
// client who signed up before 6.2 and is still missing e.g. a date of
// birth must still pass through Step 1 to supply it.
function hasCompleteContactDetails(
  details: ClientProfileContactDetails | undefined
): boolean {
  if (!details) return false;
  return Boolean(
    details.instagramHandle &&
      details.email &&
      details.firstName &&
      details.lastName &&
      details.dateOfBirth
  );
}

interface UseBookingWizardArgs {
  form: UseFormReturn<ClientBookingFormValues>;
  initialClientDetails?: ClientProfileContactDetails;
}

// Wizard step/progress state (CLAUDE.md 17.1.2), built around the
// existing useVisualBookingForm's react-hook-form instance rather than
// duplicating its validation -- this hook only ever decides which step
// is showing and whether "Next" is allowed to advance past it.
export function useBookingWizard({ form, initialClientDetails }: UseBookingWizardArgs) {
  const skipContactStep = hasCompleteContactDetails(initialClientDetails);
  const initialStep = skipContactStep ? SERVICE_CANVAS_STEP : CONTACT_DETAILS_STEP;

  const [currentStep, setCurrentStep] = useState(initialStep);
  // The furthest step reached so far -- a completed step's own fields
  // have already passed validation, so the client can always jump back
  // to it (or forward to it again) via the progress bar; anything past
  // it hasn't been validated yet and stays unreachable until "Next"
  // clears it.
  const [furthestStep, setFurthestStep] = useState(initialStep);

  async function goToNextStep(): Promise<boolean> {
    if (currentStep === LAST_STEP) return true;

    const fieldsToValidate = STEP_FIELDS[currentStep];
    const isStepValid =
      fieldsToValidate.length === 0 || (await form.trigger(fieldsToValidate));
    if (!isStepValid) return false;

    const nextStep = currentStep + 1;
    setCurrentStep(nextStep);
    setFurthestStep((furthest) => Math.max(furthest, nextStep));
    return true;
  }

  function goToPreviousStep() {
    const floor = skipContactStep ? SERVICE_CANVAS_STEP : CONTACT_DETAILS_STEP;
    setCurrentStep((step) => Math.max(step - 1, floor));
  }

  // Completion-bounded jump for the progress bar (CLAUDE.md 17.1): only
  // a step already reached is selectable, and Step 1 stays off-limits
  // once it's been skipped entirely.
  function goToStep(step: number) {
    if (step > furthestStep) return;
    if (skipContactStep && step === CONTACT_DETAILS_STEP) return;
    setCurrentStep(step);
  }

  // Called after a final-submit form.trigger() comes back invalid --
  // jumps to whichever step owns the first errored field, so its
  // FieldError becomes visible again instead of failing silently on
  // the review step, which doesn't render every field's own error.
  // Always allowed regardless of furthestStep: an earlier step has, by
  // definition, already been reached.
  function goToFirstInvalidStep(errors: Partial<Record<string, unknown>>): boolean {
    for (const fieldName of Object.keys(errors)) {
      const step = FIELD_STEP.get(fieldName as keyof ClientBookingFormValues);
      if (step !== undefined) {
        setCurrentStep(step);
        return true;
      }
    }
    return false;
  }

  return {
    stepLabels: BOOKING_WIZARD_STEP_LABELS,
    currentStep,
    furthestStep,
    skipContactStep,
    isLastStep: currentStep === LAST_STEP,
    goToNextStep,
    goToPreviousStep,
    goToStep,
    goToFirstInvalidStep,
  };
}
