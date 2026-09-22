import { prisma } from "@/lib/prisma";

import { DEPOSIT_PAYMENT_INTENT_NOT_FOUND_ERROR_MESSAGE } from "../constants";
import type { ConfirmDepositPaymentResult } from "../types";

// Domain Service (CLAUDE.md 7.1.4): called from the Stripe webhook
// handler once a PaymentIntent succeeds. Idempotent -- Stripe may
// redeliver the same event, and an already-confirmed request simply
// returns success again without a redundant write. stripePaymentIntentId
// isn't a DB-level unique constraint (see 7.1.1's Data Gateway), but
// Stripe's own PaymentIntent ids are globally unique and
// createDepositPaymentIntent only ever sets this field once per
// request, so findFirst is safe in practice.
export async function confirmDepositPayment(
  paymentIntentId: string
): Promise<ConfirmDepositPaymentResult> {
  const request = await prisma.intakeRequest.findFirst({
    where: { stripePaymentIntentId: paymentIntentId },
  });

  if (!request) {
    return { success: false, error: DEPOSIT_PAYMENT_INTENT_NOT_FOUND_ERROR_MESSAGE };
  }

  if (request.depositPaid) {
    return { success: true };
  }

  await prisma.intakeRequest.update({
    where: { id: request.id },
    data: { depositPaid: true },
  });

  return { success: true };
}
