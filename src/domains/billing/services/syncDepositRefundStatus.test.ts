import { prismaMock } from "@/testUtils/prismaMock";

import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import type { SyncDepositRefundStatusInput } from "../types";
import { advanceDepositRefundStatus } from "./advanceDepositRefundStatus";
import { syncDepositRefundStatus } from "./syncDepositRefundStatus";

vi.mock("./advanceDepositRefundStatus", () => ({
  advanceDepositRefundStatus: vi.fn(),
}));

// Mocked-Prisma unit test (architecture.md §7): the lookup is asserted by
// shape and the status write is mocked at its boundary. Both match paths
// and the unmatched cases are proven on real rows in
// billing.integration.test.ts.
describe("syncDepositRefundStatus", () => {
  const stripeRefundId = "re_123";
  const stripePaymentIntentId = "pi_123";
  const metadataBookingRequestId = "request-metadata";
  // Deliberately different from the metadata's, so the tests can tell
  // which booking is advanced.
  const rowBookingRequestId = "request-row";
  let consoleErrorSpy: MockInstance<typeof console.error>;

  function event(
    overrides: Partial<SyncDepositRefundStatusInput> = {}
  ): SyncDepositRefundStatusInput {
    return {
      stripeRefundId,
      stripePaymentIntentId,
      metadataBookingRequestId,
      stripeStatus: "succeeded",
      ...overrides,
    };
  }

  beforeEach(() => {
    vi.mocked(advanceDepositRefundStatus).mockReset().mockResolvedValue(true);
    prismaMock.depositRefund.findFirst.mockResolvedValue({
      bookingRequestId: rowBookingRequestId,
    } as never);
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("matches the stored refund id or the metadata booking's id-less intent row for this PaymentIntent, in one read", async () => {
    await syncDepositRefundStatus(event());

    expect(prismaMock.depositRefund.findFirst).toHaveBeenCalledTimes(1);
    expect(prismaMock.depositRefund.findFirst).toHaveBeenCalledWith({
      where: {
        OR: [
          { stripeRefundId },
          {
            bookingRequestId: metadataBookingRequestId,
            stripePaymentIntentId,
            stripeRefundId: null,
          },
        ],
      },
      select: { bookingRequestId: true },
    });
  });

  it.each([
    { case: "no metadata (a Dashboard refund)", overrides: { metadataBookingRequestId: undefined } },
    { case: "empty metadata", overrides: { metadataBookingRequestId: "" } },
    { case: "no PaymentIntent", overrides: { stripePaymentIntentId: null } },
  ])("matches only the stored refund id for $case", async ({ overrides }) => {
    await syncDepositRefundStatus(event(overrides));

    expect(prismaMock.depositRefund.findFirst).toHaveBeenCalledWith({
      where: { OR: [{ stripeRefundId }] },
      select: { bookingRequestId: true },
    });
  });

  it.each([
    { stripeStatus: "pending", failureReason: undefined },
    { stripeStatus: "succeeded", failureReason: undefined },
    { stripeStatus: "failed", failureReason: "expired_or_canceled_card" },
    { stripeStatus: "canceled", failureReason: undefined },
    { stripeStatus: null, failureReason: undefined },
  ])(
    "advances the matched row's booking with Stripe's $stripeStatus status and failure reason unmapped",
    async ({ stripeStatus, failureReason }) => {
      const written = await syncDepositRefundStatus(event({ stripeStatus, failureReason }));

      expect(written).toBe(true);
      expect(advanceDepositRefundStatus).toHaveBeenCalledTimes(1);
      expect(advanceDepositRefundStatus).toHaveBeenCalledWith({
        bookingRequestId: rowBookingRequestId,
        stripeRefundId,
        stripeStatus,
        failureReason,
      });
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    }
  );

  it("reports a refused write, such as a stale status or a redelivery, without logging", async () => {
    vi.mocked(advanceDepositRefundStatus).mockResolvedValue(false);

    const written = await syncDepositRefundStatus(event());

    expect(written).toBe(false);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it.each([
    { case: "a Dashboard refund with no metadata", metadata: undefined },
    { case: "a second refund on the booking's PaymentIntent", metadata: metadataBookingRequestId },
  ])(
    "logs $case that matches no row as critical with ids only, and records nothing",
    async ({ metadata }) => {
      prismaMock.depositRefund.findFirst.mockResolvedValue(null);

      const written = await syncDepositRefundStatus(
        event({ metadataBookingRequestId: metadata, failureReason: "expired_or_canceled_card" })
      );

      expect(written).toBe(false);
      expect(advanceDepositRefundStatus).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith({
        operation: "syncDepositRefundStatus",
        reason: "refund_unmatched",
        severity: "critical",
        stripeRefundId,
        paymentIntentId: stripePaymentIntentId,
        bookingRequestId: metadata,
      });
    }
  );

  it("lets a database error from the lookup reach the caller", async () => {
    prismaMock.depositRefund.findFirst.mockRejectedValue(new Error("db down"));

    await expect(syncDepositRefundStatus(event())).rejects.toThrow("db down");
    expect(advanceDepositRefundStatus).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("lets a database error from the status write reach the caller", async () => {
    vi.mocked(advanceDepositRefundStatus).mockRejectedValue(new Error("db down"));

    await expect(syncDepositRefundStatus(event())).rejects.toThrow("db down");
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });
});
