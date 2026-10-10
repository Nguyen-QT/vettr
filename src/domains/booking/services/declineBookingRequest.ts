import { prisma } from "@/lib/prisma";

import {
  DECLINABLE_REQUEST_STATUSES,
  REQUEST_ALREADY_RESOLVED_ERROR_MESSAGE,
} from "../constants";
import type { DeclineBookingRequestInput, DeclineBookingRequestResult } from "../types";
import { generateResponseMessage } from "./generateResponseMessage";

// Artist declines a request that hasn't been approved yet (56.2). One
// conditional update, not a read then a write, so an approval or cancel
// that commits first is never overwritten: the status check and the
// write are the same statement. Nothing else to undo -- a PENDING or
// AWAITING_SLOT_CONFIRMATION request holds no BOOKED slots (AWAITING
// books only on confirmProposedBooking) and can't have been paid
// (createDepositPaymentIntent requires APPROVED); a late payment that
// lands on DECLINED is refunded by confirmDepositPayment.
export async function declineBookingRequest(
  input: DeclineBookingRequestInput
): Promise<DeclineBookingRequestResult> {
  const { count } = await prisma.bookingRequest.updateMany({
    where: {
      id: input.bookingRequestId,
      status: { in: [...DECLINABLE_REQUEST_STATUSES] },
    },
    data: { status: "DECLINED" },
  });

  if (count === 0) {
    return { success: false, error: REQUEST_ALREADY_RESOLVED_ERROR_MESSAGE };
  }

  return { success: true, responseMessage: generateResponseMessage("DECLINED") };
}
