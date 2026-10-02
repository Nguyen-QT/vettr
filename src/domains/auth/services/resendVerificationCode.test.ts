import { prismaMock } from "@/testUtils/prismaMock";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import {
  EMAIL_VERIFICATION_CODE_EXPIRY_MS,
  EMAIL_VERIFICATION_RESEND_COOLDOWN_MS,
  RESEND_VERIFICATION_UNEXPECTED_ERROR_MESSAGE,
} from "../constants";
import { hashEmailVerificationCode } from "./hashEmailVerificationCode";
import { resendVerificationCode } from "./resendVerificationCode";
import { sendVerificationEmail } from "./sendVerificationEmail";

vi.mock("./sendVerificationEmail", () => ({ sendVerificationEmail: vi.fn() }));

const NOW = new Date("2026-01-01T00:00:00.000Z");
const EMAIL = "client@example.com";

describe("resendVerificationCode", () => {
  let consoleErrorSpy: MockInstance<typeof console.error>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(sendVerificationEmail).mockReset();
    vi.mocked(sendVerificationEmail).mockResolvedValue({ success: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    consoleErrorSpy.mockRestore();
  });

  it("persists a new code behind an atomic cooldown guard, then emails it", async () => {
    prismaMock.account.updateMany.mockResolvedValueOnce({ count: 1 });

    const result = await resendVerificationCode({ email: EMAIL });

    expect(result).toEqual({ success: true });
    expect(prismaMock.account.updateMany).toHaveBeenCalledTimes(1);
    const args = prismaMock.account.updateMany.mock.calls[0][0];
    expect(args?.where).toEqual({
      email: EMAIL,
      role: "CLIENT",
      clientProfileId: { not: null },
      emailVerifiedAt: null,
      OR: [
        { emailVerificationCodeSentAt: null },
        {
          emailVerificationCodeSentAt: {
            lte: new Date(NOW.getTime() - EMAIL_VERIFICATION_RESEND_COOLDOWN_MS),
          },
        },
      ],
    });
    expect(args?.data).toMatchObject({
      emailVerificationCodeExpiresAt: new Date(NOW.getTime() + EMAIL_VERIFICATION_CODE_EXPIRY_MS),
      emailVerificationCodeSentAt: NOW,
      emailVerificationAttempts: 0,
    });

    // The emailed plaintext is the code whose hash was stored.
    expect(sendVerificationEmail).toHaveBeenCalledTimes(1);
    const [to, code] = vi.mocked(sendVerificationEmail).mock.calls[0];
    expect(to).toBe(EMAIL);
    expect(code).toMatch(/^\d{6}$/);
    expect(args?.data).toMatchObject({ emailVerificationCodeHash: hashEmailVerificationCode(code) });
  });

  it("returns the same success without sending when nothing matched (unknown/verified/cooldown)", async () => {
    prismaMock.account.updateMany.mockResolvedValueOnce({ count: 0 });

    const result = await resendVerificationCode({ email: EMAIL });

    expect(result).toEqual({ success: true });
    expect(sendVerificationEmail).not.toHaveBeenCalled();
    expect(prismaMock.account.updateMany).toHaveBeenCalledTimes(1);
  });

  it("keeps the cooldown when the send fails (no second write, still success)", async () => {
    prismaMock.account.updateMany.mockResolvedValueOnce({ count: 1 });
    vi.mocked(sendVerificationEmail).mockResolvedValueOnce({ success: false });

    const result = await resendVerificationCode({ email: EMAIL });

    expect(result).toEqual({ success: true });
    expect(sendVerificationEmail).toHaveBeenCalledTimes(1);
    expect(prismaMock.account.updateMany).toHaveBeenCalledTimes(1);
  });

  it("returns a generic error and logs only a fixed reason when the update throws", async () => {
    prismaMock.account.updateMany.mockRejectedValueOnce(new Error(`P2002 for ${EMAIL}`));

    const result = await resendVerificationCode({ email: EMAIL });

    expect(result).toEqual({
      success: false,
      error: RESEND_VERIFICATION_UNEXPECTED_ERROR_MESSAGE,
    });
    expect(sendVerificationEmail).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith({
      operation: "resendVerificationCode",
      reason: "unexpected_failure",
    });
    expect(JSON.stringify(consoleErrorSpy.mock.calls)).not.toContain(EMAIL);
  });
});
