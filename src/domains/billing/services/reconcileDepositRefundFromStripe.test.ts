import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { reconcileDepositRefundFromStripe } from "./reconcileDepositRefundFromStripe";
import { syncDepositRefundStatus } from "./syncDepositRefundStatus";

const listRefundsMock = vi.fn();

// vi.mock calls are hoisted above imports by vitest's transform, so
// this replaces the real Stripe client before
// reconcileDepositRefundFromStripe above ever sees it.
vi.mock("@/lib/stripe", () => ({
  stripe: {
    refunds: {
      list: (...args: unknown[]) => listRefundsMock(...args),
    },
  },
}));
vi.mock("./syncDepositRefundStatus", () => ({
  syncDepositRefundStatus: vi.fn(),
}));

// The fields reconcileDepositRefundFromStripe reads from a listed refund.
interface ListedRefund {
  id: string;
  status: string | null;
  failure_reason?: string;
  metadata: Record<string, string> | null;
}

// Stands in for stripe-node's auto-paginating list, which yields every
// page's refunds in turn. failAfter makes it throw once those are
// yielded, the way a later page's request would.
async function* refundPages(refunds: readonly ListedRefund[], failAfter = false) {
  yield* refunds;
  if (failAfter) {
    throw new Error("Stripe list request failed");
  }
}

// Unit test (architecture.md §7): reconcileDepositRefundFromStripe touches
// no Prisma of its own -- Stripe and the status sync are mocked at their
// boundaries. The real list call is proven in
// depositRefundLifecycle.stripe-integration.test.ts.
describe("reconcileDepositRefundFromStripe", () => {
  const bookingRequestId = "request-1";
  const stripePaymentIntentId = "pi_123";
  let consoleErrorSpy: MockInstance<typeof console.error>;

  function refund(overrides: Partial<ListedRefund> = {}): ListedRefund {
    return {
      id: "re_match",
      status: "succeeded",
      metadata: { bookingRequestId },
      ...overrides,
    };
  }

  const dashboardRefund = refund({ id: "re_dashboard", metadata: null });
  const otherBookingRefund = refund({
    id: "re_other",
    metadata: { bookingRequestId: "request-2" },
  });

  beforeEach(() => {
    listRefundsMock.mockReset();
    vi.mocked(syncDepositRefundStatus).mockReset().mockResolvedValue(true);
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("lists the PaymentIntent's refunds, 100 a page", async () => {
    listRefundsMock.mockReturnValue(refundPages([]));

    await reconcileDepositRefundFromStripe(bookingRequestId, stripePaymentIntentId);

    expect(listRefundsMock).toHaveBeenCalledTimes(1);
    expect(listRefundsMock).toHaveBeenCalledWith({
      payment_intent: stripePaymentIntentId,
      limit: 100,
    });
  });

  it.each([
    { stripeStatus: "succeeded", failureReason: undefined },
    { stripeStatus: "pending", failureReason: undefined },
    { stripeStatus: "failed", failureReason: "expired_or_canceled_card" },
    { stripeStatus: null, failureReason: undefined },
  ])(
    "syncs the refund that names this booking with Stripe's $stripeStatus status and failure reason unmapped",
    async ({ stripeStatus, failureReason }) => {
      listRefundsMock.mockReturnValue(
        refundPages([
          dashboardRefund,
          otherBookingRefund,
          refund({ status: stripeStatus, failure_reason: failureReason }),
        ])
      );

      const outcome = await reconcileDepositRefundFromStripe(
        bookingRequestId,
        stripePaymentIntentId
      );

      expect(outcome).toBe("RECONCILED");
      expect(syncDepositRefundStatus).toHaveBeenCalledTimes(1);
      expect(syncDepositRefundStatus).toHaveBeenCalledWith({
        stripeRefundId: "re_match",
        stripePaymentIntentId,
        metadataBookingRequestId: bookingRequestId,
        stripeStatus,
        failureReason,
      });
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    }
  );

  it("reports RECONCILED when the sync writes nothing, because the refund exists", async () => {
    listRefundsMock.mockReturnValue(refundPages([refund()]));
    vi.mocked(syncDepositRefundStatus).mockResolvedValue(false);

    const outcome = await reconcileDepositRefundFromStripe(bookingRequestId, stripePaymentIntentId);

    expect(outcome).toBe("RECONCILED");
  });

  it("syncs only the first (newest) refund that names this booking", async () => {
    listRefundsMock.mockReturnValue(
      refundPages([refund({ id: "re_newest" }), refund({ id: "re_older" })])
    );

    await reconcileDepositRefundFromStripe(bookingRequestId, stripePaymentIntentId);

    expect(syncDepositRefundStatus).toHaveBeenCalledTimes(1);
    expect(syncDepositRefundStatus).toHaveBeenCalledWith(
      expect.objectContaining({ stripeRefundId: "re_newest" })
    );
  });

  it.each([
    { case: "no refunds", refunds: [] },
    { case: "only a Dashboard refund with no metadata", refunds: [dashboardRefund] },
    {
      case: "only a refund with no bookingRequestId in its metadata",
      refunds: [refund({ metadata: {} })],
    },
    { case: "only another booking's refund", refunds: [otherBookingRefund] },
  ])("reports NO_REFUND for $case, syncing and logging nothing", async ({ refunds }) => {
    listRefundsMock.mockReturnValue(refundPages(refunds));

    const outcome = await reconcileDepositRefundFromStripe(bookingRequestId, stripePaymentIntentId);

    expect(outcome).toBe("NO_REFUND");
    expect(syncDepositRefundStatus).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it.each([
    { case: "the first page", refunds: [] },
    { case: "a later page, before any match", refunds: [dashboardRefund, otherBookingRefund] },
  ])(
    "reports LIST_FAILED and logs ids only when $case fails, syncing nothing",
    async ({ refunds }) => {
      listRefundsMock.mockReturnValue(refundPages(refunds, true));

      const outcome = await reconcileDepositRefundFromStripe(
        bookingRequestId,
        stripePaymentIntentId
      );

      expect(outcome).toBe("LIST_FAILED");
      expect(syncDepositRefundStatus).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith({
        operation: "reconcileDepositRefundFromStripe",
        reason: "stripe_list_failed",
        severity: "warning",
        bookingRequestId,
        paymentIntentId: stripePaymentIntentId,
      });
    }
  );

  it("lets a database error from the sync reach the caller, without logging a list failure", async () => {
    listRefundsMock.mockReturnValue(refundPages([refund()]));
    vi.mocked(syncDepositRefundStatus).mockRejectedValue(new Error("db down"));

    await expect(
      reconcileDepositRefundFromStripe(bookingRequestId, stripePaymentIntentId)
    ).rejects.toThrow("db down");
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });
});
