"use client";

import type { FindArtistFormProps } from "../types";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

// Pure view (54.4.4.1): renders whatever handle/error state it's given and
// makes no decisions of its own. Normalising the handle, validating it and
// navigating to `/@handle` are wired in by useFindArtist (54.4.5.1).
//
// The "@" prefix is decoration only -- a typed leading "@" is stripped by
// normalizeArtistHandle in the hook. noValidate and no maxLength keep the
// hook's artistHandleSchema message as the only error copy. No heading and
// no autoFocus: the host (the portal gate section, the client portal)
// supplies the heading, and the gate also hosts ClientSignInForm.
export function FindArtistForm({
  handle,
  onHandleChange,
  onSubmit,
  isNavigating = false,
  error,
}: FindArtistFormProps) {
  return (
    <form noValidate onSubmit={onSubmit}>
      <FieldGroup>
        <p className="text-sm text-muted-foreground">
          Got a link from your artist? Enter their handle to view their
          profile and request a booking.
        </p>

        <Field data-invalid={!!error}>
          <FieldLabel htmlFor="findArtistHandle">Artist handle</FieldLabel>
          <div className="relative">
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-base text-muted-foreground md:text-sm"
            >
              @
            </span>
            <Input
              id="findArtistHandle"
              type="text"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={handle}
              onChange={(e) => onHandleChange(e.target.value)}
              aria-invalid={!!error}
              className="pl-6"
            />
          </div>
          {error ? <FieldError>{error}</FieldError> : null}
        </Field>

        <Button type="submit" disabled={isNavigating}>
          {isNavigating ? "Opening profile…" : "Find artist"}
        </Button>
      </FieldGroup>
    </form>
  );
}
