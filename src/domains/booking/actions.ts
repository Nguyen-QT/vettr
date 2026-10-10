"use server";

import { getCurrentSession } from "@/domains/auth/actions";
import { setSessionCookie } from "@/domains/auth/sessionCookie";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

import {
  CREATE_BOOKING_REQUEST_UNEXPECTED_ERROR_MESSAGE,
  EMAIL_VERIFICATION_REQUIRED_ERROR_MESSAGE,
  REQUEST_NOT_FOUND_ERROR_MESSAGE,
} from "./constants";
import {
  bookingRequestDraftInputSchema,
  clientBookingInputSchema,
  combineRequestedDateAndTime,
  paymentMethodSchema,
  rescheduleApprovedBookingInputSchema,
  reviewBookingRequestInputSchema,
  submitBookingRequestWithCodeInputSchema,
  updateClientProfileInputSchema,
  updatePendingBookingRequestInputSchema,
} from "./booking.schema";
import { cancelApprovedBookingAsArtist } from "./services/cancelApprovedBookingAsArtist";
import { cancelBookingRequest } from "./services/cancelBookingRequest";
import {
  confirmProposedBooking,
  type ConfirmProposedBookingResult,
} from "./services/confirmProposedBooking";
import { createBookingRequest } from "./services/createBookingRequest";
import { declineBookingRequest as declineBookingRequestService } from "./services/declineBookingRequest";
import { generateResponseMessage } from "./services/generateResponseMessage";
import { markAppointmentCompleted } from "./services/markAppointmentCompleted";
import { markAppointmentNoShow } from "./services/markAppointmentNoShow";
import { requestBookingVerificationCode } from "./services/requestBookingVerificationCode";
import { rescheduleApprovedBooking } from "./services/rescheduleApprovedBooking";
import {
  reviewBookingRequest,
  type ReviewBookingRequestResult,
} from "./services/reviewBookingRequest";
import { submitBookingRequestWithEmailOtp } from "./services/submitBookingRequestWithEmailOtp";
import { updateBookingPaymentMethod } from "./services/updateBookingPaymentMethod";
import { updateClientProfile } from "./services/updateClientProfile";
import { updatePendingBookingRequest } from "./services/updatePendingBookingRequest";
import { validateComplexity } from "./services/validateComplexity";
import type {
  CancelApprovedBookingAsArtistResult,
  CancelBookingRequestResult,
  MarkAppointmentCompletedResult,
  MarkAppointmentNoShowResult,
  RequestBookingVerificationCodeResult,
  RescheduleApprovedBookingResult,
  UpdateBookingPaymentMethodResult,
  UpdateClientProfileResult,
  UpdatePendingBookingRequestResult,
} from "./types";

const NOT_SIGNED_IN_ERROR_MESSAGE = "You must be signed in as a client to do that.";
const NOT_SIGNED_IN_AS_ARTIST_ERROR_MESSAGE =
  "You must be signed in as an artist to do that.";
const BOOKING_PAGE_NOT_FOUND_ERROR_MESSAGE = "This booking page could not be found.";

async function requireClientProfileId(): Promise<string | null> {
  const session = await getCurrentSession();
  if (!session || session.activeRole !== "CLIENT" || !session.clientProfileId) {
    return null;
  }
  return session.clientProfileId;
}

async function requireArtistId(): Promise<string | null> {
  const session = await getCurrentSession();
  if (!session || session.activeRole !== "ARTIST" || !session.artistId) {
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
  bookingRequestId: string,
  artistId: string
): Promise<boolean> {
  const existing = await prisma.bookingRequest.findUnique({
    where: { id: bookingRequestId },
    select: { artistId: true },
  });
  return existing !== null && existing.artistId === artistId;
}

// submitBookingRequestWithCodeAction's artist check, run before the code is
// redeemed so a dead page never spends it. artistId is the route's, but a
// browser can post any value -- a non-string one fails Prisma's validation
// and lands in the catch. Logged with the typed Prisma code only and
// reported generically, never thrown at the UI (architecture.md Sec8.B).
async function findBookingArtist(
  artistId: string
): Promise<"found" | "not_found" | "failed"> {
  try {
    const artist = await prisma.artist.findUnique({
      where: { id: artistId },
      select: { id: true },
    });
    return artist ? "found" : "not_found";
  } catch (error) {
    console.error({
      operation: "submitBookingRequestWithCodeAction",
      reason: "artist_lookup_failed",
      errorCode: error instanceof Prisma.PrismaClientKnownRequestError ? error.code : undefined,
    });
    return "failed";
  }
}

export type SubmitBookingRequestResult =
  | { success: true; bookingRequestId: string }
  | { success: false; error: string };

// Never includes the session -- its id only ever lives in the httpOnly
// cookie, same as the auth actions. signedIn on a failure means a redeemed
// code already set that cookie, so the caller resubmits through
// submitBookingRequest's signed-in path with no second code.
export type SubmitBookingRequestWithCodeResult =
  | { success: true; bookingRequestId: string }
  | { success: false; error: string; signedIn: boolean };

export type RequestActionResult =
  | { success: true; responseMessage: string }
  | { success: false; error: string };

// No Auto-Booking (CLAUDE.md): this only ever creates PENDING rows with
// no allocated TimeSlots. Slot requesting/approval is scheduling-domain
// territory, out of scope here.
//
// CLIENT sessions only (54.6.3.1): a guest's booking goes through
// submitBookingRequestWithCodeAction, which proves the email first. With
// no CLIENT session this refuses with the same generic copy whatever the
// session state, before parsing or any lookup, and writes nothing.
export async function submitBookingRequest(
  artistId: string,
  input: unknown
): Promise<SubmitBookingRequestResult> {
  const clientProfileId = await requireClientProfileId();
  if (!clientProfileId) {
    return { success: false, error: EMAIL_VERIFICATION_REQUIRED_ERROR_MESSAGE };
  }

  const parsed = clientBookingInputSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid booking request.",
    };
  }

  const data = parsed.data;

  const artist = await prisma.artist.findUnique({ where: { id: artistId } });
  if (!artist) {
    return { success: false, error: BOOKING_PAGE_NOT_FOUND_ERROR_MESSAGE };
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
  // ClientProfile (CLAUDE.md 6.1) -- the booking form disables the
  // contact fields in that case, but a disabled <input> can still be
  // re-enabled client-side, so the instagramHandle/email in the request
  // body never reach the write. createBookingRequest (54.5.2.3) fills
  // only the onboarding fields still blank on the profile (CLAUDE.md
  // 6.2), in one transaction with the request itself. Built field by
  // field, never spread, same as submitBookingRequestWithEmailOtp.
  return createBookingRequest({
    clientProfileId,
    artistId: artist.id,
    designReferenceImageUrls: data.designReferenceImageUrls,
    tier: data.tier,
    clientBudgetRange: data.clientBudgetRange,
    designTags: data.designTags,
    aestheticTags: data.aestheticTags,
    phone: data.phone,
    firstName: data.firstName,
    lastName: data.lastName,
    dateOfBirth: data.dateOfBirth,
    clientNotes: data.clientNotes,
    requestedDate: data.requestedDate,
    requestedTime: data.requestedTime,
    clientMaxEndTime: data.clientMaxEndTime,
    paymentMethod: data.paymentMethod,
  });
}

// Controller/Action boundary (54.5.3.4): validates the draft structurally,
// then delegates to requestBookingVerificationCode (validateComplexity, then
// auth's send) with only the fields it screens -- unknown keys are already
// stripped, so no id in the payload goes anywhere. No artist check: the
// caller picks the id, so it would stop nothing, and a dead page is caught
// at submit before the code is redeemed. The result passes through
// unchanged, so auth's identical "code sent" copy can't reveal anything.
// Never reads the session or sets a cookie.
export async function requestBookingVerificationCodeAction(
  input: unknown
): Promise<RequestBookingVerificationCodeResult> {
  const parsed = bookingRequestDraftInputSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid booking request.",
    };
  }

  const data = parsed.data;
  return requestBookingVerificationCode({
    email: data.email,
    tier: data.tier,
    clientNotes: data.clientNotes,
    designTags: data.designTags,
    aestheticTags: data.aestheticTags,
  });
}

// Controller/Action boundary (54.5.3.4): validates the draft and code
// structurally, confirms the route's artist, then delegates to
// submitBookingRequestWithEmailOtp. Identity comes from the redeemed code
// and artistId from the route -- the payload's ids are stripped by the
// schema, and the route's is set last. The cookie is set whenever the
// service returns a session: on success, and when the booking write failed
// after the code was redeemed (architecture.md Sec6.2) -- the caller then
// resubmits signed in, never retried here.
export async function submitBookingRequestWithCodeAction(
  artistId: string,
  input: unknown
): Promise<SubmitBookingRequestWithCodeResult> {
  const parsed = submitBookingRequestWithCodeInputSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid booking request.",
      signedIn: false,
    };
  }

  const artist = await findBookingArtist(artistId);
  if (artist === "not_found") {
    return { success: false, error: BOOKING_PAGE_NOT_FOUND_ERROR_MESSAGE, signedIn: false };
  }
  if (artist === "failed") {
    return {
      success: false,
      error: CREATE_BOOKING_REQUEST_UNEXPECTED_ERROR_MESSAGE,
      signedIn: false,
    };
  }

  const result = await submitBookingRequestWithEmailOtp({ ...parsed.data, artistId });

  if (result.session) {
    await setSessionCookie(result.session.sessionId, result.session.expiresAt);
  }

  if (result.success) {
    return { success: true, bookingRequestId: result.bookingRequestId };
  }
  return { success: false, error: result.error, signedIn: result.session !== null };
}

// Toggles an BookingRequest's status (CLAUDE.md 3.3: "Action Mutators").
// Deliberately does not touch TimeSlots — slot promotion to BOOKED is
// scheduling-domain territory and out of scope here, same as the
// No-Auto-Booking note above. Session + ownership guarded (28.7.3.1),
// same posture as rescheduleApprovedBookingAction below.
export async function approveBookingRequest(
  bookingRequestId: string
): Promise<RequestActionResult> {
  const artistId = await requireArtistId();
  if (!artistId) {
    return { success: false, error: NOT_SIGNED_IN_AS_ARTIST_ERROR_MESSAGE };
  }

  if (!(await requireOwnedRequest(bookingRequestId, artistId))) {
    return { success: false, error: REQUEST_NOT_FOUND_ERROR_MESSAGE };
  }

  return setBookingRequestStatus(bookingRequestId, "APPROVED");
}

// Controller/Action boundary (56.2): same session + ownership guards as
// approveBookingRequest above, then delegates to the declineBookingRequest
// service, which declines only a request not yet approved and refuses an
// APPROVED booking -- that one is cancelled through
// cancelApprovedBookingAsArtistAction, which releases its slots and refunds.
export async function declineBookingRequest(
  bookingRequestId: string
): Promise<RequestActionResult> {
  const artistId = await requireArtistId();
  if (!artistId) {
    return { success: false, error: NOT_SIGNED_IN_AS_ARTIST_ERROR_MESSAGE };
  }

  if (!(await requireOwnedRequest(bookingRequestId, artistId))) {
    return { success: false, error: REQUEST_NOT_FOUND_ERROR_MESSAGE };
  }

  return declineBookingRequestService({ bookingRequestId });
}

// Controller/Action boundary (CLAUDE.md 4.1h) for the artist's review
// decision: validates the duration structurally, then delegates to
// reviewBookingRequest for the booking/propose logic. Supersedes
// approveBookingRequest above for any flow that also needs a booked slot
// -- 4.1i wires the dashboard over to this one.
export async function reviewBookingRequestAction(
  bookingRequestId: string,
  input: unknown
): Promise<ReviewBookingRequestResult> {
  const artistId = await requireArtistId();
  if (!artistId) {
    return { success: false, error: NOT_SIGNED_IN_AS_ARTIST_ERROR_MESSAGE };
  }

  if (!(await requireOwnedRequest(bookingRequestId, artistId))) {
    return { success: false, error: REQUEST_NOT_FOUND_ERROR_MESSAGE };
  }

  const parsed = reviewBookingRequestInputSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid duration or price.",
    };
  }

  return reviewBookingRequest({
    bookingRequestId,
    durationMinutes: parsed.data.durationMinutes,
    estimatedPrice: parsed.data.estimatedPrice,
  });
}

// Controller/Action boundary (CLAUDE.md 4.1h) for finalizing a proposed
// double-slot booking once the artist has confirmed it with the client
// off-platform. No input beyond the id -- confirmProposedBooking reads
// the stored proposal itself.
export async function confirmProposedBookingAction(
  bookingRequestId: string
): Promise<ConfirmProposedBookingResult> {
  const artistId = await requireArtistId();
  if (!artistId) {
    return { success: false, error: NOT_SIGNED_IN_AS_ARTIST_ERROR_MESSAGE };
  }

  if (!(await requireOwnedRequest(bookingRequestId, artistId))) {
    return { success: false, error: REQUEST_NOT_FOUND_ERROR_MESSAGE };
  }

  return confirmProposedBooking(bookingRequestId);
}

// Controller/Action boundary (CLAUDE.md 5.4.2): derives clientProfileId
// from the trusted session rather than trusting client-supplied input
// -- a client could otherwise pass any id and attempt to cancel someone
// else's booking. cancelBookingRequest itself still re-checks ownership,
// but this is the layer responsible for supplying a trustworthy id.
export async function cancelBookingRequestAction(
  bookingRequestId: string
): Promise<CancelBookingRequestResult> {
  const clientProfileId = await requireClientProfileId();
  if (!clientProfileId) {
    return { success: false, error: NOT_SIGNED_IN_ERROR_MESSAGE };
  }

  return cancelBookingRequest({ bookingRequestId, clientProfileId });
}

// Controller/Action boundary (CLAUDE.md 5.4.2): same session-derived
// clientProfileId as cancelBookingRequestAction above, plus structural
// validation of the editable fields before delegating.
export async function updatePendingBookingRequestAction(
  bookingRequestId: string,
  input: unknown
): Promise<UpdatePendingBookingRequestResult> {
  const clientProfileId = await requireClientProfileId();
  if (!clientProfileId) {
    return { success: false, error: NOT_SIGNED_IN_ERROR_MESSAGE };
  }

  const parsed = updatePendingBookingRequestInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid request.",
    };
  }

  return updatePendingBookingRequest({
    bookingRequestId,
    clientProfileId,
    ...parsed.data,
  });
}

// Controller/Action boundary (CLAUDE.md 10.1.2): same session-derived
// clientProfileId as updatePendingBookingRequestAction above, plus
// structural validation of every profile field before delegating.
export async function updateClientProfileAction(
  input: unknown
): Promise<UpdateClientProfileResult> {
  const clientProfileId = await requireClientProfileId();
  if (!clientProfileId) {
    return { success: false, error: NOT_SIGNED_IN_ERROR_MESSAGE };
  }

  const parsed = updateClientProfileInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid profile details.",
    };
  }

  return updateClientProfile({ clientProfileId, ...parsed.data });
}

// Controller/Action boundary (CLAUDE.md 5.5.2): derives artistId from
// the trusted session, then confirms the request actually belongs to
// that artist before delegating -- new action, so unlike some of the
// pre-existing artist actions above, it gets an ownership check from
// day one rather than relying on route protection alone. Reported the
// same as a missing request on mismatch, same posture as the
// client-side ownership checks (5.4.2).
export async function rescheduleApprovedBookingAction(
  bookingRequestId: string,
  input: unknown
): Promise<RescheduleApprovedBookingResult> {
  const artistId = await requireArtistId();
  if (!artistId) {
    return { success: false, error: NOT_SIGNED_IN_AS_ARTIST_ERROR_MESSAGE };
  }

  if (!(await requireOwnedRequest(bookingRequestId, artistId))) {
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
    bookingRequestId,
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
  bookingRequestId: string
): Promise<CancelApprovedBookingAsArtistResult> {
  const artistId = await requireArtistId();
  if (!artistId) {
    return { success: false, error: NOT_SIGNED_IN_AS_ARTIST_ERROR_MESSAGE };
  }

  if (!(await requireOwnedRequest(bookingRequestId, artistId))) {
    return { success: false, error: REQUEST_NOT_FOUND_ERROR_MESSAGE };
  }

  return cancelApprovedBookingAsArtist({ bookingRequestId });
}

// Controller/Action boundary (CLAUDE.md 5.6.3): marks a past-due
// APPROVED appointment as a no-show. Same ownership-check posture as
// above.
export async function markAppointmentNoShowAction(
  bookingRequestId: string
): Promise<MarkAppointmentNoShowResult> {
  const artistId = await requireArtistId();
  if (!artistId) {
    return { success: false, error: NOT_SIGNED_IN_AS_ARTIST_ERROR_MESSAGE };
  }

  if (!(await requireOwnedRequest(bookingRequestId, artistId))) {
    return { success: false, error: REQUEST_NOT_FOUND_ERROR_MESSAGE };
  }

  return markAppointmentNoShow({ bookingRequestId });
}

// Controller/Action boundary (CLAUDE.md 5.6.3): marks a past-due
// APPROVED appointment as completed. Same ownership-check posture as
// above.
export async function markAppointmentCompletedAction(
  bookingRequestId: string
): Promise<MarkAppointmentCompletedResult> {
  const artistId = await requireArtistId();
  if (!artistId) {
    return { success: false, error: NOT_SIGNED_IN_AS_ARTIST_ERROR_MESSAGE };
  }

  if (!(await requireOwnedRequest(bookingRequestId, artistId))) {
    return { success: false, error: REQUEST_NOT_FOUND_ERROR_MESSAGE };
  }

  return markAppointmentCompleted({ bookingRequestId });
}

// Controller/Action boundary (CLAUDE.md 23.1.3): artist override of a
// booking's payment method preference, e.g. at final checkout. Derives
// artistId from the trusted session -- updateBookingPaymentMethod
// itself re-checks ownership against it, so this layer's only job is
// supplying a trustworthy id and validating the new value structurally.
export async function updateBookingPaymentMethodAction(
  bookingRequestId: string,
  input: unknown
): Promise<UpdateBookingPaymentMethodResult> {
  const artistId = await requireArtistId();
  if (!artistId) {
    return { success: false, error: NOT_SIGNED_IN_AS_ARTIST_ERROR_MESSAGE };
  }

  const parsed = paymentMethodSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid payment method.",
    };
  }

  return updateBookingPaymentMethod({
    bookingRequestId,
    artistId,
    paymentMethod: parsed.data,
  });
}

// Approve-only since 56.2 (decline has its own conditional service); its
// removal is 28.7 flagged item 1.
async function setBookingRequestStatus(
  bookingRequestId: string,
  status: "APPROVED"
): Promise<RequestActionResult> {
  const existing = await prisma.bookingRequest.findUnique({
    where: { id: bookingRequestId },
  });

  if (!existing) {
    return { success: false, error: "This request could not be found." };
  }

  await prisma.bookingRequest.update({
    where: { id: bookingRequestId },
    data: { status },
  });

  return { success: true, responseMessage: generateResponseMessage(status) };
}
