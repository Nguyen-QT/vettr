import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

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
  DEPOSIT_REFUND_PAYMENT_INTENT_NOT_FOUND_ERROR_MESSAGE,
} from "../constants";
import { addBillingAddon } from "./addBillingAddon";
import { confirmDepositPayment } from "./confirmDepositPayment";
import { confirmDepositRefund } from "./confirmDepositRefund";
import { getArtistDepositSettings } from "./getArtistDepositSettings";
import { getBillingAddons } from "./getBillingAddons";
import { getFinalBillTotal } from "./getFinalBillTotal";
import { getPayableDeposits } from "./getPayableDeposits";
import { refundDeposit } from "./refundDeposit";
import { removeBillingAddon } from "./removeBillingAddon";
import { setArtistDepositSettings } from "./setArtistDepositSettings";
import { syncArtistConnectAccountStatus } from "./syncArtistConnectAccountStatus";

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

    it("confirmDepositRefund persists the refund id once and ignores a redelivery with a different id", async () => {
      const { artistId, clientId } = await setup();
      const intent = paymentIntentId();
      const request = await createBookingRequest({
        artistId,
        clientId,
        depositPaid: true,
        stripePaymentIntentId: intent,
      });

      expect(await confirmDepositRefund(intent, "re_first")).toEqual({ success: true });
      expect(await confirmDepositRefund(intent, "re_second")).toEqual({ success: true });

      const row = await prisma.bookingRequest.findUniqueOrThrow({ where: { id: request.id } });
      expect(row.depositRefunded).toBe(true);
      expect(row.stripeRefundId).toBe("re_first");
    });

    it("confirmDepositRefund returns the not-found error for an unknown PaymentIntent", async () => {
      const result = await confirmDepositRefund(paymentIntentId(), "re_x");

      expect(result).toEqual({
        success: false,
        error: DEPOSIT_REFUND_PAYMENT_INTENT_NOT_FOUND_ERROR_MESSAGE,
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

  describe("refundDeposit", () => {
    it("persists depositRefunded and stripeRefundId, and a re-run makes no second Stripe call", async () => {
      const { artistId, clientId } = await setup();
      const request = await createBookingRequest({
        artistId,
        clientId,
        depositPaid: true,
        stripePaymentIntentId: paymentIntentId(),
      });
      refundsCreateMock.mockResolvedValue({ id: "re_it_1" });

      expect(await refundDeposit(request.id)).toEqual({ success: true });
      expect(await refundDeposit(request.id)).toEqual({ success: true });

      const row = await prisma.bookingRequest.findUniqueOrThrow({ where: { id: request.id } });
      expect(row.depositRefunded).toBe(true);
      expect(row.stripeRefundId).toBe("re_it_1");
      expect(refundsCreateMock).toHaveBeenCalledTimes(1);
    });

    it("rejects an unpaid deposit without calling Stripe or changing the row", async () => {
      const { artistId, clientId } = await setup();
      const request = await createBookingRequest({ artistId, clientId });

      const result = await refundDeposit(request.id);

      expect(result).toEqual({ success: false, error: DEPOSIT_REFUND_NOT_PAID_ERROR_MESSAGE });
      expect(refundsCreateMock).not.toHaveBeenCalled();
      const row = await prisma.bookingRequest.findUniqueOrThrow({ where: { id: request.id } });
      expect(row.depositRefunded).toBe(false);
      expect(row.stripeRefundId).toBeNull();
    });

    it("leaves the row untouched and returns a generic error when Stripe rejects", async () => {
      const { artistId, clientId } = await setup();
      const request = await createBookingRequest({
        artistId,
        clientId,
        depositPaid: true,
        stripePaymentIntentId: paymentIntentId(),
      });
      refundsCreateMock.mockRejectedValue(new Error("stripe down"));

      const result = await refundDeposit(request.id);

      expect(result).toEqual({ success: false, error: DEPOSIT_REFUND_INIT_ERROR_MESSAGE });
      const row = await prisma.bookingRequest.findUniqueOrThrow({ where: { id: request.id } });
      expect(row.depositRefunded).toBe(false);
      expect(row.stripeRefundId).toBeNull();
    });
  });
});
