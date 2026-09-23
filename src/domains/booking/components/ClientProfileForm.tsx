"use client";

import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useClientProfile } from "@/domains/booking/hooks/useClientProfile";
import type { ClientProfileContactDetails } from "@/domains/booking/types";

interface ClientProfileFormProps {
  initialDetails: ClientProfileContactDetails;
}

// Pure view (CLAUDE.md 10.1.4): renders whatever useClientProfile
// reports -- every field editable, unlike the booking form's per-field
// locking (6.1.3/6.2), since this page is the one place a client can
// ever go back and correct something after the fact.
export function ClientProfileForm({ initialDetails }: ClientProfileFormProps) {
  const { fields, setField, save, isPending, error, saved } = useClientProfile({
    initialDetails,
  });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="instagramHandle">Instagram handle</FieldLabel>
          <Input
            id="instagramHandle"
            value={fields.instagramHandle}
            onChange={(event) => setField("instagramHandle", event.target.value)}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="firstName">First name</FieldLabel>
          <Input
            id="firstName"
            value={fields.firstName}
            onChange={(event) => setField("firstName", event.target.value)}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="lastName">Last name</FieldLabel>
          <Input
            id="lastName"
            value={fields.lastName}
            onChange={(event) => setField("lastName", event.target.value)}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="dateOfBirth">Date of birth</FieldLabel>
          <Input
            id="dateOfBirth"
            type="date"
            value={fields.dateOfBirth}
            onChange={(event) => setField("dateOfBirth", event.target.value)}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input
            id="email"
            type="email"
            value={fields.email}
            onChange={(event) => setField("email", event.target.value)}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="phone">Phone (optional)</FieldLabel>
          <Input
            id="phone"
            value={fields.phone}
            onChange={(event) => setField("phone", event.target.value)}
          />
        </Field>

        <FieldError errors={error ? [{ message: error }] : undefined} />
        {saved && !error ? (
          <p role="status" className="text-sm text-muted-foreground">
            Saved.
          </p>
        ) : null}

        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : "Save changes"}
        </Button>
      </FieldGroup>
    </form>
  );
}
