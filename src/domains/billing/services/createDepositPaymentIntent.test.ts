import { prismaMock } from "@/testUtils/prismaMock";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { getBookingRequestForDeposit } from "@/domains/booking/services/getBookingRequestForDeposit";
import { recordDepositPaymentIntent } from "@/domains/booking/services/recordDepositPaymentIntent";
import type { BookingRequestDepositView } from "@/domains/booking/types";

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
vi.mock("@/domains/booking/services/getBookingRequestForDeposit", () => ({
  getBookingRequestForDeposit: vi.fn(),
}));
vi.mock("@/domains/booking/services/recordDepositPaymentIntent", () => ({
  recordDepositPaymentIntent: vi.fn(),
}));

// Mocked-Prisma unit test (architecture.md §7): Stripe and booking's
// deposit read/write are mocked at their boundaries; billing's own
// ArtistDepositSetting (via the real sibling getArtistDepositSettings)
// and Artist Connect lookups go through prismaMock.
describe("createDepositPaymentIntent", () => {
  const artistId = "artist-1";
  const clientId = "client-1";
  const bookingRequestId = "request-1";
  const input = { bookingRequestId, clientProfileId: clientId };

  function depositView(
    overrides: Partial<BookingRequestDepositView> = {}
  ): BookingRequestDepositView {
    return {
      id: bookingRequestId,
      clientId,
      artistId,
      tier: "TIER_2",
      status: "APPROVED",
      depositPaid: false,
      stripePaymentIntentId: null,
      depositRefunded: false,
      estimatedPrice: null,
      clientEnforcePrecharge: false,
      ...overrides,
    };
  }

  function configureDeposit(amount: number | null): void {
    prismaMock.artistDepositSetting.findMany.mockResolvedValue(
      amount === null
        ? []
        : ([{ artistId, tier: "TIER_2", depositAmount: amount }] as never)
    );
  }

  function configureConnect(
    stripeConnectAccountId: string | null,
    stripeConnectChargesEnabled: boolean
  ): void {
    prismaMock.artist.findUnique.mockResolvedValue({
      stripeConnectAccountId,
      stripeConnectChargesEnabled,
    } as never);
  }

  function intentParams(
    amount: number,
    extra: Record<string, unknown> = {}
  ): Record<string, unknown> {
    return {
      amount,
      currency: "gbp",
      metadata: { bookingRequestId },
      automatic_payment_methods: { enabled: true, allow_redirects: "never" },
      ...extra,
    };
  }

  const idempotencyOptions = { idempotencyKey: `deposit-intent:${bookingRequestId}` };

  beforeEach(() => {
    createPaymentIntentMock.mockReset();
    vi.mocked(getBookingRequestForDeposit).mockReset();
    vi.mocked(recordDepositPaymentIntent).mockReset();
    configureConnect(null, false);
  });

  it("creates a PaymentIntent and snapshots the amount/id when everything is valid", async () => {
    vi.mocked(getBookingRequestForDeposit).mockResolvedValue(depositView());
    configureDeposit(20);
    createPaymentIntentMock.mockResolvedValue({
      id: "pi_123",
      client_secret: "secret_123",
    });

    const result = await createDepositPaymentIntent(input);

    expect(result).toEqual({ success: true, clientSecret: "secret_123" });
    expect(createPaymentIntentMock).toHaveBeenCalledWith(
      intentParams(2000),
      idempotencyOptions
    );
    expect(recordDepositPaymentIntent).toHaveBeenCalledWith(bookingRequestId, {
      depositAmount: 20,
      stripePaymentIntentId: "pi_123",
    });
  });

  it("rejects a request that does not belong to the client", async () => {
    vi.mocked(getBookingRequestForDeposit).mockResolvedValue(
      depositView({ clientId: "other-client" })
    );
    configureDeposit(20);

    const result = await createDepositPaymentIntent(input);

    expect(result.success).toBe(false);
    expect(createPaymentIntentMock).not.toHaveBeenCalled();
    expect(recordDepositPaymentIntent).not.toHaveBeenCalled();
  });

  it("rejects a request that doesn't exist", async () => {
    vi.mocked(getBookingRequestForDeposit).mockResolvedValue(null);

    const result = await createDepositPaymentIntent(input);

    expect(result.success).toBe(false);
    expect(createPaymentIntentMock).not.toHaveBeenCalled();
  });

  it("rejects a request that is not APPROVED", async () => {
    vi.mocked(getBookingRequestForDeposit).mockResolvedValue(
      depositView({ status: "PENDING" })
    );
    configureDeposit(20);

    const result = await createDepositPaymentIntent(input);

    expect(result.success).toBe(false);
    expect(createPaymentIntentMock).not.toHaveBeenCalled();
  });

  it("rejects a request whose deposit is already paid", async () => {
    vi.mocked(getBookingRequestForDeposit).mockResolvedValue(
      depositView({ depositPaid: true })
    );
    configureDeposit(20);

    const result = await createDepositPaymentIntent(input);

    expect(result.success).toBe(false);
    expect(createPaymentIntentMock).not.toHaveBeenCalled();
  });

  it("rejects when the artist has not configured a deposit for the tier", async () => {
    vi.mocked(getBookingRequestForDeposit).mockResolvedValue(depositView());
    configureDeposit(null);

    const result = await createDepositPaymentIntent(input);

    expect(result.success).toBe(false);
    expect(createPaymentIntentMock).not.toHaveBeenCalled();
  });

  it("applies a 50% precharge for a flagged client even with no configured deposit", async () => {
    vi.mocked(getBookingRequestForDeposit).mockResolvedValue(
      depositView({ clientEnforcePrecharge: true, estimatedPrice: 200 })
    );
    configureDeposit(null);
    createPaymentIntentMock.mockResolvedValue({
      id: "pi_precharge_1",
      client_secret: "secret_precharge_1",
    });

    const result = await createDepositPaymentIntent(input);

    expect(result).toEqual({ success: true, clientSecret: "secret_precharge_1" });
    // 50% of £200 = £100
    expect(createPaymentIntentMock).toHaveBeenCalledWith(
      intentParams(10_000),
      idempotencyOptions
    );
  });

  it("uses the precharge amount when it exceeds the artist's configured deposit", async () => {
    vi.mocked(getBookingRequestForDeposit).mockResolvedValue(
      depositView({ clientEnforcePrecharge: true, estimatedPrice: 200 })
    );
    configureDeposit(20);
    createPaymentIntentMock.mockResolvedValue({
      id: "pi_precharge_2",
      client_secret: "secret_precharge_2",
    });

    await createDepositPaymentIntent(input);

    // 50% of £200 = £100, greater than the configured £20
    expect(createPaymentIntentMock).toHaveBeenCalledWith(
      intentParams(10_000),
      idempotencyOptions
    );
  });

  it("keeps the artist's configured deposit when it exceeds the precharge amount", async () => {
    vi.mocked(getBookingRequestForDeposit).mockResolvedValue(
      depositView({ clientEnforcePrecharge: true, estimatedPrice: 100 })
    );
    configureDeposit(90);
    createPaymentIntentMock.mockResolvedValue({
      id: "pi_precharge_3",
      client_secret: "secret_precharge_3",
    });

    await createDepositPaymentIntent(input);

    // configured £90, greater than 50% of £100 = £50
    expect(createPaymentIntentMock).toHaveBeenCalledWith(
      intentParams(9_000),
      idempotencyOptions
    );
  });

  it("routes the deposit to the artist's connected account once charges are enabled", async () => {
    vi.mocked(getBookingRequestForDeposit).mockResolvedValue(depositView());
    configureDeposit(20);
    configureConnect("acct_connected", true);
    createPaymentIntentMock.mockResolvedValue({
      id: "pi_connect_1",
      client_secret: "secret_connect_1",
    });

    await createDepositPaymentIntent(input);

    expect(createPaymentIntentMock).toHaveBeenCalledWith(
      intentParams(2000, {
        on_behalf_of: "acct_connected",
        transfer_data: { destination: "acct_connected" },
      }),
      idempotencyOptions
    );
  });

  it("stays platform-only for a connected account that isn't charges-enabled yet", async () => {
    vi.mocked(getBookingRequestForDeposit).mockResolvedValue(depositView());
    configureDeposit(20);
    configureConnect("acct_pending", false);
    createPaymentIntentMock.mockResolvedValue({
      id: "pi_connect_2",
      client_secret: "secret_connect_2",
    });

    await createDepositPaymentIntent(input);

    expect(createPaymentIntentMock).toHaveBeenCalledWith(
      intentParams(2000),
      idempotencyOptions
    );
  });

  it("does not apply precharge for an unflagged client even with a high estimate", async () => {
    vi.mocked(getBookingRequestForDeposit).mockResolvedValue(
      depositView({ estimatedPrice: 500 })
    );
    configureDeposit(20);
    createPaymentIntentMock.mockResolvedValue({
      id: "pi_precharge_4",
      client_secret: "secret_precharge_4",
    });

    await createDepositPaymentIntent(input);

    // stays at the configured £20, precharge never applies
    expect(createPaymentIntentMock).toHaveBeenCalledWith(
      intentParams(2_000),
      idempotencyOptions
    );
  });
});
