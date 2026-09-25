import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/prisma";

import type { RequestStatus } from "@/domains/booking/types";

import { createDepositPaymentIntent } from "./createDepositPaymentIntent";

const createPaymentIntentMock = vi.fn();

// vi.mock calls are hoisted above imports by vitest's transform, so
// this replaces the real Stripe client before createDepositPaymentIntent
// above ever sees it.
vi.mock("@/lib/stripe", () => ({
  stripe: {
    paymentIntents: {
      create: (...args: unknown[]) => createPaymentIntentMock(...args),
    },
  },
}));

// Hits the real local Postgres database for everything except the
// Stripe API call itself, which is mocked above -- same split as the
// rest of this suite's DB-backed tests, just with one external call
// stubbed out.
describe("createDepositPaymentIntent", () => {
  let artistId: string;
  let clientId: string;

  beforeEach(async () => {
    createPaymentIntentMock.mockReset();
    artistId = randomUUID();
    clientId = randomUUID();
    await prisma.artist.create({
      data: {
        id: artistId,
        name: "Deposit Payment Test Artist",
        instagramHandle: `test_artist_${artistId.slice(0, 8)}`,
        email: `${artistId}@example.com`,
      },
    });
    await prisma.clientProfile.create({
      data: {
        id: clientId,
        instagramHandle: `test_client_${clientId.slice(0, 8)}`,
        email: `test_client_${clientId.slice(0, 8)}@example.com`,
      },
    });
  });

  afterEach(async () => {
    await prisma.bookingRequest.deleteMany({ where: { artistId } });
    await prisma.artistDepositSetting.deleteMany({ where: { artistId } });
    await prisma.clientProfile.delete({ where: { id: clientId } });
    await prisma.artist.delete({ where: { id: artistId } });
  });

  async function createRequest(
    status: RequestStatus,
    overrides: { depositPaid?: boolean; estimatedPrice?: number } = {}
  ) {
    return prisma.bookingRequest.create({
      data: {
        clientId,
        artistId,
        tier: "TIER_2",
        minPrice: 100,
        maxPrice: 200,
        status,
        depositPaid: overrides.depositPaid ?? false,
        estimatedPrice: overrides.estimatedPrice,
      },
    });
  }

  async function flagClient() {
    await prisma.clientProfile.update({
      where: { id: clientId },
      data: { enforcePrecharge: true },
    });
  }

  it("creates a PaymentIntent and snapshots the amount/id when everything is valid", async () => {
    await prisma.artistDepositSetting.create({
      data: { artistId, tier: "TIER_2", depositAmount: 20 },
    });
    const request = await createRequest("APPROVED");
    createPaymentIntentMock.mockResolvedValue({
      id: "pi_123",
      client_secret: "secret_123",
    });

    const result = await createDepositPaymentIntent({
      bookingRequestId: request.id,
      clientProfileId: clientId,
    });

    expect(result).toEqual({ success: true, clientSecret: "secret_123" });
    expect(createPaymentIntentMock).toHaveBeenCalledWith(
      {
        amount: 2000,
        currency: "gbp",
        metadata: { bookingRequestId: request.id },
        automatic_payment_methods: { enabled: true, allow_redirects: "never" },
      },
      { idempotencyKey: `deposit-intent:${request.id}` }
    );

    const updated = await prisma.bookingRequest.findUnique({
      where: { id: request.id },
    });
    expect(updated?.stripePaymentIntentId).toBe("pi_123");
    expect(Number(updated?.depositAmount)).toBe(20);
  });

  it("rejects a request that does not belong to the client", async () => {
    await prisma.artistDepositSetting.create({
      data: { artistId, tier: "TIER_2", depositAmount: 20 },
    });
    const request = await createRequest("APPROVED");

    const result = await createDepositPaymentIntent({
      bookingRequestId: request.id,
      clientProfileId: randomUUID(),
    });

    expect(result.success).toBe(false);
    expect(createPaymentIntentMock).not.toHaveBeenCalled();
  });

  it("rejects a request that is not APPROVED", async () => {
    await prisma.artistDepositSetting.create({
      data: { artistId, tier: "TIER_2", depositAmount: 20 },
    });
    const request = await createRequest("PENDING");

    const result = await createDepositPaymentIntent({
      bookingRequestId: request.id,
      clientProfileId: clientId,
    });

    expect(result.success).toBe(false);
    expect(createPaymentIntentMock).not.toHaveBeenCalled();
  });

  it("rejects a request whose deposit is already paid", async () => {
    await prisma.artistDepositSetting.create({
      data: { artistId, tier: "TIER_2", depositAmount: 20 },
    });
    const request = await createRequest("APPROVED", { depositPaid: true });

    const result = await createDepositPaymentIntent({
      bookingRequestId: request.id,
      clientProfileId: clientId,
    });

    expect(result.success).toBe(false);
    expect(createPaymentIntentMock).not.toHaveBeenCalled();
  });

  it("rejects when the artist has not configured a deposit for the tier", async () => {
    const request = await createRequest("APPROVED");

    const result = await createDepositPaymentIntent({
      bookingRequestId: request.id,
      clientProfileId: clientId,
    });

    expect(result.success).toBe(false);
    expect(createPaymentIntentMock).not.toHaveBeenCalled();
  });

  it("applies a 50% precharge for a flagged client even with no configured deposit", async () => {
    await flagClient();
    const request = await createRequest("APPROVED", { estimatedPrice: 200 });
    createPaymentIntentMock.mockResolvedValue({
      id: "pi_precharge_1",
      client_secret: "secret_precharge_1",
    });

    const result = await createDepositPaymentIntent({
      bookingRequestId: request.id,
      clientProfileId: clientId,
    });

    expect(result).toEqual({ success: true, clientSecret: "secret_precharge_1" });
    expect(createPaymentIntentMock).toHaveBeenCalledWith(
      {
        amount: 10_000, // 50% of £200 = £100
        currency: "gbp",
        metadata: { bookingRequestId: request.id },
        automatic_payment_methods: { enabled: true, allow_redirects: "never" },
      },
      { idempotencyKey: `deposit-intent:${request.id}` }
    );
  });

  it("uses the precharge amount when it exceeds the artist's configured deposit", async () => {
    await prisma.artistDepositSetting.create({
      data: { artistId, tier: "TIER_2", depositAmount: 20 },
    });
    await flagClient();
    const request = await createRequest("APPROVED", { estimatedPrice: 200 });
    createPaymentIntentMock.mockResolvedValue({
      id: "pi_precharge_2",
      client_secret: "secret_precharge_2",
    });

    await createDepositPaymentIntent({
      bookingRequestId: request.id,
      clientProfileId: clientId,
    });

    expect(createPaymentIntentMock).toHaveBeenCalledWith(
      {
        amount: 10_000, // 50% of £200 = £100, greater than the configured £20
        currency: "gbp",
        metadata: { bookingRequestId: request.id },
        automatic_payment_methods: { enabled: true, allow_redirects: "never" },
      },
      { idempotencyKey: `deposit-intent:${request.id}` }
    );
  });

  it("keeps the artist's configured deposit when it exceeds the precharge amount", async () => {
    await prisma.artistDepositSetting.create({
      data: { artistId, tier: "TIER_2", depositAmount: 90 },
    });
    await flagClient();
    const request = await createRequest("APPROVED", { estimatedPrice: 100 });
    createPaymentIntentMock.mockResolvedValue({
      id: "pi_precharge_3",
      client_secret: "secret_precharge_3",
    });

    await createDepositPaymentIntent({
      bookingRequestId: request.id,
      clientProfileId: clientId,
    });

    expect(createPaymentIntentMock).toHaveBeenCalledWith(
      {
        amount: 9_000, // configured £90, greater than 50% of £100 = £50
        currency: "gbp",
        metadata: { bookingRequestId: request.id },
        automatic_payment_methods: { enabled: true, allow_redirects: "never" },
      },
      { idempotencyKey: `deposit-intent:${request.id}` }
    );
  });

  it("routes the deposit to the artist's connected account once charges are enabled", async () => {
    await prisma.artistDepositSetting.create({
      data: { artistId, tier: "TIER_2", depositAmount: 20 },
    });
    await prisma.artist.update({
      where: { id: artistId },
      data: {
        stripeConnectAccountId: "acct_connected",
        stripeConnectChargesEnabled: true,
      },
    });
    const request = await createRequest("APPROVED");
    createPaymentIntentMock.mockResolvedValue({
      id: "pi_connect_1",
      client_secret: "secret_connect_1",
    });

    await createDepositPaymentIntent({
      bookingRequestId: request.id,
      clientProfileId: clientId,
    });

    expect(createPaymentIntentMock).toHaveBeenCalledWith(
      {
        amount: 2000,
        currency: "gbp",
        metadata: { bookingRequestId: request.id },
        automatic_payment_methods: { enabled: true, allow_redirects: "never" },
        on_behalf_of: "acct_connected",
        transfer_data: { destination: "acct_connected" },
      },
      { idempotencyKey: `deposit-intent:${request.id}` }
    );
  });

  it("stays platform-only for a connected account that isn't charges-enabled yet", async () => {
    await prisma.artistDepositSetting.create({
      data: { artistId, tier: "TIER_2", depositAmount: 20 },
    });
    await prisma.artist.update({
      where: { id: artistId },
      data: {
        stripeConnectAccountId: "acct_pending",
        stripeConnectChargesEnabled: false,
      },
    });
    const request = await createRequest("APPROVED");
    createPaymentIntentMock.mockResolvedValue({
      id: "pi_connect_2",
      client_secret: "secret_connect_2",
    });

    await createDepositPaymentIntent({
      bookingRequestId: request.id,
      clientProfileId: clientId,
    });

    expect(createPaymentIntentMock).toHaveBeenCalledWith(
      {
        amount: 2000,
        currency: "gbp",
        metadata: { bookingRequestId: request.id },
        automatic_payment_methods: { enabled: true, allow_redirects: "never" },
      },
      { idempotencyKey: `deposit-intent:${request.id}` }
    );
  });

  it("does not apply precharge for an unflagged client even with a high estimate", async () => {
    await prisma.artistDepositSetting.create({
      data: { artistId, tier: "TIER_2", depositAmount: 20 },
    });
    const request = await createRequest("APPROVED", { estimatedPrice: 500 });
    createPaymentIntentMock.mockResolvedValue({
      id: "pi_precharge_4",
      client_secret: "secret_precharge_4",
    });

    await createDepositPaymentIntent({
      bookingRequestId: request.id,
      clientProfileId: clientId,
    });

    expect(createPaymentIntentMock).toHaveBeenCalledWith(
      {
        amount: 2_000, // stays at the configured £20, precharge never applies
        currency: "gbp",
        metadata: { bookingRequestId: request.id },
        automatic_payment_methods: { enabled: true, allow_redirects: "never" },
      },
      { idempotencyKey: `deposit-intent:${request.id}` }
    );
  });
});
