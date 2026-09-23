import { getBookingRequestForCheckout } from "@/domains/booking/services/getBookingRequestForCheckout";
import { markAppointmentCompleted } from "@/domains/booking/services/markAppointmentCompleted";

import { CHECKOUT_REQUEST_NOT_FOUND_ERROR_MESSAGE } from "../constants";
import type { FinalizeCheckoutResult } from "../types";

// Domain Service (CLAUDE.md 7.5.4): finalizes the day-of checkout flow
// by transitioning the booking to COMPLETED -- checkout becomes the
// real mechanism for closing out an appointment. Ownership is checked
// here (booking's markAppointmentCompleted takes no artistId to check
// against); the APPROVED/past-due business rules stay in
// markAppointmentCompleted itself rather than being duplicated here,
// same billing-calls-into-booking cross-domain shape as booking's
// cancelBookingRequest calling billing's refundDeposit (7.3.4), just
// the other direction.
export async function finalizeCheckout(
  bookingRequestId: string,
  artistId: string
): Promise<FinalizeCheckoutResult> {
  const request = await getBookingRequestForCheckout(bookingRequestId);

  if (!request || request.artistId !== artistId) {
    return { success: false, error: CHECKOUT_REQUEST_NOT_FOUND_ERROR_MESSAGE };
  }

  return markAppointmentCompleted({ bookingRequestId });
}
