"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { updateClientProfileAction } from "@/domains/booking/actions";
import type { ClientProfileContactDetails } from "@/domains/booking/types";

export interface ClientProfileFormFields {
  instagramHandle: string;
  email: string;
  phone: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
}

interface UseClientProfileArgs {
  initialDetails: ClientProfileContactDetails;
}

function toFormFields(
  details: ClientProfileContactDetails
): ClientProfileFormFields {
  return {
    instagramHandle: details.instagramHandle,
    email: details.email,
    phone: details.phone ?? "",
    firstName: details.firstName ?? "",
    lastName: details.lastName ?? "",
    dateOfBirth: details.dateOfBirth
      ? details.dateOfBirth.toISOString().slice(0, 10)
      : "",
  };
}

// Data orchestration (CLAUDE.md 10.1.3): edit/save state for the
// client's own profile page. No fetch here -- the page already has
// the initial read (getClientProfileContactDetails, 6.1.1) as a
// server component, passed in as a prop, same precedent as
// VisualBookingForm's initialClientDetails; this hook only owns the
// form fields and the save mutation. A single isPending/error pair is
// enough here (unlike useCheckout, CLAUDE.md's Independent Mutation
// State Isolation rule) -- save is the one mutation this page has, not
// several independently-triggerable ones.
export function useClientProfile({ initialDetails }: UseClientProfileArgs) {
  const router = useRouter();
  const [fields, setFields] = useState(() => toFormFields(initialDetails));
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function setField<K extends keyof ClientProfileFormFields>(
    key: K,
    value: ClientProfileFormFields[K]
  ) {
    setSaved(false);
    setFields((current) => ({ ...current, [key]: value }));
  }

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateClientProfileAction({
        ...fields,
        phone: fields.phone || undefined,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return { fields, setField, save, isPending, error, saved };
}
