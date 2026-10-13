import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

import {
  INSTAGRAM_HANDLE_TAKEN_ERROR_MESSAGE,
  UPDATE_CLIENT_PROFILE_UNEXPECTED_ERROR_MESSAGE,
} from "../constants";
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
//
// email is never written (54.7): the verified email is the fixed client
// identity, so a client can't move their profile onto someone else's
// address. With it out of the write, a P2002 here can only come from
// the instagramHandle unique index.
//
// Never throws (28.8.2.1): useClientProfile has no try/catch around the
// action, so an escaped throw replaces the whole page with Next's
// default error screen instead of showing an inline message.
export async function updateClientProfile(
  input: UpdateClientProfileInput
): Promise<UpdateClientProfileResult> {
  try {
    await prisma.clientProfile.update({
      where: { id: input.clientProfileId },
      data: {
        instagramHandle: input.instagramHandle,
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
    // Anything else (a P2025 for a profile row that's gone, a dropped
    // connection) gets the same generic message. The log is a fixed
    // allowlist -- the opaque profile id and the typed Prisma code only,
    // never the handle, phone, names or DOB (architecture.md §8.B).
    const errorCode =
      error instanceof Prisma.PrismaClientKnownRequestError ? error.code : undefined;
    console.error({
      operation: "updateClientProfile",
      reason: "unexpected_failure",
      clientProfileId: input.clientProfileId,
      errorCode,
    });
    return { success: false, error: UPDATE_CLIENT_PROFILE_UNEXPECTED_ERROR_MESSAGE };
  }
}
