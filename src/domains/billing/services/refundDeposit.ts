import type Stripe from "stripe";

import { getBookingRequestForDeposit } from "@/domains/booking/services/getBookingRequestForDeposit";
import { Prisma } from "@/generated/prisma/client";
import { stripe } from "@/lib/stripe";

import {
  DEPOSIT_REFUND_IDEMPOTENCY_KEY_PREFIX,
  DEPOSIT_REFUND_INIT_ERROR_MESSAGE,
  DEPOSIT_REFUND_MISSING_PAYMENT_INTENT_ERROR_MESSAGE,
  DEPOSIT_REFUND_NOT_PAID_ERROR_MESSAGE,
  DEPOSIT_REFUND_REQUEST_NOT_FOUND_ERROR_MESSAGE,
} from "../constants";
import type { DepositRefundIntent, RefundDepositResult } from "../types";
import { advanceDepositRefundStatus } from "./advanceDepositRefundStatus";
import { recordDepositRefundIntent } from "./recordDepositRefundIntent";

// The typed Prisma code only, never its message.
function prismaErrorCode(error: unknown): string | undefined {
  return error instanceof Prisma.PrismaClientKnownRequestError ? error.code : undefined;
}

// Domain Service (CLAUDE.md 7.3.3, refund intent 56.6): issues a full
// refund of a paid deposit via Stripe. Callers (booking's
// cancelBookingRequest/cancelApprovedBookingAsArtist, 7.3.4) both refund
// in full regardless of cancellation timing -- self-cancel is only ever
// reachable outside the existing 48-hour window, and an artist-cancel is
// never the client's fault -- so there's no partial-refund calculation
// here. confirmDepositPayment also calls this for a payment that lands on
// an already cancelled or declined booking (56.2). A no-show forfeits the
// deposit simply by never calling this function.
// The intent is recorded before Stripe is called (architecture.md §6.2):
// a PENDING DepositRefund row, then refunds.create, then the status Stripe
// returns, written forward-only through advanceDepositRefundStatus. Each
// step is caught on its own and logged with ids only. A failed intent or
// create returns the generic retryable error: no refund exists on Stripe,
// and a failed create leaves the row PENDING with no refund id. A failed
// status write still returns success, because the refund exists, and the
// webhook attaches its id through metadata.bookingRequestId.
// Idempotent: a row that already holds a refund id (FAILED included --
// recovering a failed refund is manual, 56.11) returns success without a
// second Stripe call.
// Reads BookingRequest through booking's narrow deposit read (7.2.3)
// rather than prisma directly -- billing never queries booking's table
// (CLAUDE.md's Domain Boundary Isolation rule).
export async function refundDeposit(
  bookingRequestId: string
): Promise<RefundDepositResult> {
  const request = await getBookingRequestForDeposit(bookingRequestId);

  if (!request) {
    return { success: false, error: DEPOSIT_REFUND_REQUEST_NOT_FOUND_ERROR_MESSAGE };
  }

  if (!request.depositPaid) {
    return { success: false, error: DEPOSIT_REFUND_NOT_PAID_ERROR_MESSAGE };
  }

  if (!request.stripePaymentIntentId) {
    return {
      success: false,
      error: DEPOSIT_REFUND_MISSING_PAYMENT_INTENT_ERROR_MESSAGE,
    };
  }

  let intent: DepositRefundIntent;
  try {
    intent = await recordDepositRefundIntent(bookingRequestId, request.stripePaymentIntentId);
  } catch (error) {
    // Nothing reached Stripe.
    console.error({
      operation: "refundDeposit",
      reason: "intent_record_failed",
      severity: "warning",
      bookingRequestId,
      errorCode: prismaErrorCode(error),
    });
    return { success: false, error: DEPOSIT_REFUND_INIT_ERROR_MESSAGE };
  }

  if (intent.stripeRefundId !== null) {
    return { success: true };
  }

  let refund: Stripe.Refund;
  try {
    refund = await stripe.refunds.create(
      {
        // The intent's PaymentIntent, not the booking's current one, so a
        // retry under the per-booking key sends the same parameters.
        payment_intent: intent.stripePaymentIntentId,
        // Lets the refund webhooks match a refund whose local write was lost.
        metadata: { bookingRequestId },
      },
      {
        // Idempotency Keys on Deposit/Refund Calls (CLAUDE.md 15.1): a
        // dropped response after Stripe already accepted the refund
        // must not let a client-side retry issue a second one for the
        // same booking.
        idempotencyKey: `${DEPOSIT_REFUND_IDEMPOTENCY_KEY_PREFIX}:${bookingRequestId}`,
      }
    );
  } catch {
    // Ids only: a Stripe error can carry the whole refund or charge object.
    // The row stays PENDING with no refund id.
    console.error({
      operation: "refundDeposit",
      reason: "stripe_create_failed",
      severity: "warning",
      bookingRequestId,
      paymentIntentId: intent.stripePaymentIntentId,
    });
    return { success: false, error: DEPOSIT_REFUND_INIT_ERROR_MESSAGE };
  }

  // Stripe has accepted the refund, so from here every failure still
  // returns success: reporting failure would be factually wrong and could
  // make a caller retry.
  try {
    await advanceDepositRefundStatus({
      bookingRequestId,
      stripeRefundId: refund.id,
      stripeStatus: refund.status,
      failureReason: refund.failure_reason,
    });
  } catch (error) {
    // The call worked but the local write failed (architecture.md §6.2).
    // The row stays PENDING with no refund id until the refund webhooks
    // attach it.
    console.error({
      operation: "refundDeposit",
      reason: "record_failed",
      severity: "critical",
      bookingRequestId,
      stripeRefundId: refund.id,
      errorCode: prismaErrorCode(error),
    });
  }

  return { success: true };
}
