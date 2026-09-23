// Placeholder bound -- tune to the actual minimum deposit an artist may
// require. Kept above zero so an artist can't accidentally configure a
// "free" deposit that would always trivially satisfy depositPaid.
export const MIN_DEPOSIT_AMOUNT = 1;

// Upfront Cancellation Precharge Engine (CLAUDE.md 7.4, blueprint
// "Flagging Mechanism"). A flagged client's (ClientProfile.
// enforcePrecharge) required deposit is the greater of the artist's
// normal per-tier amount and this percentage of the request's
// estimatedPrice -- applies even when the artist hasn't configured a
// deposit for that tier at all, since a flagged client is exactly the
// case a deposit should be required regardless.
export const PRECHARGE_PERCENTAGE = 0.5;

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

// Surfaced by confirmDepositPayment (CLAUDE.md 7.1.4) when the webhook
// reports a PaymentIntent id that doesn't match any BookingRequest --
// should never happen for a genuine Stripe event, but guards against a
// stale/forged id.
export const DEPOSIT_PAYMENT_INTENT_NOT_FOUND_ERROR_MESSAGE =
  "No booking request matches this payment.";

// Surfaced by refundDeposit (CLAUDE.md 7.3.3). Callers (booking's
// cancelBookingRequest/cancelApprovedBookingAsArtist, 7.3.4) only ever
// invoke this once they already know depositPaid was true, so
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

// Surfaced by confirmDepositRefund (CLAUDE.md 7.3.3-fix) when the
// webhook reports a PaymentIntent id that doesn't match any
// BookingRequest -- same reasoning as
// DEPOSIT_PAYMENT_INTENT_NOT_FOUND_ERROR_MESSAGE.
export const DEPOSIT_REFUND_PAYMENT_INTENT_NOT_FOUND_ERROR_MESSAGE =
  "No booking request matches this refund.";

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
