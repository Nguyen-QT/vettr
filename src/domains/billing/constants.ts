import type { RequestStatus } from "@/domains/booking/types";

import type {
  DepositPaymentAction,
  DepositPaymentIntentStatus,
  DepositRefundStatus,
  DepositRefundStripeStatus,
  StoredDepositPaymentIntentAction,
} from "./types";

// Placeholder bound -- tune to the actual minimum deposit an artist may
// require. Kept above zero so an artist can't accidentally configure a
// "free" deposit that would always trivially satisfy depositPaid.
export const MIN_DEPOSIT_AMOUNT = 1;

// Day-of checkout addons (CLAUDE.md 7.5.5) -- kept above zero for the
// same reason as MIN_DEPOSIT_AMOUNT; a free line item has no billing
// purpose and is almost certainly a data-entry mistake.
export const MIN_ADDON_PRICE = 1;

// Upfront Cancellation Precharge Engine (CLAUDE.md 7.4, blueprint
// "Flagging Mechanism"). A flagged client's (ClientProfile.
// enforcePrecharge) required deposit is the greater of the artist's
// normal per-tier amount and this percentage of the request's
// estimatedPrice -- applies even when the artist hasn't configured a
// deposit for that tier at all, since a flagged client is exactly the
// case a deposit should be required regardless.
export const PRECHARGE_PERCENTAGE = 0.5;

// Stripe idempotency key prefixes (CLAUDE.md 15.1). A dropped response
// after Stripe already accepted the call (not a failed call -- that's
// already try/catch'd, see External Side-Effect Safety) could otherwise
// make a client-side retry create a second PaymentIntent/refund for the
// same booking. Keyed per logical operation rather than a random value
// per call, so a genuine retry of the *same* operation reuses Stripe's
// cached result instead of duplicating the side effect. The refund key is
// per booking. A PaymentIntent create is keyed per booking + the
// PaymentIntent it replaces, or "initial" (56.4), + the amount in pence
// and the routing (56.5):
// `deposit-intent:<bookingRequestId>:<replaced id | "initial">:<amount>:<connect account id | "platform">`.
// So concurrent tabs replacing the same PaymentIntent with the same
// parameters get the same new one, a visit after Stripe's 24h key window
// reuses the stored PaymentIntent instead of keying a new create, and a
// retry after a parameter change gets a new key instead of Stripe's
// idempotency error.
export const DEPOSIT_PAYMENT_INTENT_IDEMPOTENCY_KEY_PREFIX = "deposit-intent";
export const DEPOSIT_REFUND_IDEMPOTENCY_KEY_PREFIX = "deposit-refund";
// Keyed per PaymentIntent rather than per booking (56.4): every caller
// cancelling the same PaymentIntent shares one key.
export const DEPOSIT_PAYMENT_INTENT_CANCEL_IDEMPOTENCY_KEY_PREFIX = "deposit-intent-cancel";

// Surfaced by createDepositPaymentIntent (CLAUDE.md 7.1.3). Not found
// and ownership-mismatch share one message deliberately, same
// precedent as booking's cancelBookingRequest, so a request can't be
// used to probe whether some other id exists.
export const DEPOSIT_REQUEST_NOT_FOUND_ERROR_MESSAGE =
  "This booking request could not be found.";
export const DEPOSIT_REQUEST_NOT_APPROVED_ERROR_MESSAGE =
  "A deposit can only be paid once your booking has been approved.";
export const DEPOSIT_ALREADY_PAID_ERROR_MESSAGE =
  "The deposit for this booking has already been paid.";
export const DEPOSIT_NOT_CONFIGURED_ERROR_MESSAGE =
  "This artist has not set a deposit amount for this service tier yet.";
export const DEPOSIT_PAYMENT_INIT_ERROR_MESSAGE =
  "Something went wrong starting your deposit payment. Please try again.";
// The stored PaymentIntent is processing or has succeeded (56.4): the
// webhook records the payment, so no new one is offered.
export const DEPOSIT_PAYMENT_PROCESSING_ERROR_MESSAGE =
  "Your deposit payment is already being processed. Please check back shortly.";

// createDepositPaymentIntent's policy for the booking's stored
// PaymentIntent, by its Stripe status (56.4). A Record, like
// DEPOSIT_PAYMENT_ACTION_BY_STATUS below, so a status can't be added
// without a policy. Open statuses are reused if the amount and routing
// still match, otherwise cancelled and replaced (Stripe can't change
// routing on an existing PaymentIntent, so there is no update path).
// A payment in flight is refused. requires_capture can't happen
// (nothing uses manual capture) and is refused with it.
export const STORED_DEPOSIT_PAYMENT_INTENT_ACTION_BY_STATUS: Record<
  DepositPaymentIntentStatus,
  StoredDepositPaymentIntentAction
> = {
  requires_payment_method: "REUSE",
  requires_confirmation: "REUSE",
  requires_action: "REUSE",
  processing: "REFUSE",
  requires_capture: "REFUSE",
  succeeded: "REFUSE",
  canceled: "REPLACE",
};

// Surfaced by confirmDepositPayment (CLAUDE.md 7.1.4) when the webhook
// reports a PaymentIntent id that doesn't match any BookingRequest. The
// route verifies Stripe's signature, so the id is genuine: it is state
// left from before 56.4, a bug, or a PaymentIntent that isn't a deposit,
// and confirmDepositPayment logs it (56.4).
export const DEPOSIT_PAYMENT_INTENT_NOT_FOUND_ERROR_MESSAGE =
  "No booking request matches this payment.";

// confirmDepositPayment's policy by the status a payment lands on (56.2).
// A Record rather than sets, so a new RequestStatus doesn't compile until
// it's given a policy. Cancelled and declined bookings owe the client a
// full refund (both cancel paths refund in full). COMPLETED/NO_SHOW
// alert instead of refunding: on a redelivery, a paid deposit there looks
// the same as one used at checkout or forfeited by a no-show, so a failed
// refund couldn't be retried safely. PENDING/AWAITING_SLOT_CONFIRMATION
// are unreachable (a PaymentIntent is only created for APPROVED) and
// alert for the same reason.
export const DEPOSIT_PAYMENT_ACTION_BY_STATUS: Record<RequestStatus, DepositPaymentAction> = {
  APPROVED: "RECORD",
  CANCELLED_BY_CLIENT: "REFUND",
  CANCELLED_BY_ARTIST: "REFUND",
  DECLINED: "REFUND",
  COMPLETED: "ALERT",
  NO_SHOW: "ALERT",
  PENDING: "ALERT",
  AWAITING_SLOT_CONFIRMATION: "ALERT",
};

// Surfaced by refundDeposit (CLAUDE.md 7.3.3). Callers (booking's
// cancelBookingRequest/cancelApprovedBookingAsArtist, 7.3.4, and
// confirmDepositPayment for a late payment, 56.2) only ever invoke this
// once they already know depositPaid was true, so
// DEPOSIT_REFUND_NOT_PAID_ERROR_MESSAGE is a defensive guard rather
// than an expected user-facing path.
export const DEPOSIT_REFUND_REQUEST_NOT_FOUND_ERROR_MESSAGE =
  "This booking request could not be found.";
export const DEPOSIT_REFUND_NOT_PAID_ERROR_MESSAGE =
  "There is no paid deposit to refund for this booking.";
export const DEPOSIT_REFUND_MISSING_PAYMENT_INTENT_ERROR_MESSAGE =
  "This booking's deposit payment could not be located for refund.";
export const DEPOSIT_REFUND_INIT_ERROR_MESSAGE =
  "Something went wrong issuing this refund. Please try again.";

// Stripe's refund status -> ours (56.6). A Record, like
// STORED_DEPOSIT_PAYMENT_INTENT_ACTION_BY_STATUS, so a status can't be
// added without a mapping. requires_action is still waiting on the
// customer, so the refund is pending. A canceled refund never moved the
// money, so it counts as failed.
export const DEPOSIT_REFUND_STATUS_BY_STRIPE_STATUS: Record<
  DepositRefundStripeStatus,
  DepositRefundStatus
> = {
  pending: "PENDING",
  requires_action: "PENDING",
  succeeded: "SUCCEEDED",
  failed: "FAILED",
  canceled: "FAILED",
};

// The fixed precedence PENDING < SUCCEEDED < FAILED (56.6): the statuses
// each status may be written over. A refund only ever moves this way on
// Stripe (56.1: succeeded -> failed, then a stale refund.updated still
// saying succeeded), so a fixed order is safe where event time isn't:
// an event's created has one-second resolution, and refundDeposit's own
// write has no event time at all. A Record, so a new status doesn't
// compile until it has a place in the order.
export const DEPOSIT_REFUND_STATUSES_BEHIND: Record<
  DepositRefundStatus,
  readonly DepositRefundStatus[]
> = {
  PENDING: [],
  SUCCEEDED: ["PENDING"],
  FAILED: ["PENDING", "SUCCEEDED"],
};

// The retry sweep's (56.7) count of visits to a refund intent still
// PENDING with no refund id. The visit whose increment reaches this number
// raises one critical alert (53.7); retries continue after it. From this
// count on, retryOwedDepositRefunds retries the row at most once a day.
export const DEPOSIT_REFUND_RETRY_ALERT_ATTEMPTS = 5;

// The retry sweep's bounds (56.7). At most this many rows are read per run,
// oldest updatedAt first; the rest wait for the next run.
export const DEPOSIT_REFUND_RETRY_BATCH_SIZE = 50;
// A row is retried only once its updatedAt is this old, so the sweep never
// races the call that created it or last touched it. Must stay above the
// longest a server action or webhook can run (300s).
export const DEPOSIT_REFUND_RETRY_MIN_AGE_MS = 10 * 60 * 1000;
// Once a row reaches DEPOSIT_REFUND_RETRY_ALERT_ATTEMPTS it waits this long
// between retries. That also outlasts Stripe's 24h idempotency key window,
// which replays a saved Stripe 500 to every retry inside it.
export const DEPOSIT_REFUND_RETRY_BACKOFF_MS = 24 * 60 * 60 * 1000;
// No new row starts once a run has taken this long; the rest are deferred
// to the next run. The route's maxDuration (300s) leaves room for the row
// in progress, since one Stripe call with stripe-node's retries can take
// minutes.
export const DEPOSIT_REFUND_RETRY_BUDGET_MS = 60 * 1000;

// Surfaced by the day-of checkout flow (CLAUDE.md 7.5.3/7.5.4):
// addBillingAddon, removeBillingAddon, getBillingAddons. Not found and
// ownership-mismatch share one message deliberately, same precedent
// as the deposit flow above.
export const CHECKOUT_REQUEST_NOT_FOUND_ERROR_MESSAGE =
  "This booking request could not be found.";
export const CHECKOUT_REQUEST_NOT_APPROVED_ERROR_MESSAGE =
  "Checkout is only available for an approved booking.";
export const CHECKOUT_ADDON_NOT_FOUND_ERROR_MESSAGE =
  "This addon could not be found.";

// Surfaced by createConnectOnboardingLink (CLAUDE.md 24.1.2) when the
// Connect account link request itself fails -- distinct from a Stripe
// API error thrown outright (caught and reported separately), this is
// the "call succeeded but returned nothing usable" case.
export const CONNECT_ONBOARDING_LINK_INIT_ERROR_MESSAGE =
  "Something went wrong starting Stripe onboarding. Please try again.";
