import Image from "next/image";

import { Separator } from "@/components/ui/separator";
import { RequestActions } from "@/domains/booking/components/RequestActions";
import type { PendingBookingRequestSummary } from "@/domains/booking/types";

interface RequestCardProps {
  request: PendingBookingRequestSummary;
}

// Pure view (CLAUDE.md): renders whatever summary it's handed, makes no
// decisions and fetches nothing. Approve/Decline state lives in
// RequestActions' own hook, not here.
const REQUESTED_TIME_FORMAT = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
});

const MAX_END_TIME_FORMAT = new Intl.DateTimeFormat("en-GB", {
  timeStyle: "short",
});

// Cancellation history visibility (CLAUDE.md 11.1) -- null when
// there's nothing worth flagging. cancellationCount > 0 without
// enforcePrecharge shouldn't normally happen (STRIKE_THRESHOLD = 1
// auto-toggles the flag on the first strike), but the label still
// reads sensibly either way rather than assuming the two always agree.
function cancellationFlagLabel(request: PendingBookingRequestSummary): string | null {
  if (request.clientCancellationCount === 0 && !request.clientEnforcePrecharge) {
    return null;
  }
  const count = request.clientCancellationCount;
  const countLabel = `${count} cancellation${count === 1 ? "" : "s"}`;
  return request.clientEnforcePrecharge
    ? `${countLabel} · Deposit required`
    : countLabel;
}

export function RequestCard({ request }: RequestCardProps) {
  const instagramUrl = `https://instagram.com/${request.clientInstagramHandle}`;
  const tags = [...request.designTags, ...request.aestheticTags];
  const cancellationFlag = cancellationFlagLabel(request);

  return (
    <article className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 text-card-foreground">
      <div className="flex items-center justify-between">
        <a
          href={instagramUrl}
          target="_blank"
          rel="noreferrer"
          className="text-sm font-medium underline underline-offset-4"
        >
          @{request.clientInstagramHandle}
        </a>
        <span className="text-sm text-muted-foreground">{request.tier}</span>
      </div>

      {request.paymentMethod ? (
        <span className="w-fit rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground">
          {request.paymentMethod === "CASH" ? "Cash" : "Card"}
        </span>
      ) : null}

      {cancellationFlag ? (
        <span className="w-fit rounded-full bg-chart-4/20 px-2 py-0.5 text-xs font-medium text-chart-4">
          {cancellationFlag}
        </span>
      ) : null}

      <p className="text-sm text-muted-foreground">
        {request.clientEmail}
        {request.clientPhone ? ` · ${request.clientPhone}` : ""}
      </p>

      {request.requestedStartTime ? (
        <p className="text-sm text-muted-foreground">
          Requested: {REQUESTED_TIME_FORMAT.format(request.requestedStartTime)}
        </p>
      ) : null}

      {request.clientMaxEndTime ? (
        <p className="text-sm text-muted-foreground">
          Must be finished by: {MAX_END_TIME_FORMAT.format(request.clientMaxEndTime)}
        </p>
      ) : null}

      {request.designReferenceImageUrls.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {request.designReferenceImageUrls.map((url) => (
            <li key={url}>
              <Image
                src={url}
                alt="Design reference"
                width={96}
                height={96}
                className="rounded-md object-cover"
              />
            </li>
          ))}
        </ul>
      ) : null}

      <p className="text-sm text-muted-foreground">
        £{request.minPrice} – £{request.maxPrice}
      </p>

      {tags.length > 0 ? (
        <p className="text-sm text-muted-foreground">{tags.join(", ")}</p>
      ) : null}

      {request.clientNotes ? (
        <>
          <Separator />
          <p className="text-sm">{request.clientNotes}</p>
        </>
      ) : null}

      <Separator />
      <RequestActions
        bookingRequestId={request.id}
        status={request.status}
        tier={request.tier}
      />
    </article>
  );
}
