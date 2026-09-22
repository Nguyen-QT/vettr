import { z } from "zod";

import {
  DAILY_SLOT_TIME_OPTIONS,
  MAX_TOTAL_SERVICE_DURATION_MINUTES,
  MIN_SLOT_DURATION_MINUTES,
} from "@/domains/scheduling/constants";
import type { SlotTime } from "@/domains/scheduling/types";

import {
  AESTHETIC_TAG_OPTIONS,
  COMPLEXITY_TIERS,
  DESIGN_TAG_OPTIONS,
  INSTAGRAM_HANDLE_REGEX,
  MAX_DESIGN_REFERENCE_IMAGES,
  MIN_CLIENT_AGE_YEARS,
  MIN_DESIGN_REFERENCE_IMAGES,
  OTHER_TAG_VALUE,
} from "./constants";

// Combines the form's separate date/time-of-day fields into the single
// Date IntakeRequest.requestedStartTime actually stores. Local-time
// combination only -- no timezone handling yet, same placeholder scope
// as the rest of intake's fields.
export function combineRequestedDateAndTime(
  requestedDate: string,
  requestedTime: SlotTime
): Date {
  return new Date(`${requestedDate}T${requestedTime}:00`);
}

// Structural validity only for the artist's review step (4.1h/4.4) --
// see services/reviewIntakeRequest.ts for the domain logic that
// decides what happens with a valid duration/price. Shares
// scheduling's bounds constants rather than redefining them.
export const reviewIntakeRequestInputSchema = z.object({
  durationMinutes: z
    .number()
    .int()
    .min(
      MIN_SLOT_DURATION_MINUTES,
      `The service duration must be at least ${MIN_SLOT_DURATION_MINUTES} minutes.`
    )
    .max(
      MAX_TOTAL_SERVICE_DURATION_MINUTES,
      `The service duration cannot exceed ${MAX_TOTAL_SERVICE_DURATION_MINUTES} minutes.`
    ),
  estimatedPrice: z.number().positive("Enter an estimated price."),
});

export const instagramHandleSchema = z
  .string()
  .trim()
  .transform((value) => (value.startsWith("@") ? value.slice(1) : value))
  .pipe(
    z
      .string()
      .min(1, "Instagram handle is required.")
      .max(30, "Instagram handle must be 30 characters or fewer.")
      .regex(INSTAGRAM_HANDLE_REGEX, "Enter a valid Instagram handle.")
  );

// Visual Enforcement (CLAUDE.md): every request must carry at least one
// high-resolution design reference image.
export const designReferenceImagesSchema = z
  .array(z.url("Each design reference must be a valid image URL."))
  .min(
    MIN_DESIGN_REFERENCE_IMAGES,
    "At least one design reference image is required."
  )
  .max(
    MAX_DESIGN_REFERENCE_IMAGES,
    `You can attach up to ${MAX_DESIGN_REFERENCE_IMAGES} design reference images.`
  );

export const complexityTierSchema = z.enum(COMPLEXITY_TIERS);

export const requestedDateSchema = z.iso.date("Enter a valid date.");

export const requestedTimeSchema = z.enum(DAILY_SLOT_TIME_OPTIONS);

// Client Max End Time (CLAUDE.md 6.3) -- unlike requestedTimeSchema
// above, this isn't constrained to the artist's fixed daily slot
// options, since a client's "must be finished by" time (e.g. to make a
// flight) can fall anywhere in the day. Purely advisory -- see
// getPendingIntakeRequests/RequestCard, never enforced against actual
// slot availability.
export const clientMaxEndTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Enter a valid time (HH:MM).")
  .optional();

export const designTagSchema = z.enum(DESIGN_TAG_OPTIONS);

export const aestheticTagSchema = z.enum(AESTHETIC_TAG_OPTIONS);

// Client Onboarding Required Fields (CLAUDE.md 6.2).
export const clientFirstNameSchema = z
  .string()
  .trim()
  .min(1, "First name is required.")
  .max(100);

export const clientLastNameSchema = z
  .string()
  .trim()
  .min(1, "Last name is required.")
  .max(100);

export const dateOfBirthSchema = z
  .iso.date("Enter a valid date of birth.")
  .refine(
    (value) => {
      const dob = new Date(`${value}T00:00:00`);
      const cutoff = new Date();
      cutoff.setFullYear(cutoff.getFullYear() - MIN_CLIENT_AGE_YEARS);
      return dob.getTime() <= cutoff.getTime();
    },
    `You must be at least ${MIN_CLIENT_AGE_YEARS} years old to book.`
  );

export const clientBudgetRangeSchema = z
  .object({
    minPrice: z.number().positive().multipleOf(5),
    maxPrice: z.number().positive().multipleOf(5),
  })
  .refine((range) => range.maxPrice > range.minPrice, {
    message: "Maximum budget must be greater than the minimum budget.",
    path: ["maxPrice"],
  });

// Structural validity only for the client's self-service edit (5.4) --
// see services/updatePendingIntakeRequest.ts for the ownership/status
// guard and the availability re-check. Narrower than
// clientIntakeInputSchema below: tier/tags/images aren't editable here.
export const updatePendingIntakeRequestInputSchema = z
  .object({
    clientNotes: z.string().trim().max(1000).optional(),
    clientBudgetRange: clientBudgetRangeSchema,
    requestedDate: requestedDateSchema,
    requestedTime: requestedTimeSchema,
  })
  .superRefine((data, ctx) => {
    const requestedStartTime = combineRequestedDateAndTime(
      data.requestedDate,
      data.requestedTime
    );
    if (requestedStartTime.getTime() <= Date.now()) {
      ctx.addIssue({
        code: "custom",
        path: ["requestedDate"],
        message: "Choose a date and time in the future.",
      });
    }
  });

// Structural validity only for the artist's reschedule step (5.5) --
// see services/rescheduleApprovedBooking.ts for the APPROVED-only
// guard and the actual slot reallocation. Shares scheduling's duration
// bounds with reviewIntakeRequestInputSchema above.
export const rescheduleApprovedBookingInputSchema = z
  .object({
    requestedDate: requestedDateSchema,
    requestedTime: requestedTimeSchema,
    durationMinutes: z
      .number()
      .int()
      .min(
        MIN_SLOT_DURATION_MINUTES,
        `The service duration must be at least ${MIN_SLOT_DURATION_MINUTES} minutes.`
      )
      .max(
        MAX_TOTAL_SERVICE_DURATION_MINUTES,
        `The service duration cannot exceed ${MAX_TOTAL_SERVICE_DURATION_MINUTES} minutes.`
      ),
  })
  .superRefine((data, ctx) => {
    const requestedStartTime = combineRequestedDateAndTime(
      data.requestedDate,
      data.requestedTime
    );
    if (requestedStartTime.getTime() <= Date.now()) {
      ctx.addIssue({
        code: "custom",
        path: ["requestedDate"],
        message: "Choose a date and time in the future.",
      });
    }
  });

// Network firewall for client submissions. Structural validity only —
// see src/domains/intake/services/validateComplexity.ts for the content
// gatekeeper that judges an already-valid request's tags/notes.
export const clientIntakeInputSchema = z
  .object({
    instagramHandle: instagramHandleSchema,
    designReferenceImageUrls: designReferenceImagesSchema,
    tier: complexityTierSchema,
    clientBudgetRange: clientBudgetRangeSchema,
    designTags: z.array(designTagSchema).optional(),
    aestheticTags: z.array(aestheticTagSchema).optional(),
    email: z.email("Enter a valid email address."),
    phone: z.string().trim().min(1).optional(),
    firstName: clientFirstNameSchema,
    lastName: clientLastNameSchema,
    dateOfBirth: dateOfBirthSchema,
    clientNotes: z.string().trim().max(1000).optional(),
    requestedDate: requestedDateSchema,
    requestedTime: requestedTimeSchema,
    clientMaxEndTime: clientMaxEndTimeSchema,
  })
  .superRefine((data, ctx) => {
    const requestedStartTime = combineRequestedDateAndTime(
      data.requestedDate,
      data.requestedTime
    );
    if (requestedStartTime.getTime() <= Date.now()) {
      ctx.addIssue({
        code: "custom",
        path: ["requestedDate"],
        message: "Choose a date and time in the future.",
      });
    }

    if (data.clientMaxEndTime) {
      const maxEndTime = new Date(
        `${data.requestedDate}T${data.clientMaxEndTime}:00`
      );
      if (maxEndTime.getTime() <= requestedStartTime.getTime()) {
        ctx.addIssue({
          code: "custom",
          path: ["clientMaxEndTime"],
          message: "Must-finish-by time must be after your preferred start time.",
        });
      }
    }

    const isFreestyle = data.tier === "FREESTYLE";
    const relevantTags = isFreestyle ? data.aestheticTags : data.designTags;
    const tagFieldPath = isFreestyle ? "aestheticTags" : "designTags";

    if (!relevantTags || relevantTags.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: [tagFieldPath],
        message: isFreestyle
          ? "Select at least one aesthetic theme tag."
          : "Select at least one design tag.",
      });
    }

    const hasOtherTag = (relevantTags ?? []).includes(OTHER_TAG_VALUE);
    if (hasOtherTag && !data.clientNotes) {
      ctx.addIssue({
        code: "custom",
        path: ["clientNotes"],
        message:
          'Please describe your idea in the notes field when selecting "Other".',
      });
    }
  });
