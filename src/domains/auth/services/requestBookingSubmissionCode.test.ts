import { prismaMock } from "@/testUtils/prismaMock";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { Prisma } from "@/generated/prisma/client";

import { REQUEST_BOOKING_SUBMISSION_CODE_UNEXPECTED_ERROR_MESSAGE } from "../constants";
import { issueEmailOtp } from "./issueEmailOtp";
import { requestBookingSubmissionCode } from "./requestBookingSubmissionCode";
import { sendVerificationEmail } from "./sendVerificationEmail";

vi.mock("./issueEmailOtp", () => ({ issueEmailOtp: vi.fn() }));
vi.mock("./sendVerificationEmail", () => ({ sendVerificationEmail: vi.fn() }));

const EMAIL = "client@example.com";
const CODE = "042517";
const SUCCESS = { success: true };
const DB_ERROR = { success: false, error: REQUEST_BOOKING_SUBMISSION_CODE_UNEXPECTED_ERROR_MESSAGE };

describe("requestBookingSubmissionCode", () => {
  let consoleErrorSpy: MockInstance<typeof console.error>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(issueEmailOtp).mockReset();
    vi.mocked(issueEmailOtp).mockResolvedValue({ issued: true, code: CODE });
    vi.mocked(sendVerificationEmail).mockReset();
    vi.mocked(sendVerificationEmail).mockResolvedValue({ success: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    consoleErrorSpy.mockRestore();
  });

  it("issues a BOOKING_SUBMISSION code for the normalised email and emails that exact code", async () => {
    const result = await requestBookingSubmissionCode({ email: "  Client@Example.COM " });

    expect(result).toEqual(SUCCESS);
    expect(issueEmailOtp).toHaveBeenCalledWith({ email: EMAIL, purpose: "BOOKING_SUBMISSION" });
    expect(sendVerificationEmail).toHaveBeenCalledWith(EMAIL, CODE);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("sends to every address without looking up an account", async () => {
    await requestBookingSubmissionCode({ email: EMAIL });

    expect(prismaMock.account.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.account.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.clientProfile.findUnique).not.toHaveBeenCalled();
  });

  it("returns the same success without sending when the issue is blocked (cooldown, cap, lost race)", async () => {
    vi.mocked(issueEmailOtp).mockResolvedValue({ issued: false });

    const result = await requestBookingSubmissionCode({ email: EMAIL });

    expect(result).toEqual(SUCCESS);
    expect(sendVerificationEmail).not.toHaveBeenCalled();
  });

  it("still succeeds when the send fails, logging nothing of its own", async () => {
    vi.mocked(sendVerificationEmail).mockResolvedValue({ success: false });

    const result = await requestBookingSubmissionCode({ email: EMAIL });

    expect(result).toEqual(SUCCESS);
    expect(sendVerificationEmail).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("answers without padding the response", async () => {
    vi.useFakeTimers();

    const result = await requestBookingSubmissionCode({ email: EMAIL });

    expect(result).toEqual(SUCCESS);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("returns a generic error and logs only a fixed reason when issuing the code throws", async () => {
    vi.mocked(issueEmailOtp).mockRejectedValue(new Error(`connection lost for ${EMAIL}`));

    const result = await requestBookingSubmissionCode({ email: EMAIL });

    expect(result).toEqual(DB_ERROR);
    expect(sendVerificationEmail).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith({
      operation: "requestBookingSubmissionCode",
      reason: "unexpected_failure",
      errorCode: undefined,
    });
    expect(JSON.stringify(consoleErrorSpy.mock.calls)).not.toContain(EMAIL);
  });

  it("logs the typed Prisma code, but never its message, for a known driver error", async () => {
    vi.mocked(issueEmailOtp).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError(`Write conflict for ${EMAIL}`, {
        code: "P2034",
        clientVersion: "test",
      })
    );

    const result = await requestBookingSubmissionCode({ email: EMAIL });

    expect(result).toEqual(DB_ERROR);
    expect(sendVerificationEmail).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith({
      operation: "requestBookingSubmissionCode",
      reason: "unexpected_failure",
      errorCode: "P2034",
    });
    expect(JSON.stringify(consoleErrorSpy.mock.calls)).not.toContain(EMAIL);
    expect(JSON.stringify(consoleErrorSpy.mock.calls)).not.toContain(CODE);
  });
});
