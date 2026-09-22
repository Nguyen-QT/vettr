// Placeholder bound -- tune to the actual minimum deposit an artist may
// require. Kept above zero so an artist can't accidentally configure a
// "free" deposit that would always trivially satisfy depositPaid.
export const MIN_DEPOSIT_AMOUNT = 1;

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
