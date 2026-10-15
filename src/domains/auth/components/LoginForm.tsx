"use client";

import Link from "next/link";

import { Button, buttonVariants } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ARTIST_FORGOT_PASSWORD_PATH } from "@/domains/auth/constants";
import { useArtistLogin } from "@/domains/auth/hooks/useArtistLogin";

export function LoginForm() {
  const { form, onSubmit, isSubmitting, serverError } = useArtistLogin();

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
          <FieldError errors={errors.email && [errors.email]} />
        </Field>

        <Field>
          <FieldLabel htmlFor="password">Password</FieldLabel>
          <Input id="password" type="password" {...register("password")} />
          <FieldError errors={errors.password && [errors.password]} />
        </Field>

        {serverError ? <FieldError>{serverError}</FieldError> : null}

        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Signing in..." : "Sign in"}
        </Button>

        <Link
          href={ARTIST_FORGOT_PASSWORD_PATH}
          className={buttonVariants({ variant: "link", className: "h-auto w-fit p-0 text-sm" })}
        >
          Forgot password?
        </Link>
      </FieldGroup>
    </form>
  );
}
