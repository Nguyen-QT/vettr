import { afterAll, afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { prisma } from "@/lib/prisma";
import {
  createBookingRequest,
  createIntegrationTracker,
  uniqueSuffix,
} from "@/testUtils/integrationDb";

import {
  CHECKOUT_ADDON_NOT_FOUND_ERROR_MESSAGE,
  CHECKOUT_REQUEST_NOT_FOUND_ERROR_MESSAGE,
  DEPOSIT_PAYMENT_INTENT_NOT_FOUND_ERROR_MESSAGE,
  DEPOSIT_REFUND_INIT_ERROR_MESSAGE,
  DEPOSIT_REFUND_NOT_PAID_ERROR_MESSAGE,
  DEPOSIT_REFUND_RETRY_ALERT_ATTEMPTS,
} from "../constants";
import type { DepositRefundStatus } from "../types";
import { addBillingAddon } from "./addBillingAddon";
import { advanceDepositRefundStatus } from "./advanceDepositRefundStatus";
import { confirmDepositPayment } from "./confirmDepositPayment";
import { getArtistDepositSettings } from "./getArtistDepositSettings";
import { getBillingAddons } from "./getBillingAddons";
import { getFinalBillTotal } from "./getFinalBillTotal";
import { getPayableDeposits } from "./getPayableDeposits";
import { recordDepositRefundIntent } from "./recordDepositRefundIntent";
import { recordDepositRefundRetry } from "./recordDepositRefundRetry";
import { refundDeposit } from "./refundDeposit";
import { removeBillingAddon } from "./removeBillingAddon";
import { setArtistDepositSettings } from "./setArtistDepositSettings";
import { syncArtistConnectAccountStatus } from "./syncArtistConnectAccountStatus";
import { syncDepositRefundStatus } from "./syncDepositRefundStatus";

// Stripe has no network access (or secrets) in the integration CI job, so the
// SDK stays mocked exactly as in the unit tier; everything else is real.
const refundsCreateMock = vi.fn();
vi.mock("@/lib/stripe", () => ({
  stripe: {
    refunds: { create: (...args: unknown[]) => refundsCreateMock(...args) },
  },
}));

// Real-database billing tests (28.3.2.5.1): the Decimal round-trips, upsert
// uniqueness, @default/@updatedAt population and webhook-lookup behaviour the
// mocked unit tier cannot prove.
const tracker = createIntegrationTracker();

async function setup(): Promise<{ artistId: string; clientId: string }> {
  const artist = await tracker.createArtist();
  const client = await tracker.createClientProfile();
  return { artistId: artist.id, clientId: client.id };
}

function paymentIntentId(): string {
  return `pi_it_${uniqueSuffix()}`;
}

describe("billing integration", () => {
  beforeEach(async () => {
    refundsCreateMock.mockReset();
    await tracker.wipe();
  });

  afterAll(async () => {
    await tracker.wipe();
    await prisma.$disconnect();
  });

  describe("setArtistDepositSettings / getArtistDepositSettings", () => {
    it("upserts one row per artist+tier, keeping the latest amount and advancing updatedAt", async () => {
      const { artistId } = await setup();

      await setArtistDepositSettings({ artistId, tier: "TIER_2", depositAmount: 30 });
      const first = await prisma.artistDepositSetting.findMany({ where: { artistId } });
      await setArtistDepositSettings({ artistId, tier: "TIER_2", depositAmount: 45.5 });
      const second = await prisma.artistDepositSetting.findMany({ where: { artistId } });

      expect(first).toHaveLength(1);
      expect(second).toHaveLength(1);
      expect(Number(second[0].depositAmount)).toBe(45.5);
      expect(second[0].updatedAt.getTime()).toBeGreaterThan(first[0].updatedAt.getTime());

      const settings = await getArtistDepositSettings(artistId);
      expect(settings.TIER_2).toBe(45.5);
    });

    it("keeps a separate row per tier", async () => {
      const { artistId } = await setup();

      await setArtistDepositSettings({ artistId, tier: "TIER_2", depositAmount: 30 });
      await setArtistDepositSettings({ artistId, tier: "TIER_3", depositAmount: 60 });

      const rows = await prisma.artistDepositSetting.findMany({ where: { artistId } });
      expect(rows).toHaveLength(2);
    });

    it("concurrent first-time writes for the same tier leave exactly one row and no rejection", async () => {
      const { artistId } = await setup();

      const results = await Promise.allSettled([
        setArtistDepositSettings({ artistId, tier: "TIER_4", depositAmount: 20 }),
        setArtistDepositSettings({ artistId, tier: "TIER_4", depositAmount: 25 }),
        setArtistDepositSettings({ artistId, tier: "TIER_4", depositAmount: 35 }),
      ]);

      expect(results.every((r) => r.status === "fulfilled")).toBe(true);
      const rows = await prisma.artistDepositSetting.findMany({ where: { artistId } });
      expect(rows).toHaveLength(1);
      expect([20, 25, 35]).toContain(Number(rows[0].depositAmount));
    });
  });

  describe("billing addons", () => {
    it("adds an addon with a Decimal price and populated createdAt, and lists in creation order", async () => {
      const { artistId, clientId } = await setup();
      const request = await createBookingRequest({
        artistId,
        clientId,
        status: "APPROVED",
      });

      await addBillingAddon({ bookingRequestId: request.id, artistId, label: "First", price: 12.34 });
      await new Promise((resolve) => setTimeout(resolve, 10));
      await addBillingAddon({ bookingRequestId: request.id, artistId, label: "Second", price: 5 });

      const rows = await prisma.addon.findMany({ where: { bookingRequestId: request.id } });
      expect(rows).toHaveLength(2);
      expect(rows.every((row) => row.createdAt instanceof Date)).toBe(true);

      const listed = await getBillingAddons(request.id, artistId);
      expect(listed.success).toBe(true);
      if (listed.success) {
        expect(listed.addons.map((a) => [a.label, a.price])).toEqual([
          ["First", 12.34],
          ["Second", 5],
        ]);
      }
    });

    it("rejects adding to a non-APPROVED request and writes nothing", async () => {
      const { artistId, clientId } = await setup();
      const request = await createBookingRequest({ artistId, clientId, status: "PENDING" });

      const result = await addBillingAddon({
        bookingRequestId: request.id,
        artistId,
        label: "Nope",
        price: 10,
      });

      expect(result.success).toBe(false);
      expect(await prisma.addon.count({ where: { bookingRequestId: request.id } })).toBe(0);
    });

    it("hides another artist's request behind the same not-found error and writes nothing", async () => {
      const { artistId, clientId } = await setup();
      const other = await tracker.createArtist();
      const request = await createBookingRequest({ artistId, clientId, status: "APPROVED" });

      const result = await addBillingAddon({
        bookingRequestId: request.id,
        artistId: other.id,
        label: "Intruder",
        price: 10,
      });

      expect(result).toEqual({
        success: false,
        error: CHECKOUT_REQUEST_NOT_FOUND_ERROR_MESSAGE,
      });
      expect(await prisma.addon.count({ where: { bookingRequestId: request.id } })).toBe(0);
    });

    it("removes only the targeted addon and leaves other requests' addons intact", async () => {
      const { artistId, clientId } = await setup();
      const a = await createBookingRequest({ artistId, clientId, status: "APPROVED" });
      const b = await createBookingRequest({ artistId, clientId, status: "APPROVED" });
      await addBillingAddon({ bookingRequestId: a.id, artistId, label: "A1", price: 10 });
      await addBillingAddon({ bookingRequestId: b.id, artistId, label: "B1", price: 20 });
      const target = await prisma.addon.findFirstOrThrow({ where: { bookingRequestId: a.id } });

      const result = await removeBillingAddon({ addonId: target.id, artistId });

      expect(result).toEqual({ success: true });
      expect(await prisma.addon.count({ where: { bookingRequestId: a.id } })).toBe(0);
      expect(await prisma.addon.count({ where: { bookingRequestId: b.id } })).toBe(1);
    });

    it("returns the generic not-found error for an unknown addon or another artist's addon", async () => {
      const { artistId, clientId } = await setup();
      const other = await tracker.createArtist();
      const request = await createBookingRequest({ artistId, clientId, status: "APPROVED" });
      await addBillingAddon({ bookingRequestId: request.id, artistId, label: "Mine", price: 10 });
      const addon = await prisma.addon.findFirstOrThrow({ where: { bookingRequestId: request.id } });

      const unknown = await removeBillingAddon({ addonId: "does-not-exist", artistId });
      const foreign = await removeBillingAddon({ addonId: addon.id, artistId: other.id });

      expect(unknown).toEqual({ success: false, error: CHECKOUT_ADDON_NOT_FOUND_ERROR_MESSAGE });
      expect(foreign).toEqual({ success: false, error: CHECKOUT_ADDON_NOT_FOUND_ERROR_MESSAGE });
      expect(await prisma.addon.count({ where: { bookingRequestId: request.id } })).toBe(1);
    });
  });

  describe("getFinalBillTotal", () => {
    it("sums estimatedPrice and addons from Decimal columns, crediting a paid deposit", async () => {
      const { artistId, clientId } = await setup();
      const request = await createBookingRequest({
        artistId,
        clientId,
        status: "APPROVED",
        estimatedPrice: 200.5,
        depositAmount: 50,
        depositPaid: true,
      });
      await addBillingAddon({ bookingRequestId: request.id, artistId, label: "A", price: 10.25 });
      await addBillingAddon({ bookingRequestId: request.id, artistId, label: "B", price: 4.75 });

      const result = await getFinalBillTotal(request.id, artistId);

      expect(result).toEqual({
        success: true,
        bill: { estimatedPrice: 200.5, addonsTotal: 15, depositCredit: 50, total: 165.5 },
      });
    });

    it("gives no deposit credit while the deposit is unpaid, and treats a null estimate as 0", async () => {
      const { artistId, clientId } = await setup();
      const request = await createBookingRequest({
        artistId,
        clientId,
        status: "APPROVED",
        depositAmount: 50,
      });

      const result = await getFinalBillTotal(request.id, artistId);

      expect(result).toEqual({
        success: true,
        bill: { estimatedPrice: 0, addonsTotal: 0, depositCredit: 0, total: 0 },
      });
    });
  });

  describe("getPayableDeposits", () => {
    it("joins per-artist/per-tier Decimal settings and omits requests without a configured tier", async () => {
      const { artistId, clientId } = await setup();
      const otherArtist = await tracker.createArtist();
      await setArtistDepositSettings({ artistId, tier: "TIER_2", depositAmount: 30.5 });
      await setArtistDepositSettings({ artistId, tier: "TIER_3", depositAmount: 60 });
      await setArtistDepositSettings({ artistId: otherArtist.id, tier: "TIER_2", depositAmount: 99 });
      const r1 = await createBookingRequest({ artistId, clientId, tier: "TIER_2" });
      const r2 = await createBookingRequest({ artistId, clientId, tier: "TIER_3" });
      const r3 = await createBookingRequest({ artistId, clientId, tier: "TIER_4" });

      const result = await getPayableDeposits([
        { id: r1.id, artistId, tier: "TIER_2" },
        { id: r2.id, artistId, tier: "TIER_3" },
        { id: r3.id, artistId, tier: "TIER_4" },
      ]);

      expect(result).toEqual({ [r1.id]: 30.5, [r2.id]: 60 });
    });
  });

  describe("webhook confirmations", () => {
    it("confirmDepositPayment flips depositPaid by PaymentIntent id, idempotently, touching nothing else", async () => {
      const { artistId, clientId } = await setup();
      const intent = paymentIntentId();
      const target = await createBookingRequest({
        artistId,
        clientId,
        status: "APPROVED",
        stripePaymentIntentId: intent,
      });
      const bystander = await createBookingRequest({
        artistId,
        clientId,
        stripePaymentIntentId: paymentIntentId(),
      });

      expect(await confirmDepositPayment(intent)).toEqual({ success: true });
      expect(await confirmDepositPayment(intent)).toEqual({ success: true });

      const rows = await prisma.bookingRequest.findMany({
        where: { id: { in: [target.id, bystander.id] } },
        select: { id: true, depositPaid: true },
      });
      expect(rows.find((r) => r.id === target.id)?.depositPaid).toBe(true);
      expect(rows.find((r) => r.id === bystander.id)?.depositPaid).toBe(false);
    });

    it("confirmDepositPayment returns the not-found error for an unknown PaymentIntent", async () => {
      const result = await confirmDepositPayment(paymentIntentId());

      expect(result).toEqual({
        success: false,
        error: DEPOSIT_PAYMENT_INTENT_NOT_FOUND_ERROR_MESSAGE,
      });
    });
  });

  describe("syncArtistConnectAccountStatus", () => {
    it("sets and flips both flags for the matching account only", async () => {
      const target = await tracker.createArtist();
      const bystander = await tracker.createArtist();
      const accountId = `acct_it_${uniqueSuffix()}`;
      await prisma.artist.update({
        where: { id: target.id },
        data: { stripeConnectAccountId: accountId },
      });
      await prisma.artist.update({
        where: { id: bystander.id },
        data: { stripeConnectAccountId: `acct_it_${uniqueSuffix()}` },
      });

      const read = () =>
        prisma.artist.findMany({
          where: { id: { in: [target.id, bystander.id] } },
          select: {
            id: true,
            stripeConnectChargesEnabled: true,
            stripeConnectPayoutsEnabled: true,
          },
        });

      await syncArtistConnectAccountStatus(accountId, true, true);
      let rows = await read();
      expect(rows.find((r) => r.id === target.id)).toMatchObject({
        stripeConnectChargesEnabled: true,
        stripeConnectPayoutsEnabled: true,
      });

      await syncArtistConnectAccountStatus(accountId, false, true);
      rows = await read();
      expect(rows.find((r) => r.id === target.id)).toMatchObject({
        stripeConnectChargesEnabled: false,
        stripeConnectPayoutsEnabled: true,
      });
      expect(rows.find((r) => r.id === bystander.id)).toMatchObject({
        stripeConnectChargesEnabled: false,
        stripeConnectPayoutsEnabled: false,
      });
    });

    it("is a no-op for an unknown account id", async () => {
      const artist = await tracker.createArtist();

      await expect(
        syncArtistConnectAccountStatus(`acct_it_${uniqueSuffix()}`, true, true)
      ).resolves.toBeUndefined();

      const row = await prisma.artist.findUniqueOrThrow({ where: { id: artist.id } });
      expect(row.stripeConnectChargesEnabled).toBe(false);
      expect(row.stripeConnectPayoutsEnabled).toBe(false);
    });
  });

  // The refund intent (56.6) on real rows: the intent insert's ON CONFLICT
  // under concurrent callers, and the DepositRefund row each path leaves.
  describe("refundDeposit", () => {
    async function createPaidRequest(): Promise<{ id: string; intent: string }> {
      const { artistId, clientId } = await setup();
      const intent = paymentIntentId();
      const request = await createBookingRequest({
        artistId,
        clientId,
        depositPaid: true,
        stripePaymentIntentId: intent,
      });
      return { id: request.id, intent };
    }

    interface RefundRow {
      status: DepositRefundStatus;
      stripePaymentIntentId: string;
      stripeRefundId: string | null;
    }

    function readRefundRows(bookingRequestId: string): Promise<RefundRow[]> {
      return prisma.depositRefund.findMany({
        where: { bookingRequestId },
        select: { status: true, stripePaymentIntentId: true, stripeRefundId: true },
      });
    }

    it("records a SUCCEEDED refund row, and a re-run makes no second Stripe call", async () => {
      const request = await createPaidRequest();
      refundsCreateMock.mockResolvedValue({ id: "re_it_1", status: "succeeded" });

      expect(await refundDeposit(request.id)).toEqual({ success: true });
      expect(await refundDeposit(request.id)).toEqual({ success: true });

      expect(refundsCreateMock).toHaveBeenCalledTimes(1);
      expect(refundsCreateMock).toHaveBeenCalledWith(
        { payment_intent: request.intent, metadata: { bookingRequestId: request.id } },
        { idempotencyKey: `deposit-refund:${request.id}` }
      );
      expect(await readRefundRows(request.id)).toEqual([
        { status: "SUCCEEDED", stripePaymentIntentId: request.intent, stripeRefundId: "re_it_1" },
      ]);
    });

    it("rejects an unpaid deposit without calling Stripe, recording an intent or changing the row", async () => {
      const { artistId, clientId } = await setup();
      const request = await createBookingRequest({ artistId, clientId });

      const result = await refundDeposit(request.id);

      expect(result).toEqual({ success: false, error: DEPOSIT_REFUND_NOT_PAID_ERROR_MESSAGE });
      expect(refundsCreateMock).not.toHaveBeenCalled();
      expect(await readRefundRows(request.id)).toEqual([]);
    });

    it("leaves a PENDING intent with no refund id when Stripe rejects, and a retry refunds through it", async () => {
      const request = await createPaidRequest();
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      refundsCreateMock.mockRejectedValueOnce(new Error("stripe down"));

      const failed = await refundDeposit(request.id);
      consoleErrorSpy.mockRestore();

      expect(failed).toEqual({ success: false, error: DEPOSIT_REFUND_INIT_ERROR_MESSAGE });
      expect(await readRefundRows(request.id)).toEqual([
        { status: "PENDING", stripePaymentIntentId: request.intent, stripeRefundId: null },
      ]);

      refundsCreateMock.mockResolvedValueOnce({ id: "re_it_retry", status: "succeeded" });

      expect(await refundDeposit(request.id)).toEqual({ success: true });
      // Same key, same parameters on both attempts.
      expect(refundsCreateMock.mock.calls[1]).toEqual(refundsCreateMock.mock.calls[0]);
      expect(await readRefundRows(request.id)).toEqual([
        { status: "SUCCEEDED", stripePaymentIntentId: request.intent, stripeRefundId: "re_it_retry" },
      ]);
    });

    it("never re-issues a refund whose row already holds a refund id, even FAILED", async () => {
      const request = await createPaidRequest();
      await prisma.depositRefund.create({
        data: {
          bookingRequestId: request.id,
          stripePaymentIntentId: request.intent,
          status: "FAILED",
          stripeRefundId: "re_it_failed",
        },
      });

      expect(await refundDeposit(request.id)).toEqual({ success: true });

      expect(refundsCreateMock).not.toHaveBeenCalled();
      expect(await readRefundRows(request.id)).toEqual([
        { status: "FAILED", stripePaymentIntentId: request.intent, stripeRefundId: "re_it_failed" },
      ]);
    });

    it("concurrent calls on one booking share one intent row, over repeated runs", async () => {
      for (let run = 0; run < 5; run++) {
        const request = await createPaidRequest();
        const stripeRefundId = `re_it_${uniqueSuffix()}`;
        // Stripe's per-booking idempotency key returns the same refund to
        // every caller.
        refundsCreateMock.mockResolvedValue({ id: stripeRefundId, status: "succeeded" });

        const results = await Promise.all([
          refundDeposit(request.id),
          refundDeposit(request.id),
          refundDeposit(request.id),
        ]);

        expect(results).toEqual([{ success: true }, { success: true }, { success: true }]);
        expect(await readRefundRows(request.id)).toEqual([
          { status: "SUCCEEDED", stripePaymentIntentId: request.intent, stripeRefundId },
        ]);
      }
    });
  });

  // The conditional write's precedence and refund-id rules (56.6), proven on
  // real rows: the order Stripe's refund events can arrive in (56.1), and
  // concurrent deliveries serialised by Postgres's row lock.
  describe("advanceDepositRefundStatus", () => {
    let consoleErrorSpy: MockInstance<typeof console.error>;

    beforeEach(() => {
      consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
      consoleErrorSpy.mockRestore();
    });

    function refundId(): string {
      return `re_it_${uniqueSuffix()}`;
    }

    // Created directly: recordDepositRefundIntent only inserts PENDING rows
    // with no refund id.
    async function createRefundRow(
      status: DepositRefundStatus,
      stripeRefundId: string | null
    ): Promise<string> {
      const { artistId, clientId } = await setup();
      const intent = paymentIntentId();
      const request = await createBookingRequest({
        artistId,
        clientId,
        depositPaid: true,
        stripePaymentIntentId: intent,
      });
      await prisma.depositRefund.create({
        data: {
          bookingRequestId: request.id,
          stripePaymentIntentId: intent,
          status,
          stripeRefundId,
        },
      });
      return request.id;
    }

    function readRefundRow(
      bookingRequestId: string
    ): Promise<{ status: DepositRefundStatus; stripeRefundId: string | null }> {
      return prisma.depositRefund.findUniqueOrThrow({
        where: { bookingRequestId },
        select: { status: true, stripeRefundId: true },
      });
    }

    const refundFailedAlert = expect.objectContaining({
      reason: "refund_failed",
      severity: "critical",
    });

    it("keeps FAILED when a stale SUCCEEDED arrives after it", async () => {
      const bookingRequestId = await createRefundRow("PENDING", null);
      const stripeRefundId = refundId();

      const created = await advanceDepositRefundStatus({
        bookingRequestId,
        stripeRefundId,
        stripeStatus: "succeeded",
      });
      const failed = await advanceDepositRefundStatus({
        bookingRequestId,
        stripeRefundId,
        stripeStatus: "failed",
        failureReason: "expired_or_canceled_card",
      });
      const stale = await advanceDepositRefundStatus({
        bookingRequestId,
        stripeRefundId,
        stripeStatus: "succeeded",
      });

      expect([created, failed, stale]).toEqual([true, true, false]);
      expect(await readRefundRow(bookingRequestId)).toEqual({ status: "FAILED", stripeRefundId });
    });

    it("writes a redelivered FAILED once and alerts once", async () => {
      const stripeRefundId = refundId();
      const bookingRequestId = await createRefundRow("SUCCEEDED", stripeRefundId);
      const delivery = {
        bookingRequestId,
        stripeRefundId,
        stripeStatus: "failed",
        failureReason: "expired_or_canceled_card",
      };

      const first = await advanceDepositRefundStatus(delivery);
      const redelivery = await advanceDepositRefundStatus(delivery);

      expect([first, redelivery]).toEqual([true, false]);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(refundFailedAlert);
      expect(await readRefundRow(bookingRequestId)).toEqual({ status: "FAILED", stripeRefundId });
    });

    it("never replaces a stored refund id with a different one", async () => {
      const stripeRefundId = refundId();
      const bookingRequestId = await createRefundRow("PENDING", stripeRefundId);

      const written = await advanceDepositRefundStatus({
        bookingRequestId,
        stripeRefundId: refundId(),
        stripeStatus: "succeeded",
      });

      expect(written).toBe(false);
      expect(await readRefundRow(bookingRequestId)).toEqual({ status: "PENDING", stripeRefundId });
    });

    it("ends FAILED with one alert when SUCCEEDED and two FAILED deliveries race, over repeated runs", async () => {
      for (let run = 0; run < 5; run++) {
        consoleErrorSpy.mockClear();
        const stripeRefundId = refundId();
        const bookingRequestId = await createRefundRow("PENDING", stripeRefundId);
        const failedDelivery = { bookingRequestId, stripeRefundId, stripeStatus: "failed" };

        const [, ...failedWrites] = await Promise.all([
          advanceDepositRefundStatus({ bookingRequestId, stripeRefundId, stripeStatus: "succeeded" }),
          advanceDepositRefundStatus(failedDelivery),
          advanceDepositRefundStatus(failedDelivery),
        ]);

        expect(failedWrites.filter(Boolean)).toHaveLength(1);
        expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
        expect(consoleErrorSpy).toHaveBeenCalledWith(refundFailedAlert);
        expect(await readRefundRow(bookingRequestId)).toEqual({ status: "FAILED", stripeRefundId });
      }
    });
  });

  // The refund webhooks' lookup (56.6) on real rows: both match paths in one
  // OR read, and the refunds it must never record.
  describe("syncDepositRefundStatus", () => {
    let consoleErrorSpy: MockInstance<typeof console.error>;

    beforeEach(() => {
      consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
      consoleErrorSpy.mockRestore();
    });

    function refundId(): string {
      return `re_it_${uniqueSuffix()}`;
    }

    // The state refundDeposit leaves when Stripe accepted the refund but the
    // status write was lost: a PENDING intent row with no refund id.
    async function createIntentRow(): Promise<{ bookingRequestId: string; intent: string }> {
      const { artistId, clientId } = await setup();
      const intent = paymentIntentId();
      const request = await createBookingRequest({
        artistId,
        clientId,
        depositPaid: true,
        stripePaymentIntentId: intent,
      });
      await recordDepositRefundIntent(request.id, intent);
      return { bookingRequestId: request.id, intent };
    }

    function readRefundRow(
      bookingRequestId: string
    ): Promise<{ status: DepositRefundStatus; stripeRefundId: string | null }> {
      return prisma.depositRefund.findUniqueOrThrow({
        where: { bookingRequestId },
        select: { status: true, stripeRefundId: true },
      });
    }

    const refundUnmatchedAlert = expect.objectContaining({
      reason: "refund_unmatched",
      severity: "critical",
    });

    it("keeps FAILED when a stale refund.updated (succeeded) arrives after refund.failed", async () => {
      const { bookingRequestId, intent } = await createIntentRow();
      const stripeRefundId = refundId();
      // 56.1's failed card refund: created succeeded, then refund.failed,
      // then a refund.updated still saying succeeded.
      const delivery = {
        stripeRefundId,
        stripePaymentIntentId: intent,
        metadataBookingRequestId: bookingRequestId,
      };

      const created = await syncDepositRefundStatus({ ...delivery, stripeStatus: "succeeded" });
      const failed = await syncDepositRefundStatus({
        ...delivery,
        stripeStatus: "failed",
        failureReason: "expired_or_canceled_card",
      });
      const stale = await syncDepositRefundStatus({ ...delivery, stripeStatus: "succeeded" });

      expect([created, failed, stale]).toEqual([true, true, false]);
      expect(await readRefundRow(bookingRequestId)).toEqual({ status: "FAILED", stripeRefundId });
    });

    it("attaches a refund whose local write was lost to its booking's intent row through the metadata", async () => {
      const { bookingRequestId, intent } = await createIntentRow();
      const stripeRefundId = refundId();

      const written = await syncDepositRefundStatus({
        stripeRefundId,
        stripePaymentIntentId: intent,
        metadataBookingRequestId: bookingRequestId,
        stripeStatus: "pending",
      });

      expect(written).toBe(true);
      expect(await readRefundRow(bookingRequestId)).toEqual({ status: "PENDING", stripeRefundId });
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it("never attaches a Dashboard refund with no metadata to the intent row on its PaymentIntent", async () => {
      const { bookingRequestId, intent } = await createIntentRow();

      const written = await syncDepositRefundStatus({
        stripeRefundId: refundId(),
        stripePaymentIntentId: intent,
        stripeStatus: "succeeded",
      });

      expect(written).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(refundUnmatchedAlert);
      expect(await readRefundRow(bookingRequestId)).toEqual({
        status: "PENDING",
        stripeRefundId: null,
      });
    });

    it("never records a second refund on a PaymentIntent whose row already holds another id", async () => {
      const { bookingRequestId, intent } = await createIntentRow();
      const storedRefundId = refundId();
      await syncDepositRefundStatus({
        stripeRefundId: storedRefundId,
        stripePaymentIntentId: intent,
        metadataBookingRequestId: bookingRequestId,
        stripeStatus: "succeeded",
      });

      const written = await syncDepositRefundStatus({
        stripeRefundId: refundId(),
        stripePaymentIntentId: intent,
        metadataBookingRequestId: bookingRequestId,
        stripeStatus: "failed",
      });

      expect(written).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(refundUnmatchedAlert);
      expect(await readRefundRow(bookingRequestId)).toEqual({
        status: "SUCCEEDED",
        stripeRefundId: storedRefundId,
      });
    });
  });

  // The retry sweep's visit count (56.7) on real rows: which rows the
  // conditional increment counts, the updatedAt bump that makes failing
  // rows take turns, and concurrent increments serialised by Postgres's row
  // lock.
  describe("recordDepositRefundRetry", () => {
    let consoleErrorSpy: MockInstance<typeof console.error>;

    beforeEach(() => {
      consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
      consoleErrorSpy.mockRestore();
    });

    interface RetryRow {
      retryAttempts: number;
      updatedAt: Date;
    }

    // Created directly, with updatedAt an hour back so a bump shows
    // whatever the clock's resolution.
    async function createRefundRow(row: {
      status: DepositRefundStatus;
      stripeRefundId: string | null;
      retryAttempts: number;
    }): Promise<{ bookingRequestId: string; updatedAt: Date }> {
      const { artistId, clientId } = await setup();
      const intent = paymentIntentId();
      const request = await createBookingRequest({
        artistId,
        clientId,
        depositPaid: true,
        stripePaymentIntentId: intent,
      });
      const created = await prisma.depositRefund.create({
        data: {
          bookingRequestId: request.id,
          stripePaymentIntentId: intent,
          ...row,
          updatedAt: new Date(Date.now() - 60 * 60 * 1000),
        },
        select: { updatedAt: true },
      });
      return { bookingRequestId: request.id, updatedAt: created.updatedAt };
    }

    function readRetryRow(bookingRequestId: string): Promise<RetryRow> {
      return prisma.depositRefund.findUniqueOrThrow({
        where: { bookingRequestId },
        select: { retryAttempts: true, updatedAt: true },
      });
    }

    const refundRetryFailingAlert = expect.objectContaining({
      reason: "refund_retry_failing",
      severity: "critical",
    });

    it("counts an id-less PENDING row and moves its updatedAt forward", async () => {
      const created = await createRefundRow({
        status: "PENDING",
        stripeRefundId: null,
        retryAttempts: 0,
      });

      await recordDepositRefundRetry(created.bookingRequestId);

      const row = await readRetryRow(created.bookingRequestId);
      expect(row.retryAttempts).toBe(1);
      expect(row.updatedAt.getTime()).toBeGreaterThan(created.updatedAt.getTime());
    });

    it.each<DepositRefundStatus>(["PENDING", "SUCCEEDED", "FAILED"])(
      "doesn't count a %s row that holds a refund id, or touch its updatedAt",
      async (status) => {
        const created = await createRefundRow({
          status,
          stripeRefundId: `re_it_${uniqueSuffix()}`,
          retryAttempts: 0,
        });

        await recordDepositRefundRetry(created.bookingRequestId);

        expect(await readRetryRow(created.bookingRequestId)).toEqual({
          retryAttempts: 0,
          updatedAt: created.updatedAt,
        });
        expect(consoleErrorSpy).not.toHaveBeenCalled();
      }
    );

    it("alerts exactly once when concurrent increments cross the threshold, over repeated runs", async () => {
      for (let run = 0; run < 5; run++) {
        consoleErrorSpy.mockClear();
        const { bookingRequestId } = await createRefundRow({
          status: "PENDING",
          stripeRefundId: null,
          retryAttempts: DEPOSIT_REFUND_RETRY_ALERT_ATTEMPTS - 2,
        });

        await Promise.all([
          recordDepositRefundRetry(bookingRequestId),
          recordDepositRefundRetry(bookingRequestId),
          recordDepositRefundRetry(bookingRequestId),
        ]);

        expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
        expect(consoleErrorSpy).toHaveBeenCalledWith(refundRetryFailingAlert);
        expect((await readRetryRow(bookingRequestId)).retryAttempts).toBe(
          DEPOSIT_REFUND_RETRY_ALERT_ATTEMPTS + 1
        );
      }
    });
  });
});
