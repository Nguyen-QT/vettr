import { getBookingRequestByPaymentIntentId } from "@/domains/booking/services/getBookingRequestByPaymentIntentId";
import { markDepositPaid } from "@/domains/booking/services/markDepositPaid";

import { DEPOSIT_PAYMENT_INTENT_NOT_FOUND_ERROR_MESSAGE } from "../constants";
import type { ConfirmDepositPaymentResult } from "../types";

// Domain Service (CLAUDE.md 7.1.4, migrated in 7.2.4): called from the
// Stripe webhook handler once a PaymentIntent succeeds. Idempotent --
// Stripe may redeliver the same event, and an already-confirmed
// request simply returns success again without a redundant write.
// Reads/writes BookingRequest through booking's narrow deposit functions
// (7.2.3) rather than prisma.bookingRequest directly -- billing never
// queries booking's table (CLAUDE.md's Domain Boundary Isolation rule).
export async function confirmDepositPayment(
  paymentIntentId: string
): Promise<ConfirmDepositPaymentResult> {
  const request = await getBookingRequestByPaymentIntentId(paymentIntentId);

  if (!request) {
    return { success: false, error: DEPOSIT_PAYMENT_INTENT_NOT_FOUND_ERROR_MESSAGE };
  }

  if (request.depositPaid) {
    return { success: true };
  }

  await markDepositPaid(request.id);

  return { success: true };
}
