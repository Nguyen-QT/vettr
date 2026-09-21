import Image from "next/image";

import { Separator } from "@/components/ui/separator";
import { RequestActions } from "@/domains/intake/components/RequestActions";
import type { PendingIntakeRequestSummary } from "@/domains/intake/types";

interface RequestCardProps {
  request: PendingIntakeRequestSummary;
}

// Pure view (CLAUDE.md): renders whatever summary it's handed, makes no
// decisions and fetches nothing. Approve/Decline state lives in
// RequestActions' own hook, not here.
const REQUESTED_TIME_FORMAT = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function RequestCard({ request }: RequestCardProps) {
  const instagramUrl = `https://instagram.com/${request.clientInstagramHandle}`;
  const tags = [...request.designTags, ...request.aestheticTags];

  return (
    <article className="flex flex-col gap-3 rounded-lg border border-border p-4">
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

      <p className="text-sm text-muted-foreground">
        {request.clientEmail}
        {request.clientPhone ? ` · ${request.clientPhone}` : ""}
      </p>

      {request.requestedStartTime ? (
        <p className="text-sm text-muted-foreground">
          Requested: {REQUESTED_TIME_FORMAT.format(request.requestedStartTime)}
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
      <RequestActions intakeRequestId={request.id} status={request.status} />
    </article>
  );
}
