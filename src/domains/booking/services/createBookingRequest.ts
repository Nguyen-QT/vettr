import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

import { combineRequestedDateAndTime } from "../booking.schema";
import { CREATE_BOOKING_REQUEST_UNEXPECTED_ERROR_MESSAGE } from "../constants";
import type { CreateBookingRequestInput, CreateBookingRequestResult } from "../types";

// Fills only the profile fields that are still blank -- NULL, since every
// writer rejects empty strings. One guarded updateMany per field, so a
// profile edit racing this write is never overwritten (architecture.md
// Sec8.A); a field that's already set matches zero rows.
async function fillBlankProfileDetails(
  tx: Prisma.TransactionClient,
  input: CreateBookingRequestInput
): Promise<void> {
  const id = input.clientProfileId;

  await tx.clientProfile.updateMany({
    where: { id, firstName: null },
    data: { firstName: input.firstName },
  });
  await tx.clientProfile.updateMany({
    where: { id, lastName: null },
    data: { lastName: input.lastName },
  });
  await tx.clientProfile.updateMany({
    where: { id, dateOfBirth: null },
    // UTC midnight: a pure calendar date that must round-trip through the
    // @db.Date column regardless of server timezone (same as
    // updateClientProfile).
    data: { dateOfBirth: new Date(`${input.dateOfBirth}T00:00:00.000Z`) },
  });
  if (input.phone) {
    await tx.clientProfile.updateMany({
      where: { id, phone: null },
      data: { phone: input.phone },
    });
  }
}

// Domain Service (54.5.2.3): the booking write shared by the signed-in
// submit path (submitBookingRequest, 54.5.3.3) and the email-code path
// (submitBookingRequestWithEmailOtp, 54.5.2.5). Callers own the checks
// that come before it: schema parsing, validateComplexity and the artist
// lookup.
//
// No Auto-Booking (CLAUDE.md): only ever creates a PENDING row with no
// allocated TimeSlots. The blank-field fills, the request and its design
// references commit together, so a failure never leaves a filled profile
// without its booking, or a booking without its references.
export async function createBookingRequest(
  input: CreateBookingRequestInput
): Promise<CreateBookingRequestResult> {
  try {
    const bookingRequest = await prisma.$transaction(async (tx) => {
      await fillBlankProfileDetails(tx, input);

      return tx.bookingRequest.create({
        data: {
          status: "PENDING",
          clientId: input.clientProfileId,
          artistId: input.artistId,
          tier: input.tier,
          minPrice: input.clientBudgetRange.minPrice,
          maxPrice: input.clientBudgetRange.maxPrice,
          designTags: input.designTags ?? [],
          aestheticTags: input.aestheticTags ?? [],
          clientNotes: input.clientNotes,
          requestedStartTime: combineRequestedDateAndTime(
            input.requestedDate,
            input.requestedTime
          ),
          // Purely advisory (CLAUDE.md 6.3) -- combined the same way as
          // requestedStartTime, just with the client's own "must be
          // finished by" time instead of a fixed slot option.
          clientMaxEndTime: input.clientMaxEndTime
            ? new Date(`${input.requestedDate}T${input.clientMaxEndTime}:00`)
            : null,
          paymentMethod: input.paymentMethod,
          designReferences: {
            create: input.designReferenceImageUrls.map((imageUrl) => ({ imageUrl })),
          },
        },
        select: { id: true },
      });
    });

    return { success: true, bookingRequestId: bookingRequest.id };
  } catch (error) {
    // Every failure gets the same generic message; the cause goes to the
    // log as a fixed allowlist plus the typed Prisma code only -- never the
    // names, phone, DOB, notes or image URLs (architecture.md Sec8.B).
    const errorCode =
      error instanceof Prisma.PrismaClientKnownRequestError ? error.code : undefined;
    console.error({
      operation: "createBookingRequest",
      reason: "unexpected_failure",
      errorCode,
    });
    return { success: false, error: CREATE_BOOKING_REQUEST_UNEXPECTED_ERROR_MESSAGE };
  }
}
