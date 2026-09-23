import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

import { INSTAGRAM_HANDLE_TAKEN_ERROR_MESSAGE } from "../constants";
import type { UpdateClientProfileInput, UpdateClientProfileResult } from "../types";

function isInstagramHandleConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
  );
}

// Domain Service (CLAUDE.md 10.1): self-service edit of a client's own
// ClientProfile from the client dashboard. clientProfileId is the
// trusted session's own id, supplied by the caller (Controller/Action
// derives it, same posture as booking's cancelBookingRequest) rather
// than checked here -- there's no separate owner to compare against,
// unlike a BookingRequest.
export async function updateClientProfile(
  input: UpdateClientProfileInput
): Promise<UpdateClientProfileResult> {
  try {
    await prisma.clientProfile.update({
      where: { id: input.clientProfileId },
      data: {
        instagramHandle: input.instagramHandle,
        email: input.email,
        phone: input.phone,
        firstName: input.firstName,
        lastName: input.lastName,
        // UTC midnight, not local -- dateOfBirth is a pure calendar
        // date with no time-of-day meaning, so it must round-trip
        // through the @db.Date column the same way regardless of
        // server timezone. Matches submitBookingRequest's identical
        // construction (booking/actions.ts).
        dateOfBirth: new Date(`${input.dateOfBirth}T00:00:00.000Z`),
      },
    });

    return { success: true };
  } catch (error) {
    if (isInstagramHandleConflict(error)) {
      return { success: false, error: INSTAGRAM_HANDLE_TAKEN_ERROR_MESSAGE };
    }
    throw error;
  }
}
