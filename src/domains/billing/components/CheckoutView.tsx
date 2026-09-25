"use client";

import { useState } from "react";

import { BackNav } from "@/components/ui/back-nav";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
  FieldLegend,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { useConfirmAction } from "@/components/ui/use-confirm-action";
import { AppointmentCard } from "@/domains/booking/components/AppointmentCard";
import { PAYMENT_METHODS } from "@/domains/booking/constants";
import type { PaymentMethod, UpcomingAppointmentSummary } from "@/domains/booking/types";

import { useCheckout } from "../hooks/useCheckout";
import type { BillingAddonSummary, FinalBillBreakdown } from "../types";

interface CheckoutViewProps {
  artistId: string;
  bookingRequestId: string;
  appointment: UpcomingAppointmentSummary;
  addons: BillingAddonSummary[];
  bill: FinalBillBreakdown;
}

// Pure view (CLAUDE.md 7.5.7): the day-of checkout flow's page --
// booking summary (reusing AppointmentCard read-only), add-on entry/
// removal, a running total crediting a paid deposit, and the
// "Finalize & complete" control that closes out the appointment.
// "Finalize" is disabled while an add-on mutation is still in
// flight (isAdding || removingAddonId !== null) -- a presentation
// decision that belongs here, not inside useCheckout, since the
// domain services already guard correctness regardless of button
// state (CLAUDE.md's Blast Radius Boundary).
export function CheckoutView({
  artistId,
  bookingRequestId,
  appointment,
  addons,
  bill,
}: CheckoutViewProps) {
  const {
    addAddon,
    isAdding,
    addError,
    removeAddon,
    removingAddonId,
    removeError,
    finalize,
    isFinalizing,
    finalizeError,
    overridePaymentMethod,
    isOverridingPaymentMethod,
    overridePaymentMethodError,
  } = useCheckout({ bookingRequestId, artistId });

  const [label, setLabel] = useState("");
  const [price, setPrice] = useState("");
  const [pendingPaymentMethod, setPendingPaymentMethod] =
    useState<PaymentMethod | null>(null);
  const finalizeConfirm = useConfirmAction();
  const overridePaymentMethodConfirm = useConfirmAction();

  function handlePaymentMethodChange(method: PaymentMethod) {
    setPendingPaymentMethod(method);
    overridePaymentMethodConfirm.requestConfirmation(() => {
      overridePaymentMethod(method);
    });
  }

  function handleAddAddon() {
    const parsedPrice = Number(price);
    if (!label.trim() || !Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      return;
    }
    addAddon({ label: label.trim(), price: parsedPrice });
    setLabel("");
    setPrice("");
  }

  const isAddonMutating = isAdding || removingAddonId !== null;

  return (
    <div className="flex flex-col gap-6">
      <AppointmentCard appointment={appointment} actions={null} />

      <Separator />

      <section className="flex flex-col gap-3">
        <FieldLegend variant="label">Final balance payment method</FieldLegend>
        <RadioGroup
          value={appointment.paymentMethod ?? undefined}
          onValueChange={(value) => handlePaymentMethodChange(value as PaymentMethod)}
        >
          {PAYMENT_METHODS.map((method) => (
            <FieldLabel key={method} htmlFor={`checkout-paymentMethod-${method}`}>
              <Field orientation="horizontal">
                <RadioGroupItem
                  value={method}
                  id={`checkout-paymentMethod-${method}`}
                  disabled={isOverridingPaymentMethod}
                />
                <FieldContent>{method === "CASH" ? "Cash" : "Card"}</FieldContent>
              </Field>
            </FieldLabel>
          ))}
        </RadioGroup>
        <FieldError
          errors={
            overridePaymentMethodError
              ? [{ message: overridePaymentMethodError }]
              : undefined
          }
        />
      </section>

      <Separator />

      <section className="flex flex-col gap-3">
        <FieldLegend>Add-ons</FieldLegend>

        {addons.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {addons.map((addon) => (
              <li
                key={addon.id}
                className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
              >
                <span className="text-sm">{addon.label}</span>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground">
                    £{addon.price}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={removingAddonId === addon.id}
                    onClick={() => removeAddon(addon.id)}
                  >
                    Remove
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No add-ons yet.</p>
        )}
        <FieldError errors={removeError ? [{ message: removeError }] : undefined} />

        <Field orientation="horizontal">
          <FieldContent>
            <FieldLabel htmlFor="addon-label">Label</FieldLabel>
            <Input
              id="addon-label"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Extra shading"
            />
          </FieldContent>
          <FieldContent>
            <FieldLabel htmlFor="addon-price">Price (£)</FieldLabel>
            <Input
              id="addon-price"
              type="number"
              min={1}
              value={price}
              onChange={(event) => setPrice(event.target.value)}
            />
          </FieldContent>
          <Button type="button" disabled={isAdding} onClick={handleAddAddon}>
            Add
          </Button>
        </Field>
        <FieldError errors={addError ? [{ message: addError }] : undefined} />
      </section>

      <Separator />

      <section className="flex flex-col gap-2 rounded-lg border border-border p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Estimated price</span>
          <span>£{bill.estimatedPrice}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Add-ons</span>
          <span>£{bill.addonsTotal}</span>
        </div>
        {bill.depositCredit > 0 ? (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Deposit credit</span>
            <span>-£{bill.depositCredit}</span>
          </div>
        ) : null}
        <Separator />
        <div className="flex items-center justify-between text-base font-medium">
          <span>Total</span>
          <span>£{bill.total}</span>
        </div>
      </section>

      <FieldError errors={finalizeError ? [{ message: finalizeError }] : undefined} />

      <div className="flex items-center justify-between gap-3">
        <BackNav
          href={`/artist/${artistId}/appointments`}
          label="Back"
        />
        <Button
          type="button"
          disabled={isAddonMutating || isFinalizing}
          onClick={() => finalizeConfirm.requestConfirmation(finalize)}
        >
          {isFinalizing ? "Finalizing…" : "Finalize & complete"}
        </Button>
      </div>
      <ConfirmDialog
        open={finalizeConfirm.isOpen}
        onOpenChange={finalizeConfirm.onOpenChange}
        title="Finalize this checkout?"
        description="This marks the appointment as completed and can't be undone from here."
        confirmLabel="Finalize & complete"
        onConfirm={finalizeConfirm.confirm}
      />
      <ConfirmDialog
        open={overridePaymentMethodConfirm.isOpen}
        onOpenChange={overridePaymentMethodConfirm.onOpenChange}
        title="Change the payment method?"
        description={`Set the final balance payment method to ${
          pendingPaymentMethod === "CASH" ? "Cash" : "Card"
        }.`}
        confirmLabel="Confirm"
        onConfirm={overridePaymentMethodConfirm.confirm}
      />
    </div>
  );
}
