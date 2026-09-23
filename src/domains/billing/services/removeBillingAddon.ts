import { getBookingRequestForCheckout } from "@/domains/booking/services/getBookingRequestForCheckout";
import { prisma } from "@/lib/prisma";

import {
  CHECKOUT_ADDON_NOT_FOUND_ERROR_MESSAGE,
  CHECKOUT_REQUEST_NOT_APPROVED_ERROR_MESSAGE,
} from "../constants";
import type {
  RemoveBillingAddonInput,
  RemoveBillingAddonResult,
} from "../types";

// Domain Service (CLAUDE.md 7.5.3): removes a line-item addon from an
// APPROVED booking's day-of bill. Ownership is checked by resolving
// the addon's own bookingRequestId back through booking's narrow
// checkout read (7.5.2), same posture as addBillingAddon -- Addon has
// no artistId of its own to check directly.
export async function removeBillingAddon(
  input: RemoveBillingAddonInput
): Promise<RemoveBillingAddonResult> {
  const addon = await prisma.addon.findUnique({
    where: { id: input.addonId },
    select: { bookingRequestId: true },
  });

  if (!addon) {
    return { success: false, error: CHECKOUT_ADDON_NOT_FOUND_ERROR_MESSAGE };
  }

  const request = await getBookingRequestForCheckout(addon.bookingRequestId);

  if (!request || request.artistId !== input.artistId) {
    return { success: false, error: CHECKOUT_ADDON_NOT_FOUND_ERROR_MESSAGE };
  }

  if (request.status !== "APPROVED") {
    return {
      success: false,
      error: CHECKOUT_REQUEST_NOT_APPROVED_ERROR_MESSAGE,
    };
  }

  await prisma.addon.delete({ where: { id: input.addonId } });

  return { success: true };
}
