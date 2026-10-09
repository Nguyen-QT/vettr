"use client";

import { useState } from "react";
import type { UseFormReturn } from "react-hook-form";

import type {
  ClientBookingInput,
  ComplexityTier,
} from "@/domains/booking/types";

// Labels double as the Stepper primitive's step labels and as this hook's
// step count/order -- kept together so the two can never drift out of
// sync. The 54.5 order: identity comes last, directly above the inline
// email code (InlineBookingVerification, 54.5.4.3).
export const BOOKING_REQUEST_WIZARD_STEP_LABELS = [
  "Service",
  "Design & Budget",
  "Date & Slot",
  "Details & Verify",
] as const;

export const SERVICE_STEP = 0;
export const INTAKE_STEP = 1;
export const DATE_SLOT_STEP = 2;
export const DETAILS_VERIFY_STEP = 3;

const LAST_STEP = BOOKING_REQUEST_WIZARD_STEP_LABELS.length - 1;

// Which form fields each step collects -- scopes react-hook-form's
// trigger() to just that step's fields, so a client never sees errors for
// a step they haven't reached yet. The details step has no "Next": its
// fields are listed only for FIELD_STEP below, and the final validation
// before a code is sent belongs to useBookingVerification (54.5.5.2).
//
// The draft's cross-field rules (tags required, "Other" needs notes,
// future date, must-finish-by gap) live in the schema's object-level
// superRefine, which still runs while the later details fields are blank:
// Zod only skips a refinement after a non-continuable issue (a wrong type
// or enum value), and blank text fields only raise continuable ones.
const STEP_FIELDS: Record<number, (keyof ClientBookingInput)[]> = {
  [SERVICE_STEP]: ["tier"],
  [INTAKE_STEP]: [
    "designTags",
    "aestheticTags",
    "clientNotes",
    "clientBudgetRange",
    "designReferenceImageUrls",
    "paymentMethod",
  ],
  [DATE_SLOT_STEP]: ["requestedDate", "requestedTime", "clientMaxEndTime"],
  [DETAILS_VERIFY_STEP]: [
    "instagramHandle",
    "firstName",
    "lastName",
    "dateOfBirth",
    "email",
    "phone",
  ],
};

// Reverse lookup from a field name to the step that owns it, built once
// from STEP_FIELDS -- used by goToFirstInvalidStep to send a client back
// to wherever a final-submit validation failure actually lives.
const FIELD_STEP = new Map<keyof ClientBookingInput, number>();
for (const [step, fields] of Object.entries(STEP_FIELDS)) {
  for (const field of fields) {
    FIELD_STEP.set(field, Number(step));
  }
}

interface WizardProgress {
  currentStep: number;
  // The furthest step reached so far -- every step before it has passed
  // its own "Next", so the client can always jump back to it (or forward
  // to it again) via the progress bar.
  furthestStep: number;
}

interface UseBookingRequestWizardArgs {
  form: UseFormReturn<ClientBookingInput>;
  // The tier preselected via `?service=` (54.1.6.2), already parsed by the
  // route -- the same prop useVisualBookingForm seeds the tier from. Only
  // its presence matters here: a preselected service starts at Intake.
  initialTier?: ComplexityTier;
}

// Wizard step/progress state for the reordered booking request (54.5.5.1),
// built around useVisualBookingForm's react-hook-form instance rather than
// duplicating its validation -- this hook only decides which step is
// showing and whether "Next" may advance past it. No session input: the
// details step is never skipped (it holds the submit), and whether a code
// is needed is useBookingVerification's call (54.5.5.2).
export function useBookingRequestWizard({
  form,
  initialTier,
}: UseBookingRequestWizardArgs) {
  // Read once at mount: a later prop change (e.g. router.refresh() after
  // the code redeemed but the booking write failed, 54.5.3.4) must never
  // move a client who is already mid-flow.
  const [progress, setProgress] = useState<WizardProgress>(() => {
    const initialStep = initialTier ? INTAKE_STEP : SERVICE_STEP;
    return { currentStep: initialStep, furthestStep: initialStep };
  });
  const { currentStep, furthestStep } = progress;

  async function goToNextStep(): Promise<boolean> {
    const fromStep = currentStep;
    if (fromStep === LAST_STEP) return true;

    const isStepValid = await form.trigger(STEP_FIELDS[fromStep]);
    if (!isStepValid) return false;

    // Advances only if the client is still on the step that was validated:
    // a second "Next" from a double-click, or a Back/progress-bar click
    // made while validation was in flight, must not be overridden by this
    // late result.
    setProgress((current) => {
      if (current.currentStep !== fromStep) return current;
      const nextStep = fromStep + 1;
      return {
        currentStep: nextStep,
        furthestStep: Math.max(current.furthestStep, nextStep),
      };
    });
    return true;
  }

  // Floored at Service, which stays reachable after a `?service=` start so
  // the client can still change tier.
  function goToPreviousStep() {
    setProgress((current) => ({
      ...current,
      currentStep: Math.max(current.currentStep - 1, SERVICE_STEP),
    }));
  }

  // Completion-bounded jump for the progress bar: only a step already
  // reached is selectable.
  function goToStep(step: number) {
    setProgress((current) =>
      step < SERVICE_STEP || step > current.furthestStep
        ? current
        : { ...current, currentStep: step }
    );
  }

  // Called after a final-submit form.trigger() comes back invalid -- jumps
  // to the earliest step owning an errored field, so its FieldError is
  // visible again. Earliest by wizard order, not by the errors object's key
  // order, which follows the schema (handle first) rather than the steps.
  // Always allowed regardless of furthestStep: an earlier step has, by
  // definition, already been reached.
  function goToFirstInvalidStep(errors: Partial<Record<string, unknown>>): boolean {
    let earliestStep: number | undefined;
    for (const fieldName of Object.keys(errors)) {
      const step = FIELD_STEP.get(fieldName as keyof ClientBookingInput);
      if (step !== undefined && (earliestStep === undefined || step < earliestStep)) {
        earliestStep = step;
      }
    }
    if (earliestStep === undefined) return false;

    const targetStep = earliestStep;
    setProgress((current) => ({ ...current, currentStep: targetStep }));
    return true;
  }

  return {
    stepLabels: BOOKING_REQUEST_WIZARD_STEP_LABELS,
    currentStep,
    furthestStep,
    isFirstStep: currentStep === SERVICE_STEP,
    isLastStep: currentStep === LAST_STEP,
    goToNextStep,
    goToPreviousStep,
    goToStep,
    goToFirstInvalidStep,
  };
}
