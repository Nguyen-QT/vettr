"use client";

import { Button } from "@/components/ui/button";
import { FieldError, FieldLegend } from "@/components/ui/field";
import { useArtistConnectOnboarding } from "@/domains/billing/hooks/useArtistConnectOnboarding";
import type { ArtistConnectStatus } from "@/domains/billing/types";

// Pure view (CLAUDE.md 24.1.5): renders whatever
// useArtistConnectOnboarding reports -- no artistId prop, the hook
// derives it from the session, same posture as DepositAmountsSettings
// (7.1.9). Onboarding itself is a redirect to Stripe's hosted link --
// a deliberate exception to the in-app Elements pattern used for
// client deposits, since Connect onboarding is inherently Stripe-hosted.
export function ArtistConnectPayoutsSettings() {
  const {
    status,
    isLoading,
    loadError,
    isPending,
    onboardingError,
    startOnboarding,
  } = useArtistConnectOnboarding();

  if (isLoading) {
    return <p role="status">Loading payout status…</p>;
  }

  return (
    <section className="flex flex-col gap-3">
      <FieldLegend>Payouts</FieldLegend>
      <p className="text-sm text-muted-foreground">
        Connect a Stripe account so deposits collected on your behalf can be
        paid out to your bank account.
      </p>

      <div className="flex flex-wrap gap-2">
        <ConnectStatusBadge
          label="Account"
          active={status.connected}
          activeText="Connected"
          inactiveText="Not connected"
        />
        <ConnectStatusBadge
          label="Charges"
          active={status.chargesEnabled}
          activeText="Enabled"
          inactiveText="Pending"
        />
        <ConnectStatusBadge
          label="Payouts"
          active={status.payoutsEnabled}
          activeText="Enabled"
          inactiveText="Pending"
        />
      </div>

      {status.connected && status.chargesEnabled && status.payoutsEnabled ? (
        <p className="text-sm text-muted-foreground">
          Your payout account is fully set up.
        </p>
      ) : null}

      <Button
        type="button"
        variant="outline"
        className="w-fit"
        disabled={isPending}
        onClick={startOnboarding}
      >
        {connectButtonLabel(status)}
      </Button>

      {loadError ? (
        <FieldError errors={[{ message: loadError }]} />
      ) : null}
      {onboardingError ? (
        <FieldError errors={[{ message: onboardingError }]} />
      ) : null}
    </section>
  );
}

// The label needs to reflect capability status, not just whether an
// account exists -- "Continue onboarding" once charges/payouts are
// both already enabled falsely implies something is still incomplete.
// Revisiting the same Account Link is still valid once fully enabled
// (Stripe treats it as an update-details flow), hence "Update account
// details" rather than hiding the button entirely.
function connectButtonLabel(status: ArtistConnectStatus): string {
  if (!status.connected) {
    return "Connect with Stripe";
  }
  if (!status.chargesEnabled || !status.payoutsEnabled) {
    return "Continue onboarding";
  }
  return "Update account details";
}

interface ConnectStatusBadgeProps {
  label: string;
  active: boolean;
  activeText: string;
  inactiveText: string;
}

function ConnectStatusBadge({
  label,
  active,
  activeText,
  inactiveText,
}: ConnectStatusBadgeProps) {
  return (
    <span
      className={
        active
          ? "w-fit rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground"
          : "w-fit rounded-full bg-chart-4/20 px-2 py-0.5 text-xs font-medium text-chart-4"
      }
    >
      {label}: {active ? activeText : inactiveText}
    </span>
  );
}
