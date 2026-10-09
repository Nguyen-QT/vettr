"use client";

import type { UseFormReturn } from "react-hook-form";

import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type {
  BookingDetailsLockedFields,
  ClientBookingInput,
} from "@/domains/booking/types";

interface BookingDetailsFieldsProps {
  form: UseFormReturn<ClientBookingInput>;
  lockedFields: BookingDetailsLockedFields;
}

// Pure view (54.5.4.2): the Details & Verify step's identity and contact
// fields, in the reordered wizard's order -- handle first, email and phone
// last so they sit directly above the inline code (54.5.4.3). Locks come
// from the caller's hook. Returns a fragment -- the caller's <FieldGroup>
// owns layout.
export function BookingDetailsFields({
  form,
  lockedFields,
}: BookingDetailsFieldsProps) {
  const {
    register,
    formState: { errors },
  } = form;

  return (
    <>
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

      <Field>
        <FieldLabel htmlFor="firstName">First name</FieldLabel>
        <Input
          id="firstName"
          autoComplete="given-name"
          disabled={lockedFields.firstName}
          {...register("firstName")}
        />
        <FieldError errors={errors.firstName && [errors.firstName]} />
      </Field>

      <Field>
        <FieldLabel htmlFor="lastName">Last name</FieldLabel>
        <Input
          id="lastName"
          autoComplete="family-name"
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
          autoComplete="bday"
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
          autoComplete="email"
          disabled={lockedFields.email}
          {...register("email")}
        />
        <FieldError errors={errors.email && [errors.email]} />
      </Field>

      <Field>
        <FieldLabel htmlFor="phone">Phone (optional)</FieldLabel>
        <Input
          id="phone"
          type="tel"
          autoComplete="tel"
          disabled={lockedFields.phone}
          {...register("phone")}
        />
        <FieldError errors={errors.phone && [errors.phone]} />
      </Field>
    </>
  );
}
