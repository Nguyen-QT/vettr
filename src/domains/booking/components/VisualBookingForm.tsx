"use client";

import Image from "next/image";
import type { KeyboardEvent } from "react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Stepper } from "@/components/ui/stepper";
import { useConfirmAction } from "@/components/ui/use-confirm-action";
import { WizardActionBar } from "@/components/ui/wizard-action-bar";
import { logoutAction } from "@/domains/auth/actions";
import { BookingProcessExplainer } from "@/domains/booking/components/BookingProcessExplainer";
import { DateSlotFields } from "@/domains/booking/components/DateSlotFields";
import { IntakeFields } from "@/domains/booking/components/IntakeFields";
import { TierSelectFields } from "@/domains/booking/components/TierSelectFields";
import {
  CONTACT_DETAILS_STEP,
  DATE_SLOT_STEP,
  REVIEW_STEP,
  SERVICE_CANVAS_STEP,
  useBookingWizard,
} from "@/domains/booking/hooks/useBookingWizard";
import { useVisualBookingForm } from "@/domains/booking/hooks/useVisualBookingForm";
import type {
  ClientProfileContactDetails,
  ComplexityTier,
  TierReferenceImages,
} from "@/domains/booking/types";

interface VisualBookingFormProps {
  artistId: string;
  tierReferenceImages: TierReferenceImages;
  // A signed-in client's known contact details (CLAUDE.md 6.1), passed
  // through to prefill the form. Undefined for a signed-out/guest
  // visitor.
  initialClientDetails?: ClientProfileContactDetails;
  // The tier preselected via `?service=` (54.1.6.2), passed through to
  // the hook. Undefined keeps the hook's default.
  initialTier?: ComplexityTier;
}

// Pressing Enter inside a single-line <input> implicitly submits its
// enclosing <form> (native browser behavior) -- with this many fields,
// that's an easy way to submit by accident well before the form is
// actually filled out. Only the real Submit button (or a <textarea>,
// where Enter means "new line") should ever trigger a submission.
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

export function VisualBookingForm({
  artistId,
  tierReferenceImages,
  initialClientDetails,
  initialTier,
}: VisualBookingFormProps) {
  const {
    form,
    isFreestyle,
    activeTagField,
    activeTagOptions,
    handleUploadComplete,
    removeDesignReferenceImage,
    onSubmit,
    isSubmitting,
    serverError,
    submittedRequestId,
    lockedFields,
    availableSlots,
    isLoadingAvailability,
    complexityWarning,
  } = useVisualBookingForm({ artistId, initialClientDetails, initialTier });

  const {
    register,
    watch,
    trigger,
    formState: { errors },
  } = form;

  const {
    stepLabels,
    currentStep,
    furthestStep,
    skipContactStep,
    isLastStep,
    goToNextStep,
    goToPreviousStep,
    goToStep,
    goToFirstInvalidStep,
  } = useBookingWizard({ form, initialClientDetails });

  const confirmSubmit = useConfirmAction();

  if (submittedRequestId) {
    return (
      <p role="status">
        Request submitted. The artist will review your reference images and
        proposed budget, then reach out to confirm.
      </p>
    );
  }

  const activeTags = watch(activeTagField) ?? [];
  const selectedTier = watch("tier");
  const firstStep = skipContactStep ? SERVICE_CANVAS_STEP : CONTACT_DETAILS_STEP;

  async function handleSubmitClick() {
    const isValid = await trigger();
    if (isValid) {
      confirmSubmit.requestConfirmation(() => {
        void onSubmit();
      });
      return;
    }
    // The review step doesn't render every field's own FieldError, so
    // a failure here (most commonly: no design reference image was
    // ever uploaded, since that isn't gated on Step 2's own "Next")
    // would otherwise fail silently -- send the client back to
    // whichever step actually owns the invalid field.
    goToFirstInvalidStep(form.formState.errors);
  }

  return (
    <form onKeyDown={preventEnterSubmit}>
      <Stepper
        steps={stepLabels}
        currentStep={currentStep}
        furthestStep={furthestStep}
        onStepSelect={goToStep}
      />

      {skipContactStep ? (
        <div className="my-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
          <span>
            Booking as {initialClientDetails?.firstName}{" "}
            {initialClientDetails?.lastName} ({initialClientDetails?.email})
          </span>
          {/* No nested <form> -- this whole banner already lives inside
              the wizard's own outer <form>, and HTML forbids a <form>
              descendant of another <form>. A server action can be
              invoked directly from a click handler just as well as
              from a form's action prop. */}
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

      <FieldGroup>
        {currentStep === CONTACT_DETAILS_STEP ? (
          <>
            <Field>
              <FieldLabel htmlFor="firstName">First name</FieldLabel>
              <Input
                id="firstName"
                disabled={lockedFields.firstName}
                {...register("firstName")}
              />
              <FieldError errors={errors.firstName && [errors.firstName]} />
            </Field>

            <Field>
              <FieldLabel htmlFor="lastName">Last name</FieldLabel>
              <Input
                id="lastName"
                disabled={lockedFields.lastName}
                {...register("lastName")}
              />
              <FieldError errors={errors.lastName && [errors.lastName]} />
            </Field>

            <Field>
              <FieldLabel htmlFor="dateOfBirth">Date of birth</FieldLabel>
              <Input
                id="dateOfBirth"
                type="date"
                disabled={lockedFields.dateOfBirth}
                {...register("dateOfBirth")}
              />
              <FieldError errors={errors.dateOfBirth && [errors.dateOfBirth]} />
            </Field>

            <Field>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input
                id="email"
                type="email"
                disabled={lockedFields.email}
                {...register("email")}
              />
              <FieldError errors={errors.email && [errors.email]} />
            </Field>

            <Field>
              <FieldLabel htmlFor="phone">Phone (optional)</FieldLabel>
              <Input
                id="phone"
                disabled={lockedFields.phone}
                {...register("phone")}
              />
              <FieldError errors={errors.phone && [errors.phone]} />
            </Field>

            <Field>
              <FieldLabel htmlFor="instagramHandle">Instagram handle</FieldLabel>
              <Input
                id="instagramHandle"
                placeholder="@yourhandle"
                disabled={lockedFields.instagramHandle}
                {...register("instagramHandle")}
              />
              <FieldError
                errors={errors.instagramHandle && [errors.instagramHandle]}
              />
            </Field>
          </>
        ) : null}

        {currentStep === SERVICE_CANVAS_STEP ? (
          <>
            <TierSelectFields
              form={form}
              tierReferenceImages={tierReferenceImages}
            />
            <IntakeFields
              form={form}
              isFreestyle={isFreestyle}
              activeTagField={activeTagField}
              activeTagOptions={activeTagOptions}
              onUploadComplete={handleUploadComplete}
              onRemoveDesignReferenceImage={removeDesignReferenceImage}
            />
          </>
        ) : null}

        {currentStep === DATE_SLOT_STEP ? (
          <DateSlotFields
            form={form}
            availableSlots={availableSlots}
            isLoadingAvailability={isLoadingAvailability}
            complexityWarning={complexityWarning}
          />
        ) : null}

        {currentStep === REVIEW_STEP ? (
          <>
            <FieldLegend>Review your request</FieldLegend>
            <div className="flex flex-col gap-3">
              <SummaryRow label="Instagram handle" value={watch("instagramHandle")} />
              <SummaryRow
                label="Name"
                value={`${watch("firstName")} ${watch("lastName")}`}
              />
              <SummaryRow label="Email" value={watch("email")} />
              <SummaryRow label="Phone" value={watch("phone") || "Not provided"} />
              <Separator />
              <SummaryRow label="Tier" value={selectedTier} />
              <SummaryRow
                label={isFreestyle ? "Aesthetic theme tags" : "Design tags"}
                value={activeTags.length > 0 ? activeTags.join(", ") : "None selected"}
              />
              <SummaryRow
                label="Notes"
                value={watch("clientNotes") || "Not provided"}
              />
              <SummaryRow
                label="Budget range"
                value={`£${watch("clientBudgetRange.minPrice")} – £${watch("clientBudgetRange.maxPrice")}`}
              />
              <SummaryRow
                label="Final balance payment method"
                value={watch("paymentMethod") === "CASH" ? "Cash" : "Card"}
              />
              <Field>
                <FieldDescription>Reference images</FieldDescription>
                <ul className="flex flex-wrap gap-2">
                  {watch("designReferenceImageUrls").map((url) => (
                    <li key={url}>
                      <Image
                        src={url}
                        alt="Design reference"
                        width={96}
                        height={96}
                        className="rounded-md object-cover"
                      />
                    </li>
                  ))}
                </ul>
              </Field>
              <Separator />
              <SummaryRow label="Preferred date" value={watch("requestedDate")} />
              <SummaryRow label="Preferred time" value={watch("requestedTime")} />
              <SummaryRow
                label="Must be finished by"
                value={watch("clientMaxEndTime") || "Not provided"}
              />
            </div>

            <BookingProcessExplainer />

            {serverError ? <FieldError>{serverError}</FieldError> : null}

            <Button
              type="button"
              disabled={isSubmitting}
              onClick={handleSubmitClick}
            >
              {isSubmitting ? "Submitting..." : "Submit request"}
            </Button>
          </>
        ) : null}
      </FieldGroup>

      <WizardActionBar>
        {currentStep === firstStep ? (
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

      <ConfirmDialog
        open={confirmSubmit.isOpen}
        onOpenChange={confirmSubmit.onOpenChange}
        title="Submit this booking request?"
        description="The artist will review it and reach out once they've made a decision -- you won't be charged anything yet."
        confirmLabel="Submit request"
        onConfirm={confirmSubmit.confirm}
      />
    </form>
  );
}

interface SummaryRowProps {
  label: string;
  value: string;
}

function SummaryRow({ label, value }: SummaryRowProps) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="text-sm">{value}</span>
    </div>
  );
}
