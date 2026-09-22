"use server";

import { getCurrentSession } from "@/domains/auth/actions";
import { prisma } from "@/lib/prisma";

import { REQUEST_NOT_FOUND_ERROR_MESSAGE } from "./constants";
import {
  clientIntakeInputSchema,
  combineRequestedDateAndTime,
  rescheduleApprovedBookingInputSchema,
  reviewIntakeRequestInputSchema,
  updatePendingIntakeRequestInputSchema,
} from "./intake.schema";
import { cancelApprovedBookingAsArtist } from "./services/cancelApprovedBookingAsArtist";
import { cancelIntakeRequest } from "./services/cancelIntakeRequest";
import {
  confirmProposedBooking,
  type ConfirmProposedBookingResult,
} from "./services/confirmProposedBooking";
import { generateResponseMessage } from "./services/generateResponseMessage";
import { markAppointmentCompleted } from "./services/markAppointmentCompleted";
import { markAppointmentNoShow } from "./services/markAppointmentNoShow";
import { rescheduleApprovedBooking } from "./services/rescheduleApprovedBooking";
import {
  reviewIntakeRequest,
  type ReviewIntakeRequestResult,
} from "./services/reviewIntakeRequest";
import { updatePendingIntakeRequest } from "./services/updatePendingIntakeRequest";
import { validateComplexity } from "./services/validateComplexity";
import type {
  CancelApprovedBookingAsArtistResult,
  CancelIntakeRequestResult,
  MarkAppointmentCompletedResult,
  MarkAppointmentNoShowResult,
  RescheduleApprovedBookingResult,
  UpdatePendingIntakeRequestResult,
} from "./types";

const NOT_SIGNED_IN_ERROR_MESSAGE = "You must be signed in as a client to do that.";
const NOT_SIGNED_IN_AS_ARTIST_ERROR_MESSAGE =
  "You must be signed in as an artist to do that.";

async function requireClientProfileId(): Promise<string | null> {
  const session = await getCurrentSession();
  if (!session || session.role !== "CLIENT" || !session.clientProfileId) {
    return null;
  }
  return session.clientProfileId;
}

async function requireArtistId(): Promise<string | null> {
  const session = await getCurrentSession();
  if (!session || session.role !== "ARTIST" || !session.artistId) {
    return null;
  }
  return session.artistId;
}

// Shared by every artist-side mutating action below (reschedule, cancel,
// no-show, complete): confirms the request actually belongs to the
// signed-in artist before delegating, reported the same as a missing
// request on mismatch -- same posture as the client-side ownership
// checks (5.4.2).
async function requireOwnedRequest(
  intakeRequestId: string,
  artistId: string
): Promise<boolean> {
  const existing = await prisma.intakeRequest.findUnique({
    where: { id: intakeRequestId },
    select: { artistId: true },
  });
  return existing !== null && existing.artistId === artistId;
}

export type SubmitIntakeRequestResult =
  | { success: true; intakeRequestId: string }
  | { success: false; error: string };

export type RequestActionResult =
  | { success: true; responseMessage: string }
  | { success: false; error: string };

// No Auto-Booking (CLAUDE.md): this only ever creates PENDING rows with
// no allocated TimeSlots. Slot requesting/approval is scheduling-domain
// territory, out of scope here.
export async function submitIntakeRequest(
  artistId: string,
  input: unknown
): Promise<SubmitIntakeRequestResult> {
  const parsed = clientIntakeInputSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid intake request.",
    };
  }

  const data = parsed.data;

  const artist = await prisma.artist.findUnique({ where: { id: artistId } });
  if (!artist) {
    return { success: false, error: "This booking page could not be found." };
  }

  const complexityCheck = validateComplexity({
    tier: data.tier,
    clientNotes: data.clientNotes,
    designTags: data.designTags,
    aestheticTags: data.aestheticTags,
  });

  if (!complexityCheck.success) {
    return { success: false, error: complexityCheck.error };
  }

  // A signed-in client's booking always attaches to their own
  // ClientProfile (CLAUDE.md 6.1) -- the intake form disables the
  // contact/onboarding fields in that case, but a disabled <input> can
  // still be re-enabled client-side, so this ignores whatever
  // instagramHandle/email/phone/firstName/lastName/dateOfBirth came in
  // the request body entirely rather than trusting it to match/upsert
  // a profile. A signed-out/guest submission (no session) keeps the
  // original by-handle upsert.
  const sessionClientProfileId = await requireClientProfileId();
  // Unlike requestedStartTime elsewhere in this file (a real time-of-day
  // the "no timezone handling yet" placeholder scope applies to),
  // dateOfBirth is a pure calendar date with no time-of-day meaning at
  // all -- constructed at UTC midnight specifically so it round-trips
  // through the @db.Date column correctly regardless of server
  // timezone, since a local-time construction could shift it by a day
  // depending on where this runs, and this field feeds a legal age
  // check.
  const dateOfBirth = new Date(`${data.dateOfBirth}T00:00:00.000Z`);

  let client;
  if (sessionClientProfileId) {
    client = await prisma.clientProfile.findUnique({
      where: { id: sessionClientProfileId },
    });
    if (!client) {
      return { success: false, error: "Your account could not be found." };
    }

    // Fills in onboarding fields the client hasn't provided yet
    // (CLAUDE.md 6.2) -- only ever fills a blank on the existing
    // profile, never overwrites an already-set value.
    const fillableFields: {
      firstName?: string;
      lastName?: string;
      dateOfBirth?: Date;
    } = {};
    if (!client.firstName) fillableFields.firstName = data.firstName;
    if (!client.lastName) fillableFields.lastName = data.lastName;
    if (!client.dateOfBirth) fillableFields.dateOfBirth = dateOfBirth;

    if (Object.keys(fillableFields).length > 0) {
      client = await prisma.clientProfile.update({
        where: { id: client.id },
        data: fillableFields,
      });
    }
  } else {
    client = await prisma.clientProfile.upsert({
      where: { instagramHandle: data.instagramHandle },
      update: {
        email: data.email,
        phone: data.phone,
        firstName: data.firstName,
        lastName: data.lastName,
        dateOfBirth,
      },
      create: {
        instagramHandle: data.instagramHandle,
        email: data.email,
        phone: data.phone,
        firstName: data.firstName,
        lastName: data.lastName,
        dateOfBirth,
      },
    });
  }

  const intakeRequest = await prisma.intakeRequest.create({
    data: {
      clientId: client.id,
      artistId: artist.id,
      tier: data.tier,
      minPrice: data.clientBudgetRange.minPrice,
      maxPrice: data.clientBudgetRange.maxPrice,
      designTags: data.designTags ?? [],
      aestheticTags: data.aestheticTags ?? [],
      clientNotes: data.clientNotes,
      requestedStartTime: combineRequestedDateAndTime(
        data.requestedDate,
        data.requestedTime
      ),
      designReferences: {
        create: data.designReferenceImageUrls.map((imageUrl) => ({
          imageUrl,
        })),
      },
    },
  });

  return { success: true, intakeRequestId: intakeRequest.id };
}

// Toggles an IntakeRequest's status (CLAUDE.md 3.3: "Action Mutators").
// Deliberately does not touch TimeSlots — slot promotion to BOOKED is
// scheduling-domain territory and out of scope here, same as the
// No-Auto-Booking note above.
export async function approveIntakeRequest(
  intakeRequestId: string
): Promise<RequestActionResult> {
  return setIntakeRequestStatus(intakeRequestId, "APPROVED");
}

export async function declineIntakeRequest(
  intakeRequestId: string
): Promise<RequestActionResult> {
  return setIntakeRequestStatus(intakeRequestId, "DECLINED");
}

// Controller/Action boundary (CLAUDE.md 4.1h) for the artist's review
// decision: validates the duration structurally, then delegates to
// reviewIntakeRequest for the booking/propose logic. Supersedes
// approveIntakeRequest above for any flow that also needs a booked slot
// -- 4.1i wires the dashboard over to this one.
export async function reviewIntakeRequestAction(
  intakeRequestId: string,
  input: unknown
): Promise<ReviewIntakeRequestResult> {
  const parsed = reviewIntakeRequestInputSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid duration or price.",
    };
  }

  return reviewIntakeRequest({
    intakeRequestId,
    durationMinutes: parsed.data.durationMinutes,
    estimatedPrice: parsed.data.estimatedPrice,
  });
}

// Controller/Action boundary (CLAUDE.md 4.1h) for finalizing a proposed
// double-slot booking once the artist has confirmed it with the client
// off-platform. No input beyond the id -- confirmProposedBooking reads
// the stored proposal itself.
export async function confirmProposedBookingAction(
  intakeRequestId: string
): Promise<ConfirmProposedBookingResult> {
  return confirmProposedBooking(intakeRequestId);
}

// Controller/Action boundary (CLAUDE.md 5.4.2): derives clientProfileId
// from the trusted session rather than trusting client-supplied input
// -- a client could otherwise pass any id and attempt to cancel someone
// else's booking. cancelIntakeRequest itself still re-checks ownership,
// but this is the layer responsible for supplying a trustworthy id.
export async function cancelIntakeRequestAction(
  intakeRequestId: string
): Promise<CancelIntakeRequestResult> {
  const clientProfileId = await requireClientProfileId();
  if (!clientProfileId) {
    return { success: false, error: NOT_SIGNED_IN_ERROR_MESSAGE };
  }

  return cancelIntakeRequest({ intakeRequestId, clientProfileId });
}

// Controller/Action boundary (CLAUDE.md 5.4.2): same session-derived
// clientProfileId as cancelIntakeRequestAction above, plus structural
// validation of the editable fields before delegating.
export async function updatePendingIntakeRequestAction(
  intakeRequestId: string,
  input: unknown
): Promise<UpdatePendingIntakeRequestResult> {
  const clientProfileId = await requireClientProfileId();
  if (!clientProfileId) {
    return { success: false, error: NOT_SIGNED_IN_ERROR_MESSAGE };
  }

  const parsed = updatePendingIntakeRequestInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid request.",
    };
  }

  return updatePendingIntakeRequest({
    intakeRequestId,
    clientProfileId,
    ...parsed.data,
  });
}

// Controller/Action boundary (CLAUDE.md 5.5.2): derives artistId from
// the trusted session, then confirms the request actually belongs to
// that artist before delegating -- new action, so unlike some of the
// pre-existing artist actions above, it gets an ownership check from
// day one rather than relying on route protection alone. Reported the
// same as a missing request on mismatch, same posture as the
// client-side ownership checks (5.4.2).
export async function rescheduleApprovedBookingAction(
  intakeRequestId: string,
  input: unknown
): Promise<RescheduleApprovedBookingResult> {
  const artistId = await requireArtistId();
  if (!artistId) {
    return { success: false, error: NOT_SIGNED_IN_AS_ARTIST_ERROR_MESSAGE };
  }

  if (!(await requireOwnedRequest(intakeRequestId, artistId))) {
    return { success: false, error: REQUEST_NOT_FOUND_ERROR_MESSAGE };
  }

  const parsed = rescheduleApprovedBookingInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid duration or time.",
    };
  }

  return rescheduleApprovedBooking({
    intakeRequestId,
    newStartTime: combineRequestedDateAndTime(
      parsed.data.requestedDate,
      parsed.data.requestedTime
    ),
    durationMinutes: parsed.data.durationMinutes,
  });
}

// Controller/Action boundary (CLAUDE.md 5.6.3): artist-side cancellation
// of an already-APPROVED booking. Same ownership-check posture as
// rescheduleApprovedBookingAction above.
export async function cancelApprovedBookingAsArtistAction(
  intakeRequestId: string
): Promise<CancelApprovedBookingAsArtistResult> {
  const artistId = await requireArtistId();
  if (!artistId) {
    return { success: false, error: NOT_SIGNED_IN_AS_ARTIST_ERROR_MESSAGE };
  }

  if (!(await requireOwnedRequest(intakeRequestId, artistId))) {
    return { success: false, error: REQUEST_NOT_FOUND_ERROR_MESSAGE };
  }

  return cancelApprovedBookingAsArtist({ intakeRequestId });
}

// Controller/Action boundary (CLAUDE.md 5.6.3): marks a past-due
// APPROVED appointment as a no-show. Same ownership-check posture as
// above.
export async function markAppointmentNoShowAction(
  intakeRequestId: string
): Promise<MarkAppointmentNoShowResult> {
  const artistId = await requireArtistId();
  if (!artistId) {
    return { success: false, error: NOT_SIGNED_IN_AS_ARTIST_ERROR_MESSAGE };
  }

  if (!(await requireOwnedRequest(intakeRequestId, artistId))) {
    return { success: false, error: REQUEST_NOT_FOUND_ERROR_MESSAGE };
  }

  return markAppointmentNoShow({ intakeRequestId });
}

// Controller/Action boundary (CLAUDE.md 5.6.3): marks a past-due
// APPROVED appointment as completed. Same ownership-check posture as
// above.
export async function markAppointmentCompletedAction(
  intakeRequestId: string
): Promise<MarkAppointmentCompletedResult> {
  const artistId = await requireArtistId();
  if (!artistId) {
    return { success: false, error: NOT_SIGNED_IN_AS_ARTIST_ERROR_MESSAGE };
  }

  if (!(await requireOwnedRequest(intakeRequestId, artistId))) {
    return { success: false, error: REQUEST_NOT_FOUND_ERROR_MESSAGE };
  }

  return markAppointmentCompleted({ intakeRequestId });
}

async function setIntakeRequestStatus(
  intakeRequestId: string,
  status: "APPROVED" | "DECLINED"
): Promise<RequestActionResult> {
  const existing = await prisma.intakeRequest.findUnique({
    where: { id: intakeRequestId },
  });

  if (!existing) {
    return { success: false, error: "This request could not be found." };
  }

  await prisma.intakeRequest.update({
    where: { id: intakeRequestId },
    data: { status },
  });

  return { success: true, responseMessage: generateResponseMessage(status) };
}
