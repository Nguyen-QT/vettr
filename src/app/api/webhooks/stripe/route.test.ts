import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEPOSIT_PAYMENT_INTENT_NOT_FOUND_ERROR_MESSAGE } from "@/domains/billing/constants";
import { confirmDepositPayment } from "@/domains/billing/services/confirmDepositPayment";
import { syncDepositRefundStatus } from "@/domains/billing/services/syncDepositRefundStatus";
import { stripe } from "@/lib/stripe";

import { POST } from "./route";

vi.mock("@/domains/billing/services/confirmDepositPayment", () => ({
  confirmDepositPayment: vi.fn(),
}));

vi.mock("@/domains/billing/services/syncDepositRefundStatus", () => ({
  syncDepositRefundStatus: vi.fn(),
}));

const WEBHOOK_SECRET = "whsec_unit_test";

// Signs with the real `generateTestHeaderString` -- pure HMAC, no network
// call -- so the route's own `constructEvent` check runs unmocked and only
// the billing services behind it are stubbed.
function buildSignedRequest(type: string, object: Record<string, unknown>): NextRequest {
  const payload = JSON.stringify({
    id: "evt_unit_test",
    object: "event",
    type,
    data: { object },
  });
  const signature = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: WEBHOOK_SECRET,
  });
  return new NextRequest("http://localhost/api/webhooks/stripe", {
    method: "POST",
    headers: { "stripe-signature": signature },
    body: payload,
  });
}

function paymentIntent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "pi_123",
    object: "payment_intent",
    metadata: { bookingRequestId: "request-1" },
    ...overrides,
  };
}

function refund(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "re_123",
    object: "refund",
    status: "succeeded",
    payment_intent: "pi_123",
    metadata: { bookingRequestId: "request-1" },
    ...overrides,
  };
}

// Route-handler unit test (56.1.3.1, 56.4.3.1, 56.6.3.1, 53.2.3.1):
// payment_intent.succeeded and refund event dispatch, plus account.updated
// no longer being handled here. Signature verification is covered against
// real Stripe signing in route.stripe-integration.test.ts.
describe("POST /api/webhooks/stripe -- payment_intent.succeeded", () => {
  beforeEach(() => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", WEBHOOK_SECRET);
    vi.mocked(confirmDepositPayment).mockReset();
    vi.mocked(confirmDepositPayment).mockResolvedValue({ success: true });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("confirms the PaymentIntent and passes its metadata.bookingRequestId", async () => {
    const response = await POST(buildSignedRequest("payment_intent.succeeded", paymentIntent()));

    expect(response.status).toBe(200);
    expect(confirmDepositPayment).toHaveBeenCalledTimes(1);
    expect(confirmDepositPayment).toHaveBeenCalledWith("pi_123", "request-1");
  });

  it.each([
    ["metadata without a bookingRequestId", { metadata: {} }],
    ["no metadata at all", { metadata: undefined }],
  ])("confirms the PaymentIntent with no booking id when it has %s", async (_, overrides) => {
    const response = await POST(
      buildSignedRequest("payment_intent.succeeded", paymentIntent(overrides))
    );

    expect(response.status).toBe(200);
    expect(confirmDepositPayment).toHaveBeenCalledWith("pi_123", undefined);
  });

  it("still answers 200 when no booking matches, since a retry can't create a match", async () => {
    vi.mocked(confirmDepositPayment).mockResolvedValue({
      success: false,
      error: DEPOSIT_PAYMENT_INTENT_NOT_FOUND_ERROR_MESSAGE,
    });

    const response = await POST(buildSignedRequest("payment_intent.succeeded", paymentIntent()));

    expect(response.status).toBe(200);
  });

  it("returns 500 so Stripe retries when confirming the payment throws", async () => {
    vi.mocked(confirmDepositPayment).mockRejectedValue(new Error("db down"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await POST(buildSignedRequest("payment_intent.succeeded", paymentIntent()));

    expect(response.status).toBe(500);
  });
});

describe("POST /api/webhooks/stripe -- refund events", () => {
  beforeEach(() => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", WEBHOOK_SECRET);
    vi.mocked(syncDepositRefundStatus).mockReset();
    vi.mocked(syncDepositRefundStatus).mockResolvedValue(true);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it.each(["refund.created", "refund.updated", "refund.failed"])(
    "sends %s to syncDepositRefundStatus with the refund's own fields",
    async (type) => {
      const response = await POST(buildSignedRequest(type, refund()));

      expect(response.status).toBe(200);
      expect(syncDepositRefundStatus).toHaveBeenCalledTimes(1);
      expect(syncDepositRefundStatus).toHaveBeenCalledWith({
        stripeRefundId: "re_123",
        stripePaymentIntentId: "pi_123",
        metadataBookingRequestId: "request-1",
        stripeStatus: "succeeded",
        failureReason: undefined,
      });
    }
  );

  it.each([
    { status: "pending", failure_reason: undefined },
    { status: "requires_action", failure_reason: undefined },
    { status: "succeeded", failure_reason: undefined },
    { status: "failed", failure_reason: "expired_or_canceled_card" },
    { status: "canceled", failure_reason: undefined },
    { status: null, failure_reason: undefined },
    { status: "some_future_status", failure_reason: undefined },
  ])(
    "passes Stripe's $status status and failure reason through unmapped",
    async ({ status, failure_reason }) => {
      const response = await POST(
        buildSignedRequest("refund.updated", refund({ status, failure_reason }))
      );

      expect(response.status).toBe(200);
      expect(syncDepositRefundStatus).toHaveBeenCalledWith(
        expect.objectContaining({ stripeStatus: status, failureReason: failure_reason })
      );
    }
  );

  it.each([
    ["metadata without a bookingRequestId", { metadata: {} }],
    ["null metadata", { metadata: null }],
  ])("passes no booking id for a refund with %s", async (_, overrides) => {
    const response = await POST(buildSignedRequest("refund.created", refund(overrides)));

    expect(response.status).toBe(200);
    expect(syncDepositRefundStatus).toHaveBeenCalledWith(
      expect.objectContaining({ metadataBookingRequestId: undefined })
    );
  });

  it("still sends a refund with no PaymentIntent, so its stored refund id can match", async () => {
    const response = await POST(
      buildSignedRequest("refund.created", refund({ payment_intent: null }))
    );

    expect(response.status).toBe(200);
    expect(syncDepositRefundStatus).toHaveBeenCalledWith(
      expect.objectContaining({ stripeRefundId: "re_123", stripePaymentIntentId: null })
    );
  });

  it("still answers 200 when nothing is written, since a retry can't change the outcome", async () => {
    vi.mocked(syncDepositRefundStatus).mockResolvedValue(false);

    const response = await POST(buildSignedRequest("refund.failed", refund()));

    expect(response.status).toBe(200);
  });

  it("returns 500 so Stripe retries when syncing the refund throws", async () => {
    vi.mocked(syncDepositRefundStatus).mockRejectedValue(new Error("db down"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await POST(buildSignedRequest("refund.created", refund()));

    expect(response.status).toBe(500);
  });
});

// A connected account's account.updated belongs to connect/route.ts
// (53.2.3.1). Deployed, the only one this endpoint can receive is the
// platform account's own, which matches no artist; locally, `stripe
// listen` without --forward-connect-to sends artists' here too. Either
// way it's acknowledged and dropped.
describe("POST /api/webhooks/stripe -- account.updated", () => {
  beforeEach(() => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", WEBHOOK_SECRET);
    vi.mocked(confirmDepositPayment).mockReset();
    vi.mocked(syncDepositRefundStatus).mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("answers 200 without calling any billing service", async () => {
    const response = await POST(
      buildSignedRequest("account.updated", {
        id: "acct_123",
        object: "account",
        charges_enabled: true,
        payouts_enabled: true,
      })
    );

    expect(response.status).toBe(200);
    expect(confirmDepositPayment).not.toHaveBeenCalled();
    expect(syncDepositRefundStatus).not.toHaveBeenCalled();
  });
});
