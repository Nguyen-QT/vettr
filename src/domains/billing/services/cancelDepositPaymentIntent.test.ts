import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { cancelDepositPaymentIntent } from "./cancelDepositPaymentIntent";

const cancelPaymentIntentMock = vi.fn();

// vi.mock calls are hoisted above imports by vitest's transform, so
// this replaces the real Stripe client before cancelDepositPaymentIntent
// above ever sees it.
vi.mock("@/lib/stripe", () => ({
  stripe: {
    paymentIntents: {
      cancel: (...args: unknown[]) => cancelPaymentIntentMock(...args),
    },
  },
}));

// Unit test (architecture.md §7): cancelDepositPaymentIntent touches no
// Prisma at all -- only the Stripe client, mocked at its boundary.
describe("cancelDepositPaymentIntent", () => {
  let consoleErrorSpy: MockInstance<typeof console.error>;

  beforeEach(() => {
    cancelPaymentIntentMock.mockReset();
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("cancels the PaymentIntent with its per-PaymentIntent key and returns true", async () => {
    cancelPaymentIntentMock.mockResolvedValue({ id: "pi_123", status: "canceled" });

    const result = await cancelDepositPaymentIntent("pi_123");

    expect(result).toBe(true);
    expect(cancelPaymentIntentMock).toHaveBeenCalledWith(
      "pi_123",
      {},
      { idempotencyKey: "deposit-intent-cancel:pi_123" }
    );
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("returns false and logs ids only when Stripe refuses the cancel", async () => {
    // e.g. a PaymentIntent that is already processing or has succeeded.
    cancelPaymentIntentMock.mockRejectedValue(
      new Error("This PaymentIntent's status is succeeded and cannot be canceled.")
    );

    const result = await cancelDepositPaymentIntent("pi_123");

    expect(result).toBe(false);
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith({
      operation: "cancelDepositPaymentIntent",
      reason: "stripe_cancel_failed",
      severity: "warning",
      paymentIntentId: "pi_123",
    });
  });
});
