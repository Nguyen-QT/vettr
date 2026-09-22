"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useArtistDepositSettings } from "@/domains/billing/hooks/useArtistDepositSettings";
import { COMPLEXITY_TIERS } from "@/domains/booking/constants";
import type { ComplexityTier } from "@/domains/booking/types";

// Pure view (CLAUDE.md 7.1.9): renders whatever useArtistDepositSettings
// reports -- no artistId prop, the hook derives it from the session.
// A tier with no deposit configured yet shows an empty input rather
// than 0, matching the "no config = no deposit required yet" semantics
// from getArtistDepositSettings.
export function DepositAmountsSettings() {
  const { settings, isLoading, isPending, error, setTierDeposit } =
    useArtistDepositSettings();

  if (isLoading) {
    return <p role="status">Loading deposit amounts…</p>;
  }

  return (
    <section className="flex flex-col gap-3">
      <FieldLegend>Deposit amounts</FieldLegend>
      <FieldGroup>
        {COMPLEXITY_TIERS.map((tier) => (
          <TierDepositRow
            key={tier}
            tier={tier}
            depositAmount={settings[tier]}
            isPending={isPending}
            onSave={(amount) => setTierDeposit(tier, amount)}
          />
        ))}
      </FieldGroup>
      <FieldError errors={error ? [{ message: error }] : undefined} />
    </section>
  );
}

interface TierDepositRowProps {
  tier: ComplexityTier;
  depositAmount: number | null;
  isPending: boolean;
  onSave: (amount: number) => void;
}

function TierDepositRow({
  tier,
  depositAmount,
  isPending,
  onSave,
}: TierDepositRowProps) {
  const [value, setValue] = useState(
    depositAmount !== null ? String(depositAmount) : ""
  );

  // Re-syncs local input after a successful save refetches the hook's
  // state -- same precedent as scheduling's DayHoursRow.
  useEffect(() => {
    setValue(depositAmount !== null ? String(depositAmount) : "");
  }, [depositAmount]);

  const parsed = Number(value);
  const isValid = value !== "" && Number.isFinite(parsed) && parsed > 0;

  return (
    <Field orientation="horizontal">
      <FieldContent>
        <FieldLabel htmlFor={`deposit-${tier}`}>{tier}</FieldLabel>
        <Input
          id={`deposit-${tier}`}
          type="number"
          min={1}
          step={1}
          value={value}
          placeholder="Not set"
          onChange={(event) => setValue(event.target.value)}
        />
      </FieldContent>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={isPending || !isValid}
        onClick={() => onSave(parsed)}
      >
        Save
      </Button>
    </Field>
  );
}
