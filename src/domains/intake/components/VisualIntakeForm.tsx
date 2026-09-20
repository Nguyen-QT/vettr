"use client";

import Image from "next/image";
import { Controller } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { COMPLEXITY_TIERS, OTHER_TAG_VALUE } from "@/domains/intake/constants";
import { useVisualIntakeForm } from "@/domains/intake/hooks/useVisualIntakeForm";
import { DesignReferenceDropzone } from "@/lib/uploadthing-client";

interface VisualIntakeFormProps {
  artistId: string;
}

const BUDGET_SLIDER_MIN = 0;
const BUDGET_SLIDER_MAX = 1000;
const BUDGET_STEP = 5;

export function VisualIntakeForm({ artistId }: VisualIntakeFormProps) {
  const {
    form,
    isFreestyle,
    activeTagField,
    activeTagOptions,
    handleUploadComplete,
    onSubmit,
    isSubmitting,
    serverError,
    submittedRequestId,
  } = useVisualIntakeForm({ artistId });

  const {
    control,
    register,
    watch,
    formState: { errors },
  } = form;

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

  return (
    <form onSubmit={onSubmit}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="instagramHandle">Instagram handle</FieldLabel>
          <Input
            id="instagramHandle"
            placeholder="@yourhandle"
            {...register("instagramHandle")}
          />
          <FieldError errors={errors.instagramHandle && [errors.instagramHandle]} />
        </Field>

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
                <ul>
                  {field.value.map((url) => (
                    <li key={url}>
                      <Image
                        src={url}
                        alt="Design reference"
                        width={96}
                        height={96}
                      />
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
          <FieldLabel htmlFor="email">Email (optional)</FieldLabel>
          <Input id="email" type="email" {...register("email")} />
          <FieldError errors={errors.email && [errors.email]} />
        </Field>

        <Field>
          <FieldLabel htmlFor="phone">Phone (optional)</FieldLabel>
          <Input id="phone" {...register("phone")} />
          <FieldError errors={errors.phone && [errors.phone]} />
        </Field>

        <Field>
          <FieldLabel htmlFor="clientNotes">
            Notes {hasOtherSelected ? "(required)" : "(optional)"}
          </FieldLabel>
          <Textarea id="clientNotes" {...register("clientNotes")} />
          <FieldError errors={errors.clientNotes && [errors.clientNotes]} />
        </Field>

        {serverError ? <FieldError>{serverError}</FieldError> : null}

        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Submitting..." : "Submit request"}
        </Button>
      </FieldGroup>
    </form>
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
