import { getBookingRequestForCheckout } from "@/domains/booking/services/getBookingRequestForCheckout";

import { CHECKOUT_REQUEST_NOT_FOUND_ERROR_MESSAGE } from "../constants";
import type { GetFinalBillTotalResult } from "../types";
import { getBillingAddons } from "./getBillingAddons";

// Domain Service (CLAUDE.md 7.5.4): the day-of checkout flow's running
// total -- estimatedPrice plus every addon, crediting a deposit
// already paid against the total. Ownership-checked the same way as
// the rest of the checkout flow (7.5.2/7.5.3).
export async function getFinalBillTotal(
  bookingRequestId: string,
  artistId: string
): Promise<GetFinalBillTotalResult> {
  const request = await getBookingRequestForCheckout(bookingRequestId);

  if (!request || request.artistId !== artistId) {
    return { success: false, error: CHECKOUT_REQUEST_NOT_FOUND_ERROR_MESSAGE };
  }

  const addonsResult = await getBillingAddons(bookingRequestId, artistId);
  if (!addonsResult.success) {
    return { success: false, error: addonsResult.error };
  }

  const estimatedPrice = request.estimatedPrice ?? 0;
  const addonsTotal = addonsResult.addons.reduce(
    (sum, addon) => sum + addon.price,
    0
  );
  const depositCredit = request.depositPaid ? request.depositAmount ?? 0 : 0;

  return {
    success: true,
    bill: {
      estimatedPrice,
      addonsTotal,
      depositCredit,
      total: estimatedPrice + addonsTotal - depositCredit,
    },
  };
}
