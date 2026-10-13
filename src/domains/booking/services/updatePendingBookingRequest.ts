import { SLOT_CONFLICT_ERROR_MESSAGE } from "@/domains/scheduling/constants";
import { getAvailableSlots } from "@/domains/scheduling/services/getAvailableSlots";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

import {
  REQUEST_NOT_EDITABLE_ERROR_MESSAGE,
  REQUEST_NOT_FOUND_ERROR_MESSAGE,
  UPDATE_PENDING_BOOKING_REQUEST_UNEXPECTED_ERROR_MESSAGE,
} from "../constants";
import { combineRequestedDateAndTime } from "../booking.schema";
import type {
  UpdatePendingBookingRequestInput,
  UpdatePendingBookingRequestResult,
} from "../types";

// Self-service edit of a still-PENDING request from the client
// dashboard (CLAUDE.md 5.4). clientProfileId is the trusted session's
// own id (see booking/actions.ts), never client-supplied. Only PENDING
// is editable -- AWAITING_SLOT_CONFIRMATION is already mid-negotiation
// with the artist, and APPROVED already has a locked TimeSlot, so
// neither is safe to silently move here (see cancelBookingRequest for
// the cancel path both still support). Re-validates the new requested
// time against live availability, same check the booking form itself
// uses -- the request has no TimeSlot rows of its own yet at this
// status, so there's no self-conflict to worry about.
//
// Never throws (28.8.2.2): useClientBookingActions has no try/catch
// around the action, so an escaped throw replaces the whole page with
// Next's default error screen instead of showing an inline message.
export async function updatePendingBookingRequest(
  input: UpdatePendingBookingRequestInput
): Promise<UpdatePendingBookingRequestResult> {
  try {
    const request = await prisma.bookingRequest.findUnique({
      where: { id: input.bookingRequestId },
    });

    if (!request || request.clientId !== input.clientProfileId) {
      return { success: false, error: REQUEST_NOT_FOUND_ERROR_MESSAGE };
    }

    if (request.status !== "PENDING") {
      return { success: false, error: REQUEST_NOT_EDITABLE_ERROR_MESSAGE };
    }

    const availableSlots = await getAvailableSlots(
      request.artistId,
      input.requestedDate
    );
    const isAvailable = availableSlots.some(
      (slot) => slot.time === input.requestedTime && slot.available
    );
    if (!isAvailable) {
      return { success: false, error: SLOT_CONFLICT_ERROR_MESSAGE };
    }

    await prisma.bookingRequest.update({
      where: { id: request.id },
      data: {
        clientNotes: input.clientNotes,
        minPrice: input.clientBudgetRange.minPrice,
        maxPrice: input.clientBudgetRange.maxPrice,
        requestedStartTime: combineRequestedDateAndTime(
          input.requestedDate,
          input.requestedTime
        ),
        // Whole-set replacement (CLAUDE.md 13.2.2), not a delta -- the
        // caller (useClientBookingActions) always submits the full
        // current image list, same shape as the booking form's own
        // designReferenceImageUrls field. Nested writes on a single
        // update() run inside one Prisma-managed transaction, so this
        // stays atomic with the rest of the row update above.
        designReferences: {
          deleteMany: {},
          create: input.designReferenceImageUrls.map((imageUrl) => ({
            imageUrl,
          })),
        },
      },
    });

    return { success: true };
  } catch (error) {
    // A throw from the read, scheduling's availability check or the
    // update (a P2025 for a row deleted after the read, a dropped
    // connection) gets the same generic message. The log is a fixed
    // allowlist -- the opaque request id and the typed Prisma code only,
    // never the notes or image URLs (architecture.md §8.B).
    const errorCode =
      error instanceof Prisma.PrismaClientKnownRequestError ? error.code : undefined;
    console.error({
      operation: "updatePendingBookingRequest",
      reason: "unexpected_failure",
      bookingRequestId: input.bookingRequestId,
      errorCode,
    });
    return {
      success: false,
      error: UPDATE_PENDING_BOOKING_REQUEST_UNEXPECTED_ERROR_MESSAGE,
    };
  }
}
