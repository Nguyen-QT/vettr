import { getIntakeRequestByPaymentIntentId } from "@/domains/intake/services/getIntakeRequestByPaymentIntentId";
import { markDepositPaid } from "@/domains/intake/services/markDepositPaid";

import { DEPOSIT_PAYMENT_INTENT_NOT_FOUND_ERROR_MESSAGE } from "../constants";
import type { ConfirmDepositPaymentResult } from "../types";

// Domain Service (CLAUDE.md 7.1.4, migrated in 7.2.4): called from the
// Stripe webhook handler once a PaymentIntent succeeds. Idempotent --
// Stripe may redeliver the same event, and an already-confirmed
// request simply returns success again without a redundant write.
// Reads/writes IntakeRequest through intake's narrow deposit functions
// (7.2.3) rather than prisma.intakeRequest directly -- billing never
// queries intake's table (CLAUDE.md's Domain Boundary Isolation rule).
export async function confirmDepositPayment(
  paymentIntentId: string
): Promise<ConfirmDepositPaymentResult> {
  const request = await getIntakeRequestByPaymentIntentId(paymentIntentId);

  if (!request) {
    return { success: false, error: DEPOSIT_PAYMENT_INTENT_NOT_FOUND_ERROR_MESSAGE };
  }

  if (request.depositPaid) {
    return { success: true };
  }

  await markDepositPaid(request.id);

  return { success: true };
}
