import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

function refund(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "re_123",
    object: "refund",
    status: "succeeded",
    payment_intent: "pi_123",
    ...overrides,
  };
}

// Route-handler unit test (56.1.3.1): refund event dispatch only.
// Signature verification is covered against real Stripe signing in
// route.stripe-integration.test.ts.
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
