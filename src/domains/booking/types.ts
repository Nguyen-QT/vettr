// Pure domain contracts for the booking bounded context. Deliberately
// standalone TypeScript — no z.infer, no import from booking.schema.ts —
// so the domain's shape doesn't depend on which validation library
// enforces it at runtime. Kept structurally in sync with constants.ts's
// runtime arrays and booking.schema.ts's Zod schemas by hand; they are not
// derived from one another.
//
// SlotTime and OtpCodeInputProps are the two exceptions to "standalone"
// above: they're imported (type-only) from the lower-level domains that
// own them rather than redefined -- booking depends on scheduling and
// auth, never the other way around -- so both sides share the exact same
// shape. SlotTime is scheduling's slot set; OtpCodeInputProps is the code
// field InlineBookingVerificationProps (54.5.4.3) passes straight through.
import type { OtpCodeInputProps } from "@/domains/auth/types";
import type { SlotTime } from "@/domains/scheduling/types";

export type ComplexityTier = "TIER_2" | "TIER_3" | "TIER_4" | "FREESTYLE";

// A client's stated preference for settling the final on-the-day balance
// (CLAUDE.md 23.1) -- never applies to the deposit itself, which stays
// card-only/Stripe regardless of this value.
export type PaymentMethod = "CASH" | "CARD";

export type DesignTag =
  | "fine-line-detail"
  | "custom-illustration"
  | "full-color-realism"
  | "geometric-pattern"
  | "simple-line"
  | "single-color"
  | "small-basic"
  | "quick-flash"
  | "OTHER";

export type AestheticTag =
  | "abstract-expressive"
  | "watercolor-blend"
  | "large-scale-piece"
  | "bold-traditional"
  | "minimalist-clean"
  | "single-tone"
  | "OTHER";

export interface ClientBudgetRange {
  minPrice: number;
  maxPrice: number;
}

// Client-supplied fields only. Artist-controlled state (estimatedPrice,
// depositPaid, enforcePrecharge, cancellationCount) is set elsewhere and
// never accepted as input here.
export interface ClientBookingInput {
  instagramHandle: string;
  designReferenceImageUrls: string[];
  tier: ComplexityTier;
  clientBudgetRange: ClientBudgetRange;
  designTags?: DesignTag[];
  aestheticTags?: AestheticTag[];
  email: string;
  phone?: string;
  // Client Onboarding Required Fields (CLAUDE.md 6.2). A signed-in
  // client whose ClientProfile already has these set never has them
  // trusted from here -- see submitBookingRequest, which fills in only
  // currently-blank fields on the existing profile.
  firstName: string;
  lastName: string;
  // ISO date string ("YYYY-MM-DD"), same shape as requestedDate below
  // -- that's how the form's date input collects it.
  dateOfBirth: string;
  clientNotes?: string;
  // Combined into BookingRequest.requestedStartTime on submission
  // (CLAUDE.md 4.1e) -- kept as separate date/time fields here since
  // that's how the form actually collects them.
  requestedDate: string;
  requestedTime: SlotTime;
  // Optional, purely advisory (CLAUDE.md 6.3) -- an HH:MM time-of-day
  // string, not constrained to requestedTime's fixed slot options.
  // Combined with requestedDate into BookingRequest.clientMaxEndTime on
  // submission, same spirit as requestedStartTime above.
  clientMaxEndTime?: string;
  // Client's stated preference for settling the final on-the-day balance
  // (CLAUDE.md 23.1). Deposits stay card-only/Stripe regardless of this
  // value -- see PaymentMethod's own doc comment.
  paymentMethod: PaymentMethod;
}

// Per-field lock for the wizard's details step (CLAUDE.md 6.2, 54.5.4.2) --
// true when a signed-in client's profile already has that value on file.
// Per-field, not one boolean: a client missing e.g. a date of birth must
// still be able to fill it in.
export type BookingDetailsLockedFields = Record<
  keyof Pick<
    ClientBookingInput,
    "instagramHandle" | "firstName" | "lastName" | "dateOfBirth" | "email" | "phone"
  >,
  boolean
>;

// The booking write shared by the signed-in and email-code submit paths
// (54.5.2.3). clientProfileId is the caller's trusted session or freshly
// provisioned profile; the form's identity fields (handle, email) are
// excluded so createBookingRequest can never write them.
export type CreateBookingRequestInput = Omit<
  ClientBookingInput,
  "instagramHandle" | "email"
> & {
  clientProfileId: string;
  artistId: string;
};

export type CreateBookingRequestResult =
  | { success: true; bookingRequestId: string }
  | { success: false; error: string };

// requestBookingVerificationCode (54.5.2.4): the parsed draft's screening
// fields plus the address the code goes to. Narrower than ClientBookingInput,
// so the controller's parsed draft can be passed straight in.
export type RequestBookingVerificationCodeInput = Pick<
  ClientBookingInput,
  "email" | "tier" | "clientNotes" | "designTags" | "aestheticTags"
>;

// A complexity rejection carries validateComplexity's copy; an auth failure
// carries auth's generic retryable copy. A cooldown, the send cap or a failed
// send are all the same success (54.5.2.1).
export type RequestBookingVerificationCodeResult =
  | { success: true }
  | { success: false; error: string };

// The CLIENT session a redeemed code issued -- only what the controller
// needs to set the cookie. auth's clientProfileId stays inside booking.
export interface VerifiedClientSession {
  sessionId: string;
  expiresAt: Date;
}

// submitBookingRequestWithEmailOtp (54.5.2.5): the controller's parsed
// draft, the artist it already looked up, and the emailed code.
export type SubmitBookingRequestWithEmailOtpInput = ClientBookingInput & {
  artistId: string;
  code: string;
};

// session is set whenever the code was redeemed -- on success, and when the
// booking write failed after verification -- so the controller sets the
// cookie whenever it's present and the client retries via the signed-in
// path with no second code. null means no session was issued.
export type SubmitBookingRequestWithEmailOtpResult =
  | { success: true; bookingRequestId: string; session: VerifiedClientSession }
  | { success: false; error: string; session: VerifiedClientSession | null };

// InlineBookingVerification (54.5.4.3) -- the Details & Verify step's code
// block for a visitor without a CLIENT session. "request" shows the send
// button, "code" the code field and the verify-and-submit button. Extends
// OtpCodeInputProps so useBookingVerification (54.5.5.2) can pass the code
// fields straight through; `error` belongs to whichever step is showing.
// `email` is the address the code went to, not the live field.
export type BookingVerificationStep = "request" | "code";

export interface InlineBookingVerificationProps extends OtpCodeInputProps {
  step: BookingVerificationStep;
  email: string;
  onRequestCode: () => void;
  isRequestingCode?: boolean;
  onVerifyAndSubmit: () => void;
  isSubmitting?: boolean;
}

// Requests the artist dashboard shows because they need action:
// PENDING (never reviewed) or AWAITING_SLOT_CONFIRMATION (a proposed
// double-slot booking waiting on the artist's off-platform confirmation,
// CLAUDE.md 4.1f/g). Distinct from RequestStatus, which has other values
// (APPROVED, DECLINED, ...) the dashboard never needs to render.
export type ActionableRequestStatus = "PENDING" | "AWAITING_SLOT_CONFIRMATION";

// Read-shaped projection of an actionable BookingRequest for the artist
// dashboard (Phase 3, extended 4.1i). Distinct from ClientBookingInput:
// this describes what the artist reviews, not what the client submitted.
export interface PendingBookingRequestSummary {
  id: string;
  status: ActionableRequestStatus;
  clientInstagramHandle: string;
  clientEmail: string;
  clientPhone: string | null;
  tier: ComplexityTier;
  minPrice: number;
  maxPrice: number;
  designTags: string[];
  aestheticTags: string[];
  clientNotes: string | null;
  designReferenceImageUrls: string[];
  // The client's chosen candidate slot (CLAUDE.md 4.1e) -- nullable at
  // the DB level only for rows that predate that capture; every row
  // created through the current booking form always has one.
  requestedStartTime: Date | null;
  // Optional, purely advisory (CLAUDE.md 6.3) -- see ClientBookingInput.
  clientMaxEndTime: Date | null;
  createdAt: Date;
  // Cancellation history visibility (CLAUDE.md 11.1) -- the same
  // ClientProfile fields 7.4's precharge engine already reacts to on
  // the billing side, surfaced here so the artist can factor them into
  // their own approve/decline decision too, not just the deposit
  // amount billing computes from them.
  clientCancellationCount: number;
  clientEnforcePrecharge: boolean;
  // Payment method preference (CLAUDE.md 23.1). Nullable at the DB level
  // only -- every request submitted through the current booking form
  // always has one; a row predating this feature stays null.
  paymentMethod: PaymentMethod | null;
}

// Read-shaped projection of an APPROVED BookingRequest with a future
// booking, for the artist's upcoming-appointments view (CLAUDE.md 4.5).
// startTime/endTime span all of the request's booked TimeSlot rows
// (two, adjacent, for a duration that overflowed one slot) rather than
// exposing the individual rows -- the artist just needs the overall
// appointment window here.
export interface UpcomingAppointmentSummary {
  id: string;
  clientInstagramHandle: string;
  clientEmail: string;
  clientPhone: string | null;
  tier: ComplexityTier;
  // Nullable at the DB level only -- every request that reaches
  // APPROVED via reviewBookingRequest/confirmProposedBooking (CLAUDE.md
  // 4.4) always has one set by the time it gets here.
  estimatedPrice: number | null;
  designTags: string[];
  aestheticTags: string[];
  clientNotes: string | null;
  designReferenceImageUrls: string[];
  startTime: Date;
  endTime: Date;
  // Payment method preference (CLAUDE.md 23.1), overridable by the
  // artist at final checkout. Nullable at the DB level only -- see
  // PendingBookingRequestSummary's identical field.
  paymentMethod: PaymentMethod | null;
}

// Mirrors Prisma's RequestStatus enum. Unlike ActionableRequestStatus
// above (the artist-dashboard subset), the client dashboard shows every
// status a booking can be in, including ones the artist view never
// needs to render (DECLINED, CANCELLED_BY_CLIENT, CANCELLED_BY_ARTIST,
// NO_SHOW, COMPLETED).
export type RequestStatus =
  | "PENDING"
  | "AWAITING_SLOT_CONFIRMATION"
  | "APPROVED"
  | "DECLINED"
  | "CANCELLED_BY_CLIENT"
  | "CANCELLED_BY_ARTIST"
  | "NO_SHOW"
  | "COMPLETED";

// Read-shaped projection of an BookingRequest for the client dashboard
// (CLAUDE.md 5.2) -- every booking a ClientProfile has across every
// artist, not scoped to one artist the way the dashboard/appointments
// views above are. Identifies the artist by name/handle rather than id
// alone, since this is a client-facing read.
export interface ClientBookingSummary {
  id: string;
  status: RequestStatus;
  artistName: string;
  artistInstagramHandle: string;
  tier: ComplexityTier;
  minPrice: number;
  maxPrice: number;
  estimatedPrice: number | null;
  clientNotes: string | null;
  requestedStartTime: Date | null;
  createdAt: Date;
  // Existing reference images (CLAUDE.md 13.2.1) -- lets the client
  // dashboard's edit form show/remove what's already attached to a
  // still-PENDING request, not just add new ones.
  designReferenceImageUrls: string[];
  // Deposit status (CLAUDE.md 7.3.5) -- depositPaid: false means no
  // deposit badge shows at all (a still-payable one surfaces
  // separately via billing's getPayableDeposits/DepositPaymentCard).
  // depositRefunded only ever becomes true after a cancellation
  // refund (7.3); a NO_SHOW with depositPaid true and depositRefunded
  // false is a forfeited deposit, distinguished at render time by
  // status rather than a dedicated field.
  depositPaid: boolean;
  depositRefunded: boolean;
}

// Narrow cross-domain read (CLAUDE.md 7.1.8) -- exposes only what a
// caller outside booking needs to resolve a payable deposit amount
// (billing's getPayableDeposits), deliberately smaller than
// ClientBookingSummary so a cross-domain consumer never needs booking's
// full request shape or its own Prisma access to this table.
export interface ApprovedUnpaidRequestSummary {
  id: string;
  artistId: string;
  tier: ComplexityTier;
}

// Narrow cross-domain read (CLAUDE.md 7.2.3) -- exposes only what
// billing's deposit-flow services (createDepositPaymentIntent,
// confirmDepositPayment) need, so billing never queries BookingRequest
// directly (CLAUDE.md's Domain Boundary Isolation rule).
export interface BookingRequestDepositView {
  id: string;
  clientId: string;
  artistId: string;
  tier: ComplexityTier;
  status: RequestStatus;
  depositPaid: boolean;
  // Added for refundDeposit (CLAUDE.md 7.3.3) -- stripePaymentIntentId
  // is what the refund is issued against; depositRefunded guards its
  // idempotency the same way depositPaid guards confirmDepositPayment's.
  stripePaymentIntentId: string | null;
  depositRefunded: boolean;
  // Added for the precharge engine (CLAUDE.md 7.4) -- estimatedPrice is
  // what a flagged client's 50% precharge is computed against;
  // clientEnforcePrecharge is ClientProfile.enforcePrecharge joined in,
  // since createDepositPaymentIntent needs it but must never query
  // ClientProfile itself (CLAUDE.md's Domain Boundary Isolation rule).
  // Nullable at the DB level only -- every request that reaches
  // APPROVED via reviewBookingRequest/confirmProposedBooking (4.4)
  // always has an estimatedPrice set by the time it gets here.
  estimatedPrice: number | null;
  clientEnforcePrecharge: boolean;
}

// Write command (CLAUDE.md 5.4): self-service cancellation from the
// client dashboard. clientProfileId comes from the trusted session,
// never client-supplied input -- see services/cancelBookingRequest.ts.
export interface CancelBookingRequestInput {
  bookingRequestId: string;
  clientProfileId: string;
}

export type CancelBookingRequestResult =
  | { success: true }
  | { success: false; error: string };

// Write command (CLAUDE.md 5.4): self-service edit of a still-PENDING
// request. Deliberately a narrower field set than ClientBookingInput --
// tier/tags/images stay fixed after submission, only notes, budget, and
// requested date/time are editable in this first pass.
export interface UpdatePendingBookingRequestInput {
  bookingRequestId: string;
  clientProfileId: string;
  clientNotes?: string;
  clientBudgetRange: ClientBudgetRange;
  requestedDate: string;
  requestedTime: SlotTime;
  // Lifts 5.4's original tier/tags/images exclusion for images
  // specifically (CLAUDE.md 13.2) -- the full replacement set, not a
  // delta, mirroring how the rest of this input already replaces
  // notes/budget/time wholesale rather than patching them.
  designReferenceImageUrls: string[];
}

export type UpdatePendingBookingRequestResult =
  | { success: true }
  | { success: false; error: string };

// Write command (CLAUDE.md 5.5): artist-initiated reschedule of an
// already-APPROVED booking. No clientProfileId -- this is an artist
// action, ownership-checked against the artist's own session at the
// Controller/Action layer instead (see booking/actions.ts).
export interface RescheduleApprovedBookingInput {
  bookingRequestId: string;
  newStartTime: Date;
  durationMinutes: number;
}

export type RescheduleApprovedBookingResult =
  | { success: true }
  | { success: false; error: string };

// One artist's own example images, grouped by tier (CLAUDE.md 4.6),
// for the client-facing booking form. Every tier is always present as
// a key, even with an empty array, so the view never has to guess
// whether a tier was omitted vs. genuinely has no images yet.
export type TierReferenceImages = Record<ComplexityTier, string[]>;

// Per-tier deposit amounts as buildServiceMenu's input (54.1.2.4); null
// means the artist hasn't configured a deposit for that tier. Declared
// here rather than imported from billing (billing already imports
// booking -- architecture.md §4); structurally identical to billing's
// ArtistDepositSettings, so that result can be passed straight in.
export type TierDepositAmounts = Record<ComplexityTier, number | null>;

// One card of the public artist profile's service menu (54.1) -- narrow
// DTO, no artist identifiers.
export interface ServiceMenuItem {
  tier: ComplexityTier;
  label: string;
  depositAmount: number | null;
  baselineBudget: ClientBudgetRange;
}

// Pure view props (54.1.4.2). `artistHandle` is the normalised handle
// from the PublicArtistProfile DTO, used only to build the request link.
export interface ServiceMenuProps {
  artistHandle: string;
  items: ServiceMenuItem[];
}

// Pure view props (54.1.4.3). getTierReferenceImages' result passes
// straight through -- every tier is always a key (possibly empty).
export interface PortfolioGalleryProps {
  imagesByTier: TierReferenceImages;
}

// Pure view props (54.1.4.4). The page passes booking's
// CANCELLATION_WINDOW_HOURS / STRIKE_THRESHOLD and billing's
// PRECHARGE_PERCENTAGE straight through, so the copy can't drift from
// the rules the services enforce. prechargePercentage is a fraction (0.5).
export interface BookingPoliciesProps {
  cancellationWindowHours: number;
  strikeThreshold: number;
  prechargePercentage: number;
}

// Write command (CLAUDE.md 5.6): artist-initiated cancellation of an
// already-APPROVED booking. No clientProfileId -- ownership-checked
// against the artist's own session at the Controller/Action layer,
// same pattern as RescheduleApprovedBookingInput (5.5). Never applies a
// cancellation strike -- see services/cancelApprovedBookingAsArtist.ts.
export interface CancelApprovedBookingAsArtistInput {
  bookingRequestId: string;
}

export type CancelApprovedBookingAsArtistResult =
  | { success: true }
  | { success: false; error: string };

// Write command (CLAUDE.md 5.6): artist marks a past-dated APPROVED
// appointment as a no-show. Same ownership-check posture as above.
export interface MarkAppointmentNoShowInput {
  bookingRequestId: string;
}

export type MarkAppointmentNoShowResult =
  | { success: true }
  | { success: false; error: string };

// Write command (CLAUDE.md 5.6): artist marks a past-dated APPROVED
// appointment as completed. Same ownership-check posture as above.
export interface MarkAppointmentCompletedInput {
  bookingRequestId: string;
}

export type MarkAppointmentCompletedResult =
  | { success: true }
  | { success: false; error: string };

// Write command (CLAUDE.md 23.1): artist overrides a booking's payment
// method preference, e.g. at final checkout when circumstances change on
// the day. Ownership-checked internally against artistId, unlike the
// reschedule/cancel/no-show/completed writes above whose ownership check
// lives in the Controller/Action layer -- both are equally valid
// defenses against the same class of mismatch.
export interface UpdateBookingPaymentMethodInput {
  bookingRequestId: string;
  artistId: string;
  paymentMethod: PaymentMethod;
}

export type UpdateBookingPaymentMethodResult =
  | { success: true }
  | { success: false; error: string };

// Narrow cross-domain read (CLAUDE.md 7.5.2) -- exposes only what
// billing's day-of checkout flow needs (addon management, final bill
// computation, finalize-and-complete), so billing never queries
// BookingRequest directly (CLAUDE.md's Domain Boundary Isolation rule).
export interface BookingRequestCheckoutView {
  id: string;
  artistId: string;
  status: RequestStatus;
  // Nullable at the DB level only -- every request that reaches
  // APPROVED via reviewBookingRequest/confirmProposedBooking (4.4)
  // always has an estimatedPrice set by the time it gets here.
  estimatedPrice: number | null;
  // The deposit amount actually charged (a snapshot, CLAUDE.md 7.1.1),
  // not the artist's live per-tier setting -- credited against the
  // final total only when depositPaid is true.
  depositAmount: number | null;
  depositPaid: boolean;
}

// Read-shaped projection of a ClientProfile's contact fields (CLAUDE.md
// 6.1) -- used to prefill the booking form when a signed-in client
// starts a new booking, instead of asking them to retype what's
// already on file.
export interface ClientProfileContactDetails {
  instagramHandle: string;
  email: string;
  phone: string | null;
  // Onboarding fields (CLAUDE.md 6.2) -- null for any ClientProfile
  // that predates 6.2 or hasn't provided them yet.
  firstName: string | null;
  lastName: string | null;
  dateOfBirth: Date | null;
}

// Write command (CLAUDE.md 10.1): self-service edit of a client's own
// profile from the client dashboard. clientProfileId comes from the
// trusted session, never client-supplied -- same ownership posture as
// CancelBookingRequestInput (5.4). Every field required here (unlike
// ClientProfileContactDetails' nullable onboarding fields above) --
// this is the one place a client can ever fill in a still-blank
// firstName/lastName/dateOfBirth after 6.2, or fix a typo in any
// field, so the form always collects the complete set on save.
export interface UpdateClientProfileInput {
  clientProfileId: string;
  instagramHandle: string;
  email: string;
  phone?: string;
  firstName: string;
  lastName: string;
  // ISO date string ("YYYY-MM-DD"), same shape as ClientBookingInput's
  // dateOfBirth (6.2).
  dateOfBirth: string;
}

export type UpdateClientProfileResult =
  | { success: true }
  | { success: false; error: string };
