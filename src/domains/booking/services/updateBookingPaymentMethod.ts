import { prisma } from "@/lib/prisma";

import { REQUEST_NOT_FOUND_ERROR_MESSAGE } from "../constants";
import type {
  UpdateBookingPaymentMethodInput,
  UpdateBookingPaymentMethodResult,
} from "../types";

// Artist override of a booking's payment method preference (CLAUDE.md
// 23.1) -- e.g. at final checkout when circumstances change on the day.
// A label/reconciliation field only, so no status guard is needed the
// way rescheduleApprovedBooking/markAppointmentCompleted require
// APPROVED: nothing about actual money movement changes here. Ownership
// is checked here, against artistId, rather than relying solely on the
// Controller/Action layer's own check.
export async function updateBookingPaymentMethod(
  input: UpdateBookingPaymentMethodInput
): Promise<UpdateBookingPaymentMethodResult> {
  const request = await prisma.bookingRequest.findUnique({
    where: { id: input.bookingRequestId },
    select: { artistId: true },
  });

  if (!request || request.artistId !== input.artistId) {
    return { success: false, error: REQUEST_NOT_FOUND_ERROR_MESSAGE };
  }

  await prisma.bookingRequest.update({
    where: { id: input.bookingRequestId },
    data: { paymentMethod: input.paymentMethod },
  });

  return { success: true };
}
