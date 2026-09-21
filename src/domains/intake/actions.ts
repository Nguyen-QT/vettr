"use server";

import { prisma } from "@/lib/prisma";

import {
  clientIntakeInputSchema,
  combineRequestedDateAndTime,
  reviewIntakeRequestInputSchema,
} from "./intake.schema";
import {
  confirmProposedBooking,
  type ConfirmProposedBookingResult,
} from "./services/confirmProposedBooking";
import { generateResponseMessage } from "./services/generateResponseMessage";
import {
  reviewIntakeRequest,
  type ReviewIntakeRequestResult,
} from "./services/reviewIntakeRequest";
import { validateComplexity } from "./services/validateComplexity";

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

  const client = await prisma.clientProfile.upsert({
    where: { instagramHandle: data.instagramHandle },
    update: {
      email: data.email,
      phone: data.phone,
    },
    create: {
      instagramHandle: data.instagramHandle,
      email: data.email,
      phone: data.phone,
    },
  });

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
