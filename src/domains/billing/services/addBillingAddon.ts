import { getBookingRequestForCheckout } from "@/domains/booking/services/getBookingRequestForCheckout";
import { prisma } from "@/lib/prisma";

import {
  CHECKOUT_REQUEST_NOT_APPROVED_ERROR_MESSAGE,
  CHECKOUT_REQUEST_NOT_FOUND_ERROR_MESSAGE,
} from "../constants";
import type { AddBillingAddonInput, AddBillingAddonResult } from "../types";

// Domain Service (CLAUDE.md 7.5.3): adds a line-item addon to an
// APPROVED booking's day-of bill. artistId is the trusted session's
// own id, checked against the owning artist via booking's narrow
// checkout read (7.5.2) rather than billing ever querying
// BookingRequest directly (Domain Boundary Isolation). Addon itself
// is billing's own table to query/mutate -- its relation is declared
// from BookingRequest's side in schema.prisma (scaffolded long before
// any domain service existed to use it), but no domain has queried it
// until this sub-task.
export async function addBillingAddon(
  input: AddBillingAddonInput
): Promise<AddBillingAddonResult> {
  const request = await getBookingRequestForCheckout(input.bookingRequestId);

  if (!request || request.artistId !== input.artistId) {
    return { success: false, error: CHECKOUT_REQUEST_NOT_FOUND_ERROR_MESSAGE };
  }

  if (request.status !== "APPROVED") {
    return {
      success: false,
      error: CHECKOUT_REQUEST_NOT_APPROVED_ERROR_MESSAGE,
    };
  }

  await prisma.addon.create({
    data: {
      bookingRequestId: input.bookingRequestId,
      label: input.label,
      price: input.price,
    },
  });

  return { success: true };
}
