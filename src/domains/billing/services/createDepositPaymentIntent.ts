import { getIntakeRequestForDeposit } from "@/domains/intake/services/getIntakeRequestForDeposit";
import { recordDepositPaymentIntent } from "@/domains/intake/services/recordDepositPaymentIntent";
import { stripe } from "@/lib/stripe";

import {
  DEPOSIT_ALREADY_PAID_ERROR_MESSAGE,
  DEPOSIT_NOT_CONFIGURED_ERROR_MESSAGE,
  DEPOSIT_PAYMENT_INIT_ERROR_MESSAGE,
  DEPOSIT_REQUEST_NOT_APPROVED_ERROR_MESSAGE,
  DEPOSIT_REQUEST_NOT_FOUND_ERROR_MESSAGE,
} from "../constants";
import type {
  CreateDepositPaymentIntentInput,
  CreateDepositPaymentIntentResult,
} from "../types";
import { getArtistDepositSettings } from "./getArtistDepositSettings";

// Domain Service (CLAUDE.md 7.1.3, migrated in 7.2.4): creates the
// Stripe PaymentIntent a client pays to secure an already-APPROVED
// booking. clientProfileId is the trusted session's own id (see
// intake's cancelIntakeRequest precedent) -- an ownership mismatch is
// reported the same as a missing request. depositAmount is
// snapshotted onto the IntakeRequest here rather than read live from
// ArtistDepositSetting on every future check, so a later change to
// the artist's per-tier amount never retroactively alters an
// in-flight or already-paid request. Reads/writes IntakeRequest
// through intake's narrow deposit functions (7.2.3) rather than
// prisma.intakeRequest directly -- billing never queries intake's
// table (CLAUDE.md's Domain Boundary Isolation rule).
export async function createDepositPaymentIntent(
  input: CreateDepositPaymentIntentInput
): Promise<CreateDepositPaymentIntentResult> {
  const request = await getIntakeRequestForDeposit(input.intakeRequestId);

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
  const depositAmount = settings[request.tier];

  if (depositAmount === null) {
    return { success: false, error: DEPOSIT_NOT_CONFIGURED_ERROR_MESSAGE };
  }

  const paymentIntent = await stripe.paymentIntents.create({
    amount: Math.round(depositAmount * 100),
    currency: "gbp",
    metadata: { intakeRequestId: request.id },
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
