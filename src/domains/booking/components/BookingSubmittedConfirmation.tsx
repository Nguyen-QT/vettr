"use client";

import Link from "next/link";
import { useEffect, useId, useRef } from "react";

import { buttonVariants } from "@/components/ui/button";

// Pure view (54.5.4.4): what the reordered wizard shows once a request is
// in. Every success path ends with a CLIENT session (an existing one, or
// the cookie the verify-and-submit action sets), so it links straight to
// /client, where the request is listed under "Your bookings". Fixed copy,
// no props: nothing about the request or the client (no id, no email) is
// shown. BookingRequestWizard (54.5.6.1) mounts it in place of the wizard,
// and only on success; a verified-but-failed submit stays on the wizard's
// error state.
//
// The heading takes focus on mount: the wizard (and the button just
// pressed) unmounts underneath the user, so focus would otherwise drop to
// <body> -- and a freshly mounted role="status" isn't reliably announced.
export function BookingSubmittedConfirmation() {
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-6 rounded-lg border border-border bg-card p-6 text-card-foreground shadow-sm"
    >
      <div className="flex flex-col gap-2">
        <h2
          id={headingId}
          ref={headingRef}
          tabIndex={-1}
          className="text-xl font-semibold tracking-tight text-foreground outline-none"
        >
          Request submitted
        </h2>
        <p className="text-sm text-muted-foreground">
          The artist will review your reference images and proposed budget.
        </p>
        <p className="text-sm text-muted-foreground">
          Nothing is booked yet. If they approve it, you&apos;ll be asked to
          pay a deposit, and your slot isn&apos;t locked in until it&apos;s
          paid.
        </p>
        <p className="text-sm text-muted-foreground">
          You can follow this request from your bookings.
        </p>
      </div>

      <Link href="/client" className={buttonVariants({ className: "w-full" })}>
        View your bookings
      </Link>
    </section>
  );
}
