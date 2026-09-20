"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useRequestActions } from "@/domains/intake/hooks/useRequestActions";

interface RequestActionsProps {
  intakeRequestId: string;
}

// Pure view (CLAUDE.md): renders whatever useRequestActions reports, makes
// no decisions of its own — the hook owns all approve/decline state.
export function RequestActions({ intakeRequestId }: RequestActionsProps) {
  const { approve, decline, isPending, responseMessage, error } =
    useRequestActions(intakeRequestId);
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (!responseMessage) return;
    await navigator.clipboard.writeText(responseMessage);
    setCopied(true);
  }

  if (responseMessage) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm">{responseMessage}</p>
        <Button type="button" variant="outline" size="sm" onClick={handleCopy}>
          {copied ? "Copied" : "Copy message"}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Button type="button" disabled={isPending} onClick={approve}>
          Approve
        </Button>
        <Button
          type="button"
          variant="destructive"
          disabled={isPending}
          onClick={decline}
        >
          Decline
        </Button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
