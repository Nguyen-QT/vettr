// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useSwitchActiveRole } from "./useSwitchActiveRole";

const switchActiveRoleActionMock = vi.fn();

vi.mock("@/domains/auth/actions", () => ({
  switchActiveRoleAction: (...args: unknown[]) => switchActiveRoleActionMock(...args),
}));

describe("useSwitchActiveRole", () => {
  beforeEach(() => {
    switchActiveRoleActionMock.mockReset();
  });

  it("calls switchActiveRoleAction with the target role", async () => {
    switchActiveRoleActionMock.mockResolvedValue(undefined);
    const { result } = renderHook(() => useSwitchActiveRole());

    act(() => {
      result.current.onSwitch("CLIENT");
    });

    await waitFor(() => {
    expect(switchActiveRoleActionMock).toHaveBeenCalledWith({ targetRole: "CLIENT" });
  });
  });

  it("is pending while the action is in flight, then settles", async () => {
    let resolveAction: (value: unknown) => void = () => {};
    switchActiveRoleActionMock.mockReturnValue(
      new Promise((resolve) => {
        resolveAction = resolve;
      })
    );
    const { result } = renderHook(() => useSwitchActiveRole());

    act(() => {
      result.current.onSwitch("CLIENT");
    });

    await waitFor(() => {
    expect(result.current.isPending).toBe(true);
    });

    await act(async () => {
      resolveAction(undefined);
    });

    expect(result.current.isPending).toBe(false);
  });

  it("surfaces the error on a failure response", async () => {
    switchActiveRoleActionMock.mockResolvedValue({
      success: false,
      error: "Account is not linked to that role.",
    });
    const { result } = renderHook(() => useSwitchActiveRole());

    act(() => {
      result.current.onSwitch("ARTIST");
    });

    await waitFor(() => {
    expect(result.current.error).toBe("Account is not linked to that role.");
  });
  });

  it("leaves error unset when the action redirects on success (no return value)", async () => {
    switchActiveRoleActionMock.mockResolvedValue(undefined);
    const { result } = renderHook(() => useSwitchActiveRole());

    act(() => {
      result.current.onSwitch("CLIENT");
    });

    await waitFor(() => {
      expect(switchActiveRoleActionMock).toHaveBeenCalled();
    });

    expect(result.current.error).toBeUndefined();
  });
});
