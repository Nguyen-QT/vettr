// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import type { SubmitEvent } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  INVALID_PASSWORD_RESET_LINK_ERROR_MESSAGE,
  MIN_ARTIST_PASSWORD_LENGTH,
  RESET_ARTIST_PASSWORD_UNEXPECTED_ERROR_MESSAGE,
} from "@/domains/auth/constants";

import { useArtistResetPassword } from "./useArtistResetPassword";

const resetArtistPasswordActionMock = vi.fn();
const replaceMock = vi.fn();
const preventDefaultMock = vi.fn();

vi.mock("@/domains/auth/actions", () => ({
  resetArtistPasswordAction: (...args: unknown[]) => resetArtistPasswordActionMock(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

const TOKEN = "A".repeat(43);
const ARTIST_ID = "artist-1";
const PASSWORD = "correct horse battery";
const TOO_SHORT_ERROR = `Password must be at least ${MIN_ARTIST_PASSWORD_LENGTH} characters.`;
const MISMATCH_ERROR = "Passwords do not match.";

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

function renderFilled(newPassword: string, confirmPassword: string, token: string | null = TOKEN) {
  // null stands for "no token": an undefined argument would take the default.
  const hook = renderHook(() => useArtistResetPassword(token ?? undefined));
  act(() => {
    hook.result.current.onFieldChange("newPassword", newPassword);
  });
  act(() => {
    hook.result.current.onFieldChange("confirmPassword", confirmPassword);
  });
  return hook;
}

async function submit(hook: ReturnType<typeof renderFilled>) {
  await act(async () => {
    hook.result.current.onSubmit(submitEvent);
  });
}

describe("useArtistResetPassword", () => {
  beforeEach(() => {
    resetArtistPasswordActionMock.mockReset();
    replaceMock.mockReset();
    preventDefaultMock.mockReset();
  });

  it("starts on an empty form step with no errors", () => {
    const { result } = renderHook(() => useArtistResetPassword(TOKEN));

    expect(result.current.step).toBe("form");
    expect(result.current.newPassword).toBe("");
    expect(result.current.confirmPassword).toBe("");
    expect(result.current.errors?.newPassword).toBeUndefined();
    expect(result.current.errors?.confirmPassword).toBeUndefined();
    expect(result.current.serverError).toBeUndefined();
    expect(result.current.isPending).toBe(false);
  });

  it.each([
    ["missing", null],
    ["too short", "A".repeat(42)],
    ["illegal characters", "A".repeat(42) + "!"],
  ])("starts on the invalid step and sends nothing for a %s token", async (_label, token) => {
    const hook = renderFilled(PASSWORD, PASSWORD, token);

    expect(hook.result.current.step).toBe("invalid");
    await submit(hook);

    expect(resetArtistPasswordActionMock).not.toHaveBeenCalled();
  });

  it("rejects a too-short password without calling the action", async () => {
    const hook = renderFilled("short", "short");

    await submit(hook);

    expect(preventDefaultMock).toHaveBeenCalled();
    expect(resetArtistPasswordActionMock).not.toHaveBeenCalled();
    expect(hook.result.current.errors?.newPassword).toBe(TOO_SHORT_ERROR);
    expect(hook.result.current.step).toBe("form");
  });

  it("rejects a mismatched confirmation, and editing the password clears that error", async () => {
    const hook = renderFilled(PASSWORD, `${PASSWORD}x`);

    await submit(hook);

    expect(resetArtistPasswordActionMock).not.toHaveBeenCalled();
    expect(hook.result.current.errors?.confirmPassword).toBe(MISMATCH_ERROR);

    act(() => {
      hook.result.current.onFieldChange("newPassword", `${PASSWORD}x`);
    });

    expect(hook.result.current.errors?.confirmPassword).toBeUndefined();
  });

  it("updates the value and drops only that field's stale error on change", async () => {
    const hook = renderFilled("short", "short");
    await submit(hook);
    expect(hook.result.current.errors?.newPassword).toBe(TOO_SHORT_ERROR);

    act(() => {
      hook.result.current.onFieldChange("confirmPassword", "other");
    });
    expect(hook.result.current.confirmPassword).toBe("other");
    expect(hook.result.current.errors?.newPassword).toBe(TOO_SHORT_ERROR);

    act(() => {
      hook.result.current.onFieldChange("newPassword", PASSWORD);
    });
    expect(hook.result.current.newPassword).toBe(PASSWORD);
    expect(hook.result.current.errors?.newPassword).toBeUndefined();
  });

  it("clears the server error when a field changes", async () => {
    resetArtistPasswordActionMock.mockResolvedValue({ success: false, error: "Try again." });
    const hook = renderFilled(PASSWORD, PASSWORD);
    await submit(hook);
    expect(hook.result.current.serverError).toBe("Try again.");

    act(() => {
      hook.result.current.onFieldChange("newPassword", `${PASSWORD}!`);
    });

    expect(hook.result.current.serverError).toBeUndefined();
  });

  it("sends the token and new password only, then replaces to the artist page", async () => {
    resetArtistPasswordActionMock.mockResolvedValue({ success: true, artistId: ARTIST_ID });
    const hook = renderFilled(PASSWORD, PASSWORD);

    await submit(hook);

    expect(resetArtistPasswordActionMock).toHaveBeenCalledWith({
      token: TOKEN,
      newPassword: PASSWORD,
    });
    expect(replaceMock).toHaveBeenCalledWith(`/artist/${ARTIST_ID}`);
  });

  it("stays pending after success and ignores a second submit", async () => {
    resetArtistPasswordActionMock.mockResolvedValue({ success: true, artistId: ARTIST_ID });
    const hook = renderFilled(PASSWORD, PASSWORD);

    await submit(hook);
    expect(hook.result.current.isPending).toBe(true);

    await submit(hook);

    expect(resetArtistPasswordActionMock).toHaveBeenCalledTimes(1);
    expect(replaceMock).toHaveBeenCalledTimes(1);
  });

  it("moves to the invalid step and clears the passwords on a dead link", async () => {
    resetArtistPasswordActionMock.mockResolvedValue({
      success: false,
      error: INVALID_PASSWORD_RESET_LINK_ERROR_MESSAGE,
    });
    const hook = renderFilled(PASSWORD, PASSWORD);

    await submit(hook);

    expect(hook.result.current.step).toBe("invalid");
    expect(hook.result.current.newPassword).toBe("");
    expect(hook.result.current.confirmPassword).toBe("");
    expect(hook.result.current.serverError).toBeUndefined();
    expect(hook.result.current.isPending).toBe(false);
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("keeps the form and values on another failure, and a retry works", async () => {
    resetArtistPasswordActionMock.mockResolvedValueOnce({
      success: false,
      error: RESET_ARTIST_PASSWORD_UNEXPECTED_ERROR_MESSAGE,
    });
    const hook = renderFilled(PASSWORD, PASSWORD);

    await submit(hook);

    expect(hook.result.current.step).toBe("form");
    expect(hook.result.current.serverError).toBe(RESET_ARTIST_PASSWORD_UNEXPECTED_ERROR_MESSAGE);
    expect(hook.result.current.newPassword).toBe(PASSWORD);
    expect(hook.result.current.isPending).toBe(false);

    resetArtistPasswordActionMock.mockResolvedValueOnce({ success: true, artistId: ARTIST_ID });
    await submit(hook);

    expect(resetArtistPasswordActionMock).toHaveBeenCalledTimes(2);
    expect(replaceMock).toHaveBeenCalledWith(`/artist/${ARTIST_ID}`);
  });

  it("shows the unexpected error when the action throws, and does not stick", async () => {
    resetArtistPasswordActionMock.mockRejectedValueOnce(new Error("network down"));
    const hook = renderFilled(PASSWORD, PASSWORD);

    await submit(hook);

    expect(hook.result.current.serverError).toBe(RESET_ARTIST_PASSWORD_UNEXPECTED_ERROR_MESSAGE);
    expect(hook.result.current.isPending).toBe(false);
    expect(hook.result.current.step).toBe("form");

    resetArtistPasswordActionMock.mockResolvedValueOnce({ success: true, artistId: ARTIST_ID });
    await submit(hook);

    expect(replaceMock).toHaveBeenCalledWith(`/artist/${ARTIST_ID}`);
  });

  it("calls the action once for a double submit while pending", async () => {
    const pending = deferred<{ success: true; artistId: string }>();
    resetArtistPasswordActionMock.mockReturnValue(pending.promise);
    const hook = renderFilled(PASSWORD, PASSWORD);

    await act(async () => {
      hook.result.current.onSubmit(submitEvent);
      hook.result.current.onSubmit(submitEvent);
    });
    expect(hook.result.current.isPending).toBe(true);

    await act(async () => {
      pending.resolve({ success: true, artistId: ARTIST_ID });
    });

    expect(resetArtistPasswordActionMock).toHaveBeenCalledTimes(1);
    expect(replaceMock).toHaveBeenCalledTimes(1);
  });
});
