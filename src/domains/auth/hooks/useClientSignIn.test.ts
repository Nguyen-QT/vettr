// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import type { SubmitEvent } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CLIENT_SIGN_IN_CODE_RESENT_MESSAGE,
  EMAIL_VERIFICATION_RESEND_COOLDOWN_MS,
  REQUEST_SIGN_IN_CODE_UNEXPECTED_ERROR_MESSAGE,
  SIGN_IN_WITH_EMAIL_OTP_UNEXPECTED_ERROR_MESSAGE,
} from "@/domains/auth/constants";

import { useClientSignIn } from "./useClientSignIn";

const requestClientSignInCodeActionMock = vi.fn();
const verifyClientSignInCodeActionMock = vi.fn();
const pushMock = vi.fn();
const preventDefaultMock = vi.fn();
let searchParams = new URLSearchParams();

vi.mock("@/domains/auth/actions", () => ({
  requestClientSignInCodeAction: (...args: unknown[]) =>
    requestClientSignInCodeActionMock(...args),
  verifyClientSignInCodeAction: (...args: unknown[]) =>
    verifyClientSignInCodeActionMock(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => searchParams,
}));

const EMAIL = "client@example.com";
const COOLDOWN_SECONDS = EMAIL_VERIFICATION_RESEND_COOLDOWN_MS / 1000;
const INVALID_CODE_ERROR = "Incorrect or expired code. Request a new code and try again.";

const submitEvent = {
  preventDefault: preventDefaultMock,
} as unknown as SubmitEvent<HTMLFormElement>;

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function renderWithEmail(email: string) {
  const hook = renderHook(() => useClientSignIn());
  act(() => {
    hook.result.current.onEmailChange(email);
  });
  return hook;
}

async function renderAtCodeStep(email = EMAIL) {
  requestClientSignInCodeActionMock.mockResolvedValue({ success: true });
  const hook = renderWithEmail(email);
  await act(async () => {
    hook.result.current.onRequestCode(submitEvent);
  });
  requestClientSignInCodeActionMock.mockReset();
  return hook;
}

async function renderWithCode(code = "123456") {
  const hook = await renderAtCodeStep();
  act(() => {
    hook.result.current.onCodeChange(code);
  });
  return hook;
}

async function verify(hook: Awaited<ReturnType<typeof renderWithCode>>) {
  await act(async () => {
    hook.result.current.onVerifyCode(submitEvent);
  });
}

async function renderCooledDown() {
  const hook = await renderAtCodeStep();
  act(() => {
    vi.advanceTimersByTime(EMAIL_VERIFICATION_RESEND_COOLDOWN_MS);
  });
  return hook;
}

describe("useClientSignIn", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    requestClientSignInCodeActionMock.mockReset();
    verifyClientSignInCodeActionMock.mockReset();
    pushMock.mockReset();
    preventDefaultMock.mockReset();
    searchParams = new URLSearchParams();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts on an empty email step with no cooldown", () => {
    const { result } = renderHook(() => useClientSignIn());

    expect(result.current.step).toBe("email");
    expect(result.current.email).toBe("");
    expect(result.current.code).toBe("");
    expect(result.current.resendCooldownSeconds).toBe(0);
    expect(result.current.error).toBeUndefined();
    expect(result.current.resendMessage).toBeUndefined();
  });

  describe("request code", () => {
    it("rejects an invalid email without calling the action", async () => {
      const { result } = renderWithEmail("not-an-email");

      await act(async () => {
        result.current.onRequestCode(submitEvent);
      });

      expect(preventDefaultMock).toHaveBeenCalled();
      expect(requestClientSignInCodeActionMock).not.toHaveBeenCalled();
      expect(result.current.error).toBe("Enter a valid email address.");
      expect(result.current.step).toBe("email");
    });

    it("sends the normalised email, moves to the code step and starts the cooldown", async () => {
      const { result } = await renderAtCodeStep("  Client@Example.COM ");

      expect(result.current.step).toBe("code");
      expect(result.current.email).toBe(EMAIL);
      expect(result.current.resendCooldownSeconds).toBe(COOLDOWN_SECONDS);
      expect(result.current.error).toBeUndefined();
      expect(result.current.isRequestingCode).toBe(false);
    });

    it("calls the action with the normalised email", async () => {
      requestClientSignInCodeActionMock.mockResolvedValue({ success: true });
      const { result } = renderWithEmail("  Client@Example.COM ");

      await act(async () => {
        result.current.onRequestCode(submitEvent);
      });

      expect(requestClientSignInCodeActionMock).toHaveBeenCalledWith({ email: EMAIL });
    });

    it("clears an earlier validation error on success", async () => {
      requestClientSignInCodeActionMock.mockResolvedValue({ success: true });
      const { result } = renderWithEmail("nope");
      await act(async () => {
        result.current.onRequestCode(submitEvent);
      });
      expect(result.current.error).toBeDefined();

      act(() => {
        result.current.onEmailChange(EMAIL);
      });
      await act(async () => {
        result.current.onRequestCode(submitEvent);
      });

      expect(result.current.error).toBeUndefined();
      expect(result.current.step).toBe("code");
    });

    it("shows the server error and stays on the email step on failure", async () => {
      requestClientSignInCodeActionMock.mockResolvedValue({
        success: false,
        error: REQUEST_SIGN_IN_CODE_UNEXPECTED_ERROR_MESSAGE,
      });
      const { result } = renderWithEmail(EMAIL);

      await act(async () => {
        result.current.onRequestCode(submitEvent);
      });

      expect(result.current.error).toBe(REQUEST_SIGN_IN_CODE_UNEXPECTED_ERROR_MESSAGE);
      expect(result.current.step).toBe("email");
      expect(result.current.resendCooldownSeconds).toBe(0);
    });

    it("shows a generic error when the action throws", async () => {
      requestClientSignInCodeActionMock.mockRejectedValue(new Error("network down"));
      const { result } = renderWithEmail(EMAIL);

      await act(async () => {
        result.current.onRequestCode(submitEvent);
      });

      expect(result.current.error).toBe(REQUEST_SIGN_IN_CODE_UNEXPECTED_ERROR_MESSAGE);
      expect(result.current.step).toBe("email");
      expect(result.current.isRequestingCode).toBe(false);
    });

    it("is pending while in flight and ignores a second submit", async () => {
      const request = deferred<{ success: true }>();
      requestClientSignInCodeActionMock.mockReturnValue(request.promise);
      const { result } = renderWithEmail(EMAIL);

      await act(async () => {
        result.current.onRequestCode(submitEvent);
      });
      expect(result.current.isRequestingCode).toBe(true);

      await act(async () => {
        result.current.onRequestCode(submitEvent);
      });
      expect(requestClientSignInCodeActionMock).toHaveBeenCalledTimes(1);

      await act(async () => {
        request.resolve({ success: true });
      });
      expect(result.current.isRequestingCode).toBe(false);
      expect(result.current.step).toBe("code");
    });

    it("keeps the submitted email if the field is edited mid-request", async () => {
      const request = deferred<{ success: true }>();
      requestClientSignInCodeActionMock.mockReturnValue(request.promise);
      verifyClientSignInCodeActionMock.mockResolvedValue({ success: true, clientProfileId: "cp1" });
      const { result } = renderWithEmail(EMAIL);

      await act(async () => {
        result.current.onRequestCode(submitEvent);
      });
      act(() => {
        result.current.onEmailChange("someone-else@example.com");
      });
      await act(async () => {
        request.resolve({ success: true });
      });

      expect(result.current.email).toBe(EMAIL);

      act(() => {
        result.current.onCodeChange("123456");
      });
      await act(async () => {
        result.current.onVerifyCode(submitEvent);
      });
      expect(verifyClientSignInCodeActionMock).toHaveBeenCalledWith({ email: EMAIL, code: "123456" });
    });
  });

  describe("code input", () => {
    it.each([
      ["12a3-4 5678", "123456"],
      [" 123 456", "123456"],
      ["123", "123"],
    ])("sanitises %j to %j", (input, expected) => {
      const { result } = renderHook(() => useClientSignIn());

      act(() => {
        result.current.onCodeChange(input);
      });

      expect(result.current.code).toBe(expected);
    });
  });

  describe("verify code", () => {
    it("rejects an incomplete code without calling the action", async () => {
      const hook = await renderWithCode("123");

      await verify(hook);

      expect(preventDefaultMock).toHaveBeenCalled();
      expect(verifyClientSignInCodeActionMock).not.toHaveBeenCalled();
      expect(hook.result.current.error).toBe("Enter the 6-digit code.");
    });

    it("sends the email and code to verifyClientSignInCodeAction", async () => {
      verifyClientSignInCodeActionMock.mockResolvedValue({ success: true, clientProfileId: "cp1" });
      const hook = await renderWithCode();

      await verify(hook);

      expect(verifyClientSignInCodeActionMock).toHaveBeenCalledWith({ email: EMAIL, code: "123456" });
    });

    it("redirects to /client when there is no redirectTo", async () => {
      verifyClientSignInCodeActionMock.mockResolvedValue({ success: true, clientProfileId: "cp1" });
      const hook = await renderWithCode();

      await verify(hook);

      expect(pushMock).toHaveBeenCalledTimes(1);
      expect(pushMock).toHaveBeenCalledWith("/client");
      expect(hook.result.current.error).toBeUndefined();
    });

    it.each([
      ["/client/bookings", "/client/bookings"],
      ["/client/bookings?tab=past", "/client/bookings?tab=past"],
      ["/client/./bookings", "/client/bookings"],
    ])("honours the safe redirectTo %j", async (redirectTo, expected) => {
      searchParams = new URLSearchParams({ redirectTo });
      verifyClientSignInCodeActionMock.mockResolvedValue({ success: true, clientProfileId: "cp1" });
      const hook = await renderWithCode();

      await verify(hook);

      expect(pushMock).toHaveBeenCalledWith(expected);
    });

    it.each([
      ["https://evil.com"],
      ["//evil.com"],
      ["/\\evil.com"],
      ["javascript:alert(1)"],
      ["/artist/abc123"],
      ["/client/../artist/abc123"],
      ["/clients"],
      [""],
    ])("falls back to /client for the unsafe redirectTo %j", async (redirectTo) => {
      searchParams = new URLSearchParams({ redirectTo });
      verifyClientSignInCodeActionMock.mockResolvedValue({ success: true, clientProfileId: "cp1" });
      const hook = await renderWithCode();

      await verify(hook);

      expect(pushMock).toHaveBeenCalledTimes(1);
      expect(pushMock).toHaveBeenCalledWith("/client");
    });

    it("shows the server error and does not redirect on failure", async () => {
      verifyClientSignInCodeActionMock.mockResolvedValue({ success: false, error: INVALID_CODE_ERROR });
      const hook = await renderWithCode();

      await verify(hook);

      expect(hook.result.current.error).toBe(INVALID_CODE_ERROR);
      expect(hook.result.current.isVerifying).toBe(false);
      expect(pushMock).not.toHaveBeenCalled();
    });

    it("shows a generic error when the action throws", async () => {
      verifyClientSignInCodeActionMock.mockRejectedValue(new Error("connection reset"));
      const hook = await renderWithCode();

      await verify(hook);

      expect(hook.result.current.error).toBe(SIGN_IN_WITH_EMAIL_OTP_UNEXPECTED_ERROR_MESSAGE);
      expect(hook.result.current.isVerifying).toBe(false);
      expect(pushMock).not.toHaveBeenCalled();
    });

    it("is pending while in flight and ignores a second submit", async () => {
      const verification = deferred<{ success: true; clientProfileId: string }>();
      verifyClientSignInCodeActionMock.mockReturnValue(verification.promise);
      const hook = await renderWithCode();

      await verify(hook);
      expect(hook.result.current.isVerifying).toBe(true);

      await verify(hook);
      expect(verifyClientSignInCodeActionMock).toHaveBeenCalledTimes(1);

      await act(async () => {
        verification.resolve({ success: true, clientProfileId: "cp1" });
      });
      expect(pushMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("resend", () => {
    it("is ignored while the cooldown is running", async () => {
      const { result } = await renderAtCodeStep();

      await act(async () => {
        result.current.onResend();
      });

      expect(requestClientSignInCodeActionMock).not.toHaveBeenCalled();
    });

    it("requests a new code, shows the generic message, clears the old code and error, and restarts the cooldown", async () => {
      const { result } = await renderCooledDown();
      act(() => {
        result.current.onCodeChange("12");
      });
      await act(async () => {
        result.current.onVerifyCode(submitEvent);
      });
      expect(result.current.error).toBeDefined();
      expect(result.current.resendCooldownSeconds).toBe(0);
      requestClientSignInCodeActionMock.mockResolvedValue({ success: true });

      await act(async () => {
        result.current.onResend();
      });

      expect(requestClientSignInCodeActionMock).toHaveBeenCalledWith({ email: EMAIL });
      expect(result.current.resendMessage).toBe(CLIENT_SIGN_IN_CODE_RESENT_MESSAGE);
      expect(result.current.code).toBe("");
      expect(result.current.error).toBeUndefined();
      expect(result.current.resendCooldownSeconds).toBe(COOLDOWN_SECONDS);
      expect(result.current.isResending).toBe(false);
    });

    it("shows the server error and leaves the cooldown at 0 on failure", async () => {
      const { result } = await renderCooledDown();
      requestClientSignInCodeActionMock.mockResolvedValue({
        success: false,
        error: REQUEST_SIGN_IN_CODE_UNEXPECTED_ERROR_MESSAGE,
      });

      await act(async () => {
        result.current.onResend();
      });

      expect(result.current.resendMessage).toBe(REQUEST_SIGN_IN_CODE_UNEXPECTED_ERROR_MESSAGE);
      expect(result.current.resendCooldownSeconds).toBe(0);
    });

    it("shows a generic message when the action throws", async () => {
      const { result } = await renderCooledDown();
      requestClientSignInCodeActionMock.mockRejectedValue(new Error("boom"));

      await act(async () => {
        result.current.onResend();
      });

      expect(result.current.resendMessage).toBe(REQUEST_SIGN_IN_CODE_UNEXPECTED_ERROR_MESSAGE);
      expect(result.current.resendCooldownSeconds).toBe(0);
      expect(result.current.isResending).toBe(false);
    });

    it("ignores a second resend while one is in flight", async () => {
      const { result } = await renderCooledDown();
      const resend = deferred<{ success: true }>();
      requestClientSignInCodeActionMock.mockReturnValue(resend.promise);

      await act(async () => {
        result.current.onResend();
      });
      expect(result.current.isResending).toBe(true);

      await act(async () => {
        result.current.onResend();
      });
      expect(requestClientSignInCodeActionMock).toHaveBeenCalledTimes(1);

      await act(async () => {
        resend.resolve({ success: true });
      });
      expect(result.current.isResending).toBe(false);
    });
  });

  describe("change email", () => {
    it("returns to the email step, keeps the email and clears the code-step state", async () => {
      const { result } = await renderCooledDown();
      requestClientSignInCodeActionMock.mockResolvedValue({ success: true });
      await act(async () => {
        result.current.onResend();
      });
      act(() => {
        result.current.onCodeChange("12");
      });
      await act(async () => {
        result.current.onVerifyCode(submitEvent);
      });

      act(() => {
        result.current.onChangeEmail();
      });

      expect(result.current.step).toBe("email");
      expect(result.current.email).toBe(EMAIL);
      expect(result.current.code).toBe("");
      expect(result.current.error).toBeUndefined();
      expect(result.current.resendMessage).toBeUndefined();
    });

    it("is ignored while verifying", async () => {
      const verification = deferred<{ success: false; error: string }>();
      verifyClientSignInCodeActionMock.mockReturnValue(verification.promise);
      const hook = await renderWithCode();
      await verify(hook);

      act(() => {
        hook.result.current.onChangeEmail();
      });
      expect(hook.result.current.step).toBe("code");

      await act(async () => {
        verification.resolve({ success: false, error: INVALID_CODE_ERROR });
      });
      expect(hook.result.current.step).toBe("code");
      expect(hook.result.current.error).toBe(INVALID_CODE_ERROR);
    });

    it("is ignored while resending", async () => {
      const { result } = await renderCooledDown();
      const resend = deferred<{ success: true }>();
      requestClientSignInCodeActionMock.mockReturnValue(resend.promise);
      await act(async () => {
        result.current.onResend();
      });

      act(() => {
        result.current.onChangeEmail();
      });
      expect(result.current.step).toBe("code");

      await act(async () => {
        resend.resolve({ success: true });
      });
      expect(result.current.step).toBe("code");
      expect(result.current.resendMessage).toBe(CLIENT_SIGN_IN_CODE_RESENT_MESSAGE);
    });
  });
});
