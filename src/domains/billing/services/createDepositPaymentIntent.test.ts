import { prismaMock } from "@/testUtils/prismaMock";

import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { getBookingRequestForDeposit } from "@/domains/booking/services/getBookingRequestForDeposit";
import { recordDepositPaymentIntent } from "@/domains/booking/services/recordDepositPaymentIntent";
import type { BookingRequestDepositView } from "@/domains/booking/types";
import { Prisma } from "@/generated/prisma/client";

import {
  DEPOSIT_PAYMENT_INIT_ERROR_MESSAGE,
  DEPOSIT_PAYMENT_PROCESSING_ERROR_MESSAGE,
} from "../constants";
import { cancelDepositPaymentIntent } from "./cancelDepositPaymentIntent";
import { createDepositPaymentIntent } from "./createDepositPaymentIntent";

const createPaymentIntentMock = vi.fn();
const retrievePaymentIntentMock = vi.fn();

// vi.mock calls are hoisted above imports by vitest's transform, so
// this replaces the real Stripe client before createDepositPaymentIntent
// above ever sees it.
vi.mock("@/lib/stripe", () => ({
  stripe: {
    paymentIntents: {
      create: (...args: unknown[]) => createPaymentIntentMock(...args),
      retrieve: (...args: unknown[]) => retrievePaymentIntentMock(...args),
    },
  },
}));
vi.mock("@/domains/booking/services/getBookingRequestForDeposit", () => ({
  getBookingRequestForDeposit: vi.fn(),
}));
vi.mock("@/domains/booking/services/recordDepositPaymentIntent", () => ({
  recordDepositPaymentIntent: vi.fn(),
}));
vi.mock("./cancelDepositPaymentIntent", () => ({
  cancelDepositPaymentIntent: vi.fn(),
}));

// Mocked-Prisma unit test (architecture.md §7): Stripe, booking's
// deposit read/write and the sibling cancelDepositPaymentIntent are
// mocked at their boundaries; billing's own ArtistDepositSetting (via the
// real sibling getArtistDepositSettings) and Artist Connect lookups go
// through prismaMock.
describe("createDepositPaymentIntent", () => {
  const artistId = "artist-1";
  const clientId = "client-1";
  const bookingRequestId = "request-1";
  const input = { bookingRequestId, clientProfileId: clientId };
  let consoleErrorSpy: MockInstance<typeof console.error>;

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

  // The booking already stores pi_old, which Stripe returns with these
  // fields (platform-only £20 unless overridden).
  function storePaymentIntent(overrides: Record<string, unknown> = {}): void {
    vi.mocked(getBookingRequestForDeposit).mockResolvedValue(
      depositView({ stripePaymentIntentId: "pi_old" })
    );
    retrievePaymentIntentMock.mockResolvedValue({
      id: "pi_old",
      status: "requires_payment_method",
      amount: 2000,
      on_behalf_of: null,
      transfer_data: null,
      client_secret: "secret_old",
      ...overrides,
    });
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

  // deposit-intent:<booking>:<replaced id | "initial">:<amount>:<routing>
  function idempotencyOptions(
    replaced: string,
    amount: number,
    routing = "platform"
  ): { idempotencyKey: string } {
    return {
      idempotencyKey: `deposit-intent:${bookingRequestId}:${replaced}:${amount}:${routing}`,
    };
  }

  beforeEach(() => {
    createPaymentIntentMock.mockReset();
    retrievePaymentIntentMock.mockReset();
    vi.mocked(getBookingRequestForDeposit).mockReset();
    vi.mocked(recordDepositPaymentIntent).mockReset();
    vi.mocked(recordDepositPaymentIntent).mockResolvedValue(true);
    vi.mocked(cancelDepositPaymentIntent).mockReset();
    vi.mocked(cancelDepositPaymentIntent).mockResolvedValue(true);
    configureConnect(null, false);
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("creates a PaymentIntent and snapshots the amount/id when none is stored", async () => {
    vi.mocked(getBookingRequestForDeposit).mockResolvedValue(depositView());
    configureDeposit(20);
    createPaymentIntentMock.mockResolvedValue({
      id: "pi_123",
      client_secret: "secret_123",
    });

    const result = await createDepositPaymentIntent(input);

    expect(result).toEqual({ success: true, clientSecret: "secret_123" });
    expect(retrievePaymentIntentMock).not.toHaveBeenCalled();
    expect(createPaymentIntentMock).toHaveBeenCalledWith(
      intentParams(2000),
      idempotencyOptions("initial", 2000)
    );
    expect(recordDepositPaymentIntent).toHaveBeenCalledWith(bookingRequestId, {
      depositAmount: 20,
      stripePaymentIntentId: "pi_123",
      replacedPaymentIntentId: null,
    });
  });

  it("returns no secret when the new PaymentIntent's write loses", async () => {
    vi.mocked(getBookingRequestForDeposit).mockResolvedValue(depositView());
    configureDeposit(20);
    createPaymentIntentMock.mockResolvedValue({
      id: "pi_123",
      client_secret: "secret_123",
    });
    vi.mocked(recordDepositPaymentIntent).mockResolvedValue(false);

    const result = await createDepositPaymentIntent(input);

    expect(result).toEqual({ success: false, error: DEPOSIT_PAYMENT_INIT_ERROR_MESSAGE });
  });

  // A create that reached Stripe but wasn't recorded leaves no stored id,
  // so the retry keys from "initial" again. A changed parameter must
  // change the key, or Stripe rejects the retry for 24h (56.5).
  it.each([
    {
      change: "amount",
      apply: (): void => configureDeposit(30),
      retryOptions: idempotencyOptions("initial", 3000),
    },
    {
      change: "routing",
      apply: (): void => configureConnect("acct_connected", true),
      retryOptions: idempotencyOptions("initial", 2000, "acct_connected"),
    },
  ])(
    "keys a retry with a changed $change apart from the unrecorded create",
    async ({ apply, retryOptions }) => {
      vi.mocked(getBookingRequestForDeposit).mockResolvedValue(depositView());
      configureDeposit(20);
      createPaymentIntentMock.mockResolvedValue({
        id: "pi_123",
        client_secret: "secret_123",
      });
      vi.mocked(recordDepositPaymentIntent).mockResolvedValue(false);

      await createDepositPaymentIntent(input);
      apply();
      await createDepositPaymentIntent(input);

      expect(createPaymentIntentMock).toHaveBeenNthCalledWith(
        1,
        expect.anything(),
        idempotencyOptions("initial", 2000)
      );
      expect(createPaymentIntentMock).toHaveBeenNthCalledWith(2, expect.anything(), retryOptions);
    }
  );

  it.each(["requires_payment_method", "requires_confirmation", "requires_action"])(
    "reuses a stored %s PaymentIntent whose amount and routing still match",
    async (status) => {
      storePaymentIntent({ status });
      configureDeposit(20);

      const result = await createDepositPaymentIntent(input);

      expect(result).toEqual({ success: true, clientSecret: "secret_old" });
      expect(retrievePaymentIntentMock).toHaveBeenCalledWith("pi_old");
      expect(cancelDepositPaymentIntent).not.toHaveBeenCalled();
      expect(createPaymentIntentMock).not.toHaveBeenCalled();
      // Re-committed through the compare-and-set before its secret is
      // handed out.
      expect(recordDepositPaymentIntent).toHaveBeenCalledWith(bookingRequestId, {
        depositAmount: 20,
        stripePaymentIntentId: "pi_old",
        replacedPaymentIntentId: "pi_old",
      });
    }
  );

  it("reuses a stored PaymentIntent whose Connect routing still matches", async () => {
    storePaymentIntent({
      on_behalf_of: "acct_connected",
      transfer_data: { destination: "acct_connected" },
    });
    configureDeposit(20);
    configureConnect("acct_connected", true);

    const result = await createDepositPaymentIntent(input);

    expect(result).toEqual({ success: true, clientSecret: "secret_old" });
    expect(cancelDepositPaymentIntent).not.toHaveBeenCalled();
    expect(createPaymentIntentMock).not.toHaveBeenCalled();
  });

  it("returns no secret for a reused PaymentIntent whose write loses", async () => {
    // e.g. the booking was cancelled after the read.
    storePaymentIntent();
    configureDeposit(20);
    vi.mocked(recordDepositPaymentIntent).mockResolvedValue(false);

    const result = await createDepositPaymentIntent(input);

    expect(result).toEqual({ success: false, error: DEPOSIT_PAYMENT_INIT_ERROR_MESSAGE });
  });

  it("cancels and replaces a stored open PaymentIntent whose amount changed", async () => {
    storePaymentIntent();
    configureDeposit(30);
    createPaymentIntentMock.mockResolvedValue({
      id: "pi_new",
      client_secret: "secret_new",
    });

    const result = await createDepositPaymentIntent(input);

    expect(result).toEqual({ success: true, clientSecret: "secret_new" });
    expect(cancelDepositPaymentIntent).toHaveBeenCalledWith("pi_old");
    expect(createPaymentIntentMock).toHaveBeenCalledWith(
      intentParams(3000),
      idempotencyOptions("pi_old", 3000)
    );
    expect(recordDepositPaymentIntent).toHaveBeenCalledWith(bookingRequestId, {
      depositAmount: 30,
      stripePaymentIntentId: "pi_new",
      replacedPaymentIntentId: "pi_old",
    });
  });

  it("cancels and replaces a stored open PaymentIntent whose routing changed", async () => {
    // Stored platform-only; the artist's account is now charges-enabled.
    storePaymentIntent();
    configureDeposit(20);
    configureConnect("acct_connected", true);
    createPaymentIntentMock.mockResolvedValue({
      id: "pi_new",
      client_secret: "secret_new",
    });

    const result = await createDepositPaymentIntent(input);

    expect(result).toEqual({ success: true, clientSecret: "secret_new" });
    expect(cancelDepositPaymentIntent).toHaveBeenCalledWith("pi_old");
    expect(createPaymentIntentMock).toHaveBeenCalledWith(
      intentParams(2000, {
        on_behalf_of: "acct_connected",
        transfer_data: { destination: "acct_connected" },
      }),
      idempotencyOptions("pi_old", 2000, "acct_connected")
    );
  });

  it("does not replace a stored PaymentIntent that Stripe refuses to cancel", async () => {
    storePaymentIntent();
    configureDeposit(30);
    vi.mocked(cancelDepositPaymentIntent).mockResolvedValue(false);

    const result = await createDepositPaymentIntent(input);

    expect(result).toEqual({ success: false, error: DEPOSIT_PAYMENT_INIT_ERROR_MESSAGE });
    expect(createPaymentIntentMock).not.toHaveBeenCalled();
    expect(recordDepositPaymentIntent).not.toHaveBeenCalled();
  });

  it.each(["processing", "succeeded", "requires_capture"])(
    "refuses while the stored PaymentIntent is %s",
    async (status) => {
      storePaymentIntent({ status });
      configureDeposit(30);

      const result = await createDepositPaymentIntent(input);

      expect(result).toEqual({
        success: false,
        error: DEPOSIT_PAYMENT_PROCESSING_ERROR_MESSAGE,
      });
      expect(cancelDepositPaymentIntent).not.toHaveBeenCalled();
      expect(createPaymentIntentMock).not.toHaveBeenCalled();
      expect(recordDepositPaymentIntent).not.toHaveBeenCalled();
    }
  );

  it("replaces a stored PaymentIntent that is already cancelled", async () => {
    storePaymentIntent({ status: "canceled" });
    configureDeposit(20);
    createPaymentIntentMock.mockResolvedValue({
      id: "pi_new",
      client_secret: "secret_new",
    });

    const result = await createDepositPaymentIntent(input);

    expect(result).toEqual({ success: true, clientSecret: "secret_new" });
    expect(cancelDepositPaymentIntent).not.toHaveBeenCalled();
    expect(createPaymentIntentMock).toHaveBeenCalledWith(
      intentParams(2000),
      idempotencyOptions("pi_old", 2000)
    );
    expect(recordDepositPaymentIntent).toHaveBeenCalledWith(bookingRequestId, {
      depositAmount: 20,
      stripePaymentIntentId: "pi_new",
      replacedPaymentIntentId: "pi_old",
    });
  });

  it("returns the generic error and logs ids only when the retrieve fails", async () => {
    storePaymentIntent();
    configureDeposit(20);
    retrievePaymentIntentMock.mockRejectedValue(new Error("Stripe is unreachable"));

    const result = await createDepositPaymentIntent(input);

    expect(result).toEqual({ success: false, error: DEPOSIT_PAYMENT_INIT_ERROR_MESSAGE });
    expect(createPaymentIntentMock).not.toHaveBeenCalled();
    expect(recordDepositPaymentIntent).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith({
      operation: "createDepositPaymentIntent",
      reason: "stripe_retrieve_failed",
      severity: "warning",
      bookingRequestId,
      paymentIntentId: "pi_old",
    });
  });

  it.each([
    {
      stored: "none stored",
      arrange: (): void => {
        vi.mocked(getBookingRequestForDeposit).mockResolvedValue(depositView());
      },
      replacedPaymentIntentId: null,
    },
    {
      stored: "a cancelled one stored",
      arrange: (): void => storePaymentIntent({ status: "canceled" }),
      replacedPaymentIntentId: "pi_old",
    },
  ])(
    "returns the generic error and logs ids only when the create fails ($stored)",
    async ({ arrange, replacedPaymentIntentId }) => {
      arrange();
      configureDeposit(20);
      createPaymentIntentMock.mockRejectedValue(new Error("Stripe is unreachable"));

      const result = await createDepositPaymentIntent(input);

      expect(result).toEqual({ success: false, error: DEPOSIT_PAYMENT_INIT_ERROR_MESSAGE });
      expect(recordDepositPaymentIntent).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith({
        operation: "createDepositPaymentIntent",
        reason: "stripe_create_failed",
        severity: "warning",
        bookingRequestId,
        replacedPaymentIntentId,
      });
    }
  );

  it.each([
    {
      error: "a Prisma error",
      // The message echoes ids, so the log assertion proves it's never logged.
      thrown: new Prisma.PrismaClientKnownRequestError(
        `Timed out writing ${bookingRequestId} / pi_123`,
        { code: "P1008", clientVersion: "test" }
      ),
      errorCode: "P1008",
    },
    {
      error: "any other error",
      thrown: new Error(`Connection lost writing ${bookingRequestId} / pi_123`),
      errorCode: undefined,
    },
  ])(
    "returns no secret and logs the Prisma code only when the write throws $error",
    async ({ thrown, errorCode }) => {
      vi.mocked(getBookingRequestForDeposit).mockResolvedValue(depositView());
      configureDeposit(20);
      createPaymentIntentMock.mockResolvedValue({
        id: "pi_123",
        client_secret: "secret_123",
      });
      vi.mocked(recordDepositPaymentIntent).mockRejectedValue(thrown);

      const result = await createDepositPaymentIntent(input);

      expect(result).toEqual({ success: false, error: DEPOSIT_PAYMENT_INIT_ERROR_MESSAGE });
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith({
        operation: "createDepositPaymentIntent",
        reason: "record_failed",
        severity: "warning",
        bookingRequestId,
        paymentIntentId: "pi_123",
        errorCode,
      });
    }
  );

  it("never replaces a stored PaymentIntent whose status it doesn't know", async () => {
    storePaymentIntent({ status: "requires_something_new" });
    configureDeposit(30);

    const result = await createDepositPaymentIntent(input);

    expect(result).toEqual({ success: false, error: DEPOSIT_PAYMENT_INIT_ERROR_MESSAGE });
    expect(cancelDepositPaymentIntent).not.toHaveBeenCalled();
    expect(createPaymentIntentMock).not.toHaveBeenCalled();
    expect(recordDepositPaymentIntent).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith({
      operation: "createDepositPaymentIntent",
      reason: "unknown_payment_intent_status",
      severity: "warning",
      bookingRequestId,
      paymentIntentId: "pi_old",
      status: "requires_something_new",
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
      idempotencyOptions("initial", 10_000)
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
      idempotencyOptions("initial", 10_000)
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
      idempotencyOptions("initial", 9_000)
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
      idempotencyOptions("initial", 2000, "acct_connected")
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
      idempotencyOptions("initial", 2000)
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
      idempotencyOptions("initial", 2_000)
    );
  });
});
