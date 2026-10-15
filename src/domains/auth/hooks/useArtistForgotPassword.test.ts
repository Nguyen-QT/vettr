// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import type { SubmitEvent } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { REQUEST_ARTIST_PASSWORD_RESET_UNEXPECTED_ERROR_MESSAGE } from "@/domains/auth/constants";

import { useArtistForgotPassword } from "./useArtistForgotPassword";

const requestArtistPasswordResetActionMock = vi.fn();
const preventDefaultMock = vi.fn();

vi.mock("@/domains/auth/actions", () => ({
  requestArtistPasswordResetAction: (...args: unknown[]) =>
    requestArtistPasswordResetActionMock(...args),
}));

const EMAIL = "artist@example.com";

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
  const hook = renderHook(() => useArtistForgotPassword());
  act(() => {
    hook.result.current.onEmailChange(email);
  });
  return hook;
}

async function submit(hook: ReturnType<typeof renderWithEmail>) {
  await act(async () => {
    hook.result.current.onSubmit(submitEvent);
  });
}

describe("useArtistForgotPassword", () => {
  beforeEach(() => {
    requestArtistPasswordResetActionMock.mockReset();
    preventDefaultMock.mockReset();
  });

  it("starts on an empty email step with no error", () => {
    const { result } = renderHook(() => useArtistForgotPassword());

    expect(result.current.step).toBe("email");
    expect(result.current.email).toBe("");
    expect(result.current.error).toBeUndefined();
    expect(result.current.isPending).toBe(false);
  });

  it("rejects an invalid email without calling the action", async () => {
    const hook = renderWithEmail("not-an-email");

    await submit(hook);

    expect(preventDefaultMock).toHaveBeenCalled();
    expect(requestArtistPasswordResetActionMock).not.toHaveBeenCalled();
    expect(hook.result.current.error).toBe("Enter a valid email address.");
    expect(hook.result.current.step).toBe("email");
  });

  it("rejects an empty email without calling the action", async () => {
    const hook = renderHook(() => useArtistForgotPassword());

    await submit(hook);

    expect(requestArtistPasswordResetActionMock).not.toHaveBeenCalled();
    expect(hook.result.current.error).toBeDefined();
    expect(hook.result.current.step).toBe("email");
  });

  it("sends the normalised email and moves to the sent step", async () => {
    requestArtistPasswordResetActionMock.mockResolvedValue({ success: true });
    const hook = renderWithEmail("  Artist@Example.COM ");

    await submit(hook);

    expect(requestArtistPasswordResetActionMock).toHaveBeenCalledWith({ email: EMAIL });
    expect(hook.result.current.step).toBe("sent");
    expect(hook.result.current.email).toBe(EMAIL);
    expect(hook.result.current.error).toBeUndefined();
    expect(hook.result.current.isPending).toBe(false);
  });

  it("clears an earlier validation error on a successful retry", async () => {
    requestArtistPasswordResetActionMock.mockResolvedValue({ success: true });
    const hook = renderWithEmail("nope");
    await submit(hook);
    expect(hook.result.current.error).toBeDefined();

    act(() => {
      hook.result.current.onEmailChange(EMAIL);
    });
    await submit(hook);

    expect(hook.result.current.error).toBeUndefined();
    expect(hook.result.current.step).toBe("sent");
  });

  it("shows the server error and stays on the email step on failure", async () => {
    requestArtistPasswordResetActionMock.mockResolvedValue({
      success: false,
      error: REQUEST_ARTIST_PASSWORD_RESET_UNEXPECTED_ERROR_MESSAGE,
    });
    const hook = renderWithEmail(EMAIL);

    await submit(hook);

    expect(hook.result.current.error).toBe(REQUEST_ARTIST_PASSWORD_RESET_UNEXPECTED_ERROR_MESSAGE);
    expect(hook.result.current.step).toBe("email");
    expect(hook.result.current.isPending).toBe(false);
  });

  it("shows a generic error when the action throws", async () => {
    requestArtistPasswordResetActionMock.mockRejectedValue(new Error("network down"));
    const hook = renderWithEmail(EMAIL);

    await submit(hook);

    expect(hook.result.current.error).toBe(REQUEST_ARTIST_PASSWORD_RESET_UNEXPECTED_ERROR_MESSAGE);
    expect(hook.result.current.step).toBe("email");
    expect(hook.result.current.isPending).toBe(false);
  });

  it("is pending while in flight and ignores a second submit", async () => {
    const request = deferred<{ success: true }>();
    requestArtistPasswordResetActionMock.mockReturnValue(request.promise);
    const hook = renderWithEmail(EMAIL);

    await submit(hook);
    expect(hook.result.current.isPending).toBe(true);

    await submit(hook);
    expect(requestArtistPasswordResetActionMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      request.resolve({ success: true });
    });
    expect(hook.result.current.isPending).toBe(false);
    expect(hook.result.current.step).toBe("sent");
  });

  it("keeps the submitted email if the field is edited mid-request", async () => {
    const request = deferred<{ success: true }>();
    requestArtistPasswordResetActionMock.mockReturnValue(request.promise);
    const hook = renderWithEmail(EMAIL);

    await submit(hook);
    act(() => {
      hook.result.current.onEmailChange("someone-else@example.com");
    });
    await act(async () => {
      request.resolve({ success: true });
    });

    expect(hook.result.current.step).toBe("sent");
    expect(hook.result.current.email).toBe(EMAIL);
  });

  describe("onChangeEmail", () => {
    it("returns to the email step, keeps the address and clears the error", async () => {
      requestArtistPasswordResetActionMock.mockResolvedValue({ success: true });
      const hook = renderWithEmail(EMAIL);
      await submit(hook);
      expect(hook.result.current.step).toBe("sent");

      act(() => {
        hook.result.current.onChangeEmail();
      });

      expect(hook.result.current.step).toBe("email");
      expect(hook.result.current.email).toBe(EMAIL);
      expect(hook.result.current.error).toBeUndefined();
    });

    it("is ignored while a request is in flight", async () => {
      const request = deferred<{ success: true }>();
      requestArtistPasswordResetActionMock.mockReturnValue(request.promise);
      const hook = renderWithEmail(EMAIL);
      await submit(hook);

      act(() => {
        hook.result.current.onChangeEmail();
      });
      await act(async () => {
        request.resolve({ success: true });
      });

      expect(hook.result.current.step).toBe("sent");
    });
  });
});
