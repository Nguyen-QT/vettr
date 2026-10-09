"use client";

import type { FormEvent, KeyboardEvent } from "react";

import { Button } from "@/components/ui/button";
import { FieldError, FieldGroup } from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";
import { Stepper } from "@/components/ui/stepper";
import { WizardActionBar } from "@/components/ui/wizard-action-bar";
import { logoutAction } from "@/domains/auth/actions";
import { BookingDetailsFields } from "@/domains/booking/components/BookingDetailsFields";
import { BookingSubmittedConfirmation } from "@/domains/booking/components/BookingSubmittedConfirmation";
import { DateSlotFields } from "@/domains/booking/components/DateSlotFields";
import { InlineBookingVerification } from "@/domains/booking/components/InlineBookingVerification";
import { IntakeFields } from "@/domains/booking/components/IntakeFields";
import { TierSelectFields } from "@/domains/booking/components/TierSelectFields";
import {
  DATE_SLOT_STEP,
  DETAILS_VERIFY_STEP,
  INTAKE_STEP,
  SERVICE_STEP,
  useBookingRequestWizard,
} from "@/domains/booking/hooks/useBookingRequestWizard";
import { useBookingVerification } from "@/domains/booking/hooks/useBookingVerification";
import { useVisualBookingForm } from "@/domains/booking/hooks/useVisualBookingForm";
import type {
  ClientProfileContactDetails,
  ComplexityTier,
  TierReferenceImages,
} from "@/domains/booking/types";

interface BookingRequestWizardProps {
  artistId: string;
  tierReferenceImages: TierReferenceImages;
  // The CLIENT session's known details, from the route (keyed on
  // activeRole). Undefined for a guest or an artist-view session. Re-read
  // on every render: a redeemed code sets the session cookie, and the page
  // re-renders with this filled in.
  initialClientDetails?: ClientProfileContactDetails;
  // The tier preselected via `?service=`, already parsed by the route.
  initialTier?: ComplexityTier;
}

// Pressing Enter inside a single-line <input> implicitly submits its
// enclosing <form> -- with this many fields, an easy way to act by
// accident. Every action here is an explicit type="button" click, so only
// a <textarea> (where Enter means "new line") or a focused button keeps
// its Enter.
function preventEnterSubmit(event: KeyboardEvent<HTMLFormElement>) {
  const target = event.target as HTMLElement;
  if (
    event.key === "Enter" &&
    target.tagName !== "TEXTAREA" &&
    target.tagName !== "BUTTON"
  ) {
    event.preventDefault();
  }
}

// Backstop: nothing in the wizard submits natively, so a stray submit must
// never reload the page and lose the draft.
function preventNativeSubmit(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
}

// Data orchestration wrapper (54.5.6.1): the server page can't call the
// hooks, so this hosts them and composes the 54.5.4.x views in the 54.5
// order -- Service -> Design & Budget -> Date & Slot -> Details & Verify.
// Form state is useVisualBookingForm's, step state useBookingRequestWizard's,
// and the code/submit flow useBookingVerification's. A guest (or an
// artist-view session) proves their email inline; a CLIENT session submits
// directly.
export function BookingRequestWizard({
  artistId,
  tierReferenceImages,
  initialClientDetails,
  initialTier,
}: BookingRequestWizardProps) {
  const {
    form,
    isFreestyle,
    activeTagField,
    activeTagOptions,
    handleUploadComplete,
    removeDesignReferenceImage,
    lockedFields,
    availableSlots,
    isLoadingAvailability,
    complexityWarning,
  } = useVisualBookingForm({ artistId, initialClientDetails, initialTier });

  const {
    stepLabels,
    currentStep,
    furthestStep,
    isFirstStep,
    isLastStep,
    goToNextStep,
    goToPreviousStep,
    goToStep,
    goToFirstInvalidStep,
  } = useBookingRequestWizard({ form, initialTier });

  const { requiresCode, verification, onSubmit, isSubmitting, error, isSubmitted } =
    useBookingVerification({
      artistId,
      form,
      isSignedInClient: Boolean(initialClientDetails),
      onInvalidDraft: goToFirstInvalidStep,
    });

  if (isSubmitted) {
    return <BookingSubmittedConfirmation />;
  }

  return (
    <form onKeyDown={preventEnterSubmit} onSubmit={preventNativeSubmit}>
      {initialClientDetails ? (
        <div className="my-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
          <span className="break-all">Booking as {initialClientDetails.email}</span>
          {/* A click handler, not a nested <form> -- this banner already
              sits inside the wizard's <form>. */}
          <Button
            type="button"
            variant="link"
            className="h-auto p-0 text-sm"
            onClick={() => {
              void logoutAction();
            }}
          >
            Not you? Log out
          </Button>
        </div>
      ) : null}

      <Stepper
        steps={stepLabels}
        currentStep={currentStep}
        furthestStep={furthestStep}
        onStepSelect={goToStep}
      />

      <FieldGroup>
        {currentStep === SERVICE_STEP ? (
          <TierSelectFields form={form} tierReferenceImages={tierReferenceImages} />
        ) : null}

        {currentStep === INTAKE_STEP ? (
          <IntakeFields
            form={form}
            isFreestyle={isFreestyle}
            activeTagField={activeTagField}
            activeTagOptions={activeTagOptions}
            onUploadComplete={handleUploadComplete}
            onRemoveDesignReferenceImage={removeDesignReferenceImage}
          />
        ) : null}

        {currentStep === DATE_SLOT_STEP ? (
          <DateSlotFields
            form={form}
            availableSlots={availableSlots}
            isLoadingAvailability={isLoadingAvailability}
            complexityWarning={complexityWarning}
          />
        ) : null}

        {currentStep === DETAILS_VERIFY_STEP ? (
          <>
            <BookingDetailsFields form={form} lockedFields={lockedFields} />

            <Separator />

            {requiresCode ? (
              <InlineBookingVerification {...verification} />
            ) : (
              <>
                {error ? <FieldError>{error}</FieldError> : null}
                <Button type="button" onClick={onSubmit} disabled={isSubmitting}>
                  {isSubmitting ? "Submitting…" : "Submit request"}
                </Button>
              </>
            )}
          </>
        ) : null}
      </FieldGroup>

      <WizardActionBar>
        {isFirstStep ? (
          <span />
        ) : (
          <Button type="button" variant="outline" onClick={goToPreviousStep}>
            Back
          </Button>
        )}
        {isLastStep ? null : (
          <Button type="button" onClick={() => void goToNextStep()}>
            Next
          </Button>
        )}
      </WizardActionBar>
    </form>
  );
}
