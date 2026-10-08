// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import type { SubmitEvent } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useFindArtist } from "./useFindArtist";

const pushMock = vi.fn();
const preventDefaultMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

const submitEvent = {
  preventDefault: preventDefaultMock,
} as unknown as SubmitEvent<HTMLFormElement>;

function renderWithHandle(handle: string) {
  const hook = renderHook(() => useFindArtist());
  act(() => {
    hook.result.current.onHandleChange(handle);
  });
  return hook;
}

function submit(hook: ReturnType<typeof renderWithHandle>) {
  act(() => {
    hook.result.current.onSubmit(submitEvent);
  });
}

describe("useFindArtist", () => {
  beforeEach(() => {
    pushMock.mockReset();
    preventDefaultMock.mockReset();
  });

  it("starts with an empty handle, no error and not navigating", () => {
    const { result } = renderHook(() => useFindArtist());

    expect(result.current.handle).toBe("");
    expect(result.current.error).toBeUndefined();
    expect(result.current.isNavigating).toBe(false);
  });

  it("keeps the raw input as typed", () => {
    const { result } = renderWithHandle("  @Ink ");

    expect(result.current.handle).toBe("  @Ink ");
  });

  it("prevents the native submit and navigates to /@handle", () => {
    const hook = renderWithHandle("inkmaster");

    submit(hook);

    expect(preventDefaultMock).toHaveBeenCalled();
    expect(pushMock).toHaveBeenCalledTimes(1);
    expect(pushMock).toHaveBeenCalledWith("/@inkmaster");
    expect(hook.result.current.error).toBeUndefined();
  });

  it("normalises the handle before navigating", () => {
    const hook = renderWithHandle("  @Ink.Master ");

    submit(hook);

    expect(pushMock).toHaveBeenCalledWith("/@ink.master");
  });

  it.each([
    ["", "Handle is required."],
    ["   ", "Handle is required."],
    ["@", "Handle is required."],
    ["a".repeat(31), "Handle must be 30 characters or fewer."],
    ["ink master", "Enter a valid handle."],
    ["@@ink", "Enter a valid handle."],
    [".ink", "Enter a valid handle."],
    ["ink_", "Enter a valid handle."],
    ["//evil.com", "Enter a valid handle."],
    ["https://evil.com", "Enter a valid handle."],
    ["admin", "That handle isn't available."],
    ["@Artists", "That handle isn't available."],
    ["ink.rsc", "That handle isn't available."],
  ])("rejects %j with %j and does not navigate", (input, message) => {
    const hook = renderWithHandle(input);

    submit(hook);

    expect(preventDefaultMock).toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
    expect(hook.result.current.error).toBe(message);
    expect(hook.result.current.isNavigating).toBe(false);
  });

  it("keeps the error while typing and clears it on a valid submit", () => {
    const hook = renderWithHandle("admin");
    submit(hook);
    expect(hook.result.current.error).toBeDefined();

    act(() => {
      hook.result.current.onHandleChange("inkmaster");
    });
    expect(hook.result.current.error).toBe("That handle isn't available.");

    submit(hook);

    expect(hook.result.current.error).toBeUndefined();
    expect(pushMock).toHaveBeenCalledWith("/@inkmaster");
  });
});
