import { prismaMock } from "@/testUtils/prismaMock";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Account, ClientProfile } from "@/generated/prisma/client";

import {
  ACCOUNT_ALREADY_EXISTS_ERROR_MESSAGE,
  EMAIL_VERIFICATION_CODE_EXPIRY_MS,
  EMAIL_VERIFICATION_RESEND_COOLDOWN_MS,
  NO_BOOKING_FOUND_ERROR_MESSAGE,
} from "../constants";
import { hashEmailVerificationCode } from "./hashEmailVerificationCode";
import * as sendVerificationEmailModule from "./sendVerificationEmail";
import { signupClient } from "./signupClient";
import { verifyPassword } from "./verifyPassword";

// Mocked-Prisma unit test (architecture.md §7): the profile lookup and the
// account writes are stubbed; assertions are on the exact where/data payloads.
// The atomic updateMany guard under real concurrency is a 28.3 integration
// candidate -- here we only prove the guard is sent and count===0 is honoured.

// Never reaches Resend or the capture sink -- the send itself is
// covered by sendVerificationEmail.test.ts.
vi.mock("./sendVerificationEmail", () => ({
  sendVerificationEmail: vi.fn(),
}));

const sendVerificationEmailMock = vi.mocked(
  sendVerificationEmailModule.sendVerificationEmail,
);

const NOW = new Date("2026-03-01T12:00:00.000Z");
const CLIENT_PROFILE_ID = "client-1";
const EMAIL = "client-1@example.com";
const PASSWORD = "correct horse battery staple";

function buildAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: "account-1",
    email: EMAIL,
    passwordHash: "squatter-hash",
    role: "CLIENT",
    createdAt: NOW,
    updatedAt: NOW,
    failedLoginAttempts: 0,
    lockedUntil: null,
    emailVerifiedAt: null,
    emailVerificationCodeHash: null,
    emailVerificationCodeExpiresAt: null,
    emailVerificationCodeSentAt: null,
    emailVerificationAttempts: 0,
    artistId: null,
    clientProfileId: CLIENT_PROFILE_ID,
    ...overrides,
  };
}

function buildClientProfile(
  account: Account | null,
): ClientProfile & { account: Account | null } {
  return {
    id: CLIENT_PROFILE_ID,
    instagramHandle: "test_client",
    email: EMAIL,
    phone: null,
    cancellationCount: 0,
    enforcePrecharge: false,
    createdAt: NOW,
    updatedAt: NOW,
    firstName: null,
    lastName: null,
    dateOfBirth: null,
    account,
  };
}

describe("signupClient", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    sendVerificationEmailMock.mockReset();
    sendVerificationEmailMock.mockResolvedValue({ success: true });
    prismaMock.clientProfile.findFirst.mockResolvedValue(
      buildClientProfile(null),
    );
    prismaMock.account.create.mockResolvedValue(buildAccount());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("links a new unverified account to the matching ClientProfile and returns pending verification", async () => {
    const result = await signupClient({ email: EMAIL, password: PASSWORD });

    expect(result).toEqual({
      success: true,
      pendingVerification: true,
      clientProfileId: CLIENT_PROFILE_ID,
    });
    expect(prismaMock.clientProfile.findFirst).toHaveBeenCalledWith({
      where: { email: EMAIL },
      include: { account: true },
    });
    expect(prismaMock.account.create).toHaveBeenCalledTimes(1);
    const { data } = prismaMock.account.create.mock.calls[0][0];
    expect(data).toMatchObject({
      email: EMAIL,
      role: "CLIENT",
      clientProfileId: CLIENT_PROFILE_ID,
    });
    expect(data).not.toHaveProperty("emailVerifiedAt");
    expect(await verifyPassword(PASSWORD, data.passwordHash)).toBe(true);
  });

  it("does not create a session", async () => {
    await signupClient({ email: EMAIL, password: PASSWORD });

    expect(prismaMock.session.create).not.toHaveBeenCalled();
  });

  it("stores only the hash of the emailed code, with expiry and sent-at timestamps", async () => {
    await signupClient({ email: EMAIL, password: PASSWORD });

    expect(sendVerificationEmailMock).toHaveBeenCalledTimes(1);
    const [sentTo, sentCode] = sendVerificationEmailMock.mock.calls[0];
    expect(sentTo).toBe(EMAIL);
    expect(sentCode).toMatch(/^\d{6}$/);

    const { data } = prismaMock.account.create.mock.calls[0][0];
    expect(data.emailVerificationCodeHash).toBe(
      hashEmailVerificationCode(sentCode),
    );
    expect(data.emailVerificationCodeHash).not.toBe(sentCode);
    expect(data.emailVerificationCodeSentAt).toEqual(NOW);
    expect(data.emailVerificationCodeExpiresAt).toEqual(
      new Date(NOW.getTime() + EMAIL_VERIFICATION_CODE_EXPIRY_MS),
    );
  });

  it("still returns pending verification and keeps the account when the email fails to send", async () => {
    sendVerificationEmailMock.mockResolvedValue({ success: false });

    const result = await signupClient({ email: EMAIL, password: PASSWORD });

    expect(result).toEqual({
      success: true,
      pendingVerification: true,
      clientProfileId: CLIENT_PROFILE_ID,
    });
    const { data } = prismaMock.account.create.mock.calls[0][0];
    expect(data.emailVerificationCodeHash).toEqual(expect.any(String));
  });

  it("rejects an email with no matching ClientProfile without sending an email", async () => {
    prismaMock.clientProfile.findFirst.mockResolvedValue(null);

    const result = await signupClient({
      email: "no-such-booking@example.com",
      password: PASSWORD,
    });

    expect(result).toEqual({
      success: false,
      error: NO_BOOKING_FOUND_ERROR_MESSAGE,
    });
    expect(sendVerificationEmailMock).not.toHaveBeenCalled();
    expect(prismaMock.account.create).not.toHaveBeenCalled();
  });

  it("rejects signup when the ClientProfile already has a verified account, leaving it untouched", async () => {
    prismaMock.clientProfile.findFirst.mockResolvedValue(
      buildClientProfile(buildAccount({ emailVerifiedAt: NOW })),
    );

    const result = await signupClient({
      email: EMAIL,
      password: "a-different-password",
    });

    expect(result).toEqual({
      success: false,
      error: ACCOUNT_ALREADY_EXISTS_ERROR_MESSAGE,
    });
    expect(sendVerificationEmailMock).not.toHaveBeenCalled();
    expect(prismaMock.account.create).not.toHaveBeenCalled();
    expect(prismaMock.account.updateMany).not.toHaveBeenCalled();
  });

  describe("re-signup against an unverified (possibly squatted) account", () => {
    const ownerPassword = "owner-chosen-password";

    beforeEach(() => {
      prismaMock.clientProfile.findFirst.mockResolvedValue(
        buildClientProfile(
          buildAccount({
            emailVerificationCodeHash: hashEmailVerificationCode("111111"),
            emailVerificationCodeSentAt: new Date(
              NOW.getTime() - EMAIL_VERIFICATION_RESEND_COOLDOWN_MS - 1000,
            ),
            emailVerificationAttempts: 3,
            failedLoginAttempts: 2,
          }),
        ),
      );
    });

    it("replaces the password, kills the old code, resets counters and emails a fresh code", async () => {
      prismaMock.account.updateMany.mockResolvedValue({ count: 1 });

      const result = await signupClient({
        email: EMAIL,
        password: ownerPassword,
      });

      expect(result).toEqual({
        success: true,
        pendingVerification: true,
        clientProfileId: CLIENT_PROFILE_ID,
      });
      expect(prismaMock.account.create).not.toHaveBeenCalled();
      expect(sendVerificationEmailMock).toHaveBeenCalledTimes(1);
      const [sentTo, sentCode] = sendVerificationEmailMock.mock.calls[0];
      expect(sentTo).toBe(EMAIL);

      const cooldownCutoff = new Date(
        NOW.getTime() - EMAIL_VERIFICATION_RESEND_COOLDOWN_MS,
      );
      expect(prismaMock.account.updateMany).toHaveBeenCalledTimes(1);
      const { where, data } = prismaMock.account.updateMany.mock.calls[0][0] ?? {};
      expect(where).toEqual({
        id: "account-1",
        emailVerifiedAt: null,
        OR: [
          { emailVerificationCodeSentAt: null },
          { emailVerificationCodeSentAt: { lte: cooldownCutoff } },
        ],
      });
      expect(data).toMatchObject({
        emailVerificationCodeHash: hashEmailVerificationCode(sentCode),
        emailVerificationCodeSentAt: NOW,
        emailVerificationAttempts: 0,
        failedLoginAttempts: 0,
        lockedUntil: null,
      });
      expect(data?.emailVerificationCodeHash).not.toBe(
        hashEmailVerificationCode("111111"),
      );
      expect(
        await verifyPassword(ownerPassword, String(data?.passwordHash)),
      ).toBe(true);
      expect(prismaMock.session.create).not.toHaveBeenCalled();
    });

    it("sends nothing while the resend cooldown is active (guarded update matches no row)", async () => {
      prismaMock.account.updateMany.mockResolvedValue({ count: 0 });

      const result = await signupClient({
        email: EMAIL,
        password: ownerPassword,
      });

      expect(result).toEqual({
        success: true,
        pendingVerification: true,
        clientProfileId: CLIENT_PROFILE_ID,
      });
      expect(sendVerificationEmailMock).not.toHaveBeenCalled();
      expect(prismaMock.account.create).not.toHaveBeenCalled();
    });
  });
});
