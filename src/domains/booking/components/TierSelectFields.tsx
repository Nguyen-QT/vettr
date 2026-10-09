"use client";

import Image from "next/image";
import type { UseFormReturn } from "react-hook-form";
import { Controller } from "react-hook-form";

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldLegend,
} from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { COMPLEXITY_TIERS } from "@/domains/booking/constants";
import type {
  ClientBookingInput,
  TierReferenceImages,
} from "@/domains/booking/types";

interface TierSelectFieldsProps {
  form: UseFormReturn<ClientBookingInput>;
  tierReferenceImages: TierReferenceImages;
}

// Pure view (54.5.4.1): the tier choice plus that tier's example images,
// lifted out of VisualBookingForm so the reordered wizard (54.5.6.1) can
// reuse it. Returns a fragment -- the caller's <FieldGroup> owns layout.
export function TierSelectFields({
  form,
  tierReferenceImages,
}: TierSelectFieldsProps) {
  const {
    control,
    watch,
    formState: { errors },
  } = form;

  const selectedTier = watch("tier");
  const selectedTierReferenceImages = tierReferenceImages[selectedTier];

  return (
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
    </>
  );
}
