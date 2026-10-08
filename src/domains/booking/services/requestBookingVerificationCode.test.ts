import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { REQUEST_BOOKING_SUBMISSION_CODE_UNEXPECTED_ERROR_MESSAGE } from "@/domains/auth/constants";
import { requestBookingSubmissionCode } from "@/domains/auth/services/requestBookingSubmissionCode";
import { Prisma } from "@/generated/prisma/client";

import type { RequestBookingVerificationCodeInput } from "../types";
import { requestBookingVerificationCode } from "./requestBookingVerificationCode";
import { validateComplexity } from "./validateComplexity";

vi.mock("@/domains/auth/services/requestBookingSubmissionCode", () => ({
  requestBookingSubmissionCode: vi.fn(),
}));

// Unit test (architecture.md Sec7): auth's send is mocked at its public
// contract; validateComplexity is real (same domain, pure), so each
// rejection case also proves that field reaches the check.
const EMAIL = "client@example.com";
const AUTH_ERROR = { success: false, error: REQUEST_BOOKING_SUBMISSION_CODE_UNEXPECTED_ERROR_MESSAGE };

function acceptedDraft(): RequestBookingVerificationCodeInput {
  return {
    email: EMAIL,
    tier: "TIER_3",
    clientNotes: "Soft gradient across the ring finger",
    designTags: ["custom-illustration"],
  };
}

describe("requestBookingVerificationCode", () => {
  let consoleErrorSpy: MockInstance<typeof console.error>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(requestBookingSubmissionCode).mockReset();
    vi.mocked(requestBookingSubmissionCode).mockResolvedValue({ success: true });
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("screens the draft, then requests the code with only the email", async () => {
    const result = await requestBookingVerificationCode(acceptedDraft());

    expect(result).toEqual({ success: true });
    expect(requestBookingSubmissionCode).toHaveBeenCalledTimes(1);
    expect(requestBookingSubmissionCode).toHaveBeenCalledWith({ email: EMAIL });
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("accepts a minimal draft with no notes and no tags", async () => {
    const result = await requestBookingVerificationCode({ email: EMAIL, tier: "TIER_2" });

    expect(result).toEqual({ success: true });
    expect(requestBookingSubmissionCode).toHaveBeenCalledWith({ email: EMAIL });
  });

  it.each<[string, RequestBookingVerificationCodeInput]>([
    ["notes", { email: EMAIL, tier: "TIER_3", clientNotes: "Just a simple heart" }],
    ["design tags", { email: EMAIL, tier: "TIER_2", designTags: ["small-basic"] }],
    ["aesthetic tags", { email: EMAIL, tier: "FREESTYLE", aestheticTags: ["minimalist-clean"] }],
  ])("rejects basic work in the %s before any code is issued", async (_field, draft) => {
    const expected = validateComplexity({
      tier: draft.tier,
      clientNotes: draft.clientNotes,
      designTags: draft.designTags,
      aestheticTags: draft.aestheticTags,
    });

    const result = await requestBookingVerificationCode(draft);

    expect(expected.success).toBe(false);
    expect(result).toEqual(expected);
    expect(requestBookingSubmissionCode).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("passes auth's generic failure through unchanged", async () => {
    vi.mocked(requestBookingSubmissionCode).mockResolvedValue(AUTH_ERROR);

    const result = await requestBookingVerificationCode(acceptedDraft());

    expect(result).toEqual(AUTH_ERROR);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("returns the generic error and logs only the Prisma code if auth throws", async () => {
    vi.mocked(requestBookingSubmissionCode).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError(`Write conflict for ${EMAIL}`, {
        code: "P2034",
        clientVersion: "test",
      })
    );

    const result = await requestBookingVerificationCode(acceptedDraft());

    expect(result).toEqual(AUTH_ERROR);
    expect(consoleErrorSpy.mock.calls).toStrictEqual([
      [{ operation: "requestBookingVerificationCode", reason: "unexpected_failure", errorCode: "P2034" }],
    ]);
    expect(JSON.stringify(consoleErrorSpy.mock.calls)).not.toContain(EMAIL);
  });

  it("returns the generic error with no error code for a non-Prisma throw", async () => {
    vi.mocked(requestBookingSubmissionCode).mockRejectedValue(new Error(`timeout for ${EMAIL}`));

    const result = await requestBookingVerificationCode(acceptedDraft());

    expect(result).toEqual(AUTH_ERROR);
    expect(consoleErrorSpy.mock.calls).toStrictEqual([
      [{ operation: "requestBookingVerificationCode", reason: "unexpected_failure", errorCode: undefined }],
    ]);
    expect(JSON.stringify(consoleErrorSpy.mock.calls)).not.toContain(EMAIL);
  });
});
