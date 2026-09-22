import { getBookingRequestByPaymentIntentId } from "@/domains/booking/services/getBookingRequestByPaymentIntentId";
import { recordDepositRefund } from "@/domains/booking/services/recordDepositRefund";

import { DEPOSIT_REFUND_PAYMENT_INTENT_NOT_FOUND_ERROR_MESSAGE } from "../constants";
import type { ConfirmDepositRefundResult } from "../types";

// Domain Service (CLAUDE.md 7.3.3-fix): called from the Stripe webhook
// handler once a charge.refunded event confirms a refund actually
// completed. The authoritative confirmation for depositRefunded/
// stripeRefundId -- same role payment_intent.succeeded plays for
// confirmDepositPayment/depositPaid -- so a refundDeposit call whose
// own DB write failed after Stripe already processed the refund gets
// reconciled here via Stripe's own retried webhook delivery, rather
// than staying permanently inconsistent. Idempotent: Stripe may
// redeliver the same event, and an already-confirmed request simply
// returns success again without a redundant write.
export async function confirmDepositRefund(
  paymentIntentId: string,
  stripeRefundId: string
): Promise<ConfirmDepositRefundResult> {
  const request = await getBookingRequestByPaymentIntentId(paymentIntentId);

  if (!request) {
    return {
      success: false,
      error: DEPOSIT_REFUND_PAYMENT_INTENT_NOT_FOUND_ERROR_MESSAGE,
    };
  }

  if (request.depositRefunded) {
    return { success: true };
  }

  await recordDepositRefund(request.id, stripeRefundId);

  return { success: true };
}
