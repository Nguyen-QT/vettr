"use client";

import Image from "next/image";
import { XIcon } from "lucide-react";
import type { UseFormReturn } from "react-hook-form";
import { Controller } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { OTHER_TAG_VALUE, PAYMENT_METHODS } from "@/domains/booking/constants";
import type { ClientBookingInput } from "@/domains/booking/types";
import { DesignReferenceDropzone } from "@/lib/uploadthing-client";

interface IntakeFieldsProps {
  form: UseFormReturn<ClientBookingInput>;
  isFreestyle: boolean;
  activeTagField: "designTags" | "aestheticTags";
  activeTagOptions: readonly string[];
  onUploadComplete: (urls: string[]) => void;
  onRemoveDesignReferenceImage: (url: string) => void;
}

const BUDGET_SLIDER_MIN = 0;
const BUDGET_SLIDER_MAX = 1000;
const BUDGET_STEP = 5;

// Pure view (54.5.4.1): tags, notes, budget, payment method and design
// reference uploads, lifted out of VisualBookingForm so the reordered
// wizard (54.5.6.1) can reuse it. The active tag category and the upload
// handlers are decided by the caller's hook. Returns a fragment -- the
// caller's <FieldGroup> owns layout.
export function IntakeFields({
  form,
  isFreestyle,
  activeTagField,
  activeTagOptions,
  onUploadComplete,
  onRemoveDesignReferenceImage,
}: IntakeFieldsProps) {
  const {
    control,
    register,
    watch,
    formState: { errors },
  } = form;

  const activeTags = watch(activeTagField) ?? [];
  const hasOtherSelected = activeTags.includes(OTHER_TAG_VALUE);
  const tagFieldError = errors[activeTagField];
  const budgetError =
    errors.clientBudgetRange?.maxPrice ?? errors.clientBudgetRange?.minPrice;

  return (
    <>
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
        <FieldLegend variant="label">
          How will you settle the final balance?
        </FieldLegend>
        <Controller
          control={control}
          name="paymentMethod"
          render={({ field }) => (
            <RadioGroup value={field.value} onValueChange={field.onChange}>
              {PAYMENT_METHODS.map((method) => (
                <FieldLabel key={method} htmlFor={`paymentMethod-${method}`}>
                  <Field orientation="horizontal">
                    <RadioGroupItem
                      value={method}
                      id={`paymentMethod-${method}`}
                    />
                    <FieldContent>{method === "CASH" ? "Cash" : "Card"}</FieldContent>
                  </Field>
                </FieldLabel>
              ))}
            </RadioGroup>
          )}
        />
        <FieldDescription>
          This only covers the final on-the-day balance -- any deposit is
          always paid by card.
        </FieldDescription>
        <FieldError errors={errors.paymentMethod && [errors.paymentMethod]} />
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
                  onUploadComplete(files.map((file) => file.ufsUrl));
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
                      onClick={() => onRemoveDesignReferenceImage(url)}
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
