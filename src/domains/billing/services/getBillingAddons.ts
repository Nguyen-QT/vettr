import { getBookingRequestForCheckout } from "@/domains/booking/services/getBookingRequestForCheckout";
import { prisma } from "@/lib/prisma";

import { CHECKOUT_REQUEST_NOT_FOUND_ERROR_MESSAGE } from "../constants";
import type { GetBillingAddonsResult } from "../types";

// Domain Service (CLAUDE.md 7.5.3): lists a booking's current
// line-item addons for the checkout flow. Ownership-checked the same
// way as addBillingAddon/removeBillingAddon; unlike those two, no
// status guard -- displaying an already-added addon list has no
// business-rule dependency on status the way adding a new one does.
export async function getBillingAddons(
  bookingRequestId: string,
  artistId: string
): Promise<GetBillingAddonsResult> {
  const request = await getBookingRequestForCheckout(bookingRequestId);

  if (!request || request.artistId !== artistId) {
    return { success: false, error: CHECKOUT_REQUEST_NOT_FOUND_ERROR_MESSAGE };
  }

  const addons = await prisma.addon.findMany({
    where: { bookingRequestId },
    orderBy: { createdAt: "asc" },
    select: { id: true, label: true, price: true },
  });

  return {
    success: true,
    addons: addons.map((addon) => ({ ...addon, price: Number(addon.price) })),
  };
}
