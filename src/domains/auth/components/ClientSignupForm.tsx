"use client";

import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useClientSignup } from "@/domains/auth/hooks/useClientSignup";

export function ClientSignupForm() {
  const { form, onSubmit, isSubmitting, serverError } = useClientSignup();

  const {
    register,
    formState: { errors },
  } = form;

  return (
    <form onSubmit={onSubmit}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input id="email" type="email" {...register("email")} />
          <FieldDescription>
            Use the same email you booked with -- that's how we find your
            booking history.
          </FieldDescription>
          <FieldError errors={errors.email && [errors.email]} />
        </Field>

        <Field>
          <FieldLabel htmlFor="password">Password</FieldLabel>
          <Input id="password" type="password" {...register("password")} />
          <FieldError errors={errors.password && [errors.password]} />
        </Field>

        {serverError ? <FieldError>{serverError}</FieldError> : null}

        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Creating account..." : "Create account"}
        </Button>
      </FieldGroup>
    </form>
  );
}
