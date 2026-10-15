import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { syncArtistConnectAccountStatus } from "@/domains/billing/services/syncArtistConnectAccountStatus";
import { stripe } from "@/lib/stripe";

import { POST } from "./route";

vi.mock("@/domains/billing/services/syncArtistConnectAccountStatus", () => ({
  syncArtistConnectAccountStatus: vi.fn(),
}));

const CONNECT_WEBHOOK_SECRET = "whsec_connect_unit_test";
const PLATFORM_WEBHOOK_SECRET = "whsec_platform_unit_test";

function buildPayload(type: string, object: Record<string, unknown>): string {
  return JSON.stringify({
    id: "evt_unit_test",
    object: "event",
    type,
    account: "acct_123",
    data: { object },
  });
}

function sign(payload: string, secret: string = CONNECT_WEBHOOK_SECRET): string {
  return stripe.webhooks.generateTestHeaderString({ payload, secret });
}

function buildRequest(payload: string, signature: string | null): NextRequest {
  const headers = new Headers();
  if (signature !== null) {
    headers.set("stripe-signature", signature);
  }
  return new NextRequest("http://localhost/api/webhooks/stripe/connect", {
    method: "POST",
    headers,
    body: payload,
  });
}

function account(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "acct_123",
    object: "account",
    charges_enabled: true,
    payouts_enabled: true,
    ...overrides,
  };
}

// Route-handler unit test (53.2.3.1). Signs with the real
// `generateTestHeaderString` -- pure HMAC, no network call -- so the
// route's own `constructEvent` check runs unmocked, including the case
// that matters most here: an event signed with the platform endpoint's
// secret must not be accepted on the Connect endpoint.
describe("POST /api/webhooks/stripe/connect", () => {
  beforeEach(() => {
    vi.stubEnv("STRIPE_CONNECT_WEBHOOK_SECRET", CONNECT_WEBHOOK_SECRET);
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", PLATFORM_WEBHOOK_SECRET);
    vi.mocked(syncArtistConnectAccountStatus).mockReset();
    vi.mocked(syncArtistConnectAccountStatus).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it.each([
    { charges_enabled: true, payouts_enabled: true },
    { charges_enabled: false, payouts_enabled: false },
    { charges_enabled: true, payouts_enabled: false },
  ])(
    "syncs account.updated with charges $charges_enabled and payouts $payouts_enabled",
    async (flags) => {
      const payload = buildPayload("account.updated", account(flags));

      const response = await POST(buildRequest(payload, sign(payload)));

      expect(response.status).toBe(200);
      expect(syncArtistConnectAccountStatus).toHaveBeenCalledTimes(1);
      expect(syncArtistConnectAccountStatus).toHaveBeenCalledWith(
        "acct_123",
        flags.charges_enabled,
        flags.payouts_enabled
      );
    }
  );

  it("answers 200 to another event type without syncing anything", async () => {
    const payload = buildPayload("capability.updated", {
      id: "card_payments",
      object: "capability",
      account: "acct_123",
      status: "active",
    });

    const response = await POST(buildRequest(payload, sign(payload)));

    expect(response.status).toBe(200);
    expect(syncArtistConnectAccountStatus).not.toHaveBeenCalled();
  });

  it("returns 500 so Stripe retries when syncing the account throws", async () => {
    vi.mocked(syncArtistConnectAccountStatus).mockRejectedValue(new Error("db down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const payload = buildPayload("account.updated", account());

    const response = await POST(buildRequest(payload, sign(payload)));

    expect(response.status).toBe(500);
  });

  it("rejects an event signed with the platform endpoint's secret", async () => {
    const payload = buildPayload("account.updated", account());

    const response = await POST(buildRequest(payload, sign(payload, PLATFORM_WEBHOOK_SECRET)));

    expect(response.status).toBe(400);
    expect(syncArtistConnectAccountStatus).not.toHaveBeenCalled();
  });

  it("rejects a tampered payload whose signature no longer matches", async () => {
    const payload = buildPayload("account.updated", account({ charges_enabled: false }));
    const signature = sign(payload);
    const tamperedPayload = payload.replace('"charges_enabled":false', '"charges_enabled":true');
    expect(tamperedPayload).not.toBe(payload);

    const response = await POST(buildRequest(tamperedPayload, signature));

    expect(response.status).toBe(400);
    expect(syncArtistConnectAccountStatus).not.toHaveBeenCalled();
  });

  it("rejects a request with no signature header", async () => {
    const payload = buildPayload("account.updated", account());

    const response = await POST(buildRequest(payload, null));

    expect(response.status).toBe(400);
    expect(syncArtistConnectAccountStatus).not.toHaveBeenCalled();
  });

  it("rejects even a correctly signed event when its secret isn't configured", async () => {
    vi.stubEnv("STRIPE_CONNECT_WEBHOOK_SECRET", undefined);
    const payload = buildPayload("account.updated", account());

    const response = await POST(buildRequest(payload, sign(payload)));

    expect(response.status).toBe(400);
    expect(syncArtistConnectAccountStatus).not.toHaveBeenCalled();
  });
});
