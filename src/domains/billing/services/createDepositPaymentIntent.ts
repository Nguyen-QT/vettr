import type Stripe from "stripe";

import { getBookingRequestForDeposit } from "@/domains/booking/services/getBookingRequestForDeposit";
import { recordDepositPaymentIntent } from "@/domains/booking/services/recordDepositPaymentIntent";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";

import {
  DEPOSIT_ALREADY_PAID_ERROR_MESSAGE,
  DEPOSIT_NOT_CONFIGURED_ERROR_MESSAGE,
  DEPOSIT_PAYMENT_INIT_ERROR_MESSAGE,
  DEPOSIT_PAYMENT_INTENT_IDEMPOTENCY_KEY_PREFIX,
  DEPOSIT_PAYMENT_PROCESSING_ERROR_MESSAGE,
  DEPOSIT_REQUEST_NOT_APPROVED_ERROR_MESSAGE,
  DEPOSIT_REQUEST_NOT_FOUND_ERROR_MESSAGE,
  PRECHARGE_PERCENTAGE,
  STORED_DEPOSIT_PAYMENT_INTENT_ACTION_BY_STATUS,
} from "../constants";
import type {
  CreateDepositPaymentIntentInput,
  CreateDepositPaymentIntentResult,
  DepositPaymentIntentStatus,
} from "../types";
import { cancelDepositPaymentIntent } from "./cancelDepositPaymentIntent";
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

function isDepositPaymentIntentStatus(status: string): status is DepositPaymentIntentStatus {
  return Object.hasOwn(STORED_DEPOSIT_PAYMENT_INTENT_ACTION_BY_STATUS, status);
}

// Whether a stored PaymentIntent charges what would be created now. Retrieve
// doesn't expand on_behalf_of or the destination, so both are ids.
function matchesDepositParams(
  paymentIntent: Stripe.PaymentIntent,
  amount: number,
  artistConnectAccountId: string | null
): boolean {
  return (
    paymentIntent.amount === amount &&
    paymentIntent.on_behalf_of === artistConnectAccountId &&
    (paymentIntent.transfer_data?.destination ?? null) === artistConnectAccountId
  );
}

// Domain Service (CLAUDE.md 7.1.3, migrated in 7.2.4, PaymentIntent reuse
// 56.4): returns the client secret for the Stripe PaymentIntent a client
// pays to secure an already-APPROVED booking. clientProfileId is the
// trusted session's own id (see booking's cancelBookingRequest
// precedent) -- an ownership mismatch is reported the same as a missing
// request. depositAmount is snapshotted onto the BookingRequest here
// rather than read live from ArtistDepositSetting on every future check,
// so a later change to the artist's per-tier amount never retroactively
// alters an in-flight or already-paid request.
// At most one payable PaymentIntent per booking: the stored one. It is
// retrieved and acted on by status (STORED_DEPOSIT_PAYMENT_INTENT_ACTION_BY_STATUS),
// and only replaced once Stripe confirms it's cancelled -- Stripe refuses
// to cancel one that's processing or has succeeded.
// The client secret comes after the commit: it's only returned once
// recordDepositPaymentIntent's compare-and-set has committed this
// PaymentIntent as the stored id, reuse included (a cancel or a newer
// PaymentIntent that committed after the read above makes it refuse). A
// lost write returns no secret, so the PaymentIntent left behind can't be
// paid, and payment_intent.succeeded can never arrive before the write
// the webhook's lookup depends on.
// Reads/writes BookingRequest through booking's narrow deposit functions
// (7.2.3) rather than prisma.bookingRequest directly -- billing never
// queries booking's table (CLAUDE.md's Domain Boundary Isolation rule).
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

  const amount = Math.round(depositAmount * 100);
  const storedPaymentIntentId = request.stripePaymentIntentId;
  let paymentIntent: Stripe.PaymentIntent | null = null;

  if (storedPaymentIntentId !== null) {
    let stored: Stripe.PaymentIntent;
    try {
      stored = await stripe.paymentIntents.retrieve(storedPaymentIntentId);
    } catch {
      // Ids only: a Stripe error can carry the whole PaymentIntent object,
      // metadata included.
      console.error({
        operation: "createDepositPaymentIntent",
        reason: "stripe_retrieve_failed",
        severity: "warning",
        bookingRequestId: request.id,
        paymentIntentId: storedPaymentIntentId,
      });
      return { success: false, error: DEPOSIT_PAYMENT_INIT_ERROR_MESSAGE };
    }

    // A status this code doesn't know might still be payable, so it is
    // never replaced.
    if (!isDepositPaymentIntentStatus(stored.status)) {
      console.error({
        operation: "createDepositPaymentIntent",
        reason: "unknown_payment_intent_status",
        severity: "warning",
        bookingRequestId: request.id,
        paymentIntentId: storedPaymentIntentId,
        status: stored.status,
      });
      return { success: false, error: DEPOSIT_PAYMENT_INIT_ERROR_MESSAGE };
    }

    const action = STORED_DEPOSIT_PAYMENT_INTENT_ACTION_BY_STATUS[stored.status];

    if (action === "REFUSE") {
      return { success: false, error: DEPOSIT_PAYMENT_PROCESSING_ERROR_MESSAGE };
    }

    if (action === "REUSE") {
      if (matchesDepositParams(stored, amount, artistConnectAccountId)) {
        paymentIntent = stored;
      } else if (!(await cancelDepositPaymentIntent(storedPaymentIntentId))) {
        // Already logged. Stripe also refuses a PaymentIntent that started
        // processing since the retrieve; a retry then gets the refusal above.
        return { success: false, error: DEPOSIT_PAYMENT_INIT_ERROR_MESSAGE };
      }
    }
  }

  paymentIntent ??= await stripe.paymentIntents.create(
    {
      amount,
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
      // Idempotency Keys on Deposit/Refund Calls (CLAUDE.md 15.1, 56.4,
      // 56.5): keyed by the PaymentIntent this replaces, so a dropped
      // response or a concurrent tab replacing the same one gets the same
      // new PaymentIntent instead of a second payable one. The amount and
      // routing are the only create parameters that change at runtime
      // (tier edit, precharge, Connect chargesEnabled), so they join the
      // key: a retry with changed parameters gets a new key instead of
      // Stripe's idempotency error for 24h. A new runtime parameter must
      // join the key too.
      idempotencyKey: `${DEPOSIT_PAYMENT_INTENT_IDEMPOTENCY_KEY_PREFIX}:${request.id}:${storedPaymentIntentId ?? "initial"}:${amount}:${artistConnectAccountId ?? "platform"}`,
    }
  );

  if (!paymentIntent.client_secret) {
    return { success: false, error: DEPOSIT_PAYMENT_INIT_ERROR_MESSAGE };
  }

  const recorded = await recordDepositPaymentIntent(request.id, {
    depositAmount,
    stripePaymentIntentId: paymentIntent.id,
    replacedPaymentIntentId: storedPaymentIntentId,
  });

  if (!recorded) {
    return { success: false, error: DEPOSIT_PAYMENT_INIT_ERROR_MESSAGE };
  }

  return { success: true, clientSecret: paymentIntent.client_secret };
}
