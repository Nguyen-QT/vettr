// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import type { FieldErrors, UseFormReturn } from "react-hook-form";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ARTIST_ACCOUNT_SWITCH_TO_CLIENT_VIEW_MESSAGE,
  EMAIL_VERIFICATION_RESEND_COOLDOWN_MS,
  INVALID_EMAIL_OTP_ERROR_MESSAGE,
  REQUEST_BOOKING_SUBMISSION_CODE_UNEXPECTED_ERROR_MESSAGE,
} from "@/domains/auth/constants";
import {
  BOOKING_FAILED_AFTER_VERIFICATION_ERROR_MESSAGE,
  BOOKING_VERIFICATION_CODE_RESENT_MESSAGE,
  CREATE_BOOKING_REQUEST_UNEXPECTED_ERROR_MESSAGE,
} from "@/domains/booking/constants";
import type { ClientBookingInput } from "@/domains/booking/types";

import { useBookingVerification } from "./useBookingVerification";
import { useVisualBookingForm } from "./useVisualBookingForm";

const submitBookingRequestMock = vi.fn();
const requestBookingVerificationCodeActionMock = vi.fn();
const submitBookingRequestWithCodeActionMock = vi.fn();
const getAvailableSlotsActionMock = vi.fn();
const onInvalidDraftMock = vi.fn<(errors: FieldErrors<ClientBookingInput>) => void>();

vi.mock("@/domains/booking/actions", () => ({
  submitBookingRequest: (...args: unknown[]) => submitBookingRequestMock(...args),
  requestBookingVerificationCodeAction: (...args: unknown[]) =>
    requestBookingVerificationCodeActionMock(...args),
  submitBookingRequestWithCodeAction: (...args: unknown[]) =>
    submitBookingRequestWithCodeActionMock(...args),
}));

vi.mock("@/domains/scheduling/actions", () => ({
  getAvailableSlotsAction: (...args: unknown[]) => getAvailableSlotsActionMock(...args),
}));

const ARTIST_ID = "artist_1";
const EMAIL = "client@example.com";
const OTHER_EMAIL = "someone-else@example.com";
const CODE = "123456";
const COOLDOWN_SECONDS = EMAIL_VERIFICATION_RESEND_COOLDOWN_MS / 1000;
const REFERENCE_IMAGE_URL = "https://example.com/reference.jpg";
const FUTURE_DATE = "2099-01-01";
const COMPLEXITY_ERROR = "Requests for simple work aren't accepted.";
const SIGNED_IN_SUBMIT_ERROR = "This booking page could not be found.";

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

// Composes the real form hook with this one, exactly as the
// BookingRequestWizard container (54.5.6.1) will.
function renderVerification(isSignedInClient = false) {
  return renderHook(
    ({ signedIn }: { signedIn: boolean }) => {
      const { form } = useVisualBookingForm({ artistId: ARTIST_ID });
      return {
        form,
        ...useBookingVerification({
          artistId: ARTIST_ID,
          form,
          isSignedInClient: signedIn,
          onInvalidDraft: onInvalidDraftMock,
        }),
      };
    },
    { initialProps: { signedIn: isSignedInClient } }
  );
}

type Hook = ReturnType<typeof renderVerification>;

// Every field valid. The phone is filled because the form's resolver is
// still clientBookingInputSchema, which rejects a blank one until 54.5.6.1
// switches it to the draft schema.
async function fillValidDraft(form: UseFormReturn<ClientBookingInput>) {
  // Setting the date fires useVisualBookingForm's availability fetch.
  await act(async () => {
    form.setValue("designTags", ["fine-line-detail"]);
    form.setValue("designReferenceImageUrls", [REFERENCE_IMAGE_URL]);
    form.setValue("requestedDate", FUTURE_DATE);
    form.setValue("instagramHandle", "@client.handle");
    form.setValue("firstName", "Ada");
    form.setValue("lastName", "Lovelace");
    form.setValue("dateOfBirth", "1990-01-01");
    form.setValue("email", EMAIL);
    form.setValue("phone", "07700900123");
  });
}

async function renderWithValidDraft(isSignedInClient = false) {
  const hook = renderVerification(isSignedInClient);
  await fillValidDraft(hook.result.current.form);
  return hook;
}

async function requestCode(hook: Hook) {
  await act(async () => {
    hook.result.current.verification.onRequestCode();
  });
}

async function renderAtCodeStep() {
  requestBookingVerificationCodeActionMock.mockResolvedValue({ success: true });
  const hook = await renderWithValidDraft();
  await requestCode(hook);
  requestBookingVerificationCodeActionMock.mockReset();
  return hook;
}

async function renderWithCode(code = CODE) {
  const hook = await renderAtCodeStep();
  act(() => {
    hook.result.current.verification.onCodeChange(code);
  });
  return hook;
}

async function verifyAndSubmit(hook: Hook) {
  await act(async () => {
    hook.result.current.verification.onVerifyAndSubmit();
  });
}

async function submitSignedIn(hook: Hook) {
  await act(async () => {
    hook.result.current.onSubmit();
  });
}

async function resend(hook: Hook) {
  await act(async () => {
    hook.result.current.verification.onResend();
  });
}

async function renderCooledDown() {
  const hook = await renderAtCodeStep();
  act(() => {
    vi.advanceTimersByTime(EMAIL_VERIFICATION_RESEND_COOLDOWN_MS);
  });
  return hook;
}

function setEmail(hook: Hook, email: string) {
  act(() => {
    hook.result.current.form.setValue("email", email);
  });
}

// Code redeemed, session cookie set, booking write failed (54.5.3.4).
async function renderAfterPartialFailure() {
  submitBookingRequestWithCodeActionMock.mockResolvedValue({
    success: false,
    error: BOOKING_FAILED_AFTER_VERIFICATION_ERROR_MESSAGE,
    signedIn: true,
  });
  const hook = await renderWithCode();
  await verifyAndSubmit(hook);
  submitBookingRequestWithCodeActionMock.mockReset();
  return hook;
}

describe("useBookingVerification", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    submitBookingRequestMock.mockReset();
    requestBookingVerificationCodeActionMock.mockReset();
    submitBookingRequestWithCodeActionMock.mockReset();
    onInvalidDraftMock.mockReset();
    getAvailableSlotsActionMock.mockReset();
    getAvailableSlotsActionMock.mockResolvedValue({ success: true, slots: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("guest (no CLIENT session)", () => {
    it("starts on the request step and needs a code", () => {
      const { result } = renderVerification();

      expect(result.current.requiresCode).toBe(true);
      expect(result.current.verification.step).toBe("request");
      expect(result.current.verification.email).toBe("");
      expect(result.current.verification.code).toBe("");
      expect(result.current.verification.resendCooldownSeconds).toBe(0);
      expect(result.current.verification.error).toBeUndefined();
      expect(result.current.isSubmitted).toBe(false);
    });

    describe("request code", () => {
      it("sends nothing and reports the invalid fields when the draft is incomplete", async () => {
        const hook = renderVerification();

        await requestCode(hook);

        expect(requestBookingVerificationCodeActionMock).not.toHaveBeenCalled();
        expect(onInvalidDraftMock).toHaveBeenCalledTimes(1);
        const errors = onInvalidDraftMock.mock.calls[0]?.[0];
        expect(errors?.designTags?.message).toBe("Select at least one design tag.");
        expect(errors?.firstName?.message).toBe("First name is required.");
        expect(errors?.email).toBeDefined();
        expect(hook.result.current.verification.step).toBe("request");
        expect(hook.result.current.verification.isRequestingCode).toBe(false);
      });

      it("sends the parsed draft, with no ids added", async () => {
        requestBookingVerificationCodeActionMock.mockResolvedValue({ success: true });
        const hook = await renderWithValidDraft();

        await requestCode(hook);

        expect(requestBookingVerificationCodeActionMock).toHaveBeenCalledTimes(1);
        const payload: unknown = requestBookingVerificationCodeActionMock.mock.calls[0]?.[0];
        expect(payload).toMatchObject({
          instagramHandle: "client.handle",
          tier: "TIER_2",
          designTags: ["fine-line-detail"],
          firstName: "Ada",
          requestedDate: FUTURE_DATE,
        });
        expect(payload).not.toHaveProperty("artistId");
        expect(payload).not.toHaveProperty("clientProfileId");
        expect(onInvalidDraftMock).not.toHaveBeenCalled();
      });

      it("moves to the code step showing the normalised address and starts the cooldown", async () => {
        requestBookingVerificationCodeActionMock.mockResolvedValue({ success: true });
        const hook = await renderWithValidDraft();
        setEmail(hook, "Client@Example.COM");

        await requestCode(hook);

        expect(hook.result.current.verification.step).toBe("code");
        expect(hook.result.current.verification.email).toBe(EMAIL);
        expect(hook.result.current.verification.resendCooldownSeconds).toBe(COOLDOWN_SECONDS);
        expect(hook.result.current.verification.error).toBeUndefined();
        expect(hook.result.current.verification.isRequestingCode).toBe(false);
        expect(hook.result.current.requiresCode).toBe(true);
      });

      it("shows the server's rejection and stays on the request step", async () => {
        requestBookingVerificationCodeActionMock.mockResolvedValue({
          success: false,
          error: COMPLEXITY_ERROR,
        });
        const hook = await renderWithValidDraft();

        await requestCode(hook);

        expect(hook.result.current.verification.error).toBe(COMPLEXITY_ERROR);
        expect(hook.result.current.verification.step).toBe("request");
        expect(hook.result.current.verification.resendCooldownSeconds).toBe(0);
      });

      it("shows a generic error when the action throws", async () => {
        requestBookingVerificationCodeActionMock.mockRejectedValue(new Error("network down"));
        const hook = await renderWithValidDraft();

        await requestCode(hook);

        expect(hook.result.current.verification.error).toBe(
          REQUEST_BOOKING_SUBMISSION_CODE_UNEXPECTED_ERROR_MESSAGE
        );
        expect(hook.result.current.verification.step).toBe("request");
        expect(hook.result.current.verification.isRequestingCode).toBe(false);
      });

      it("clears an earlier error when a request starts", async () => {
        requestBookingVerificationCodeActionMock.mockResolvedValueOnce({
          success: false,
          error: COMPLEXITY_ERROR,
        });
        const hook = await renderWithValidDraft();
        await requestCode(hook);
        expect(hook.result.current.verification.error).toBe(COMPLEXITY_ERROR);
        requestBookingVerificationCodeActionMock.mockResolvedValue({ success: true });

        await requestCode(hook);

        expect(hook.result.current.verification.error).toBeUndefined();
        expect(hook.result.current.verification.step).toBe("code");
      });

      it("is pending while in flight and ignores a second click", async () => {
        const request = deferred<{ success: true }>();
        requestBookingVerificationCodeActionMock.mockReturnValue(request.promise);
        const hook = await renderWithValidDraft();

        await requestCode(hook);
        expect(hook.result.current.verification.isRequestingCode).toBe(true);

        await requestCode(hook);
        expect(requestBookingVerificationCodeActionMock).toHaveBeenCalledTimes(1);

        await act(async () => {
          request.resolve({ success: true });
        });
        expect(hook.result.current.verification.isRequestingCode).toBe(false);
        expect(hook.result.current.verification.step).toBe("code");
      });
    });

    describe("code input", () => {
      it.each([
        ["12a3-4 5678", "123456"],
        [" 123 456", "123456"],
        ["123", "123"],
      ])("sanitises %j to %j", (input, expected) => {
        const { result } = renderVerification();

        act(() => {
          result.current.verification.onCodeChange(input);
        });

        expect(result.current.verification.code).toBe(expected);
      });
    });

    describe("verify and submit", () => {
      it("rejects an incomplete code without calling the action", async () => {
        const hook = await renderWithCode("123");

        await verifyAndSubmit(hook);

        expect(submitBookingRequestWithCodeActionMock).not.toHaveBeenCalled();
        expect(hook.result.current.verification.error).toBe("Enter the 6-digit code.");
        expect(hook.result.current.verification.step).toBe("code");
      });

      it("submits the parsed draft and the code for the route's artist", async () => {
        submitBookingRequestWithCodeActionMock.mockResolvedValue({
          success: true,
          bookingRequestId: "req_1",
        });
        const hook = await renderWithCode();

        await verifyAndSubmit(hook);

        expect(submitBookingRequestWithCodeActionMock).toHaveBeenCalledTimes(1);
        expect(submitBookingRequestWithCodeActionMock).toHaveBeenCalledWith(
          ARTIST_ID,
          expect.objectContaining({
            code: CODE,
            instagramHandle: "client.handle",
            firstName: "Ada",
            designReferenceImageUrls: [REFERENCE_IMAGE_URL],
          })
        );
        expect(hook.result.current.isSubmitted).toBe(true);
        expect(hook.result.current.verification.isSubmitting).toBe(false);
        expect(submitBookingRequestMock).not.toHaveBeenCalled();
      });

      it.each([
        ["a wrong or expired code", INVALID_EMAIL_OTP_ERROR_MESSAGE],
        ["an artist's email", ARTIST_ACCOUNT_SWITCH_TO_CLIENT_VIEW_MESSAGE],
      ])("shows the error for %s and stays on the code step", async (_case, message) => {
        submitBookingRequestWithCodeActionMock.mockResolvedValue({
          success: false,
          error: message,
          signedIn: false,
        });
        const hook = await renderWithCode();

        await verifyAndSubmit(hook);

        expect(hook.result.current.verification.error).toBe(message);
        expect(hook.result.current.verification.step).toBe("code");
        expect(hook.result.current.verification.code).toBe(CODE);
        expect(hook.result.current.requiresCode).toBe(true);
        expect(hook.result.current.isSubmitted).toBe(false);
      });

      it("shows a generic error when the action throws", async () => {
        submitBookingRequestWithCodeActionMock.mockRejectedValue(new Error("connection reset"));
        const hook = await renderWithCode();

        await verifyAndSubmit(hook);

        expect(hook.result.current.verification.error).toBe(
          CREATE_BOOKING_REQUEST_UNEXPECTED_ERROR_MESSAGE
        );
        expect(hook.result.current.verification.step).toBe("code");
        expect(hook.result.current.verification.isSubmitting).toBe(false);
        expect(hook.result.current.isSubmitted).toBe(false);
      });

      it("is pending while in flight and ignores a second click", async () => {
        const submission = deferred<{ success: true; bookingRequestId: string }>();
        submitBookingRequestWithCodeActionMock.mockReturnValue(submission.promise);
        const hook = await renderWithCode();

        await verifyAndSubmit(hook);
        expect(hook.result.current.verification.isSubmitting).toBe(true);

        await verifyAndSubmit(hook);
        expect(submitBookingRequestWithCodeActionMock).toHaveBeenCalledTimes(1);

        await act(async () => {
          submission.resolve({ success: true, bookingRequestId: "req_1" });
        });
        expect(hook.result.current.isSubmitted).toBe(true);
      });

      it("re-validates the draft, so a field cleared after the code was sent blocks the submit", async () => {
        const hook = await renderWithCode();
        act(() => {
          hook.result.current.form.setValue("firstName", "");
        });

        await verifyAndSubmit(hook);

        expect(submitBookingRequestWithCodeActionMock).not.toHaveBeenCalled();
        expect(onInvalidDraftMock).toHaveBeenCalledTimes(1);
        expect(onInvalidDraftMock.mock.calls[0]?.[0].firstName?.message).toBe(
          "First name is required."
        );
        expect(hook.result.current.verification.step).toBe("code");
      });

      it("switches to the signed-in path when the code was redeemed but the booking failed", async () => {
        const hook = await renderAfterPartialFailure();

        expect(hook.result.current.requiresCode).toBe(false);
        expect(hook.result.current.error).toBe(BOOKING_FAILED_AFTER_VERIFICATION_ERROR_MESSAGE);
        expect(hook.result.current.verification.step).toBe("request");
        expect(hook.result.current.verification.code).toBe("");
        expect(hook.result.current.isSubmitted).toBe(false);

        submitBookingRequestMock.mockResolvedValue({ success: true, bookingRequestId: "req_1" });
        await submitSignedIn(hook);

        expect(submitBookingRequestMock).toHaveBeenCalledWith(
          ARTIST_ID,
          expect.objectContaining({ firstName: "Ada" })
        );
        expect(submitBookingRequestWithCodeActionMock).not.toHaveBeenCalled();
        expect(hook.result.current.isSubmitted).toBe(true);
        expect(hook.result.current.error).toBeUndefined();
      });
    });

    describe("resend", () => {
      it("is ignored while the cooldown is running", async () => {
        const hook = await renderAtCodeStep();

        await resend(hook);

        expect(requestBookingVerificationCodeActionMock).not.toHaveBeenCalled();
      });

      it("re-sends the draft, shows the generic message, clears the old code and error, and restarts the cooldown", async () => {
        const hook = await renderCooledDown();
        act(() => {
          hook.result.current.verification.onCodeChange("12");
        });
        await verifyAndSubmit(hook);
        expect(hook.result.current.verification.error).toBeDefined();
        expect(hook.result.current.verification.resendCooldownSeconds).toBe(0);
        requestBookingVerificationCodeActionMock.mockResolvedValue({ success: true });

        await resend(hook);

        expect(requestBookingVerificationCodeActionMock).toHaveBeenCalledWith(
          expect.objectContaining({ instagramHandle: "client.handle", firstName: "Ada" })
        );
        expect(hook.result.current.verification.resendMessage).toBe(
          BOOKING_VERIFICATION_CODE_RESENT_MESSAGE
        );
        expect(hook.result.current.verification.code).toBe("");
        expect(hook.result.current.verification.error).toBeUndefined();
        expect(hook.result.current.verification.resendCooldownSeconds).toBe(COOLDOWN_SECONDS);
        expect(hook.result.current.verification.step).toBe("code");
        expect(hook.result.current.verification.isResending).toBe(false);
      });

      it("shows the server error and leaves the cooldown at 0 on failure", async () => {
        const hook = await renderCooledDown();
        requestBookingVerificationCodeActionMock.mockResolvedValue({
          success: false,
          error: REQUEST_BOOKING_SUBMISSION_CODE_UNEXPECTED_ERROR_MESSAGE,
        });

        await resend(hook);

        expect(hook.result.current.verification.resendMessage).toBe(
          REQUEST_BOOKING_SUBMISSION_CODE_UNEXPECTED_ERROR_MESSAGE
        );
        expect(hook.result.current.verification.resendCooldownSeconds).toBe(0);
        expect(hook.result.current.verification.step).toBe("code");
      });

      it("shows a generic message when the action throws", async () => {
        const hook = await renderCooledDown();
        requestBookingVerificationCodeActionMock.mockRejectedValue(new Error("boom"));

        await resend(hook);

        expect(hook.result.current.verification.resendMessage).toBe(
          REQUEST_BOOKING_SUBMISSION_CODE_UNEXPECTED_ERROR_MESSAGE
        );
        expect(hook.result.current.verification.resendCooldownSeconds).toBe(0);
        expect(hook.result.current.verification.isResending).toBe(false);
      });

      it("ignores a second resend while one is in flight", async () => {
        const hook = await renderCooledDown();
        const request = deferred<{ success: true }>();
        requestBookingVerificationCodeActionMock.mockReturnValue(request.promise);

        await resend(hook);
        expect(hook.result.current.verification.isResending).toBe(true);

        await resend(hook);
        expect(requestBookingVerificationCodeActionMock).toHaveBeenCalledTimes(1);

        await act(async () => {
          request.resolve({ success: true });
        });
        expect(hook.result.current.verification.isResending).toBe(false);
      });
    });

    describe("email change", () => {
      it("returns to the request step with the old code's state cleared", async () => {
        const hook = await renderCooledDown();
        requestBookingVerificationCodeActionMock.mockResolvedValue({ success: true });
        await resend(hook);
        act(() => {
          hook.result.current.verification.onCodeChange("12");
        });
        await verifyAndSubmit(hook);
        expect(hook.result.current.verification.error).toBeDefined();

        setEmail(hook, OTHER_EMAIL);

        expect(hook.result.current.verification.step).toBe("request");
        expect(hook.result.current.verification.email).toBe("");
        expect(hook.result.current.verification.code).toBe("");
        expect(hook.result.current.verification.error).toBeUndefined();
        expect(hook.result.current.verification.resendMessage).toBeUndefined();
      });

      it("keeps the code step when the change is only case or surrounding space", async () => {
        const hook = await renderWithCode();

        setEmail(hook, "Client@EXAMPLE.com ");

        expect(hook.result.current.verification.step).toBe("code");
        expect(hook.result.current.verification.email).toBe(EMAIL);
        expect(hook.result.current.verification.code).toBe(CODE);
      });

      it("sends a new code to the new address from the request step", async () => {
        const hook = await renderAtCodeStep();
        setEmail(hook, OTHER_EMAIL);
        requestBookingVerificationCodeActionMock.mockResolvedValue({ success: true });

        await requestCode(hook);

        expect(hook.result.current.verification.step).toBe("code");
        expect(hook.result.current.verification.email).toBe(OTHER_EMAIL);
      });

      it("lands on the request step when the email is edited while the code request is in flight", async () => {
        const request = deferred<{ success: true }>();
        requestBookingVerificationCodeActionMock.mockReturnValue(request.promise);
        const hook = await renderWithValidDraft();
        await requestCode(hook);

        setEmail(hook, OTHER_EMAIL);
        await act(async () => {
          request.resolve({ success: true });
        });

        expect(hook.result.current.verification.step).toBe("request");
        expect(hook.result.current.verification.isRequestingCode).toBe(false);
      });

      it("lands on the code step when the email is edited and changed back while in flight", async () => {
        const request = deferred<{ success: true }>();
        requestBookingVerificationCodeActionMock.mockReturnValue(request.promise);
        const hook = await renderWithValidDraft();
        await requestCode(hook);

        setEmail(hook, OTHER_EMAIL);
        setEmail(hook, EMAIL);
        await act(async () => {
          request.resolve({ success: true });
        });

        expect(hook.result.current.verification.step).toBe("code");
        expect(hook.result.current.verification.email).toBe(EMAIL);
      });
    });

    it("ignores the signed-in submit", async () => {
      const hook = await renderWithValidDraft();

      await submitSignedIn(hook);

      expect(submitBookingRequestMock).not.toHaveBeenCalled();
      expect(onInvalidDraftMock).not.toHaveBeenCalled();
    });
  });

  describe("signed-in client", () => {
    it("needs no code and submits the parsed draft through the signed-in path", async () => {
      submitBookingRequestMock.mockResolvedValue({ success: true, bookingRequestId: "req_1" });
      const hook = await renderWithValidDraft(true);
      expect(hook.result.current.requiresCode).toBe(false);

      await submitSignedIn(hook);

      expect(submitBookingRequestMock).toHaveBeenCalledTimes(1);
      expect(submitBookingRequestMock).toHaveBeenCalledWith(
        ARTIST_ID,
        expect.objectContaining({ instagramHandle: "client.handle", firstName: "Ada" })
      );
      expect(hook.result.current.isSubmitted).toBe(true);
      expect(hook.result.current.isSubmitting).toBe(false);
      expect(submitBookingRequestWithCodeActionMock).not.toHaveBeenCalled();
    });

    it("sends nothing and reports the invalid fields when the draft is incomplete", async () => {
      const hook = renderVerification(true);

      await submitSignedIn(hook);

      expect(submitBookingRequestMock).not.toHaveBeenCalled();
      expect(onInvalidDraftMock).toHaveBeenCalledTimes(1);
      expect(onInvalidDraftMock.mock.calls[0]?.[0].designTags).toBeDefined();
    });

    it("shows the server error on failure", async () => {
      submitBookingRequestMock.mockResolvedValue({ success: false, error: SIGNED_IN_SUBMIT_ERROR });
      const hook = await renderWithValidDraft(true);

      await submitSignedIn(hook);

      expect(hook.result.current.error).toBe(SIGNED_IN_SUBMIT_ERROR);
      expect(hook.result.current.isSubmitted).toBe(false);
    });

    it("shows a generic error when the action throws", async () => {
      submitBookingRequestMock.mockRejectedValue(new Error("connection reset"));
      const hook = await renderWithValidDraft(true);

      await submitSignedIn(hook);

      expect(hook.result.current.error).toBe(CREATE_BOOKING_REQUEST_UNEXPECTED_ERROR_MESSAGE);
      expect(hook.result.current.isSubmitting).toBe(false);
      expect(hook.result.current.isSubmitted).toBe(false);
    });

    it("is pending while in flight and ignores a second click", async () => {
      const submission = deferred<{ success: true; bookingRequestId: string }>();
      submitBookingRequestMock.mockReturnValue(submission.promise);
      const hook = await renderWithValidDraft(true);

      await submitSignedIn(hook);
      expect(hook.result.current.isSubmitting).toBe(true);

      await submitSignedIn(hook);
      expect(submitBookingRequestMock).toHaveBeenCalledTimes(1);

      await act(async () => {
        submission.resolve({ success: true, bookingRequestId: "req_1" });
      });
      expect(hook.result.current.isSubmitted).toBe(true);
    });

    it("ignores the guest-only code actions", async () => {
      const hook = await renderWithValidDraft(true);
      act(() => {
        hook.result.current.verification.onCodeChange(CODE);
      });

      await requestCode(hook);
      await verifyAndSubmit(hook);
      await resend(hook);

      expect(requestBookingVerificationCodeActionMock).not.toHaveBeenCalled();
      expect(submitBookingRequestWithCodeActionMock).not.toHaveBeenCalled();
      expect(hook.result.current.verification.step).toBe("request");
    });
  });

  describe("session props changing mid-flow", () => {
    it("drops the code step when a CLIENT session appears", async () => {
      const hook = await renderWithCode();

      hook.rerender({ signedIn: true });

      expect(hook.result.current.requiresCode).toBe(false);
      expect(hook.result.current.verification.step).toBe("request");
      expect(hook.result.current.verification.code).toBe("");
      expect(hook.result.current.error).toBeUndefined();
    });

    it("starts the code flow clean when the CLIENT session goes away", async () => {
      submitBookingRequestMock.mockResolvedValue({ success: false, error: SIGNED_IN_SUBMIT_ERROR });
      const hook = await renderWithValidDraft(true);
      await submitSignedIn(hook);
      expect(hook.result.current.error).toBe(SIGNED_IN_SUBMIT_ERROR);

      hook.rerender({ signedIn: false });

      expect(hook.result.current.requiresCode).toBe(true);
      expect(hook.result.current.verification.step).toBe("request");
      expect(hook.result.current.verification.error).toBeUndefined();
    });

    it("keeps the submit-again error when the props catch up after a redeemed code", async () => {
      const hook = await renderAfterPartialFailure();

      hook.rerender({ signedIn: true });

      expect(hook.result.current.requiresCode).toBe(false);
      expect(hook.result.current.error).toBe(BOOKING_FAILED_AFTER_VERIFICATION_ERROR_MESSAGE);
    });

    it("lands the submit-again error when the props flip before the result arrives", async () => {
      const submission = deferred<{ success: false; error: string; signedIn: true }>();
      submitBookingRequestWithCodeActionMock.mockReturnValue(submission.promise);
      const hook = await renderWithCode();
      await verifyAndSubmit(hook);

      hook.rerender({ signedIn: true });
      await act(async () => {
        submission.resolve({
          success: false,
          error: BOOKING_FAILED_AFTER_VERIFICATION_ERROR_MESSAGE,
          signedIn: true,
        });
      });

      expect(hook.result.current.requiresCode).toBe(false);
      expect(hook.result.current.error).toBe(BOOKING_FAILED_AFTER_VERIFICATION_ERROR_MESSAGE);
      expect(hook.result.current.isSubmitting).toBe(false);
    });

    it("stays submitted when a successful verify flips the props", async () => {
      submitBookingRequestWithCodeActionMock.mockResolvedValue({
        success: true,
        bookingRequestId: "req_1",
      });
      const hook = await renderWithCode();
      await verifyAndSubmit(hook);

      hook.rerender({ signedIn: true });

      expect(hook.result.current.isSubmitted).toBe(true);
    });

    it("returns to the code flow when the session is lost after the props caught up", async () => {
      const hook = await renderAfterPartialFailure();
      hook.rerender({ signedIn: true });

      hook.rerender({ signedIn: false });

      expect(hook.result.current.requiresCode).toBe(true);
      expect(hook.result.current.verification.step).toBe("request");
      expect(hook.result.current.verification.error).toBeUndefined();
    });
  });
});
