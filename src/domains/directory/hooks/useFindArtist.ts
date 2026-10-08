"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { SubmitEvent } from "react";

import type { FindArtistFormProps } from "@/domains/directory/types";
import { artistHandleSchema } from "@/lib/artistHandle";

// Wires FindArtistForm (54.4.4.1) to `/@handle` navigation; returns
// exactly its props, so a host renders <FindArtistForm {...useFindArtist()} />.
// artistHandleSchema normalises (trim, one leading "@", lowercase) and
// validates, so its copy is the only error copy (the form is noValidate).
//
// No lookup before navigating: an unknown handle lands on the profile
// page's notFound(), so this hook adds no handle-probing surface. The
// parsed handle needs no encoding -- ARTIST_HANDLE_REGEX only admits
// [a-z0-9._] with alphanumeric ends, so the push is always a same-origin
// `/@<handle>` path.
export function useFindArtist(): FindArtistFormProps {
  const router = useRouter();
  const [handle, setHandle] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [isNavigating, startNavigation] = useTransition();

  function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isNavigating) return;

    const parsed = artistHandleSchema.safeParse(handle);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Enter a valid handle.");
      return;
    }

    setError(undefined);
    // The transition keeps isNavigating true until the navigation lands,
    // so the form's button stays disabled against a double submit.
    startNavigation(() => {
      router.push(`/@${parsed.data}`);
    });
  }

  return {
    handle,
    onHandleChange: setHandle,
    onSubmit,
    isNavigating,
    error,
  };
}
