import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEPOSIT_PAYMENT_INTENT_NOT_FOUND_ERROR_MESSAGE } from "@/domains/billing/constants";
import { confirmDepositPayment } from "@/domains/billing/services/confirmDepositPayment";
import { confirmDepositRefund } from "@/domains/billing/services/confirmDepositRefund";
import { stripe } from "@/lib/stripe";

import { POST } from "./route";

vi.mock("@/domains/billing/services/confirmDepositPayment", () => ({
  confirmDepositPayment: vi.fn(),
}));

vi.mock("@/domains/billing/services/confirmDepositRefund", () => ({
  confirmDepositRefund: vi.fn(),
}));

vi.mock("@/domains/billing/services/syncArtistConnectAccountStatus", () => ({
  syncArtistConnectAccountStatus: vi.fn(),
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
    ...overrides,
  };
}

// Route-handler unit test (56.1.3.1, 56.4.3.1): payment_intent.succeeded
// and refund event dispatch only. Signature verification is covered
// against real Stripe signing in route.stripe-integration.test.ts.
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
    vi.mocked(confirmDepositRefund).mockReset();
    vi.mocked(confirmDepositRefund).mockResolvedValue({ success: true });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("confirms a refund that refund.created reports as already succeeded", async () => {
    const response = await POST(buildSignedRequest("refund.created", refund()));

    expect(response.status).toBe(200);
    expect(confirmDepositRefund).toHaveBeenCalledWith("pi_123", "re_123");
  });

  it("does not confirm a refund that refund.created reports as pending", async () => {
    const response = await POST(
      buildSignedRequest("refund.created", refund({ status: "pending" }))
    );

    expect(response.status).toBe(200);
    expect(confirmDepositRefund).not.toHaveBeenCalled();
  });

  it("confirms a refund once refund.updated reports it succeeded", async () => {
    const response = await POST(buildSignedRequest("refund.updated", refund()));

    expect(response.status).toBe(200);
    expect(confirmDepositRefund).toHaveBeenCalledWith("pi_123", "re_123");
  });

  it("ignores a succeeded refund with no PaymentIntent", async () => {
    const response = await POST(
      buildSignedRequest("refund.created", refund({ payment_intent: null }))
    );

    expect(response.status).toBe(200);
    expect(confirmDepositRefund).not.toHaveBeenCalled();
  });

  it("returns 500 so Stripe retries when confirming the refund throws", async () => {
    vi.mocked(confirmDepositRefund).mockRejectedValue(new Error("db down"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await POST(buildSignedRequest("refund.created", refund()));

    expect(response.status).toBe(500);
  });
});
