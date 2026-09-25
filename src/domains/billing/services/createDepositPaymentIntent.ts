import { getBookingRequestForDeposit } from "@/domains/booking/services/getBookingRequestForDeposit";
import { recordDepositPaymentIntent } from "@/domains/booking/services/recordDepositPaymentIntent";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";

import {
  DEPOSIT_ALREADY_PAID_ERROR_MESSAGE,
  DEPOSIT_NOT_CONFIGURED_ERROR_MESSAGE,
  DEPOSIT_PAYMENT_INIT_ERROR_MESSAGE,
  DEPOSIT_PAYMENT_INTENT_IDEMPOTENCY_KEY_PREFIX,
  DEPOSIT_REQUEST_NOT_APPROVED_ERROR_MESSAGE,
  DEPOSIT_REQUEST_NOT_FOUND_ERROR_MESSAGE,
  PRECHARGE_PERCENTAGE,
} from "../constants";
import type {
  CreateDepositPaymentIntentInput,
  CreateDepositPaymentIntentResult,
} from "../types";
import { getArtistDepositSettings } from "./getArtistDepositSettings";

// Stripe Connect deposit routing (CLAUDE.md 24.1.2): the connected
// account id only if it's actually charges-enabled -- Stripe rejects
// on_behalf_of/transfer_data against an account that isn't, so an
// onboarded-but-not-yet-approved artist must fall back to null (today's
// platform-only routing) rather than erroring the whole deposit.
async function getChargeableConnectAccountId(artistId: string): Promise<string | null> {
  const artist = await prisma.artist.findUnique({
    where: { id: artistId },
    select: { stripeConnectAccountId: true, stripeConnectChargesEnabled: true },
  });

  return artist?.stripeConnectChargesEnabled ? artist.stripeConnectAccountId : null;
}

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

  // Stripe Connect deposit routing (CLAUDE.md 24.1.2): once the
  // artist's connected account has charges enabled, the deposit routes
  // straight to their own balance via transfer_data/on_behalf_of
  // instead of only ever landing in the platform's account. Falls back
  // to today's platform-only behavior for an artist who hasn't
  // onboarded (or onboarded but isn't charges-enabled yet) -- deposit
  // collection was never gated on Connect existing, so this must never
  // block a payment, only change where the money ends up.
  const artistConnectAccountId = await getChargeableConnectAccountId(request.artistId);

  const paymentIntent = await stripe.paymentIntents.create(
    {
      amount: Math.round(depositAmount * 100),
      currency: "gbp",
      metadata: { bookingRequestId: request.id },
      // Restricts to payment methods that never redirect off-page, since
      // this app's Stripe Elements integration (CLAUDE.md 7.1) stays
      // embedded and in-app rather than sending the client to a
      // Stripe-hosted page. Without this, Stripe defaults to whatever's
      // enabled in the Dashboard, which can include redirect-based
      // methods -- those require a return_url this app never provides,
      // and confirming without one fails outright. Caught by the real,
      // unmocked Stripe test-mode call in 14.1.2's integration test; the
      // mocked unit suite can't see this since it stubs the API entirely.
      automatic_payment_methods: { enabled: true, allow_redirects: "never" },
      ...(artistConnectAccountId
        ? {
            on_behalf_of: artistConnectAccountId,
            transfer_data: { destination: artistConnectAccountId },
          }
        : {}),
    },
    {
      // Idempotency Keys on Deposit/Refund Calls (CLAUDE.md 15.1): a
      // dropped response after Stripe already created the PaymentIntent
      // must not let a client-side retry create a second one for the
      // same booking.
      idempotencyKey: `${DEPOSIT_PAYMENT_INTENT_IDEMPOTENCY_KEY_PREFIX}:${request.id}`,
    }
  );

  if (!paymentIntent.client_secret) {
    return { success: false, error: DEPOSIT_PAYMENT_INIT_ERROR_MESSAGE };
  }

  await recordDepositPaymentIntent(request.id, {
    depositAmount,
    stripePaymentIntentId: paymentIntent.id,
  });

  return { success: true, clientSecret: paymentIntent.client_secret };
}
