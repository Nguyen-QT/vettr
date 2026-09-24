"use client";

import Image from "next/image";
import { XIcon } from "lucide-react";
import type { KeyboardEvent } from "react";
import { Controller } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Stepper } from "@/components/ui/stepper";
import { Textarea } from "@/components/ui/textarea";
import { useConfirmAction } from "@/components/ui/use-confirm-action";
import { WizardActionBar } from "@/components/ui/wizard-action-bar";
import { logoutAction } from "@/domains/auth/actions";
import { BookingProcessExplainer } from "@/domains/booking/components/BookingProcessExplainer";
import { COMPLEXITY_TIERS, OTHER_TAG_VALUE } from "@/domains/booking/constants";
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
  TierReferenceImages,
} from "@/domains/booking/types";
import { DAILY_SLOT_TIME_OPTIONS } from "@/domains/scheduling/constants";
import type { AvailableSlot } from "@/domains/scheduling/services/getAvailableSlots";
import type { SlotTime } from "@/domains/scheduling/types";
import { DesignReferenceDropzone } from "@/lib/uploadthing-client";

interface VisualBookingFormProps {
  artistId: string;
  tierReferenceImages: TierReferenceImages;
  // A signed-in client's known contact details (CLAUDE.md 6.1), passed
  // through to prefill the form. Undefined for a signed-out/guest
  // visitor.
  initialClientDetails?: ClientProfileContactDetails;
}

const BUDGET_SLIDER_MIN = 0;
const BUDGET_SLIDER_MAX = 1000;
const BUDGET_STEP = 5;

// No date picked yet, or the availability fetch hasn't resolved -- don't
// block the user on missing data, only on a confirmed unavailable time.
function isTimeAvailable(
  availableSlots: AvailableSlot[] | null,
  time: SlotTime
): boolean {
  if (!availableSlots) return true;
  return availableSlots.find((slot) => slot.time === time)?.available ?? true;
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
  } = useVisualBookingForm({ artistId, initialClientDetails });

  const {
    control,
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
  const hasOtherSelected = activeTags.includes(OTHER_TAG_VALUE);
  const tagFieldError = errors[activeTagField];
  const budgetError =
    errors.clientBudgetRange?.maxPrice ?? errors.clientBudgetRange?.minPrice;
  const selectedTier = watch("tier");
  const selectedTierReferenceImages = tierReferenceImages[selectedTier];
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
          <form action={logoutAction}>
            <Button type="submit" variant="link" className="h-auto p-0 text-sm">
              Not you? Log out
            </Button>
          </form>
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
            <Field>
              <FieldLegend variant="label">Tier</FieldLegend>
              <Controller
                control={control}
                name="tier"
                render={({ field }) => (
                  <RadioGroup value={field.value} onValueChange={field.onChange}>
                    {COMPLEXITY_TIERS.map((tierOption) => (
                      <FieldLabel key={tierOption} htmlFor={`tier-${tierOption}`}>
                        <Field orientation="horizontal">
                          <RadioGroupItem value={tierOption} id={`tier-${tierOption}`} />
                          <FieldContent>{tierOption}</FieldContent>
                        </Field>
                      </FieldLabel>
                    ))}
                  </RadioGroup>
                )}
              />
              <FieldError errors={errors.tier && [errors.tier]} />
            </Field>

            {selectedTierReferenceImages.length > 0 ? (
              <Field>
                <FieldDescription>Examples of {selectedTier} work</FieldDescription>
                <ul className="flex flex-wrap gap-2">
                  {selectedTierReferenceImages.map((url) => (
                    <li key={url}>
                      <Image
                        src={url}
                        alt={`${selectedTier} example`}
                        width={96}
                        height={96}
                        className="rounded-md object-cover"
                      />
                    </li>
                  ))}
                </ul>
              </Field>
            ) : null}

            <Field>
              <FieldLegend>
                {isFreestyle ? "Aesthetic theme tags" : "Design tags"}
              </FieldLegend>
              {isFreestyle ? (
                <Controller
                  control={control}
                  name="aestheticTags"
                  render={({ field }) => (
                    <TagCheckboxList
                      options={activeTagOptions}
                      selected={field.value ?? []}
                      onChange={field.onChange as (next: string[]) => void}
                    />
                  )}
                />
              ) : (
                <Controller
                  control={control}
                  name="designTags"
                  render={({ field }) => (
                    <TagCheckboxList
                      options={activeTagOptions}
                      selected={field.value ?? []}
                      onChange={field.onChange as (next: string[]) => void}
                    />
                  )}
                />
              )}
              <FieldError errors={tagFieldError && [tagFieldError]} />
            </Field>

            <Field>
              <FieldLabel htmlFor="clientNotes">
                Notes {hasOtherSelected ? "(required)" : "(optional)"}
              </FieldLabel>
              <Textarea id="clientNotes" {...register("clientNotes")} />
              <FieldError errors={errors.clientNotes && [errors.clientNotes]} />
            </Field>

            <Field>
              <FieldLabel>Budget range (£)</FieldLabel>
              <Controller
                control={control}
                name="clientBudgetRange"
                render={({ field }) => (
                  <Slider
                    min={BUDGET_SLIDER_MIN}
                    max={BUDGET_SLIDER_MAX}
                    step={BUDGET_STEP}
                    value={[field.value.minPrice, field.value.maxPrice]}
                    onValueChange={(newValue) => {
                      const [minPrice, maxPrice] = newValue as number[];
                      field.onChange({ minPrice, maxPrice });
                    }}
                  />
                )}
              />
              <FieldDescription>
                £{watch("clientBudgetRange.minPrice")} – £
                {watch("clientBudgetRange.maxPrice")}
              </FieldDescription>
              <FieldError errors={budgetError && [budgetError]} />
            </Field>

            <Field>
              <FieldLegend>Design reference images</FieldLegend>
              <Controller
                control={control}
                name="designReferenceImageUrls"
                render={({ field }) => (
                  <>
                    <DesignReferenceDropzone
                      endpoint="designReferenceImages"
                      onClientUploadComplete={(files) => {
                        handleUploadComplete(files.map((file) => file.ufsUrl));
                      }}
                    />
                    <ul className="flex flex-wrap gap-2">
                      {field.value.map((url) => (
                        <li key={url} className="relative">
                          <Dialog>
                            <DialogTrigger
                              render={
                                <button type="button" className="block">
                                  <Image
                                    src={url}
                                    alt="Design reference"
                                    width={96}
                                    height={96}
                                    className="rounded-md object-cover"
                                  />
                                </button>
                              }
                            />
                            <DialogContent>
                              <DialogTitle>Design reference preview</DialogTitle>
                              <Image
                                src={url}
                                alt="Design reference"
                                width={600}
                                height={600}
                                className="h-auto w-full rounded-md object-contain"
                              />
                            </DialogContent>
                          </Dialog>
                          <Button
                            type="button"
                            variant="destructive"
                            size="icon-xs"
                            className="absolute -top-1 -right-1 rounded-full"
                            onClick={() => removeDesignReferenceImage(url)}
                            aria-label="Remove image"
                          >
                            <XIcon />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              />
              <FieldError
                errors={
                  errors.designReferenceImageUrls && [errors.designReferenceImageUrls]
                }
              />
            </Field>
          </>
        ) : null}

        {currentStep === DATE_SLOT_STEP ? (
          <>
            <Field>
              <FieldLabel htmlFor="requestedDate">Preferred date</FieldLabel>
              <Input
                id="requestedDate"
                type="date"
                {...register("requestedDate")}
              />
              <FieldError errors={errors.requestedDate && [errors.requestedDate]} />
            </Field>

            <Field>
              <FieldLegend variant="label">Preferred time</FieldLegend>
              <Controller
                control={control}
                name="requestedTime"
                render={({ field }) => (
                  <RadioGroup value={field.value} onValueChange={field.onChange}>
                    {DAILY_SLOT_TIME_OPTIONS.map((time) => {
                      const available = isTimeAvailable(availableSlots, time);
                      return (
                        <FieldLabel key={time} htmlFor={`requestedTime-${time}`}>
                          <Field orientation="horizontal">
                            <RadioGroupItem
                              value={time}
                              id={`requestedTime-${time}`}
                              disabled={isLoadingAvailability || !available}
                            />
                            <FieldContent>
                              {time}
                              {!isLoadingAvailability && !available
                                ? " (unavailable)"
                                : null}
                            </FieldContent>
                          </Field>
                        </FieldLabel>
                      );
                    })}
                  </RadioGroup>
                )}
              />
              {isLoadingAvailability ? (
                <FieldDescription>Checking availability…</FieldDescription>
              ) : null}
              <FieldError errors={errors.requestedTime && [errors.requestedTime]} />
            </Field>

            <Field>
              <FieldLabel htmlFor="clientMaxEndTime">
                Must be finished by (optional)
              </FieldLabel>
              <Input
                id="clientMaxEndTime"
                type="time"
                {...register("clientMaxEndTime")}
              />
              <FieldDescription>
                Let the artist know if you have a hard deadline, e.g. a flight to
                catch.
              </FieldDescription>
              {complexityWarning ? (
                // Soft, non-blocking nudge -- text-muted-foreground rather
                // than a dedicated warning token, since CLAUDE.md's brand
                // guardrail reserves a chart-*-family token for "soft
                // warnings" that isn't actually defined in globals.css yet
                // (dangling reference, a known gap). Not text-destructive:
                // this never blocks submission, unlike a real FieldError.
                <p className="text-sm text-muted-foreground">{complexityWarning}</p>
              ) : null}
              <FieldError errors={errors.clientMaxEndTime && [errors.clientMaxEndTime]} />
            </Field>
          </>
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

interface TagCheckboxListProps {
  options: readonly string[];
  selected: string[];
  onChange: (next: string[]) => void;
}

function TagCheckboxList({ options, selected, onChange }: TagCheckboxListProps) {
  return (
    <FieldSet>
      {options.map((tag) => {
        const checked = selected.includes(tag);
        return (
          <FieldLabel key={tag} htmlFor={`tag-${tag}`}>
            <Checkbox
              id={`tag-${tag}`}
              checked={checked}
              onCheckedChange={(isChecked) => {
                onChange(
                  isChecked
                    ? [...selected, tag]
                    : selected.filter((value) => value !== tag)
                );
              }}
            />
            <FieldContent>{tag}</FieldContent>
          </FieldLabel>
        );
      })}
    </FieldSet>
  );
}
