// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import type { FormEvent } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  EMAIL_VERIFICATION_RESEND_COOLDOWN_MS,
  RESEND_VERIFICATION_UNEXPECTED_ERROR_MESSAGE,
  VERIFY_EMAIL_UNEXPECTED_ERROR_MESSAGE,
} from "@/domains/auth/constants";

import {
  INCOMPLETE_VERIFICATION_ERROR_MESSAGE,
  RESEND_SUCCESS_MESSAGE,
  useVerifyEmailCode,
} from "./useVerifyEmailCode";

const verifyEmailCodeActionMock = vi.fn();
const resendVerificationCodeActionMock = vi.fn();
const pushMock = vi.fn();

vi.mock("@/domains/auth/actions", () => ({
  verifyEmailCodeAction: (...args: unknown[]) => verifyEmailCodeActionMock(...args),
  resendVerificationCodeAction: (...args: unknown[]) =>
    resendVerificationCodeActionMock(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

const EMAIL = "client@example.com";
const COOLDOWN_SECONDS = EMAIL_VERIFICATION_RESEND_COOLDOWN_MS / 1000;

const submitEvent = {
  preventDefault: vi.fn(),
} as unknown as FormEvent<HTMLFormElement>;

function renderFilledHook() {
  const hook = renderHook(() => useVerifyEmailCode({ email: EMAIL }));
  act(() => {
    hook.result.current.onCodeChange("123456");
    hook.result.current.onPasswordChange("hunter2hunter2");
  });
  return hook;
}

describe("useVerifyEmailCode", () => {
  beforeEach(() => {
    verifyEmailCodeActionMock.mockReset();
    resendVerificationCodeActionMock.mockReset();
    pushMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("code input", () => {
    it("strips non-digits and caps at 6 characters", () => {
      const { result } = renderHook(() => useVerifyEmailCode({ email: EMAIL }));

      act(() => {
        result.current.onCodeChange("12a3-4 5678");
      });

      expect(result.current.code).toBe("123456");
    });
  });

  describe("submit", () => {
    it("sends email, code and password to verifyEmailCodeAction", async () => {
      verifyEmailCodeActionMock.mockResolvedValue({ success: true, clientProfileId: "cp1" });
      const { result } = renderFilledHook();

      act(() => {
        result.current.onSubmit(submitEvent);
      });

      await waitFor(() => {
        expect(verifyEmailCodeActionMock).toHaveBeenCalledWith({
          email: EMAIL,
          code: "123456",
          password: "hunter2hunter2",
        });
      });
    });

    it("redirects to /client on success", async () => {
      verifyEmailCodeActionMock.mockResolvedValue({ success: true, clientProfileId: "cp1" });
      const { result } = renderFilledHook();

      act(() => {
        result.current.onSubmit(submitEvent);
      });

      await waitFor(() => {
        expect(pushMock).toHaveBeenCalledWith("/client");
      });
      expect(result.current.error).toBeUndefined();
    });

    it("surfaces the server error and does not redirect on failure", async () => {
      verifyEmailCodeActionMock.mockResolvedValue({
        success: false,
        error: "That code is incorrect or has expired.",
      });
      const { result } = renderFilledHook();

      act(() => {
        result.current.onSubmit(submitEvent);
      });

      await waitFor(() => {
        expect(result.current.error).toBe("That code is incorrect or has expired.");
      });
      expect(pushMock).not.toHaveBeenCalled();
      expect(result.current.isPending).toBe(false);
    });

    it("is pending while in flight and ignores a second submit", async () => {
      let resolveAction: (value: unknown) => void = () => {};
      verifyEmailCodeActionMock.mockReturnValue(
        new Promise((resolve) => {
          resolveAction = resolve;
        })
      );
      const { result } = renderFilledHook();

      act(() => {
        result.current.onSubmit(submitEvent);
      });
      await waitFor(() => {
        expect(result.current.isPending).toBe(true);
      });

      act(() => {
        result.current.onSubmit(submitEvent);
      });
      expect(verifyEmailCodeActionMock).toHaveBeenCalledTimes(1);

      await act(async () => {
        resolveAction({ success: true, clientProfileId: "cp1" });
      });
      expect(result.current.isPending).toBe(false);
    });

    it("does not call the action when the code is incomplete", () => {
      const { result } = renderHook(() => useVerifyEmailCode({ email: EMAIL }));
      act(() => {
        result.current.onCodeChange("123");
        result.current.onPasswordChange("hunter2hunter2");
      });

      act(() => {
        result.current.onSubmit(submitEvent);
      });

      expect(verifyEmailCodeActionMock).not.toHaveBeenCalled();
      expect(result.current.error).toBe(INCOMPLETE_VERIFICATION_ERROR_MESSAGE);
    });

    it("does not call the action when the password is empty", () => {
      const { result } = renderHook(() => useVerifyEmailCode({ email: EMAIL }));
      act(() => {
        result.current.onCodeChange("123456");
      });

      act(() => {
        result.current.onSubmit(submitEvent);
      });

      expect(verifyEmailCodeActionMock).not.toHaveBeenCalled();
      expect(result.current.error).toBe(INCOMPLETE_VERIFICATION_ERROR_MESSAGE);
    });

    it("shows a generic error when the action throws", async () => {
      verifyEmailCodeActionMock.mockRejectedValue(new Error("connection reset"));
      const { result } = renderFilledHook();

      act(() => {
        result.current.onSubmit(submitEvent);
      });

      await waitFor(() => {
        expect(result.current.error).toBe(VERIFY_EMAIL_UNEXPECTED_ERROR_MESSAGE);
      });
      expect(pushMock).not.toHaveBeenCalled();
    });
  });

  describe("resend cooldown", () => {
    it("starts at the full cooldown and counts down once per second", () => {
      vi.useFakeTimers();
      const { result } = renderHook(() => useVerifyEmailCode({ email: EMAIL }));
      expect(result.current.resendCooldownSeconds).toBe(COOLDOWN_SECONDS);

      act(() => {
        vi.advanceTimersByTime(3000);
      });

      expect(result.current.resendCooldownSeconds).toBe(COOLDOWN_SECONDS - 3);
    });

    it("stops at 0 and never goes negative", () => {
      vi.useFakeTimers();
      const { result } = renderHook(() => useVerifyEmailCode({ email: EMAIL }));

      act(() => {
        vi.advanceTimersByTime(EMAIL_VERIFICATION_RESEND_COOLDOWN_MS + 5000);
      });

      expect(result.current.resendCooldownSeconds).toBe(0);
    });

    it("clears its interval on unmount", () => {
      vi.useFakeTimers();
      const { unmount } = renderHook(() => useVerifyEmailCode({ email: EMAIL }));

      unmount();

      expect(vi.getTimerCount()).toBe(0);
    });
  });

  describe("resend", () => {
    async function renderCooledDownHook() {
      vi.useFakeTimers();
      const hook = renderHook(() => useVerifyEmailCode({ email: EMAIL }));
      act(() => {
        vi.advanceTimersByTime(EMAIL_VERIFICATION_RESEND_COOLDOWN_MS);
      });
      return hook;
    }

    it("is ignored while cooling down", () => {
      const { result } = renderHook(() => useVerifyEmailCode({ email: EMAIL }));

      act(() => {
        result.current.onResend();
      });

      expect(resendVerificationCodeActionMock).not.toHaveBeenCalled();
    });

    it("calls the action, shows the generic message and restarts the cooldown", async () => {
      resendVerificationCodeActionMock.mockResolvedValue({ success: true });
      const { result } = await renderCooledDownHook();
      expect(result.current.resendCooldownSeconds).toBe(0);

      await act(async () => {
        result.current.onResend();
      });

      expect(resendVerificationCodeActionMock).toHaveBeenCalledWith({ email: EMAIL });
      expect(result.current.resendMessage).toBe(RESEND_SUCCESS_MESSAGE);
      expect(result.current.resendCooldownSeconds).toBe(COOLDOWN_SECONDS);
      expect(result.current.isResending).toBe(false);
    });

    it("shows the server error and leaves the cooldown at 0 on failure", async () => {
      resendVerificationCodeActionMock.mockResolvedValue({
        success: false,
        error: "Please wait before requesting another code.",
      });
      const { result } = await renderCooledDownHook();

      await act(async () => {
        result.current.onResend();
      });

      expect(result.current.resendMessage).toBe("Please wait before requesting another code.");
      expect(result.current.resendCooldownSeconds).toBe(0);
    });

    it("shows a generic message when the action throws", async () => {
      resendVerificationCodeActionMock.mockRejectedValue(new Error("boom"));
      const { result } = await renderCooledDownHook();

      await act(async () => {
        result.current.onResend();
      });

      expect(result.current.resendMessage).toBe(RESEND_VERIFICATION_UNEXPECTED_ERROR_MESSAGE);
    });
  });
});
