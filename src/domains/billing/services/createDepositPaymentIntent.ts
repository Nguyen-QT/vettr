import { getBookingRequestForDeposit } from "@/domains/booking/services/getBookingRequestForDeposit";
import { recordDepositPaymentIntent } from "@/domains/booking/services/recordDepositPaymentIntent";
import { stripe } from "@/lib/stripe";

import {
  DEPOSIT_ALREADY_PAID_ERROR_MESSAGE,
  DEPOSIT_NOT_CONFIGURED_ERROR_MESSAGE,
  DEPOSIT_PAYMENT_INIT_ERROR_MESSAGE,
  DEPOSIT_REQUEST_NOT_APPROVED_ERROR_MESSAGE,
  DEPOSIT_REQUEST_NOT_FOUND_ERROR_MESSAGE,
  PRECHARGE_PERCENTAGE,
} from "../constants";
import type {
  CreateDepositPaymentIntentInput,
  CreateDepositPaymentIntentResult,
} from "../types";
import { getArtistDepositSettings } from "./getArtistDepositSettings";

// Domain Service (CLAUDE.md 7.1.3, migrated in 7.2.4): creates the
// Stripe PaymentIntent a client pays to secure an already-APPROVED
// booking. clientProfileId is the trusted session's own id (see
// booking's cancelBookingRequest precedent) -- an ownership mismatch is
// reported the same as a missing request. depositAmount is
// snapshotted onto the BookingRequest here rather than read live from
// ArtistDepositSetting on every future check, so a later change to
// the artist's per-tier amount never retroactively alters an
// in-flight or already-paid request. Reads/writes BookingRequest
// through booking's narrow deposit functions (7.2.3) rather than
// prisma.bookingRequest directly -- billing never queries booking's
// table (CLAUDE.md's Domain Boundary Isolation rule).
export async function createDepositPaymentIntent(
  input: CreateDepositPaymentIntentInput
): Promise<CreateDepositPaymentIntentResult> {
  const request = await getBookingRequestForDeposit(input.bookingRequestId);

  if (!request || request.clientId !== input.clientProfileId) {
    return { success: false, error: DEPOSIT_REQUEST_NOT_FOUND_ERROR_MESSAGE };
  }

  if (request.status !== "APPROVED") {
    return { success: false, error: DEPOSIT_REQUEST_NOT_APPROVED_ERROR_MESSAGE };
  }

  if (request.depositPaid) {
    return { success: false, error: DEPOSIT_ALREADY_PAID_ERROR_MESSAGE };
  }

  const settings = await getArtistDepositSettings(request.artistId);
  const configuredAmount = settings[request.tier];

  // Upfront Cancellation Precharge Engine (CLAUDE.md 7.4): a flagged
  // client's required deposit is the greater of the artist's normal
  // per-tier amount and PRECHARGE_PERCENTAGE of the estimate -- applies
  // even when the artist hasn't configured a deposit for this tier at
  // all. estimatedPrice is nullable at the DB level only; every request
  // that reaches APPROVED already has one set (4.4), so a null here
  // just means precharge doesn't apply this time rather than erroring.
  const prechargeAmount =
    request.clientEnforcePrecharge && request.estimatedPrice !== null
      ? Math.round(request.estimatedPrice * PRECHARGE_PERCENTAGE * 100) / 100
      : null;

  const depositAmount =
    configuredAmount === null && prechargeAmount === null
      ? null
      : Math.max(configuredAmount ?? 0, prechargeAmount ?? 0);

  if (depositAmount === null) {
    return { success: false, error: DEPOSIT_NOT_CONFIGURED_ERROR_MESSAGE };
  }

  const paymentIntent = await stripe.paymentIntents.create({
    amount: Math.round(depositAmount * 100),
    currency: "gbp",
    metadata: { bookingRequestId: request.id },
  });

  if (!paymentIntent.client_secret) {
    return { success: false, error: DEPOSIT_PAYMENT_INIT_ERROR_MESSAGE };
  }

  await recordDepositPaymentIntent(request.id, {
    depositAmount,
    stripePaymentIntentId: paymentIntent.id,
  });

  return { success: true, clientSecret: paymentIntent.client_secret };
}
