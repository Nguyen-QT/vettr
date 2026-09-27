"use client";

import { BecomeClientFormProps } from "../types";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

// Pure view (CLAUDE.md 26.1.4.1): renders whatever values/errors/pending
// state it's given via props and makes no decisions of its own. State
// ownership and the server action call are wired in by a later hook/page.
export function BecomeClientForm({
  values,
  onFieldChange,
  errors,
  serverError,
  onSubmit,
  isPending = false,
}: BecomeClientFormProps) {
  return (
    <form onSubmit={onSubmit}>
      <FieldGroup>
        <Field data-invalid={!!errors?.instagramHandle}>
          <FieldLabel htmlFor="instagramHandle">Instagram handle</FieldLabel>
          <Input
            id="instagramHandle"
            value={values.instagramHandle}
            onChange={(e) => onFieldChange("instagramHandle", e.target.value)}
            aria-invalid={!!errors?.instagramHandle}
          />
          <FieldError errors={errors?.instagramHandle && [errors.instagramHandle]} />
        </Field>

        <Field data-invalid={!!errors?.firstName}>
          <FieldLabel htmlFor="firstName">First name</FieldLabel>
          <Input
            id="firstName"
            value={values.firstName}
            onChange={(e) => onFieldChange("firstName", e.target.value)}
            aria-invalid={!!errors?.firstName}
          />
          <FieldError errors={errors?.firstName && [errors.firstName]} />
        </Field>

        <Field data-invalid={!!errors?.lastName}>
          <FieldLabel htmlFor="lastName">Last name</FieldLabel>
          <Input
            id="lastName"
            value={values.lastName}
            onChange={(e) => onFieldChange("lastName", e.target.value)}
            aria-invalid={!!errors?.lastName}
          />
          <FieldError errors={errors?.lastName && [errors.lastName]} />
        </Field>

        <Field data-invalid={!!errors?.phone}>
          <FieldLabel htmlFor="phone">Phone</FieldLabel>
          <Input
            id="phone"
            type="tel"
            value={values.phone}
            onChange={(e) => onFieldChange("phone", e.target.value)}
            aria-invalid={!!errors?.phone}
          />
          <FieldError errors={errors?.phone && [errors.phone]} />
        </Field>

        <Field data-invalid={!!errors?.dateOfBirth}>
          <FieldLabel htmlFor="dateOfBirth">Date of birth</FieldLabel>
          <Input
            id="dateOfBirth"
            type="date"
            value={values.dateOfBirth}
            onChange={(e) => onFieldChange("dateOfBirth", e.target.value)}
            aria-invalid={!!errors?.dateOfBirth}
          />
          <FieldError errors={errors?.dateOfBirth && [errors.dateOfBirth]} />
        </Field>

        {serverError ? <FieldError>{serverError}</FieldError> : null}

        <Button type="submit" disabled={isPending}>
          {isPending ? "Submitting..." : "Continue"}
        </Button>
      </FieldGroup>
    </form>
  );
}