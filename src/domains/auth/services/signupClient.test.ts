import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/prisma";

import {
  ACCOUNT_ALREADY_EXISTS_ERROR_MESSAGE,
  EMAIL_VERIFICATION_CODE_EXPIRY_MS,
  EMAIL_VERIFICATION_RESEND_COOLDOWN_MS,
  NO_BOOKING_FOUND_ERROR_MESSAGE,
} from "../constants";
import { hashEmailVerificationCode } from "./hashEmailVerificationCode";
import { hashPassword } from "./hashPassword";
import * as sendVerificationEmailModule from "./sendVerificationEmail";
import { signupClient } from "./signupClient";
import { verifyPassword } from "./verifyPassword";

// Never reaches Resend or the capture sink -- the send itself is
// covered by sendVerificationEmail.test.ts.
vi.mock("./sendVerificationEmail", () => ({
  sendVerificationEmail: vi.fn(),
}));

const sendVerificationEmailMock = vi.mocked(
  sendVerificationEmailModule.sendVerificationEmail,
);

describe("signupClient", () => {
  let clientProfileId: string;
  let email: string;
  const password = "correct horse battery staple";

  beforeEach(async () => {
    sendVerificationEmailMock.mockReset();
    sendVerificationEmailMock.mockResolvedValue({ success: true });
    clientProfileId = randomUUID();
    email = `${clientProfileId}@example.com`;
    await prisma.clientProfile.create({
      data: {
        id: clientProfileId,
        instagramHandle: `test_client_${clientProfileId.slice(0, 8)}`,
        email,
      },
    });
  });

  afterEach(async () => {
    const account = await prisma.account.findUnique({ where: { email } });
    if (account) {
      await prisma.session.deleteMany({ where: { accountId: account.id } });
      await prisma.account.delete({ where: { id: account.id } });
    }
    await prisma.clientProfile.delete({ where: { id: clientProfileId } });
  });

  it("links a new unverified account to the matching ClientProfile and returns pending verification", async () => {
    const result = await signupClient({ email, password });

    expect(result).toEqual({
      success: true,
      pendingVerification: true,
      clientProfileId,
    });

    const account = await prisma.account.findUnique({ where: { email } });
    expect(account).toMatchObject({
      role: "CLIENT",
      clientProfileId,
      emailVerifiedAt: null,
    });
  });

  it("does not create a session", async () => {
    await signupClient({ email, password });

    const account = await prisma.account.findUnique({ where: { email } });
    const sessionCount = await prisma.session.count({
      where: { accountId: account?.id },
    });
    expect(sessionCount).toBe(0);
  });

  it("stores only the hash of the emailed code, with expiry and sent-at timestamps", async () => {
    const before = Date.now();
    await signupClient({ email, password });
    const after = Date.now();

    expect(sendVerificationEmailMock).toHaveBeenCalledTimes(1);
    const [sentTo, sentCode] = sendVerificationEmailMock.mock.calls[0];
    expect(sentTo).toBe(email);
    expect(sentCode).toMatch(/^\d{6}$/);

    const account = await prisma.account.findUnique({ where: { email } });
    expect(account?.emailVerificationCodeHash).toBe(
      hashEmailVerificationCode(sentCode),
    );
    expect(account?.emailVerificationCodeHash).not.toBe(sentCode);
    expect(account?.emailVerificationAttempts).toBe(0);

    const sentAt = account?.emailVerificationCodeSentAt?.getTime();
    expect(sentAt).toBeGreaterThanOrEqual(before);
    expect(sentAt).toBeLessThanOrEqual(after);
    expect(account?.emailVerificationCodeExpiresAt?.getTime()).toBe(
      (sentAt ?? 0) + EMAIL_VERIFICATION_CODE_EXPIRY_MS,
    );
  });

  it("still returns pending verification and keeps the account when the email fails to send", async () => {
    sendVerificationEmailMock.mockResolvedValue({ success: false });

    const result = await signupClient({ email, password });

    expect(result).toEqual({
      success: true,
      pendingVerification: true,
      clientProfileId,
    });
    const account = await prisma.account.findUnique({ where: { email } });
    expect(account?.emailVerificationCodeHash).not.toBeNull();
  });

  it("rejects an email with no matching ClientProfile without sending an email", async () => {
    const result = await signupClient({
      email: "no-such-booking@example.com",
      password,
    });

    expect(result).toEqual({
      success: false,
      error: NO_BOOKING_FOUND_ERROR_MESSAGE,
    });
    expect(sendVerificationEmailMock).not.toHaveBeenCalled();
  });

  it("rejects signup when the ClientProfile already has a verified account, leaving it untouched", async () => {
    const originalHash = await hashPassword(password);
    await prisma.account.create({
      data: {
        email,
        passwordHash: originalHash,
        role: "CLIENT",
        clientProfileId,
        emailVerifiedAt: new Date(),
      },
    });

    const result = await signupClient({
      email,
      password: "a-different-password",
    });

    expect(result).toEqual({
      success: false,
      error: ACCOUNT_ALREADY_EXISTS_ERROR_MESSAGE,
    });
    expect(sendVerificationEmailMock).not.toHaveBeenCalled();
    const account = await prisma.account.findUnique({ where: { email } });
    expect(account?.passwordHash).toBe(originalHash);
  });

  describe("re-signup against an unverified (possibly squatted) account", () => {
    const squatterPassword = "squatter-chosen-password";
    const ownerPassword = "owner-chosen-password";
    const oldCode = "111111";

    async function createSquattedAccount(sentAt: Date) {
      return prisma.account.create({
        data: {
          email,
          passwordHash: await hashPassword(squatterPassword),
          role: "CLIENT",
          clientProfileId,
          emailVerificationCodeHash: hashEmailVerificationCode(oldCode),
          emailVerificationCodeExpiresAt: new Date(
            sentAt.getTime() + EMAIL_VERIFICATION_CODE_EXPIRY_MS,
          ),
          emailVerificationCodeSentAt: sentAt,
          emailVerificationAttempts: 3,
          failedLoginAttempts: 2,
        },
      });
    }

    it("replaces the password, kills the old code, resets counters and emails a fresh code", async () => {
      const created = await createSquattedAccount(
        new Date(Date.now() - EMAIL_VERIFICATION_RESEND_COOLDOWN_MS - 1000),
      );

      const result = await signupClient({ email, password: ownerPassword });

      expect(result).toEqual({
        success: true,
        pendingVerification: true,
        clientProfileId,
      });
      expect(sendVerificationEmailMock).toHaveBeenCalledTimes(1);
      const [sentTo, sentCode] = sendVerificationEmailMock.mock.calls[0];
      expect(sentTo).toBe(email);

      const account = await prisma.account.findUnique({ where: { email } });
      expect(account?.id).toBe(created.id);
      expect(
        await verifyPassword(ownerPassword, account?.passwordHash ?? ""),
      ).toBe(true);
      expect(
        await verifyPassword(squatterPassword, account?.passwordHash ?? ""),
      ).toBe(false);
      expect(account?.emailVerificationCodeHash).toBe(
        hashEmailVerificationCode(sentCode),
      );
      expect(account?.emailVerificationCodeHash).not.toBe(
        hashEmailVerificationCode(oldCode),
      );
      expect(account?.emailVerificationAttempts).toBe(0);
      expect(account?.failedLoginAttempts).toBe(0);
      expect(account?.emailVerifiedAt).toBeNull();
      expect(
        await prisma.session.count({ where: { accountId: created.id } }),
      ).toBe(0);
    });

    it("leaves the account unchanged and sends nothing while the resend cooldown is active", async () => {
      const created = await createSquattedAccount(new Date());

      const result = await signupClient({ email, password: ownerPassword });

      expect(result).toEqual({
        success: true,
        pendingVerification: true,
        clientProfileId,
      });
      expect(sendVerificationEmailMock).not.toHaveBeenCalled();
      const account = await prisma.account.findUnique({ where: { email } });
      expect(account?.passwordHash).toBe(created.passwordHash);
      expect(account?.emailVerificationCodeHash).toBe(
        hashEmailVerificationCode(oldCode),
      );
    });
  });
});
